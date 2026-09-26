import { DEMO_PLANT } from "../demo";
import { monitoringDocumentDraft } from "../documents/server";
import type { VerificationReport } from "../engine";
import type { RegisteredDesign } from "../methodology/project";
import { HYDRO_CHAIN_ID, hashscan, isLiveHederaChain } from "../network";
import { prepareAnchors } from "../pipeline";
import { buildHcsMessage } from "../report";
import type { VerifyRequest } from "../schema";
import { plantIdToBytes32 } from "../views";
import { readOperatorConfig, readVerifierKey } from "./config";
import { ApiError, revertReason } from "./errors";
import { publishMessage } from "./hcs";
import { getPlant, hydroChain, hydroTransport, requireDeployment } from "./registry";
import { createWalletClient, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Anchors = { hcsMessage: string; reportHash: string; dataHash: string; dataChunks: number };

export type AttestOutcome =
  | ({ status: "not-eligible"; report: VerificationReport } & Anchors)
  | ({
      status: "attested";
      report: VerificationReport;
      attestationId: number;
      unitsMinted: number;
      /** Report and raw-readings messages on HCS; null on a local chain without HCS. */
      hcs: {
        topicId: string;
        sequenceNumber: number;
        dataSequenceNumber: number;
        transactionId: string;
        url: string;
        dataUrl: string;
      } | null;
      /** `url` is a Hashscan link on Hedera networks and `null` on a local chain. */
      transaction: { hash: string; url: string | null };
      /** Unsigned monitoring report for the caller to sign. Not a second mint. */
      monitoringDocument: ReturnType<typeof monitoringDocumentDraft>;
    } & Anchors);

function designMismatches(profile: RegisteredDesign, onChain: RegisteredDesign): string[] {
  return (Object.keys(onChain) as (keyof RegisteredDesign)[])
    .filter(key => profile[key] !== onChain[key])
    .map(key => `${key}: profile ${profile[key]}, on-chain ${onChain[key]}`);
}

/**
 * Verify → publish raw readings to HCS → publish the report (pointing at them) → attest on-chain. The period is
 * quantified against the plant's registered design and current on-chain ledger, and the contract's own `quantify`
 * must agree with the engine before anything is written. Only APPROVED batches are published; everything else is
 * returned with its report so an operator or agent can see why.
 */
export async function attestReadings(request: VerifyRequest): Promise<AttestOutcome> {
  const { address, abi, client } = requireDeployment();
  const profile = request.plant ?? DEMO_PLANT;
  const plantId = plantIdToBytes32(profile.plantId);
  const registered = await getPlant(plantId);
  if (!registered) throw new ApiError(`Plant ${profile.plantId} is not registered on-chain`, 409);
  const mismatches = designMismatches(profile.design, registered.design);
  if (mismatches.length) {
    throw new ApiError(`Plant profile differs from the registered design: ${mismatches.join("; ")}`, 409);
  }

  const registeredMeter = registered.meter;
  const device = request.metering?.deviceAddress;
  if (registeredMeter && device && registeredMeter.toLowerCase() !== device.toLowerCase()) {
    throw new ApiError(
      `The metering record names meter ${device}, but the plant's registered meter is ${registeredMeter}`,
      409,
    );
  }

  // The meter statement must be signed for this registry, which is also what the contract checks.
  const { report, data, preview } = prepareAnchors({
    ...request,
    plant: profile,
    ledger: registered.ledger,
    domain: { chainId: HYDRO_CHAIN_ID, registry: address },
  });
  const anchors = (message: string, reportHash: string): Anchors => ({
    hcsMessage: message,
    reportHash,
    dataHash: data.dataHash,
    dataChunks: data.chunks,
  });
  if (report.decision !== "APPROVED" || !report.emissions) {
    return { status: "not-eligible", report, ...anchors(preview.message, preview.reportHash) };
  }

  const signature = request.signature;
  if (registeredMeter && (report.provenance.status !== "signed" || !signature)) {
    throw new ApiError(
      `The registry only accepts batches whose statement is signed by the plant's meter ${registeredMeter} for registry ${address} on chain ${HYDRO_CHAIN_ID}`,
      409,
    );
  }

  const operator = readOperatorConfig();
  const verifierKey = readVerifierKey(operator);
  if (!verifierKey) throw new ApiError("No verifier key: set HEDERA_OPERATOR_KEY (ECDSA) or VERIFIER_PRIVATE_KEY", 503);
  if (!operator && isLiveHederaChain()) {
    throw new ApiError("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required to anchor reports on HCS", 503);
  }

  if (isLiveHederaChain() && !operator?.topicId) {
    throw new ApiError("HCS_TOPIC_ID is required. The registry will not mint until that topic is set on it.", 503);
  }
  // The sequence is assigned by consensus after publish. The dry-run only needs a non-zero sequence on the
  // configured topic; the transaction below sends the real one.
  const plannedTopic = operator?.topicId ? BigInt(operator.topicId.replace(/^0\.0\./, "")) : 0n;

  const account = privateKeyToAccount(verifierKey);
  const input = {
    plantId,
    plantSequence: registered.ledger.attestations,
    periodStart: BigInt(report.periodStart),
    periodEnd: BigInt(report.periodEnd),
    netEnergyWh: BigInt(report.monitored.netWh),
    grossEnergyWh: BigInt(report.monitored.grossWh),
    fuelG: BigInt(report.monitored.fuelG),
    leakageG: BigInt(report.monitored.leakageG),
    completenessBps: report.completenessBps,
    reportHash: preview.reportHash,
    hcsTopicNum: plannedTopic,
    hcsSequence: plannedTopic === 0n ? 0n : 1n,
    // What the meter signed; the contract accepts the figures above only if they are at least this conservative.
    meter: {
      grossEnergyWh: BigInt(report.meterStatement.grossWh),
      netEnergyWh: BigInt(report.meterStatement.netWh),
      fuelG: BigInt(report.meterStatement.fuelG),
      readingsDigest: report.meterStatement.readingsDigest,
      signature: signature ?? "0x",
    },
  };

  // Dry-run first so role, period, capacity and completeness errors surface before anything reaches HCS, and
  // make sure the contract computes exactly the credits the report will state.
  try {
    // `pending`: a local node's latest block can predate the period end; Hedera treats it as `latest`.
    await client.simulateContract({
      account,
      address,
      abi,
      functionName: "submitAttestation",
      args: [input],
      blockTag: "pending",
    });
  } catch (error) {
    throw new ApiError(`The registry would reject this attestation: ${revertReason(error)}`, 409);
  }
  const onChain = await client.readContract({ address, abi, functionName: "quantify", args: [plantId, input] });
  if (
    onChain.reductionG !== BigInt(report.emissions.reductionG) ||
    onChain.units !== BigInt(report.emissions.unitsMinted)
  ) {
    throw new ApiError(
      `Engine and contract disagree (ER ${report.emissions.reductionG} g vs ${onChain.reductionG} g); nothing was published`,
      500,
    );
  }

  // Hashio rejects the EIP-1559 fees viem derives from fee history when they fall under its minimum gas price, so
  // send a legacy transaction at the relay's own eth_gasPrice. Fetched before HCS so a dead relay publishes nothing.
  const gasPrice = await client.getGasPrice();

  // Data first: the report must carry the data message's sequence number, which only consensus assigns.
  const dataReceipt = operator ? await publishMessage(operator, data.message) : null;
  const final = dataReceipt
    ? buildHcsMessage(report, { hash: data.dataHash, sequence: Number(dataReceipt.sequenceNumber) })
    : preview;
  const hcs = operator ? await publishMessage(operator, final.message) : null;
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: hydroTransport() });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "submitAttestation",
    args: [
      {
        ...input,
        reportHash: final.reportHash,
        hcsTopicNum: hcs?.topicNum ?? 0n,
        hcsSequence: hcs?.sequenceNumber ?? 0n,
      },
    ],
    // HTS system-contract calls are under-estimated by eth_estimateGas on some relays.
    gas: 1_000_000n,
    gasPrice,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ApiError(`Attestation transaction ${hash} reverted`, 502);

  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "AttestationSubmitted" });
  return {
    status: "attested",
    report,
    ...anchors(final.message, final.reportHash),
    attestationId: Number(event.args.attestationId),
    unitsMinted: Number(event.args.unitsMinted),
    hcs:
      hcs && dataReceipt
        ? {
            topicId: hcs.topicId,
            sequenceNumber: Number(hcs.sequenceNumber),
            dataSequenceNumber: Number(dataReceipt.sequenceNumber),
            transactionId: hcs.transactionId,
            url: hashscan.topicMessage(hcs.topicId, hcs.sequenceNumber.toString()),
            dataUrl: hashscan.topicMessage(hcs.topicId, dataReceipt.sequenceNumber.toString()),
          }
        : null,
    transaction: { hash, url: isLiveHederaChain() ? hashscan.transaction(hash) : null },
    monitoringDocument: monitoringDocumentDraft(
      profile.plantId,
      `Minted ${Number(event.args.unitsMinted)} kg. Report hash ${final.reportHash}.`,
      null,
      account.address as `0x${string}`,
    ),
  };
}
