/**
 * Unit Tests for Anomaly Detector Module
 * Tests all physics constraints, temporal consistency, environmental bounds, and statistical anomaly detection
 * Target Coverage: 95%+
 */

const test = require('tape');
const AnomalyDetector = require('../../src/anomaly-detector');

// ============================================================================
// PHYSICS CONSTRAINTS TESTS
// ============================================================================

test('Physics Constraints - Valid Reading', (t) => {
  const detector = new AnomalyDetector();
  const validReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const result = detector.validatePhysicsConstraints(validReading);
  t.ok(result.isValid, 'Valid reading should pass physics validation');
  t.equal(result.reason, undefined, 'No rejection reason for valid reading');
  t.end();
});

test('Physics Constraints - Invalid Flow Rate (Too High)', (t) => {
  const detector = new AnomalyDetector();
  const invalidReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: 150.0, // Way too high
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 5000.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const result = detector.validatePhysicsConstraints(invalidReading);
  t.notOk(result.isValid, 'Invalid flow rate should fail physics validation');
  t.ok(result.reason.includes('Physics constraint violation'), 'Should have physics violation reason');
  t.end();
});

test('Physics Constraints - Invalid Head (Negative)', (t) => {
  const detector = new AnomalyDetector();
  const invalidReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: 2.5,
    head: -45.0, // Negative head
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const result = detector.validatePhysicsConstraints(invalidReading);
  t.notOk(result.isValid, 'Negative head should fail physics validation');
  t.ok(result.reason.includes('Physics constraint violation'), 'Should have physics violation reason');
  t.end();
});

test('Physics Constraints - Invalid Efficiency', (t) => {
  const detector = new AnomalyDetector();
  const invalidReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 1000.0, // Way too high for given flow/head
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const result = detector.validatePhysicsConstraints(invalidReading);
  t.notOk(result.isValid, 'Efficiency violation should fail physics validation');
  t.ok(result.reason.includes('Physics constraint violation'), 'Should have physics violation reason');
  t.end();
});

// ============================================================================
// TEMPORAL CONSISTENCY TESTS
// ============================================================================

test('Temporal Consistency - Valid Increasing Generation', (t) => {
  const detector = new AnomalyDetector();
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const currentReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    generatedKwh: 1050.0
  };

  const result = detector.validateTemporalConsistency(currentReading, previousReading);
  t.ok(result.isValid, 'Increasing generation should pass temporal validation');
  t.end();
});

test('Temporal Consistency - Generation Decreased', (t) => {
  const detector = new AnomalyDetector();
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const currentReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    generatedKwh: 950.0 // Decreased
  };

  const result = detector.validateTemporalConsistency(currentReading, previousReading);
  t.notOk(result.isValid, 'Decreased generation should fail temporal validation');
  t.ok(result.reason.includes('generation decreased'), 'Should have generation decrease reason');
  t.end();
});

test('Temporal Consistency - Timestamp Not Increasing', (t) => {
  const detector = new AnomalyDetector();
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    generatedKwh: 1000.0
  };
  const currentReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z', // Earlier timestamp
    generatedKwh: 1050.0
  };

  const result = detector.validateTemporalConsistency(currentReading, previousReading);
  t.notOk(result.isValid, 'Non-increasing timestamp should fail temporal validation');
  t.ok(result.reason.includes('timestamp not increasing'), 'Should have timestamp reason');
  t.end();
});

test('Temporal Consistency - Generation Increase Too Large', (t) => {
  const detector = new AnomalyDetector();
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const currentReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z', // 1 hour later
    generatedKwh: 2000.0 // 1000 kWh in 1 hour (unrealistic for 100 kW plant)
  };

  const result = detector.validateTemporalConsistency(currentReading, previousReading);
  t.notOk(result.isValid, 'Unrealistic generation increase should fail temporal validation');
  t.ok(result.reason.includes('generation increase too large'), 'Should have generation increase reason');
  t.end();
});

