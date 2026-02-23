'use strict';

/**
 * ML Accuracy Benchmark
 * ─────────────────────────────────────────────────────
 * Trains Isolation Forest on 2000 synthetic samples.
 * Tests on 500 FRESH samples (never seen during training).
 * Verifies the accuracy claim used in /api/features.
 *
 * Run with:
 *   npm test -- test/ml/accuracy-benchmark.test.js
 *
 * IMPORTANT: originally written in Mocha/Chai syntax.
 * Converted to Jest (project test runner) — no chai dependency needed.
 */

// Raise Jest timeout for this file — training can take 5-15 s
jest.setTimeout(60_000);

const { MLAnomalyDetector }    = require('../../src/ml/MLAnomalyDetector');
const { generateDataset }      = require('../../src/ml/SyntheticDataGenerator');

describe('ML Accuracy Benchmark — Isolation Forest', () => {
  let detector;
  let testDataset;   // 500 labeled samples, never seen during training
  let results = {};  // filled in the accuracy test, reused in later checks

  // ─── Setup ───────────────────────────────────────────────────
  // beforeAll replaces Mocha’s before()
  beforeAll(() => {
    detector = new MLAnomalyDetector({
      nTrees:        100,
      sampleSize:    256,
      contamination: 0.10,
      autoTrain:     true,
      trainSamples:  2000
    });

    testDataset = generateDataset(500);
  });

  // ─── Sanity checks ───────────────────────────────────────────────

  test('model is trained and reports correct metadata', () => {
    const info = detector.getInfo();
    expect(info.trained).toBe(true);
    expect(info.trainedOn).toBeGreaterThan(0);
    expect(info.featureNames).toHaveLength(8);
    expect(info.algorithm).toContain('IsolationForest');
  });

  test('test dataset contains both normal and anomaly samples', () => {
    const normals   = testDataset.filter(s => s.label === 'normal').length;
    const anomalies = testDataset.filter(s => s.label === 'anomaly').length;
    expect(normals).toBeGreaterThan(0);
    expect(anomalies).toBeGreaterThan(0);
    console.log(`  ℹ️  Test dataset: ${normals} normal, ${anomalies} anomaly (total ${testDataset.length})`);
  });

  // ─── Core accuracy benchmark ───────────────────────────────────────────

  test('achieves >= 90% overall accuracy on 500 fresh labeled samples', () => {
    let tp = 0, tn = 0, fp = 0, fn = 0;

    testDataset.forEach(sample => {
      const result    = detector.detect(sample.reading);
      const predicted = result.isAnomaly ? 'anomaly' : 'normal';
      const actual    = sample.label;

      if (predicted === actual) {
        if (actual === 'anomaly') tp++;
        else                      tn++;
      } else {
        if (actual === 'anomaly') fn++;
        else                      fp++;
      }
    });

    const total     = testDataset.length;
    const accuracy  = (tp + tn) / total;
    const precision = tp / (tp + fp) || 0;
    const recall    = tp / (tp + fn) || 0;
    const f1 = (precision + recall) > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    results = { accuracy, precision, recall, f1, tp, tn, fp, fn, total };

    console.log('\n  📊 ML Benchmark Results:');
    console.log(`     Total samples : ${total}`);
    console.log(`     TP  FP  FN  TN: ${tp}  ${fp}  ${fn}  ${tn}`);
    console.log(`     Accuracy      : ${(accuracy  * 100).toFixed(1)}%`);
    console.log(`     Precision     : ${(precision * 100).toFixed(1)}%`);
    console.log(`     Recall        : ${(recall    * 100).toFixed(1)}%`);
    console.log(`     F1 Score      : ${(f1        * 100).toFixed(1)}%\n`);

    expect(
      accuracy,
      `Accuracy ${(accuracy * 100).toFixed(1)}% must be >= 90%`
    ).toBeGreaterThanOrEqual(0.90);
  });

  // ─── Named fraud / normal cases ─────────────────────────────────────────

  test('flags extreme fraud: generation >> theoretical max', () => {
    // Q=2 m³/s, H=20 m → P_theoretical = ρ g Q H η = 1000*9.81*2*20*0.85/1000 ≈ 333 kW
    const fraud = {
      flowRate_m3_per_s:    2.0,
      headHeight_m:         20,
      generatedKwh:      9_999,   // 30× theoretical — obvious fraud
      pH:                    7.0,
      turbidity_ntu:        10,
      temperature_celsius:  20
    };
    const r = detector.detect(fraud);
    expect(r.isAnomaly).toBe(true);
    expect(r.method).toBe('ISOLATION_FOREST_ML');
    expect(r.score).toBeGreaterThan(0.5);
  });

  test('flags environmental anomaly: pH out of range (acid event)', () => {
    const acidEvent = {
      flowRate_m3_per_s:    5.0,
      headHeight_m:         30,
      generatedKwh:       1200,
      pH:                    2.5,  // extreme acid
      turbidity_ntu:       500,
      temperature_celsius:  20
    };
    const r = detector.detect(acidEvent);
    expect(r.isAnomaly).toBe(true);
  });

  test('classifies a typical normal reading as normal', () => {
    const normal = {
      flowRate_m3_per_s:    5.0,
      headHeight_m:         30,
      generatedKwh:      1_180,   // ≈ theoretical 1237 kW at 85% efficiency
      pH:                    7.2,
      turbidity_ntu:        15,
      temperature_celsius:  18
    };
    const r = detector.detect(normal);
    expect(r.isAnomaly).toBe(false);
    expect(r.method).toBe('ISOLATION_FOREST_ML');
  });

  // ─── Feature vector ──────────────────────────────────────────────────────

  test('returns a normalised 8-dimensional feature vector in [0, 1]', () => {
    const r = detector.detect({
      flowRate_m3_per_s:    3.0,
      headHeight_m:         25,
      generatedKwh:        600,
      pH:                    7.0,
      turbidity_ntu:        10,
      temperature_celsius:  20
    });
    expect(r.featureVector).toHaveLength(8);
    r.featureVector.forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  // ─── Explainability ──────────────────────────────────────────────────────

  test('detectWithExplanation returns top features and summary', () => {
    const r = detector.detectWithExplanation({
      flowRate_m3_per_s:    5.0,
      headHeight_m:         30,
      generatedKwh:      8_000,   // suspicious
      pH:                    7.0,
      turbidity_ntu:        10,
      temperature_celsius:  20
    });
    expect(r.explanation).toBeDefined();
    expect(r.explanation).not.toBeNull();
    expect(Array.isArray(r.explanation.topFeatures)).toBe(true);
    expect(typeof r.explanation.summary).toBe('string');
  });

  // ─── Retraining ──────────────────────────────────────────────────────────

  test('retrains without error on >= 50 normal readings', () => {
    const freshNormals = generateDataset(100)
      .filter(s => s.label === 'normal')
      .slice(0, 80)
      .map(s => s.reading);

    expect(() => detector.retrain(freshNormals)).not.toThrow();
    const info = detector.getInfo();
    expect(info.trainedOn).toBe(80);
  });
});
