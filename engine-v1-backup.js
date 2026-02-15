const {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId,
  TopicId,
  Hbar
} = require('@hashgraph/sdk');
require('dotenv').config();

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY;
const AUDIT_TOPIC_ID = process.env.AUDIT_TOPIC_ID;
const EF_GRID = parseFloat(process.env.EF_GRID || "0.8");

if (!OPERATOR_ID || !OPERATOR_KEY_STR || !AUDIT_TOPIC_ID) {
  throw new Error("Missing HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY / AUDIT_TOPIC_ID in .env");
}

const operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
const client = Client.forTestnet();
client.setOperator(AccountId.fromString(OPERATOR_ID), operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(2));

// ============================================
// ENHANCED AI CHECKS - GRADUATED SCORING
// ============================================

function validatePhysicsConstraints(reading) {
  const density = 1000;
  const gravity = 9.81;
  const efficiency = reading.efficiency ?? 0.85;

  const expectedPowerW =
    density * gravity * reading.flowRate_m3_per_s * reading.headHeight_m * efficiency;
  const expectedPowerKw = expectedPowerW / 1000;
  const measuredPowerKw = reading.generatedKwh;

  const deviation = Math.abs(measuredPowerKw - expectedPowerKw) / expectedPowerKw;

  // GRADUATED SCORING (Enhanced AI)
  let score = 1.0;
  let status = 'PASS';
  
  if (deviation < 0.05) {
    score = 1.0;
    status = 'PERFECT';
  } else if (deviation < 0.10) {
    score = 0.95;
    status = 'EXCELLENT';
  } else if (deviation < 0.15) {
    score = 0.85;
    status = 'GOOD';
  } else if (deviation < 0.20) {
    score = 0.70;
    status = 'ACCEPTABLE';
  } else if (deviation < 0.30) {
    score = 0.50;
    status = 'QUESTIONABLE';
  } else {
    score = 0.0;
    status = 'FAIL';
  }

  return {
    score,
    status,
    deviation: parseFloat((deviation * 100).toFixed(2)),
    expectedPowerKw: parseFloat(expectedPowerKw.toFixed(2)),
    measuredPowerKw: parseFloat(measuredPowerKw.toFixed(2)),
    reason: status === 'FAIL' ? `Physics deviation ${(deviation * 100).toFixed(1)}% (>30%)` : null
  };
}

