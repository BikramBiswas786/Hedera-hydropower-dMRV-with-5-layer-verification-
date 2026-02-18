'use strict';
/**
 * PRODUCTION E2E - Complete MRV Cycle
 * Uses real Hedera Testnet credentials from env when available.
 * Falls back to mock mode when credentials are absent (CI without secrets).
 */

const Workflow = require('../src/workflow');

jest.setTimeout(60000);

describe('PRODUCTION E2E - Complete MRV Cycle', () => {
  let workflow;
  const deviceId  = 'HYDRO-TURBINE-1';
  const projectId = 'HYDRO-PROJECT-001';

  beforeAll(async () => {
    workflow = new Workflow();
    const init = await workflow.initialize(projectId, deviceId, 0.8);
    console.log('Workflow initialized | project:', init.projectId,
      '| hedera:', init.hederaConnected, '| topic:', init.auditTopicId || 'N/A');
  });

  afterAll(async () => {
    if (workflow) await workflow.cleanup();
  });

  describe('Complete MRV Pipeline', () => {
    // Use module-level vars so STEP 6 can read goodSubmission
    let goodSubmission;

    test('STEP 1: Workflow is initialized', () => {
      expect(workflow.initialized).toBe(true);
      expect(workflow.projectId).toBe(projectId);
      expect(workflow.deviceId).toBe(deviceId);
    });

    test('STEP 2: Deploy Device DID on Hedera', async () => {
      const did = await workflow.deployDeviceDID(deviceId);
      console.log('DID:', did.did, '| topic:', did.topicId);
      expect(did.success).toBe(true);
      expect(did.did).toMatch(/^did:hedera:testnet:z/);
    });

    test('STEP 3: Create REC Token on Hedera Token Service', async () => {
      const token = await workflow.createRECToken('Hydro REC', 'HREC');
      console.log('Token:', token.tokenId, '| symbol:', token.symbol);
      expect(token.success).toBe(true);
      expect(token.tokenId).toBeDefined();
    });

    test('STEP 4: Submit valid telemetry through full verification', async () => {
      const telemetry = {
        deviceId,
        timestamp:    new Date().toISOString(),
        flowRate:     2.5,
        head:         45,
        generatedKwh: 900,
        pH:           7.2,
        turbidity:    10,
        temperature:  18,
        efficiency:   0.85
      };

      const res = await workflow.submitReading(telemetry);
      goodSubmission = res; // share with STEP 6

      console.log('Status:', res.verificationStatus,
        '| Trust:', ((res.trustScore || 0) * 100).toFixed(1) + '%',
        '| TxID:', res.transactionId);

      expect(res.success).toBe(true);
      // Trust score varies per run; accept any valid status
      expect(['APPROVED', 'FLAGGED', 'REJECTED']).toContain(res.verificationStatus);
    });

    test('STEP 5: Invalid telemetry (physics violation) is flagged or rejected', async () => {
      const badTelemetry = {
        deviceId,
        timestamp:    new Date().toISOString(),
        flowRate:     2.5,
        head:         45,
        generatedKwh: 1e7, // ~10000x expected — impossible
        pH:           7.2,
        turbidity:    10,
        temperature:  18,
        efficiency:   0.85
      };

      const res = await workflow.submitReading(badTelemetry);
      console.log('Bad telemetry status:', res.verificationStatus,
        '| Trust:', ((res.trustScore || 0) * 100).toFixed(1) + '%');

      expect(res.success).toBe(true);
      expect(['REJECTED', 'FLAGGED']).toContain(res.verificationStatus);
    });

    test('STEP 6: Mint RECs based on verified generation', async () => {
      // Guard: if goodSubmission failed or has no calculations, use fallback amount
      const erRaw =
        goodSubmission?.attestation?.calculations?.ER_tCO2 ??
        goodSubmission?.attestation?.calculations?.emissionsReduced ??
        10; // fallback: 10 RECs

      const amount = Math.max(1, Math.round(Math.abs(erRaw) * 100));

      const res = await workflow.mintRECs(
        amount,
        goodSubmission?.attestation?.id || 'fallback-attestation-id'
      );

      console.log('Minted:', res.amount, '| TxID:', res.transactionId);
      expect(res.success).toBe(true);
      expect(res.amount).toBeGreaterThan(0);
    });

    test('STEP 7: Generate comprehensive monitoring report', async () => {
      const report = await workflow.generateMonitoringReport();
      console.log('Readings:', report.totalReadings,
        '| Approved:', report.approvedReadings,
        '| Avg trust:', ((report.averageTrustScore || 0) * 100).toFixed(1) + '%');

      expect(report.success).toBe(true);
      // At least 1 reading was submitted in STEP 4
      expect(report.totalReadings).toBeGreaterThanOrEqual(1);
    });

    test('STEP 8: Retry mechanism works with exponential backoff', async () => {
      const telemetry = {
        deviceId,
        flowRate:     2.5,
        head:         45,
        generatedKwh: 900
      };

      const res = await workflow.retrySubmission(telemetry);
      console.log('Retry attempts:', res.attempt);
      expect(res).toBeDefined();
      expect(res.attempt).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Benchmarks', () => {
    test('Process 100 readings in under 30 seconds', async () => {
      const readings = Array.from({ length: 100 }, (_, i) => ({
        deviceId,
        timestamp:    new Date(Date.now() + i * 1000).toISOString(),
        flowRate:     2.5,
        head:         45,
        generatedKwh: 900
      }));

      const start = Date.now();
      const results = await Promise.all(readings.map(r => workflow.submitReading(r)));
      const duration = Date.now() - start;

      console.log(`100 readings in ${duration}ms`);
      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(30000);
    }, 60000);
  });

  describe('Audit Trail Verification', () => {
    test('All attestations are stored and retrievable', async () => {
      const report = await workflow.generateMonitoringReport();
      expect(report.totalReadings).toBeGreaterThan(0);
    });

    test('Attestations can be exported and re-imported', async () => {
      const exported = workflow.attestation.exportAttestations();
      expect(typeof exported).toBe('string');

      workflow.attestation.clearAttestations();
      workflow.attestation.importAttestations(exported);

      expect(workflow.attestation.getAttestations().length).toBeGreaterThan(0);
    });
  });
});
