/**
 * Unit Tests for Verifier Attestation Module
 * Tests attestation structure, ACM0002 calculations, and cryptographic integrity
 * Target Coverage: 95%+
 */

const test = require('tape');
const VerifierAttestation = require('../../src/verifier-attestation');

// ============================================================================
// ATTESTATION STRUCTURE TESTS
// ============================================================================

test('Attestation Structure - Valid Approved Attestation', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {
      physics: { isValid: true },
      temporal: { isValid: true },
      environmental: { isValid: true },
      statistical: { isValid: true, zScore: 1.5 }
    },
    calculations: {
      EG_MWh: 156.0,
      EF_grid_tCO2_per_MWh: 0.8,
      BE_tCO2: 124.8,
      PE_tCO2: 0,
      LE_tCO2: 0,
      ER_tCO2: 124.8,
      RECs_issued: 124.8
    }
  };

  const result = attestation.create(data);
  t.ok(result.deviceId, 'Should have device ID');
  t.ok(result.period, 'Should have period');
  t.equal(result.verificationStatus, 'APPROVED', 'Should have verification status');
  t.ok(result.trustScore, 'Should have trust score');
  t.ok(result.checks, 'Should have checks');
  t.ok(result.calculations, 'Should have calculations');
  t.ok(result.timestamp, 'Should have timestamp');
  t.end();
});

test('Attestation Structure - Valid Rejected Attestation', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'REJECTED',
    trustScore: 0.45,
    checks: {
      physics: { isValid: false, reason: 'Physics constraint violation' },
      temporal: { isValid: true },
      environmental: { isValid: true },
      statistical: { isValid: true, zScore: 1.5 }
    },
    rejectionReasons: ['Physics constraint violation']
  };

  const result = attestation.create(data);
  t.equal(result.verificationStatus, 'REJECTED', 'Should have rejected status');
  t.ok(result.rejectionReasons, 'Should have rejection reasons');
  t.ok(result.rejectionReasons.length > 0, 'Should have at least one rejection reason');
  t.end();
});

test('Attestation Structure - Valid Flagged Attestation', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'FLAGGED',
    trustScore: 0.80,
    checks: {
      physics: { isValid: true },
      temporal: { isValid: true },
      environmental: { isValid: false, violations: ['pH out of bounds'] },
      statistical: { isValid: true, zScore: 1.5 }
    },
    flagReasons: ['Environmental parameter out of bounds']
  };

  const result = attestation.create(data);
  t.equal(result.verificationStatus, 'FLAGGED', 'Should have flagged status');
  t.ok(result.flagReasons, 'Should have flag reasons');
  t.end();
});

// ============================================================================
// ACM0002 CALCULATION TESTS
// ============================================================================

test('ACM0002 Calculations - Baseline Emissions (BE)', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateBaselineEmissions({
    EG_baseline_MWh: 16800,
    EF_grid_tCO2_per_MWh: 0.8
  });

  t.equal(calculations.EG_baseline_MWh, 16800, 'Should have baseline generation');
  t.equal(calculations.EF_grid_tCO2_per_MWh, 0.8, 'Should have grid emission factor');
  t.equal(calculations.BE_tCO2, 13440, 'BE should be 16800 × 0.8 = 13440');
  t.end();
});

test('ACM0002 Calculations - Project Emissions (PE)', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateProjectEmissions({
    projectScope: 'grid-connected-hydropower'
  });

  t.equal(calculations.PE_tCO2, 0, 'Grid-connected hydropower should have zero project emissions');
  t.end();
});

test('ACM0002 Calculations - Leakage Emissions (LE)', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateLeakageEmissions({
    leakageModel: 'conservative'
  });

  t.equal(calculations.LE_tCO2, 0, 'Conservative leakage model should result in zero leakage');
  t.end();
});

test('ACM0002 Calculations - Emission Reductions (ER)', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateEmissionReductions({
    BE_tCO2: 13440,
    PE_tCO2: 0,
    LE_tCO2: 0
  });

  t.equal(calculations.BE_tCO2, 13440, 'Should have baseline emissions');
  t.equal(calculations.PE_tCO2, 0, 'Should have project emissions');
  t.equal(calculations.LE_tCO2, 0, 'Should have leakage emissions');
  t.equal(calculations.ER_tCO2, 13440, 'ER should be 13440 - 0 - 0 = 13440');
  t.end();
});

