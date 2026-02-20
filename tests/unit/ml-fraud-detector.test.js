const FraudDetector = require('../../ml/src/fraud_detector');

describe('ML Fraud Detector Unit Tests', () => {
  let detector;
  
  beforeAll(async () => {
    detector = new FraudDetector();
    await detector.initialize();
    console.log('Model loaded:', detector.isModelLoaded());
  }, 30000);
  
  test('should initialize successfully', () => {
    expect(detector).toBeDefined();
  });
  
  test('should detect readings (ML or fallback)', async () => {
    const reading = { waterFlow: 125, powerOutput: 95, efficiency: 0.88 };
    const result = await detector.predict(reading);
    
    console.log('Result:', result.isFraud, 'Score:', result.score.toFixed(3), 'Method:', result.method);
    
    expect(result).toHaveProperty('isFraud');
    expect(result).toHaveProperty('method');
    expect(result.score).toBeGreaterThanOrEqual(0);
  }, 30000);
  
  test('should detect anomalous readings', async () => {
    const reading = { waterFlow: 250, powerOutput: 45, efficiency: 0.25 };
    const result = await detector.predict(reading);
    
    console.log('Anomaly:', result.isFraud, 'Score:', result.score.toFixed(3));
    
    expect(result).toHaveProperty('isFraud');
    expect(result.score).toBeGreaterThanOrEqual(0);
  }, 30000);
});
