import { fetchUpstream, isUpstreamTimeout, upstreamTimeoutMs } from "../upstream";
import { parseHederaDid } from "./did";
import { CidError, readVerifiedFile } from "./ipfs";
import type { Resolver } from "./vc";

/**
 * Read-only access to the two places Guardian keeps its trust chain: HCS messages on the mirror node and documents
 * on IPFS (fetched through a public gateway, as Guardian's worker does with IPFS_PUBLIC_GATEWAY, but as raw blocks
 * checked against the CID, so the gateway is not trusted). Nothing here signs or submits anything.
 */

export type GuardianSources = {
  mirrorNodeUrl: string;
  /** Template with `{cid}` (Guardian's IPFS_PUBLIC_GATEWAY convention), or several separated by commas. */
  ipfsGateway: string;
  fetch: typeof fetch;
  /**
   * Per-gateway wait for one block. A document nobody provides makes public gateways hang for about 40 s before a
   * 504; past this the next gateway is tried, and the read ends as unreadable (a trace reads `incomplete`).
   */
  ipfsTimeoutMs?: number;
};

const TIMESTAMP = /^\d{1,12}\.\d{1,9}$/;
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/;
const MAX_IPFS_BYTES = 5 * 1024 * 1024;
const MAX_TOPIC_PAGES = 20;

export class SourceError extends Error {}

export const isConsensusTimestamp = (value: string) => TIMESTAMP.test(value);
export const isCid = (value: string) => CID.test(value);

type ChunkInfo = {
  initial_transaction_id: { account_id: string; transaction_valid_start: string; nonce?: number };
  number: number;
  total: number;
};
type MirrorMessage = {
  consensus_timestamp: string;
  payer_account_id?: string;
  topic_id: string;
  sequence_number: number;
  message: string;
  chunk_info?: ChunkInfo | null;
};

