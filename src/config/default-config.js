/**
 * Default configuration for the Hedera Hydropower MRV system.
 * Override values via environment variables or per-project config objects.
 */
'use strict';

const DEFAULT_CONFIG = {
  // Grid emission factor (tCO2e per MWh) — ACM0002 baseline calculation
  gridEmissionFactor: parseFloat(process.env.EF_GRID) || 0.8,

  // Hedera network
  hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',

  // AI Guardian thresholds
  verifier: {
    autoApproveThreshold: 0.90,   // trust score >= this → APPROVED
    autoRejectThreshold: 0.70,    // trust score < this → REJECTED
    // between the two → FLAGGED
  },

  // Physics check weight (must sum to 1.0 across all checks)
  weights: {
    physics: 0.40,
    temporal: 0.25,
    environmental: 0.20,
    statistical: 0.15,
  },

  // Environmental bounds (run-of-river hydro)
  environmental: {
    pH:          { perfect: [6.5, 8.5], acceptable: [6.0, 9.0], questionable: [5.5, 9.5] },
    turbidity:   { perfect: [0, 50],    acceptable: [0, 100],   questionable: [0, 200] },  // NTU
    temperature: { perfect: [0, 30],    acceptable: [-5, 35],   questionable: [-10, 40] }, // °C
  },

  // Statistical anomaly thresholds (z-score)
  anomaly: {
    normal:      1.0,
    acceptable:  2.0,
    questionable: 2.5,
    suspicious:  3.0,
  },
};

module.exports = { DEFAULT_CONFIG };
