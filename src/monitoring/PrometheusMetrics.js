'use strict';

/**
 * Prometheus Metrics Exporter
 * ════════════════════════════════════════════════════════════════
 * Exposes metrics for Grafana dashboards
 */

class PrometheusMetrics {
  constructor() {
    this.metrics = {
      readings_total: 0,
      readings_approved: 0,
      readings_flagged: 0,
      readings_rejected: 0,
      anomalies_detected: 0,
      hedera_tx_success: 0,
      hedera_tx_failure: 0,
      api_requests_total: 0,
      api_latency_sum: 0,
      api_latency_count: 0
    };
  }

  incrementReadings(status) {
    this.metrics.readings_total++;
    if (status === 'APPROVED') this.metrics.readings_approved++;
    else if (status === 'FLAGGED') this.metrics.readings_flagged++;
    else if (status === 'REJECTED') this.metrics.readings_rejected++;
  }

  incrementAnomalies() {
    this.metrics.anomalies_detected++;
  }

  recordHederaTx(success) {
    if (success) this.metrics.hedera_tx_success++;
    else this.metrics.hedera_tx_failure++;
  }

  recordAPILatency(latencyMs) {
    this.metrics.api_requests_total++;
    this.metrics.api_latency_sum += latencyMs;
    this.metrics.api_latency_count++;
  }

  /**
   * Export in Prometheus format
   */
  export() {
    const avgLatency = this.metrics.api_latency_count > 0
      ? this.metrics.api_latency_sum / this.metrics.api_latency_count
      : 0;

    return `
# HELP mrv_readings_total Total readings processed
# TYPE mrv_readings_total counter
mrv_readings_total ${this.metrics.readings_total}

# HELP mrv_readings_approved Approved readings
# TYPE mrv_readings_approved counter
mrv_readings_approved ${this.metrics.readings_approved}

# HELP mrv_readings_flagged Flagged readings
# TYPE mrv_readings_flagged counter
mrv_readings_flagged ${this.metrics.readings_flagged}

# HELP mrv_anomalies_detected Anomalies detected by ML
# TYPE mrv_anomalies_detected counter
mrv_anomalies_detected ${this.metrics.anomalies_detected}

# HELP mrv_hedera_tx_success Successful Hedera transactions
# TYPE mrv_hedera_tx_success counter
mrv_hedera_tx_success ${this.metrics.hedera_tx_success}

# HELP mrv_api_latency_avg Average API latency (ms)
# TYPE mrv_api_latency_avg gauge
mrv_api_latency_avg ${avgLatency.toFixed(2)}
`.trim();
  }
}

module.exports = { PrometheusMetrics };
