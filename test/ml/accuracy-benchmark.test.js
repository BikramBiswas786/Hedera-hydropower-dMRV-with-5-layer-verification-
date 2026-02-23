'use strict';

/**
 * ML Accuracy Benchmark
 * ───────────────────────────────────────────────────────
 * Trains Isolation Forest on 2000 synthetic samples.
 * Tests on 500 FRESH samples (never seen during training).
 * Verifies the accuracy claim used in /api/features.
 *
 * Run with:
 *   npm test -- test/ml/accuracy-benchmark.test.js
 *   npx mocha test/ml/accuracy-benchmark.test.js
 */

const { expect } = require('chai');
const { MLAnomalyDetector } = require('../../src/ml/MLAnomalyDetector');
const { generateDataset }   = require('../../src/ml/SyntheticDataGenerator');

describe('ML Accuracy Benchmark — Isolation Forest', function () {
  this.timeout(60_000); // Training can take 5–15 s

  let detector;
  let testDataset;   // 500 labeled samples never used in training
  let results = {};  // filled in the accuracy test, used in later checks

  // ─── Setup ──────────────────────────────────────────────────────────────

  before(function () {
    // Train on 2000 synthetic samples (normal + anomaly mix)
    detector = new MLAnomalyDetector({
      nTrees:       100,
      sampleSize:   256,
      contamination: 0.10,
      autoTrain:    true,
      trainSamples: 2000
    });

    // Generate 500 fresh labeled samples for evaluation
    testDataset = generateDataset(500);
  });

  // ─── Sanity checks ───────────────────────────────────────────────────────

  it('model is trained and reports correct metadata', function () {
    const info = detector.getInfo();
    expect(info.trained,       'model.trained').to.be.true;
    expect(info.trainedOn,     'trainedOn').to.be.greaterThan(0);
    expect(info.featureNames,  'featureNames').to.have.lengthOf(8);
    expect(info.algorithm,     'algorithm').to.include('IsolationForest');
  });

  it('test dataset contains both normal and anomaly samples', function () {
    const normals   = testDataset.filter(s => s.label === 'normal').length;
    const anomalies = testDataset.filter(s => s.label === 'anomaly').length;
    expect(normals,   'normal samples').to.be.greaterThan(0);
    expect(anomalies, 'anomaly samples').to.be.greaterThan(0);
    console.log(`  ℹ️  Test dataset: ${normals} normal, ${anomalies} anomaly (total ${testDataset.length})`);
  });

  // ─── Core accuracy benchmark ─────────────────────────────────────────────────

  it('achieves >= 90% overall accuracy on 500 fresh labeled samples', function () {
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
    const precision = tp / (tp + fp)  || 0;
    const recall    = tp / (tp + fn)  || 0;
    const f1 = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;

    // Persist for later assertions
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
    ).to.be.at.least(0.90);
  });

  // ─── Named fraud / normal cases ────────────────────────────────────────────

  it('flags extreme fraud: generation >> theoretical max', function () {
    // Q=2 m³/s, H=20 m  →  P_theoretical = ρ g Q H η = 1000*9.81*2*20*0.85 / 1000 ≈ 333 kW
    const fraud = {
      flowRate_m3_per_s:   2.0,
      headHeight_m:       20,
      generatedKwh:      9_999,  // 30× theoretical — obvious fraud
      pH:                 7.0,
      turbidity_ntu:     10,
      temperature_celsius: 20
    };
    const r = detector.detect(fraud);
    expect(r.isAnomaly,  'should be anomaly').to.be.true;
    expect(r.method,     'method').to.equal('ISOLATION_FOREST_ML');
    expect(r.score,      'score > 0.5').to.be.greaterThan(0.5);
  });

  it('flags environmental anomaly: pH out of range (acid event)', function () {
    const acidEvent = {
      flowRate_m3_per_s:   5.0,
      headHeight_m:       30,
      generatedKwh:      1200,
      pH:                  2.5,  // extreme acid
      turbidity_ntu:     500,
      temperature_celsius: 20
    };
    const r = detector.detect(acidEvent);
    expect(r.isAnomaly, 'acid pH should be anomaly').to.be.true;
  });

  it('classifies a typical normal reading as normal', function () {
    const normal = {
      flowRate_m3_per_s:   5.0,
      headHeight_m:       30,
      generatedKwh:      1_180,  // ≈ theoretical 1237 kW at 85% efficiency
      pH:                  7.2,
      turbidity_ntu:     15,
      temperature_celsius: 18
    };
    const r = detector.detect(normal);
    expect(r.isAnomaly, 'should be normal').to.be.false;
    expect(r.method).to.equal('ISOLATION_FOREST_ML');
  });

  // ─── Feature vector ───────────────────────────────────────────────────────────

  it('returns a normalised 8-dimensional feature vector [0, 1]', function () {
    const r = detector.detect({
      flowRate_m3_per_s:   3.0,
      headHeight_m:       25,
      generatedKwh:        600,
      pH:                  7.0,
      turbidity_ntu:      10,
      temperature_celsius: 20
    });
    expect(r.featureVector, 'featureVector length').to.have.lengthOf(8);
    r.featureVector.forEach((v, i) => {
      expect(v, `feature[${i}] in [0,1]`).to.be.within(0, 1);
    });
  });

  // ─── Explainability ───────────────────────────────────────────────────────────

  it('detectWithExplanation returns top features and summary', function () {
    const r = detector.detectWithExplanation({
      flowRate_m3_per_s:   5.0,
      headHeight_m:       30,
      generatedKwh:      8_000,  // suspicious
      pH:                  7.0,
      turbidity_ntu:      10,
      temperature_celsius: 20
    });
    expect(r.explanation,             'explanation exists').to.exist;
    expect(r.explanation.topFeatures, 'topFeatures array').to.be.an('array');
    expect(r.explanation.summary,     'summary string').to.be.a('string');
  });

  // ─── Retraining ──────────────────────────────────────────────────────────────

  it('retrains without error on >= 50 normal readings', function () {
    const freshNormals = generateDataset(100)
      .filter(s => s.label === 'normal')
      .slice(0, 80)
      .map(s => s.reading);

    expect(() => detector.retrain(freshNormals)).to.not.throw();
    const info = detector.getInfo();
    expect(info.trainedOn, 'retrainedOn 80 samples').to.equal(80);
  });
});
