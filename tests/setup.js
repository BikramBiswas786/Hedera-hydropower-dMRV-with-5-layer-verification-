// tests/setup.js - Dual-mode: Real Hedera OR Mock fallback
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// REAL HEDERA MODE (when USE_REAL_HEDERA=true AND credentials exist)
// ═══════════════════════════════════════════════════════════════
const hasRealCredentials = 
  process.env.HEDERA_OPERATOR_ID && 
  process.env.HEDERA_OPERATOR_ID !== '0.0.12345' &&
  process.env.HEDERA_OPERATOR_KEY &&
  process.env.HEDERA_OPERATOR_KEY.length > 64;

const useRealHedera = 
  process.env.USE_REAL_HEDERA === 'true' && 
  hasRealCredentials;

if (useRealHedera) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔗 REAL HEDERA TESTNET MODE                                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`   Account:       ${process.env.HEDERA_OPERATOR_ID}`);
  console.log(`   Network:       ${process.env.HEDERA_NETWORK || 'testnet'}`);
  console.log(`   Audit Topic:   ${process.env.AUDIT_TOPIC_ID || 'N/A'}`);
  console.log(`   DID Topic:     ${process.env.DID_TOPIC_ID || 'N/A'}`);
  console.log(`   Carbon Token:  ${process.env.CARBON_TOKEN_ID || 'N/A'}`);
  console.log(`   REC NFT:       ${process.env.REC_TOKEN_ID || 'N/A'}`);
  console.log(`   Verify Topic:  ${process.env.VERIFY_TOPIC_ID || 'N/A'}`);
  console.log('   ⚠️  WARNING: Tests will execute REAL transactions on Hedera Testnet\n');
  
  // Bypass all mocks
  jest.unmock('@hashgraph/sdk');
  jest.unmock('../src/ml/MLAnomalyDetector');
  
  // Real network calls need more time
  jest.setTimeout(60000); // 60s for on-chain consensus
  
} else {
  // ═══════════════════════════════════════════════════════════════
  // MOCK MODE (CI or local without credentials)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📝 MOCK MODE (Simulated Hedera)                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('   Using mock SDK from tests/__mocks__/@hashgraph/sdk.js\n');
  
  // Set mock environment variables (for CI and local dev without .env)
  process.env.NODE_ENV            = process.env.NODE_ENV            || 'test';
  process.env.CI                  = process.env.CI                  || 'true';
  process.env.HEDERA_OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID  || '0.0.12345';
  process.env.HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || '302e020100300506032b657004220420' + '0'.repeat(64);
  process.env.HEDERA_ACCOUNT_ID   = process.env.HEDERA_ACCOUNT_ID   || '0.0.12345';
  process.env.HEDERA_PRIVATE_KEY  = process.env.HEDERA_PRIVATE_KEY  || '302e020100300506032b657004220420' + '0'.repeat(64);
  process.env.HEDERA_NETWORK      = process.env.HEDERA_NETWORK      || 'testnet';
  process.env.HEDERA_TOPIC_ID     = process.env.HEDERA_TOPIC_ID     || '0.0.99999';
  process.env.HEDERA_TOKEN_ID     = process.env.HEDERA_TOKEN_ID     || '0.0.88888';
  process.env.AUDIT_TOPIC_ID      = process.env.AUDIT_TOPIC_ID      || '0.0.99999';
  process.env.DID_TOPIC_ID        = process.env.DID_TOPIC_ID        || '0.0.99998';
  process.env.CARBON_TOKEN_ID     = process.env.CARBON_TOKEN_ID     || '0.0.77777';
  process.env.REC_TOKEN_ID        = process.env.REC_TOKEN_ID        || '0.0.66666';
  process.env.VERIFY_TOPIC_ID     = process.env.VERIFY_TOPIC_ID     || '0.0.55555';
  process.env.EF_GRID             = process.env.EF_GRID             || '0.82';
  process.env.USE_REAL_HEDERA     = 'false';
  
  jest.setTimeout(30000); // 30s for mock operations
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL TEST UTILITIES
// ═══════════════════════════════════════════════════════════════
global.console = {
  ...console,
  // Suppress noisy logs during tests (keep error/warn for debugging)
  log: process.env.VERBOSE_TESTS === 'true' ? console.log : jest.fn(),
  debug: jest.fn(),
};

// Test helper: Wait for Hedera consensus (real mode only)
global.waitForConsensus = async (ms = 3000) => {
  if (useRealHedera) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Test helper: Check if running in real mode
global.isRealHederaMode = () => useRealHedera;

// Export for other test files
module.exports = {
  useRealHedera,
  hasRealCredentials,
};
