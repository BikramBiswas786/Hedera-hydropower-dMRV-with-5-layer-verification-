import type { VerificationReport } from "../engine";
import { hashscan, isLiveHederaChain } from "../network";
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
    } & Anchors);

/**
 * Verify → publish raw readings to HCS → publish the report (pointing at them) → attest on-chain. Only APPROVED
 * batches are published; everything else is returned with its report so an operator or agent can see why.
 */
export async function attestReadings(request: VerifyRequest): Promise<AttestOutcome> {
  const { plant, report, data, preview } = prepareAnchors(request);
  const anchors = (message: string, reportHash: string): Anchors => ({
    hcsMessage: message,
    reportHash,
    dataHash: data.dataHash,
    dataChunks: data.chunks,
  });
  if (report.decision !== "APPROVED") {
    return { status: "not-eligible", report, ...anchors(preview.message, preview.reportHash) };
  }

  const { address, abi, client } = requireDeployment();
  const plantId = plantIdToBytes32(plant.plantId);
  const registered = await getPlant(plantId);
  if (!registered) throw new ApiError(`Plant ${plant.plantId} is not registered on-chain`, 409);
  if (registered.capacityKw !== plant.capacityKw) {
    throw new ApiError(
      `Plant profile capacity ${plant.capacityKw} kW differs from the on-chain registration (${registered.capacityKw} kW)`,
      409,
    );
  }

  const operator = readOperatorConfig();
  const verifierKey = readVerifierKey(operator);
  if (!verifierKey) throw new ApiError("No verifier key: set HEDERA_OPERATOR_KEY (ECDSA) or VERIFIER_PRIVATE_KEY", 503);
  if (!operator && isLiveHederaChain()) {
    throw new ApiError("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required to anchor reports on HCS", 503);
  }

  const account = privateKeyToAccount(verifierKey);
  const input = {
    plantId,
    periodStart: BigInt(report.periodStart),
    periodEnd: BigInt(report.periodEnd),
    energyWh: BigInt(report.energyWh),
    trustScoreBps: report.trustScoreBps,
    reportHash: preview.reportHash,
    hcsTopicNum: 0n,
    hcsSequence: 0n,
  };

  // Dry-run first so role, period, capacity and trust errors surface before anything is written to HCS.
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
    gas: 800_000n,
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
  };
}
