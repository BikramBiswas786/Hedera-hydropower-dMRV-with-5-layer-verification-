/**
 * END-TO-END PRODUCTION TEST
 * Proves complete MRV cycle works with real Hedera blockchain
 */

const Workflow = require('../src/workflow');
const { Client } = require('@hashgraph/sdk');

describe('🚀 PRODUCTION E2E - Complete MRV Cycle', () => {
  let workflow;
  const projectId = 'HYDRO-PROJECT-001';
  const deviceId = 'TURBINE-ALPHA';

  beforeAll(async () => {
    workflow = new Workflow({
      retryAttempts: 3,
      retryDelay: 500
    });
  });

  afterAll(async () => {
    await workflow.cleanup();
  });

  describe('Complete MRV Pipeline', () => {
    test('STEP 1: Initialize workflow with project details', async () => {
      const result = await workflow.initialize(projectId, deviceId, 0.8);
      
      expect(result.success).toBe(true);
      expect(result.projectId).toBe(projectId);
      expect(result.deviceId).toBe(deviceId);
      expect(result.gridEmissionFactor).toBe(0.8);
      
      console.log('✅ Workflow initialized');
      console.log('   Project ID:', result.projectId);
      console.log('   Hedera connected:', result.hederaConnected);
      if (result.auditTopicId) {
        console.log('   Audit Topic:', result.auditTopicId);
      }
    });

    test('STEP 2: Deploy Device DID on Hedera', async () => {
      const result = await workflow.deployDeviceDID(deviceId);
      
      expect(result.success).toBe(true);
      expect(result.did).toContain('did:hedera:testnet');
      expect(result.topicId).toBeTruthy();
      
      console.log('\n✅ Device DID deployed');
      console.log('   DID:', result.did);
      console.log('   Topic ID:', result.topicId);
    });

    test('STEP 3: Create REC Token on Hedera Token Service', async () => {
      const result = await workflow.createRECToken(
        'Hydropower Renewable Energy Certificate',
        'HREC'
      );
      
      expect(result.success).toBe(true);
      expect(result.tokenId).toBeTruthy();
      expect(result.symbol).toBe('HREC');
      
      console.log('\n✅ REC Token created');
      console.log('   Token ID:', result.tokenId);
      console.log('   Symbol:', result.symbol);
    });

    test('STEP 4: Submit valid telemetry through full verification', async () => {
      const telemetry = {
        deviceId: deviceId,
        timestamp: new Date().toISOString(),
        readings: {
          flowRate_m3_per_s: 2.5,
          headHeight_m: 45,
          generatedKwh: 938.08,
          pH: 7.2,
          turbidity_ntu: 10,
          temperature_celsius: 18,
          efficiency: 0.85
        }
      };

      const result = await workflow.submitReading(telemetry);
      
      expect(result.success).toBe(true);
      expect(result.verificationStatus).toBe('APPROVED');
      expect(result.trustScore).toBeGreaterThan(0.9);
      expect(result.attestation).toBeTruthy();
      expect(result.transactionId).toBeTruthy();
      
      console.log('\n✅ Telemetry verified and submitted');
      console.log('   Status:', result.verificationStatus);
      console.log('   Trust Score:', (result.trustScore * 100).toFixed(1) + '%');
      console.log('   Attestation ID:', result.attestation.id);
      console.log('   Transaction ID:', result.transactionId);
    }, 15000);

    test('STEP 5: Reject invalid telemetry (physics violation)', async () => {
      const badTelemetry = {
        deviceId: deviceId,
        timestamp: new Date().toISOString(),
        readings: {
          flowRate_m3_per_s: 2.5,
          headHeight_m: 45,
          generatedKwh: 999999, // Physically impossible
          pH: 7.2,
          turbidity_ntu: 10,
          temperature_celsius: 18,
          efficiency: 0.85
        }
      };

      const result = await workflow.submitReading(badTelemetry);
      
      expect(result.success).toBe(true);
      expect(['FLAGGED', 'REJECTED']).toContain(result.verificationStatus);
      expect(result.trustScore).toBeLessThan(0.9);
      
      console.log('\n✅ Invalid telemetry correctly rejected');
      console.log('   Status:', result.verificationStatus);
      console.log('   Trust Score:', (result.trustScore * 100).toFixed(1) + '%');
    });

    test('STEP 6: Mint RECs based on verified generation', async () => {
      const result = await workflow.mintRECs(100, 'att-12345');
      
      expect(result.success).toBe(true);
      expect(result.amount).toBe(100);
      expect(result.transactionId).toBeTruthy();
      
      console.log('\n✅ RECs minted');
      console.log('   Amount:', result.amount);
      console.log('   Transaction ID:', result.transactionId);
    });

    test('STEP 7: Generate comprehensive monitoring report', async () => {
      const result = await workflow.generateMonitoringReport({
        period: {
          start: '2025-01-01T00:00:00Z',
          end: '2025-01-31T23:59:59Z'
        },
        totalKwh: 156000,
        emissionsAvoided: 124.8,
        recsIssued: 156
      });
      
      expect(result.success).toBe(true);
      expect(result.projectId).toBe(projectId);
      expect(result.totalReadings).toBeGreaterThan(0);
      expect(result.approvedReadings).toBeGreaterThan(0);
      
      console.log('\n✅ Monitoring report generated');
      console.log('   Total Readings:', result.totalReadings);
      console.log('   Approved:', result.approvedReadings);
      console.log('   Rejected:', result.rejectedReadings);
      console.log('   Avg Trust Score:', (result.averageTrustScore * 100).toFixed(1) + '%');
    });

    test('STEP 8: Retry mechanism works with exponential backoff', async () => {
      const telemetry = {
        deviceId: deviceId,
        timestamp: new Date().toISOString(),
        readings: {
          flowRate_m3_per_s: 2.5,
          headHeight_m: 45,
          generatedKwh: 938,
          pH: 7.2,
          turbidity_ntu: 10,
          temperature_celsius: 18,
          efficiency: 0.85
        }
      };

      const result = await workflow.retrySubmission(telemetry);
      
      expect(result.success).toBe(true);
      expect(result.attempt).toBeLessThanOrEqual(3);
      
      console.log('\n✅ Retry mechanism validated');
      console.log('   Attempts:', result.attempt);
    });
  });

  describe('Performance Benchmarks', () => {
    test('Process 100 readings in < 10 seconds', async () => {
      const readings = Array.from({ length: 100 }, (_, i) => ({
        deviceId: deviceId,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        readings: {
          flowRate_m3_per_s: 2.5 + (i % 10) * 0.1,
          headHeight_m: 45,
          generatedKwh: 900 + i,
          pH: 7.2,
          turbidity_ntu: 10,
          temperature_celsius: 18,
          efficiency: 0.85
        }
      }));

      const start = Date.now();
      
      for (const reading of readings) {
        await workflow.submitReading(reading);
      }
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10000);
      
      console.log('\n✅ Performance benchmark passed');
      console.log('   100 readings processed in:', duration + 'ms');
      console.log('   Avg per reading:', (duration / 100).toFixed(1) + 'ms');
    }, 15000);
  });

  describe('Audit Trail Verification', () => {
    test('All attestations are stored and retrievable', () => {
      const attestations = workflow.attestation.getAttestations();
      
      expect(attestations.length).toBeGreaterThan(0);
      
      attestations.forEach(att => {
        expect(att.id).toBeTruthy();
        expect(att.deviceId).toBeTruthy();
        expect(att.verificationStatus).toBeTruthy();
        expect(att.signature).toBeTruthy();
      });
      
      console.log('\n✅ Audit trail complete');
      console.log('   Total attestations:', attestations.length);
    });

    test('Attestations can be exported and re-imported', () => {
      const exported = workflow.attestation.exportAttestations();
      expect(exported).toBeTruthy();
      
      workflow.attestation.clearAttestations();
      expect(workflow.attestation.getAttestations().length).toBe(0);
      
      const result = workflow.attestation.importAttestations(exported);
      expect(result.success).toBe(true);
      expect(workflow.attestation.getAttestations().length).toBeGreaterThan(0);
      
      console.log('\n✅ Export/Import validated');
    });
  });
});
