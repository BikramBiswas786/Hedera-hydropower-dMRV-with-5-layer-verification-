import { HEDERA_NETWORK } from "../network";
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

export async function publishReport(operator: OperatorConfig, message: string): Promise<HcsReceipt> {
  if (!operator.topicId) throw new Error("HCS_TOPIC_ID is not set. Run `yarn mrv:create-topic` first.");
  const topicId = TopicId.fromString(operator.topicId);
  const client = clientFor(operator);
  try {
    const response = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.topicSequenceNumber === null) throw new Error("HCS receipt has no sequence number");
    return {
      topicId: topicId.toString(),
      topicNum: BigInt(topicId.num.toString()),
      sequenceNumber: BigInt(receipt.topicSequenceNumber.toString()),
      transactionId: response.transactionId.toString(),
    };
  } finally {
    client.close();
  }
}
