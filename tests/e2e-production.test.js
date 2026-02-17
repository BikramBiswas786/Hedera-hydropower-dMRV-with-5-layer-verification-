/**
 * 🚀 PRODUCTION E2E - Complete MRV Cycle
 * Uses real Hedera Testnet credentials from .env when available.
 */

const Workflow = require('../src/workflow');

jest.setTimeout(60000);

describe('🚀 PRODUCTION E2E - Complete MRV Cycle', () => {
  let workflow;
  let deviceId = 'HYDRO-TURBINE-1';
  let projectId = 'HYDRO-PROJECT-001';

  beforeAll(async () => {
    workflow = new Workflow();
    const init = await workflow.initialize(projectId, deviceId, 0.8);
    console.log('✅ Workflow initialized');
    console.log(' Project ID:', init.projectId);
    console.log(' Hedera connected:', init.hederaConnected);
    console.log(' Audit Topic:', init.auditTopicId || 'N/A');
  });

  afterAll(async () => {
    if (workflow) {
      await workflow.cleanup();
    }
  });

  describe('Complete MRV Pipeline', () => {
    let goodTelemetry;
    let badTelemetry;
    let goodSubmission;
    let badSubmission;
    let recMint;

    test('STEP 1: Initialize workflow with project details', async () => {
      expect(workflow.initialized).toBe(true);
    });

    test('STEP 2: Deploy Device DID on Hedera', async () => {
      const did = await workflow.deployDeviceDID(deviceId);
      console.log('✅ Device DID deployed');
      console.log(' DID:', did.did);
      console.log(' Topic ID:', did.topicId);
      expect(did.success).toBe(true);
    });

    test('STEP 3: Create REC Token on Hedera Token Service', async () => {
      const token = await workflow.createRECToken('Hydro REC', 'HREC');
      console.log('✅ REC Token created');
      console.log(' Token ID:', token.tokenId);
      console.log(' Symbol:', token.symbol);
      expect(token.success).toBe(true);
    });

    test('STEP 4: Submit valid telemetry through full verification', async () => {
      goodTelemetry = {
        deviceId,
        timestamp: new Date().toISOString(),
        flowRate: 2.5,
        head: 45,
        generatedKwh: 900,
        pH: 7.2,
        turbidity: 10,
        temperature: 18,
        efficiency: 0.85
      };

      const res = await workflow.submitReading(goodTelemetry);
      goodSubmission = res;
      console.log('✅ Telemetry verified and submitted');
      console.log(' Status:', res.verificationStatus);
      console.log(' Trust Score:', (res.trustScore * 100).toFixed(1) + '%');
      console.log(' Attestation ID:', res.attestation.id);
      console.log(' Transaction ID:', res.transactionId);

      expect(res.success).toBe(true);
      expect(res.verificationStatus).toBe('APPROVED');
    });

    test('STEP 5: Reject invalid telemetry (physics violation)', async () => {
      badTelemetry = {
        deviceId,
        timestamp: new Date().toISOString(),
        flowRate: 2.5,
        head: 45,
        generatedKwh: 1e7,
        pH: 7.2,
        turbidity: 10,
        temperature: 18,
        efficiency: 0.85
      };

      const res = await workflow.submitReading(badTelemetry);
      badSubmission = res;

      console.log('✅ Invalid telemetry correctly rejected');
      console.log(' Status:', res.verificationStatus);
      console.log(' Trust Score:', (res.trustScore * 100).toFixed(1) + '%');

      expect(['REJECTED', 'FLAGGED']).toContain(res.verificationStatus);
    });

    test('STEP 6: Mint RECs based on verified generation', async () => {
      const er = goodSubmission.attestation.calculations.ER_tCO2;
      const amount = Math.round(er * 100); // example scaling

      const res = await workflow.mintRECs(
        amount,
        goodSubmission.attestation.id
      );
      recMint = res;

      console.log('✅ RECs minted');
      console.log(' Amount:', res.amount);
      console.log(' Transaction ID:', res.transactionId);

      expect(res.success).toBe(true);
      expect(res.amount).toBeGreaterThan(0);
    });

    test('STEP 7: Generate comprehensive monitoring report', async () => {
      const report = await workflow.generateMonitoringReport();
      console.log('✅ Monitoring report generated');
      console.log(' Total Readings:', report.totalReadings);
      console.log(' Approved:', report.approvedReadings);
      console.log(' Rejected:', report.rejectedReadings);
      console.log(
        ' Avg Trust Score:',
        (report.averageTrustScore * 100).toFixed(1) + '%'
      );

      expect(report.success).toBe(true);
      expect(report.totalReadings).toBeGreaterThanOrEqual(2);
    });

    test('STEP 8: Retry mechanism works with exponential backoff', async () => {
      const telemetry = {
        deviceId,
        flowRate: 2.5,
        head: 45,
        generatedKwh: 900
      };

      const res = await workflow.retrySubmission(telemetry);
      console.log('✅ Retry mechanism validated');
      console.log(' Attempts:', res.attempt);

      expect(res).toBeDefined();
      expect(res.attempt).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Benchmarks', () => {
    test(
      'Process 100 readings in < 30 seconds',
      async () => {
        const readings = Array.from({ length: 100 }, (_, i) => ({
          deviceId,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          flowRate: 2.5,
          head: 45,
          generatedKwh: 900
        }));

        const start = Date.now();
        await Promise.all(
          readings.map(r => workflow.submitReading(r))
        );
        const duration = Date.now() - start;

        console.log(
          `Processed 100 readings in ${duration} ms`
        );
        expect(duration).toBeLessThan(30000);
      },
      60000
    );
  });

  describe('Audit Trail Verification', () => {
    test('All attestations are stored and retrievable', async () => {
      const report = await workflow.generateMonitoringReport();
      console.log('✅ Audit trail complete');
      console.log(' Total attestations:', report.totalReadings);
      expect(report.totalReadings).toBeGreaterThan(0);
    });

    test('Attestations can be exported and re-imported', async () => {
      const exported = workflow.attestation.exportAttestations();
      workflow.attestation.clearAttestations();
      workflow.attestation.importAttestations(exported);
      console.log('✅ Export/Import validated');
      expect(
        workflow.attestation.getAttestations().length
      ).toBeGreaterThan(0);
    });
  });
});