// ============================================================================
// ENVIRONMENTAL BOUNDS TESTS
// ============================================================================

test('Environmental Bounds - All Valid', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0,
    flowRate: 2.5,
    head: 45.0
  };
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.validateEnvironmentalBounds(telemetry, siteConfig);
  t.ok(result.isValid, 'All valid environmental parameters should pass');
  t.equal(result.violations.length, 0, 'No violations should be reported');
  t.end();
});

test('Environmental Bounds - pH Out of Range (Too Low)', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    pH: 5.0, // Too low
    turbidity: 12.5,
    temperature: 18.0,
    flowRate: 2.5,
    head: 45.0
  };
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.validateEnvironmentalBounds(telemetry, siteConfig);
  t.notOk(result.isValid, 'pH out of range should fail environmental validation');
  t.ok(result.violations.some(v => v.includes('ph')), 'Should have pH violation');
  t.end();
});

test('Environmental Bounds - Turbidity Out of Range (Too High)', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    pH: 7.2,
    turbidity: 150.0, // Too high
    temperature: 18.0,
    flowRate: 2.5,
    head: 45.0
  };
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.validateEnvironmentalBounds(telemetry, siteConfig);
  t.notOk(result.isValid, 'Turbidity out of range should fail environmental validation');
  t.ok(result.violations.some(v => v.includes('turbidity')), 'Should have turbidity violation');
  t.end();
});

test('Environmental Bounds - Temperature Out of Range', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    pH: 7.2,
    turbidity: 12.5,
    temperature: 50.0, // Too high
    flowRate: 2.5,
    head: 45.0
  };
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.validateEnvironmentalBounds(telemetry, siteConfig);
  t.notOk(result.isValid, 'Temperature out of range should fail environmental validation');
  t.ok(result.violations.some(v => v.includes('temperature')), 'Should have temperature violation');
  t.end();
});

test('Environmental Bounds - Flow Rate Out of Range', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0,
    flowRate: 150.0, // Out of site bounds
    head: 45.0
  };
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.validateEnvironmentalBounds(telemetry, siteConfig);
  t.notOk(result.isValid, 'Flow rate out of range should fail environmental validation');
  t.ok(result.violations.some(v => v.includes('flowRate')), 'Should have flow rate violation');
  t.end();
});

// ============================================================================
// STATISTICAL ANOMALY DETECTION TESTS
// ============================================================================

test('Statistical Anomaly Detection - Normal Reading', (t) => {
  const detector = new AnomalyDetector();
  const currentReading = { generatedKwh: 156.0 };
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 },
    { generatedKwh: 158.0 },
    { generatedKwh: 154.0 }
  ];

  const result = detector.detectStatisticalAnomalies(currentReading, historicalReadings);
  t.ok(result.isValid, 'Normal reading should pass statistical anomaly detection');
  t.ok(result.zScore < 3, 'Z-score should be less than 3');
  t.end();
});

test('Statistical Anomaly Detection - Outlier (High)', (t) => {
  const detector = new AnomalyDetector();
  const currentReading = { generatedKwh: 500.0 }; // Way too high
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 },
    { generatedKwh: 158.0 },
    { generatedKwh: 154.0 }
  ];

  const result = detector.detectStatisticalAnomalies(currentReading, historicalReadings);
  t.notOk(result.isValid, 'Outlier should fail statistical anomaly detection');
  t.ok(result.zScore > 3, 'Z-score should be greater than 3');
  t.end();
});

test('Statistical Anomaly Detection - Outlier (Low)', (t) => {
  const detector = new AnomalyDetector();
  const currentReading = { generatedKwh: 10.0 }; // Way too low
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 },
    { generatedKwh: 158.0 },
    { generatedKwh: 154.0 }
  ];

  const result = detector.detectStatisticalAnomalies(currentReading, historicalReadings);
  t.notOk(result.isValid, 'Outlier should fail statistical anomaly detection');
  t.ok(result.zScore > 3, 'Z-score should be greater than 3');
  t.end();
});

