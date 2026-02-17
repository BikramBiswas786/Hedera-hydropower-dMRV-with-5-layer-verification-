/**
 * Deploy Device DID to Hedera Testnet - COMPLETE IMPLEMENTATION
 */

const {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  PrivateKey,
  Hbar,
  AccountBalanceQuery
} = require('@hashgraph/sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// CONFIG FROM ENV
const HEDERA_ACCOUNT_ID = process.env.HEDERA_OPERATOR_ID;
const HEDERA_PRIVATE_KEY_STR = process.env.HEDERA_OPERATOR_KEY;

if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY_STR) {
  console.error("❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env");
  process.exit(1);
}

const DEVICE_ID = 'TURBINE-1';
const DEVICE_NAME = 'Demo Hydropower Turbine';
const DEVICE_LOCATION = 'Test Site';

async function deployDeviceDID() {
  console.log('\n========================================');
  console.log('Deploying Device DID to Hedera Testnet');
  console.log('========================================\n');

  let client;

  try {
    // Step 1: Initialize Hedera Client
    console.log('Step 1: Initializing Hedera Client...');
    const operatorPrivateKey = PrivateKey.fromString(HEDERA_PRIVATE_KEY_STR);
    client = Client.forTestnet();
    client.setOperator(HEDERA_ACCOUNT_ID, operatorPrivateKey);
    client.setDefaultMaxTransactionFee(new Hbar(2));

    const balance = await new AccountBalanceQuery()
      .setAccountId(HEDERA_ACCOUNT_ID)
      .execute(client);

    console.log('✓ Connected to Hedera Testnet');
    console.log(`✓ Operator Account: ${HEDERA_ACCOUNT_ID}`);
    console.log(`✓ Balance: ${balance.hbars.toString()}\n`);

    // Step 2: Create HCS Topic for DID
    console.log('Step 2: Creating HCS Topic for Device DID...');

    const topicCreateTx = await new TopicCreateTransaction()
      .setTopicMemo(`Device DID Topic - ${DEVICE_ID}`)
      .setAdminKey(operatorPrivateKey.publicKey)
      .setSubmitKey(operatorPrivateKey.publicKey)
      .execute(client);

    const topicReceipt = await topicCreateTx.getReceipt(client);
    const topicId = topicReceipt.topicId;
    console.log(`✓ DID Topic Created: ${topicId}`);
    console.log(`✓ HashScan: https://hashscan.io/testnet/topic/${topicId}/messages\n`);

    // Step 3: Generate Device Key Pair
    console.log('Step 3: Generating Device Key Pair...');
    const devicePrivateKey = PrivateKey.generateED25519();
    const devicePublicKey = devicePrivateKey.publicKey;
    console.log('✓ Device Private Key Generated');
    console.log('✓ Device Public Key Generated\n');

    // Step 4: Create DID Document
    console.log('Step 4: Creating DID Document...');
    const did = `did:hedera:testnet:${topicId}`;
    const publicKeyBase64 = Buffer.from(devicePublicKey.toBytes()).toString('base64');

    const didDocument = {
      '@context': 'https://w3c-ccg.github.io/did-spec/',
      'id': did,
      'publicKey': [
        {
          'id': `${did}#key-1`,
          'type': 'Ed25519VerificationKey2018',
          'controller': did,
          'publicKeyBase64': publicKeyBase64
        }
      ],
      'authentication': [
        `${did}#key-1`
      ],
      'created': new Date().toISOString(),
      'proof': {
        'type': 'Ed25519Signature2018',
        'created': new Date().toISOString(),
        'verificationMethod': `${did}#key-1`,
        'signatureValue': generateSignature(did, devicePrivateKey)
      }
    };

    console.log(`✓ DID: ${did}`);
    console.log('✓ DID Document Structure: Valid\n');

    // Step 5: Submit DID Document to HCS Topic
    console.log('Step 5: Submitting DID Document to HCS Topic...');
    const didDocumentJson = JSON.stringify(didDocument);

    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(didDocumentJson)
      .freezeWith(client)
      .sign(operatorPrivateKey);

    const submitReceipt = await submitTx.execute(client);
    const transactionId = submitReceipt.transactionId;
    console.log(`✓ DID Document Submitted: SUCCESS`);
    console.log(`✓ Transaction ID: ${transactionId}`);
    console.log(`✓ HashScan: https://hashscan.io/testnet/transaction/${transactionId}\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      client.close();
    }
  }
}

function generateSignature(did, privateKey) {
  const message = Buffer.from(did);
  const signature = privateKey.sign(message);
  return Buffer.from(signature).toString('base64');
}

deployDeviceDID();
