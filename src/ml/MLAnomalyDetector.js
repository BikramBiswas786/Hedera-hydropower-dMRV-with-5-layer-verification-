'use strict';

/**
 * ML Anomaly Detector
 * ────────────────────
 * Real unsupervised machine-learning anomaly detector for hydropower
 * telemetry using Isolation Forest.
 *
 * Features (8 total — 6 raw + 2 derived):
 *   [0] flowRate_m3_per_s    raw sensor
 *   [1] headHeight_m          raw sensor
 *   [2] generatedKwh          raw sensor
 *   [3] pH                    raw sensor
 *   [4] turbidity_ntu          raw sensor
 *   [5] temperature_celsius    raw sensor
 *   [6] powerDensity           derived: kW / (Q × H)
 *   [7] efficiencyRatio        derived: actual / theoretical power
 *
 * On first instantiation the model auto-trains on 2000 synthetic
 * samples (< 400 ms).  Use loadModel() / saveModel() for persistence.
 *
 * **New in v1.4.0:** Anomaly clustering for pattern analysis
 */

const fs   = require('fs');
const path = require('path');
const { IsolationForest }      = require('./IsolationForest');
const { generateDataset }      = require('./SyntheticDataGenerator');
const { AnomalyClusterer }     = require('./AnomalyClusterer');

// ─── Feature config ──────────────────────────────────────

const FEATURE_NAMES = [
  'flowRate_m3_per_s',
  'headHeight_m',
  'generatedKwh',
  'pH',
  'turbidity_ntu',
  'temperature_celsius',
  'powerDensity',
  'efficiencyRatio'
];

// Min/max from India run-of-river hydropower domain knowledge
const BOUNDS = {
  flowRate_m3_per_s:   { min: 0.1,  max: 50.0  },
  headHeight_m:        { min: 3,    max: 250    },
  generatedKwh:        { min: 0,    max: 6000   },
  pH:                  { min: 4.0,  max: 11.0   },
  turbidity_ntu:       { min: 0,    max: 500    },
  temperature_celsius: { min: 0,    max: 45     },
  powerDensity:        { min: 0,    max: 60     },
  efficiencyRatio:     { min: 0,    max: 3.0    }
};

const RHO = 1000;
const G   = 9.81;

// ─── Feature extraction ──────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function normalise(value, min, max) {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Convert a raw reading object into a normalised feature vector.
 * @param {object} reading
 * @returns {{ features: number[], raw: object }}  Normalised vector + raw values
 */
function extractFeatures(reading) {
  const flow   = reading.flowRate_m3_per_s || 0;
  const head   = reading.headHeight_m      || 0;
  const power  = reading.generatedKwh      || 0;
  const pH     = reading.pH                || 7.0;
  const turb   = reading.turbidity_ntu   || reading.turbidity || 10;
  const temp   = reading.temperature_celsius || reading.temperature || 18;

  const theoretical = flow > 0 && head > 0
    ? (RHO * G * flow * head * 0.85) / 1000
    : 1e-6;

  const powerDensity   = (flow > 0 && head > 0) ? power / (flow * head) : 0;
  const efficiencyRatio = power / theoretical;

  const raw = {
    flowRate_m3_per_s:  flow,
    headHeight_m:        head,
    generatedKwh:        power,
    pH,
    turbidity_ntu:       turb,
    temperature_celsius: temp,
    powerDensity,
    efficiencyRatio
  };

  const features = FEATURE_NAMES.map(name =>
    normalise(raw[name], BOUNDS[name].min, BOUNDS[name].max)
  );

  return { features, raw };
}

// ─── MLAnomalyDetector class ───────────────────────────────────

