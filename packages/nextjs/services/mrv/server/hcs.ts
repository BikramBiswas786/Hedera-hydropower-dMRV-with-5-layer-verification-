import { HEDERA_NETWORK } from "../network";
import { HCS_MAX_CHUNKS } from "../report";
import type { OperatorConfig } from "./config";
import { Client, TopicCreateTransaction, TopicId, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

export type HcsReceipt = {
  topicId: string;
  topicNum: bigint;
  sequenceNumber: bigint;
  transactionId: string;
};

function clientFor(operator: OperatorConfig): Client {
  const client = HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  return client.setOperator(operator.accountId, operator.privateKey);
}

/**
 * Creates the audit topic. The operator key is the submit key, so only the verifier can append reports while
 * anyone can read them from the mirror node.
 */
export async function createAuditTopic(operator: OperatorConfig): Promise<string> {
  const client = clientFor(operator);
  try {
    const response = await new TopicCreateTransaction()
      .setTopicMemo("hydro-dmrv verification reports")
      .setSubmitKey(operator.privateKey.publicKey)
      .setAdminKey(operator.privateKey.publicKey)
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.topicId) throw new Error("Topic creation returned no topic id");
    return receipt.topicId.toString();
  } finally {
    client.close();
  }
}

/**
 * Publishes a message, splitting it into HCS chunks when it exceeds 1024 bytes. Returns the sequence number of the
 * first chunk, which is how readers locate the message on the mirror node. Waits for every chunk's receipt so the
 * next message is ordered after this one.
 */
export async function publishMessage(operator: OperatorConfig, message: string): Promise<HcsReceipt> {
  if (!operator.topicId) throw new Error("HCS_TOPIC_ID is not set. Run `yarn mrv:create-topic` first.");
  const topicId = TopicId.fromString(operator.topicId);
  const client = clientFor(operator);
  try {
    const responses = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .setMaxChunks(HCS_MAX_CHUNKS)
      .executeAll(client);
    const receipts = await Promise.all(responses.map(response => response.getReceipt(client)));
    const first = receipts[0].topicSequenceNumber;
    if (first === null) throw new Error("HCS receipt has no sequence number");
    return {
      topicId: topicId.toString(),
      topicNum: BigInt(topicId.num.toString()),
      sequenceNumber: BigInt(first.toString()),
      transactionId: responses[0].transactionId.toString(),
    };
  } finally {
    client.close();
  }
}