test('ACM0002 Calculations - Complete Scenario', (t) => {
  const attestation = new VerifierAttestation();
  const scenario = {
    EG_baseline_MWh: 16800,
    EF_grid_tCO2_per_MWh: 0.8,
    projectScope: 'grid-connected-hydropower',
    leakageModel: 'conservative'
  };

  const calculations = attestation.calculateCompleteScenario(scenario);
  t.equal(calculations.BE_tCO2, 13440, 'BE should be 13440');
  t.equal(calculations.PE_tCO2, 0, 'PE should be 0');
  t.equal(calculations.LE_tCO2, 0, 'LE should be 0');
  t.equal(calculations.ER_tCO2, 13440, 'ER should be 13440');
  t.equal(calculations.RECs_issued, 13440, 'RECs issued should equal ER');
  t.end();
});

// ============================================================================
// REC ISSUANCE TESTS
// ============================================================================

test('REC Issuance - Standard 1:1 Ratio', (t) => {
  const attestation = new VerifierAttestation();
  const recs = attestation.calculateRECIssuance({
    ER_tCO2: 13440,
    ratio: 1.0
  });

  t.equal(recs.RECs_issued, 13440, 'RECs issued should equal ER at 1:1 ratio');
  t.equal(recs.ratio, 1.0, 'Should have 1:1 ratio');
  t.end();
});

test('REC Issuance - Conservative Ratio (0.9)', (t) => {
  const attestation = new VerifierAttestation();
  const recs = attestation.calculateRECIssuance({
    ER_tCO2: 13440,
    ratio: 0.9
  });

  t.equal(recs.RECs_issued, 12096, 'RECs issued should be 13440 × 0.9 = 12096');
  t.equal(recs.ratio, 0.9, 'Should have 0.9 ratio');
  t.end();
});

test('REC Issuance - Aggressive Ratio (1.1)', (t) => {
  const attestation = new VerifierAttestation();
  const recs = attestation.calculateRECIssuance({
    ER_tCO2: 13440,
    ratio: 1.1
  });

  t.equal(recs.RECs_issued, 14784, 'RECs issued should be 13440 × 1.1 = 14784');
  t.equal(recs.ratio, 1.1, 'Should have 1.1 ratio');
  t.end();
});

// ============================================================================
// ROYALTY CALCULATION TESTS
// ============================================================================

test('Royalty Calculation - 20% Royalty', (t) => {
  const attestation = new VerifierAttestation();
  const royalties = attestation.calculateRoyalties({
    RECs_issued: 13440,
    royaltyPercentage: 0.20
  });

  t.equal(royalties.RECs_issued, 13440, 'Should have total RECs');
  t.equal(royalties.royaltyPercentage, 0.20, 'Should have 20% royalty');
  t.equal(royalties.royaltyRECs, 2688, 'Royalty should be 13440 × 0.20 = 2688');
  t.equal(royalties.operatorRECs, 10752, 'Operator should get 13440 × 0.80 = 10752');
  t.end();
});

test('Royalty Calculation - 10% Royalty', (t) => {
  const attestation = new VerifierAttestation();
  const royalties = attestation.calculateRoyalties({
    RECs_issued: 13440,
    royaltyPercentage: 0.10
  });

  t.equal(royalties.royaltyRECs, 1344, 'Royalty should be 13440 × 0.10 = 1344');
  t.equal(royalties.operatorRECs, 12096, 'Operator should get 13440 × 0.90 = 12096');
  t.end();
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

test('Validation - Valid Attestation Data', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {
      physics: { isValid: true },
      temporal: { isValid: true },
      environmental: { isValid: true },
      statistical: { isValid: true, zScore: 1.5 }
    },
    calculations: {
      EG_MWh: 156.0,
      BE_tCO2: 124.8,
      ER_tCO2: 124.8,
      RECs_issued: 124.8
    }
  };

  const isValid = attestation.validate(data);
  t.ok(isValid, 'Valid attestation data should pass validation');
  t.end();
});

test('Validation - Missing Device ID', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    // Missing deviceId
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  try {
    attestation.validate(data);
    t.fail('Should throw error for missing device ID');
  } catch (error) {
    t.ok(error, 'Should throw error for missing device ID');
    t.end();
  }
});

test('Validation - Invalid Trust Score (> 1.0)', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 1.5, // Invalid
    checks: {},
    calculations: {}
  };

  try {
    attestation.validate(data);
    t.fail('Should throw error for invalid trust score');
  } catch (error) {
    t.ok(error, 'Should throw error for invalid trust score');
    t.end();
  }
});

