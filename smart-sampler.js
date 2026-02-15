// ============================================
// SMART SAMPLER - STATISTICAL SAMPLING MODULE
// ============================================
class SmartSampler {
  constructor(config = {}) {
    this.stratifiedEnabled = config.stratified ?? true;
    this.confidenceLevel = config.confidenceLevel || 0.95;
    this.rates = {
      high: config.highRiskRate || 0.30,
      medium: config.mediumRiskRate || 0.10,
      low: config.lowRiskRate || 0.03
    };
    this.thresholds = {
      highRisk: { min: 0.90, max: 0.92 },
      mediumRisk: { min: 0.92, max: 0.95 },
      lowRisk: { min: 0.95, max: 1.0 }
    };
    this.samplingLog = [];
  }
  selectSamples(results, device) {
    if (!this.stratifiedEnabled) {
      return this.simpleSample(results, device);
    }
    return this.stratifiedSample(results, device);
  }
  stratifiedSample(results, device) {
    const autoApproved = results.filter(r => 
      r.attestation.verificationStatus === 'APPROVED'
    );
    if (autoApproved.length === 0) {
      return {
        samples: [],
        strataSizes: { high: 0, medium: 0, low: 0 },
        sampleSizes: { high: 0, medium: 0, low: 0 },
        effectiveRate: 0,
        confidenceLevel: this.confidenceLevel,
        method: 'stratified'
      };
    }
    const strata = {
      high: autoApproved.filter(r => this.isHighRisk(r, device)),
      medium: autoApproved.filter(r => this.isMediumRisk(r, device)),
      low: autoApproved.filter(r => this.isLowRisk(r, device))
    };
    const samples = {
      high: this.sampleFromStratum(strata.high, this.rates.high, 'high-risk'),
      medium: this.sampleFromStratum(strata.medium, this.rates.medium, 'medium-risk'),
      low: this.sampleFromStratum(strata.low, this.rates.low, 'low-risk')
    };
    const allSamples = [...samples.high, ...samples.medium, ...samples.low];
    const totalSampleSize = allSamples.length;
    const samplingEvent = {
      timestamp: new Date().toISOString(),
      deviceId: device.deviceId,
      totalReadings: autoApproved.length,
      strataSizes: {
        high: strata.high.length,
        medium: strata.medium.length,
        low: strata.low.length
      },
      sampleSizes: {
        high: samples.high.length,
        medium: samples.medium.length,
        low: samples.low.length
      },
      effectiveRate: parseFloat((totalSampleSize / autoApproved.length).toFixed(4)),
      method: 'stratified'
    };
    this.samplingLog.push(samplingEvent);
    return {
      samples: allSamples,
      strataSizes: samplingEvent.strataSizes,
      sampleSizes: samplingEvent.sampleSizes,
      effectiveRate: samplingEvent.effectiveRate,
      confidenceLevel: this.confidenceLevel,
      method: 'stratified'
    };
  }
  isHighRisk(result, device) {
    const trustScore = result.attestation.trustScore;
    const operationalDays = this.getOperationalDays(device);
    const recentAnomalies = this.getRecentAnomalies(device);
    return (
      (trustScore >= this.thresholds.highRisk.min && 
       trustScore < this.thresholds.highRisk.max) ||
      operationalDays < 180 ||
      recentAnomalies > 0
    );
  }
  isMediumRisk(result, device) {
    const trustScore = result.attestation.trustScore;
    const operationalDays = this.getOperationalDays(device);
    const recentAnomalies = this.getRecentAnomalies(device);
    return (
      trustScore >= this.thresholds.mediumRisk.min &&
      trustScore < this.thresholds.mediumRisk.max &&
      operationalDays >= 180 &&
      recentAnomalies === 0
    );
  }
  isLowRisk(result, device) {
    const trustScore = result.attestation.trustScore;
    const operationalDays = this.getOperationalDays(device);
    const recentAnomalies = this.getRecentAnomalies(device);
    return (
      trustScore >= this.thresholds.lowRisk.min &&
      operationalDays >= 180 &&
      recentAnomalies === 0
    );
  }
  getOperationalDays(device) {
    const deploymentDate = new Date(device.deploymentDate);
    const now = new Date();
    return (now - deploymentDate) / (1000 * 60 * 60 * 24);
  }
  getRecentAnomalies(device) {
    const recentWeek = device.history.slice(-168);
    return recentWeek.filter(r => r.decision === 'REJECTED').length;
  }
  sampleFromStratum(stratum, rate, label) {
    if (stratum.length === 0) return [];
    const sampleSize = Math.max(1, Math.ceil(stratum.length * rate));
    const shuffled = [...stratum].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize).map(r => ({
      deviceId: r.attestation.deviceId,
      timestamp: r.attestation.timestamp,
      trustScore: r.attestation.trustScore,
      transactionId: r.transactionId,
      sampledForReview: true,
      samplingReason: `Stratified ${label} sample`,
      stratum: label,
      erTco2: r.attestation.calculations.ER_tCO2,
      recsIssued: r.attestation.calculations.RECs_issued
    }));
  }
  simpleSample(results, device) {
    const autoApproved = results.filter(r => 
      r.attestation.verificationStatus === 'APPROVED'
    );
    const rate = device.mode === 'strict' ? 0.30 : 0.05;
    const samples = autoApproved
      .filter(() => Math.random() < rate)
      .map(r => ({
        deviceId: r.attestation.deviceId,
        timestamp: r.attestation.timestamp,
        trustScore: r.attestation.trustScore,
        transactionId: r.transactionId,
        sampledForReview: true,
        samplingReason: 'Simple random sample',
        stratum: 'random'
      }));
    return {
      samples,
      effectiveRate: parseFloat((samples.length / autoApproved.length).toFixed(4)),
      method: 'simple-random'
    };
  }
  calculateConfidenceInterval(sampledAnomalies, sampleSize, populationSize) {
    if (sampleSize === 0) {
      return {
        estimate: 0,
        lowerBound: 0,
        upperBound: 0,
        confidenceLevel: this.confidenceLevel,
        marginOfError: 0
      };
    }
    const p = sampledAnomalies / sampleSize;
    const z = this.confidenceLevel === 0.99 ? 2.576 : 1.96;
    const fpc = populationSize > sampleSize 
      ? Math.sqrt((populationSize - sampleSize) / (populationSize - 1))
      : 1;
    const se = Math.sqrt((p * (1 - p)) / sampleSize) * fpc;
    const marginOfError = z * se;
    return {
      estimate: parseFloat(p.toFixed(4)),
      lowerBound: parseFloat(Math.max(0, p - marginOfError).toFixed(4)),
      upperBound: parseFloat(Math.min(1, p + marginOfError).toFixed(4)),
      confidenceLevel: this.confidenceLevel,
      marginOfError: parseFloat(marginOfError.toFixed(4)),
      sampleSize,
      populationSize
    };
  }
  generateSamplingReport(results, device) {
    const samplingResult = this.selectSamples(results, device);
    const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED');
    const flagged = results.filter(r => r.attestation.verificationStatus === 'FLAGGED');
    const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED');
    const totalAnomalies = flagged.length + rejected.length;
    const anomalyRate = results.length > 0 ? totalAnomalies / results.length : 0;
    const ci = this.calculateConfidenceInterval(
      totalAnomalies,
      results.length,
      results.length
    );
    return {
      deviceId: device.deviceId,
      timestamp: new Date().toISOString(),
      mode: device.mode,
      population: {
        total: results.length,
        approved: approved.length,
        flagged: flagged.length,
        rejected: rejected.length,
        anomalyRate: parseFloat((anomalyRate * 100).toFixed(2))
      },
      sampling: samplingResult,
      statistics: {
        confidenceInterval: ci,
        interpretation: `With ${(this.confidenceLevel * 100).toFixed(0)}% confidence, ` +
          `the true anomaly rate is between ${(ci.lowerBound * 100).toFixed(2)}% ` +
          `and ${(ci.upperBound * 100).toFixed(2)}%`
      },
      recommendation: this.generateRecommendation(samplingResult, ci, device)
    };
  }
  generateRecommendation(samplingResult, ci, device) {
    const upperBound = ci.upperBound;
    if (upperBound < 0.01) {
      return {
        action: 'MAINTAIN_MODE',
        reason: 'Anomaly rate consistently low (<1%), device performing well',
        confidenceLevel: 'HIGH'
      };
    } else if (upperBound < 0.02 && device.mode === 'evidence-rich') {
      return {
        action: 'MAINTAIN_MODE',
        reason: 'Anomaly rate acceptable (<2%) for evidence-rich mode',
        confidenceLevel: 'MEDIUM'
      };
    } else if (upperBound > 0.05) {
      return {
        action: 'INCREASE_SAMPLING',
        reason: 'Anomaly rate elevated (>5%), recommend increased oversight',
        confidenceLevel: 'LOW'
      };
    } else {
      return {
        action: 'CONTINUE_MONITORING',
        reason: 'Anomaly rate within acceptable range (2-5%)',
        confidenceLevel: 'MEDIUM'
      };
    }
  }
  getSamplingLog() {
    return this.samplingLog;
  }
  exportSamplingEvidence() {
    return {
      methodology: {
        stratificationEnabled: this.stratifiedEnabled,
        confidenceLevel: this.confidenceLevel,
        samplingRates: this.rates,
        riskThresholds: this.thresholds
      },
      samplingEvents: this.samplingLog,
      totalEvents: this.samplingLog.length,
      exportTimestamp: new Date().toISOString()
    };
  }
}
module.exports = SmartSampler;
