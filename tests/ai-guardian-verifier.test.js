/**
 * Unit Tests for AI Guardian Verifier Module
 * Tests trust scoring, auto-approval logic, and verification decision making
 * Target Coverage: 95%+
 */

const test = require('tape');
const AIGuardianVerifier = require('../../src/ai-guardian-verifier');

// ============================================================================
// TRUST SCORE CALCULATION TESTS
// ============================================================================

test('Trust Score - All Checks Pass', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore > 0.95, `Trust score should be > 0.95 (actual: ${trustScore})`);
  t.ok(trustScore <= 1.0, `Trust score should be <= 1.0 (actual: ${trustScore})`);
  t.end();
});

test('Trust Score - Physics Fails', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: false },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore < 0.8, `Trust score should be < 0.8 when physics fails (actual: ${trustScore})`);
  t.end();
});

test('Trust Score - Temporal Fails', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: false },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore < 0.8, `Trust score should be < 0.8 when temporal fails (actual: ${trustScore})`);
  t.end();
});

test('Trust Score - Environmental Fails', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: false },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore < 0.85, `Trust score should be < 0.85 when environmental fails (actual: ${trustScore})`);
  t.end();
});

test('Trust Score - Statistical Anomaly (Z-score = 2.5)', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 2.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore > 0.85, `Trust score should be > 0.85 with Z-score 2.5 (actual: ${trustScore})`);
  t.ok(trustScore < 1.0, `Trust score should be < 1.0 with Z-score 2.5 (actual: ${trustScore})`);
  t.end();
});

test('Trust Score - Multiple Failures', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: false },
    temporal: { isValid: false },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore < 0.6, `Trust score should be < 0.6 with multiple failures (actual: ${trustScore})`);
  t.end();
});

// ============================================================================
// AUTO-APPROVAL LOGIC TESTS
// ============================================================================

test('Auto-Approval - High Trust Score (0.95)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90 });
  const trustScore = 0.95;

  const result = verifier.determineVerificationStatus(trustScore);
  t.equal(result.status, 'APPROVED', 'High trust score should result in APPROVED');
  t.equal(result.method, 'AI_AUTO_APPROVED', 'Should use AI auto-approval method');
  t.equal(result.confidence, 0.95, 'Confidence should match trust score');
  t.end();
});

test('Auto-Approval - Low Trust Score (0.65)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const trustScore = 0.65;

  const result = verifier.determineVerificationStatus(trustScore);
  t.equal(result.status, 'REJECTED', 'Low trust score should result in REJECTED');
  t.equal(result.method, 'FAILED_VERIFICATION', 'Should use failed verification method');
  t.end();
});

test('Auto-Approval - Manual Review Threshold (0.80)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const trustScore = 0.80;

  const result = verifier.determineVerificationStatus(trustScore);
  t.equal(result.status, 'FLAGGED', 'Mid-range trust score should result in FLAGGED');
  t.equal(result.method, 'MANUAL_REVIEW_REQUIRED', 'Should require manual review');
  t.end();
});

test('Auto-Approval - Edge Case (Exactly at Threshold)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const trustScore = 0.90;

  const result = verifier.determineVerificationStatus(trustScore);
  t.equal(result.status, 'APPROVED', 'Score at threshold should result in APPROVED');
  t.equal(result.method, 'AI_AUTO_APPROVED', 'Should use AI auto-approval method');
  t.end();
});

test('Auto-Approval - Edge Case (Just Below Threshold)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const trustScore = 0.8999;

  const result = verifier.determineVerificationStatus(trustScore);
  t.equal(result.status, 'FLAGGED', 'Score just below threshold should result in FLAGGED');
  t.equal(result.method, 'MANUAL_REVIEW_REQUIRED', 'Should require manual review');
  t.end();
});

// ============================================================================
// CONFIGURABLE THRESHOLDS TESTS
// ============================================================================

test('Configurable Thresholds - Conservative (0.95)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.95, manualReviewThreshold: 0.80 });
  
  const result1 = verifier.determineVerificationStatus(0.96);
  t.equal(result1.status, 'APPROVED', 'Score 0.96 should be approved with 0.95 threshold');
  
  const result2 = verifier.determineVerificationStatus(0.90);
  t.equal(result2.status, 'FLAGGED', 'Score 0.90 should be flagged with 0.95 threshold');
  
  t.end();
});

