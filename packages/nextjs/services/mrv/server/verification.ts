import { type VerificationInput, recoverVerifier, verificationArgs, verificationTypedDataJson } from "../approval";
import { reproduceAttestation } from "../audit";
import { fetchTopicMessage } from "../mirror";
import { HYDRO_CHAIN_ID, hashscan, isLiveHederaChain } from "../network";
import { base64ToBytes, decodeMessage } from "../report";
import type { VerificationRequest, submitVerificationSchema } from "../schema";
import {
  VERIFICATION_SCHEMA,
  type VerificationReportBody,
  buildVerificationMessage,
  unitsToIssue,
  verificationStatementOf,
} from "../verification";
import { type AttestationView, type PlantView, plantIdToBytes32 } from "../views";
import { readOperatorConfig, readRelayerKey } from "./config";
import { ApiError, revertReason } from "./errors";
import { publishMessage } from "./hcs";
import {
  getAttestation,
  getAttestations,
  getPlant,
  hydroChain,
  hydroTransport,
  publicClient,
  requireDeployment,
} from "./registry";
import { type Address, type Hex, createWalletClient, isAddressEqual, parseEventLogs, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { z } from "zod";

const PAGE = 100;

/** Gas for `verifyPeriod`: one `ecrecover`, the issuance record and the HTS mint. */
export const VERIFY_GAS = 1_000_000n;

async function requirePlant(plantId: string): Promise<PlantView> {
  const plant = await getPlant(plantIdToBytes32(plantId));
  if (!plant) throw new ApiError(`Plant ${plantId} is not registered on-chain`, 404);
  return plant;
}

/** Every monitoring record of one project, in project order. */
export async function getProjectRecords(plantId: string): Promise<AttestationView[]> {
  const { address, abi } = requireDeployment();
  const count = Number(await publicClient().readContract({ address, abi, functionName: "attestationCount" }));
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / PAGE) }, (_, i) => getAttestations(i * PAGE, PAGE)),
  );
  return pages
    .flat()
    .filter(record => record.plantId === plantId)
    .sort((a, b) => a.sequence - b.sequence);
}

export type PendingRecord = {
  attestationId: number;
  sequence: number;
  periodStart: number;
  periodEnd: number;
  reductionG: number;
  reportUrl: string | null;
  /**
   * Re-derived from its HCS readings by the engine, with the registered design, meter and hash-chain link.
   * `local-chain`: a local development chain, which has no HCS to reproduce from.
   */
  reproduction: "reproduced" | "diverged" | "not-auditable" | "no-data" | "local-chain";
  failedChecks: string[];
};

export type PendingVerification = {
  plantId: string;
  registry: Address;
  chainId: number;
  /** The run a verification must cover next: from the first unverified record to `lastRecord`. */
  firstRecord: number;
  lastRecord: number;
  records: PendingRecord[];
  recordsHash: Hex;
  monitoredG: number;
  unissuedBalanceG: number;
  /** What an approval with no deduction would issue (kg units). */
  unitsIfApproved: number;
  allReproduced: boolean;
};

/**
 * What a VVB verifies next for a plant, read from the chain and reproduced from HCS. Read-only and keyless: the same
 * figures a VVB (or anyone) can re-derive with `yarn mrv:verify` or `/audit`.
 */
export async function getPendingVerification(
  plantId: string,
  lastRecord?: number,
): Promise<PendingVerification | null> {
  const { address } = requireDeployment();
  const plant = await requirePlant(plantId);
  const first = plant.verifiedRecords;
  const latest = plant.ledger.attestations - 1;
  if (latest < first) return null;
  const last = lastRecord ?? latest;
  if (last < first || last > latest) {
    throw new ApiError(`lastRecord must be between ${first} and ${latest} (the unverified records)`, 400);
  }

  const all = await getProjectRecords(plantId);
  const run = all.filter(r => r.sequence >= first && r.sequence <= last);
  const live = isLiveHederaChain();
  const records = await Promise.all(
    run.map(async (record): Promise<PendingRecord> => {
      const base = {
        attestationId: record.id,
        sequence: record.sequence,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        reductionG: record.reductionG,
      };
      // A local chain has no HCS, so there is nothing to reproduce from; say so rather than fail.
      if (!live) return { ...base, reportUrl: null, reproduction: "local-chain", failedChecks: [] };
      const previous = record.sequence === 0 ? zeroHash : (all[record.sequence - 1]?.chainHash ?? zeroHash);
      const result = await reproduceAttestation(record, fetch, plant.design, plant.meter, previous);
      const failed =
        result.status === "reproduced" || result.status === "diverged"
          ? [...result.checks, ...(result.audit.status === "mismatch" ? result.audit.checks : [])]
              .filter(c => !c.ok)
              .map(c => c.field)
          : [result.status === "no-data" ? result.reason : result.audit.status];
      return {
        ...base,
        reportUrl: record.hcsTopicId ? hashscan.topicMessage(record.hcsTopicId, record.hcsSequence) : null,
        reproduction: result.status,
        failedChecks: failed,
      };
    }),
  );
  const monitoredG = run.reduce((sum, r) => sum + r.reductionG, 0);
  return {
    plantId,
    registry: address,
    chainId: HYDRO_CHAIN_ID,
    firstRecord: first,
    lastRecord: last,
    records,
    recordsHash: run[run.length - 1].chainHash,
    monitoredG,
    unissuedBalanceG: plant.unissuedBalanceG,
    unitsIfApproved: unitsToIssue(plant.unissuedBalanceG, monitoredG, 0),
    allReproduced: records.every(r => r.reproduction === "reproduced" || r.reproduction === "local-chain"),
  };
}

