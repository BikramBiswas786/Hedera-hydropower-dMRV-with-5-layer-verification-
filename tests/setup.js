// Jest global setup for CI
jest.setTimeout(30000);

// Mock Hedera env vars if not set
if (!process.env.HEDERA_OPERATOR_ID)   process.env.HEDERA_OPERATOR_ID   = '0.0.12345';
if (!process.env.HEDERA_OPERATOR_KEY)  process.env.HEDERA_OPERATOR_KEY  = '302e020100300506032b657004220420' + '0'.repeat(64);
if (!process.env.HEDERA_NETWORK)       process.env.HEDERA_NETWORK       = 'testnet';
if (!process.env.HEDERA_TOPIC_ID)      process.env.HEDERA_TOPIC_ID      = '0.0.99999';
if (!process.env.HEDERA_TOKEN_ID)      process.env.HEDERA_TOKEN_ID      = '0.0.88888';
