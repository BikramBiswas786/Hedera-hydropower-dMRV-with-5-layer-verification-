import { type BridgeSigner, NotAVcError, type ResultSchemaRef, runCrossCheck, sourceVcHash } from "../guardian/bridge";
import { MappingError } from "../guardian/crossCheck";
import { assertDidMatchesKey, bridgeKeyPair, parseBridgeKey } from "../guardian/did";
import { type EvidenceResult, verifyGuardianEvidence } from "../guardian/evidence";
import { type GuardianSources, SourceError } from "../guardian/hedera";
import { MIRROR_NODE_URL } from "../network";
import { ApiError } from "./errors";
import { timingSafeEqual } from "crypto";

/**
 * Server side of the Guardian bridge: environment, auth, limits and caching around the pure modules in
 * services/mrv/guardian/. The Ed25519 key is read here only; it is never logged and never returned.
 *
 *   BRIDGE_ED25519_PRIVATE_KEY   bridge key (DER hex or raw 32-byte hex), Ed25519
 *   BRIDGE_DID                   did:hedera:<network>:<base58(sha256(pubkey))>_<topic>, from publish-bridge-did
 *   GUARDIAN_BRIDGE_API_KEY      bearer the policy's httpRequestBlock sends (header with "Include" unchecked)
 *   GUARDIAN_BRIDGE_RESULT_SCHEMA  {"type","contextUrl"[,"context"]} or {"<policyId>": {...}, "default": {...}}
 *   GUARDIAN_MIRROR_NODE_URL, GUARDIAN_IPFS_GATEWAY, GUARDIAN_EVIDENCE_TOPIC_IDS  evidence verifier sources
 */

export const MAX_BODY_BYTES = 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 60;
const CACHE_SIZE = 500;
/**
 * @digitalbazaar/vc 7.3.0 rejects a credential whose issuanceDate is after the verifier's clock ("The current date
 * time … is before the issuanceDate"). Backdating by two minutes keeps a Guardian worker whose clock lags ours
 * from refusing the result.
 */
export const ISSUANCE_SKEW_MS = 120_000;

export class BridgeUnavailableError extends ApiError {
  constructor(message: string) {
    super(message, 503);
  }
}

export function readBridgeSigner(): BridgeSigner {
  const rawKey = process.env.BRIDGE_ED25519_PRIVATE_KEY;
  const did = process.env.BRIDGE_DID;
  if (!rawKey || !did) {
    const missing = [!rawKey && "BRIDGE_ED25519_PRIVATE_KEY", !did && "BRIDGE_DID"].filter(Boolean).join(" and ");
    throw new BridgeUnavailableError(
      `Guardian bridge is not configured: set ${missing}. Run \`yarn guardian:publish-did\` to create and publish the bridge DID.`,
    );
  }
  let key;
  try {
    key = parseBridgeKey(rawKey);
    assertDidMatchesKey(did.trim(), key);
  } catch (error) {
    throw new BridgeUnavailableError(`Guardian bridge key or DID is invalid: ${(error as Error).message}`);
  }
  return { did: did.trim(), key, keyPair: bridgeKeyPair(did.trim(), key) };
}

export function readResultSchema(policyId: string | null): ResultSchemaRef {
  const raw = process.env.GUARDIAN_BRIDGE_RESULT_SCHEMA;
  if (!raw) {
    throw new BridgeUnavailableError(
      'Guardian bridge result schema is not configured: set GUARDIAN_BRIDGE_RESULT_SCHEMA to {"type":"<uuid>&<version>","contextUrl":"ipfs://…"} from the imported "DMRV Cross-Check Result" schema (docs/GUARDIAN.md)',
    );
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BridgeUnavailableError("GUARDIAN_BRIDGE_RESULT_SCHEMA is not JSON");
  }
  const entry = typeof parsed?.type === "string" ? parsed : (policyId && parsed?.[policyId]) || parsed?.default;
  if (!entry || typeof entry.type !== "string" || typeof entry.contextUrl !== "string") {
    throw new BridgeUnavailableError(`No result schema configured for policy ${policyId ?? "(none)"} and no default`);
  }
  if (!/^(ipfs:\/\/[A-Za-z0-9]+|schema:[0-9a-f-]{36})$/i.test(entry.contextUrl)) {
    throw new BridgeUnavailableError("Result schema contextUrl must be ipfs://<cid> or schema:<uuid>");
  }
  return { type: entry.type, contextUrl: entry.contextUrl, ...(entry.context ? { context: entry.context } : {}) };
}

