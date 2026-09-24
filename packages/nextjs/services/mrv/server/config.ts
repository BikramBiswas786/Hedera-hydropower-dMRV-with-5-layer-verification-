import { AccountId, PrivateKey } from "@hiero-ledger/sdk";
import { timingSafeEqual } from "crypto";
import type { Hex } from "viem";

export type OperatorConfig = {
  accountId: AccountId;
  privateKey: PrivateKey;
  topicId: string | null;
};

/** Accepts raw hex (with or without 0x) or DER-encoded keys, as exported by the Hedera Portal. */
export function parsePrivateKey(value: string): PrivateKey {
  const trimmed = value.trim().replace(/^0x/, "");
  return /^[0-9a-fA-F]{64}$/.test(trimmed) ? PrivateKey.fromStringECDSA(trimmed) : PrivateKey.fromStringDer(trimmed);
}

/** Hedera operator used to publish reports to HCS. `null` when the server has no credentials (read-only mode). */
export function readOperatorConfig(): OperatorConfig | null {
  const accountId = process.env.HEDERA_OPERATOR_ID;
  const key = process.env.HEDERA_OPERATOR_KEY;
  if (!accountId || !key) return null;
  return {
    accountId: AccountId.fromString(accountId),
    privateKey: parsePrivateKey(key),
    topicId: process.env.HCS_TOPIC_ID || null,
  };
}

/**
 * EVM key that signs `submitAttestation`. Defaults to the operator key, which works when the operator is an ECDSA
 * account (its EVM alias is the address granted VERIFIER_ROLE). ED25519 accounts must set VERIFIER_PRIVATE_KEY.
 */
export function readVerifierKey(operator = readOperatorConfig()): Hex | null {
  const explicit = process.env.VERIFIER_PRIVATE_KEY;
  if (explicit) return `0x${explicit.trim().replace(/^0x/, "")}`;
  if (operator?.privateKey.type === "secp256k1") return `0x${operator.privateKey.toStringRaw()}`;
  return null;
}

/** Write endpoints are disabled unless MRV_API_KEY is set; then they require `Authorization: Bearer <key>`. */
export function isAuthorized(authorizationHeader: string | null): boolean {
  const expected = process.env.MRV_API_KEY;
  if (!expected || !authorizationHeader?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorizationHeader.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

export function writesEnabled(): boolean {
  return Boolean(process.env.MRV_API_KEY);
}