/** Statement fields as JSON (bigints as strings), sent back unchanged with the VVB's signature. */
export type StatementJson = NonNullable<VerificationRequest["statement"]>;

const toStatementJson = (v: VerificationInput): StatementJson => ({
  firstRecord: v.firstRecord,
  lastRecord: v.lastRecord,
  recordsHash: v.recordsHash,
  deductionG: v.deductionG.toString(),
  reportHash: v.reportHash,
  hcsTopicNum: v.hcsTopicNum.toString(),
  hcsSequence: v.hcsSequence.toString(),
  evidenceHash: v.evidenceHash ?? zeroHash,
  decision: v.decision,
});

const fromStatementJson = (plantId: string, s: StatementJson): VerificationInput => ({
  plantId,
  firstRecord: s.firstRecord,
  lastRecord: s.lastRecord,
  recordsHash: s.recordsHash as Hex,
  deductionG: BigInt(s.deductionG),
  reportHash: s.reportHash as Hex,
  hcsTopicNum: BigInt(s.hcsTopicNum),
  hcsSequence: BigInt(s.hcsSequence),
  evidenceHash: s.evidenceHash as Hex,
  decision: s.decision,
});

/**
 * Verification step 1: reproduce the plant's pending records, publish the verification report on HCS and return the
 * `VerificationStatement` the VVB signs on its own machine. An approval is refused unless every record reproduces;
 * a VVB may still reject them. The server holds no VVB key and cannot sign this.
 */
export async function prepareVerification(request: VerificationRequest) {
  const { address, abi, client } = requireDeployment();
  const pending = await getPendingVerification(request.plantId, request.lastRecord);
  if (!pending) throw new ApiError(`${request.plantId} has no monitoring records awaiting verification`, 409);
  if (request.decision === "approve" && !pending.allReproduced) {
    const failed = pending.records
      .filter(r => r.reproduction !== "reproduced" && r.reproduction !== "local-chain")
      .map(r => r.sequence);
    throw new ApiError(
      `Records ${failed.join(", ")} do not reproduce from HCS, so they cannot be approved. Reject the run, or verify up to the record before them with lastRecord.`,
      409,
    );
  }
  const evidenceHash = (request.evidenceHash as Hex | undefined) ?? null;
  if (
    evidenceHash &&
    (await client.readContract({ address, abi, functionName: "evidenceUsed", args: [evidenceHash] }))
  ) {
    throw new ApiError(`Evidence ${evidenceHash} already backs an issuance`, 409);
  }

  const { message, reportHash, body } = buildVerificationMessage({
    plantId: pending.plantId,
    chainId: pending.chainId,
    registry: pending.registry,
    records: { first: pending.firstRecord, last: pending.lastRecord },
    recordsHash: pending.recordsHash,
    decision: request.decision,
    monitoredG: pending.monitoredG,
    deductionG: request.deductionG ?? 0,
    reproduced: pending.records.filter(r => r.reproduction === "reproduced").length,
    diverged: pending.records
      .filter(r => r.reproduction !== "reproduced" && r.reproduction !== "local-chain")
      .map(r => r.sequence),
    evidenceHash,
    findings: request.findings ?? "",
    unissuedBalanceG: pending.unissuedBalanceG,
  });

  const operator = readOperatorConfig();
  if (isLiveHederaChain() && !operator?.topicId) {
    throw new ApiError("HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY and HCS_TOPIC_ID are required to publish on HCS", 503);
  }
  const topicNum = await client.readContract({ address, abi, functionName: "auditTopic" });
  const receipt = operator ? await publishMessage(operator, message) : null;
  // A local chain has no HCS; its registry only checks the sequence is nonzero.
  const hcsSequence = receipt?.sequenceNumber ?? 1n;
  const statement = verificationStatementOf(body, reportHash, topicNum, hcsSequence);
  const registry = { chainId: HYDRO_CHAIN_ID, registry: address };

  return {
    status: "awaiting-signature" as const,
    pending,
    report: body,
    reportMessage: message,
    reportHash,
    hcs: receipt
      ? {
          topicId: receipt.topicId,
          sequenceNumber: Number(hcsSequence),
          url: hashscan.topicMessage(receipt.topicId, hcsSequence.toString()),
        }
      : null,
    statement: toStatementJson(statement),
    typedData: verificationTypedDataJson(registry, statement),
    nextStep:
      "The VVB signs `typedData` (eth_signTypedData_v4 or `yarn mrv:approve`) with a VERIFIER_ROLE key that is not the operator, meter or reporter, then POST the same plantId with `statement` and `signature`. Anyone may relay it.",
  };
}

