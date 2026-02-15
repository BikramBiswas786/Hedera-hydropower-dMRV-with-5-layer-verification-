/**
 * Prometheus Metrics for Hedera Hydropower MRV
 * Provides comprehensive monitoring and alerting capabilities
 */

const prometheus = require('prom-client');

class HydropowerMetrics {
  constructor() {
    // ========================================================================
    // COUNTER METRICS
    // ========================================================================

    // Telemetry submission counter
    this.telemetrySubmissions = new prometheus.Counter({
      name: 'hydropower_telemetry_submissions_total',
      help: 'Total number of telemetry submissions',
      labelNames: ['device_id', 'status']
    });

    // Verification decisions counter
    this.verificationDecisions = new prometheus.Counter({
      name: 'hydropower_verification_decisions_total',
      help: 'Total number of verification decisions',
      labelNames: ['device_id', 'status']
    });

    // REC minting counter
    this.recMintings = new prometheus.Counter({
      name: 'hydropower_rec_mintings_total',
      help: 'Total number of REC minting operations',
      labelNames: ['token_id', 'status']
    });

    // Hedera transaction counter
    this.hederaTransactions = new prometheus.Counter({
      name: 'hydropower_hedera_transactions_total',
      help: 'Total number of Hedera transactions',
      labelNames: ['transaction_type', 'status']
    });

    // Error counter
    this.errors = new prometheus.Counter({
      name: 'hydropower_errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'severity']
    });

    // ========================================================================
    // GAUGE METRICS
    // ========================================================================

    // Current trust score gauge
    this.trustScore = new prometheus.Gauge({
      name: 'hydropower_trust_score',
      help: 'Current average trust score',
      labelNames: ['device_id']
    });

    // Generation rate gauge
    this.generationRate = new prometheus.Gauge({
      name: 'hydropower_generation_rate_kwh',
      help: 'Current generation rate in kWh',
      labelNames: ['device_id']
    });

    // Approval rate gauge
    this.approvalRate = new prometheus.Gauge({
      name: 'hydropower_approval_rate',
      help: 'Current approval rate (0-1)',
      labelNames: ['device_id']
    });

    // Active devices gauge
    this.activeDevices = new prometheus.Gauge({
      name: 'hydropower_active_devices',
      help: 'Number of active devices'
    });

    // Pending verifications gauge
    this.pendingVerifications = new prometheus.Gauge({
      name: 'hydropower_pending_verifications',
      help: 'Number of pending verifications'
    });

    // Queue depth gauge
    this.queueDepth = new prometheus.Gauge({
      name: 'hydropower_queue_depth',
      help: 'Current queue depth',
      labelNames: ['queue_type']
    });

    // ========================================================================
    // HISTOGRAM METRICS
    // ========================================================================

    // Verification latency histogram
    this.verificationLatency = new prometheus.Histogram({
      name: 'hydropower_verification_latency_ms',
      help: 'Verification latency in milliseconds',
      labelNames: ['device_id'],
      buckets: [10, 50, 100, 500, 1000, 5000, 10000]
    });

    // Hedera transaction latency histogram
    this.transactionLatency = new prometheus.Histogram({
      name: 'hydropower_transaction_latency_ms',
      help: 'Hedera transaction latency in milliseconds',
      labelNames: ['transaction_type'],
      buckets: [100, 500, 1000, 2000, 5000, 10000, 30000]
    });

    // Batch processing latency histogram
    this.batchLatency = new prometheus.Histogram({
      name: 'hydropower_batch_latency_ms',
      help: 'Batch processing latency in milliseconds',
      labelNames: ['batch_size'],
      buckets: [100, 500, 1000, 5000, 10000, 30000, 60000]
    });

    // ========================================================================
    // SUMMARY METRICS
    // ========================================================================

    // Daily generation summary
    this.dailyGeneration = new prometheus.Summary({
      name: 'hydropower_daily_generation_mwh',
      help: 'Daily generation in MWh',
      labelNames: ['device_id'],
      percentiles: [0.5, 0.9, 0.95, 0.99]
    });

    // Monthly emission reductions summary
    this.monthlyEmissionReductions = new prometheus.Summary({
      name: 'hydropower_monthly_emission_reductions_tco2',
      help: 'Monthly emission reductions in tCO2',
      labelNames: ['device_id'],
      percentiles: [0.5, 0.9, 0.95, 0.99]
    });
  }

  /**
   * Record telemetry submission
   */
  recordTelemetrySubmission(deviceId, status) {
    this.telemetrySubmissions.inc({
      device_id: deviceId,
      status: status
    });
  }

  /**
   * Record verification decision
   */
  recordVerificationDecision(deviceId, status, trustScore) {
    this.verificationDecisions.inc({
      device_id: deviceId,
      status: status
    });

    this.trustScore.set({ device_id: deviceId }, trustScore);
  }

  /**
   * Record REC minting
   */
  recordRECMinting(tokenId, status, amount) {
    this.recMintings.inc({
      token_id: tokenId,
      status: status
    });
  }

  /**
   * Record Hedera transaction
   */
  recordHederaTransaction(transactionType, status, latency) {
    this.hederaTransactions.inc({
      transaction_type: transactionType,
      status: status
    });

    this.transactionLatency.observe(
      { transaction_type: transactionType },
      latency
    );
  }

  /**
   * Record error
   */
  recordError(errorType, severity) {
    this.errors.inc({
      error_type: errorType,
      severity: severity
    });
  }

  /**
   * Record verification latency
   */
  recordVerificationLatency(deviceId, latency) {
    this.verificationLatency.observe(
      { device_id: deviceId },
      latency
    );
  }

