import { MIRROR_NODE_URL } from "./network";
import { HCS_MAX_CHUNKS, base64ToBytes } from "./report";

type ChunkInfo = {
  initial_transaction_id: { account_id: string; transaction_valid_start: string; nonce: number };
  number: number;
  total: number;
};

export type MirrorTopicMessage = {
  message: string;
  consensus_timestamp: string;
  sequence_number: number;
  chunk_info?: ChunkInfo | null;
};

export class MirrorError extends Error {}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new MirrorError(`Mirror node returned ${response.status}`);
  return (await response.json()) as T;
}

export function fetchTopicMessage(topicId: string, sequence: number, fetchImpl: typeof fetch = fetch) {
  return getJson<MirrorTopicMessage>(`${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages/${sequence}`, fetchImpl);
}

const sameTransaction = (a: ChunkInfo, b: ChunkInfo) =>
  a.initial_transaction_id.account_id === b.initial_transaction_id.account_id &&
  a.initial_transaction_id.transaction_valid_start === b.initial_transaction_id.transaction_valid_start &&
  a.initial_transaction_id.nonce === b.initial_transaction_id.nonce;

/**
 * Reassembles an HCS message that starts at `sequence`. Chunks of one message share the initial transaction id
 * and carry their position, so they are matched by id and ordered by `number`, never by arrival order.
 */
export async function fetchChunkedMessage(
  topicId: string,
  sequence: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; consensusTimestamp: string }> {
  const first = await fetchTopicMessage(topicId, sequence, fetchImpl);
  const info = first.chunk_info;
  if (!info || info.total === 1)
    return { bytes: base64ToBytes(first.message), consensusTimestamp: first.consensus_timestamp };
  if (info.number !== 1)
    throw new MirrorError(`Sequence ${sequence} is chunk ${info.number} of a message, not its start`);

  // Other submitters' messages can interleave, so read a window wider than `total`.
  const { messages } = await getJson<{ messages: MirrorTopicMessage[] }>(
    `${MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages?sequencenumber=gte:${sequence}&order=asc&limit=${HCS_MAX_CHUNKS * 2}`,
    fetchImpl,
  );
  const chunks = messages
    .filter(m => m.chunk_info && sameTransaction(m.chunk_info, info))
    .sort((a, b) => a.chunk_info!.number - b.chunk_info!.number);
  if (chunks.length !== info.total) {
    throw new MirrorError(`Found ${chunks.length} of ${info.total} chunks for the message at sequence ${sequence}`);
  }

  const parts = chunks.map(chunk => base64ToBytes(chunk.message));
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, consensusTimestamp: chunks[chunks.length - 1].consensus_timestamp };
}