/** The published verification report behind a statement, fetched from the mirror node and hashed. */
async function readPublishedReport(topicId: string, sequence: number): Promise<{ hash: Hex; body: unknown }> {
  let lastError: unknown;
  // The mirror node trails consensus by a few seconds.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const message = await fetchTopicMessage(topicId, sequence);
      const { text, hash } = decodeMessage(base64ToBytes(message.message));
      return { hash, body: JSON.parse(text) };
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }
  }
  throw new ApiError(
    `Verification report ${topicId}#${sequence} is not readable yet: ${(lastError as Error).message}`,
    409,
  );
}

/**
 * Verification step 2: relay the VVB's signed `VerificationStatement` to `verifyPeriod`. The server checks the
 * signer holds VERIFIER_ROLE and is none of the parties, that the statement's report is the one on HCS, and dry-runs
 * the call. An approval issues credits into the operator's custody; a rejection closes the run unissued.
 */
export async function submitVerification(request: z.input<typeof submitVerificationSchema>) {
  const { address, abi, errorAbi, client } = requireDeployment();
  const plant = await requirePlant(request.plantId);
  const statement = fromStatementJson(request.plantId, request.statement);
  const registry = { chainId: HYDRO_CHAIN_ID, registry: address };
  const verifier = recoverVerifier(registry, statement, request.signature as Hex);
  if (!verifier) throw new ApiError("The signature is malformed", 400);
  const role = await client.readContract({ address, abi, functionName: "VERIFIER_ROLE" });
  if (!(await client.readContract({ address, abi, functionName: "hasRole", args: [role, verifier] }))) {
    throw new ApiError(`The signature recovers to ${verifier}, which does not hold VERIFIER_ROLE`, 409);
  }
  const parties = [plant.operator, plant.meter, plant.reporter].filter((a): a is Address => Boolean(a));
  if (parties.some(party => isAddressEqual(party, verifier))) {
    throw new ApiError(`${verifier} is a party to ${plant.plantId} and cannot verify it`, 409);
  }

  if (isLiveHederaChain()) {
    const published = await readPublishedReport(`0.0.${statement.hcsTopicNum}`, Number(statement.hcsSequence));
    const body = published.body as Partial<VerificationReportBody>;
    const consistent =
      published.hash === statement.reportHash &&
      body.schema === VERIFICATION_SCHEMA &&
      body.plantId === plant.plantId &&
      body.records?.first === statement.firstRecord &&
      body.records?.last === statement.lastRecord &&
      body.recordsHash === statement.recordsHash &&
      BigInt(body.deductionG ?? -1) === statement.deductionG &&
      (body.decision === "approve" ? 1 : 2) === statement.decision &&
      (body.evidenceHash ?? zeroHash) === (statement.evidenceHash ?? zeroHash);
    if (!consistent) {
      throw new ApiError("The statement does not match the verification report published at its HCS anchor", 409);
    }
  }

  const relayerKey = readRelayerKey();
  if (!relayerKey) throw new ApiError("No relayer key: set HEDERA_OPERATOR_KEY (ECDSA) or RELAYER_PRIVATE_KEY", 503);
  const account = privateKeyToAccount(relayerKey);
  const args = [verificationArgs(statement), request.signature as Hex] as const;
  try {
    await client.simulateContract({
      account,
      address,
      abi: errorAbi as typeof abi,
      functionName: "verifyPeriod",
      args,
    });
  } catch (error) {
    throw new ApiError(`The registry would reject this verification: ${revertReason(error)}`, 409);
  }
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: hydroTransport() });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "verifyPeriod",
    args,
    // HTS mints are under-estimated by eth_estimateGas on some relays; Hashio wants a legacy gas price.
    gas: VERIFY_GAS,
    gasPrice: await client.getGasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new ApiError(`verifyPeriod transaction ${hash} reverted`, 502);
  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "PeriodVerified" });
  return {
    status: event.args.decision === 1 ? ("approved" as const) : ("rejected" as const),
    issuanceId: Number(event.args.issuanceId),
    records: { first: event.args.firstRecord, last: event.args.lastRecord },
    monitoredG: Number(event.args.monitoredG),
    deductionG: Number(event.args.deductionG),
    unitsIssued: Number(event.args.unitsIssued),
    verifier,
    transaction: { hash, url: isLiveHederaChain() ? hashscan.transaction(hash) : null },
  };
}

/**
 * Reproduces one monitoring record from HCS with its plant's registered design and meter, including its link in the
 * project's record hash chain.
 */
export async function reproduceRecord(attestationId: number) {
  const record = await getAttestation(attestationId);
  const plant = await requirePlant(record.plantId);
  let previous: Hex = zeroHash;
  if (record.sequence > 0) {
    const all = await getProjectRecords(record.plantId);
    previous = all.find(r => r.sequence === record.sequence - 1)?.chainHash ?? zeroHash;
  }
  return reproduceAttestation(record, fetch, plant.design, plant.meter, previous);
}
