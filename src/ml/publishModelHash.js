'use strict';

/**
 * Publish ML Model Hash to Hedera HCS
 * ────────────────────────────────────
 * Creates immutable audit trail of ML model versions on Hedera
 * Consensus Service (HCS).
 *
 * Each model hash is timestamped and cryptographically verifiable.
 * Auditors can prove which exact model version was used for any
 * attestation by comparing hashes.
 */

const {
  Client,
  TopicMessageSubmitTransaction
} = require('@hashgraph/sdk');

/**
 * Publish model hash to Hedera HCS.
 * @param {string} modelHash - SHA-256 hash (e.g., 'sha256:abc123...')
 * @param {object} metadata - Additional model metadata
 * @param {object} options - Override topic ID, client
 * @returns {Promise<{ transactionId, topicId, sequenceNumber, timestamp }>}
 */
async function publishModelHash(modelHash, metadata = {}, options = {}) {
  if (!modelHash || !modelHash.startsWith('sha256:')) {
    throw new Error('[publishModelHash] Invalid hash format. Expected sha256:...');
  }

  let client = options.client;
  let closeClient = false;

  // Initialize client if not provided
  if (!client) {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      console.warn(
        '[publishModelHash] HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY not set. ' +
        'Returning mock response.'
      );
      return {
        success: false,
        mock: true,
        transactionId: `MOCK-${Date.now()}`,
        topicId: process.env.AUDIT_TOPIC_ID || '0.0.MOCK',
        sequenceNumber: null,
        timestamp: new Date().toISOString(),
        modelHash,
        metadata
      };
    }

    client = Client.forTestnet();
    client.setOperator(accountId, privateKey);
    closeClient = true;
  }

  const topicId = options.topicId || process.env.AUDIT_TOPIC_ID || process.env.HCS_TOPIC_ID;
  if (!topicId) {
    throw new Error(
      '[publishModelHash] No topic ID provided. Set AUDIT_TOPIC_ID or HCS_TOPIC_ID env var.'
    );
  }

  try {
    // Build HCS message
    const message = JSON.stringify({
      type: 'ML_MODEL_HASH',
      modelHash,
      algorithm: 'IsolationForest',
      trainedOn: metadata.trainedOn || null,
      trainedAt: metadata.trainedAt || new Date().toISOString(),
      metrics: metadata.metrics || {},
      features: metadata.features || [],
      publisher: process.env.HEDERA_ACCOUNT_ID || 'unknown',
      timestamp: new Date().toISOString()
    });

    console.log(`[publishModelHash] Publishing to HCS topic ${topicId}...`);

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    const result = {
      success: true,
      transactionId: txResponse.transactionId.toString(),
      topicId: topicId.toString(),
      sequenceNumber: receipt.topicSequenceNumber?.toString() || null,
      timestamp: new Date().toISOString(),
      modelHash,
      metadata
    };

    console.log(
      `[publishModelHash] ✅ Published to HCS: ${result.transactionId} ` +
      `(sequence: ${result.sequenceNumber})`
    );

    return result;
  } catch (error) {
    console.error('[publishModelHash] Failed:', error.message);
    throw error;
  } finally {
    if (closeClient && client) {
      client.close();
    }
  }
}

/**
 * Verify a model hash exists in HCS (query topic messages).
 * Note: Requires HCS mirror node API or topic subscription.
 * This is a placeholder for future implementation.
 */
async function verifyModelHash(modelHash, topicId) {
  // TODO: Implement mirror node query
  console.warn('[verifyModelHash] Not yet implemented. Use Hedera mirror node API.');
  return {
    verified: null,
    message: 'Verification requires mirror node query'
  };
}

module.exports = { publishModelHash, verifyModelHash };
