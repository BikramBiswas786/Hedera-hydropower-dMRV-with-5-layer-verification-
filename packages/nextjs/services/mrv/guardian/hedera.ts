import { parseHederaDid } from "./did";
import type { Resolver } from "./vc";

/**
 * Read-only access to the two places Guardian keeps its trust chain: HCS messages on the mirror node and documents
 * on IPFS (fetched through a public gateway, as Guardian's worker does with IPFS_PUBLIC_GATEWAY). Nothing here
 * signs or submits anything.
 */

export type GuardianSources = {
  mirrorNodeUrl: string;
  /** Template with `{cid}`, Guardian's IPFS_PUBLIC_GATEWAY convention, e.g. https://ipfs.io/ipfs/{cid}. */
  ipfsGateway: string;
  fetch: typeof fetch;
};

export class SourceError extends Error {}

const TIMESTAMP = /^\d{1,12}\.\d{1,9}$/;
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/;
const MAX_IPFS_BYTES = 5 * 1024 * 1024;
const MAX_TOPIC_PAGES = 20;

export const isConsensusTimestamp = (value: string) => TIMESTAMP.test(value);
export const isCid = (value: string) => CID.test(value);

type ChunkInfo = {
  initial_transaction_id: { account_id: string; transaction_valid_start: string; nonce?: number };
  number: number;
  total: number;
};
type MirrorMessage = {
  consensus_timestamp: string;
  topic_id: string;
  sequence_number: number;
  message: string;
  chunk_info?: ChunkInfo | null;
};

async function getJson<T>(sources: GuardianSources, path: string): Promise<T> {
  const response = await sources.fetch(`${sources.mirrorNodeUrl.replace(/\/$/, "")}${path}`, {
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) throw new SourceError(`Mirror node returned ${response.status} for ${path}`);
  return (await response.json()) as T;
}

const sameTx = (a: ChunkInfo, b: ChunkInfo) =>
  a.initial_transaction_id.account_id === b.initial_transaction_id.account_id &&
  a.initial_transaction_id.transaction_valid_start === b.initial_transaction_id.transaction_valid_start &&
  (a.initial_transaction_id.nonce ?? 0) === (b.initial_transaction_id.nonce ?? 0);

export type HcsMessage = { topicId: string; sequence: number; consensusTimestamp: string; text: string };

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
    text: Buffer.concat(chunks.map(c => Buffer.from(c.message, "base64"))).toString("utf8"),
  };
}

/** Every message on a topic, oldest first (single-chunk messages, as DID documents are), capped at 20 pages. */
export async function fetchTopicMessages(sources: GuardianSources, topicId: string): Promise<string[]> {
  if (!/^\d+\.\d+\.\d+$/.test(topicId)) throw new SourceError(`Invalid topic id ${topicId}`);
  const texts: string[] = [];
  let path: string | null = `/api/v1/topics/${topicId}/messages?order=asc&limit=100`;
  for (let page = 0; path && page < MAX_TOPIC_PAGES; page++) {
    const body: { messages: MirrorMessage[]; links?: { next?: string | null } } = await getJson(sources, path);
    for (const m of body.messages) texts.push(Buffer.from(m.message, "base64").toString("utf8"));
    const next = body.links?.next ?? null;
    path = next && next.startsWith("/api/v1/topics/") ? next : null;
  }
  return texts;
}

export async function fetchIpfsJson(sources: GuardianSources, cid: string): Promise<any> {
  if (!isCid(cid)) throw new SourceError(`Not an IPFS CID: ${cid}`);
  const url = sources.ipfsGateway.replace("${cid}", cid).replace("{cid}", cid);
  const response = await sources.fetch(url, { redirect: "follow" });
  if (!response.ok) throw new SourceError(`IPFS gateway returned ${response.status} for ${cid}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IPFS_BYTES) throw new SourceError(`IPFS document ${cid} is larger than 5 MB`);
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
export function remoteDidResolver(sources: GuardianSources, cache = new Map<string, any>()): Resolver {
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