class MLAnomalyDetector {
  /**
   * @param {object} options
   * @param {number}  options.nTrees        (default 100)
   * @param {number}  options.sampleSize    (default 256)
   * @param {number}  options.contamination (default 0.10)
   * @param {string}  options.modelPath     Path to saved model JSON
   * @param {boolean} options.autoTrain     Auto-train if no saved model (default true)
   * @param {number}  options.trainSamples  Synthetic training samples   (default 2000)
   * @param {number}  options.maxAnomalyHistory Max anomalies to track (default 1000)
   */
  constructor(options = {}) {
    this._options = {
      nTrees:       options.nTrees        || 100,
      sampleSize:   options.sampleSize    || 256,
      contamination:options.contamination || 0.10,
      modelPath:    options.modelPath     || path.join(__dirname, '../../ml/model.json'),
      autoTrain:    options.autoTrain     !== false,
      trainSamples: options.trainSamples  || 2000,
      maxAnomalyHistory: options.maxAnomalyHistory || 1000
    };
    this._model   = null;
    this._trained = false;
    this._trainedOn = 0;
    this._trainedAt = null;
    
    // NEW: Anomaly history for clustering
    this._anomalyHistory = [];

    this._initialize();
  }

  _initialize() {
    // 1. Try to load persisted model from disk
    if (this._tryLoadModel()) {
      return;
    }
    // 2. Auto-train on synthetic data if enabled
    if (this._options.autoTrain) {
      this._autoTrain();
    }
  }

  _tryLoadModel() {
    try {
      if (fs.existsSync(this._options.modelPath)) {
        const json = JSON.parse(fs.readFileSync(this._options.modelPath, 'utf8'));
        this._model   = IsolationForest.fromJSON(json.forest);
        this._trained = true;
        this._trainedOn = json.trainedOn || 0;
        this._trainedAt = json.trainedAt || null;
        console.log(
          `[MLAnomalyDetector] Loaded model from ${this._options.modelPath}` +
          ` (trained on ${this._trainedOn} samples, ${this._trainedAt})`
        );
        return true;
      }
    } catch (e) {
      console.warn('[MLAnomalyDetector] Could not load model:', e.message);
    }
    return false;
  }

