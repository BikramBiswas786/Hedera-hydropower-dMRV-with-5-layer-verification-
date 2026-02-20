/**
 * Example Plant Bridge Script for Modbus RTU/TCP Sensors
 * 
 * This script demonstrates how to integrate Hedera MRV with existing
 * SCADA/PLC systems using Modbus protocol.
 * 
 * HARDWARE REQUIREMENTS:
 * - Edge gateway (Raspberry Pi 4 or industrial gateway)
 * - Modbus RTU/TCP sensors (flow, pressure, power)
 * - Network connectivity (Ethernet preferred over WiFi)
 * 
 * INSTALLATION:
 * npm install modbus-serial
 * 
 * USAGE:
 * node examples/plant-bridge-modbus.js
 */

require('dotenv').config();
const Workflow = require('../src/workflow');
const { validateTelemetry } = require('../src/validation/telemetry');
const ModbusRTU = require('modbus-serial');
const fs = require('fs');
const path = require('path');

// Configuration
const MODBUS_PORT = process.env.MODBUS_PORT || '/dev/ttyUSB0';
const MODBUS_BAUDRATE = parseInt(process.env.MODBUS_BAUDRATE || '9600');
const MODBUS_SLAVE_ID = parseInt(process.env.MODBUS_SLAVE_ID || '1');
const POLLING_INTERVAL_MS = parseInt(process.env.POLLING_INTERVAL_MS || '300000'); // 5 minutes
const PLANT_ID = process.env.PLANT_ID || 'PLANT-HP-001';
const DEVICE_ID = process.env.DEVICE_ID || 'TURBINE-001';
const EF_GRID = parseFloat(process.env.EF_GRID || '0.82');

// Modbus register map (adjust per your PLC manual)
const REGISTERS = {
  FLOW_RATE: 100,      // Register 100: Flow rate in m³/s × 100
  HEAD_PRESSURE: 102,  // Register 102: Head pressure in bar × 100
  ACTIVE_POWER: 104,   // Register 104: Active power in kW
  PH: 106,             // Register 106: pH × 100 (optional)
  TURBIDITY: 108       // Register 108: Turbidity in NTU × 10 (optional)
};

// Initialize Modbus client
const modbusClient = new ModbusRTU();

// Initialize MRV workflow
let workflow = null;
let isRunning = false;

/**
 * Initialize Modbus connection
 */
async function initModbus() {
  try {
    console.log(`[MODBUS] Connecting to ${MODBUS_PORT} at ${MODBUS_BAUDRATE} baud...`);
    await modbusClient.connectRTUBuffered(MODBUS_PORT, {
      baudRate: MODBUS_BAUDRATE
    });
    modbusClient.setID(MODBUS_SLAVE_ID);
    console.log('[MODBUS] Connected successfully');
    return true;
  } catch (error) {
    console.error('[MODBUS] Connection failed:', error.message);
    return false;
  }
}

/**
 * Read sensor data from Modbus registers
 */
async function readSensors() {
  try {
    // Read all registers (adjust per your sensor layout)
    const flowRate = await modbusClient.readHoldingRegisters(REGISTERS.FLOW_RATE, 1);
    const headPressure = await modbusClient.readHoldingRegisters(REGISTERS.HEAD_PRESSURE, 1);
    const activePower = await modbusClient.readHoldingRegisters(REGISTERS.ACTIVE_POWER, 1);
    
    // Optional sensors (may not be present in all plants)
    let pH, turbidity;
    try {
      pH = await modbusClient.readHoldingRegisters(REGISTERS.PH, 1);
    } catch (e) {
      pH = null;
    }
    try {
      turbidity = await modbusClient.readHoldingRegisters(REGISTERS.TURBIDITY, 1);
    } catch (e) {
      turbidity = null;
    }

    // Convert raw values
    const rawTelemetry = {
      flowRate: flowRate.data[0] / 100, // Convert from centim³/s to m³/s
      head: (headPressure.data[0] / 100) * 10.2, // bar to meters (1 bar ≈ 10.2m water column)
      generatedKwh: activePower.data[0] * (POLLING_INTERVAL_MS / (1000 * 60 * 60)), // kW × hours → kWh
      pH: pH && pH.data[0] !== 0 ? pH.data[0] / 100 : undefined,
      turbidity: turbidity && turbidity.data[0] !== 0 ? turbidity.data[0] / 10 : undefined,
      timestamp: new Date().toISOString()
    };

    return rawTelemetry;
  } catch (error) {
    console.error('[MODBUS] Read error:', error.message);
    throw error;
  }
}

