import { type ApprovalInput, approvalTypedDataJson, recoverApprover, signApproval } from "../approval";
import { DEMO_PLANT, demoMeterKey } from "../demo";
import { monitoringDocumentDraft } from "../documents/server";
import type { VerificationReport } from "../engine";
import type { RegisteredDesign } from "../methodology/project";
import { HYDRO_CHAIN_ID, hashscan, isLiveHederaChain } from "../network";
import { prepareAnchors } from "../pipeline";
import { type MeterDomain, encodeEnergy, meteredEnergyOf, signMeterStatement } from "../provenance";
import { buildHcsMessage } from "../report";
import type { AttestRequest } from "../schema";
import { plantIdToBytes32 } from "../views";
import { readOperatorConfig, readVerifierKey } from "./config";
import { ApiError, revertReason } from "./errors";
import { publishMessage } from "./hcs";
import { getProject, hydroChain, hydroTransport, requireDeployment } from "./registry";
import { type Address, type Hex, createWalletClient, isAddressEqual, parseEventLogs, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

type Anchors = { hcsMessage: string; reportHash: string; dataHash: string; dataChunks: number };

type HcsLinks = {
  topicId: string;
  sequenceNumber: number;
  dataSequenceNumber: number;
  transactionId: string | null;
  url: string;
  dataUrl: string;
} | null;

/** The anchor the VVB signs over; send it back unchanged with `verifierSignature` in step 2. */
export type AttestAnchor = { reportHash: Hex; hcsTopicNum: string; hcsSequence: string; dataSequence: number };

export type AttestOutcome =
  | ({ status: "not-eligible"; report: VerificationReport } & Anchors)
  | ({
      status: "awaiting-approval";
      report: VerificationReport;
      hcs: HcsLinks;
      anchor: AttestAnchor;
      /** EIP-712 `VerifierApproval` for `eth_signTypedData_v4` or `yarn mrv:approve`. */
      approval: ReturnType<typeof approvalTypedDataJson>;
      nextStep: string;
    } & Anchors)
  | ({
      status: "attested";
      report: VerificationReport;
      attestationId: number;
      unitsMinted: number;
      /** The VVB whose approval the registry accepted. `demo` is true only for the labelled demo VVB key. */
      verifier: { address: Address; demo: boolean };
      /** Report and raw-readings messages on HCS; null on a local chain without HCS. */
      hcs: HcsLinks;
      /** `url` is a Hashscan link on Hedera networks and `null` on a local chain. */
      transaction: { hash: string; url: string | null };
      /** Unsigned monitoring report for the caller to sign. Not a second mint. */
      monitoringDocument: ReturnType<typeof monitoringDocumentDraft>;
    } & Anchors);

/** Gas for `submitAttestation`: module call, two `ecrecover`s, attestation storage and the HTS mint. */
export const ATTEST_GAS = 1_500_000n;

function designMismatches(profile: RegisteredDesign, onChain: RegisteredDesign): string[] {
  return (Object.keys(onChain) as (keyof RegisteredDesign)[])
    .filter(key => profile[key] !== undefined && onChain[key] !== undefined && profile[key] !== onChain[key])
    .map(key => `${key}: profile ${profile[key]}, on-chain ${onChain[key]}`);
}

const hex32 = (value: string): Hex => `0x${value.trim().replace(/^0x/, "")}`;

/**
 * Server-held meter keys for the demo plants, as a JSON map `{ "<plantId>": "<hex key>" }` in METER_PRIVATE_KEYS.
 * These are software keys standing in for data-logger hardware; a real deployment signs on the logger.
 */
export function readMeterKey(plantId: string, chainId: number = HYDRO_CHAIN_ID): Hex | null {
  const raw = process.env.METER_PRIVATE_KEYS;
  if (!raw) return null;
  let keys: Record<string, string>;
  try {
    keys = JSON.parse(raw);
  } catch {
    throw new ApiError("METER_PRIVATE_KEYS must be a JSON object of plantId → hex key", 503);
  }
  const key = keys[plantId];
  if (!key) return null;
  const hex = hex32(key);
  // The demo derivation is public (anyone can compute it), so it may only sign on a local chain.
  if (isLiveHederaChain(chainId) && hex.toLowerCase() === demoMeterKey(plantId).toLowerCase()) {
    throw new ApiError(
      `METER_PRIVATE_KEYS holds the public demo meter key for ${plantId}; generate a real one with \`yarn hardhat:meter-keys\``,
      503,
    );
  }
  return hex;
}

/**
 * The labelled demo VVB key (`dmrv-demo-vvb-testnet`). Honoured only when DEMO_REGISTRY_ADDRESS names this exact
 * registry, so a production deployment can never mint with it by accident.
 */
export function readDemoVvbKey(registry: Address): Hex | null {
  const key = process.env.DEMO_VVB_PRIVATE_KEY;
  const demoRegistry = process.env.DEMO_REGISTRY_ADDRESS;
  if (!key || !demoRegistry) return null;
  try {
    if (!isAddressEqual(demoRegistry as Address, registry)) return null;
  } catch {
    return null;
  }
  return hex32(key);
}

/**
 * DmrvRegistry attestation, two signatures:
 * 1. The meter signs an EIP-712 `MeterStatement` (raw totals, period, interval count, readings digest, sequence).
 * 2. A VVB holding VERIFIER_ROLE signs a `VerifierApproval` embedding that statement's digest plus the accepted
 *    figures, report hash, HCS anchor and any evidence hash. The module rejects accepted figures that are less
 *    conservative than the metered ones.
 *
 * Without a VVB signature this refuses with 409 before anything reaches HCS (unless `publishForApproval` asks for
 * step 1, or this is a labelled demo registry). The server key only relays; it needs no role and cannot mint.
 */
export async function attestReadings(request: AttestRequest): Promise<AttestOutcome> {
  const { address, abi, errorAbi, client } = requireDeployment();
  const profile = request.plant ?? DEMO_PLANT;
  const plantId = plantIdToBytes32(profile.plantId);
  const registered = await getProject(plantId);
  if (!registered) throw new ApiError(`Plant ${profile.plantId} is not registered on-chain`, 409);
  const mismatches = designMismatches(profile.design, registered.design);
  if (mismatches.length) {
    throw new ApiError(`Plant profile differs from the registered design: ${mismatches.join("; ")}`, 409);
  }

  const registeredMeter = registered.meter;
  const device = request.metering?.deviceAddress;
  if (registeredMeter && device && !isAddressEqual(registeredMeter, device)) {
    throw new ApiError(
      `The metering record names meter ${device}, but the plant's registered meter is ${registeredMeter}`,
      409,
    );
  }

  const demoVvbKey = readDemoVvbKey(address);
  const step2 = Boolean(request.anchor && request.verifierSignature);
  if (!step2 && !request.publishForApproval && !demoVvbKey) {
    throw new ApiError(
      "Needs VVB approval: this registry mints only with a VerifierApproval signed by an accredited VVB. Call again with `publishForApproval: true` to publish to HCS and receive the typed data, then send `anchor` + `verifierSignature`. Nothing was published.",
      409,
    );
  }
  if (request.verifierSignature && !request.anchor) {
    throw new ApiError("`verifierSignature` needs the `anchor` it was signed over (from step 1)", 400);
  }

  // The meter statement is bound to this registry, chain and the project's next sequence.
  const domain: MeterDomain = { chainId: HYDRO_CHAIN_ID, registry: address, sequence: registered.ledger.attestations };
  let signature = request.signature;
  if (!signature) {
    const meterKey = readMeterKey(profile.plantId);
    if (meterKey) signature = signMeterStatement(meterKey, domain, profile.plantId, request.readings);
  }
  const { report, data, preview } = prepareAnchors({
    ...request,
    signature,
    plant: profile,
    ledger: registered.ledger,
    domain,
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
  if (report.provenance.status !== "signed" || !signature) {
    throw new ApiError(
      `The registry only accepts batches whose EIP-712 statement is signed by the plant's meter ${registeredMeter} for registry ${address}, chain ${HYDRO_CHAIN_ID}, sequence ${domain.sequence}`,
      409,
    );
  }

  const operator = readOperatorConfig();
  if (isLiveHederaChain() && !operator) {
    throw new ApiError("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required to anchor reports on HCS", 503);
  }
  if (isLiveHederaChain() && !operator?.topicId) {
    throw new ApiError("HCS_TOPIC_ID is required. The registry will not mint until that topic is set on it.", 503);
  }
  const relayerKey = readVerifierKey(operator);
  if (!relayerKey && !request.publishForApproval) {
    throw new ApiError("No relayer key: set HEDERA_OPERATOR_KEY (ECDSA) or VERIFIER_PRIVATE_KEY", 503);
  }
  const topicNum = operator?.topicId
    ? BigInt(operator.topicId.replace(/^0\.0\./, ""))
    : BigInt(await client.readContract({ address, abi, functionName: "auditTopic" }));

  const statement = report.meterStatement;
  const verifiedFigures = {
    netWh: report.monitored.netWh,
    grossWh: report.monitored.grossWh,
    fuelG: report.monitored.fuelG,
    leakageG: report.monitored.leakageG,
  };
  const measurement = {
    periodStart: BigInt(report.periodStart),
    periodEnd: BigInt(report.periodEnd),
    metered: meteredEnergyOf(statement),
    verified: encodeEnergy(verifiedFigures),
  };
  const evidenceHash = (request.evidenceHash as Hex | undefined) ?? zeroHash;
  const approvalInput = (reportHash: Hex, hcsTopicNum: bigint, hcsSequence: bigint): ApprovalInput => ({
    domain,
    plantId: profile.plantId,
    statement,
    verified: verifiedFigures,
    reportHash,
    hcsTopicNum,
    hcsSequence,
    evidenceHash,
  });
  const submission = (reportHash: Hex, hcsTopicNum: bigint, hcsSequence: bigint, verifierSignature: Hex) => ({
    projectId: plantId,
    sequence: registered.ledger.attestations,
    intervals: statement.intervals,
    intervalSeconds: statement.intervalSeconds,
    readingsDigest: statement.readingsDigest,
    reportHash,
    hcsTopicNum,
    hcsSequence,
    evidenceHash,
    measurement,
    meterSignature: signature as Hex,
    verifierSignature,
  });

  if (
    evidenceHash !== zeroHash &&
    (await client.readContract({ address, abi, functionName: "evidenceUsed", args: [evidenceHash] }))
  ) {
    throw new ApiError(`Evidence ${evidenceHash} was already used by an earlier attestation`, 409);
  }

  // The module must compute exactly the credits the report states, before anything is published.
  const [previewed, previewUnits] = await client.readContract({
    address,
    abi,
    functionName: "preview",
    args: [plantId, measurement],
  });
  if (previewed.reductionG !== BigInt(report.emissions.reductionG)) {
    throw new ApiError(
      `Engine and contract disagree (ER ${report.emissions.reductionG} g vs ${previewed.reductionG} g); nothing was published`,
      500,
    );
  }

  // Dry-run with a throwaway approver: every check before the VVB check (period, crediting window, calibration,
  // sequence, anchor, completeness, meter signature) must pass, so the only revert allowed is UnregisteredVerifier.
  // `pending`: a local node's latest block can predate the period end; Hedera treats it as `latest`.
  const simulate = async (s: ReturnType<typeof submission>) =>
    client.simulateContract({
      account: relayerKey ? privateKeyToAccount(relayerKey) : undefined,
      address,
      abi: errorAbi as typeof abi,
      functionName: "submitAttestation",
      args: [s],
      blockTag: "pending",
    });

  if (!step2) {
    const plannedSequence = topicNum === 0n ? 0n : 1n;
    const probeKey = demoVvbKey ?? generatePrivateKey();
    const probe = signApproval(probeKey, approvalInput(preview.reportHash as Hex, topicNum, plannedSequence));
    try {
      await simulate(submission(preview.reportHash as Hex, topicNum, plannedSequence, probe));
    } catch (error) {
      const reason = revertReason(error);
      if (demoVvbKey || !reason.includes("UnregisteredVerifier")) {
        throw new ApiError(`The registry would reject this attestation: ${reason}. Nothing was published.`, 409);
      }
    }
  }

  // Step 1 (or the demo one-shot): data first, because the report carries the data message's consensus sequence.
  let final: { message: string; reportHash: string };
  let hcs: HcsLinks = null;
  let anchor: AttestAnchor;
  if (step2) {
    anchor = request.anchor as AttestAnchor;
    final = buildHcsMessage(report, { hash: data.dataHash, sequence: anchor.dataSequence });
    if (final.reportHash !== anchor.reportHash) {
      throw new ApiError(
        `These readings do not reproduce the step-1 report (${anchor.reportHash}); got ${final.reportHash}`,
        409,
      );
    }
    if (BigInt(anchor.hcsTopicNum) !== topicNum) {
      throw new ApiError(`Anchor topic ${anchor.hcsTopicNum} is not the registry's audit topic ${topicNum}`, 409);
    }
    if (operator?.topicId) {
      hcs = {
        topicId: operator.topicId,
        sequenceNumber: Number(anchor.hcsSequence),
        dataSequenceNumber: anchor.dataSequence,
        transactionId: null,
        url: hashscan.topicMessage(operator.topicId, anchor.hcsSequence),
        dataUrl: hashscan.topicMessage(operator.topicId, String(anchor.dataSequence)),
      };
    }
  } else {
    const dataReceipt = operator ? await publishMessage(operator, data.message) : null;
    final = dataReceipt
      ? buildHcsMessage(report, { hash: data.dataHash, sequence: Number(dataReceipt.sequenceNumber) })
      : preview;
    const reportReceipt = operator ? await publishMessage(operator, final.message) : null;
    anchor = {
      reportHash: final.reportHash as Hex,
      hcsTopicNum: (reportReceipt?.topicNum ?? topicNum).toString(),
      hcsSequence: (reportReceipt?.sequenceNumber ?? (topicNum === 0n ? 0n : 1n)).toString(),
      dataSequence: dataReceipt ? Number(dataReceipt.sequenceNumber) : 1,
    };
    if (reportReceipt && dataReceipt) {
      hcs = {
        topicId: reportReceipt.topicId,
        sequenceNumber: Number(reportReceipt.sequenceNumber),
        dataSequenceNumber: Number(dataReceipt.sequenceNumber),
        transactionId: reportReceipt.transactionId,
        url: hashscan.topicMessage(reportReceipt.topicId, reportReceipt.sequenceNumber.toString()),
        dataUrl: hashscan.topicMessage(reportReceipt.topicId, dataReceipt.sequenceNumber.toString()),
      };
    }
  }

  const approval = approvalInput(anchor.reportHash, BigInt(anchor.hcsTopicNum), BigInt(anchor.hcsSequence));
  if (!step2 && !demoVvbKey) {
    return {
      status: "awaiting-approval",
      report,
      ...anchors(final.message, final.reportHash),
      hcs,
      anchor,
      approval: approvalTypedDataJson(approval),
      nextStep:
        "Have the VVB sign `approval` (eth_signTypedData_v4 or `yarn mrv:approve`), then POST the same body with `anchor` and `verifierSignature`.",
    };
  }

  const verifierSignature = step2 ? (request.verifierSignature as Hex) : signApproval(demoVvbKey as Hex, approval);
  const approver = recoverApprover(approval, verifierSignature);
  const verifierRole = await client.readContract({ address, abi, functionName: "VERIFIER_ROLE" });
  if (
    !approver ||
    !(await client.readContract({ address, abi, functionName: "hasRole", args: [verifierRole, approver] }))
  ) {
    throw new ApiError(
      `The VVB signature recovers to ${approver ?? "nothing"}, which is not a registered verifier for these exact figures, report and anchor`,
      409,
    );
  }
  if (!relayerKey) throw new ApiError("No relayer key: set HEDERA_OPERATOR_KEY (ECDSA) or VERIFIER_PRIVATE_KEY", 503);

  const args = submission(anchor.reportHash, BigInt(anchor.hcsTopicNum), BigInt(anchor.hcsSequence), verifierSignature);
  try {
    await simulate(args);
  } catch (error) {
    throw new ApiError(`The registry would reject this attestation: ${revertReason(error)}`, 409);
  }

  // Hashio rejects the EIP-1559 fees viem derives from fee history when they fall under its minimum gas price, so
  // send a legacy transaction at the relay's own eth_gasPrice.
  const gasPrice = await client.getGasPrice();
  const account = privateKeyToAccount(relayerKey);
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: hydroTransport() });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "submitAttestation",
    args: [args],
    // HTS system-contract calls are under-estimated by eth_estimateGas on some relays.
    gas: ATTEST_GAS,
    gasPrice,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ApiError(`Attestation transaction ${hash} reverted`, 502);

  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "AttestationSubmitted" });
  const unitsMinted = Number(event.args.unitsMinted);
  if (BigInt(unitsMinted) !== previewUnits) {
    console.warn(`attest: minted ${unitsMinted} units, preview said ${previewUnits}`);
  }
  return {
    status: "attested",
    report,
    ...anchors(final.message, final.reportHash),
    attestationId: Number(event.args.attestationId),
    unitsMinted,
    verifier: { address: approver, demo: !step2 },
    hcs,
    transaction: { hash, url: isLiveHederaChain() ? hashscan.transaction(hash) : null },
    monitoringDocument: monitoringDocumentDraft(
      profile.plantId,
      `Minted ${unitsMinted} kg. Report hash ${final.reportHash}. VVB ${approver}${step2 ? "" : " (labelled demo VVB key)"}.`,
      null,
      account.address as Hex,
    ),
  };
}

