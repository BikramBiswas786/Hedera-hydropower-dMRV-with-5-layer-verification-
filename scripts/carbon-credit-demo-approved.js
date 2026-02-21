/**
 * Complete Carbon Credit Workflow Demo - WITH APPROVED TELEMETRY
 * 
 * This script demonstrates the entire carbon credit lifecycle with pre-approved data:
 * 1. Use APPROVED attestation (bypass ML check)
 * 2. Calculate carbon credits
 * 3. Mint Hedera tokens
 * 4. Register with Verra/Gold Standard
 * 5. List on marketplace
 * 
 * Run: node scripts/carbon-credit-demo-approved.js
 */

require('dotenv').config();
const { Client, AccountId, PrivateKey } = require('@hashgraph/sdk');
const { CarbonCreditManager } = require('../src/carbon-credits/CarbonCreditManager');
const { VerraIntegration } = require('../src/carbon-credits/VerraIntegration');
const { GoldStandardIntegration } = require('../src/carbon-credits/GoldStandardIntegration');
const { CarbonMarketplace } = require('../src/carbon-credits/CarbonMarketplace');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log('cyan', `  ${title}`);
  console.log('='.repeat(60) + '\n');
}

function initializeHederaClient() {
  if (process.env.USE_REAL_HEDERA !== 'true') {
    log('yellow', '📝 Mock mode - set USE_REAL_HEDERA=true for real blockchain minting');
    return null;
  }

  try {
    const operatorId = process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;
    const network = process.env.HEDERA_NETWORK || 'testnet';

    if (!operatorId || !operatorKey) {
      log('red', '❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env');
      return null;
    }

    let client;
    if (network === 'mainnet') {
      client = Client.forMainnet();
    } else {
      client = Client.forTestnet();
    }

    client.setOperator(
      AccountId.fromString(operatorId),
      PrivateKey.fromString(operatorKey)
    );

    log('green', `✅ Hedera client initialized (${network})`);
    log('magenta', '🔥 REAL ON-CHAIN MINTING ENABLED!');
    log('cyan', `📊 Token: ${process.env.CARBON_TOKEN_ID}`);
    log('cyan', `👤 Operator: ${operatorId}`);
    
    return client;
  } catch (error) {
    log('red', `❌ Failed to initialize Hedera client: ${error.message}`);
    return null;
  }
}

