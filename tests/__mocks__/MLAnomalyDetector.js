// Mock for ML Anomaly Detector — no file I/O or training in CI

const mockDetector = {
  detect: (reading) => ({
    isAnomaly:    false,
    score:        0.1,
    confidence:   0.9,
    method:       'IsolationForest-mock',
    featureVector:[reading.flowRate_m3_per_s || 0, reading.headHeight_m || 0, reading.generatedKwh || 0],
    trainedOn:    2000,
    trainedAt:    new Date().toISOString()
  }),
  retrain: () => Promise.resolve({ success: true, samples: 0 }),
  isReady: () => true
};

function getMLDetector() {
  return mockDetector;
}

class MLAnomalyDetector {
  constructor() {
    Object.assign(this, mockDetector);
  }
}

module.exports = { MLAnomalyDetector, getMLDetector };
