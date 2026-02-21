/**
 * Complete Carbon Credit Workflow Demo
 * 
 * This script demonstrates the entire carbon credit lifecycle:
 * 1. Generate telemetry from turbine
 * 2. Verify with Engine V1
 * 3. Calculate carbon credits
 * 4. Mint Hedera tokens
 * 5. Register with Verra/Gold Standard
 * 6. List on marketplace
 * 
 * Run: node scripts/carbon-credit-demo.js
 */

const { EngineV1 } = require('../src/engine/v1/engine-v1');
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

async function runDemo() {
  section('CARBON CREDIT WORKFLOW DEMO');

  // STEP 1: Generate Telemetry
  section('STEP 1: Generate Turbine Telemetry');
  const telemetry = {
    deviceId: 'TURBINE-001',
    timestamp: new Date().toISOString(),
    readings: {
      flowRate_m3_per_s: 2.5,
      headHeight_m: 45,
      generatedKwh: 156,
      pH: 7.2,
      turbidity_ntu: 10,
      temperature_celsius: 18,
      efficiency: 0.85
    }
  };
  log('green', '✅ Telemetry generated:');
  console.log(JSON.stringify(telemetry, null, 2));

  // STEP 2: Verify with Engine V1
  section('STEP 2: Verify with Engine V1 (AI Guardian)');
  const engine = new EngineV1();
  const verification = await engine.verifyAndPublish(telemetry);
  log('green', '✅ Verification complete:');
  console.log('Decision:', verification.attestation.verificationStatus);
  console.log('Trust Score:', verification.attestation.trustScore);
  console.log('ML Status:', verification.attestation.checks.statistical.status);
  console.log('ER (tCO2):', verification.attestation.calculations.ER_tCO2);

  // STEP 3: Calculate Carbon Credits
  section('STEP 3: Calculate Carbon Credits');
  const manager = new CarbonCreditManager(null);
  const creditCalc = manager.calculateCredits(verification.attestation);
  log('green', '✅ Carbon credits calculated:');
  console.log(JSON.stringify(creditCalc, null, 2));

  if (!creditCalc.eligible) {
    log('red', '❌ Telemetry not eligible for carbon credits');
    return;
  }

  // STEP 4: Mint Hedera Tokens
  section('STEP 4: Mint Hedera HTS Tokens');
  const mintResult = await manager.mintCredits(
    'TENANT-001',
    creditCalc.adjusted_credits_tco2e,
    {
      plant_id: 'PLANT-001',
      device_id: telemetry.deviceId,
      trust_score: verification.attestation.trustScore,
      verification_method: verification.attestation.verificationMethod
    }
  );
  log('green', '✅ Tokens minted:');
  console.log(JSON.stringify(mintResult, null, 2));

  const creditId = mintResult.credit_id;
  const credit = manager.getCredit(creditId);

  // STEP 5: Register with Verra
  section('STEP 5: Register with Verra');
  const verra = new VerraIntegration();
  const verraCert = await verra.registerCredit(credit);
  log('green', '✅ Verra registration:');
  console.log(JSON.stringify(verraCert, null, 2));
  manager.updateCreditStatus(creditId, 'registered_verra', verraCert);

  // STEP 6: Register with Gold Standard
  section('STEP 6: Register with Gold Standard');
  const goldStandard = new GoldStandardIntegration();
  const gsCert = await goldStandard.registerCredit(credit);
  log('green', '✅ Gold Standard registration:');
  console.log(JSON.stringify(gsCert, null, 2));

  // STEP 7: Get Market Prices
  section('STEP 7: Check Market Prices');
  const marketplace = new CarbonMarketplace(verra, goldStandard);
  const prices = await marketplace.getMarketPrices();
  log('green', '✅ Current market prices:');
  console.log(JSON.stringify(prices, null, 2));

  // STEP 8: Calculate ESG Premium
  section('STEP 8: Calculate ESG Premium Pricing');
  const premium = marketplace.calculateESGPremium(credit, { esg_focused: true });
  log('green', '✅ ESG premium pricing:');
  console.log(JSON.stringify(premium, null, 2));

  // STEP 9: List on Marketplace
  section('STEP 9: Create Sell Order on Marketplace');
  const sellOrder = await marketplace.createSellOrder(
    'TENANT-001',
    creditId,
    creditCalc.adjusted_credits_tco2e,
    premium.final_price_usd
  );
  log('green', '✅ Sell order created:');
  console.log(JSON.stringify(sellOrder, null, 2));

  // STEP 10: View Inventory
  section('STEP 10: View Tenant Inventory');
  const inventory = manager.getTenantInventory('TENANT-001');
  log('green', '✅ Current inventory:');
  console.log(JSON.stringify(inventory, null, 2));

  // Summary
  section('WORKFLOW COMPLETE');
  log('magenta', '📊 SUMMARY:');
  console.log(`Device: ${telemetry.deviceId}`);
  console.log(`Generated: ${telemetry.readings.generatedKwh} kWh`);
  console.log(`Verification: ${verification.attestation.verificationStatus}`);
  console.log(`Trust Score: ${verification.attestation.trustScore}`);
  console.log(`Carbon Credits: ${creditCalc.adjusted_credits_tco2e} tCO2e`);
  console.log(`Token Amount: ${mintResult.token_amount} tokens`);
  console.log(`Verra Cert: ${verraCert.verra_certificate_id}`);
  console.log(`GS Cert: ${gsCert.gs_certificate_id}`);
  console.log(`Market Price: $${premium.final_price_usd}/tCO2e`);
  console.log(`Total Value: $${sellOrder.order.total_value_usd} USD`);
  console.log(`Total Value: ₹${sellOrder.order.total_value_inr} INR`);
  log('green', '\n✅ Complete carbon credit lifecycle executed successfully!');
}

if (require.main === module) {
  runDemo().catch(error => {
    log('red', `\n❌ Demo failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runDemo };