  /**
   * Record batch processing latency
   */
  recordBatchLatency(batchSize, latency) {
    this.batchLatency.observe(
      { batch_size: batchSize.toString() },
      latency
    );
  }

  /**
   * Update generation rate
   */
  updateGenerationRate(deviceId, rate) {
    this.generationRate.set({ device_id: deviceId }, rate);
  }

  /**
   * Update approval rate
   */
  updateApprovalRate(deviceId, rate) {
    this.approvalRate.set({ device_id: deviceId }, rate);
  }

  /**
   * Update active devices count
   */
  updateActiveDevices(count) {
    this.activeDevices.set(count);
  }

  /**
   * Update pending verifications count
   */
  updatePendingVerifications(count) {
    this.pendingVerifications.set(count);
  }

  /**
   * Update queue depth
   */
  updateQueueDepth(queueType, depth) {
    this.queueDepth.set({ queue_type: queueType }, depth);
  }

  /**
   * Record daily generation
   */
  recordDailyGeneration(deviceId, generation) {
    this.dailyGeneration.observe({ device_id: deviceId }, generation);
  }

  /**
   * Record monthly emission reductions
   */
  recordMonthlyEmissionReductions(deviceId, reductions) {
    this.monthlyEmissionReductions.observe({ device_id: deviceId }, reductions);
  }

  /**
   * Get all metrics in Prometheus format
   */
  getMetrics() {
    return prometheus.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  getMetricsJSON() {
    return prometheus.register.getMetricsAsJSON();
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    prometheus.register.resetMetrics();
  }
}

/**
 * Alert Rules for Prometheus
 */

const ALERT_RULES = {
  'HighErrorRate': {
    expr: 'rate(hydropower_errors_total[5m]) > 0.1',
    for: '5m',
    severity: 'critical',
    description: 'Error rate is above 10% in the last 5 minutes'
  },
  'LowApprovalRate': {
    expr: 'hydropower_approval_rate < 0.8',
    for: '10m',
    severity: 'warning',
    description: 'Approval rate is below 80%'
  },
  'HighVerificationLatency': {
    expr: 'histogram_quantile(0.95, rate(hydropower_verification_latency_ms_bucket[5m])) > 5000',
    for: '5m',
    severity: 'warning',
    description: '95th percentile verification latency is above 5 seconds'
  },
  'HighTransactionLatency': {
    expr: 'histogram_quantile(0.95, rate(hydropower_transaction_latency_ms_bucket[5m])) > 10000',
    for: '5m',
    severity: 'warning',
    description: '95th percentile transaction latency is above 10 seconds'
  },
  'PendingVerificationsHigh': {
    expr: 'hydropower_pending_verifications > 1000',
    for: '10m',
    severity: 'warning',
    description: 'More than 1000 pending verifications'
  },
  'QueueDepthHigh': {
    expr: 'hydropower_queue_depth > 5000',
    for: '5m',
    severity: 'critical',
    description: 'Queue depth is above 5000'
  },
  'NoActiveDevices': {
    expr: 'hydropower_active_devices == 0',
    for: '5m',
    severity: 'critical',
    description: 'No active devices detected'
  },
  'LowGenerationRate': {
    expr: 'hydropower_generation_rate_kwh < 10',
    for: '30m',
    severity: 'warning',
    description: 'Generation rate is below 10 kWh for 30 minutes'
  }
};

/**
 * Prometheus Configuration
 */

const PROMETHEUS_CONFIG = {
  global: {
    scrape_interval: '15s',
    evaluation_interval: '15s',
    external_labels: {
      monitor: 'hedera-hydropower-monitor'
    }
  },
  scrape_configs: [
    {
      job_name: 'hedera-hydropower',
      static_configs: [
        {
          targets: ['localhost:9090']
        }
      ],
      metrics_path: '/metrics',
      scrape_interval: '15s'
    }
  ],
  alerting: {
    alertmanagers: [
      {
        static_configs: [
          {
            targets: ['localhost:9093']
          }
        ]
      }
    ]
  },
  rule_files: [
    'alert-rules.yml'
  ]
};

/**
 * Grafana Dashboard Configuration
 */

const GRAFANA_DASHBOARD = {
  dashboard: {
    title: 'Hedera Hydropower MRV Monitoring',
    panels: [
      {
        title: 'Telemetry Submissions (5m rate)',
        targets: [
          {
            expr: 'rate(hydropower_telemetry_submissions_total[5m])'
          }
        ]
      },
      {
        title: 'Verification Decisions (5m rate)',
        targets: [
          {
            expr: 'rate(hydropower_verification_decisions_total[5m])'
          }
        ]
      },
      {
        title: 'Average Trust Score',
        targets: [
          {
            expr: 'avg(hydropower_trust_score)'
          }
        ]
      },
      {
        title: 'Approval Rate',
        targets: [
          {
            expr: 'avg(hydropower_approval_rate)'
          }
        ]
      },
      {
        title: 'Verification Latency (p95)',
        targets: [
          {
            expr: 'histogram_quantile(0.95, rate(hydropower_verification_latency_ms_bucket[5m]))'
          }
        ]
      },
      {
        title: 'Error Rate',
        targets: [
          {
            expr: 'rate(hydropower_errors_total[5m])'
          }
        ]
      },
      {
        title: 'Active Devices',
        targets: [
          {
            expr: 'hydropower_active_devices'
          }
        ]
      },
      {
        title: 'Pending Verifications',
        targets: [
          {
            expr: 'hydropower_pending_verifications'
          }
        ]
      }
    ]
  }
};

module.exports = {
  HydropowerMetrics,
  ALERT_RULES,
  PROMETHEUS_CONFIG,
  GRAFANA_DASHBOARD
};
