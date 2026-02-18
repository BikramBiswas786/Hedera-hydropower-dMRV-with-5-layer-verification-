'use strict';

const { DEFAULT_CONFIG } = require('../../src/config/default-config');

describe('DEFAULT_CONFIG', () => {
  it('has required top-level keys', () => {
    expect(DEFAULT_CONFIG).toHaveProperty('gridEmissionFactor');
    expect(DEFAULT_CONFIG).toHaveProperty('hederaNetwork');
    expect(DEFAULT_CONFIG).toHaveProperty('verifier');
    expect(DEFAULT_CONFIG).toHaveProperty('weights');
    expect(DEFAULT_CONFIG).toHaveProperty('environmental');
    expect(DEFAULT_CONFIG).toHaveProperty('anomaly');
  });

  it('weights sum to 1.0', () => {
    const { weights } = DEFAULT_CONFIG;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('autoApproveThreshold > manualReviewThreshold would be maintained', () => {
    const { verifier } = DEFAULT_CONFIG;
    expect(verifier.autoApproveThreshold).toBeGreaterThan(verifier.autoRejectThreshold);
  });

  it('environmental bounds are logically ordered', () => {
    const { pH } = DEFAULT_CONFIG.environmental;
    expect(pH.perfect[0]).toBeGreaterThan(pH.acceptable[0]);
    expect(pH.perfect[1]).toBeLessThan(pH.acceptable[1]);
  });

  it('gridEmissionFactor is a positive number', () => {
    expect(DEFAULT_CONFIG.gridEmissionFactor).toBeGreaterThan(0);
  });

  it('hederaNetwork defaults to testnet', () => {
    expect(DEFAULT_CONFIG.hederaNetwork).toBe('testnet');
  });
});
