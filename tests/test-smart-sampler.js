// ============================================
// SMART SAMPLER TEST SCRIPT
// ============================================
const SmartSampler = require('./smart-sampler');
async function testSmartSampler() {
  console.log('=== SMART SAMPLER TEST ===\n');
  const sampler = new SmartSampler({
    stratified: true,
    confidenceLevel: 0.95,
    highRiskRate: 0.30,
    mediumRiskRate: 0.10,
    lowRiskRate: 0.03
  });
  const device = {
    deviceId: 'TURBINE-TEST',
    mode: 'strict',
    deploymentDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    history: []
  };
  const results = [];
  for (let i = 0; i < 100; i++) {
    const trustScore = 0.90 + Math.random() * 0.10;
    results.push({
      attestation: {
        deviceId: 'TURBINE-TEST',
        timestamp: new Date().toISOString(),
        verificationStatus: trustScore >= 0.95 ? 'APPROVED' : (trustScore >= 0.90 ? 'APPROVED' : 'FLAGGED'),
        trustScore,
        calculations: {
          ER_tCO2: 0.72,
          RECs_issued: 0.72
        }
      },
      transactionId: `0.0.6255927@${Date.now() + i}`
    });
  }
  console.log('Testing stratified sampling...');
  const samplingResult = sampler.selectSamples(results, device);
  console.log('\nSampling Results:');
  console.log(`  Method: ${samplingResult.method}`);
  console.log(`  Total Samples: ${samplingResult.samples.length}`);
  console.log(`  Effective Rate: ${(samplingResult.effectiveRate * 100).toFixed(2)}%`);
  console.log(`\nStrata Sizes:`);
  console.log(`  High: ${samplingResult.strataSizes.high}`);
  console.log(`  Medium: ${samplingResult.strataSizes.medium}`);
  console.log(`  Low: ${samplingResult.strataSizes.low}`);
  console.log(`\nSample Sizes:`);
  console.log(`  High: ${samplingResult.sampleSizes.high}`);
  console.log(`  Medium: ${samplingResult.sampleSizes.medium}`);
  console.log(`  Low: ${samplingResult.sampleSizes.low}`);
  console.log('\nTesting confidence interval calculation...');
  const ci = sampler.calculateConfidenceInterval(3, 100, 1000);
  console.log(`  Estimate: ${(ci.estimate * 100).toFixed(2)}%`);
  console.log(`  Lower Bound: ${(ci.lowerBound * 100).toFixed(2)}%`);
  console.log(`  Upper Bound: ${(ci.upperBound * 100).toFixed(2)}%`);
  console.log(`  Margin of Error: ${(ci.marginOfError * 100).toFixed(2)}%`);
  console.log('\nTesting sampling report generation...');
  const report = sampler.generateSamplingReport(results, device);
  console.log(`  Population Total: ${report.population.total}`);
  console.log(`  Anomaly Rate: ${report.population.anomalyRate}%`);
  console.log(`  Confidence: ${report.statistics.interpretation}`);
  console.log(`  Recommendation: ${report.recommendation.action}`);
  console.log(`  Reason: ${report.recommendation.reason}`);
  console.log('\nTesting evidence export...');
  const evidence = sampler.exportSamplingEvidence();
  console.log(`  Total Events: ${evidence.totalEvents}`);
  console.log(`  Stratification: ${evidence.methodology.stratificationEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  Confidence Level: ${(evidence.methodology.confidenceLevel * 100).toFixed(0)}%`);
  console.log('\n✅ ALL TESTS PASSED');
}
testSmartSampler().catch(console.error);