function validateTemporalConsistency(current, previous) {
  if (!previous) {
    return { 
      score: 1.0, 
      status: 'FIRST_READING',
      genChange: 0,
      flowChange: 0,
      headChange: 0,
      reason: null 
    };
  }

  const genChange = Math.abs(current.generatedKwh - previous.generatedKwh) / previous.generatedKwh;
  const flowChange = Math.abs(current.flowRate_m3_per_s - previous.flowRate_m3_per_s) / previous.flowRate_m3_per_s;
  const headChange = Math.abs(current.headHeight_m - previous.headHeight_m) / previous.headHeight_m;

  // GRADUATED SCORING (Enhanced AI)
  let score = 1.0;
  
  // Generation change penalty
  if (genChange < 0.10) score *= 1.0;
  else if (genChange < 0.20) score *= 0.95;
  else if (genChange < 0.30) score *= 0.85;
  else if (genChange < 0.50) score *= 0.70;
  else score *= 0.30;
  
  // Flow rate change penalty
  if (flowChange < 0.15) score *= 1.0;
  else if (flowChange < 0.30) score *= 0.95;
  else if (flowChange < 0.50) score *= 0.80;
  else score *= 0.50;
  
  // Head change penalty
  if (headChange < 0.05) score *= 1.0;
  else if (headChange < 0.10) score *= 0.95;
  else if (headChange < 0.20) score *= 0.80;
  else score *= 0.50;

  let status = 'PASS';
  if (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return {
    score: parseFloat(score.toFixed(4)),
    status,
    genChange: parseFloat((genChange * 100).toFixed(2)),
    flowChange: parseFloat((flowChange * 100).toFixed(2)),
    headChange: parseFloat((headChange * 100).toFixed(2)),
    reason: status === 'FAIL' ? 'Excessive temporal variation' : null
  };
}

function validateEnvironmentalBounds(reading, siteConfig = {}) {
  const bounds = {
    pH: { min: 6.5, max: 8.5, acceptable: { min: 6.0, max: 9.0 }, questionable: { min: 5.5, max: 9.5 } },
    turbidity_ntu: { min: 0, max: 50, acceptable: { min: 0, max: 100 }, questionable: { min: 0, max: 200 } },
    temperature_celsius: { min: 0, max: 30, acceptable: { min: -5, max: 35 }, questionable: { min: -10, max: 40 } },
    flowRate_m3_per_s: siteConfig.flowRateBounds || { min: 0.1, max: 100 },
    headHeight_m: siteConfig.headBounds || { min: 10, max: 500 }
  };

  // GRADUATED SCORING (Enhanced AI)
  let score = 1.0;
  const details = {};

  // pH check
  const pH = reading.pH;
  if (pH >= bounds.pH.min && pH <= bounds.pH.max) {
    details.pH = { value: pH, status: 'PERFECT', score: 1.0 };
  } else if (pH >= bounds.pH.acceptable.min && pH <= bounds.pH.acceptable.max) {
    details.pH = { value: pH, status: 'ACCEPTABLE', score: 0.95 };
    score *= 0.95;
  } else if (pH >= bounds.pH.questionable.min && pH <= bounds.pH.questionable.max) {
    details.pH = { value: pH, status: 'QUESTIONABLE', score: 0.80 };
    score *= 0.80;
  } else {
    details.pH = { value: pH, status: 'OUT_OF_RANGE', score: 0.30 };
    score *= 0.30;
  }

  // Turbidity check
  const turbidity = reading.turbidity_ntu;
  if (turbidity >= bounds.turbidity_ntu.min && turbidity <= bounds.turbidity_ntu.max) {
    details.turbidity = { value: turbidity, status: 'PERFECT', score: 1.0 };
  } else if (turbidity >= bounds.turbidity_ntu.acceptable.min && turbidity <= bounds.turbidity_ntu.acceptable.max) {
    details.turbidity = { value: turbidity, status: 'ACCEPTABLE', score: 0.95 };
    score *= 0.95;
  } else if (turbidity >= bounds.turbidity_ntu.questionable.min && turbidity <= bounds.turbidity_ntu.questionable.max) {
    details.turbidity = { value: turbidity, status: 'QUESTIONABLE', score: 0.80 };
    score *= 0.80;
  } else {
    details.turbidity = { value: turbidity, status: 'OUT_OF_RANGE', score: 0.30 };
    score *= 0.30;
  }

  // Temperature check
  const temp = reading.temperature_celsius;
  if (temp >= bounds.temperature_celsius.min && temp <= bounds.temperature_celsius.max) {
    details.temperature = { value: temp, status: 'PERFECT', score: 1.0 };
  } else if (temp >= bounds.temperature_celsius.acceptable.min && temp <= bounds.temperature_celsius.acceptable.max) {
    details.temperature = { value: temp, status: 'ACCEPTABLE', score: 0.95 };
    score *= 0.95;
  } else if (temp >= bounds.temperature_celsius.questionable.min && temp <= bounds.temperature_celsius.questionable.max) {
    details.temperature = { value: temp, status: 'QUESTIONABLE', score: 0.80 };
    score *= 0.80;
  } else {
    details.temperature = { value: temp, status: 'OUT_OF_RANGE', score: 0.30 };
    score *= 0.30;
  }

  let status = 'PASS';
  if (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return {
    score: parseFloat(score.toFixed(4)),
    status,
    details,
    reason: status === 'FAIL' ? 'Environmental parameters out of acceptable range' : null
  };
}

function detectStatisticalAnomalies(current, history) {
  if (!history.length) {
    return { 
      score: 1.0, 
      status: 'NO_HISTORY',
      zScore: 0, 
      mean: 0,
      stdDev: 0,
      reason: null 
    };
  }

  const vals = history.map(r => r.generatedKwh);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
  const stdDev = Math.sqrt(variance) || 1e-6;

  const z = Math.abs((current.generatedKwh - mean) / stdDev);

  // GRADUATED SCORING (Enhanced AI)
  let score = 1.0;
  let status = 'PASS';

  if (z < 1.0) {
    score = 1.0;
    status = 'NORMAL';
  } else if (z < 2.0) {
    score = 0.95;
    status = 'ACCEPTABLE';
  } else if (z < 2.5) {
    score = 0.85;
    status = 'QUESTIONABLE';
  } else if (z < 3.0) {
    score = 0.70;
    status = 'SUSPICIOUS';
  } else {
    score = 0.30;
    status = 'OUTLIER';
  }

  return {
    score: parseFloat(score.toFixed(4)),
    status,
    zScore: parseFloat(z.toFixed(2)),
    mean: parseFloat(mean.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    reason: status === 'OUTLIER' ? `Statistical outlier: Z-score ${z.toFixed(2)} (>3σ)` : null
  };
}

function validateConsistency(reading, deviceProfile = {}) {
  const {
    capacity = 1000,
    maxFlow = 10,
    maxHead = 500,
    minEfficiency = 0.70
  } = deviceProfile;

  // GRADUATED SCORING (Enhanced AI)
  let score = 1.0;
  const details = {};

  // Capacity check
  if (reading.generatedKwh <= capacity) {
    details.capacity = { status: 'OK', score: 1.0 };
  } else {
    details.capacity = { status: 'EXCEEDS', score: 0.50 };
    score *= 0.50;
  }

  // Flow check
  if (reading.flowRate_m3_per_s <= maxFlow) {
    details.flow = { status: 'OK', score: 1.0 };
  } else {
    details.flow = { status: 'EXCEEDS', score: 0.50 };
    score *= 0.50;
  }

  // Head check
  if (reading.headHeight_m <= maxHead) {
    details.head = { status: 'OK', score: 1.0 };
  } else {
    details.head = { status: 'EXCEEDS', score: 0.50 };
    score *= 0.50;
  }

  // Efficiency check
  const eff = reading.efficiency ?? 0.85;
  if (eff >= minEfficiency && eff <= 0.95) {
    details.efficiency = { status: 'OK', score: 1.0 };
  } else {
    details.efficiency = { status: 'OUT_OF_RANGE', score: 0.70 };
    score *= 0.70;
  }

  let status = 'PASS';
  if (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return {
    score: parseFloat(score.toFixed(4)),
    status,
    details,
    reason: status === 'FAIL' ? 'Device consistency check failed' : null
  };
}

function calculateTrustScore(results) {
  // ENHANCED WEIGHTS (5 components)
  const weights = {
    physics: 0.30,
    temporal: 0.25,
    environmental: 0.20,
    statistical: 0.15,
    consistency: 0.10
  };

  const trust =
    results.physics.score * weights.physics +
    results.temporal.score * weights.temporal +
    results.environmental.score * weights.environmental +
    results.statistical.score * weights.statistical +
    results.consistency.score * weights.consistency;

  return parseFloat(trust.toFixed(4));
}

function determineVerificationStatus(trustScore, config = {}) {
  const autoApproveThreshold = config.autoApproveThreshold ?? 0.90;
  const manualReviewThreshold = config.manualReviewThreshold ?? 0.50;

  let status, method, reasoning;

  if (trustScore >= autoApproveThreshold) {
    status = "APPROVED";
    method = "AI_AUTO_APPROVED";
    reasoning = `High confidence (${(trustScore * 100).toFixed(1)}%). All checks passed.`;
  } else if (trustScore >= manualReviewThreshold) {
    status = "FLAGGED";
    method = "MANUAL_REVIEW_REQUIRED";
    reasoning = `Medium confidence (${(trustScore * 100).toFixed(1)}%). Some checks questionable.`;
  } else {
    status = "REJECTED";
    method = "FAILED_VERIFICATION";
    reasoning = `Low confidence (${(trustScore * 100).toFixed(1)}%). Multiple checks failed.`;
  }

  return { status, method, reasoning };
}

function calculateBaselineEmissions(egMWh, efGrid) {
  return parseFloat((egMWh * efGrid).toFixed(6));
}

function calculateEmissionReductions(be, pe = 0, le = 0) {
  return parseFloat((be - pe - le).toFixed(6));
}

// ============================================
// ENHANCED ENGINE V1 CLASS
// ============================================

class EngineV1 {
  constructor(config = {}) {
    this.config = {
      autoApproveThreshold: 0.90,
      manualReviewThreshold: 0.50,
      siteConfig: {},
      deviceProfile: {
        capacity: 1000,
        maxFlow: 10,
        maxHead: 500,
        minEfficiency: 0.70
      },
      ...config
    };
    this.historyByDevice = new Map();
  }

  getHistory(deviceId) {
    if (!this.historyByDevice.has(deviceId)) {
      this.historyByDevice.set(deviceId, []);
    }
    return this.historyByDevice.get(deviceId);
  }

  async verifyAndPublish(telemetry) {
    const deviceId = telemetry.deviceId;
    const history = this.getHistory(deviceId);
    const previous = history[history.length - 1];

    // Run all 5 validation checks
    const physics = validatePhysicsConstraints(telemetry.readings);
    const temporal = validateTemporalConsistency(telemetry.readings, previous);
    const environmental = validateEnvironmentalBounds(telemetry.readings, this.config.siteConfig);
    const statistical = detectStatisticalAnomalies(telemetry.readings, history);
    const consistency = validateConsistency(telemetry.readings, this.config.deviceProfile);

    const validationResults = { physics, temporal, environmental, statistical, consistency };
    const trustScore = calculateTrustScore(validationResults);
    const decision = determineVerificationStatus(trustScore, this.config);

    // ACM0002 calculations
    const egMWh = telemetry.readings.generatedKwh / 1000;
    const be = calculateBaselineEmissions(egMWh, EF_GRID);
    const er = calculateEmissionReductions(be, 0, 0);

    const attestation = {
      deviceId,
      timestamp: telemetry.timestamp,
      verificationStatus: decision.status,
      verificationMethod: decision.method,
      trustScore,
      reasoning: decision.reasoning,
      checks: {
        physics,
        temporal,
        environmental,
        statistical,
        consistency
      },
      calculations: {
        EG_MWh: parseFloat(egMWh.toFixed(6)),
        EF_grid_tCO2_per_MWh: EF_GRID,
        BE_tCO2: be,
        PE_tCO2: 0,
        LE_tCO2: 0,
        ER_tCO2: er,
        RECs_issued: decision.status === "APPROVED" ? er : 0
      }
    };

    // Publish to HCS
    const topicId = TopicId.fromString(AUDIT_TOPIC_ID);
    const message = Buffer.from(JSON.stringify(attestation));

    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .freezeWith(client)
      .sign(operatorKey);

    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);

    // Update history
    history.push(telemetry.readings);

    return {
      attestation,
      transactionId: resp.transactionId.toString(),
      status: receipt.status.toString()
    };
  }

  async verifyBatch(telemetryArray) {
    const results = [];
    
    for (const telemetry of telemetryArray) {
      const result = await this.verifyAndPublish(telemetry);
      results.push(result);
    }

    const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED').length;
    const flagged = results.filter(r => r.attestation.verificationStatus === 'FLAGGED').length;
    const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED').length;
    const avgTrust = results.reduce((sum, r) => sum + r.attestation.trustScore, 0) / results.length;

    return {
      totalReadings: results.length,
      approved,
      flagged,
      rejected,
      averageTrustScore: parseFloat(avgTrust.toFixed(4)),
      results
    };
  }
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "submit") {
    const deviceId = args[1] || "TURBINE-1";
    const flow = parseFloat(args[2] || "2.5");
    const head = parseFloat(args[3] || "45");
    const gen = parseFloat(args[4] || "156");
    const ph = parseFloat(args[5] || "7.2");

    const engine = new EngineV1();

    const telemetry = {
      deviceId,
      timestamp: new Date().toISOString(),
      readings: {
        flowRate_m3_per_s: flow,
        headHeight_m: head,
        generatedKwh: gen,
        pH: ph,
        turbidity_ntu: 10,
        temperature_celsius: 18,
        efficiency: 0.85
      }
    };

    console.log("Submitting telemetry:", telemetry);
    console.log("");

    const result = await engine.verifyAndPublish(telemetry);

    console.log("=== ENHANCED ENGINE V1 RESULT ===");
    console.log("Decision:", result.attestation.verificationStatus);
    console.log("Method:", result.attestation.verificationMethod);
    console.log("Trust Score:", result.attestation.trustScore);
    console.log("Reasoning:", result.attestation.reasoning);
    console.log("");
    console.log("--- Detailed Checks ---");
    console.log("Physics:", result.attestation.checks.physics.status, `(score: ${result.attestation.checks.physics.score})`);
    console.log("Temporal:", result.attestation.checks.temporal.status, `(score: ${result.attestation.checks.temporal.score})`);
    console.log("Environmental:", result.attestation.checks.environmental.status, `(score: ${result.attestation.checks.environmental.score})`);
    console.log("Statistical:", result.attestation.checks.statistical.status, `(score: ${result.attestation.checks.statistical.score})`);
    console.log("Consistency:", result.attestation.checks.consistency.status, `(score: ${result.attestation.checks.consistency.score})`);
    console.log("");
    console.log("--- ACM0002 Calculations ---");
    console.log("ER (tCO2):", result.attestation.calculations.ER_tCO2);
    console.log("RECs issued (tCO2):", result.attestation.calculations.RECs_issued);
    console.log("");
    console.log("--- Hedera Verification ---");
    console.log("Transaction ID:", result.transactionId);
    console.log("Status:", result.status);
    console.log("Audit Topic:", AUDIT_TOPIC_ID);
  } else {
    console.log("ENHANCED ENGINE V1 - AI Trust Scoring System");
    console.log("");
    console.log("Usage:");
    console.log("  node engine-v1.js submit <deviceId> <flow> <head> <generatedKwh> <pH>");
    console.log("");
    console.log("Examples:");
    console.log("  node engine-v1.js submit TURBINE-1 2.5 45 900 7.2   # Valid (should APPROVE)");
    console.log("  node engine-v1.js submit TURBINE-1 2.5 45 156 7.2   # Invalid (should REJECT)");
    console.log("  node engine-v1.js submit TURBINE-1 2.5 45 700 7.2   # Borderline (may FLAG)");
  }

  await client.close();
}

main().catch(console.error);

module.exports = { EngineV1 };

