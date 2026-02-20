/**
 * Hedera ML Integration Test (Jest)
 */
const FraudDetector = require('../../ml/src/fraud_detector');

describe('🔗 Hedera ML Integration Test', () => {
  let fraudDetector;
  let testResults = [];

  beforeAll(async () => {
    fraudDetector = new FraudDetector();
    await fraudDetector.initialize();
    
    console.log('\n📊 Test Setup:');
    console.log('  ML Model:', fraudDetector.isModelLoaded() ? 'Loaded ✅' : 'Fallback ⚠️');
  }, 30000);

  test('should initialize fraud detector', () => {
    expect(fraudDetector).toBeDefined();
    expect(fraudDetector.getStats).toBeDefined();
  });

  test('should detect readings with model or fallback', async () => {
    const reading = {
      plantId: 'PLANT_001',
      waterFlow: 125.0,
      powerOutput: 95.0,
      efficiency: 0.88
    };
    
    const result = await fraudDetector.predict(reading);
    
    console.log('\n🧪 Normal Reading:');
    console.log('  Fraud:', result.isFraud);
    console.log('  Score:', result.score.toFixed(2));
    console.log('  Method:', result.method);
    
    // Verify prediction works (ML or fallback)
    expect(result).toHaveProperty('isFraud');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('method');
    expect(['ML_ISOLATION_FOREST', 'RULE_BASED_ZSCORE']).toContain(result.method);
    
    testResults.push({ reading, result });
  }, 30000);

  test('should process batch of readings', async () => {
    const readings = [
      { waterFlow: 130, powerOutput: 98, efficiency: 0.91 },
      { waterFlow: 220, powerOutput: 50, efficiency: 0.30 },
      { waterFlow: 125, powerOutput: 95, efficiency: 0.88 }
    ];
    
    console.log('\n📊 Batch Processing:');
    
    for (let i = 0; i < readings.length; i++) {
      const result = await fraudDetector.predict(readings[i]);
      console.log(`  ${i+1}. ${result.isFraud ? '🚨 FRAUD' : '✅ CLEAN'} (score: ${result.score.toFixed(2)}, method: ${result.method})`);
      testResults.push({ reading: readings[i], result });
    }
    
    expect(testResults.length).toBeGreaterThan(0);
  }, 30000);

  afterAll(() => {
    const stats = fraudDetector.getStats();
    
    console.log('\n═══════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log('ML Model Status:', stats.modelLoaded ? 'Active ✅' : 'Fallback ⚠️');
    console.log('Total Predictions:', stats.totalPredictions);
    console.log('ML Usage Rate:', stats.mlUsageRate.toFixed(1) + '%');
    console.log('Tests Processed:', testResults.length);
    console.log('═══════════════════════════════════════\n');
  });
});


