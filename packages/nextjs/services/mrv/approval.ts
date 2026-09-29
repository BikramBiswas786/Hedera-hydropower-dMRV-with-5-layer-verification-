import {
  type MeterDomain,
  type MeterStatement,
  dmrvDomain,
  meterStatementDigest,
  plantIdHex,
  recoverDigest,
  signDigest,
} from "./provenance";
import { type Address, type Hex, encodeAbiParameters, hashTypedData, keccak256, zeroHash } from "viem";

/**
 * The VVB's two EIP-712 messages to `DmrvRegistry`, in VCS order:
 *
 *   ValidationApproval     at registration (creditingPeriod 1) and at each renewal: the VVB validated this design,
 *                          these module params and its validation report.
 *   VerificationStatement  per monitoring period: the VVB verified the run of monitoring records `firstRecord..
 *                          lastRecord` (committed by their hash chain), its verification report is anchored on HCS, and
 *                          it approves (issuing the monitored ER minus any deduction) or rejects the run.
 *
 * The meter's `MeterStatement` (`provenance.ts`) signs each record's raw totals; the VVB never signs individual
 * readings. The VVB key must be secp256k1 (`ecrecover` cannot verify ED25519) and stay off the server:
 * `yarn mrv:approve` signs on the VVB's own machine. Byte-for-byte with the contract: `fixtures/eip712.json`.
 */
export const DECISION_APPROVED = 1;
export const DECISION_REJECTED = 2;

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
} as const;

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
} as const;

type Registry = Pick<MeterDomain, "chainId" | "registry">;

// ─── Validation ─────────────────────────────────────────────────────────────

export type ValidationInput = {
  plantId: string;
  module: Address;
  operator: Address;
  meter: Address;
  designHash: Hex;
  params: Hex;
  reportHash: Hex;
  externalId?: Hex;
  creditingPeriod: number;
};

export function validationTypedData(registry: Registry, v: ValidationInput) {
  return {
    domain: dmrvDomain(registry),
    types: VALIDATION_APPROVAL_TYPES,
    primaryType: "ValidationApproval" as const,
    message: {
      projectId: plantIdHex(v.plantId),
      module: v.module,
      operator: v.operator,
      meter: v.meter,
      designHash: v.designHash,
      paramsHash: keccak256(v.params),
      reportHash: v.reportHash,
      externalId: v.externalId ?? zeroHash,
      creditingPeriod: v.creditingPeriod,
    },
  };
}

export const validationDigest = (registry: Registry, v: ValidationInput): Hex =>
  hashTypedData(validationTypedData(registry, v));

// ─── Monitoring record chain ────────────────────────────────────────────────

export type RecordLink = {
  plantId: string;
  sequence: number;
  statement: MeterStatement;
  /** The module-encoded figures the record quantified (`verified` in the measurement). */
  verified: Hex;
  reportHash: Hex;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  reductionG: bigint;
};

/**
 * The next head of a project's record chain, exactly as `DmrvRegistry.recordMonitoring` computes it:
 * keccak256(abi.encode(previous, meter statement digest, keccak256(verified), reportHash, topic, sequence, ER)).
 */
export function nextRecordsHash(previous: Hex, registry: Registry, r: RecordLink): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "int256" },
      ],
      [
        previous,
        meterStatementDigest({ ...registry, sequence: r.sequence }, r.plantId, r.statement),
        keccak256(r.verified),
        r.reportHash,
        r.hcsTopicNum,
        r.hcsSequence,
        r.reductionG,
      ],
    ),
  );
}

// ─── Verification ───────────────────────────────────────────────────────────

export type VerificationInput = {
  plantId: string;
  firstRecord: number;
  lastRecord: number;
  recordsHash: Hex;
  deductionG: bigint;
  reportHash: Hex;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  evidenceHash?: Hex;
  decision: number;
};

export function verificationTypedData(registry: Registry, v: VerificationInput) {
  return {
    domain: dmrvDomain(registry),
    types: VERIFICATION_STATEMENT_TYPES,
    primaryType: "VerificationStatement" as const,
    message: {
      projectId: plantIdHex(v.plantId),
      firstRecord: v.firstRecord,
      lastRecord: v.lastRecord,
      recordsHash: v.recordsHash,
      deductionG: v.deductionG,
      reportHash: v.reportHash,
      hcsTopicNum: v.hcsTopicNum,
      hcsSequence: v.hcsSequence,
      evidenceHash: v.evidenceHash ?? zeroHash,
      decision: v.decision,
    },
  };
}

export const verificationDigest = (registry: Registry, v: VerificationInput): Hex =>
  hashTypedData(verificationTypedData(registry, v));

/** Signs with the VVB's secp256k1 key. */
export const signVerification = (privateKey: Hex, registry: Registry, v: VerificationInput): Hex =>
  signDigest(privateKey, verificationDigest(registry, v));

export const signValidation = (privateKey: Hex, registry: Registry, v: ValidationInput): Hex =>
  signDigest(privateKey, validationDigest(registry, v));

/** The VVB behind a verification signature, or null when the signature is malformed. */
export const recoverVerifier = (registry: Registry, v: VerificationInput, signature: Hex): Address | null =>
  recoverDigest(verificationDigest(registry, v), signature);

/** The statement as the contract takes it (`verifyPeriod` argument). */
export function verificationArgs(v: VerificationInput) {
  return {
    projectId: plantIdHex(v.plantId),
    firstRecord: v.firstRecord,
    lastRecord: v.lastRecord,
    recordsHash: v.recordsHash,
    deductionG: v.deductionG,
    reportHash: v.reportHash,
    hcsTopicNum: v.hcsTopicNum,
    hcsSequence: v.hcsSequence,
    evidenceHash: v.evidenceHash ?? zeroHash,
    decision: v.decision,
  };
}

/** JSON-safe typed data for wallets (`eth_signTypedData_v4`), MCP and `yarn mrv:approve`. */
export function verificationTypedDataJson(registry: Registry, v: VerificationInput) {
  const { domain, types, primaryType, message } = verificationTypedData(registry, v);
  return {
    domain: { ...domain, chainId: Number(domain.chainId) },
    types,
    primaryType,
    message: {
      ...message,
      deductionG: message.deductionG.toString(),
      hcsTopicNum: message.hcsTopicNum.toString(),
      hcsSequence: message.hcsSequence.toString(),
    },
  };
}
