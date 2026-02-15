const {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId,
  TopicId,
  Hbar
} = require('@hashgraph/sdk');
const { EngineV1 } = require('./engine-v1');
const fs = require('fs');
require('dotenv').config();

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY;
const AUDIT_TOPIC_ID = process.env.AUDIT_TOPIC_ID;

if (!OPERATOR_ID || !OPERATOR_KEY_STR || !AUDIT_TOPIC_ID) {
  throw new Error("Missing HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY / AUDIT_TOPIC_ID in .env");
}

const operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
const client = Client.forTestnet();
client.setOperator(AccountId.fromString(OPERATOR_ID), operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(2));

// ============================================
// DEVICE STATE MANAGEMENT
// ============================================

class DeviceStateManager {
  constructor() {
    this.devices = new Map();
    this.stateFile = 'device-states.json';
    this.loadStates();
  }

  loadStates() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.devices = new Map(Object.entries(data));
        console.log(`✓ Loaded ${this.devices.size} device state(s) from ${this.stateFile}`);
      }
    } catch (err) {
      console.warn('⚠ Could not load device states:', err.message);
    }
  }

  saveStates() {
    try {
      const data = Object.fromEntries(this.devices);
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('✗ Could not save device states:', err.message);
    }
  }

  getDevice(deviceId) {
    if (!this.devices.has(deviceId)) {
      this.devices.set(deviceId, {
        deviceId,
        mode: 'strict',
        deploymentDate: new Date().toISOString(),
        totalReadings: 0,
        approvedReadings: 0,
        flaggedReadings: 0,
        rejectedReadings: 0,
        anomalyCount: 0,
        lastMaintenanceDate: null,
        vvbApprovalReceived: false,
        graduationEligible: false,
        history: []
      });
    }
    return this.devices.get(deviceId);
  }

  updateDevice(deviceId, result) {
    const device = this.getDevice(deviceId);
    device.totalReadings++;
    
    if (result.attestation.verificationStatus === 'APPROVED') {
      device.approvedReadings++;
    } else if (result.attestation.verificationStatus === 'FLAGGED') {
      device.flaggedReadings++;
    } else if (result.attestation.verificationStatus === 'REJECTED') {
      device.rejectedReadings++;
      device.anomalyCount++;
    }

    device.history.push({
      timestamp: result.attestation.timestamp,
      trustScore: result.attestation.trustScore,
      decision: result.attestation.verificationStatus
    });

    // Keep only last 1000 readings in history
    if (device.history.length > 1000) {
      device.history = device.history.slice(-1000);
    }

    this.saveStates();
    return device;
  }

  checkGraduationEligibility(deviceId, config) {
    const device = this.getDevice(deviceId);
    
    const deploymentDate = new Date(device.deploymentDate);
    const now = new Date();
    const operationalDays = (now - deploymentDate) / (1000 * 60 * 60 * 24);
    
    const recent = device.history.slice(-90 * 24); // Last 90 days (assuming hourly)
    const recentRejections = recent.filter(r => r.decision === 'REJECTED').length;
    const anomalyRate = recent.length > 0 ? recentRejections / recent.length : 0;
    
    const dataQuality = device.totalReadings > 0 
      ? (device.approvedReadings + device.flaggedReadings) / device.totalReadings 
      : 0;

    const eligible = 
      operationalDays >= config.minOperationalDays &&
      anomalyRate < config.maxAnomalyRatePercent / 100 &&
      dataQuality >= config.minDataQualityPercent / 100 &&
      device.vvbApprovalReceived;

    return {
      eligible,
      operationalDays: parseFloat(operationalDays.toFixed(1)),
      anomalyRate: parseFloat((anomalyRate * 100).toFixed(2)),
      dataQuality: parseFloat((dataQuality * 100).toFixed(2)),
      vvbApproved: device.vvbApprovalReceived
    };
  }

  checkReversionTriggers(deviceId) {
    const device = this.getDevice(deviceId);
    
    // Check last 7 days (168 hours)
    const recentWeek = device.history.slice(-168);
    const weeklyRejections = recentWeek.filter(r => r.decision === 'REJECTED').length;
    const weeklyRejectionRate = recentWeek.length > 0 ? weeklyRejections / recentWeek.length : 0;

    if (weeklyRejectionRate > 0.05) {
      return {
        shouldRevert: true,
        reason: `Critical anomaly spike: ${(weeklyRejectionRate * 100).toFixed(1)}% rejections in last 7 days`
      };
    }

    return { shouldRevert: false };
  }

  graduateDevice(deviceId) {
    const device = this.getDevice(deviceId);
    device.mode = 'evidence-rich';
    device.graduationDate = new Date().toISOString();
    this.saveStates();
    return device;
  }

  revertDevice(deviceId, reason) {
    const device = this.getDevice(deviceId);
    device.mode = 'strict';
    device.reversionDate = new Date().toISOString();
    device.reversionReason = reason;
    device.vvbApprovalReceived = false; // Require re-approval
    this.saveStates();
    return device;
  }

  grantVVBApproval(deviceId) {
    const device = this.getDevice(deviceId);
    device.vvbApprovalReceived = true;
    device.vvbApprovalDate = new Date().toISOString();
    this.saveStates();
    return device;
  }
}

