/**
 * Modbus RTU/TCP Edge Bridge for Hedera MRV
 * 
 * Connects to PLC/SCADA via Modbus protocol, reads sensor data,
 * validates it, and submits to MRV system.
 * 
 * Hardware: Raspberry Pi 4 with RS485 HAT or industrial edge gateway
 * Protocol: Modbus RTU (serial) or Modbus TCP (ethernet)
 */

const ModbusRTU = require('modbus-serial');
const Workflow = require('../src/workflow');
const { validateTelemetry } = require('../src/validation/telemetry');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Configuration
const CONFIG = {
  // Modbus connection
  modbus: {
    type: process.env.MODBUS_TYPE || 'RTU', // RTU or TCP
    port: process.env.MODBUS_PORT || '/dev/ttyUSB0',
    baudRate: parseInt(process.env.MODBUS_BAUD_RATE || '9600'),
    tcpHost: process.env.MODBUS_TCP_HOST || '192.168.1.10',
    tcpPort: parseInt(process.env.MODBUS_TCP_PORT || '502'),
    slaveId: parseInt(process.env.MODBUS_SLAVE_ID || '1')
  },
  
  // Register mapping (adjust per your PLC manual)
  registers: {
    flowRate: { address: 100, scale: 100 },      // m³/s (value/100)
    headPressure: { address: 102, scale: 100 },  // bar (value/100)
    activePower: { address: 104, scale: 1 },     // kW
    pH: { address: 106, scale: 100 },            // pH (value/100)
    turbidity: { address: 108, scale: 10 }       // NTU (value/10)
  },
  
  // MRV settings
  pollInterval: parseInt(process.env.POLL_INTERVAL || '300000'), // 5 minutes
  plantId: process.env.PLANT_ID || 'PLANT-HP-001',
  deviceId: process.env.DEVICE_ID || 'TURBINE-001',
  efGrid: parseFloat(process.env.EF_GRID || '0.82'),
  
  // Backup log path
  backupLogPath: process.env.BACKUP_LOG_PATH || '/data/failed-readings.log'
};

// Initialize Modbus client
const modbusClient = new ModbusRTU();
let workflow;
let isConnected = false;

/**
 * Connect to Modbus device
 */
async function connectModbus() {
  try {
    if (CONFIG.modbus.type === 'RTU') {
      console.log(`[Modbus] Connecting to ${CONFIG.modbus.port} @ ${CONFIG.modbus.baudRate} baud...`);
      await modbusClient.connectRTUBuffered(CONFIG.modbus.port, {
        baudRate: CONFIG.modbus.baudRate
      });
    } else if (CONFIG.modbus.type === 'TCP') {
      console.log(`[Modbus] Connecting to ${CONFIG.modbus.tcpHost}:${CONFIG.modbus.tcpPort}...`);
      await modbusClient.connectTCP(CONFIG.modbus.tcpHost, {
        port: CONFIG.modbus.tcpPort
      });
    } else {
      throw new Error(`Unsupported Modbus type: ${CONFIG.modbus.type}`);
    }
    
    modbusClient.setID(CONFIG.modbus.slaveId);
    modbusClient.setTimeout(5000); // 5 second timeout
    isConnected = true;
    console.log('[Modbus] Connected successfully');
    
  } catch (error) {
    console.error('[Modbus] Connection failed:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Read sensor value from Modbus register
 */
async function readRegister(name, config) {
  try {
    const result = await modbusClient.readHoldingRegisters(config.address, 1);
    const rawValue = result.data[0];
    const scaledValue = rawValue / config.scale;
    
    console.log(`[Modbus] ${name}: ${rawValue} (raw) → ${scaledValue.toFixed(2)} (scaled)`);
    return scaledValue;
    
  } catch (error) {
    console.error(`[Modbus] Failed to read ${name}:`, error.message);
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
    // Ensure Modbus connected
    if (!isConnected) {
      await connectModbus();
    }
    
    // Read all sensors
    const flowRate = await readRegister('flowRate', CONFIG.registers.flowRate);
    const headPressure = await readRegister('headPressure', CONFIG.registers.headPressure);
    const activePower = await readRegister('activePower', CONFIG.registers.activePower);
    const pH = await readRegister('pH', CONFIG.registers.pH);
    const turbidity = await readRegister('turbidity', CONFIG.registers.turbidity);
    
    // Convert units
    const rawTelemetry = {
      flowRate: flowRate,
      head: headPressure ? headPressure * 10.2 : undefined, // bar to meters (1 bar ≈ 10.2m H2O)
      generatedKwh: activePower ? activePower * (CONFIG.pollInterval / 3600000) : undefined, // kW × hours → kWh
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
    
    // Try to reconnect on next poll
    isConnected = false;
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('=== Hedera MRV Edge Gateway ===');
  console.log('Mode: Modbus', CONFIG.modbus.type);
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
  
  // Connect to Modbus
  try {
    await connectModbus();
  } catch (error) {
    console.error('[Modbus] Initial connection failed, will retry on first poll');
  }
  
  // Start polling loop
  console.log('[Poll] Starting continuous polling...\n');
  
  // Poll immediately
  await pollSensors();
  
  // Then poll every interval
  setInterval(pollSensors, CONFIG.pollInterval);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Shutdown] Closing connections...');
    if (modbusClient.isOpen) {
      modbusClient.close(() => {
        console.log('[Shutdown] Modbus connection closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

// Run
main().catch(error => {
  console.error('[Fatal]', error);
  process.exit(1);
});
