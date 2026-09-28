import { AbiCoder, TypedDataEncoder, type TypedDataDomain, type Wallet, keccak256 } from "ethers";

/**
 * The two EIP-712 messages `DmrvRegistry.submitAttestation` checks: the meter's `MeterStatement` over the raw totals
 * and the VVB's `VerifierApproval` over that statement's digest. Shared by the tests and the local demo deploy;
 * `packages/nextjs/services/mrv/provenance.ts` and `approval.ts` build the same bytes for the app.
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
  evidenceHash: string;
  measurement: { periodStart: bigint; periodEnd: bigint; metered: string; verified: string };
};

export type Submission = SubmissionInput & { meterSignature: string; verifierSignature: string };

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

export const VERIFIER_APPROVAL_TYPES = {
  VerifierApproval: [
    { name: "meterStatement", type: "bytes32" },
    { name: "verifiedHash", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
    { name: "hcsTopicNum", type: "uint64" },
    { name: "hcsSequence", type: "uint64" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "decision", type: "uint8" },
  ],
};

/** The registry's EIP-712 domain: its name, version 1, the chain and its own address. */
export function registryDomain(chainId: bigint, registry: string): TypedDataDomain {
  return { name: "DmrvRegistry", version: "1", chainId, verifyingContract: registry };
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

export function approvalOf(meterDigest: string, s: SubmissionInput, decision = 1) {
  return {
    meterStatement: meterDigest,
    verifiedHash: keccak256(s.measurement.verified),
    reportHash: s.reportHash,
    hcsTopicNum: s.hcsTopicNum,
    hcsSequence: s.hcsSequence,
    evidenceHash: s.evidenceHash,
    decision,
  };
}

/** Signs a submission with the meter key (raw totals) and the VVB key (approval over the meter digest). */
export async function signAttestation(
  domain: TypedDataDomain,
  input: SubmissionInput,
  meter: Wallet,
  vvb: Wallet,
  decision = 1,
): Promise<Submission> {
  const statement = meterStatementOf(input);
  const meterSignature = await meter.signTypedData(domain, METER_STATEMENT_TYPES, statement);
  const meterDigest = TypedDataEncoder.hash(domain, METER_STATEMENT_TYPES, statement);
  const verifierSignature = await vvb.signTypedData(
    domain,
    VERIFIER_APPROVAL_TYPES,
    approvalOf(meterDigest, input, decision),
  );
  return { ...input, meterSignature, verifierSignature };
}