// ============================================
// SAMPLING COORDINATOR
// ============================================

class SamplingCoordinator {
  constructor(mode, config = {}) {
    this.mode = mode;
    this.config = config;
  }

  determineSamplingRate(device) {
    let baseRate = (this.mode === 'strict') ? 0.30 : 0.05;

    // Risk adjustments
    const deploymentDate = new Date(device.deploymentDate);
    const now = new Date();
    const operationalDays = (now - deploymentDate) / (1000 * 60 * 60 * 24);

    if (operationalDays < 180) {
      baseRate += 0.05; // New device bonus
    }

    const recent = device.history.slice(-168); // Last 7 days
    const recentAnomalies = recent.filter(r => r.decision === 'REJECTED').length;
    const anomalyRate = recent.length > 0 ? recentAnomalies / recent.length : 0;

    if (anomalyRate > 0.02) {
      baseRate += 0.10; // Recent anomaly bonus
    }

    return Math.min(baseRate, 1.0);
  }

  shouldSampleReading(result, device) {
    // Always review FLAGGED and REJECTED
    if (result.attestation.verificationStatus !== 'APPROVED') {
      return true;
    }

    // Probabilistic sampling of APPROVED readings
    const samplingRate = this.determineSamplingRate(device);
    return Math.random() < samplingRate;
  }

  selectSamplesFromBatch(results, device) {
    const samplingRate = this.determineSamplingRate(device);
    const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED');
    const sampleCount = Math.ceil(approved.length * samplingRate);

    // Random sampling
    const shuffled = approved.sort(() => Math.random() - 0.5);
    const samples = shuffled.slice(0, sampleCount);

    return {
      samplingRate: parseFloat(samplingRate.toFixed(3)),
      totalApproved: approved.length,
      sampleCount,
      samples: samples.map(s => ({
        deviceId: s.attestation.deviceId,
        timestamp: s.attestation.timestamp,
        trustScore: s.attestation.trustScore
      }))
    };
  }
}

// ============================================
// EVIDENCE PACKAGE GENERATOR
// ============================================

class EvidencePackageGenerator {
  generatePackage(batch, mode, device) {
    if (mode !== 'evidence-rich') {
      return null;
    }

    // Extract 5 random sample readings
    const approved = batch.filter(r => r.attestation.verificationStatus === 'APPROVED');
    const sampleReadings = approved
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(5, approved.length))
      .map(r => ({
        deviceId: r.attestation.deviceId,
        timestamp: r.attestation.timestamp,
        trustScore: r.attestation.trustScore,
        checks: r.attestation.checks,
        calculations: r.attestation.calculations
      }));

    // Statistical summary
    const trustScores = batch.map(r => r.attestation.trustScore);
    const mean = trustScores.reduce((a, b) => a + b, 0) / trustScores.length;
    const variance = trustScores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / trustScores.length;
    const stdDev = Math.sqrt(variance);

    const outliers = batch.filter(r => {
      const z = Math.abs((r.attestation.trustScore - mean) / stdDev);
      return z > 3;
    }).length;

    // Device baseline (from history)
    const historicalScores = device.history.slice(-1000).map(h => h.trustScore);
    const deviceMean = historicalScores.length > 0
      ? historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length
      : 0;

    return {
      mode: 'evidence-rich',
      derivationLogs: batch.map(r => ({
        deviceId: r.attestation.deviceId,
        timestamp: r.attestation.timestamp,
        checks: r.attestation.checks
      })),
      sampleReadings,
      statisticalSummary: {
        count: batch.length,
        mean: parseFloat(mean.toFixed(4)),
        stdDev: parseFloat(stdDev.toFixed(4)),
        outliers,
        approvalRate: parseFloat((approved.length / batch.length * 100).toFixed(2))
      },
      baselineComparison: {
        deviceBaseline: parseFloat(deviceMean.toFixed(4)),
        currentBatchMean: parseFloat(mean.toFixed(4)),
        deviation: deviceMean !== 0 ? parseFloat(((mean - deviceMean) / deviceMean * 100).toFixed(2)) : 0
      }
    };
  }
}

