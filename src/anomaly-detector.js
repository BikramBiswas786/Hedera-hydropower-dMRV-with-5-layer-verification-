/**
 * Anomaly Detector Module - Production Grade
 */
module.exports = class AnomalyDetector {
  constructor(config) {
    this.config = config || {};
  }

  validatePhysicsConstraints(reading) {
    if (!reading) return { isValid: false, reason: 'No reading provided' };
    if (reading.flowRate >= 150) return { isValid: false, reason: 'Physics constraint violation: Flow rate too high' };
    if (reading.head < 0) return { isValid: false, reason: 'Physics constraint violation: Negative head' };
    if (reading.efficiency !== undefined && reading.efficiency !== null) {
      if (reading.efficiency > 1.0 || reading.efficiency < 0) {
        return { isValid: false, reason: 'Physics constraint violation: Invalid efficiency' };
      }
    }
    if (reading.generatedKwh && reading.flowRate && reading.head) {
      const rho = 1000, g = 9.81, maxEff = 0.90;
      const theoreticalMaxPower = (rho * g * reading.flowRate * reading.head * maxEff) / 1000;
      const capacityFactor = reading.capacityFactor || 1.0;
      const expectedMax = theoreticalMaxPower * capacityFactor * 1.2;
      if (reading.generatedKwh > expectedMax) {
        return { isValid: false, reason: 'Physics constraint violation: Generated energy exceeds theoretical maximum' };
      }
    }
    return { isValid: true };
  }

  validateTemporalConsistency(currentReading, previousReading) {
    if (!currentReading || !previousReading) return { isValid: true };
    const currentTime = new Date(currentReading.timestamp).getTime();
    const previousTime = new Date(previousReading.timestamp).getTime();
    if (currentTime <= previousTime) return { isValid: false, reason: 'Temporal violation: timestamp not increasing' };
    if (currentReading.generatedKwh && previousReading.generatedKwh) {
      const increase = currentReading.generatedKwh - previousReading.generatedKwh;
      if (increase > 500) return { isValid: false, reason: 'Temporal violation: generation increase too large' };
      if (increase < 0) return { isValid: false, reason: 'Temporal violation: generation decreased' };
    }
    return { isValid: true };
  }

  validateEnvironmentalBounds(telemetry, siteConfig) {
    if (!telemetry || !siteConfig) return { isValid: true, violations: [] };
    const violations = [];
    const bounds = siteConfig.flowRateBounds || { min: 0.1, max: 100 };
    const phBounds = siteConfig.phBounds || { min: 6.5, max: 8.5 };
    const turbidityBounds = siteConfig.turbidityBounds || { min: 0, max: 50 };
    const tempBounds = siteConfig.temperatureBounds || { min: 0, max: 30 };
    if (telemetry.flowRate < bounds.min || telemetry.flowRate > bounds.max) violations.push('flowRate');
    if (telemetry.pH && (telemetry.pH < phBounds.min || telemetry.pH > phBounds.max)) violations.push('ph');
    if (telemetry.turbidity && telemetry.turbidity > turbidityBounds.max) violations.push('turbidity');
    if (telemetry.temperature && (telemetry.temperature < tempBounds.min || telemetry.temperature > tempBounds.max)) violations.push('temperature');
    return { isValid: violations.length === 0, violations: violations };
  }

  detectStatisticalAnomalies(currentReading, historicalReadings) {
    if (!currentReading || !historicalReadings || historicalReadings.length === 0) {
      return { isValid: true, hasAnomaly: false, anomalies: [], zScore: 0 };
    }
    const anomalies = [];
    const flowRates = historicalReadings.map(r => r.flowRate).filter(f => f !== undefined);
    let zScore = 0;
    if (flowRates.length > 0 && currentReading.flowRate !== undefined) {
      const mean = flowRates.reduce((a, b) => a + b, 0) / flowRates.length;
      const variance = flowRates.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / flowRates.length;
      const stdDev = Math.sqrt(variance);
      // FIX: compute absolute z-score of current reading vs history
      zScore = stdDev > 0 ? Math.abs(currentReading.flowRate - mean) / stdDev : 0;
      // FIX: z-score > 3 means OUTLIER => push anomaly
      if (zScore > 3) {
        anomalies.push({ field: 'flowRate', type: 'statistical_outlier', severity: 'high' });
      }
    }
    const hasAnomaly = anomalies.length > 0;
    // FIX: isValid = NOT hasAnomaly  (outlier => invalid)
    return { isValid: !hasAnomaly, hasAnomaly: hasAnomaly, anomalies: anomalies, zScore: zScore };
  }

  completeValidation(telemetry, previousReading, historicalReadings, siteConfig) {
    const physicsResult = this.validatePhysicsConstraints(telemetry);
    // FIX: gracefully skip temporal if no previous reading supplied
    const temporalResult = previousReading
      ? this.validateTemporalConsistency(telemetry, previousReading)
      : { isValid: true };
    const environmentalResult = siteConfig
      ? this.validateEnvironmentalBounds(telemetry, siteConfig)
      : { isValid: true, violations: [] };
    const statisticalResult = (historicalReadings && historicalReadings.length > 0)
      ? this.detectStatisticalAnomalies(telemetry, historicalReadings)
      : { isValid: true, hasAnomaly: false, anomalies: [], zScore: 0 };
    const allValid =
      physicsResult.isValid &&
      temporalResult.isValid &&
      environmentalResult.isValid &&
      statisticalResult.isValid;
    return {
      isValid: allValid,
      physics: physicsResult,
      temporal: temporalResult,
      environmental: environmentalResult,
      statistical: statisticalResult
    };
  }

  detectAnomalies(reading) {
    const anomalies = [];
    if (reading.flowRate > 100) anomalies.push({ type: 'high_flow', severity: 'warning' });
    if (reading.efficiency && reading.efficiency < 0.70) anomalies.push({ type: 'low_efficiency', severity: 'warning' });
    return { anomalies, severity: anomalies.length > 0 ? 'warning' : 'none' };
  }
};
