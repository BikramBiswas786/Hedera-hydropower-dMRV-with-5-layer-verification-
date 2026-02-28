const {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId,
  TopicId,
  Hbar
} = require('@hashgraph/sdk');
require('dotenv').config();

// FIX Issue 3: EF_GRID standardized to 0.82.
// Accepts: EF_GRID (Vercel/standard) OR GRIDEF (PowerShell legacy)
const EF_GRID = parseFloat(process.env.EF_GRID || process.env.GRIDEF || '0.82');

// ============================================
// REAL ML — ISOLATION FOREST ANOMALY DETECTOR
// ============================================

const { getMLDetector } = require('../../ml/MLAnomalyDetector');
const mlDetector = getMLDetector();

// ============================================
// LAZY HEDERA CLIENT INITIALIZATION
// ============================================

let _client = null;
let _operatorKey = null;
let _hederaAvailable = null;

function getClient() {
  if (_hederaAvailable === false) return null;
  if (_client) return { client: _client, operatorKey: _operatorKey };

  // Accepts all known env var name variants:
  //   HEDERA_OPERATOR_ID  (PowerShell / original)
  //   HEDERA_ACCOUNT_ID   (Vercel standard)
  const OPERATOR_ID      = process.env.HEDERA_OPERATOR_ID || process.env.HEDERA_ACCOUNT_ID;

  //   HEDERA_OPERATOR_KEY (PowerShell / original)
  //   HEDERA_PRIVATE_KEY  (Vercel standard)
  const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY || process.env.HEDERA_PRIVATE_KEY;

  //   AUDIT_TOPIC_ID      (Vercel standard)
  //   HEDERA_TOPIC_ID     (PowerShell legacy)
  const AUDIT_TOPIC_ID   = process.env.AUDIT_TOPIC_ID || process.env.HEDERA_TOPIC_ID;

  if (!OPERATOR_ID || !OPERATOR_KEY_STR || !AUDIT_TOPIC_ID) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[EngineV1] FATAL: Hedera credentials missing in production.\n' +
        '  Set one of: HEDERA_OPERATOR_ID or HEDERA_ACCOUNT_ID\n' +
        '  Set one of: HEDERA_OPERATOR_KEY or HEDERA_PRIVATE_KEY\n' +
        '  Set one of: AUDIT_TOPIC_ID or HEDERA_TOPIC_ID'
      );
    } else {
      console.warn('[EngineV1] Hedera credentials missing, running in mock mode (dev/test only)');
    }
    _hederaAvailable = false;
    return null;
  }

  try {
    _operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
    _client = Client.forTestnet();
    _client.setOperator(AccountId.fromString(OPERATOR_ID), _operatorKey);
    _client.setDefaultMaxTransactionFee(new Hbar(2));
    _hederaAvailable = true;
    console.log('[EngineV1] Hedera client initialized successfully');
    return { client: _client, operatorKey: _operatorKey };
  } catch (error) {
    console.warn(`[EngineV1] Hedera init failed: ${error.message}`);
    _hederaAvailable = false;
    return null;
  }
}

function getAuditTopicId() {
  return process.env.AUDIT_TOPIC_ID || process.env.HEDERA_TOPIC_ID;
}

// ============================================
// LAYER 1 — PHYSICS CHECK (rule-based, exact)
// ============================================

function validatePhysicsConstraints(reading) {
  const density    = 1000;
  const gravity    = 9.81;
  const efficiency = reading.efficiency ?? 0.85;

  const expectedPowerKw = (density * gravity * reading.flowRate_m3_per_s * reading.headHeight_m * efficiency) / 1000;
  const measuredPowerKw = reading.generatedKwh;
  const deviation       = Math.abs(measuredPowerKw - expectedPowerKw) / expectedPowerKw;

  let score, status;
  if      (deviation < 0.05) { score = 1.00; status = 'PERFECT';      }
  else if (deviation < 0.10) { score = 0.95; status = 'EXCELLENT';    }
  else if (deviation < 0.15) { score = 0.85; status = 'GOOD';         }
  else if (deviation < 0.20) { score = 0.70; status = 'ACCEPTABLE';   }
  else if (deviation < 0.30) { score = 0.50; status = 'QUESTIONABLE'; }
  else                        { score = 0.00; status = 'FAIL';         }

  return {
    score,
    status,
    deviation:        parseFloat((deviation * 100).toFixed(2)),
    expectedPowerKw:  parseFloat(expectedPowerKw.toFixed(2)),
    measuredPowerKw:  parseFloat(measuredPowerKw.toFixed(2)),
    reason:           status === 'FAIL' ? `Physics deviation ${(deviation * 100).toFixed(1)}% (>30%)` : null
  };
}

// ============================================
// LAYER 2 — TEMPORAL CONSISTENCY
// ============================================

