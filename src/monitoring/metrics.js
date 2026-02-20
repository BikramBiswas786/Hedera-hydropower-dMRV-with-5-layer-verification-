/**
 * Prometheus Metrics for Hedera Hydropower MRV
 * Provides operational visibility into system health and performance
 * 
 * Usage:
 *   const { telemetryCounter, hederaTxFailures } = require('./monitoring/metrics');
 *   telemetryCounter.inc({ status: 'APPROVED' });
 *   hederaTxFailures.inc({ error_type: 'TRANSACTION_EXPIRED' });
 */

const promClient = require('prom-client');

// Create separate registry for MRV metrics
const register = new promClient.Registry();

// Add default metrics (memory, CPU, etc.) - useful for debugging
promClient.collectDefaultMetrics({ register });

/**
 * Counter: Total telemetry submissions by verification status
 * Labels: status (APPROVED, FLAGGED, REJECTED)
 */
const telemetryCounter = new promClient.Counter({
  name: 'mrv_telemetry_submissions_total',
  help: 'Total number of telemetry submissions processed',
  labelNames: ['status', 'plant_id'],
  registers: [register]
});

/**
 * Counter: Hedera transaction failures by error type
 * Labels: error_type (TRANSACTION_EXPIRED, TIMEOUT, NETWORK_ERROR, OTHER)
 */
const hederaTxFailures = new promClient.Counter({
  name: 'mrv_hedera_tx_failures_total',
  help: 'Total Hedera transaction failures',
  labelNames: ['error_type', 'topic_id'],
  registers: [register]
});

/**
 * Histogram: Verification processing duration in seconds
 * Tracks p50, p95, p99 latencies
 */
const verificationDuration = new promClient.Histogram({
  name: 'mrv_verification_duration_seconds',
  help: 'Time taken to verify telemetry readings',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // seconds
  registers: [register]
});

/**
 * Gauge: Current trust score per plant
 * Tracks real-time trust level (0-1.0)
 */
const trustScoreGauge = new promClient.Gauge({
  name: 'mrv_trust_score',
  help: 'Current trust score for plant',
  labelNames: ['plant_id', 'device_id'],
  registers: [register]
});

/**
 * Counter: Carbon credits (RECs) minted
 * Tracks total tCO2e issued
 */
const recsMinted = new promClient.Counter({
  name: 'mrv_recs_minted_total',
  help: 'Total Renewable Energy Credits minted (tCO2e)',
  labelNames: ['plant_id', 'token_id'],
  registers: [register]
});

/**
 * Helper function to time async operations
 * @param {Function} fn - Async function to time
 * @param {string} status - Status label for histogram
 * @returns {Promise} Result of fn()
 */
async function timeVerification(fn, status = 'unknown') {
  const end = verificationDuration.startTimer({ status });
  try {
    const result = await fn();
    end();
    return result;
  } catch (error) {
    end();
    throw error;
  }
}

/**
 * Reset all metrics (useful for testing)
 */
function resetMetrics() {
  register.resetMetrics();
}

module.exports = {
  register,
  telemetryCounter,
  hederaTxFailures,
  verificationDuration,
  trustScoreGauge,
  recsMinted,
  timeVerification,
  resetMetrics
};
