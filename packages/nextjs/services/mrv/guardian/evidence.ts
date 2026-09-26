import { MappingError, REQUIRED_MR_FIELDS, crossCheckMonitoringReport } from "./crossCheck";
import {
  type GuardianSources,
  SourceError,
  fetchIpfsJson,
  fetchMessageByTimestamp,
  isCid,
  isConsensusTimestamp,
  remoteDidResolver,
} from "./hedera";
import { buildDocumentLoader, verifyGuardianCredential, verifyGuardianPresentation } from "./vc";
import { encodePacked, keccak256 } from "viem";

/**
 * Verifies Guardian evidence from public data only (spec §5.6, digest §3.3, Guardian FAQ Q16), so our registry can
 * accept a Guardian document as supporting evidence without trusting a Guardian instance:
 *
 *   mint memo / NFT metadata → VP consensus timestamp → HCS message (mirror node) → IPFS document
 *   → Ed25519Signature2018 proofs, issuers resolved like Guardian's RemoteDidLoader → relationships
 *
 * It refuses any chain that contains a MintToken VC: Guardian already minted those tonnes, so accepting the
 * evidence would issue them twice (§5.7). It never writes to Hedera.
 */

export type EvidenceOptions = {
  /** Policy/instance topics the evidence must come from. Required: an unknown topic proves nothing. */
  expectedTopicIds: string[];
  /** How many `relationships` levels to follow from the root message. */
  maxDepth?: number;
  maxDocuments?: number;
};

export type ChainEntry = {
  timestamp: string;
  topicId: string;
  depth: number;
  type?: string;
  action?: string;
  cid?: string;
  issuers: string[];
  schemaTypes: string[];
  signature: "verified" | "invalid" | "not-checked";
  error?: string;
  mintToken?: { tokenId?: unknown; amount?: unknown };
};

export type EvidenceResult = {
  accepted: boolean;
  refusals: string[];
  notes: string[];
  timestamp: string;
  topicId: string | null;
  cid: string | null;
  /** keccak256(abi.encodePacked("guardian:", consensusTimestamp, ":", cid)), the value a VVB signs (§5.6). */
  evidenceHash: string | null;
  chain: ChainEntry[];
  crossChecks: { vcId: string; decision: string; deltaERg: string; notes: string[] }[];
};

const MINT_TYPES = /^(MintToken|MintNFToken)(&|$)/;

export function evidenceHash(consensusTimestamp: string, cid: string) {
  return keccak256(encodePacked(["string", "string", "string", "string"], ["guardian:", consensusTimestamp, ":", cid]));
}

/** `0.0.123@1726000000.123456789` or the mirror form `0.0.123-1726000000-123456789`. */
function mirrorTransactionId(id: string): string | null {
  const at = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(id);
  if (at) return `${at[1]}-${at[2]}-${at[3]}`;
  return /^\d+\.\d+\.\d+-\d+-\d+$/.test(id) ? id : null;
}

const decode = (b64: string) => Buffer.from(b64, "base64").toString("utf8").trim();

/**
 * Turns what a buyer holds into the VP's consensus timestamp: a timestamp as-is, a fungible mint transaction
 * (its memo), or `nft:<tokenId>:<serial>` (the serial's metadata), as Guardian writes them.
 */
