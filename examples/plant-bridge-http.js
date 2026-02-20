/**
 * Example Plant Bridge Script for HTTP/REST API Integration
 * 
 * This script demonstrates how to integrate Hedera MRV with SCADA systems
 * that expose data via REST APIs (common with modern IoT gateways).
 * 
 * HARDWARE REQUIREMENTS:
 * - SCADA/PLC with HTTP API enabled
 * - Network connectivity to SCADA system
 * 
 * INSTALLATION:
 * npm install axios
 * 
 * USAGE:
 * node examples/plant-bridge-http.js
 */

require('dotenv').config();
const Workflow = require('../src/workflow');
const { validateTelemetry } = require('../src/validation/telemetry');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const SCADA_API_URL = process.env.SCADA_API_URL || 'http://192.168.1.100/api/telemetry';
const SCADA_API_KEY = process.env.SCADA_API_KEY;
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS || '300000'); // 5 minutes
const PLANT_ID = process.env.PLANT_ID || 'PLANT-HP-001';
const DEVICE_ID = process.env.DEVICE_ID || 'TURBINE-001';
const EF_GRID = parseFloat(process.env.EF_GRID || '0.82');

let workflow = null;
let isRunning = false;

/**
 * Fetch telemetry from SCADA HTTP API
 */
async function fetchSCADAData() {
  try {
    const headers = {};
    if (SCADA_API_KEY) {
      headers['Authorization'] = `Bearer ${SCADA_API_KEY}`;
    }

    const response = await axios.get(SCADA_API_URL, {
      headers,
      timeout: 10000 // 10s timeout
    });

    // Assuming SCADA returns data in this format:
    // {
    //   "flow_rate_m3s": 2.5,
    //   "head_pressure_bar": 4.4,
    //   "active_power_kw": 900,
    //   "ph": 7.2,
    //   "turbidity_ntu": 12
    // }
    
    const data = response.data;

    // Map to MRV telemetry format
    const rawTelemetry = {
      flowRate: data.flow_rate_m3s || data.flowRate,
      head: data.head_pressure_bar ? data.head_pressure_bar * 10.2 : data.head,
      generatedKwh: data.active_power_kw ? data.active_power_kw * (POLLING_INTERVAL_MS / (1000 * 60 * 60)) : data.generatedKwh,
      pH: data.ph || data.pH || undefined,
      turbidity: data.turbidity_ntu || data.turbidity || undefined,
      temperature: data.temperature_celsius || data.temperature || undefined,
      timestamp: data.timestamp || new Date().toISOString()
    };

    return rawTelemetry;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to SCADA API. Check URL and network.');
    }
    throw error;
  }
}

/**
 * Main polling loop
 */
async function pollAndSubmit() {
  if (!isRunning) return;

  try {
    console.log(`\n[${new Date().toISOString()}] Fetching from SCADA API...`);
    
    // Fetch data from SCADA
    const rawTelemetry = await fetchSCADAData();
    console.log('[SCADA] Data received:', JSON.stringify(rawTelemetry, null, 2));

    // Validate telemetry
    const validation = validateTelemetry(rawTelemetry);

    if (!validation.valid) {
      console.error('[VALIDATION] FAILED:', validation.errors);
      
      const logPath = path.join(__dirname, '../data/failed-readings.log');
      fs.appendFileSync(
        logPath,
        `${Date.now()},${JSON.stringify(rawTelemetry)},${validation.errors.join('; ')}\n`
      );
      
      return;
    }

    if (validation.warnings.length > 0) {
      console.warn('[VALIDATION] Warnings:', validation.warnings);
    }

    // Submit to MRV
    console.log('[MRV] Submitting to Hedera...');
    const result = await workflow.submitReading(validation.normalized);

    console.log('[MRV] Verification complete:');
    console.log(`  Status: ${result.verificationStatus}`);
    console.log(`  Trust Score: ${result.trustScore.toFixed(4)}`);
    console.log(`  Transaction ID: ${result.transactionId || 'N/A'}`);

    if (result.verificationStatus === 'APPROVED') {
      const logPath = path.join(__dirname, '../data/approved-readings.log');
      fs.appendFileSync(
        logPath,
        `${Date.now()},${result.trustScore},${result.transactionId},${JSON.stringify(validation.normalized)}\n`
      );
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    
    const errorLogPath = path.join(__dirname, '../data/errors.log');
    fs.appendFileSync(
      errorLogPath,
      `${new Date().toISOString()},${error.message}\n`
    );
  } finally {
    if (isRunning) {
      setTimeout(pollAndSubmit, POLLING_INTERVAL_MS);
    }
  }
}

process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Graceful shutdown...');
  isRunning = false;
  
  if (workflow) {
    await workflow.cleanup();
  }
  
  process.exit(0);
});

async function main() {
  console.log('=== Hedera Hydropower MRV Plant Bridge (HTTP) ===');
  console.log(`Plant ID: ${PLANT_ID}`);
  console.log(`Device ID: ${DEVICE_ID}`);
  console.log(`SCADA API: ${SCADA_API_URL}`);
  console.log(`Polling interval: ${POLLING_INTERVAL_MS / 1000}s`);
  console.log();

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    console.log('[MRV] Initializing workflow...');
    workflow = new Workflow();
    await workflow.initialize(PLANT_ID, DEVICE_ID, EF_GRID);
    console.log('[MRV] Workflow initialized');
  } catch (error) {
    console.error('[FATAL] Workflow init failed:', error.message);
    process.exit(1);
  }

  isRunning = true;
  console.log(`[START] Polling every ${POLLING_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);
  pollAndSubmit();
}

if (require.main === module) {
  main().catch(error => {
    console.error('[FATAL]', error);
    process.exit(1);
  });
}

module.exports = { fetchSCADAData, pollAndSubmit };