test('Validation - Invalid Verification Status', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'INVALID_STATUS', // Invalid
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  try {
    attestation.validate(data);
    t.fail('Should throw error for invalid verification status');
  } catch (error) {
    t.ok(error, 'Should throw error for invalid verification status');
    t.end();
  }
});

// ============================================================================
// CRYPTOGRAPHIC SIGNING TESTS
// ============================================================================

test('Cryptographic Signing - Attestation Signature', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const signed = attestation.signAttestation(data);
  t.ok(signed.signature, 'Signed attestation should have signature');
  t.ok(signed.signature.length > 0, 'Signature should not be empty');
  t.ok(signed.verifierPublicKey, 'Should have verifier public key');
  t.ok(signed.signingTimestamp, 'Should have signing timestamp');
  t.end();
});

test('Cryptographic Signing - Signature Verification', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const signed = attestation.signAttestation(data);
  const isValid = attestation.verifySignature(signed);
  t.ok(isValid, 'Signature verification should succeed');
  t.end();
});

test('Cryptographic Signing - Tampered Attestation Detection', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const signed = attestation.signAttestation(data);
  
  // Tamper with attestation
  signed.trustScore = 0.50;
  
  const isValid = attestation.verifySignature(signed);
  t.notOk(isValid, 'Signature verification should fail for tampered attestation');
  t.end();
});

// ============================================================================
// SERIALIZATION TESTS
// ============================================================================

test('Serialization - To JSON', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const created = attestation.create(data);
  const json = attestation.toJSON(created);
  
  t.ok(typeof json === 'string', 'Should return JSON string');
  const parsed = JSON.parse(json);
  t.equal(parsed.deviceId, 'TURBINE-1', 'Parsed JSON should have device ID');
  t.end();
});

test('Serialization - From JSON', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const created = attestation.create(data);
  const json = attestation.toJSON(created);
  const restored = attestation.fromJSON(json);
  
  t.equal(restored.deviceId, 'TURBINE-1', 'Restored attestation should have device ID');
  t.equal(restored.verificationStatus, 'APPROVED', 'Restored attestation should have verification status');
  t.end();
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

test('Edge Case - Zero Emission Reductions', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateEmissionReductions({
    BE_tCO2: 0,
    PE_tCO2: 0,
    LE_tCO2: 0
  });

  t.equal(calculations.ER_tCO2, 0, 'ER should be 0 when BE is 0');
  t.end();
});

test('Edge Case - Very Large Emission Reductions', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateEmissionReductions({
    BE_tCO2: 1000000,
    PE_tCO2: 0,
    LE_tCO2: 0
  });

  t.equal(calculations.ER_tCO2, 1000000, 'ER should handle large numbers');
  t.end();
});

test('Edge Case - Floating Point Precision', (t) => {
  const attestation = new VerifierAttestation();
  const calculations = attestation.calculateEmissionReductions({
    BE_tCO2: 13440.123456789,
    PE_tCO2: 0,
    LE_tCO2: 0
  });

  t.ok(Math.abs(calculations.ER_tCO2 - 13440.123456789) < 0.000001, 'Should handle floating point precision');
  t.end();
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

test('Performance - Attestation Creation', (t) => {
  const attestation = new VerifierAttestation();
  const data = {
    deviceId: 'TURBINE-1',
    period: '2026-01-15',
    verificationStatus: 'APPROVED',
    trustScore: 0.95,
    checks: {},
    calculations: {}
  };

  const startTime = Date.now();
  attestation.create(data);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.ok(latency < 50, `Attestation creation should complete in < 50ms (actual: ${latency}ms)`);
  t.end();
});

test('Performance - ACM0002 Calculations', (t) => {
  const attestation = new VerifierAttestation();
  const scenario = {
    EG_baseline_MWh: 16800,
    EF_grid_tCO2_per_MWh: 0.8,
    projectScope: 'grid-connected-hydropower',
    leakageModel: 'conservative'
  };

  const startTime = Date.now();
  attestation.calculateCompleteScenario(scenario);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.ok(latency < 20, `ACM0002 calculations should complete in < 20ms (actual: ${latency}ms)`);
  t.end();
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

test('Test Summary', (t) => {
  t.comment('Verifier Attestation Unit Tests Complete');
  t.comment('Coverage: Attestation Structure, ACM0002 Calculations, REC Issuance, Royalties, Validation, Signing, Serialization');
  t.comment('Target Coverage: 95%+');
  t.end();
});