/**
 * Main polling loop
 */
async function pollAndSubmit() {
  if (!isRunning) return;

  try {
    console.log(`\n[${new Date().toISOString()}] Reading sensors...`);
    
    // Read raw sensor data
    const rawTelemetry = await readSensors();
    console.log('[SENSORS] Raw data:', JSON.stringify(rawTelemetry, null, 2));

    // Validate telemetry BEFORE submission
    const validation = validateTelemetry(rawTelemetry);

    if (!validation.valid) {
      console.error('[VALIDATION] FAILED:', validation.errors);
      
      // Log to backup file for debugging
      const logPath = path.join(__dirname, '../data/failed-readings.log');
      fs.appendFileSync(
        logPath,
        `${Date.now()},${JSON.stringify(rawTelemetry)},${validation.errors.join('; ')}\n`
      );
      
      console.log('[BACKUP] Failed reading logged to', logPath);
      return; // Skip this reading
    }

    if (validation.warnings.length > 0) {
      console.warn('[VALIDATION] Warnings:', validation.warnings);
    }

    // Submit validated telemetry to MRV system
    console.log('[MRV] Submitting to Hedera...');
    const result = await workflow.submitReading(validation.normalized);

    console.log('[MRV] Verification complete:');
    console.log(`  Status: ${result.verificationStatus}`);
    console.log(`  Trust Score: ${result.trustScore.toFixed(4)}`);
    console.log(`  Transaction ID: ${result.transactionId || 'N/A'}`);

    // Log approved readings to separate file
    if (result.verificationStatus === 'APPROVED') {
      const logPath = path.join(__dirname, '../data/approved-readings.log');
      fs.appendFileSync(
        logPath,
        `${Date.now()},${result.trustScore},${result.transactionId},${JSON.stringify(validation.normalized)}\n`
      );
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    
    // Log errors
    const errorLogPath = path.join(__dirname, '../data/errors.log');
    fs.appendFileSync(
      errorLogPath,
      `${new Date().toISOString()},${error.message}\n`
    );
  } finally {
    // Schedule next poll
    if (isRunning) {
      setTimeout(pollAndSubmit, POLLING_INTERVAL_MS);
    }
  }
}

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Received SIGINT, shutting down gracefully...');
  isRunning = false;
  
  try {
    if (modbusClient.isOpen) {
      modbusClient.close();
    }
    if (workflow) {
      await workflow.cleanup();
    }
  } catch (error) {
    console.error('[SHUTDOWN] Cleanup error:', error.message);
  }
  
  process.exit(0);
});

/**
 * Main entry point
 */
async function main() {
  console.log('=== Hedera Hydropower MRV Plant Bridge ===');
  console.log(`Plant ID: ${PLANT_ID}`);
  console.log(`Device ID: ${DEVICE_ID}`);
  console.log(`Polling interval: ${POLLING_INTERVAL_MS / 1000}s`);
  console.log();

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize Modbus
  const modbusConnected = await initModbus();
  if (!modbusConnected) {
    console.error('[FATAL] Cannot connect to Modbus. Check wiring and configuration.');
    process.exit(1);
  }

  // Initialize MRV workflow
  try {
    console.log('[MRV] Initializing workflow...');
    workflow = new Workflow();
    await workflow.initialize(PLANT_ID, DEVICE_ID, EF_GRID);
    console.log('[MRV] Workflow initialized');
  } catch (error) {
    console.error('[FATAL] Workflow init failed:', error.message);
    process.exit(1);
  }

  // Start polling loop
  isRunning = true;
  console.log(`[START] Polling every ${POLLING_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);
  pollAndSubmit();
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('[FATAL]', error);
    process.exit(1);
  });
}

module.exports = { readSensors, pollAndSubmit };
