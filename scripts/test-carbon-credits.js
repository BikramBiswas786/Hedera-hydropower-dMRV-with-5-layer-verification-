/**
 * Carbon Credit API Test Suite - Node.js
 * 
 * Run: node scripts/test-carbon-credits.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAPI() {
  log('cyan', '\n============================================');
  log('cyan', '  CARBON CREDIT API TEST SUITE');
  log('cyan', '============================================\n');

  let creditId = null;

  try {
    // TEST 1: Market Prices
    log('yellow', 'TEST 1: Get Market Prices');
    log('yellow', '------------------------------------------');
    const prices = await axios.get(`${BASE_URL}/api/v1/carbon-credits/marketplace/prices`);
    log('green', '✅ Market Prices Retrieved');
    console.log(JSON.stringify(prices.data, null, 2));

    // TEST 2: Calculate Credits
    log('yellow', '\nTEST 2: Calculate Carbon Credits');
    log('yellow', '------------------------------------------');
    const calcResponse = await axios.post(`${BASE_URL}/api/v1/carbon-credits/calculate`, {
      attestation: {
        verificationStatus: 'APPROVED',
        trustScore: 0.96,
        calculations: { ER_tCO2: 150.5 },
        verificationMethod: 'AI_AUTO_APPROVED',
        timestamp: new Date().toISOString()
      }
    });
    log('green', '✅ Carbon Credits Calculated');
    console.log(JSON.stringify(calcResponse.data, null, 2));
    log('cyan', `📊 Credits: ${calcResponse.data.adjusted_credits_tco2e} tCO2e`);

    // TEST 3: Mint Tokens
    log('yellow', '\nTEST 3: Mint Hedera HTS Tokens');
    log('yellow', '------------------------------------------');
    const mintResponse = await axios.post(`${BASE_URL}/api/v1/carbon-credits/mint`, {
      tenantId: 'TENANT-001',
      quantity: 150.5,
      metadata: {
        plant_id: 'PLANT-001',
        device_id: 'TURBINE-1',
        trust_score: 0.96,
        verification_method: 'AI_AUTO_APPROVED'
      }
    });
    log('green', '✅ Tokens Minted');
    console.log(JSON.stringify(mintResponse.data, null, 2));
    creditId = mintResponse.data.credit_id;
    log('cyan', `🎫 Credit ID: ${creditId}`);

    // TEST 4: Verra Registration
    log('yellow', '\nTEST 4: Register with Verra');
    log('yellow', '------------------------------------------');
    const verraResponse = await axios.post(`${BASE_URL}/api/v1/carbon-credits/verra/register`, {
      creditId
    });
    log('green', '✅ Verra Registration Complete');
    console.log(JSON.stringify(verraResponse.data, null, 2));

    // TEST 5: Gold Standard Registration
    log('yellow', '\nTEST 5: Register with Gold Standard');
    log('yellow', '------------------------------------------');
    const gsResponse = await axios.post(`${BASE_URL}/api/v1/carbon-credits/goldstandard/register`, {
      creditId
    });
    log('green', '✅ Gold Standard Registration Complete');
    console.log(JSON.stringify(gsResponse.data, null, 2));

    // TEST 6: Inventory
    log('yellow', '\nTEST 6: Get Tenant Inventory');
    log('yellow', '------------------------------------------');
    const inventory = await axios.get(`${BASE_URL}/api/v1/carbon-credits/inventory/TENANT-001`);
    log('green', '✅ Inventory Retrieved');
    console.log(JSON.stringify(inventory.data, null, 2));

    // TEST 7: Create Sell Order
    log('yellow', '\nTEST 7: Create Sell Order');
    log('yellow', '------------------------------------------');
    const sellResponse = await axios.post(`${BASE_URL}/api/v1/carbon-credits/marketplace/sell`, {
      tenantId: 'TENANT-001',
      creditId,
      quantity_tco2e: 100,
      asking_price_per_tco2e: 16.5
    });
    log('green', '✅ Sell Order Created');
    console.log(JSON.stringify(sellResponse.data, null, 2));

    // TEST 8: Order Book
    log('yellow', '\nTEST 8: View Order Book');
    log('yellow', '------------------------------------------');
    const orderBook = await axios.get(`${BASE_URL}/api/v1/carbon-credits/marketplace/orderbook`);
    log('green', '✅ Order Book Retrieved');
    console.log(JSON.stringify(orderBook.data, null, 2));

    log('cyan', '\n============================================');
    log('cyan', '  ALL TESTS COMPLETE ✅');
    log('cyan', '============================================\n');

  } catch (error) {
    log('red', `\n❌ Test Failed: ${error.message}`);
    if (error.response) {
      console.log('Response:', error.response.data);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  testAPI();
}

module.exports = { testAPI };