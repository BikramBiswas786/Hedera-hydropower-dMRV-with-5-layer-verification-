// Jest global setup for CI
jest.setTimeout(30000);

// All Hedera env vars needed by engine-v1.js and workflow.js
process.env.NODE_ENV            = process.env.NODE_ENV            || 'test';
process.env.CI                  = 'true';
process.env.HEDERA_OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID  || '0.0.12345';
process.env.HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || '302e020100300506032b657004220420' + '0'.repeat(64);
process.env.HEDERA_ACCOUNT_ID   = process.env.HEDERA_ACCOUNT_ID   || '0.0.12345';
process.env.HEDERA_PRIVATE_KEY  = process.env.HEDERA_PRIVATE_KEY  || '302e020100300506032b657004220420' + '0'.repeat(64);
process.env.HEDERA_NETWORK      = process.env.HEDERA_NETWORK      || 'testnet';
process.env.HEDERA_TOPIC_ID     = process.env.HEDERA_TOPIC_ID     || '0.0.99999';
process.env.HEDERA_TOKEN_ID     = process.env.HEDERA_TOKEN_ID     || '0.0.88888';
process.env.AUDIT_TOPIC_ID      = process.env.AUDIT_TOPIC_ID      || '0.0.99999';
process.env.EF_GRID             = process.env.EF_GRID             || '0.8';
