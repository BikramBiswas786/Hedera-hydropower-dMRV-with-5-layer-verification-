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
    expect(detector.isModelLoaded()).toBe(true);
  });
  
  test('should detect normal reading', async () => {
    const reading = { waterFlow: 125, powerOutput: 95, efficiency: 0.88 };
    const result = await detector.predict(reading);
    
    console.log('Normal:', result.isFraud, 'Score:', result.score.toFixed(3));
    
    // Verify ML is active
    expect(result.method).toBe('ML_ISOLATION_FOREST');
    expect(result.score).toBeGreaterThanOrEqual(0);
  }, 30000);
  
  test('should detect fraud reading', async () => {
    const reading = { waterFlow: 250, powerOutput: 45, efficiency: 0.25 };
    const result = await detector.predict(reading);
    
    console.log('Fraud:', result.isFraud, 'Score:', result.score.toFixed(3));
    
    expect(result.method).toBe('ML_ISOLATION_FOREST');
    expect(result.isFraud).toBe(true);
  }, 30000);
});
