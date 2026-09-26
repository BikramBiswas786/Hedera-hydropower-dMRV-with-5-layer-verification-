import { PrivateKey } from "@hiero-ledger/sdk";
import { createHash } from "crypto";

/**
 * Hedera DIDs exactly as Guardian 3.7.0 builds and resolves them (common/src/hedera-modules/vcjs/did/hedera-did.ts,
 * hedera-did-document.ts, components/hedera-ed25519-method.ts, message/did-message.ts at tag 3.7.0).
 *
 *   DID          did:hedera:<network>:<base58(sha256(publicKey))>_<topicId>
 *   key id       <did>#did-root-key, type Ed25519VerificationKey2018, publicKeyBase58 = base58(raw public key)
 *   HCS message  {"id","status":"ISSUE","type":"DID-Document","action":"create-did-document","lang":"en-US","did","cid","uri"}
 *
 * Guardian's RemoteDidLoader reads the DID's topic, takes the FIRST "DID-Document" message whose `did` matches, and
 * fetches `cid` through its IPFS gateway. So rotating the key means a new DID; old DIDs stay resolvable.
 */

export const DID_ROOT_KEY = "#did-root-key";
export const ED25519_2018 = "Ed25519VerificationKey2018";
export const DID_CONTEXT = "https://www.w3.org/ns/did/v1";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

export type HederaNetwork = "testnet" | "mainnet" | "previewnet";

export type ParsedHederaDid = { did: string; network: string; identifier: string; topicId: string };

const DID_PATTERN = /^did:hedera:(testnet|mainnet|previewnet):([1-9A-HJ-NP-Za-km-z]{32,50})_(\d+\.\d+\.\d+)$/;

/** Parses the current Guardian form only (`…_0.0.x`); the legacy `;hedera:testnet:tid=` form is refused. */
export function parseHederaDid(did: string): ParsedHederaDid | null {
  const controller = did.split("#")[0];
  const match = DID_PATTERN.exec(controller);
  if (!match) return null;
  return { did: controller, network: match[1], identifier: match[2], topicId: match[3] };
}

/** Accepts DER hex (as exported by the Hedera portal) or a raw 32-byte hex seed. Always Ed25519. */
export function parseBridgeKey(value: string): PrivateKey {
  const trimmed = value.trim().replace(/^0x/, "");
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? PrivateKey.fromStringED25519(trimmed)
    : PrivateKey.fromStringDer(trimmed);
  if (key.type !== "ED25519") throw new Error("The bridge key must be an Ed25519 key");
  return key;
}

/** Guardian's DID identifier: base58(sha256(public key bytes)). */
export function didIdentifier(key: PrivateKey): string {
  return base58Encode(createHash("sha256").update(key.publicKey.toBytesRaw()).digest());
}

export function buildDid(key: PrivateKey, network: HederaNetwork, topicId: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(topicId)) throw new Error(`Invalid topic id: ${topicId}`);
  return `did:hedera:${network}:${didIdentifier(key)}_${topicId}`;
}

/** Raises unless the DID was derived from this key, so a mismatched env pair can never sign. */
export function assertDidMatchesKey(did: string, key: PrivateKey): ParsedHederaDid {
  const parsed = parseHederaDid(did);
  if (!parsed) throw new Error(`BRIDGE_DID is not a did:hedera:<network>:<id>_<topic> DID: ${did}`);
  if (parsed.identifier !== didIdentifier(key)) {
    throw new Error("BRIDGE_DID was not derived from BRIDGE_ED25519_PRIVATE_KEY (identifier ≠ base58(sha256(pubkey)))");
  }
  return parsed;
}

export type BridgeKeyPair = {
  id: string;
  controller: string;
  type: typeof ED25519_2018;
  publicKeyBase58: string;
  /** Guardian's layout: base58(private seed ‖ public key), 64 bytes. Never serialise this. */
  privateKeyBase58: string;
};

export function bridgeKeyPair(did: string, key: PrivateKey): BridgeKeyPair {
  const seed = key.toBytesRaw();
  const pub = key.publicKey.toBytesRaw();
  const secret = new Uint8Array(seed.length + pub.length);
  secret.set(seed, 0);
  secret.set(pub, seed.length);
  return {
    id: did + DID_ROOT_KEY,
    controller: did,
    type: ED25519_2018,
    publicKeyBase58: base58Encode(pub),
    privateKeyBase58: base58Encode(secret),
  };
}

export type DidDocument = {
  "@context": string | string[];
  id: string;
  verificationMethod: { id: string; type: string; controller: string; publicKeyBase58?: string }[];
  authentication?: (string | object)[];
  assertionMethod?: (string | object)[];
};

/**
 * The DID document Guardian would generate for this key, minus the BBS method (we never sign BBS).
 * `assertionMethod` holds the relative "#did-root-key" exactly as Guardian writes it; Guardian's verifier rewrites it.
 */
export function buildDidDocument(did: string, key: PrivateKey): DidDocument {
  const { id, controller, type, publicKeyBase58 } = bridgeKeyPair(did, key);
  return {
    "@context": DID_CONTEXT,
    id: did,
    verificationMethod: [{ id, type, controller, publicKeyBase58 }],
    authentication: [id],
    assertionMethod: [DID_ROOT_KEY],
  };
}

export type DidMessage = {
  id: string;
  status: "ISSUE";
  type: "DID-Document";
  action: "create-did-document";
  lang: "en-US";
  did: string;
  cid: string;
  uri: string;
};

/** Field order follows DIDMessage.toMessageObject(); `account` is undefined there and drops out of JSON. */
export function buildDidMessage(id: string, did: string, cid: string): DidMessage {
  return {
    id,
    status: "ISSUE",
    type: "DID-Document",
    action: "create-did-document",
    lang: "en-US",
    did,
    cid,
    uri: `ipfs://${cid}`,
  };
}