// ============================================
// ENGINE V2 MAIN CLASS
// ============================================

class EngineV2 {
  constructor(configFile = null) {
    // Load config from file or use defaults
    this.config = configFile ? this.loadConfig(configFile) : this.getDefaultConfig();
    
    this.mode = this.config.verification.mode;
    this.deviceStateManager = new DeviceStateManager();
    this.samplingCoordinator = new SamplingCoordinator(this.mode, this.config.verification.samplingStrategy);
    this.evidenceGenerator = new EvidencePackageGenerator();
    
    // Underlying ENGINE V1
    this.engineV1 = new EngineV1({
      autoApproveThreshold: this.config.verification.thresholds.autoApprove,
      manualReviewThreshold: this.config.verification.thresholds.flag,
      siteConfig: this.config.verification.siteConfig || {},
      deviceProfile: this.config.verification.deviceProfile || {}
    });

    console.log(`✓ ENGINE V2 initialized in ${this.mode.toUpperCase()} mode`);
    console.log(`  Auto-approve threshold: ${this.config.verification.thresholds.autoApprove}`);
    console.log(`  Base sampling rate: ${this.config.verification.samplingStrategy.baseRate * 100}%`);
  }

  loadConfig(configFile) {
    try {
      const data = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('⚠ Could not load config file, using defaults:', err.message);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      projectId: "HYDRO-001",
      verification: {
        mode: "strict",
        thresholds: {
          autoApprove: 0.97,
          flag: 0.50,
          reject: 0.50
        },
        samplingStrategy: {
          method: "stratified",
          baseRate: 0.30,
          riskAdjustments: {
            newDeviceBonus: 0.05,
            recentAnomalyBonus: 0.10,
            lowTrustScoreBonus: 0.05
          }
        },
        graduationCriteria: {
          enabled: true,
          minOperationalDays: 180,
          maxAnomalyRatePercent: 2.0,
          minDataQualityPercent: 95.0,
          vvbApprovalRequired: true,
          autoGraduate: false
        },
        evidenceGeneration: {
          derivationLogs: true,
          sampleReadings: 5,
          statisticalSummary: true,
          baselineComparison: true
        }
      }
    };
  }

  async verifyAndPublish(telemetry) {
    // Run ENGINE V1 verification
    const result = await this.engineV1.verifyAndPublish(telemetry);

    // Update device state
    const device = this.deviceStateManager.updateDevice(telemetry.deviceId, result);

    // Check if sampling is needed
    const shouldSample = this.samplingCoordinator.shouldSampleReading(result, device);

    // Add ENGINE V2 metadata
    result.engineV2 = {
      mode: this.mode,
      samplingRequired: shouldSample,
      deviceState: {
        totalReadings: device.totalReadings,
        approvalRate: parseFloat((device.approvedReadings / device.totalReadings * 100).toFixed(2)),
        anomalyRate: parseFloat((device.anomalyCount / device.totalReadings * 100).toFixed(2))
      }
    };

    return result;
  }

  async verifyBatch(telemetryArray) {
    const results = [];

    for (const telemetry of telemetryArray) {
      const result = await this.verifyAndPublish(telemetry);
      results.push(result);
    }

    const device = this.deviceStateManager.getDevice(telemetryArray[0].deviceId);

    // Generate sampling report
    const samplingReport = this.samplingCoordinator.selectSamplesFromBatch(results, device);

    // Generate evidence package (Mode B only)
    const evidencePackage = this.evidenceGenerator.generatePackage(results, this.mode, device);

    const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED').length;
    const flagged = results.filter(r => r.attestation.verificationStatus === 'FLAGGED').length;
    const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED').length;
    const avgTrust = results.reduce((sum, r) => sum + r.attestation.trustScore, 0) / results.length;

    return {
      mode: this.mode,
      totalReadings: results.length,
      approved,
      flagged,
      rejected,
      averageTrustScore: parseFloat(avgTrust.toFixed(4)),
      samplingReport,
      evidencePackage,
      results
    };
  }

  checkGraduation(deviceId) {
    return this.deviceStateManager.checkGraduationEligibility(
      deviceId,
      this.config.verification.graduationCriteria
    );
  }

