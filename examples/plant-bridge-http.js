/**
 * HTTP/REST Edge Bridge for Hedera MRV
 * 
 * For PLCs/SCADA systems with HTTP API or OPC-UA endpoints.
 * Polls data via HTTP GET/POST and submits to MRV system.
 * 
 * Use case: Modern PLCs with REST APIs (Siemens S7-1500, Allen-Bradley, etc.)
 */

const axios = require('axios');
const Workflow = require('../src/workflow');
const { validateTelemetry } = require('../src/validation/telemetry');
const fs = require('fs');

require('dotenv').config();

// Configuration
const CONFIG = {
  // PLC API endpoint
  plcApi: {
    baseUrl: process.env.PLC_API_BASE_URL || 'http://192.168.1.10:8080',
    username: process.env.PLC_API_USERNAME || 'admin',
    password: process.env.PLC_API_PASSWORD || 'admin',
    timeout: parseInt(process.env.PLC_API_TIMEOUT || '10000') // 10 seconds
  },
  
  // Endpoint paths (adjust per your PLC API)
  endpoints: {
    flowRate: '/api/sensors/flow',
    headPressure: '/api/sensors/pressure',
    activePower: '/api/sensors/power',
    pH: '/api/sensors/ph',
    turbidity: '/api/sensors/turbidity'
  },
  
  // MRV settings
  pollInterval: parseInt(process.env.POLL_INTERVAL || '300000'), // 5 minutes
  plantId: process.env.PLANT_ID || 'PLANT-HP-001',
  deviceId: process.env.DEVICE_ID || 'TURBINE-001',
  efGrid: parseFloat(process.env.EF_GRID || '0.82'),
  
  // Backup log path
  backupLogPath: process.env.BACKUP_LOG_PATH || '/data/failed-readings.log'
};

// HTTP client with auth
const httpClient = axios.create({
  baseURL: CONFIG.plcApi.baseUrl,
  timeout: CONFIG.plcApi.timeout,
  auth: {
    username: CONFIG.plcApi.username,
    password: CONFIG.plcApi.password
  }
});

let workflow;

/**
 * Fetch sensor value from PLC HTTP API
 */
async function fetchSensor(name, endpoint) {
  try {
    const response = await httpClient.get(endpoint);
    const value = response.data.value || response.data; // Handle different response formats
    
    console.log(`[HTTP] ${name}: ${value}`);
    return typeof value === 'number' ? value : parseFloat(value);
    
  } catch (error) {
    if (error.response) {
      console.error(`[HTTP] ${name} returned ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      console.error(`[HTTP] ${name} no response (timeout or network error)`);
    } else {
      console.error(`[HTTP] ${name} error:`, error.message);
    }
    return undefined;
  }
}

/**
 * Poll all sensors and submit telemetry
 */
async function pollSensors() {
  console.log('\n[Poll] Starting sensor poll...');
  const timestamp = new Date().toISOString();
  
  try {
    // Fetch all sensors in parallel
    const [flowRate, headPressure, activePower, pH, turbidity] = await Promise.all([
      fetchSensor('flowRate', CONFIG.endpoints.flowRate),
      fetchSensor('headPressure', CONFIG.endpoints.headPressure),
      fetchSensor('activePower', CONFIG.endpoints.activePower),
      fetchSensor('pH', CONFIG.endpoints.pH),
      fetchSensor('turbidity', CONFIG.endpoints.turbidity)
    ]);
    
    // Convert units (adjust per your PLC API response format)
    const rawTelemetry = {
      flowRate: flowRate,
      head: headPressure ? headPressure * 10.2 : undefined, // assuming pressure in bar
      generatedKwh: activePower ? activePower * (CONFIG.pollInterval / 3600000) : undefined, // kW to kWh
      pH: pH,
      turbidity: turbidity,
      timestamp: timestamp
    };
    
    console.log('[Poll] Raw telemetry:', JSON.stringify(rawTelemetry, null, 2));
    
    // Validate before submission
    const validation = validateTelemetry(rawTelemetry);
    
    if (!validation.valid) {
      console.error('[Validation] FAILED:', validation.errors);
      
      // Log to backup file
      const logEntry = `${Date.now()},${JSON.stringify(rawTelemetry)},${validation.errors.join('; ')}\n`;
      fs.appendFileSync(CONFIG.backupLogPath, logEntry);
      
      return;
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[Validation] Warnings:', validation.warnings);
    }
    
    // Submit to MRV system
    console.log('[MRV] Submitting to Hedera...');
    const result = await workflow.submitReading(validation.normalized);
    
    console.log(
      `[MRV] ✓ Status: ${result.verificationStatus} | ` +
      `Trust: ${result.trustScore.toFixed(4)} | ` +
      `TX: ${result.transactionId || 'N/A'}`
    );
    
    if (result.verificationStatus === 'REJECTED') {
      console.warn('[MRV] ⚠ Reading REJECTED by AI Guardian');
    }
    
  } catch (error) {
    console.error('[Poll] Error:', error.message);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('=== Hedera MRV Edge Gateway ===');
  console.log('Mode: HTTP/REST API');
  console.log('PLC API:', CONFIG.plcApi.baseUrl);
  console.log('Plant ID:', CONFIG.plantId);
  console.log('Device ID:', CONFIG.deviceId);
  console.log('Poll Interval:', CONFIG.pollInterval / 1000, 'seconds');
  console.log('================================\n');
  
  // Initialize MRV workflow
  try {
    workflow = new Workflow();
    await workflow.initialize(CONFIG.plantId, CONFIG.deviceId, CONFIG.efGrid);
    console.log('[MRV] Workflow initialized\n');
  } catch (error) {
    console.error('[MRV] Failed to initialize:', error.message);
    process.exit(1);
  }
  
  // Test PLC connectivity
  try {
    console.log('[HTTP] Testing PLC connectivity...');
    await httpClient.get('/api/health'); // adjust endpoint
    console.log('[HTTP] PLC API reachable\n');
  } catch (error) {
    console.warn('[HTTP] PLC API health check failed, continuing anyway...\n');
  }
  
  // Start polling loop
  console.log('[Poll] Starting continuous polling...\n');
  
  // Poll immediately
  await pollSensors();
  
  // Then poll every interval
  setInterval(pollSensors, CONFIG.pollInterval);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Stopping polling...');
    process.exit(0);
  });
}

// Run
main().catch(error => {
  console.error('[Fatal]', error);
  process.exit(1);
});
