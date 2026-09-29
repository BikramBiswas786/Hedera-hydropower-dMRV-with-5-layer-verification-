import { DECISION_APPROVED, DECISION_REJECTED, type VerificationInput } from "./approval";
import { HCS_CHUNK_BYTES } from "./report";
import { type Address, type Hex, sha256, stringToBytes } from "viem";

/**
 * The verification report a VVB publishes on HCS for a run of monitoring records. `DmrvRegistry.verifyPeriod` takes
 * its SHA-256 as `reportHash` and its consensus sequence as the anchor, so the VVB's signature covers exactly these
 * bytes. It fits one HCS chunk (≤ 1024 bytes), like the monitoring report.
 */
export const VERIFICATION_SCHEMA = "hydro-dmrv/verification@1";

export type VerificationDecision = "approve" | "reject";

export type VerificationReportBody = {
  schema: typeof VERIFICATION_SCHEMA;
  plantId: string;
  chainId: number;
  registry: Address;
  /** Project record sequence numbers, inclusive. */
  records: { first: number; last: number };
  /** Head of the record hash chain at `last`; the contract refuses any other. */
  recordsHash: Hex;
  decision: VerificationDecision;
  /** Σ ER over the run (g), the deduction the VVB applies (g), and the whole tonnes that leaves to issue (kg units). */
  monitoredG: number;
  deductionG: number;
  unitsToIssue: number;
  /** Records re-derived from their HCS readings, and those that were not (their sequence numbers). */
  reproduced: number;
  diverged: number[];
  evidenceHash: Hex | null;
  findings: string;
};

export type VerificationReportInput = Omit<VerificationReportBody, "schema" | "unitsToIssue"> & {
  /** The project's verified-but-unissued balance before this run (g): a sub-tonne remainder or a deficit. */
  unissuedBalanceG: number;
};

/** Units `verifyPeriod` issues for an approval, exactly as the contract computes them. */
export function unitsToIssue(unissuedBalanceG: number, monitoredG: number, deductionG: number): number {
  const balance = BigInt(unissuedBalanceG) + BigInt(monitoredG) - BigInt(deductionG);
  return balance > 0n ? Number(balance / 1_000n) : 0;
}

export function buildVerificationMessage(input: VerificationReportInput) {
  const { unissuedBalanceG, ...rest } = input;
  const body: VerificationReportBody = {
    schema: VERIFICATION_SCHEMA,
    ...rest,
    unitsToIssue: input.decision === "approve" ? unitsToIssue(unissuedBalanceG, input.monitoredG, input.deductionG) : 0,
  };
  const message = JSON.stringify(body);
  const bytes = stringToBytes(message);
  if (bytes.length > HCS_CHUNK_BYTES) {
    throw new Error(`Verification report is ${bytes.length} bytes; the limit for a single chunk is ${HCS_CHUNK_BYTES}`);
  }
  return { message, reportHash: sha256(bytes), body };
}

export const decisionCode = (decision: VerificationDecision) =>
  decision === "approve" ? DECISION_APPROVED : DECISION_REJECTED;

/** The statement a VVB signs for a published verification report. */
export function verificationStatementOf(
  body: VerificationReportBody,
  reportHash: Hex,
  hcsTopicNum: bigint,
  hcsSequence: bigint,
): VerificationInput {
  return {
    plantId: body.plantId,
    firstRecord: body.records.first,
    lastRecord: body.records.last,
    recordsHash: body.recordsHash,
    deductionG: BigInt(body.deductionG),
    reportHash,
    hcsTopicNum,
    hcsSequence,
    evidenceHash: body.evidenceHash ?? undefined,
    decision: decisionCode(body.decision),
  };
}
