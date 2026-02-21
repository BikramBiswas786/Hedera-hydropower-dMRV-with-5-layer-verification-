'use strict';

/**
 * Train Isolation Forest on 5000 synthetic hydropower samples and
 * save the model to ml/model.json with SHA-256 hash.
 *
 * Usage:
 *   node scripts/train-and-save-model.js
 *   node scripts/train-and-save-model.js --samples=10000
 */

const path = require('path');
const crypto = require('crypto');
const { MLAnomalyDetector } = require('../src/ml/MLAnomalyDetector');
const { generateDataset }   = require('../src/ml/SyntheticDataGenerator');

const args        = process.argv.slice(2);
const samplesArg  = args.find(a => a.startsWith('--samples='));
const NUM_SAMPLES = samplesArg ? parseInt(samplesArg.split('=')[1], 10) : 5000;

console.log('═══════════════════════════════════════════════════════');
console.log(' Hedera Hydropower MRV — ML Model Training');
console.log(' Algorithm : Isolation Forest (Liu et al., ICDM 2008)');
console.log(` Samples   : ${NUM_SAMPLES}`);
console.log('═══════════════════════════════════════════════════════\n');

// 1. Generate labelled dataset
console.log(`[1/5] Generating ${NUM_SAMPLES} synthetic samples...`);
const t0      = Date.now();
const dataset = generateDataset(NUM_SAMPLES);

const counts = dataset.reduce((acc, d) => {
  acc[d.label] = (acc[d.label] || 0) + 1;
  return acc;
}, {});

console.log('      Label distribution:');
for (const [label, count] of Object.entries(counts)) {
  const pct = ((count / NUM_SAMPLES) * 100).toFixed(1);
  console.log(`       ${label.padEnd(25)} ${count} (${pct}%)`);
}

// 2. Extract features from normal samples only
console.log('\n[2/5] Extracting features (8-dimensional, normalised)...');
const { extractFeatures } = require('../src/ml/MLAnomalyDetector');
const normalData   = dataset.filter(d => d.label === 'normal');
const trainFeatures = normalData.map(d => extractFeatures(d.reading).features);
console.log(`      Training on ${trainFeatures.length} normal samples (unsupervised).`);

// 3. Train model
console.log('\n[3/5] Training Isolation Forest (100 trees, sample_size=256)...');
const { IsolationForest } = require('../src/ml/IsolationForest');
const forest = new IsolationForest({
  nTrees:        100,
  sampleSize:    256,
  contamination: 0.10,
  featureNames: [
    'flowRate_m3_per_s', 'headHeight_m', 'generatedKwh',
    'pH', 'turbidity_ntu', 'temperature_celsius',
    'powerDensity', 'efficiencyRatio'
  ]
});
forest.fit(trainFeatures);
console.log(`      Trained. Anomaly threshold: ${forest.threshold.toFixed(4)}`);

// 4. Validate on held-out anomalies
console.log('\n[4/5] Validation (held-out anomaly set)...');
const anomalyData = dataset.filter(d => d.label !== 'normal');
let truePositives = 0, falseNegatives = 0, falsePositives = 0, trueNegatives = 0;

for (const sample of anomalyData) {
  const feat   = extractFeatures(sample.reading).features;
  const result = forest.score(feat);
  if (result.isAnomaly) truePositives++;  else falseNegatives++;
}
const valNormal = dataset.filter(d => d.label === 'normal').slice(0, 200);
for (const sample of valNormal) {
  const feat   = extractFeatures(sample.reading).features;
  const result = forest.score(feat);
  if (!result.isAnomaly) trueNegatives++;  else falsePositives++;
}

const precision = truePositives / (truePositives + falsePositives || 1);
const recall    = truePositives / (truePositives + falseNegatives || 1);
const f1        = 2 * precision * recall / (precision + recall || 1);

console.log(`      Anomaly detection (${anomalyData.length} anomaly samples + 200 normal):`);
console.log(`       True Positives  (fraud caught)  : ${truePositives}`);
console.log(`       False Negatives (fraud missed)   : ${falseNegatives}`);
console.log(`       True Negatives  (normal, correct): ${trueNegatives}`);
console.log(`       False Positives (normal, flagged): ${falsePositives}`);
console.log(`       Precision : ${(precision * 100).toFixed(1)}%`);
console.log(`       Recall    : ${(recall * 100).toFixed(1)}%`);
console.log(`       F1 Score  : ${(f1 * 100).toFixed(1)}%`);

// 5. Save with hash
console.log('\n[5/5] Saving model with SHA-256 hash...');
const fs       = require('fs');
const savePath = path.join(__dirname, '../ml/model.json');
const dir      = path.dirname(savePath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const payload = {
  version:      '1.0',
  algorithm:    'IsolationForest',
  reference:    'Liu, Ting & Zhou, ICDM 2008',
  trainedOn:    trainFeatures.length,
  trainedAt:    new Date().toISOString(),
  numSamples:   NUM_SAMPLES,
  features:     forest.featureNames,
  metrics: { precision, recall, f1 },
  forest:       forest.toJSON(),
  modelHash:    null  // Will be computed after serialization
};

const modelJson = JSON.stringify(payload, null, 2);

// Compute SHA-256 hash of serialized model
const hash = crypto.createHash('sha256').update(modelJson).digest('hex');
payload.modelHash = `sha256:${hash}`;

// Re-serialize with hash included
const finalJson = JSON.stringify(payload, null, 2);
fs.writeFileSync(savePath, finalJson);
const sizeKb = (fs.statSync(savePath).size / 1024).toFixed(1);

console.log(`\n✅ Model saved to ${savePath} (${sizeKb} KB)`);
console.log(`   Model Hash (SHA-256): ${payload.modelHash}`);
console.log(`   Total time: ${Date.now() - t0} ms`);
console.log(`\n   🔒 This hash can be published to Hedera HCS for immutable audit trail.`);
console.log(`   Run 'node src/api/server.js' — engine will auto-load this model.`);
console.log('═══════════════════════════════════════════════════════\n');
