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

  test('should detect normal reading with ML model', async () => {
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
    
    // Verify ML model is active
    expect(result.method).toBe('ML_ISOLATION_FOREST');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('confidence');
    
    testResults.push({ reading, result, expected: 'normal' });
  }, 30000);

  test('should detect fraud reading with ML model', async () => {
    const reading = {
      plantId: 'PLANT_001',
      waterFlow: 250.0,
      powerOutput: 45.0,
      efficiency: 0.25
    };
    
    const result = await fraudDetector.predict(reading);
    
    console.log('\n🚨 Fraud Reading:');
    console.log('  Fraud:', result.isFraud);
    console.log('  Score:', result.score.toFixed(2));
    console.log('  Method:', result.method);
    
    // Verify ML model is active and detects anomaly
    expect(result.method).toBe('ML_ISOLATION_FOREST');
    expect(result.isFraud).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
    
    testResults.push({ reading, result, expected: 'fraud' });
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
      console.log(`  ${i+1}. ${result.isFraud ? '🚨 FRAUD' : '✅ CLEAN'} (score: ${result.score.toFixed(2)})`);
      testResults.push({ reading: readings[i], result });
    }
    
    // Verify all readings were processed with ML
    expect(testResults.length).toBeGreaterThan(0);
    const mlUsed = testResults.filter(t => t.result.method === 'ML_ISOLATION_FOREST').length;
    expect(mlUsed).toBe(testResults.length);
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