test('Configurable Thresholds - Aggressive (0.70)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.70, manualReviewThreshold: 0.50 });
  
  const result1 = verifier.determineVerificationStatus(0.75);
  t.equal(result1.status, 'APPROVED', 'Score 0.75 should be approved with 0.70 threshold');
  
  const result2 = verifier.determineVerificationStatus(0.60);
  t.equal(result2.status, 'FLAGGED', 'Score 0.60 should be flagged with 0.70 threshold');
  
  t.end();
});

// ============================================================================
// VERIFICATION DECISION TESTS
// ============================================================================

test('Verification Decision - Complete Flow (Approved)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90 });
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const decision = verifier.makeVerificationDecision(validationResults);
  t.equal(decision.status, 'APPROVED', 'Should be approved');
  t.ok(decision.trustScore > 0.90, 'Trust score should be > 0.90');
  t.ok(decision.timestamp, 'Should have timestamp');
  t.end();
});

test('Verification Decision - Complete Flow (Flagged)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: false },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const decision = verifier.makeVerificationDecision(validationResults);
  t.equal(decision.status, 'FLAGGED', 'Should be flagged');
  t.ok(decision.trustScore < 0.90, 'Trust score should be < 0.90');
  t.ok(decision.reason, 'Should have reason');
  t.end();
});

test('Verification Decision - Complete Flow (Rejected)', (t) => {
  const verifier = new AIGuardianVerifier({ autoApproveThreshold: 0.90, manualReviewThreshold: 0.70 });
  const validationResults = {
    physics: { isValid: false },
    temporal: { isValid: false },
    environmental: { isValid: false },
    statistical: { isValid: false, zScore: 5.0 }
  };

  const decision = verifier.makeVerificationDecision(validationResults);
  t.equal(decision.status, 'REJECTED', 'Should be rejected');
  t.ok(decision.trustScore < 0.70, 'Trust score should be < 0.70');
  t.ok(decision.reason, 'Should have reason');
  t.end();
});

// ============================================================================
// ATTESTATION GENERATION TESTS
// ============================================================================

test('Attestation Generation - Valid Reading', (t) => {
  const verifier = new AIGuardianVerifier();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    readings: {
      flowRate: 2.5,
      head: 45.0,
      generatedKwh: 156.0
    }
  };
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const attestation = verifier.generateAttestation(telemetry, validationResults);
  t.equal(attestation.deviceId, 'TURBINE-1', 'Attestation should have device ID');
  t.equal(attestation.verificationStatus, 'APPROVED', 'Attestation should have verification status');
  t.ok(attestation.trustScore, 'Attestation should have trust score');
  t.ok(attestation.signature, 'Attestation should have signature');
  t.ok(attestation.timestamp, 'Attestation should have timestamp');
  t.end();
});

test('Attestation Generation - Invalid Reading', (t) => {
  const verifier = new AIGuardianVerifier();
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    readings: {
      flowRate: 2.5,
      head: 45.0,
      generatedKwh: 5000.0 // Invalid
    }
  };
  const validationResults = {
    physics: { isValid: false, reason: 'Physics constraint violation' },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const attestation = verifier.generateAttestation(telemetry, validationResults);
  t.equal(attestation.deviceId, 'TURBINE-1', 'Attestation should have device ID');
  t.equal(attestation.verificationStatus, 'REJECTED', 'Attestation should be rejected');
  t.ok(attestation.rejectionReasons, 'Attestation should have rejection reasons');
  t.end();
});

// ============================================================================
// CRYPTOGRAPHIC SIGNING TESTS
// ============================================================================

test('Cryptographic Signing - Signature Generation', (t) => {
  const verifier = new AIGuardianVerifier();
  const attestation = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    verificationStatus: 'APPROVED',
    trustScore: 0.95
  };

  const signedAttestation = verifier.signAttestation(attestation);
  t.ok(signedAttestation.signature, 'Signed attestation should have signature');
  t.ok(signedAttestation.signature.length > 0, 'Signature should not be empty');
  t.ok(signedAttestation.publicKey, 'Signed attestation should have public key');
  t.end();
});

test('Cryptographic Signing - Signature Verification', (t) => {
  const verifier = new AIGuardianVerifier();
  const attestation = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    verificationStatus: 'APPROVED',
    trustScore: 0.95
  };

  const signedAttestation = verifier.signAttestation(attestation);
  const isValid = verifier.verifySignature(signedAttestation);
  t.ok(isValid, 'Signature verification should succeed');
  t.end();
});

