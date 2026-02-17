const EngineV1 = require('./ai-guardian-verifier');
const SmartSampler = require('./smart-sampler');
const logger = require('../lib/logger');

/**
 * Two-Tier Verification Engine
 * Extends ENGINE V1 with mode-based decision logic
 */
class TwoTierVerifier extends EngineV1 {
  constructor(config) {
    super(config);
    this.config = config;
    this.mode = config.verification?.mode || 'strict';
    this.thresholds = this.loadThresholds(this.mode);
    this.sampler = new SmartSampler(config.verification?.samplingStrategy || {});
    
    logger.info(`TwoTierVerifier initialized`, {
      mode: this.mode,
      thresholds: this.thresholds
    });
  }

  /**
   * Load thresholds based on mode
   */
  loadThresholds(mode) {
    const presets = {
      'strict': {
        autoApprove: 0.97,
        flag: 0.50,
        reject: 0.50,
        description: 'Regulator-strict mode for pilots'
      },
      'evidence-rich': {
        autoApprove: 0.90,
        flag: 0.70,
        reject: 0.70,
        description: 'Evidence-rich mode for mature plants'
      }
    };
    
    return presets[mode] || presets['strict'];
  }

  /**
   * Verify batch with mode-specific logic
   */
  async verifyBatch(readings, context) {
    logger.debug(`Verifying ${readings.length} readings in ${this.mode} mode`);
    
    // Run base ENGINE V1 verification
    const baseResults = await super.verifyBatch(readings, context);
    
    // Apply mode-specific decision logic
    const decisions = baseResults.map(result => 
      this.applyModeLogic(result, context)
    );
    
    // Generate sampling plan
    const samplingPlan = this.sampler.selectSamples(decisions, context);
    
    // Generate evidence bundles for Mode B
    if (this.mode === 'evidence-rich') {
      decisions.forEach(decision => {
        if (decision.decision === 'AUTO_APPROVED') {
          decision.evidenceBundle = this.generateEvidenceBundle(decision, context);
        }
      });
    }
    
    return {
      decisions,
      samplingPlan,
      mode: this.mode,
      thresholds: this.thresholds,
      stats: this.calculateBatchStats(decisions)
    };
  }

  /**
   * Apply mode-specific decision logic
   */
  applyModeLogic(result, context) {
    const trustScore = result.trustScore;
    
    if (this.mode === 'strict') {
      return this.applyStrictMode(result, trustScore, context);
    } else if (this.mode === 'evidence-rich') {
      return this.applyEvidenceRichMode(result, trustScore, context);
    }
    
    throw new Error(`Unknown verification mode: ${this.mode}`);
  }

  /**
   * Mode A: Strict verification logic
   */
  applyStrictMode(result, trustScore, context) {
    if (trustScore >= this.thresholds.autoApprove) {
      return {
        ...result,
        decision: 'AUTO_APPROVED',
        requiresSampling: true,
        samplingRate: 0.30,
        reasoning: `Mode A: Trust ${trustScore.toFixed(3)} ≥ 0.97, auto-approved with 30% sampling`
      };
    }
    
    if (trustScore >= this.thresholds.flag) {
      return {
        ...result,
        decision: 'FLAGGED_FOR_REVIEW',
        requiresSampling: false,
        reasoning: `Mode A: Trust ${trustScore.toFixed(3)} below 0.97, requires human review`
      };
    }
    
    return {
      ...result,
      decision: 'REJECTED',
      reasoning: `Mode A: Trust ${trustScore.toFixed(3)} < 0.50, rejected`
    };
  }

  /**
   * Mode B: Evidence-rich verification logic
   */
  applyEvidenceRichMode(result, trustScore, context) {
    if (trustScore >= this.thresholds.autoApprove) {
      const samplingRate = this.calculateAdaptiveSamplingRate(result, context);
      
      return {
        ...result,
        decision: 'AUTO_APPROVED',
        requiresSampling: true,
        samplingRate,
        reasoning: `Mode B: Trust ${trustScore.toFixed(3)} ≥ 0.90, ${(samplingRate * 100).toFixed(1)}% adaptive sampling`,
        evidenceGenerated: true
      };
    }
    
    if (trustScore >= this.thresholds.flag) {
      return {
        ...result,
        decision: 'FLAGGED_FOR_REVIEW',
        reasoning: `Mode B: Trust ${trustScore.toFixed(3)} in 0.70-0.89, targeted review`
      };
    }
    
    return {
      ...result,
      decision: 'REJECTED',
      reasoning: `Mode B: Trust ${trustScore.toFixed(3)} < 0.70, rejected`
    };
  }