  async graduateDevice(deviceId) {
    const eligibility = this.checkGraduation(deviceId);
    
    if (!eligibility.eligible) {
      throw new Error(`Device ${deviceId} not eligible for graduation. Check criteria: ${JSON.stringify(eligibility)}`);
    }

    const device = this.deviceStateManager.graduateDevice(deviceId);

    // Update mode and thresholds
    this.mode = 'evidence-rich';
    this.config.verification.mode = 'evidence-rich';
    this.config.verification.thresholds.autoApprove = 0.90;
    this.config.verification.samplingStrategy.baseRate = 0.05;
    this.samplingCoordinator = new SamplingCoordinator(this.mode, this.config.verification.samplingStrategy);
    this.engineV1.config.autoApproveThreshold = 0.90;

    // Publish graduation event to HCS
    const event = {
      eventType: 'DEVICE_GRADUATION',
      deviceId,
      fromMode: 'strict',
      toMode: 'evidence-rich',
      timestamp: new Date().toISOString(),
      eligibility
    };

    const topicId = TopicId.fromString(AUDIT_TOPIC_ID);
    const message = Buffer.from(JSON.stringify(event));
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);
    const receipt = await tx.getReceipt(client);

    console.log(`✓ Device ${deviceId} graduated to EVIDENCE-RICH mode`);
    console.log(`  Transaction: ${tx.transactionId.toString()}`);

