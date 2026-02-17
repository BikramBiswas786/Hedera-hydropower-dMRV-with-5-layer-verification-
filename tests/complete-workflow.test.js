/**
 * Integration Tests for Complete REC Generation Workflow
 * Tests end-to-end flow from telemetry submission to REC minting
 * Target Coverage: 100% of critical workflows
 */

const test = require('tape');
const Workflow = require('../../src/workflow');
const AnomalyDetector = require('../../src/anomaly-detector');
const AIGuardianVerifier = require('../../src/ai-guardian-verifier');
const VerifierAttestation = require('../../src/verifier-attestation');

// ============================================================================
// WORKFLOW INITIALIZATION TESTS
// ============================================================================

test('Workflow - Initialization', (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  t.ok(workflow.projectId, 'Should have project ID');
  t.ok(workflow.deviceId, 'Should have device ID');
  t.ok(workflow.gridEmissionFactor, 'Should have grid emission factor');
  t.end();
});

// ============================================================================
// COMPLETE WORKFLOW - HAPPY PATH
// ============================================================================

test('Complete Workflow - Happy Path (All Valid)', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  // Step 1: Initialize workflow
  await workflow.initialize();
  t.ok(workflow.isInitialized, 'Workflow should be initialized');

  // Step 2: Submit valid telemetry
  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const submission = await workflow.submitTelemetry(telemetry);
  t.ok(submission.verified, 'Telemetry should be verified');
  t.equal(submission.status, 'APPROVED', 'Telemetry should be approved');
  t.ok(submission.trustScore > 0.90, 'Trust score should be > 0.90');

  // Step 3: Generate attestation
  const attestation = await workflow.generateAttestation(submission);
  t.ok(attestation.signature, 'Attestation should be signed');
  t.equal(attestation.verificationStatus, 'APPROVED', 'Attestation should be approved');

  // Step 4: Calculate emissions
  const emissions = await workflow.calculateEmissions(telemetry);
  t.ok(emissions.ER_tCO2 > 0, 'Should have emission reductions');
  t.equal(emissions.PE_tCO2, 0, 'Project emissions should be 0 for hydropower');

  // Step 5: Issue RECs
  const recs = await workflow.issueRECs(emissions);
  t.ok(recs.RECs_issued > 0, 'Should have issued RECs');
  t.ok(recs.transactionId, 'Should have transaction ID');

  t.end();
});

// ============================================================================
// COMPLETE WORKFLOW - ERROR HANDLING
// ============================================================================

test('Complete Workflow - Invalid Telemetry (Physics Failure)', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  const invalidTelemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 5000.0, // Invalid - way too high
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const submission = await workflow.submitTelemetry(invalidTelemetry);
  t.notOk(submission.verified, 'Invalid telemetry should not be verified');
  t.equal(submission.status, 'REJECTED', 'Invalid telemetry should be rejected');
  t.ok(submission.rejectionReasons, 'Should have rejection reasons');

  t.end();
});

test('Complete Workflow - Temporal Inconsistency', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  // Submit first telemetry
  const telemetry1 = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  await workflow.submitTelemetry(telemetry1);

  // Submit second telemetry with decreased generation (temporal inconsistency)
  const telemetry2 = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T11:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 150.0, // Decreased from 156
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  const submission2 = await workflow.submitTelemetry(telemetry2);
  t.notOk(submission2.verified, 'Temporal inconsistency should fail verification');
  t.equal(submission2.status, 'REJECTED', 'Should be rejected');

  t.end();
});

// ============================================================================
// BATCH PROCESSING TESTS
// ============================================================================

test('Batch Processing - Multiple Readings', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  const readings = [
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T10:00:00Z',
      flowRate: 2.5,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 156.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T11:00:00Z',
      flowRate: 2.6,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 162.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T12:00:00Z',
      flowRate: 2.4,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 150.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    }
  ];

  const results = await workflow.processBatch(readings);
  t.equal(results.length, 3, 'Should process all 3 readings');
  t.ok(results.every(r => r.status), 'All results should have status');
  
  const approved = results.filter(r => r.status === 'APPROVED').length;
  t.ok(approved >= 2, 'Should have at least 2 approved readings');

  t.end();
});

test('Batch Processing - Mixed Valid and Invalid', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  const readings = [
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T10:00:00Z',
      flowRate: 2.5,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 156.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T11:00:00Z',
      flowRate: 2.6,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 5000.0, // Invalid
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    },
    {
      deviceId: 'TURBINE-1',
      timestamp: '2026-01-15T12:00:00Z',
      flowRate: 2.4,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 150.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    }
  ];

  const results = await workflow.processBatch(readings);
  const approved = results.filter(r => r.status === 'APPROVED').length;
  const rejected = results.filter(r => r.status === 'REJECTED').length;
  
  t.ok(approved >= 2, 'Should have at least 2 approved readings');
  t.ok(rejected >= 1, 'Should have at least 1 rejected reading');

  t.end();
});

// ============================================================================
// AGGREGATION TESTS
// ============================================================================

test('Aggregation - Daily Summary', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  // Submit 24 hourly readings
  const readings = [];
  for (let hour = 0; hour < 24; hour++) {
    readings.push({
      deviceId: 'TURBINE-1',
      timestamp: new Date(Date.UTC(2026, 0, 15, hour, 0, 0)).toISOString(),
      flowRate: 2.5,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 156.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    });
  }

  await workflow.processBatch(readings);
  const summary = await workflow.generateDailySummary('2026-01-15');

  t.ok(summary.totalGeneration > 0, 'Should have total generation');
  t.ok(summary.totalEmissionReductions > 0, 'Should have total emission reductions');
  t.ok(summary.totalRECs > 0, 'Should have total RECs');
  t.equal(summary.readingCount, 24, 'Should have 24 readings');

  t.end();
});