async function getJson<T>(sources: GuardianSources, path: string): Promise<T> {
  const url = `${sources.mirrorNodeUrl.replace(/\/$/, "")}${path}`;
  let response: Response;
  try {
    response = await fetchUpstream(sources.fetch, url, {
      headers: { accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    if (isUpstreamTimeout(error)) throw new SourceError(`Mirror node timed out for ${path}`);
    throw error;
  }
  if (!response.ok) throw new SourceError(`Mirror node returned ${response.status} for ${path}`);
  return (await response.json()) as T;
}

const sameTx = (a: ChunkInfo, b: ChunkInfo) =>
  a.initial_transaction_id.account_id === b.initial_transaction_id.account_id &&
  a.initial_transaction_id.transaction_valid_start === b.initial_transaction_id.transaction_valid_start &&
  (a.initial_transaction_id.nonce ?? 0) === (b.initial_transaction_id.nonce ?? 0);

export type HcsMessage = {
  topicId: string;
  sequence: number;
  consensusTimestamp: string;
  /** The account that paid for (and so signed) the submit transaction. */
  payerAccountId: string | null;
  text: string;
};

/** One HCS message by consensus timestamp, reassembled from its chunks (matched by initial transaction id). */
export async function fetchMessageByTimestamp(sources: GuardianSources, timestamp: string): Promise<HcsMessage> {
  if (!isConsensusTimestamp(timestamp)) throw new SourceError(`Not a consensus timestamp: ${timestamp}`);
  const message = await getJson<MirrorMessage>(sources, `/api/v1/topics/messages/${timestamp}`);
  const info = message.chunk_info;
  if (!info || info.total <= 1) {
    return {
      topicId: message.topic_id,
      sequence: message.sequence_number,
      consensusTimestamp: message.consensus_timestamp,
      payerAccountId: message.payer_account_id ?? null,
      text: Buffer.from(message.message, "base64").toString("utf8"),
    };
  }
  const from = Math.max(1, message.sequence_number - (info.number - 1) - 20);
  const { messages } = await getJson<{ messages: MirrorMessage[] }>(
    sources,
    `/api/v1/topics/${message.topic_id}/messages?sequencenumber=gte:${from}&order=asc&limit=100`,
  );
  const chunks = messages
    .filter(m => m.chunk_info && sameTx(m.chunk_info, info))
    .sort((a, b) => a.chunk_info!.number - b.chunk_info!.number);
  if (chunks.length !== info.total)
    throw new SourceError(`Found ${chunks.length} of ${info.total} chunks for ${timestamp}`);
  return {
    topicId: message.topic_id,
    sequence: chunks[0].sequence_number,
    consensusTimestamp: chunks[0].consensus_timestamp,
    payerAccountId: chunks[0].payer_account_id ?? null,
    text: Buffer.concat(chunks.map(c => Buffer.from(c.message, "base64"))).toString("utf8"),
  };
}

export type TopicEntry = { text: string; payerAccountId: string | null };

/** Every message on a topic with its payer, oldest first (single-chunk messages, as DID documents are), ≤ 20 pages. */
export async function fetchTopicEntries(sources: GuardianSources, topicId: string): Promise<TopicEntry[]> {
  if (!/^\d+\.\d+\.\d+$/.test(topicId)) throw new SourceError(`Invalid topic id ${topicId}`);
  const entries: TopicEntry[] = [];
  let path: string | null = `/api/v1/topics/${topicId}/messages?order=asc&limit=100`;
  for (let page = 0; path && page < MAX_TOPIC_PAGES; page++) {
    const body: { messages: MirrorMessage[]; links?: { next?: string | null } } = await getJson(sources, path);
    for (const m of body.messages) {
      entries.push({
        text: Buffer.from(m.message, "base64").toString("utf8"),
        payerAccountId: m.payer_account_id ?? null,
      });
    }
    const next = body.links?.next ?? null;
    path = next && next.startsWith("/api/v1/topics/") ? next : null;
  }
  return entries;
}

/** Every message text on a topic, oldest first. */
export async function fetchTopicMessages(sources: GuardianSources, topicId: string): Promise<string[]> {
  return (await fetchTopicEntries(sources, topicId)).map(e => e.text);
}

/**
 * One raw block (trustless gateway spec). `ipfsGateway` may list several templates separated by commas; each is tried
 * in turn, which is safe because the caller hashes whatever comes back against the CID.
 */
async function fetchBlock(sources: GuardianSources, cid: string): Promise<Uint8Array> {
  const failures: string[] = [];
  for (const template of sources.ipfsGateway
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)) {
    const url = template.replace("${cid}", cid).replace("{cid}", cid);
    try {
      const response = await sources.fetch(`${url}${url.includes("?") ? "&" : "?"}format=raw`, {
        headers: { accept: "application/vnd.ipld.raw" },
        redirect: "follow",
        signal: AbortSignal.timeout(sources.ipfsTimeoutMs ?? upstreamTimeoutMs()),
      });
      if (!response.ok) {
        failures.push(`${new URL(url).host} ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_IPFS_BYTES) throw new SourceError(`IPFS block ${cid} is larger than 5 MB`);
      return buffer;
    } catch (error) {
      if (error instanceof SourceError) throw error;
      const host = template.split("/")[2] ?? template;
      failures.push((error as Error)?.name === "TimeoutError" ? `${host} timed out` : `${host} unreachable`);
    }
  }
  throw new SourceError(`IPFS gateways could not serve ${cid} (${failures.join(", ")})`);
}

/** A JSON document from IPFS whose bytes were checked against its CID. */
export async function fetchIpfsJson(sources: GuardianSources, cid: string): Promise<unknown> {
  if (!isCid(cid)) throw new SourceError(`Not an IPFS CID: ${cid}`);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await readVerifiedFile(cid, block => fetchBlock(sources, block), MAX_IPFS_BYTES));
  } catch (error) {
    if (error instanceof CidError) throw new SourceError(error.message);
    throw error;
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new SourceError(`IPFS document ${cid} is not JSON`);
  }
}

/**
 * Port of Guardian's RemoteDidLoader (common/src/document-loader/remote-did-loader.ts at 3.7.0): read the DID's
 * topic, take the first `DID-Document` message whose `did` is the controller, fetch its `cid` from IPFS.
 */
export function remoteDidResolver(sources: GuardianSources, cache = new Map<string, unknown>()): Resolver {
  return async (iri: string) => {
    if (!iri.startsWith("did:hedera:")) return null;
    const parsed = parseHederaDid(iri);
    if (!parsed) return null;
    let document = cache.get(parsed.did);
    if (!document) {
      const messages = await fetchTopicMessages(sources, parsed.topicId);
      const didMessage = messages
        .map(text => {
          try {
            return JSON.parse(text);
          } catch {
            return undefined;
          }
        })
        .find(m => m && m.type === "DID-Document" && m.did === parsed.did);
      if (!didMessage) return null;
      document = await fetchIpfsJson(sources, didMessage.cid);
      cache.set(parsed.did, document);
    }
    return { documentUrl: iri, document };
  };
}

/** Serves known DID documents (our own bridge DID) without touching the network. */
export function localDidResolver(documents: Record<string, unknown>): Resolver {
  return async (iri: string) => {
    const did = iri.split("#")[0];
    return did in documents ? { documentUrl: iri, document: documents[did] } : null;
  };
}