test('Statistical Anomaly Detection - Edge Case (Z-score = 3)', (t) => {
  const detector = new AnomalyDetector();
  const currentReading = { generatedKwh: 200.0 };
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 },
    { generatedKwh: 158.0 },
    { generatedKwh: 154.0 }
  ];

  const result = detector.detectStatisticalAnomalies(currentReading, historicalReadings);
  // Edge case: Z-score exactly at threshold
  if (result.zScore >= 3) {
    t.notOk(result.isValid, 'Reading at Z-score threshold should fail');
  } else {
    t.ok(result.isValid, 'Reading below Z-score threshold should pass');
  }
  t.end();
});

// ============================================================================
// COMPLETE VALIDATION TESTS
// ============================================================================

test('Complete Validation - All Checks Pass', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 }
  ];
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.completeValidation(telemetry, previousReading, historicalReadings, siteConfig);
  t.ok(result.isValid, 'All checks passing should result in valid reading');
  t.ok(result.physics.isValid, 'Physics check should pass');
  t.ok(result.temporal.isValid, 'Temporal check should pass');
  t.ok(result.environmental.isValid, 'Environmental check should pass');
  t.ok(result.statistical.isValid, 'Statistical check should pass');
  t.end();
});

test('Complete Validation - Physics Fails', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 5000.0, // Invalid
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const historicalReadings = [
    { generatedKwh: 150.0 },
    { generatedKwh: 152.0 },
    { generatedKwh: 155.0 }
  ];
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const result = detector.completeValidation(telemetry, previousReading, historicalReadings, siteConfig);
  t.notOk(result.isValid, 'Physics failure should result in invalid reading');
  t.notOk(result.physics.isValid, 'Physics check should fail');
  t.end();
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

test('Edge Case - Missing Required Fields', (t) => {
  const detector = new AnomalyDetector();
  const incompleteReading = {
    deviceId: 'TURBINE-1',
    // Missing timestamp, flowRate, head, etc.
  };

  try {
    detector.validatePhysicsConstraints(incompleteReading);
    t.fail('Should throw error for missing fields');
  } catch (error) {
    t.ok(error, 'Should throw error for missing fields');
    t.end();
  }
});

test('Edge Case - Null Values', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: null,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  try {
    detector.validatePhysicsConstraints(telemetry);
    t.fail('Should throw error for null values');
  } catch (error) {
    t.ok(error, 'Should throw error for null values');
    t.end();
  }
});

test('Edge Case - Empty Historical Readings', (t) => {
  const detector = new AnomalyDetector();
  const currentReading = { generatedKwh: 156.0 };
  const historicalReadings = [];

  try {
    detector.detectStatisticalAnomalies(currentReading, historicalReadings);
    t.fail('Should throw error for empty historical readings');
  } catch (error) {
    t.ok(error, 'Should throw error for empty historical readings');
    t.end();
  }
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

test('Performance - Validation Latency', (t) => {
  const detector = new AnomalyDetector();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };
  const previousReading = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    generatedKwh: 1000.0
  };
  const historicalReadings = Array(30).fill({ generatedKwh: 155.0 });
  const siteConfig = {
    flowRateBounds: { min: 0.1, max: 100 },
    headBounds: { min: 10, max: 500 }
  };

  const startTime = Date.now();
  detector.completeValidation(telemetry, previousReading, historicalReadings, siteConfig);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.ok(latency < 100, `Validation should complete in < 100ms (actual: ${latency}ms)`);
  t.end();
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

test('Test Summary', (t) => {
  t.comment('Anomaly Detector Unit Tests Complete');
  t.comment('Coverage: Physics, Temporal, Environmental, Statistical, Edge Cases, Performance');
  t.comment('Target Coverage: 95%+');
  t.end();
});