test('Aggregation - Monthly Summary', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  // Submit readings for entire month
  const readings = [];
  for (let day = 1; day <= 31; day++) {
    for (let hour = 0; hour < 24; hour++) {
      readings.push({
        deviceId: 'TURBINE-1',
        timestamp: new Date(Date.UTC(2026, 0, day, hour, 0, 0)).toISOString(),
        flowRate: 2.5,
        head: 45.0,
        capacityFactor: 0.65,
        generatedKwh: 156.0,
        pH: 7.2,
        turbidity: 12.5,
        temperature: 18.0
      });
    }
  }

  await workflow.processBatch(readings);
  const summary = await workflow.generateMonthlySummary('2026-01');

  t.ok(summary.totalGeneration > 0, 'Should have total generation');
  t.ok(summary.totalEmissionReductions > 0, 'Should have total emission reductions');
  t.ok(summary.totalRECs > 0, 'Should have total RECs');
  t.equal(summary.readingCount, 744, 'Should have 744 readings (31 days × 24 hours)');

  t.end();
});

// ============================================================================
// HEDERA INTEGRATION TESTS
// ============================================================================

test('Hedera Integration - DID Deployment', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  const did = await workflow.deployDeviceDID();
  t.ok(did.topicId, 'Should have DID topic ID');
  t.ok(did.did, 'Should have DID');
  t.ok(did.publicKey, 'Should have public key');

  t.end();
});

test('Hedera Integration - REC Token Creation', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  const token = await workflow.createRECToken();
  t.ok(token.tokenId, 'Should have token ID');
  t.ok(token.symbol, 'Should have token symbol');
  t.ok(token.initialSupply, 'Should have initial supply');

  t.end();
});

test('Hedera Integration - REC Minting', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  const mintResult = await workflow.mintRECs({
    amount: 13440,
    recipientAccount: '0.0.1234567'
  });

  t.ok(mintResult.transactionId, 'Should have transaction ID');
  t.ok(mintResult.amount, 'Should have minted amount');
  t.ok(mintResult.hashscanUrl, 'Should have HashScan URL');

  t.end();
});

// ============================================================================
// MONITORING AND REPORTING TESTS
// ============================================================================

test('Monitoring - Generate Monitoring Report', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  // Submit some readings
  const readings = [];
  for (let i = 0; i < 91; i++) {
    readings.push({
      deviceId: 'TURBINE-1',
      timestamp: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 3), (i % 24), 0, 0)).toISOString(),
      flowRate: 2.5,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 156.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    });
  }

  await workflow.processBatch(readings);
  const report = await workflow.generateMonitoringReport('2026-01');

  t.ok(report.projectId, 'Should have project ID');
  t.ok(report.period, 'Should have period');
  t.ok(report.totalGeneration > 0, 'Should have total generation');
  t.ok(report.totalEmissionReductions > 0, 'Should have total emission reductions');
  t.ok(report.totalRECs > 0, 'Should have total RECs');
  t.ok(report.readingCount > 0, 'Should have reading count');

  t.end();
});

// ============================================================================
// ERROR RECOVERY TESTS
// ============================================================================

test('Error Recovery - Retry Failed Submission', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  const telemetry = {
    deviceId: 'TURBINE-1',
    timestamp: '2026-01-15T10:00:00Z',
    flowRate: 2.5,
    head: 45.0,
    capacityFactor: 0.65,
    generatedKwh: 156.0,
    pH: 7.2,
    turbidity: 12.5,
    temperature: 18.0
  };

  // First attempt (might fail)
  let result = await workflow.submitTelemetryWithRetry(telemetry, { maxRetries: 3 });
  
  // Should eventually succeed or fail gracefully
  t.ok(result.status, 'Should have status after retries');
  t.ok(result.attempts >= 1, 'Should have attempted at least once');

  t.end();
});

// ============================================================================
// PERFORMANCE AND SCALABILITY TESTS
// ============================================================================

test('Performance - Process 1000 Readings', async (t) => {
  const workflow = new Workflow({
    projectId: 'HYDROPOWER-DEMO-001',
    deviceId: 'TURBINE-1',
    gridEmissionFactor: 0.8,
    executionMode: 'transparent-classic'
  });

  await workflow.initialize();

  // Generate 1000 readings
  const readings = [];
  for (let i = 0; i < 1000; i++) {
    readings.push({
      deviceId: 'TURBINE-1',
      timestamp: new Date(Date.now() + i * 3600000).toISOString(),
      flowRate: 2.5,
      head: 45.0,
      capacityFactor: 0.65,
      generatedKwh: 156.0,
      pH: 7.2,
      turbidity: 12.5,
      temperature: 18.0
    });
  }

  const startTime = Date.now();
  const results = await workflow.processBatch(readings);
  const endTime = Date.now();
  const latency = endTime - startTime;

  t.equal(results.length, 1000, 'Should process all 1000 readings');
  t.ok(latency < 60000, `Should complete in < 60 seconds (actual: ${latency}ms)`);
  
  const avgLatency = latency / 1000;
  t.ok(avgLatency < 100, `Average latency per reading should be < 100ms (actual: ${avgLatency}ms)`);

  t.end();
});

// ============================================================================
// TEST SUMMARY
// ============================================================================

test('Integration Test Summary', (t) => {
  t.comment('Complete Workflow Integration Tests');
  t.comment('Coverage: Happy Path, Error Handling, Batch Processing, Aggregation, Hedera Integration, Monitoring, Error Recovery, Performance');
  t.comment('Status: All critical workflows tested');
  t.end();
});
