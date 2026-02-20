/**
 * Production Edge Gateway Example - REST API Integration
 * 
 * This demonstrates how a hydropower plant integrates with the MRV system
 * via REST API instead of direct SDK usage.
 * 
 * Hardware setup:
 * - Flow meter (analog 4-20mA) → PLC/SCADA → Modbus RTU → Raspberry Pi → This script
 * - Head sensor (ultrasonic) → PLC → Modbus
 * - Generation meter (kWh) → Modbus energy meter
 * 
 * Usage:
 *   PLANT_ID=PLANT-HP-001 \
 *   DEVICE_ID=TURBINE-001 \
 *   API_KEY=ghpk_demo_key_001 \
 *   API_ENDPOINT=http://localhost:3000 \
 *   node examples/plant-bridge-rest-api.js
 */

const axios = require('axios');
const ModbusRTU = require('modbus-serial');

// Configuration from environment
const config = {
  plantId: process.env.PLANT_ID || 'PLANT-HP-001',
  deviceId: process.env.DEVICE_ID || 'TURBINE-001',
  apiKey: process.env.API_KEY || 'ghpk_demo_key_001',
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000',
  modbusPort: process.env.MODBUS_PORT || '/dev/ttyUSB0',
  modbusBaud: parseInt(process.env.MODBUS_BAUD || '9600'),
  submissionInterval: parseInt(process.env.SUBMISSION_INTERVAL || '300'), // 5 minutes
  dryRun: process.env.DRY_RUN === 'true'
};

// Modbus register map (customize for your PLC/SCADA)
const MODBUS_MAP = {
  flowRate: { address: 100, scale: 0.01 },      // Register 100, divide by 100
  headHeight: { address: 102, scale: 0.1 },      // Register 102, divide by 10
  powerOutput: { address: 104, scale: 1 },       // Register 104, kW
  pH: { address: 106, scale: 0.01 },             // Register 106
  turbidity: { address: 108, scale: 1 },         // Register 108
  temperature: { address: 110, scale: 0.1 }      // Register 110
};

/**
 * Initialize Modbus connection
 */
async function initModbus() {
  const client = new ModbusRTU();
  
  try {
    await client.connectRTUBuffered(config.modbusPort, { 
      baudRate: config.modbusBaud 
    });
    client.setID(1); // Modbus slave ID
    client.setTimeout(5000);
    
    console.log(`✓ Modbus connected: ${config.modbusPort} @ ${config.modbusBaud} baud`);
    return client;
  } catch (error) {
    console.error('✗ Modbus connection failed:', error.message);
    console.log('Running in MOCK MODE with simulated data');
    return null;
  }
}

/**
 * Read sensor data from Modbus
 */
async function readSensors(client) {
  if (!client) {
    // Mock data for testing without hardware
    return {
      flowRate: 2.5 + Math.random() * 0.5,
      head: 45 + Math.random() * 2,
      generatedKwh: 900 + Math.random() * 100,
      pH: 7.0 + Math.random() * 0.5,
      turbidity: 8 + Math.random() * 4,
      temperature: 18 + Math.random() * 2
    };
  }
  
  const readings = {};
  
  try {
    // Read all registers
    for (const [key, config] of Object.entries(MODBUS_MAP)) {
      const data = await client.readHoldingRegisters(config.address, 1);
      readings[key] = data.data[0] * config.scale;
    }
    
    // Convert power to energy (kWh per 5-minute interval)
    const intervalHours = config.submissionInterval / 3600;
    readings.generatedKwh = readings.powerOutput * intervalHours;
    delete readings.powerOutput;
    
    return readings;
  } catch (error) {
    console.error('✗ Modbus read error:', error.message);
    throw error;
  }
}

/**
 * Submit telemetry to MRV API
 */
async function submitToAPI(readings) {
  try {
    const response = await axios.post(
      `${config.apiEndpoint}/api/v1/telemetry`,
      {
        plant_id: config.plantId,
        device_id: config.deviceId,
        readings: {
          ...readings,
          timestamp: Date.now()
        }
      },
      {
        headers: {
          'x-api-key': config.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response from API server');
    } else {
      throw error;
    }
  }
}

/**
 * Main telemetry loop
 */
async function main() {
  console.log('=== HEDERA HYDROPOWER MRV - EDGE GATEWAY ===');
  console.log(`Plant: ${config.plantId}`);
  console.log(`Device: ${config.deviceId}`);
  console.log(`API: ${config.apiEndpoint}`);
  console.log(`Interval: ${config.submissionInterval}s`);
  console.log();
  
  // Initialize Modbus
  const modbusClient = await initModbus();
  
  // Main loop
  while (true) {
    try {
      // 1. Read sensors
      console.log(`[${new Date().toISOString()}] Reading sensors...`);
      const readings = await readSensors(modbusClient);
      
      console.log('Telemetry:', {
        flow: `${readings.flowRate.toFixed(2)} m³/s`,
        head: `${readings.head.toFixed(1)} m`,
        energy: `${readings.generatedKwh.toFixed(1)} kWh`,
        pH: readings.pH?.toFixed(1),
        turbidity: readings.turbidity?.toFixed(0)
      });
      
      // 2. Submit to API
      if (config.dryRun) {
        console.log('[DRY RUN] Would submit to API');
      } else {
        const result = await submitToAPI(readings);
        
        console.log(`✓ Status: ${result.status}`);
        console.log(`✓ Trust Score: ${(result.trust_score * 100).toFixed(1)}%`);
        console.log(`✓ Hedera TX: ${result.hedera.transaction_id || 'N/A'}`);
        
        if (result.carbon_credits) {
          console.log(`✓ Carbon Credits: ${result.carbon_credits.amount_tco2e.toFixed(3)} tCO2e`);
        }
        
        if (result.warning) {
          console.warn(`⚠ Warning: ${result.warning}`);
        }
      }
      
      console.log();
      
    } catch (error) {
      console.error('✗ Error:', error.message);
      console.log('Retrying in next interval...');
      console.log();
    }
    
    // Wait for next interval
    await new Promise(resolve => setTimeout(resolve, config.submissionInterval * 1000));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down edge gateway...');
  process.exit(0);
});

// Start
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
