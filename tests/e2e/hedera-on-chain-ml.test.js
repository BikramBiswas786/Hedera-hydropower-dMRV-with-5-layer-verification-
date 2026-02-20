/**
 * Hedera On-Chain ML E2E Test (Jest)
 */
const FraudDetector = require('../../ml/src/fraud_detector');

describe('🌐 Hedera On-Chain ML E2E Test', () => {
  let fraudDetector;
  let testResults = [];

  beforeAll(async () => {
    fraudDetector = new FraudDetector();
    await fraudDetector.initialize();
    
    console.log('\n🚀 E2E Test Setup:');
    console.log('  ML Model:', fraudDetector.isModelLoaded() ? 'Active ✅' : 'Fallback ⚠️');
  }, 30000);

  test('should run complete fraud detection flow', async () => {
    const testCases = [
      { waterFlow: 130, powerOutput: 98, efficiency: 0.91 },
      { waterFlow: 220, powerOutput: 50, efficiency: 0.30 }
    ];
    
    console.log('\n📊 Processing test cases:');
    
    for (const reading of testCases) {
      const result = await fraudDetector.predict(reading);
      console.log(`  ${result.isFraud ? '🚨 FRAUD' : '✅ CLEAN'}: Score=${result.score.toFixed(2)}, Method=${result.method}`);
      testResults.push(result);
    }
    
    expect(testResults.length).toBe(2);
    testResults.forEach(r => {
      expect(r).toHaveProperty('method');
      expect(['ML_ISOLATION_FOREST', 'RULE_BASED_ZSCORE']).toContain(r.method);
    });
  }, 30000);

  afterAll(() => {
    const stats = fraudDetector.getStats();
    
    console.log('\n═══════════════════════════════════════');
    console.log('🎉 E2E TEST COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log('Total Tests:', testResults.length);
    console.log('ML Usage Rate:', stats.mlUsageRate.toFixed(1) + '%');
    console.log('═══════════════════════════════════════\n');
  });
});

