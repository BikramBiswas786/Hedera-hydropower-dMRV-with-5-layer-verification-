import { DEMO_PLANT, demoMeterKey } from "../demo";
import type { VerificationReport } from "../engine";
import type { RegisteredDesign } from "../methodology/project";
import { HYDRO_CHAIN_ID, getModuleDeployment, hashscan, isLiveHederaChain } from "../network";
import { prepareAnchors } from "../pipeline";
import { type MeterDomain, encodeEnergy, meteredEnergyOf, signMeterStatement } from "../provenance";
import { buildHcsMessage } from "../report";
import type { RecordRequest } from "../schema";
import { type PlantView, plantIdToBytes32 } from "../views";
import { readOperatorConfig, readRelayerKey } from "./config";
import { ApiError, revertReason } from "./errors";
import { publishMessage } from "./hcs";
import { getProject, hydroChain, hydroTransport, requireDeployment } from "./registry";
import { type Address, type Hex, createWalletClient, isAddressEqual, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Anchors = { hcsMessage: string; reportHash: string; dataHash: string; dataChunks: number };

export type HcsLinks = {
  topicId: string;
  sequenceNumber: number;
  dataSequenceNumber: number;
  transactionId: string | null;
  url: string;
  dataUrl: string;
} | null;

export type RecordOutcome =
  | ({ status: "not-eligible"; report: VerificationReport } & Anchors)
  | ({
      status: "recorded";
      report: VerificationReport;
      attestationId: number;
      /** The record's number within the project; a verification covers a contiguous run of these. */
      sequence: number;
      reductionG: number;
      /** Head of the project's record hash chain after this record. */
      chainHash: Hex;
      hcs: HcsLinks;
      transaction: { hash: string; url: string | null };
      nextStep: string;
    } & Anchors);

/** Gas for `recordMonitoring`: the module call, one `ecrecover` and the record's storage. */
export const RECORD_GAS = 1_200_000n;

function designMismatches(profile: RegisteredDesign, onChain: RegisteredDesign): string[] {
  return (Object.keys(onChain) as (keyof RegisteredDesign)[])
    .filter(key => profile[key] !== onChain[key])
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

/** The server relays `recordMonitoring`, so its key must be the project's operator or the reporter it named. */
function requireRecorder(project: PlantView, relayer: Address) {
  if (isAddressEqual(relayer, project.operator)) return;
  if (project.reporter && isAddressEqual(relayer, project.reporter)) return;
  throw new ApiError(
    `The server key ${relayer} is neither the operator (${project.operator}) nor its reporter (${project.reporter ?? "none"}) of ${project.plantId}. The operator names it with setReporter.`,
    503,
  );
}

/**
 * Monitoring, VCS step 3: verify one period, publish its readings and monitoring report to HCS, and record it on
 * `DmrvRegistry`. The meter's EIP-712 statement fixes the raw totals; the module quantifies ER from the registered
 * design; the record joins the project's hash chain. Nothing is issued: a VVB verifies a run of records later
 * (`verification.ts`), and only an approving verification issues credits.
 *
 * Before publishing, the project module's `quantify` must agree with the engine, and a dry run of
 * `recordMonitoring` must pass every contract check (period, crediting window, calibration, sequence, completeness,
 * meter signature), so nothing reaches HCS that the registry would refuse.
 */
export async function recordReadings(request: RecordRequest): Promise<RecordOutcome> {
  const { address, abi, errorAbi, client } = requireDeployment();
  const profile = request.plant ?? DEMO_PLANT;
  const projectId = plantIdToBytes32(profile.plantId);
  const project = await getProject(projectId);
  if (!project) throw new ApiError(`Plant ${profile.plantId} is not registered on-chain`, 409);
  const mismatches = designMismatches(profile.design, project.design);
  if (mismatches.length) {
    throw new ApiError(`Plant profile differs from the registered design: ${mismatches.join("; ")}`, 409);
  }
  const device = request.metering?.deviceAddress;
  if (device && !isAddressEqual(project.meter, device)) {
    throw new ApiError(
      `The metering record names meter ${device}, but the plant's registered meter is ${project.meter}`,
      409,
    );
  }

  // The meter statement is bound to this registry, chain and the project's next record number.
  const sequence = project.ledger.attestations;
  const domain: MeterDomain = { chainId: HYDRO_CHAIN_ID, registry: address, sequence };
  let signature = request.signature;
  if (!signature) {
    const meterKey = readMeterKey(profile.plantId);
    if (meterKey) signature = signMeterStatement(meterKey, domain, profile.plantId, request.readings);
  }
  const { report, data, preview } = prepareAnchors({
    ...request,
    signature,
    plant: profile,
    ledger: project.ledger,
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
      `The registry only records periods whose EIP-712 statement is signed by the plant's meter ${project.meter} for registry ${address}, chain ${HYDRO_CHAIN_ID}, record ${sequence}`,
      409,
    );
  }

  const operator = readOperatorConfig();
  if (isLiveHederaChain() && !operator?.topicId) {
    throw new ApiError("HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY and HCS_TOPIC_ID are required to publish on HCS", 503);
  }
  const relayerKey = readRelayerKey(operator);
  if (!relayerKey) throw new ApiError("No relayer key: set HEDERA_OPERATOR_KEY (ECDSA) or RELAYER_PRIVATE_KEY", 503);
  const account = privateKeyToAccount(relayerKey);
  requireRecorder(project, account.address);

  const topicNum = await client.readContract({ address, abi, functionName: "auditTopic" });
  if (operator?.topicId && BigInt(operator.topicId.replace(/^0\.0\./, "")) !== topicNum) {
    throw new ApiError(`HCS_TOPIC_ID ${operator.topicId} is not the registry's audit topic 0.0.${topicNum}`, 503);
  }

  const statement = report.meterStatement;
  const measurement = {
    periodStart: BigInt(report.periodStart),
    periodEnd: BigInt(report.periodEnd),
    metered: meteredEnergyOf(statement),
    verified: encodeEnergy({
      netWh: report.monitored.netWh,
      grossWh: report.monitored.grossWh,
      fuelG: report.monitored.fuelG,
      leakageG: report.monitored.leakageG,
    }),
  };

  // The project's own module must compute exactly the ER the engine states, before anything is published.
  const moduleDeployment = getModuleDeployment();
  if (!moduleDeployment || !isAddressEqual(moduleDeployment.address, project.module)) {
    throw new ApiError(`${profile.plantId} uses module ${project.module}, which this app has no ABI for`, 409);
  }
  const quantified = await client.readContract({
    address: project.module,
    abi: moduleDeployment.abi,
    functionName: "quantify",
    args: [project.params, project.state, measurement],
  });
  if (quantified.reductionG !== BigInt(report.emissions.reductionG)) {
    throw new ApiError(
      `Engine and module disagree (ER ${report.emissions.reductionG} g vs ${quantified.reductionG} g); nothing was published`,
      500,
    );
  }

  const submission = (reportHash: Hex, hcsSequence: bigint) => ({
    projectId,
    sequence,
    intervals: statement.intervals,
    intervalSeconds: statement.intervalSeconds,
    readingsDigest: statement.readingsDigest,
    reportHash,
    hcsTopicNum: topicNum,
    hcsSequence,
    measurement,
    meterSignature: signature as Hex,
  });
  // `pending`: a local node's latest block can predate the period end; Hedera treats it as `latest`.
  const simulate = (s: ReturnType<typeof submission>) =>
    client.simulateContract({
      account,
      address,
      abi: errorAbi as typeof abi,
      functionName: "recordMonitoring",
      args: [s],
      blockTag: "pending",
    });
  try {
    // The anchor is not in the meter's signature, so a placeholder sequence proves every other check passes.
    await simulate(submission(preview.reportHash as Hex, 1n));
  } catch (error) {
    throw new ApiError(`The registry would reject this record: ${revertReason(error)}. Nothing was published.`, 409);
  }

  // Data first, because the report carries the data message's consensus sequence.
  const dataReceipt = operator ? await publishMessage(operator, data.message) : null;
  // Without HCS (a local chain) both messages are numbered 1, as the local registry only checks it is nonzero.
  const final = buildHcsMessage(report, {
    hash: data.dataHash,
    sequence: dataReceipt ? Number(dataReceipt.sequenceNumber) : 1,
  });
  const reportReceipt = operator ? await publishMessage(operator, final.message) : null;
  const hcsSequence = reportReceipt?.sequenceNumber ?? 1n;
  const hcs: HcsLinks =
    reportReceipt && dataReceipt
      ? {
          topicId: reportReceipt.topicId,
          sequenceNumber: Number(reportReceipt.sequenceNumber),
          dataSequenceNumber: Number(dataReceipt.sequenceNumber),
          transactionId: reportReceipt.transactionId,
          url: hashscan.topicMessage(reportReceipt.topicId, reportReceipt.sequenceNumber.toString()),
          dataUrl: hashscan.topicMessage(reportReceipt.topicId, dataReceipt.sequenceNumber.toString()),
        }
      : null;

  const args = submission(final.reportHash as Hex, hcsSequence);
  // Hashio rejects the EIP-1559 fees viem derives from fee history when they fall under its minimum gas price, so
  // send a legacy transaction at the relay's own eth_gasPrice.
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: hydroTransport() });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "recordMonitoring",
    args: [args],
    gas: RECORD_GAS,
    gasPrice: await client.getGasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ApiError(`recordMonitoring transaction ${hash} reverted`, 502);
  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "MonitoringRecorded" });

  return {
    status: "recorded",
    report,
    ...anchors(final.message, final.reportHash),
    attestationId: Number(event.args.attestationId),
    sequence: event.args.sequence,
    reductionG: Number(event.args.reductionG),
    chainHash: event.args.chainHash,
    hcs,
    transaction: { hash, url: isLiveHederaChain() ? hashscan.transaction(hash) : null },
    nextStep:
      "Recorded, not issued. A VVB verifies the plant's pending records: POST /api/mrv/verification (MCP prepare_verification), signs the VerificationStatement, and anyone relays it.",
  };
}
