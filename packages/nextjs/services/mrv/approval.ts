import {
  type MeterDomain,
  type MeterStatement,
  dmrvDomain,
  encodeEnergy,
  meterStatementDigest,
  recoverDigest,
  signDigest,
} from "./provenance";
import { type Address, type Hex, hashTypedData, keccak256, zeroHash } from "viem";

/**
 * The VVB's half of a DmrvRegistry attestation. The verifier signs an EIP-712 `VerifierApproval` that embeds the
 * digest of the meter's `MeterStatement`, so both signatures bind the same raw totals; the approval also binds the
 * accepted (`verified`) figures, the report hash, the HCS anchor and any external evidence (e.g. a Guardian VC).
 * The registry mints only if the meter signed, a key holding VERIFIER_ROLE approved, the VVB is neither the
 * operator nor the meter, and the accepted figures are no less conservative than the metered ones.
 *
 * The VVB key must be secp256k1 (ECDSA): `ecrecover` cannot verify an ED25519 Hedera key. Keep it off the server;
 * `yarn mrv:approve` signs on the VVB's own machine.
 */
export const DECISION_APPROVED = 1;

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
} as const;

/** The figures the VVB accepts after QA/QC (module encoding) plus everything it attests to. */
export type ApprovalInput = {
  domain: MeterDomain;
  plantId: string;
  statement: MeterStatement;
  verified: { netWh: number; grossWh: number; fuelG: number; leakageG: number };
  reportHash: Hex;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  evidenceHash?: Hex;
};

export function buildApproval(input: ApprovalInput, decision = DECISION_APPROVED) {
  const verified = encodeEnergy(input.verified);
  return {
    domain: dmrvDomain(input.domain),
    types: VERIFIER_APPROVAL_TYPES,
    primaryType: "VerifierApproval" as const,
    message: {
      meterStatement: meterStatementDigest(input.domain, input.plantId, input.statement),
      verifiedHash: keccak256(verified),
      reportHash: input.reportHash,
      hcsTopicNum: input.hcsTopicNum,
      hcsSequence: input.hcsSequence,
      evidenceHash: input.evidenceHash ?? zeroHash,
      decision,
    },
    /** The `verified` bytes the submission must carry. */
    verified,
  };
}

/** Byte-for-byte `DmrvRegistry.approvalDigest`. */
export function approvalDigest(input: ApprovalInput, decision = DECISION_APPROVED): Hex {
  const { domain, types, primaryType, message } = buildApproval(input, decision);
  return hashTypedData({ domain, types, primaryType, message });
}

/** Signs the approval with the VVB's secp256k1 key. */
export function signApproval(privateKey: Hex, input: ApprovalInput): Hex {
  return signDigest(privateKey, approvalDigest(input));
}

/** The VVB address behind an approval signature, or null when the signature is malformed. */
export function recoverApprover(input: ApprovalInput, signature: Hex): Address | null {
  return recoverDigest(approvalDigest(input), signature);
}

/** JSON-safe typed data, for wallets (`eth_signTypedData_v4`) and the MCP preview tool. */
export function approvalTypedDataJson(input: ApprovalInput) {
  const { domain, types, primaryType, message } = buildApproval(input);
  return {
    domain: { ...domain, chainId: Number(domain.chainId) },
    types,
    primaryType,
    message: { ...message, hcsTopicNum: message.hcsTopicNum.toString(), hcsSequence: message.hcsSequence.toString() },
  };
}
