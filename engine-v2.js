const {
  Client,
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId,
  TopicId,
  Hbar
} = require('@hashgraph/sdk');
const { EngineV1 } = require('./engine-v1');
const SmartSampler = require('./smart-sampler');
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
    const recent = device.history.slice(-90 * 24);
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
    device.vvbApprovalReceived = false;
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
class EngineV2 {
  constructor(configFile = null) {
    this.config = configFile ? this.loadConfig(configFile) : this.getDefaultConfig();
    this.mode = this.config.verification.mode;
    this.deviceStateManager = new DeviceStateManager();
    this.smartSampler = new SmartSampler({
      stratified: this.config.verification.samplingStrategy?.stratified ?? true,
      confidenceLevel: this.config.verification.samplingStrategy?.confidenceLevel || 0.95,
      highRiskRate: this.config.verification.samplingStrategy?.highRiskRate || 0.30,
      mediumRiskRate: this.config.verification.samplingStrategy?.mediumRiskRate || 0.10,
      lowRiskRate: this.config.verification.samplingStrategy?.lowRiskRate || 0.03
    });
    this.engineV1 = new EngineV1({
      autoApproveThreshold: this.config.verification.thresholds.autoApprove,
      manualReviewThreshold: this.config.verification.thresholds.flag,
      siteConfig: this.config.verification.siteConfig || {},
      deviceProfile: this.config.verification.deviceProfile || {}
    });
    console.log(`✓ ENGINE V2 initialized in ${this.mode.toUpperCase()} mode`);
    console.log(`  Auto-approve threshold: ${this.config.verification.thresholds.autoApprove}`);
    console.log(`  Smart Sampling: ${this.smartSampler.stratifiedEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  Confidence Level: ${(this.smartSampler.confidenceLevel * 100).toFixed(0)}%`);
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
          stratified: true,
          confidenceLevel: 0.95,
          highRiskRate: 0.30,
          mediumRiskRate: 0.10,
          lowRiskRate: 0.03
        },
        graduationCriteria: {
          enabled: true,
          minOperationalDays: 180,
          maxAnomalyRatePercent: 2.0,
          minDataQualityPercent: 95.0,
          vvbApprovalRequired: true
        }
      }
    };
  }
  async verifyAndPublish(telemetry) {
    const result = await this.engineV1.verifyAndPublish(telemetry);
    const device = this.deviceStateManager.updateDevice(telemetry.deviceId, result);
    result.engineV2 = {
      mode: this.mode,
      deviceState: {
        totalReadings: device.totalReadings,
        approvalRate: device.totalReadings > 0
          ? parseFloat((device.approvedReadings / device.totalReadings * 100).toFixed(2))
          : 0,
        anomalyRate: device.totalReadings > 0
          ? parseFloat((device.anomalyCount / device.totalReadings * 100).toFixed(2))
          : 0
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
    const samplingReport = this.smartSampler.generateSamplingReport(results, device);
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
      throw new Error(`Device ${deviceId} not eligible for graduation`);
    }
    const device = this.deviceStateManager.graduateDevice(deviceId);
    this.mode = 'evidence-rich';
    this.config.verification.mode = 'evidence-rich';
    this.config.verification.thresholds.autoApprove = 0.90;
    this.engineV1.config.autoApproveThreshold = 0.90;
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
    console.log(`✓ Device ${deviceId} graduated to EVIDENCE-RICH mode`);
    console.log(`  Transaction: ${tx.transactionId.toString()}`);
    return {
      device,
      event,
      transactionId: tx.transactionId.toString()
    };
  }
  grantVVBApproval(deviceId) {
    const device = this.deviceStateManager.grantVVBApproval(deviceId);
    console.log(`✓ VVB approval granted for device ${deviceId}`);
    return device;
  }
  getDeviceStatus(deviceId) {
    const device = this.deviceStateManager.getDevice(deviceId);
    const eligibility = this.checkGraduation(deviceId);
    return {
      device,
      eligibility,
      currentMode: this.mode
    };
  }
  exportSamplingEvidence(deviceId) {
    return this.smartSampler.exportSamplingEvidence();
  }
}
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
          stratified: true,
          confidenceLevel: 0.95,
          highRiskRate: 0.30,
          mediumRiskRate: 0.10,
          lowRiskRate: 0.03
        },
        graduationCriteria: {
          enabled: true,
          minOperationalDays: 180,
          maxAnomalyRatePercent: 2.0,
          minDataQualityPercent: 95.0,
          vvbApprovalRequired: true
        }
      }
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`✓ Created config file: ${configFile}`);
    console.log(`  Mode: ${mode.toUpperCase()}`);
    console.log(`  Smart Sampling: ENABLED`);
  } else if (cmd === "batch") {
    const configFile = args[1];
    const deviceId = args[2];
    const count = parseInt(args[3]) || 10;
    const engine = new EngineV2(configFile);
    const telemetryArray = [];
    for (let i = 0; i < count; i++) {
      telemetryArray.push({
        deviceId,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        readings: {
          flowRate_m3_per_s: 2.5,
          headHeight_m: 45,
          generatedKwh: 900 + Math.random() * 50,
          pH: 7.2,
          turbidity_ntu: 10,
          temperature_celsius: 18,
          efficiency: 0.85
        }
      });
    }
    console.log(`\n=== Processing ${count} readings ===`);
    const batchResult = await engine.verifyBatch(telemetryArray);
    console.log("\n=== BATCH RESULT ===");
    console.log(`Total: ${batchResult.totalReadings}`);
    console.log(`Approved: ${batchResult.approved}`);
    console.log(`Flagged: ${batchResult.flagged}`);
    console.log(`Rejected: ${batchResult.rejected}`);
    console.log(`Avg Trust: ${batchResult.averageTrustScore}`);
    console.log("\n=== SMART SAMPLING REPORT ===");
    const sr = batchResult.samplingReport;
    console.log(`Method: ${sr.sampling.method}`);
    console.log(`Effective Rate: ${(sr.sampling.effectiveRate * 100).toFixed(2)}%`);
    console.log(`\nStrata Sizes:`);
    console.log(`  High Risk: ${sr.sampling.strataSizes.high}`);
    console.log(`  Medium Risk: ${sr.sampling.strataSizes.medium}`);
    console.log(`  Low Risk: ${sr.sampling.strataSizes.low}`);
    console.log(`\nSample Sizes:`);
    console.log(`  High Risk: ${sr.sampling.sampleSizes.high}`);
    console.log(`  Medium Risk: ${sr.sampling.sampleSizes.medium}`);
    console.log(`  Low Risk: ${sr.sampling.sampleSizes.low}`);
    console.log(`\nStatistics:`);
    console.log(`  ${sr.statistics.interpretation}`);
    console.log(`\nRecommendation:`);
    console.log(`  Action: ${sr.recommendation.action}`);
    console.log(`  Reason: ${sr.recommendation.reason}`);
  } else if (cmd === "sampling-evidence") {
    const configFile = args[1];
    const deviceId = args[2];
    const engine = new EngineV2(configFile);
    const evidence = engine.exportSamplingEvidence(deviceId);
    const filename = `sampling-evidence-${deviceId}-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(evidence, null, 2));
    console.log(`\n✓ Sampling evidence exported to ${filename}`);
    console.log(`  Total events: ${evidence.totalEvents}`);
    console.log(`  Methodology: ${evidence.methodology.stratificationEnabled ? 'Stratified' : 'Simple'}`);
    console.log(`  Confidence: ${(evidence.methodology.confidenceLevel * 100).toFixed(0)}%`);
  } else if (cmd === "status") {
    const configFile = args[1];
    const deviceId = args[2];
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
    const deviceId = args[2];
    const engine = new EngineV2(configFile);
    const result = await engine.graduateDevice(deviceId);
    console.log("\n✓ GRADUATION SUCCESSFUL");
    console.log(`Device: ${deviceId}`);
    console.log(`New Mode: EVIDENCE-RICH`);
    console.log(`Transaction: ${result.transactionId}`);
  } else if (cmd === "approve-vvb") {
    const configFile = args[1];
    const deviceId = args[2];
    const engine = new EngineV2(configFile);
    engine.grantVVBApproval(deviceId);
  } else {
    console.log("ENGINE V2 WITH SMART SAMPLING - Two-Tier Verification System");
    console.log("");
    console.log("Commands:");
    console.log("  node engine-v2.js init [mode]                               # Create config");
    console.log("  node engine-v2.js batch <config> <device> <count>           # Batch readings");
    console.log("  node engine-v2.js sampling-evidence <config> <device>       # Export evidence");
    console.log("  node engine-v2.js status <config> <device>                  # Check status");
    console.log("  node engine-v2.js graduate <config> <device>                # Graduate device");
    console.log("  node engine-v2.js approve-vvb <config> <device>             # Grant VVB approval");
  }
  await client.close();
}
main().catch(console.error);
module.exports = { EngineV2 };