test('Cryptographic Signing - Tampered Attestation', (t) => {
  const verifier = new AIGuardianVerifier();
  const attestation = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:30:00Z',
    verificationStatus: 'APPROVED',
    trustScore: 0.95
  };

  const signedAttestation = verifier.signAttestation(attestation);
  
  // Tamper with attestation
  signedAttestation.trustScore = 0.50;
  
  const isValid = verifier.verifySignature(signedAttestation);
  t.notOk(isValid, 'Signature verification should fail for tampered attestation');
  t.end();
});

// ============================================================================
// BATCH PROCESSING TESTS
// ============================================================================

test('Batch Processing - Multiple Readings', (t) => {
  const verifier = new AIGuardianVerifier();
  const readings = [
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T10:00:00Z',
      readings: { flowRate: 2.5, head: 45.0, generatedKwh: 156.0 }
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T11:00:00Z',
      readings: { flowRate: 2.6, head: 45.0, generatedKwh: 162.0 }
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T12:00:00Z',
      readings: { flowRate: 2.4, head: 45.0, generatedKwh: 150.0 }
    }
  ];

  const results = verifier.processBatch(readings);
  t.equal(results.length, 3, 'Should process all 3 readings');
  t.ok(results.every(r => r.verificationStatus), 'All results should have verification status');
  t.end();
});

test('Batch Processing - Mixed Valid and Invalid', (t) => {
  const verifier = new AIGuardianVerifier();
  const readings = [
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T10:00:00Z',
      readings: { flowRate: 2.5, head: 45.0, generatedKwh: 156.0 }
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T11:00:00Z',
      readings: { flowRate: 2.6, head: 45.0, generatedKwh: 5000.0 } // Invalid
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T12:00:00Z',
      readings: { flowRate: 2.4, head: 45.0, generatedKwh: 150.0 }
    }
  ];

  const results = verifier.processBatch(readings);
  t.equal(results.length, 3, 'Should process all 3 readings');
  const approved = results.filter(r => r.verificationStatus === 'APPROVED').length;
  const rejected = results.filter(r => r.verificationStatus === 'REJECTED').length;
  t.ok(approved >= 2, 'Should have at least 2 approved readings');
  t.ok(rejected >= 1, 'Should have at least 1 rejected reading');
  t.end();
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

test('Edge Case - Missing Validation Results', (t) => {
  const verifier = new AIGuardianVerifier();
  
  try {
    verifier.calculateTrustScore(null);
    t.fail('Should throw error for null validation results');
  } catch (error) {
    t.ok(error, 'Should throw error for null validation results');
    t.end();
  }
});

test('Edge Case - Invalid Trust Score Range', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const trustScore = verifier.calculateTrustScore(validationResults);
  t.ok(trustScore >= 0 && trustScore <= 1, `Trust score should be in range [0, 1] (actual: ${trustScore})`);
  t.end();
});

test('Edge Case - Empty Batch', (t) => {
  const verifier = new AIGuardianVerifier();
  const readings = [];

  const results = verifier.processBatch(readings);
  t.equal(results.length, 0, 'Empty batch should return empty results');
  t.end();
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

test('Performance - Single Verification Decision', (t) => {
  const verifier = new AIGuardianVerifier();
  const validationResults = {
    physics: { isValid: true },
    temporal: { isValid: true },
    environmental: { isValid: true },
    statistical: { isValid: true, zScore: 1.5 }
  };

  const startTime = Date.now();
  verifier.makeVerificationDecision(validationResults);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.ok(latency < 50, `Decision should complete in < 50ms (actual: ${latency}ms)`);
  t.end();
});

test('Performance - Batch Processing (100 readings)', (t) => {
  const verifier = new AIGuardianVerifier();
  const readings = Array(100).fill(null).map((_, i) => ({
    deviceId: 'TURBINE-1',
    timestamp: new Date(Date.now() + i * 3600000).toISOString(),
    readings: { flowRate: 2.5, head: 45.0, generatedKwh: 156.0 + i }
  }));

  const startTime = Date.now();
  verifier.processBatch(readings);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.ok(latency < 5000, `Batch processing should complete in < 5s (actual: ${latency}ms)`);
  t.end();
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

test('Test Summary', (t) => {
  t.comment('AI Guardian Verifier Unit Tests Complete');
  t.comment('Coverage: Trust Scoring, Auto-Approval, Verification Decision, Attestation, Signing, Batch Processing');
  t.comment('Target Coverage: 95%+');
  t.end();
});