export function checkBridgeAuth(authorization: string | null): void {
  const expected = process.env.GUARDIAN_BRIDGE_API_KEY;
  if (!expected) {
    throw new BridgeUnavailableError("Guardian bridge is disabled: set GUARDIAN_BRIDGE_API_KEY on the server");
  }
  const provided = authorization?.startsWith("Bearer ") ? Buffer.from(authorization.slice(7)) : Buffer.alloc(0);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    throw new ApiError("Missing or invalid bearer token", 401);
  }
}

// Per-instance state. On serverless each instance keeps its own window and cache; that bounds abuse per instance
// and makes Guardian's retries idempotent in the common case, not globally.
const hits = new Map<string, number[]>();
const results = new Map<string, unknown>();

export function rateLimit(bucket: string, now = Date.now()): void {
  const recent = (hits.get(bucket) ?? []).filter(t => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) throw new ApiError("Rate limit exceeded (60 requests per minute)", 429);
  recent.push(now);
  hits.set(bucket, recent);
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new ApiError("Body larger than 1 MB", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiError("Body larger than 1 MB", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Request body must be JSON", 400);
  }
}

/** Configuration first (503), then auth (401), limits (413/429), mapping (400/422), then sign. */
export async function handleCrossCheck(request: Request) {
  const url = new URL(request.url);
  const policyId = url.searchParams.get("policyId");
  const signer = readBridgeSigner();
  const schema = readResultSchema(policyId);
  checkBridgeAuth(request.headers.get("authorization"));
  rateLimit("cross-check");
  const body = await readLimitedJson(request);
  try {
    const cacheKey = `${policyId ?? ""}:${sourceVcHash(body)}`;
    const cached = results.get(cacheKey);
    if (cached) return cached;
    const {
      vc,
      decision,
      sourceVcHash: hash,
    } = await runCrossCheck({ body, policyId, schema, signer, now: new Date(Date.now() - ISSUANCE_SKEW_MS) });
    // Log the hash, never the document.
    console.info("[guardian bridge] cross-check", { sourceVcHash: hash, decision });
    if (results.size >= CACHE_SIZE) results.delete(results.keys().next().value as string);
    results.set(cacheKey, vc);
    return vc;
  } catch (error) {
    if (error instanceof NotAVcError) throw new ApiError(error.message, 400);
    if (error instanceof MappingError) throw new ApiError(error.message, 422);
    throw error;
  }
}

export function readGuardianSources(fetchImpl: typeof fetch = fetch): GuardianSources {
  return {
    mirrorNodeUrl: (process.env.GUARDIAN_MIRROR_NODE_URL || MIRROR_NODE_URL).replace(/\/$/, ""),
    ipfsGateway: process.env.GUARDIAN_IPFS_GATEWAY || "https://ipfs.io/ipfs/{cid}",
    fetch: fetchImpl,
  };
}

export async function verifyEvidence(
  ref: string,
  topicIds: string[] | null,
  fetchImpl: typeof fetch = fetch,
): Promise<EvidenceResult> {
  const expected = topicIds?.length
    ? topicIds
    : (process.env.GUARDIAN_EVIDENCE_TOPIC_IDS ?? "").split(",").filter(Boolean);
  if (!expected.length) {
    throw new ApiError("Pass topicIds (the Guardian policy or instance topic) or set GUARDIAN_EVIDENCE_TOPIC_IDS", 400);
  }
  if (expected.some(t => !/^\d+\.\d+\.\d+$/.test(t.trim())))
    throw new ApiError("topicIds must be Hedera topic ids (0.0.x)", 400);
  try {
    return await verifyGuardianEvidence(readGuardianSources(fetchImpl), ref, { expectedTopicIds: expected });
  } catch (error) {
    if (error instanceof SourceError) throw new ApiError(error.message, 422);
    throw error;
  }
}