    return {
      device,
      event,
      transactionId: tx.transactionId.toString()
    };
  }

  async revertDevice(deviceId, reason) {
    const device = this.deviceStateManager.revertDevice(deviceId, reason);

    // Update mode and thresholds
    this.mode = 'strict';
    this.config.verification.mode = 'strict';
    this.config.verification.thresholds.autoApprove = 0.97;
    this.config.verification.samplingStrategy.baseRate = 0.30;
    this.samplingCoordinator = new SamplingCoordinator(this.mode, this.config.verification.samplingStrategy);
    this.engineV1.config.autoApproveThreshold = 0.97;

    // Publish reversion event to HCS
    const event = {
      eventType: 'DEVICE_REVERSION',
      deviceId,
      fromMode: 'evidence-rich',
      toMode: 'strict',
      reason,
      timestamp: new Date().toISOString()
    };

    const topicId = TopicId.fromString(AUDIT_TOPIC_ID);
    const message = Buffer.from(JSON.stringify(event));
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    console.log(`⚠ Device ${deviceId} reverted to STRICT mode`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Transaction: ${tx.transactionId.toString()}`);

    return {
      device,
      event,
      transactionId: tx.transactionId.toString()
    };
  }

  checkAutoReversion(deviceId) {
    const reversionCheck = this.deviceStateManager.checkReversionTriggers(deviceId);
    
    if (reversionCheck.shouldRevert && this.mode === 'evidence-rich') {
      return this.revertDevice(deviceId, reversionCheck.reason);
    }

    return { reverted: false };
  }

  grantVVBApproval(deviceId) {
    const device = this.deviceStateManager.grantVVBApproval(deviceId);
    console.log(`✓ VVB approval granted for device ${deviceId}`);
    return device;
  }

  getDeviceStatus(deviceId) {
    const device = this.deviceStateManager.getDevice(deviceId);
    const eligibility = this.checkGraduation(deviceId);
    const reversion = this.deviceStateManager.checkReversionTriggers(deviceId);

    return {
      device,
      eligibility,
      reversion,
      currentMode: this.mode
    };
  }
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "init") {
    const mode = args[1] || "strict";
    const configFile = `config-${mode}.json`;

    const config = {
      projectId: "HYDRO-001",
      verification: {
        mode,
        thresholds: {
          autoApprove: mode === "strict" ? 0.97 : 0.90,
          flag: 0.50,
          reject: 0.50
        },
        samplingStrategy: {
          method: "stratified",
          baseRate: mode === "strict" ? 0.30 : 0.05,
          riskAdjustments: {
            newDeviceBonus: 0.05,
            recentAnomalyBonus: 0.10,
            lowTrustScoreBonus: 0.05
          }
        },
        graduationCriteria: {
          enabled: true,
          minOperationalDays: 180,
          maxAnomalyRatePercent: 2.0,
          minDataQualityPercent: 95.0,
          vvbApprovalRequired: true,
          autoGraduate: false
        },
        evidenceGeneration: {
          derivationLogs: true,
          sampleReadings: 5,
          statisticalSummary: true,
          baselineComparison: true
        }
      }
    };

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`✓ Created config file: ${configFile}`);
    console.log(`  Mode: ${mode.toUpperCase()}`);
    console.log(`  Auto-approve threshold: ${config.verification.thresholds.autoApprove}`);

  } else if (cmd === "submit") {
    const configFile = args[1];
    const deviceId = args[2] || "TURBINE-1";
    const flow = parseFloat(args[3]);
    const head = parseFloat(args[4]);
    const gen = parseFloat(args[5]);
    const ph = parseFloat(args[6]);

    const engine = new EngineV2(configFile);

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

    console.log("\n=== Submitting Telemetry ===");
    console.log(`Device: ${deviceId}`);
    console.log(`Generated: ${gen} kWh`);

    const result = await engine.verifyAndPublish(telemetry);

    console.log("\n=== ENGINE V2 RESULT ===");
    console.log(`Mode: ${result.engineV2.mode.toUpperCase()}`);
    console.log(`Decision: ${result.attestation.verificationStatus}`);
    console.log(`Trust Score: ${result.attestation.trustScore}`);
    console.log(`Sampling Required: ${result.engineV2.samplingRequired ? 'YES' : 'NO'}`);
    console.log(`\nDevice Stats:`);
    console.log(`  Total Readings: ${result.engineV2.deviceState.totalReadings}`);
    console.log(`  Approval Rate: ${result.engineV2.deviceState.approvalRate}%`);
    console.log(`  Anomaly Rate: ${result.engineV2.deviceState.anomalyRate}%`);
    console.log(`\nRECs Issued: ${result.attestation.calculations.RECs_issued} tCO2`);
    console.log(`Transaction: ${result.transactionId}`);

  } else if (cmd === "status") {
    const configFile = args[1];
    const deviceId = args[2] || "TURBINE-1";

    const engine = new EngineV2(configFile);
    const status = engine.getDeviceStatus(deviceId);

    console.log("\n=== DEVICE STATUS ===");
    console.log(`Device: ${deviceId}`);
    console.log(`Current Mode: ${status.currentMode.toUpperCase()}`);
    console.log(`\nOperational Stats:`);
    console.log(`  Deployment Date: ${status.device.deploymentDate}`);
    console.log(`  Total Readings: ${status.device.totalReadings}`);
    console.log(`  Approved: ${status.device.approvedReadings}`);
    console.log(`  Flagged: ${status.device.flaggedReadings}`);
    console.log(`  Rejected: ${status.device.rejectedReadings}`);
    console.log(`\nGraduation Eligibility:`);
    console.log(`  Eligible: ${status.eligibility.eligible ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  Operational Days: ${status.eligibility.operationalDays} (need 180)`);
    console.log(`  Anomaly Rate: ${status.eligibility.anomalyRate}% (need <2%)`);
    console.log(`  Data Quality: ${status.eligibility.dataQuality}% (need >95%)`);
    console.log(`  VVB Approved: ${status.eligibility.vvbApproved ? 'YES' : 'NO'}`);

  } else if (cmd === "graduate") {
    const configFile = args[1];
    const deviceId = args[2] || "TURBINE-1";

    const engine = new EngineV2(configFile);
    const result = await engine.graduateDevice(deviceId);

    console.log("\n✓ GRADUATION SUCCESSFUL");
    console.log(`Device: ${deviceId}`);
    console.log(`New Mode: EVIDENCE-RICH`);
    console.log(`Transaction: ${result.transactionId}`);

  } else if (cmd === "approve-vvb") {
    const configFile = args[1];
    const deviceId = args[2] || "TURBINE-1";

    const engine = new EngineV2(configFile);
    engine.grantVVBApproval(deviceId);

  } else {
    console.log("ENGINE V2 - Two-Tier Verification System");
    console.log("");
    console.log("Commands:");
    console.log("  node engine-v2.js init [mode]                           # Create config (strict/evidence-rich)");
    console.log("  node engine-v2.js submit <config> <device> <params...>  # Submit reading");
    console.log("  node engine-v2.js status <config> <device>              # Check device status");
    console.log("  node engine-v2.js graduate <config> <device>            # Graduate to Mode B");
    console.log("  node engine-v2.js approve-vvb <config> <device>         # Grant VVB approval");
    console.log("");
    console.log("Examples:");
    console.log("  node engine-v2.js init strict");
    console.log("  node engine-v2.js submit config-strict.json TURBINE-1 2.5 45 900 7.2");
    console.log("  node engine-v2.js status config-strict.json TURBINE-1");
    console.log("  node engine-v2.js approve-vvb config-strict.json TURBINE-1");
    console.log("  node engine-v2.js graduate config-strict.json TURBINE-1");
  }

  await client.close();
}

main().catch(console.error);

module.exports = { EngineV2 };