  /**
   * Calculate adaptive sampling rate for Mode B
   */
  calculateAdaptiveSamplingRate(result, context) {
    let rate = 0.05;  // 5% base
    
    if (context.device?.operationalDays < 180) rate += 0.05;
    if (context.recentAnomalies > 0) rate += 0.10;
    if (result.trustScore < 0.92) rate += 0.05;
    
    return Math.min(rate, 0.30);  // Cap at 30%
  }

  /**
   * Generate evidence bundle for Mode B
   */
  generateEvidenceBundle(result, context) {
    return {
      timestamp: new Date().toISOString(),
      readingId: result.readingId,
      
      derivationLog: {
        physics: result.checks.physics,
        temporal: result.checks.temporal,
        environmental: result.checks.environmental,
        statistical: result.checks.statistical,
        consistency: result.checks.consistency
      },
      
      trustScoreCalculation: {
        formula: '0.30*P + 0.25*T + 0.20*E + 0.15*S + 0.10*C',
        values: {
          P: result.checks.physics.score,
          T: result.checks.temporal.score,
          E: result.checks.environmental.score,
          S: result.checks.statistical.score,
          C: result.checks.consistency.score
        },
        result: result.trustScore
      },
      
      sampleReadings: this.selectSampleReadings(context.recentReadings, 5),
      
      statisticalSummary: {
        mean: context.stats?.mean,
        stdDev: context.stats?.stdDev,
        outliers: context.stats?.outliers,
        zScores: context.stats?.zScores
      },
      
      baselineComparison: {
        deviceBaseline: context.deviceBaseline,
        fleetBaseline: context.fleetBaseline,
        deviation: this.calculateDeviation(result, context)
      }
    };
  }

  selectSampleReadings(readings, count) {
    const shuffled = [...readings].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  calculateDeviation(result, context) {
    if (!context.deviceBaseline) return null;
    
    return {
      generation: Math.abs(result.generation - context.deviceBaseline.avgGeneration) / context.deviceBaseline.avgGeneration,
      flow: Math.abs(result.flow - context.deviceBaseline.avgFlow) / context.deviceBaseline.avgFlow
    };
  }

  calculateBatchStats(decisions) {
    const total = decisions.length;
    const approved = decisions.filter(d => d.decision === 'AUTO_APPROVED').length;
    const flagged = decisions.filter(d => d.decision === 'FLAGGED_FOR_REVIEW').length;
    const rejected = decisions.filter(d => d.decision === 'REJECTED').length;
    
    return {
      total,
      approved,
      flagged,
      rejected,
      approvalRate: (approved / total * 100).toFixed(1) + '%'
    };
  }

  /**
   * Check if device is eligible for graduation to Mode B
   */
  checkGraduationEligibility(deviceHistory) {
    const criteria = this.config.verification?.graduationCriteria || {};
    
    const checks = {
      operationalTime: deviceHistory.operationalDays >= (criteria.minOperationalDays || 180),
      anomalyRate: deviceHistory.anomalyRate <= ((criteria.maxAnomalyRatePercent || 2.0) / 100),
      dataQuality: deviceHistory.dataQuality >= (criteria.minDataQualityPercent || 95.0),
      vvbApproval: !criteria.vvbApprovalRequired || deviceHistory.vvbAp
      vvbApproval: !criteria.vvbApprovalRequired || deviceHistory.vvbApprovalStatus === 'APPROVED',
      stability: deviceHistory.daysSinceLastMaintenance >= 30
    };
    
    const eligible = Object.values(checks).every(Boolean);
    
    return {
      eligible,
      checks,
      recommendation: eligible 
        ? 'Device eligible for Mode B graduation' 
        : 'Device must remain in Mode A',
      missingRequirements: Object.entries(checks)
        .filter(([_, passed]) => !passed)
        .map(([requirement]) => requirement)
    };
  }
}

module.exports = TwoTierVerifier;