/**
 * Read-only: the exact `VerifierApproval` a VVB would sign for these readings and the step-1 `anchor`, re-derived
 * from the project's on-chain ledger. Holds no key and writes nothing; the VVB signs on its own machine.
 */
export async function prepareApproval(request: AttestRequest) {
  if (!request.anchor) throw new ApiError("Pass the `anchor` returned by step 1 (publishForApproval)", 400);
  const { address } = requireDeployment();
  const profile = request.plant ?? DEMO_PLANT;
  const registered = await getProject(plantIdToBytes32(profile.plantId));
  if (!registered) throw new ApiError(`Plant ${profile.plantId} is not registered on-chain`, 409);
  const domain: MeterDomain = { chainId: HYDRO_CHAIN_ID, registry: address, sequence: registered.ledger.attestations };
  const { report, data } = prepareAnchors({ ...request, plant: profile, ledger: registered.ledger, domain });
  if (report.decision !== "APPROVED" || !report.emissions) {
    throw new ApiError(`The batch is ${report.decision}; there is nothing to approve`, 409);
  }
  const anchor = request.anchor as AttestAnchor;
  const final = buildHcsMessage(report, { hash: data.dataHash, sequence: anchor.dataSequence });
  if (final.reportHash !== anchor.reportHash) {
    throw new ApiError(`These readings do not reproduce the step-1 report (${anchor.reportHash})`, 409);
  }
  const input: ApprovalInput = {
    domain,
    plantId: profile.plantId,
    statement: report.meterStatement,
    verified: {
      netWh: report.monitored.netWh,
      grossWh: report.monitored.grossWh,
      fuelG: report.monitored.fuelG,
      leakageG: report.monitored.leakageG,
    },
    reportHash: anchor.reportHash,
    hcsTopicNum: BigInt(anchor.hcsTopicNum),
    hcsSequence: BigInt(anchor.hcsSequence),
    evidenceHash: (request.evidenceHash as Hex | undefined) ?? zeroHash,
  };
  return {
    approval: approvalTypedDataJson(input),
    summary: `${profile.plantId} #${domain.sequence}: net ${report.monitored.netWh} Wh, ER ${report.emissions.reductionG} g, ${report.emissions.unitsMinted} kg credits`,
    report,
    signWith:
      "eth_signTypedData_v4, or `yarn mrv:approve` with the VVB's secp256k1 key (ED25519 keys cannot sign this)",
  };
}