export async function resolveEvidenceTimestamp(sources: GuardianSources, ref: string): Promise<string> {
  if (isConsensusTimestamp(ref)) return ref;
  const nft = /^nft:(\d+\.\d+\.\d+):(\d+)$/.exec(ref);
  if (nft) {
    const response = await sources.fetch(`${sources.mirrorNodeUrl}/api/v1/tokens/${nft[1]}/nfts/${nft[2]}`, {
      redirect: "error",
    });
    if (!response.ok) throw new SourceError(`Mirror node returned ${response.status} for NFT ${nft[1]}/${nft[2]}`);
    const metadata = decode(((await response.json()) as { metadata?: string }).metadata ?? "");
    if (!isConsensusTimestamp(metadata))
      throw new SourceError(`NFT metadata is not a Guardian message timestamp: ${metadata.slice(0, 64)}`);
    return metadata;
  }
  const txId = mirrorTransactionId(ref);
  if (txId) {
    const response = await sources.fetch(`${sources.mirrorNodeUrl}/api/v1/transactions/${txId}`, { redirect: "error" });
    if (!response.ok) throw new SourceError(`Mirror node returned ${response.status} for transaction ${ref}`);
    const tx = (
      (await response.json()) as { transactions?: { name?: string; memo_base64?: string; result?: string }[] }
    ).transactions?.[0];
    if (!tx || tx.name !== "TOKENMINT") throw new SourceError(`Transaction ${ref} is not a token mint`);
    if (tx.result && tx.result !== "SUCCESS")
      throw new SourceError(`Mint transaction ${ref} did not succeed (${tx.result})`);
    const memo = decode(tx.memo_base64 ?? "");
    if (!isConsensusTimestamp(memo))
      throw new SourceError(`Mint memo is not a Guardian message timestamp: ${memo.slice(0, 64)}`);
    return memo;
  }
  throw new SourceError("Expected a consensus timestamp, a transaction id, or nft:<tokenId>:<serial>");
}

function subjectsOf(vc: any): any[] {
  const s = vc?.credentialSubject;
  return Array.isArray(s) ? s : s ? [s] : [];
}

function issuerOf(doc: any): string | null {
  const issuer = doc?.issuer ?? doc?.proof?.verificationMethod?.split("#")[0];
  return typeof issuer === "string" ? issuer : typeof issuer?.id === "string" ? issuer.id : null;
}