function validateTemporalConsistency(current, previous) {
  if (!previous) {
    return { score: 1.0, status: 'FIRST_READING', genChange: 0, flowChange: 0, headChange: 0, reason: null };
  }

  const genChange  = Math.abs(current.generatedKwh        - previous.generatedKwh)        / (previous.generatedKwh        || 1);
  const flowChange = Math.abs(current.flowRate_m3_per_s   - previous.flowRate_m3_per_s)   / (previous.flowRate_m3_per_s   || 1);
  const headChange = Math.abs(current.headHeight_m        - previous.headHeight_m)        / (previous.headHeight_m        || 1);

  let score = 1.0;
  if      (genChange < 0.10) score *= 1.00;
  else if (genChange < 0.20) score *= 0.95;
  else if (genChange < 0.30) score *= 0.85;
  else if (genChange < 0.50) score *= 0.70;
  else                        score *= 0.30;

  if      (flowChange < 0.15) score *= 1.00;
  else if (flowChange < 0.30) score *= 0.95;
  else if (flowChange < 0.50) score *= 0.80;
  else                         score *= 0.50;

  if      (headChange < 0.05) score *= 1.00;
  else if (headChange < 0.10) score *= 0.95;
  else if (headChange < 0.20) score *= 0.80;
  else                         score *= 0.50;

  let status = 'PASS';
  if      (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return {
    score:       parseFloat(score.toFixed(4)),
    status,
    genChange:   parseFloat((genChange * 100).toFixed(2)),
    flowChange:  parseFloat((flowChange * 100).toFixed(2)),
    headChange:  parseFloat((headChange * 100).toFixed(2)),
    reason:      status === 'FAIL' ? 'Excessive temporal variation' : null
  };
}

// ============================================
// LAYER 3 — ENVIRONMENTAL BOUNDS
// ============================================

function validateEnvironmentalBounds(reading, siteConfig = {}) {
  const bounds = {
    pH:                  { min: 6.5, max: 8.5, acceptable: { min: 6.0, max: 9.0 }, questionable: { min: 5.5, max: 9.5 } },
    turbidity_ntu:       { min: 0,   max: 50,  acceptable: { min: 0,   max: 100 }, questionable: { min: 0,   max: 200 } },
    temperature_celsius: { min: 0,   max: 30,  acceptable: { min: -5,  max: 35  }, questionable: { min: -10, max: 40  } }
  };

  let score = 1.0;
  const details = {};

  function checkParam(val, b, name) {
    if (val === undefined || val === null) return;
    if (val >= b.min && val <= b.max) {
      details[name] = { value: val, status: 'PERFECT', score: 1.0 };
    } else if (val >= b.acceptable.min && val <= b.acceptable.max) {
      details[name] = { value: val, status: 'ACCEPTABLE', score: 0.95 };
      score *= 0.95;
    } else if (val >= b.questionable.min && val <= b.questionable.max) {
      details[name] = { value: val, status: 'QUESTIONABLE', score: 0.80 };
      score *= 0.80;
    } else {
      details[name] = { value: val, status: 'OUT_OF_RANGE', score: 0.30 };
      score *= 0.30;
    }
  }

  checkParam(reading.pH,                  bounds.pH,                  'pH');
  checkParam(reading.turbidity_ntu,       bounds.turbidity_ntu,       'turbidity');
  checkParam(reading.temperature_celsius, bounds.temperature_celsius, 'temperature');

  let status = 'PASS';
  if      (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return { score: parseFloat(score.toFixed(4)), status, details, reason: status === 'FAIL' ? 'Environmental out of range' : null };
}

// ============================================
// LAYER 4 — ML ANOMALY DETECTION  🤖
//           Isolation Forest (real ML)
// ============================================

function detectStatisticalAnomalies(current, _history) {
  const ml = mlDetector.detect(current);

  let score, status;

  if (!ml.isAnomaly) {
    score  = ml.confidence > 0.6 ? 1.0 : 0.90;
    status = ml.confidence > 0.6 ? 'NORMAL' : 'ACCEPTABLE';
  } else {
    if      (ml.confidence < 0.30) { score = 0.70; status = 'QUESTIONABLE'; }
    else if (ml.confidence < 0.60) { score = 0.50; status = 'SUSPICIOUS';   }
    else                            { score = 0.20; status = 'OUTLIER';      }
  }

  return {
    score:         parseFloat(score.toFixed(4)),
    status,
    method:        ml.method,
    anomalyScore:  ml.score,
    isAnomaly:     ml.isAnomaly,
    confidence:    ml.confidence,
    trainedOn:     ml.trainedOn,
    trainedAt:     ml.trainedAt,
    featureVector: ml.featureVector,
    zScore:  null,
    mean:    null,
    stdDev:  null,
    reason:  ml.isAnomaly
      ? `ML Isolation Forest anomaly (score=${ml.score.toFixed(3)}, confidence=${(ml.confidence*100).toFixed(0)}%)`
      : null
  };
}

// ============================================
// LAYER 5 — DEVICE CONSISTENCY
// ============================================

function validateConsistency(reading, deviceProfile = {}) {
  const { capacity = 1000, maxFlow = 10, maxHead = 500, minEfficiency = 0.70 } = deviceProfile;
  let score = 1.0;
  const details = {};

  if (reading.generatedKwh      <= capacity)   { details.capacity   = { status: 'OK',          score: 1.00 }; }
  else                                          { details.capacity   = { status: 'EXCEEDS',      score: 0.50 }; score *= 0.50; }

  if (reading.flowRate_m3_per_s  <= maxFlow)   { details.flow       = { status: 'OK',          score: 1.00 }; }
  else                                          { details.flow       = { status: 'EXCEEDS',      score: 0.50 }; score *= 0.50; }

  if (reading.headHeight_m       <= maxHead)   { details.head       = { status: 'OK',          score: 1.00 }; }
  else                                          { details.head       = { status: 'EXCEEDS',      score: 0.50 }; score *= 0.50; }

  const eff = reading.efficiency ?? 0.85;
  if (eff >= minEfficiency && eff <= 0.95)     { details.efficiency = { status: 'OK',          score: 1.00 }; }
  else                                          { details.efficiency = { status: 'OUT_OF_RANGE', score: 0.70 }; score *= 0.70; }

  let status = 'PASS';
  if      (score < 0.50) status = 'FAIL';
  else if (score < 0.85) status = 'WARN';

  return { score: parseFloat(score.toFixed(4)), status, details, reason: status === 'FAIL' ? 'Device consistency failed' : null };
}

// ============================================
// WEIGHTED TRUST SCORE (5 layers)
// ============================================

function calculateTrustScore(results) {
  const weights = { physics: 0.30, temporal: 0.25, environmental: 0.20, statistical: 0.15, consistency: 0.10 };
  return parseFloat((
    results.physics.score       * weights.physics      +
    results.temporal.score      * weights.temporal     +
    results.environmental.score * weights.environmental +
    results.statistical.score   * weights.statistical  +
    results.consistency.score   * weights.consistency
  ).toFixed(4));
}

function determineVerificationStatus(trustScore, config = {}) {
  const autoApprove  = config.autoApproveThreshold  ?? 0.90;
  const manualReview = config.manualReviewThreshold ?? 0.50;
  let status, method, reasoning;

  if      (trustScore >= autoApprove)  { status = 'APPROVED'; method = 'AI_AUTO_APPROVED';       reasoning = `High confidence (${(trustScore*100).toFixed(1)}%). All checks passed.`;             }
  else if (trustScore >= manualReview) { status = 'FLAGGED';  method = 'MANUAL_REVIEW_REQUIRED';  reasoning = `Medium confidence (${(trustScore*100).toFixed(1)}%). Some checks questionable.`; }
  else                                  { status = 'REJECTED'; method = 'FAILED_VERIFICATION';    reasoning = `Low confidence (${(trustScore*100).toFixed(1)}%). Multiple checks failed.`;       }

  return { status, method, reasoning };
}

// ============================================
// ACM0002 CARBON CALCULATIONS
// ============================================

function calculateBaselineEmissions(egMWh, efGrid) {
  return parseFloat((egMWh * efGrid).toFixed(6));
}

function calculateEmissionReductions(be, pe = 0, le = 0) {
  return parseFloat((be - pe - le).toFixed(6));
}

// ============================================
// ENGINE V1 CLASS
// ============================================

class EngineV1 {
  constructor(config = {}) {
    this.config = {
      autoApproveThreshold:  0.90,
      manualReviewThreshold: 0.50,
      siteConfig:    {},
      deviceProfile: { capacity: 1000, maxFlow: 10, maxHead: 500, minEfficiency: 0.70 },
      ...config
    };
    this.historyByDevice = new Map();
  }

  getHistory(deviceId) {
    if (!this.historyByDevice.has(deviceId)) this.historyByDevice.set(deviceId, []);
    return this.historyByDevice.get(deviceId);
  }

  async verifyAndPublish(telemetry) {
    const deviceId = telemetry.deviceId;
    const history  = this.getHistory(deviceId);
    const previous = history[history.length - 1];

    const physics       = validatePhysicsConstraints(telemetry.readings);
    const temporal      = validateTemporalConsistency(telemetry.readings, previous);
    const environmental = validateEnvironmentalBounds(telemetry.readings, this.config.siteConfig);
    const statistical   = detectStatisticalAnomalies(telemetry.readings, history);
    const consistency   = validateConsistency(telemetry.readings, this.config.deviceProfile);

    const validationResults = { physics, temporal, environmental, statistical, consistency };
    const trustScore        = calculateTrustScore(validationResults);
    const decision          = determineVerificationStatus(trustScore, this.config);

    const egMWh = telemetry.readings.generatedKwh / 1000;
    const be    = calculateBaselineEmissions(egMWh, EF_GRID);
    const er    = calculateEmissionReductions(be, 0, 0);

    const attestation = {
      deviceId,
      timestamp:          telemetry.timestamp,
      verificationStatus: decision.status,
      verificationMethod: decision.method,
      trustScore,
      reasoning:          decision.reasoning,
      mlEngine: {
        algorithm: 'IsolationForest',
        reference: 'Liu, Ting & Zhou, ICDM 2008',
        trainedOn: statistical.trainedOn,
        trainedAt: statistical.trainedAt
      },
      checks: { physics, temporal, environmental, statistical, consistency },
      calculations: {
        EG_MWh:               parseFloat(egMWh.toFixed(6)),
        EF_grid_tCO2_per_MWh: EF_GRID,
        BE_tCO2:              be,
        PE_tCO2:              0,
        LE_tCO2:              0,
        ER_tCO2:              er,
        RECs_issued:          decision.status === 'APPROVED' ? er : 0
      }
    };

    const hedera       = getClient();
    const auditTopicId = getAuditTopicId();
    let transactionId  = `mock-${Date.now()}`;
    let status         = 'MOCK';

    if (hedera && auditTopicId) {
      try {
        const topicId = TopicId.fromString(auditTopicId);
        const message = Buffer.from(JSON.stringify(attestation));
        const tx = await new TopicMessageSubmitTransaction()
          .setTopicId(topicId)
          .setMessage(message)
          .freezeWith(hedera.client)
          .sign(hedera.operatorKey);
        const resp    = await tx.execute(hedera.client);
        const receipt = await resp.getReceipt(hedera.client);
        transactionId = resp.transactionId.toString();
        status        = receipt.status.toString();
        console.log(`[EngineV1] HCS published: ${transactionId}`);
      } catch (error) {
        console.warn(`[EngineV1] HCS submission failed: ${error.message}`);
      }
    } else {
      console.warn('[EngineV1] MOCK mode — no real Hedera tx. Check env vars.');
    }

    history.push(telemetry.readings);
    return { attestation, transactionId, status, topicId: auditTopicId || null };
  }

  async verifyBatch(telemetryArray) {
    const results  = [];
    for (const t of telemetryArray) results.push(await this.verifyAndPublish(t));
    const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED').length;
    const flagged  = results.filter(r => r.attestation.verificationStatus === 'FLAGGED').length;
    const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED').length;
    const avgTrust = results.reduce((s, r) => s + r.attestation.trustScore, 0) / results.length;
    return { totalReadings: results.length, approved, flagged, rejected, averageTrustScore: parseFloat(avgTrust.toFixed(4)), results };
  }
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const cmd  = args[0];

  if (cmd === 'submit') {
    const deviceId = args[1] || 'TURBINE-1';
    const flow     = parseFloat(args[2] || '2.5');
    const head     = parseFloat(args[3] || '45');
    const gen      = parseFloat(args[4] || '156');
    const ph       = parseFloat(args[5] || '7.2');

    const engine  = new EngineV1();
    const telemetry = {
      deviceId,
      timestamp: new Date().toISOString(),
      readings:  { flowRate_m3_per_s: flow, headHeight_m: head, generatedKwh: gen, pH: ph, turbidity_ntu: 10, temperature_celsius: 18 }
    };

    console.log('Submitting telemetry:', telemetry);
    try {
      const result = await engine.verifyAndPublish(telemetry);
      console.log('\n=== ENGINE V1 RESULT ===');
      console.log('Decision:    ', result.attestation.verificationStatus);
      console.log('Trust Score: ', result.attestation.trustScore);
      console.log('ML Method:   ', result.attestation.mlEngine.algorithm);
      console.log('ML Status:   ', result.attestation.checks.statistical.status);
      console.log('ML Score:    ', result.attestation.checks.statistical.anomalyScore);
      console.log('ER (tCO2):   ', result.attestation.calculations.ER_tCO2);
      console.log('RECs issued: ', result.attestation.calculations.RECs_issued);
      console.log('Hedera TX:   ', result.transactionId);
    } catch (err) {
      console.error('Submission failed:', err.message);
    }
    const hedera = getClient();
    if (hedera && hedera.client) await hedera.client.close();
  } else {
    console.log('Usage:   node engine-v1.js submit <deviceId> <flow> <head> <generatedKwh> <pH>');
    console.log('Example: node engine-v1.js submit TURBINE-1 2.5 45 156 7.2');
  }
}

if (require.main === module) main().catch(console.error);

module.exports = { EngineV1 };
