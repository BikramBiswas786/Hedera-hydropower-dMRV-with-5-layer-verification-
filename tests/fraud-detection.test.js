// tests/fraud-detection.test.js
// Comprehensive fraud detection and anti-gaming tests for MRV system

const Workflow = require('../src/workflow');

describe('Fraud Detection & Anti-Gaming Tests', () => {
  let workflow;

  beforeEach(async () => {
    workflow = new Workflow({
      projectId: 'FRAUD-TEST-001',
      location: 'Test Site',
      capacity_mw: 50,
      projectType: 'hydropower',
      enableHedera: true,
    });
    await workflow.initialize('FRAUD-TEST-001', 'TURBINE-FRAUD-TEST');
  });

  afterEach(async () => {
    await workflow.cleanup();
  });

  describe('Attack Vector 1: Data Replay Attacks', () => {
    test('should reject duplicate telemetry with same timestamp', async () => {
      const telemetry = {
        timestamp: new Date('2026-02-23T00:00:00Z').toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 500,
        pH: 7.0,
      };

      // First submission should succeed
      const result1 = await workflow.submitReading(telemetry);
      expect(['APPROVED', 'FLAGGED']).toContain(result1.verificationStatus);

      // Replay attack - same timestamp
      const result2 = await workflow.submitReading(telemetry);
      expect(result2.verificationStatus).toBe('REJECTED');
      expect(result2.fraudDetected).toBe(true);
    });

    test('should reject backdated telemetry (more than 1 hour old)', async () => {
      const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      const result = await workflow.submitReading({
        timestamp: oldTimestamp.toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 500,
        pH: 7.0,
      });

      expect(result.verificationStatus).toBe('REJECTED');
      expect(result.fraudDetected).toBe(true);
    });

    test('should reject future-dated telemetry', async () => {
      const futureTimestamp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour future
      
      const result = await workflow.submitReading({
        timestamp: futureTimestamp.toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 500,
        pH: 7.0,
      });

      expect(result.verificationStatus).toBe('REJECTED');
      expect(result.fraudDetected).toBe(true);
    });
  });

  describe('Attack Vector 2: Physics-Breaking Values', () => {
    test('should reject impossible energy generation (exceeds theoretical max)', async () => {
      const result = await workflow.submitReading({
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 5000, // Impossible! (200% efficiency)
        pH: 7.0,
      });

      expect(result.verificationStatus).toBe('REJECTED');
      expect(result.fraudDetected).toBe(true);
    });

    test('should reject negative flow rates', async () => {
      const result = await workflow.submitReading({
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: -2.0,
        headHeight_m: 50,
        generatedKwh: 100,
        pH: 7.0,
      });

      expect(result.verificationStatus).toBe('REJECTED');
      expect(result.fraudDetected).toBe(true);
    });
  });

  describe('Attack Vector 3: Token Minting Fraud', () => {
    test('should prevent double-minting from same attestation', async () => {
      const telemetry = {
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 1000,
        pH: 7.0,
      };

      const result = await workflow.submitReading(telemetry);
      
      if (result.verificationStatus === 'APPROVED') {
        const credits1 = await workflow.mintCarbonCredits(result.attestationId);
        expect(credits1).toBeGreaterThan(0);

        // Attempt to mint again from same attestation
        await expect(
          workflow.mintCarbonCredits(result.attestationId)
        ).rejects.toThrow(/already minted/i);
      }
    });
  });

  describe('Fraud Mitigation: Verifier Challenges', () => {
    test('should allow independent verifier to challenge suspicious attestation', async () => {
      const result = await workflow.submitReading({
        timestamp: new Date().toISOString(),
        flowRate_m3_per_s: 5.0,
        headHeight_m: 50,
        generatedKwh: 2000,
        pH: 7.0,
      });

      // Verifier challenges the attestation
      const challenge = await workflow.challengeAttestation(
        result.readingId,
        'verifier-001',
        'Energy generation exceeds site capacity'
      );

      expect(challenge.status).toBe('UNDER_REVIEW');
    });
  });
});