export async function verifyGuardianEvidence(
  sources: GuardianSources,
  ref: string,
  options: EvidenceOptions,
): Promise<EvidenceResult> {
  const expected = new Set(options.expectedTopicIds.map(t => t.trim()).filter(Boolean));
  if (!expected.size) throw new SourceError("An expected Guardian policy or instance topic id is required");
  const maxDepth = Math.min(options.maxDepth ?? 3, 6);
  const maxDocuments = Math.min(options.maxDocuments ?? 25, 50);

  const timestamp = await resolveEvidenceTimestamp(sources, ref);
  const result: EvidenceResult = {
    accepted: false,
    refusals: [],
    notes: [],
    timestamp,
    topicId: null,
    cid: null,
    evidenceHash: null,
    chain: [],
    crossChecks: [],
  };

  const didCache = new Map<string, any>();
  const contextCache = new Map<string, any>();
  const documentLoader = buildDocumentLoader(remoteDidResolver(sources, didCache), async iri => {
    // Published schema contexts live on IPFS; dry-run "schema:" contexts exist only inside one Guardian instance.
    const match = /^ipfs:\/\/([A-Za-z0-9]+)$/.exec(iri);
    if (!match || !isCid(match[1])) return null;
    if (!contextCache.has(iri)) contextCache.set(iri, await fetchIpfsJson(sources, match[1]));
    return { documentUrl: iri, document: contextCache.get(iri) };
  });

  const seen = new Set<string>();
  const queue: { ts: string; depth: number }[] = [{ ts: timestamp, depth: 0 }];
  while (queue.length && result.chain.length < maxDocuments) {
    const { ts, depth } = queue.shift()!;
    if (seen.has(ts)) continue;
    seen.add(ts);

    const message = await fetchMessageByTimestamp(sources, ts);
    const entry: ChainEntry = {
      timestamp: ts,
      topicId: message.topicId,
      depth,
      issuers: [],
      schemaTypes: [],
      signature: "not-checked",
    };
    result.chain.push(entry);
    if (depth === 0) result.topicId = message.topicId;

    if (!expected.has(message.topicId)) {
      if (depth === 0)
        result.refusals.push(`Message ${ts} is on topic ${message.topicId}, not an expected policy topic`);
      else result.notes.push(`Relationship ${ts} is on topic ${message.topicId}; not followed`);
      continue;
    }

    let body: any;
    try {
      body = JSON.parse(message.text);
    } catch {
      result.refusals.push(`Message ${ts} is not a Guardian JSON message`);
      continue;
    }
    entry.type = body.type;
    entry.action = body.action;
    if (body.status !== "ISSUE") {
      result.refusals.push(`Message ${ts} has status ${body.status}, not ISSUE (revoked or deleted)`);
      continue;
    }
    if (body.type !== "VP-Document" && body.type !== "VC-Document") {
      if (depth === 0) result.refusals.push(`Message ${ts} is a ${body.type}, not a VC or VP document`);
      continue;
    }
    if (typeof body.cid !== "string" || !isCid(body.cid)) {
      result.refusals.push(`Message ${ts} has no valid IPFS cid`);
      continue;
    }
    entry.cid = body.cid;
    if (depth === 0) {
      result.cid = body.cid;
      result.evidenceHash = evidenceHash(message.consensusTimestamp, body.cid);
    }

    const document = await fetchIpfsJson(sources, body.cid);
    const vcs: any[] =
      body.type === "VP-Document"
        ? Array.isArray(document.verifiableCredential)
          ? document.verifiableCredential
          : [document.verifiableCredential].filter(Boolean)
        : [document];
    entry.issuers = [...new Set([issuerOf(document), ...vcs.map(issuerOf)].filter((x): x is string => !!x))];
    try {
      if (body.type === "VP-Document") await verifyGuardianPresentation(document, documentLoader);
      else await verifyGuardianCredential(document, documentLoader);
      entry.signature = "verified";
    } catch (error) {
      entry.signature = "invalid";
      entry.error = (error as Error).message;
      result.refusals.push(`Signature check failed for ${ts}: ${entry.error}`);
    }

    for (const vc of vcs) {
      for (const subject of subjectsOf(vc)) {
        const type = typeof subject?.type === "string" ? subject.type : "";
        if (type) entry.schemaTypes.push(type);
        if (MINT_TYPES.test(type)) {
          entry.mintToken = { tokenId: subject.tokenId, amount: subject.amount };
          result.refusals.push(
            `The chain contains a ${type.split("&")[0]} VC (token ${String(subject.tokenId)}, amount ${String(subject.amount)}): ` +
              "Guardian already minted these tonnes, so registry issuance would be double issuance",
          );
        } else if (REQUIRED_MR_FIELDS.every(k => subject?.[k] !== undefined)) {
          try {
            const outcome = crossCheckMonitoringReport(subject);
            result.crossChecks.push({
              vcId: String(vc.id ?? ""),
              decision: outcome.decision,
              deltaERg: String(outcome.deltaERg),
              notes: outcome.notes,
            });
            if (outcome.decision !== "MATCH") {
              result.refusals.push(
                `Monitoring Report ${String(vc.id ?? "")} cross-check: ${outcome.decision} (ΔER ${outcome.deltaERg} g)`,
              );
            }
          } catch (error) {
            if (!(error instanceof MappingError)) throw error;
            result.refusals.push(`Monitoring Report ${String(vc.id ?? "")} could not be mapped: ${error.message}`);
          }
        }
      }
    }

    if (depth < maxDepth && Array.isArray(body.relationships)) {
      for (const parent of body.relationships) {
        if (typeof parent === "string" && isConsensusTimestamp(parent)) queue.push({ ts: parent, depth: depth + 1 });
      }
    }
  }
  if (queue.length)
    result.notes.push(`Stopped after ${maxDocuments} documents; ${queue.length} relationships not followed`);
  if (!result.crossChecks.length)
    result.notes.push("No VMR0017 Monitoring Report in the walked chain; no figures were recomputed");

  result.accepted = result.refusals.length === 0 && result.chain.some(e => e.depth === 0 && e.signature === "verified");
  return result;
}