async function runDemo() {
  section('CARBON CREDIT WORKFLOW DEMO');
  log('yellow', 'Using PRE-APPROVED attestation (bypassing ML verification)');

  // Initialize Hedera client
  const hederaClient = initializeHederaClient();

  // STEP 1: Create APPROVED attestation
  section('STEP 1: Create APPROVED Attestation');
  const attestation = {
    verificationStatus: 'APPROVED',
    trustScore: 0.96,
    calculations: {
      ER_tCO2: 150.5,
      EG_kwh: 1250,
      EF_grid: 0.8
    },
    verificationMethod: 'AI_AUTO_APPROVED',
    timestamp: new Date().toISOString(),
    checks: {
      statistical: { status: 'PASS' },
      ml: { status: 'PASS', confidence: 0.96 },
      compliance: { status: 'PASS' }
    }
  };
  log('green', '✅ Attestation created with APPROVED status');
  console.log(JSON.stringify(attestation, null, 2));

  // STEP 2: Calculate Carbon Credits
  section('STEP 2: Calculate Carbon Credits');
  const manager = new CarbonCreditManager(hederaClient, {
    tokenId: process.env.CARBON_TOKEN_ID,
    treasuryKey: process.env.TREASURY_PRIVATE_KEY
  });
  const creditCalc = manager.calculateCredits(attestation);
  log('green', '✅ Carbon credits calculated:');
  console.log(JSON.stringify(creditCalc, null, 2));

  if (!creditCalc.eligible) {
    log('red', '❌ Telemetry not eligible for carbon credits');
    return;
  }

  // STEP 3: Mint Hedera Tokens
  section('STEP 3: Mint Hedera HTS Tokens');
  const mintResult = await manager.mintCredits(
    'TENANT-001',
    creditCalc.adjusted_credits_tco2e,
    {
      plant_id: 'PLANT-001',
      device_id: 'TURBINE-001',
      trust_score: attestation.trustScore,
      verification_method: attestation.verificationMethod
    }
  );
  log('green', '✅ Tokens minted:');
  console.log(JSON.stringify(mintResult, null, 2));

  if (mintResult.status === 'minted' && process.env.USE_REAL_HEDERA === 'true') {
    log('magenta', '\n🎉 REAL HEDERA TRANSACTION EXECUTED!');
    log('green', `✅ Transaction ID: ${mintResult.hedera_transaction_id}`);
    log('cyan', `🔗 View on HashScan: https://hashscan.io/testnet/transaction/${mintResult.hedera_transaction_id}`);
    log('cyan', `🪙 Token: https://hashscan.io/testnet/token/${process.env.CARBON_TOKEN_ID}`);
  } else if (mintResult.status === 'minted_mock') {
    log('yellow', '\n⚠️  Mock mode - add USE_REAL_HEDERA=true to .env for real minting');
  }

  const creditId = mintResult.credit_id;
  const credit = manager.getCredit(creditId);

  // STEP 4: Register with Verra
  section('STEP 4: Register with Verra');
  const verra = new VerraIntegration();
  const verraCert = await verra.registerCredit(credit);
  log('green', '✅ Verra registration:');
  console.log(JSON.stringify(verraCert, null, 2));
  manager.updateCreditStatus(creditId, 'registered_verra', verraCert);

  // STEP 5: Register with Gold Standard
  section('STEP 5: Register with Gold Standard');
  const goldStandard = new GoldStandardIntegration();
  const gsCert = await goldStandard.registerCredit(credit);
  log('green', '✅ Gold Standard registration:');
  console.log(JSON.stringify(gsCert, null, 2));

  // STEP 6: Get Market Prices
  section('STEP 6: Check Market Prices');
  const marketplace = new CarbonMarketplace(verra, goldStandard);
  const prices = await marketplace.getMarketPrices();
  log('green', '✅ Current market prices:');
  console.log(JSON.stringify(prices, null, 2));

  // STEP 7: Calculate ESG Premium
  section('STEP 7: Calculate ESG Premium Pricing');
  const premium = marketplace.calculateESGPremium(credit, { esg_focused: true });
  log('green', '✅ ESG premium pricing:');
  console.log(JSON.stringify(premium, null, 2));

  // STEP 8: List on Marketplace
  section('STEP 8: Create Sell Order on Marketplace');
  const sellOrder = await marketplace.createSellOrder(
    'TENANT-001',
    creditId,
    creditCalc.adjusted_credits_tco2e,
    premium.final_price_usd
  );
  log('green', '✅ Sell order created:');
  console.log(JSON.stringify(sellOrder, null, 2));

  // STEP 9: View Inventory
  section('STEP 9: View Tenant Inventory');
  const inventory = manager.getTenantInventory('TENANT-001');
  log('green', '✅ Current inventory:');
  console.log(JSON.stringify(inventory, null, 2));

  // Summary
  section('WORKFLOW COMPLETE');
  log('magenta', '📊 SUMMARY:');
  console.log(`Attestation: ${attestation.verificationStatus}`);
  console.log(`Trust Score: ${attestation.trustScore}`);
  console.log(`Carbon Credits: ${creditCalc.adjusted_credits_tco2e} tCO2e`);
  console.log(`Token Amount: ${mintResult.token_amount} tokens`);
  console.log(`Verra Cert: ${verraCert.verra_certificate_id}`);
  console.log(`GS Cert: ${gsCert.gs_certificate_id}`);
  console.log(`Market Price: $${premium.final_price_usd}/tCO2e`);
  console.log(`Total Value: $${sellOrder.order.total_value_usd} USD`);
  console.log(`Total Value: ₹${sellOrder.order.total_value_inr} INR`);
  
  if (mintResult.status === 'minted' && process.env.USE_REAL_HEDERA === 'true') {
    log('green', '\n✅ Complete carbon credit lifecycle with REAL Hedera minting!');
    log('cyan', `🔗 View transaction: https://hashscan.io/testnet/transaction/${mintResult.hedera_transaction_id}`);
    log('cyan', `🪙 View token: https://hashscan.io/testnet/token/${process.env.CARBON_TOKEN_ID}`);
  } else {
    log('green', '\n✅ Complete carbon credit lifecycle executed successfully!');
    log('yellow', '💡 To enable real Hedera minting, add USE_REAL_HEDERA=true to .env');
  }

  // Close client
  if (hederaClient) {
    hederaClient.close();
  }
}

if (require.main === module) {
  runDemo().catch(error => {
    log('red', `\n❌ Demo failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runDemo };