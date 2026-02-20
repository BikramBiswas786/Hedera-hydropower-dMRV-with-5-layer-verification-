/**
 * Prometheus metrics for Hedera Hydropower MRV
 * Exposes operational metrics for observability
 */

const promClient = require('prom-client');

// Enable default metrics (CPU, memory, event loop lag)
promClient.collectDefaultMetrics({ timeout: 5000 });

// Custom MRV metrics
const telemetrySubmissions = new promClient.Counter({
  name: 'mrv_telemetry_submissions_total',
  help: 'Total telemetry submissions by status',
  labelNames: ['plant_id', 'device_id', 'status'] // APPROVED, FLAGGED, REJECTED
});

const verificationLatency = new promClient.Histogram({
  name: 'mrv_verification_duration_seconds',
  help: 'Time to verify telemetry reading',
  labelNames: ['plant_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10] // seconds
});

const hederaTxFailures = new promClient.Counter({
  name: 'mrv_hedera_tx_failures_total',
  help: 'Failed Hedera transactions',
  labelNames: ['error_type'] // TRANSACTION_EXPIRED, TIMEOUT, OTHER
});

const hederaTxLatency = new promClient.Histogram({
  name: 'mrv_hedera_tx_duration_seconds',
  help: 'Time to submit to Hedera HCS',
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const trustScoreGauge = new promClient.Gauge({
  name: 'mrv_trust_score',
  help: 'Latest trust score per plant',
  labelNames: ['plant_id', 'device_id']
});

/**
 * Record telemetry submission
 */
function recordTelemetrySubmission(plantId, deviceId, status) {
  telemetrySubmissions.inc({ plant_id: plantId, device_id: deviceId, status });
}

/**
 * Record verification latency
 */
function recordVerificationLatency(plantId, durationSeconds) {
  verificationLatency.observe({ plant_id: plantId }, durationSeconds);
}

/**
 * Record Hedera transaction failure
 */
function recordHederaTxFailure(errorType) {
  hederaTxFailures.inc({ error_type: errorType });
}

/**
 * Record Hedera transaction latency
 */
function recordHederaTxLatency(durationSeconds) {
  hederaTxLatency.observe(durationSeconds);
}

/**
 * Update trust score gauge
 */
function updateTrustScore(plantId, deviceId, score) {
  trustScoreGauge.set({ plant_id: plantId, device_id: deviceId }, score);
}

/**
 * Get all metrics in Prometheus format
 */
async function getMetrics() {
  return await promClient.register.metrics();
}

/**
 * Reset all metrics (for testing)
 */
function resetMetrics() {
  promClient.register.clear();
}

module.exports = {
  recordTelemetrySubmission,
  recordVerificationLatency,
  recordHederaTxFailure,
  recordHederaTxLatency,
  updateTrustScore,
  getMetrics,
  resetMetrics
};