  _autoTrain() {
    const t0 = Date.now();
    const dataset = generateDataset(this._options.trainSamples);
    // Isolation Forest is UNSUPERVISED — train only on normal samples
    const normal   = dataset.filter(d => d.label === 'normal');
    const features = normal.map(d => extractFeatures(d.reading).features);

    this._model = new IsolationForest({
      nTrees:        this._options.nTrees,
      sampleSize:    this._options.sampleSize,
      contamination: this._options.contamination,
      featureNames:  FEATURE_NAMES
    });
    this._model.fit(features);
    this._trained   = true;
    this._trainedOn = normal.length;
    this._trainedAt = new Date().toISOString();

    const ms = Date.now() - t0;
    console.log(
      `[MLAnomalyDetector] Auto-trained Isolation Forest on ` +
      `${normal.length} synthetic normal samples in ${ms} ms.`
    );
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Detect anomaly in a single reading.
   * @param {object} reading - Raw telemetry reading
   * @returns {{
   *   score: number,          Isolation Forest anomaly score [0,1] — closer to 1 = more anomalous
   *   isAnomaly: boolean,
   *   confidence: number,     How strongly the model believes this classification [0,1]
   *   method: string,
   *   featureVector: number[], Normalised 8-feature vector used
   *   featureNames: string[]
   * }}
   */
  detect(reading) {
    if (!this._trained || !this._model) {
      return {
        score:         0.5,
        isAnomaly:     false,
        confidence:    0,
        method:        'FALLBACK_NOT_READY',
        featureVector: [],
        featureNames:  FEATURE_NAMES
      };
    }

    const { features, raw } = extractFeatures(reading);
    const result   = this._model.score(features);

    // NEW: Track anomalies for clustering
    if (result.isAnomaly) {
      this._trackAnomaly(reading, raw, features, result);
    }

    return {
      score:         result.score,
      isAnomaly:     result.isAnomaly,
      confidence:    result.confidence,
      threshold:     result.threshold,
      method:        'ISOLATION_FOREST_ML',
      trainedOn:     this._trainedOn,
      trainedAt:     this._trainedAt,
      featureVector: features.map(v => parseFloat(v.toFixed(4))),
      featureNames:  FEATURE_NAMES
    };
  }

  /**
   * NEW: Track detected anomaly for clustering analysis
   * @private
   */
  _trackAnomaly(reading, raw, features, result) {
    const anomaly = {
      timestamp: Date.now(),
      reading: reading,
      raw: raw,
      features: features,
      score: result.score,
      confidence: result.confidence
    };

    this._anomalyHistory.push(anomaly);

    // Keep only the most recent anomalies
    if (this._anomalyHistory.length > this._options.maxAnomalyHistory) {
      this._anomalyHistory.shift();
    }
  }

  /**
   * NEW: Cluster detected anomalies to find patterns
   * @param {number} limit - Max number of recent anomalies to cluster (default 100)
   * @returns {{
   *   clusters: Array<{
   *     id: number,
   *     name: string,
   *     count: number,
   *     avgScore: number,
   *     centroid: object,
   *     samples: Array
   *   }>,
   *   totalAnomalies: number,
   *   clusteringTime: number
   * }}
   */
  clusterAnomalies(limit = 100) {
    if (this._anomalyHistory.length < 4) {
      return {
        error: 'Insufficient anomalies for clustering',
        required: 4,
        available: this._anomalyHistory.length,
        clusters: []
      };
    }

    const t0 = Date.now();
    
    // Get recent anomalies
    const recent = this._anomalyHistory.slice(-limit);
    
    // Extract feature vectors
    const features = recent.map(a => a.features);
    
    // Cluster using K-means (k=4)
    const clusterer = new AnomalyClusterer({ k: 4 });
    const assignments = clusterer.cluster(features);
    
    // Group anomalies by cluster
    const clusters = [];
    for (let i = 0; i < 4; i++) {
      const clusterAnomalies = recent.filter((_, idx) => assignments[idx] === i);
      
      if (clusterAnomalies.length === 0) continue;
      
      // Calculate cluster statistics
      const avgScore = clusterAnomalies.reduce((sum, a) => sum + a.score, 0) / clusterAnomalies.length;
      
      // Determine cluster name based on dominant features
      const name = this._nameCluster(clusterAnomalies);
      
      // Get centroid in original feature space
      const centroid = {};
      FEATURE_NAMES.forEach((fname, idx) => {
        const values = clusterAnomalies.map(a => a.raw[fname]);
        centroid[fname] = values.reduce((sum, v) => sum + v, 0) / values.length;
      });
      
      clusters.push({
        id: i,
        name: name,
        count: clusterAnomalies.length,
        avgScore: parseFloat(avgScore.toFixed(4)),
        centroid: centroid,
        samples: clusterAnomalies.slice(0, 5).map(a => ({ // First 5 samples
          timestamp: a.timestamp,
          score: a.score,
          reading: a.reading
        }))
      });
    }
    
    const clusteringTime = Date.now() - t0;
    
    return {
      status: 'success',
      totalAnomalies: this._anomalyHistory.length,
      analyzedCount: recent.length,
      clusters: clusters.sort((a, b) => b.count - a.count), // Sort by size
      clusteringTime: clusteringTime
    };
  }

  /**
   * Determine cluster name based on which features are most abnormal
   * @private
   */
  _nameCluster(anomalies) {
    // Calculate average raw values
    const avgFeatures = {};
    FEATURE_NAMES.forEach(fname => {
      const values = anomalies.map(a => a.raw[fname]);
      avgFeatures[fname] = values.reduce((sum, v) => sum + v, 0) / values.length;
    });

    // Check for specific patterns
    if (avgFeatures.efficiencyRatio > 1.2) {
      return 'fraud_high_efficiency';
    }
    if (avgFeatures.generatedKwh > 3000) {
      return 'generation_spike';
    }
    if (avgFeatures.pH < 5.5 || avgFeatures.pH > 9.0 || avgFeatures.turbidity_ntu > 200) {
      return 'environmental_anomaly';
    }
    if (avgFeatures.powerDensity > 30) {
      return 'power_density_outlier';
    }
    
    return 'mixed_anomalies';
  }

  /**
   * Get anomaly history statistics
   * @returns {{ count: number, oldestTimestamp: number, newestTimestamp: number }}
   */
  getAnomalyStats() {
    if (this._anomalyHistory.length === 0) {
      return {
        count: 0,
        oldestTimestamp: null,
        newestTimestamp: null
      };
    }

    return {
      count: this._anomalyHistory.length,
      oldestTimestamp: this._anomalyHistory[0].timestamp,
      newestTimestamp: this._anomalyHistory[this._anomalyHistory.length - 1].timestamp
    };
  }

  /**
   * Detect anomaly AND explain which features triggered it.
   * @param {object} reading - Raw telemetry reading
   * @returns {{
   *   score: number,
   *   isAnomaly: boolean,
   *   method: string,
   *   explanation: {
   *     topFeatures: Array<{ feature: string, importance: number, value: number }>,
   *     summary: string
   *   }
   * }}
   */
  detectWithExplanation(reading) {
    if (!this._trained || !this._model) {
      return {
        score:      0.5,
        isAnomaly:  false,
        method:     'FALLBACK_NOT_READY',
        explanation: { topFeatures: [], summary: 'Model not trained' }
      };
    }

    const { features, raw } = extractFeatures(reading);
    const explanation   = this._model.explainScore(features);

    // Get top 3 features by importance
    const topFeatures = explanation.featureImportance.slice(0, 3).map(f => ({
      feature:    f.feature,
      importance: f.normalized,
      value:      parseFloat(raw[f.feature].toFixed(3)),
      normalizedValue: f.originalValue
    }));

    // Generate human-readable summary
    const featureList = topFeatures
      .map(f => `${f.feature} (${(f.importance * 100).toFixed(0)}%)`)
      .join(', ');
    const summary = explanation.isAnomaly
      ? `Anomaly triggered by: ${featureList}`
      : `Normal reading. Top features: ${featureList}`;

    // Track anomalies
    if (explanation.isAnomaly) {
      this._trackAnomaly(reading, raw, features, explanation);
    }

    return {
      score:         explanation.score,
      isAnomaly:     explanation.isAnomaly,
      threshold:     explanation.threshold,
      confidence:    topFeatures.length > 0 ? topFeatures[0].importance : 0,
      method:        'ISOLATION_FOREST_ML',
      trainedOn:     this._trainedOn,
      trainedAt:     this._trainedAt,
      explanation: {
        topFeatures,
        allFeatures: explanation.featureImportance,
        summary
      }
    };
  }

  /**
   * Retrain on new data (call after collecting real pilot readings).
   * @param {object[]} readings - Array of raw telemetry readings (normal only)
   */
  retrain(readings) {
    if (!readings || readings.length < 50) {
      throw new Error('[MLAnomalyDetector] Need at least 50 readings to retrain');
    }
    const features = readings.map(r => extractFeatures(r).features);
    this._model = new IsolationForest({
      nTrees:        this._options.nTrees,
      sampleSize:    Math.min(this._options.sampleSize, features.length),
      contamination: this._options.contamination,
      featureNames:  FEATURE_NAMES
    });
    this._model.fit(features);
    this._trained   = true;
    this._trainedOn = readings.length;
    this._trainedAt = new Date().toISOString();
    console.log(`[MLAnomalyDetector] Retrained on ${readings.length} real readings.`);
  }

  /** Save trained model to disk. */
  saveModel(savePath) {
    if (!this._trained) throw new Error('[MLAnomalyDetector] No model to save');
    const saveTo = savePath || this._options.modelPath;
    const dir    = path.dirname(saveTo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      version:    '1.0',
      algorithm:  'IsolationForest',
      trainedOn:  this._trainedOn,
      trainedAt:  this._trainedAt,
      features:   FEATURE_NAMES,
      bounds:     BOUNDS,
      forest:     this._model.toJSON()
    };
    fs.writeFileSync(saveTo, JSON.stringify(payload, null, 2));
    console.log(`[MLAnomalyDetector] Model saved to ${saveTo}`);
    return saveTo;
  }

  /** Model metadata for diagnostics. */
  getInfo() {
    return {
      trained:    this._trained,
      trainedOn:  this._trainedOn,
      trainedAt:  this._trainedAt,
      nTrees:     this._options.nTrees,
      sampleSize: this._options.sampleSize,
      contamination: this._options.contamination,
      featureNames:  FEATURE_NAMES,
      algorithm:  'IsolationForest (Liu et al., ICDM 2008)',
      anomalyHistory: this._anomalyHistory.length
    };
  }
}

// Singleton — one trained model shared across the whole process
let _singleton = null;
function getMLDetector(options) {
  if (!_singleton) _singleton = new MLAnomalyDetector(options);
  return _singleton;
}

module.exports = { MLAnomalyDetector, getMLDetector, extractFeatures, FEATURE_NAMES, BOUNDS };
