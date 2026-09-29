import { AbiCoder, TypedDataEncoder, type TypedDataDomain, type Wallet, keccak256 } from "ethers";

/**
 * The three EIP-712 messages `DmrvRegistry` checks, in the order the VCS Program runs a project:
 *   ValidationApproval     a VVB validated the design and parameters (registration, and each renewal)
 *   MeterStatement         the plant's meter signed one monitoring period's raw totals
 *   VerificationStatement  a VVB verified a run of monitoring records (hash chain); an approval issues credits
 * Shared by the tests and the local demo deploy; `packages/nextjs/services/mrv/provenance.ts` and `approval.ts`
 * build the same bytes for the app.
 */
export type Energy = { netWh: bigint; grossWh: bigint; fuelG: bigint; leakageG: bigint };

export const ENERGY_TYPES = ["int64", "uint64", "uint64", "uint64"];

export function encodeEnergy(e: Energy): string {
  return AbiCoder.defaultAbiCoder().encode(ENERGY_TYPES, [e.netWh, e.grossWh, e.fuelG, e.leakageG]);
}

export type SubmissionInput = {
  projectId: string;
  sequence: number;
  intervals: number;
  intervalSeconds: number;
  readingsDigest: string;
  reportHash: string;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  measurement: { periodStart: bigint; periodEnd: bigint; metered: string; verified: string };
};

export type Submission = SubmissionInput & { meterSignature: string };

export const METER_STATEMENT_TYPES = {
  MeterStatement: [
    { name: "projectId", type: "bytes32" },
    { name: "sequence", type: "uint32" },
    { name: "periodStart", type: "uint64" },
    { name: "periodEnd", type: "uint64" },
    { name: "intervals", type: "uint32" },
    { name: "intervalSeconds", type: "uint32" },
    { name: "meteredHash", type: "bytes32" },
    { name: "readingsDigest", type: "bytes32" },
  ],
};

export const VALIDATION_APPROVAL_TYPES = {
  ValidationApproval: [
    { name: "projectId", type: "bytes32" },
    { name: "module", type: "address" },
    { name: "operator", type: "address" },
    { name: "meter", type: "address" },
    { name: "designHash", type: "bytes32" },
    { name: "paramsHash", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
    { name: "externalId", type: "bytes32" },
    { name: "creditingPeriod", type: "uint8" },
  ],
};

export const VERIFICATION_STATEMENT_TYPES = {
  VerificationStatement: [
    { name: "projectId", type: "bytes32" },
    { name: "firstRecord", type: "uint32" },
    { name: "lastRecord", type: "uint32" },
    { name: "recordsHash", type: "bytes32" },
    { name: "deductionG", type: "uint64" },
    { name: "reportHash", type: "bytes32" },
    { name: "hcsTopicNum", type: "uint64" },
    { name: "hcsSequence", type: "uint64" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "decision", type: "uint8" },
  ],
};

export const DECISION_APPROVED = 1;
export const DECISION_REJECTED = 2;

/** The registry's EIP-712 domain: its name, version 2, the chain and its own address. */
export function registryDomain(chainId: bigint, registry: string): TypedDataDomain {
  return { name: "DmrvRegistry", version: "2", chainId, verifyingContract: registry };
}

export function meterStatementOf(s: SubmissionInput) {
  return {
    projectId: s.projectId,
    sequence: s.sequence,
    periodStart: s.measurement.periodStart,
    periodEnd: s.measurement.periodEnd,
    intervals: s.intervals,
    intervalSeconds: s.intervalSeconds,
    meteredHash: keccak256(s.measurement.metered),
    readingsDigest: s.readingsDigest,
  };
}

/** Signs one monitoring period with the meter key. */
export async function signSubmission(domain: TypedDataDomain, input: SubmissionInput, meter: Wallet) {
  const meterSignature = await meter.signTypedData(domain, METER_STATEMENT_TYPES, meterStatementOf(input));
  return { ...input, meterSignature } satisfies Submission;
}

export function meterDigestOf(domain: TypedDataDomain, input: SubmissionInput): string {
  return TypedDataEncoder.hash(domain, METER_STATEMENT_TYPES, meterStatementOf(input));
}

/**
 * The next head of a project's record chain, exactly as `DmrvRegistry.recordMonitoring` computes it:
 * keccak256(abi.encode(previous head, meter statement digest, keccak256(verified), reportHash, hcsTopicNum,
 * hcsSequence, reductionG)).
 */
export function nextRecordsHash(
  previous: string,
  domain: TypedDataDomain,
  input: SubmissionInput,
  reductionG: bigint,
): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "uint64", "uint64", "int256"],
      [
        previous,
        meterDigestOf(domain, input),
        keccak256(input.measurement.verified),
        input.reportHash,
        input.hcsTopicNum,
        input.hcsSequence,
        reductionG,
      ],
    ),
  );
}

export type ValidationInput = {
  projectId: string;
  module: string;
  operator: string;
  meter: string;
  designHash: string;
  params: string;
  reportHash: string;
  externalId: string;
  creditingPeriod: number;
};

export function validationApprovalOf(v: ValidationInput) {
  return {
    projectId: v.projectId,
    module: v.module,
    operator: v.operator,
    meter: v.meter,
    designHash: v.designHash,
    paramsHash: keccak256(v.params),
    reportHash: v.reportHash,
    externalId: v.externalId,
    creditingPeriod: v.creditingPeriod,
  };
}

/** The VVB's signature over a registration (creditingPeriod 1) or a renewal. */
export async function signValidation(domain: TypedDataDomain, v: ValidationInput, vvb: Wallet): Promise<string> {
  return vvb.signTypedData(domain, VALIDATION_APPROVAL_TYPES, validationApprovalOf(v));
}

export type VerificationStatement = {
  projectId: string;
  firstRecord: number;
  lastRecord: number;
  recordsHash: string;
  deductionG: bigint;
  reportHash: string;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  evidenceHash: string;
  decision: number;
};

/** The VVB's signature over a run of monitoring records. */
export async function signVerification(
  domain: TypedDataDomain,
  v: VerificationStatement,
  vvb: Wallet,
): Promise<string> {
  return vvb.signTypedData(domain, VERIFICATION_STATEMENT_TYPES, v);
}
