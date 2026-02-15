// code/playground/03_submit_telemetry.js
// Submit telemetry data and trigger Engine V2 verification

const { EngineV1 } = require('../../engine-v1');
const fs = require('fs');
require('dotenv').config();

function generateRealisticTelemetry(deviceId, baseFlow = 2.5, baseHead = 45) {
  // Add realistic variations
  const flowVariation = (Math.random() - 0.5) * 0.3; // ±15%
  const headVariation = (Math.random() - 0.5) * 2;   // ±1m

  const flow = baseFlow + flowVariation;
  const head = baseHead + headVariation;
  const efficiency = 0.85 + (Math.random() - 0.5) * 0.05; // 0.825-0.875

  // Physics-based power calculation
  const density = 1000;
  const gravity = 9.81;
  const powerKw = (density * gravity * flow * head * efficiency) / 1000;

  return {
    deviceId,
    timestamp: new Date().toISOString(),
    readings: {
      flowRate_m3_per_s: parseFloat(flow.toFixed(3)),
      headHeight_m: parseFloat(head.toFixed(2)),
      generatedKwh: parseFloat(powerKw.toFixed(2)),
      pH: parseFloat((7.0 + (Math.random() - 0.5) * 0.5).toFixed(2)),
      turbidity_ntu: parseFloat((15 + Math.random() * 20).toFixed(1)),
      temperature_celsius: parseFloat((18 + (Math.random() - 0.5) * 4).toFixed(1)),
      efficiency: parseFloat(efficiency.toFixed(4))
    }
  };
}

async function submitBatch(deviceId, count = 10) {
  console.log(`\n=== Submitting ${count} readings for ${deviceId} ===\n`);

  const telemetryBatch = [];
  for (let i = 0; i < count; i++) {
    const telemetry = generateRealisticTelemetry(deviceId);
    telemetryBatch.push(telemetry);

    console.log(`Reading ${i + 1}/${count}:`);
    console.log(`  Flow: ${telemetry.readings.flowRate_m3_per_s} m³/s`);
    console.log(`  Head: ${telemetry.readings.headHeight_m} m`);
    console.log(`  Power: ${telemetry.readings.generatedKwh} kW`);
  }

  return telemetryBatch;
}

async function runVerification(telemetryBatch) {
  console.log("\n=== Running ENGINE V1 Verification ===\n");

  const { Client, PrivateKey, AccountId } = require('@hashgraph/sdk');

  const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);
  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(process.env.HEDERA_OPERATOR_ID), operatorKey);

  const engine = new EngineV1();
  const results = [];

  for (const telemetry of telemetryBatch) {
    try {
      const result = await engine.verifyAndPublish(telemetry);
      results.push(result);

      console.log(`✓ ${telemetry.deviceId} - ${result.attestation.verificationStatus}`);
      console.log(`  Trust Score: ${result.attestation.trustScore}`);
      console.log(`  RECs: ${result.attestation.calculations.RECs_issued} tCO2`);
      console.log(`  TX: ${result.transactionId}\n`);
    } catch (error) {
      console.error(`✗ Error processing ${telemetry.deviceId}:`, error.message);
    }
  }

  await client.close();
  return results;
}

function generateSummary(results) {
  const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED');
  const flagged = results.filter(r => r.attestation.verificationStatus === 'FLAGGED');
  const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED');

  const totalRECs = approved.reduce((sum, r) => sum + r.attestation.calculations.RECs_issued, 0);
  const avgTrust = results.reduce((sum, r) => sum + r.attestation.trustScore, 0) / results.length;

  return {
    totalReadings: results.length,
    approved: approved.length,
    flagged: flagged.length,
    rejected: rejected.length,
    totalRECs: parseFloat(totalRECs.toFixed(6)),
    averageTrustScore: parseFloat(avgTrust.toFixed(4)),
    results
  };
}

async function main() {
  const args = process.argv.slice(2);
  const deviceId = args[0] || 'TURBINE-1';
  const count = parseInt(args[1]) || 10;

  console.log("\n🌊 HEDERA HYDROPOWER MRV - TELEMETRY SUBMISSION");
  console.log("================================================");
  console.log(`Device: ${deviceId}`);
  console.log(`Readings: ${count}`);

  try {
    // Generate telemetry
    const telemetryBatch = await submitBatch(deviceId, count);

    // Run verification
    const results = await runVerification(telemetryBatch);

    // Generate summary
    const summary = generateSummary(results);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `telemetry-results-${deviceId}-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));

    console.log("\n=== SUMMARY ===");
    console.log(`Total Readings: ${summary.totalReadings}`);
    console.log(`✓ Approved: ${summary.approved}`);
    console.log(`⚠ Flagged: ${summary.flagged}`);
    console.log(`✗ Rejected: ${summary.rejected}`);
    console.log(`Total RECs Issued: ${summary.totalRECs} tCO2`);
    console.log(`Average Trust Score: ${summary.averageTrustScore}`);
    console.log(`\nResults saved to: ${filename}`);

    console.log("\n✓ Telemetry Submission Complete!");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
