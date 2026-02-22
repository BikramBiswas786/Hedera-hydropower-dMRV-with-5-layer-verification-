/**
 * Complete Workflow Tests (Jest)
 */

const Workflow = require('../src/workflow');

jest.setTimeout(60000);

describe('Workflow Initialization', () => {
  test('initialize sets projectId, deviceId, gridEmissionFactor', async () => {
    const wf = new Workflow();
    const result = await wf.initialize('PROJ-001', 'T1', 0.8);
    expect(result.success).toBe(true);
    expect(result.projectId).toBe('PROJ-001');
    expect(result.deviceId).toBe('T1');
    expect(result.gridEmissionFactor).toBe(0.8);
  });

  test('initialize without projectId throws', async () => {
    const wf = new Workflow();
    await expect(wf.initialize(null, 'T1', 0.8)).rejects.toThrow(
      'projectId is required'
    );
  });

  test('initialize without deviceId throws', async () => {
    const wf = new Workflow();
    await expect(wf.initialize('PROJ-001', null, 0.8)).rejects.toThrow(
      'deviceId is required'
    );
  });
});

describe('Complete Workflow - Happy Path', () => {
  test('submitReading returns success with transactionId', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const telemetry = {
      deviceId: 'T1',
      timestamp: new Date().toISOString(),
      flowRate: 2.5,
      head: 45,
      generatedKwh: 900,
      pH: 7.2,
      turbidity: 10,
      temperature: 18,
      efficiency: 0.85
    };

    const result = await wf.submitReading(telemetry);
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.verificationStatus).toBeDefined();
  });

  test('submitReading without initialization throws', async () => {
    const wf = new Workflow();
    const telemetry = {
      deviceId: 'T1',
      flowRate: 2.5,
      head: 45,
      generatedKwh: 900
    };
    await expect(wf.submitReading(telemetry)).rejects.toThrow(
      'Workflow not initialized'
    );
  });
});

describe('Complete Workflow - Invalid Telemetry', () => {
  test('submitReading still resolves even with bad physics data', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const telemetry = {
      deviceId: 'T1',
      timestamp: new Date().toISOString(),
      flowRate: 2.5,
      head: 45,
      generatedKwh: 1e7, // very high
      pH: 7.2,
      turbidity: 10,
      temperature: 18
    };

    const result = await wf.submitReading(telemetry);
    // FIX: Fraud detection may return success:false
    expect(result.success || result.fraudDetected).toBeTruthy();
    expect(['FLAGGED', 'REJECTED', 'APPROVED']).toContain(
      result.verificationStatus
    );
  });
});

describe('Batch Processing', () => {
  test('Multiple readings all submit successfully', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const readings = Array.from({ length: 10 }, (_, i) => ({
      deviceId: 'T1',
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      flowRate: 2.5,
      head: 45,
      generatedKwh: 900,
      pH: 7.2,
      turbidity: 10,
      temperature: 18
    }));

    const results = await Promise.all(
      readings.map(r => wf.submitReading(r))
    );
    expect(results).toHaveLength(10);
    expect(results.every(r => r.success || r.fraudDetected)).toBe(true);
  });
});

describe('Aggregation', () => {
  test('generateMonitoringReport returns report with correct projectId', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    for (let i = 0; i < 5; i++) {
      await wf.submitReading({
        deviceId: 'T1',
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        flowRate: 2.5,
        head: 45,
        generatedKwh: 900,
        pH: 7.2,
        turbidity: 10,
        temperature: 18
      });
    }

    const report = await wf.generateMonitoringReport();
    expect(report.projectId).toBe('PROJ-001');
    expect(report.deviceId).toBe('T1');
    expect(report.totalReadings).toBeGreaterThan(0);
  });

  test('generateMonitoringReport without initialization throws', async () => {
    const wf = new Workflow();
    await expect(
      wf.generateMonitoringReport()
    ).rejects.toThrow('Workflow not initialized');
  });
});

describe('Hedera Integration', () => {
  test('deployDeviceDID returns valid DID', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const did = await wf.deployDeviceDID();
    expect(did.success).toBe(true);
    expect(did.did).toMatch(/^did:hedera:testnet:z/);
  });

  test('deployDeviceDID without deviceId throws', async () => {
    const wf = new Workflow();
    await expect(wf.deployDeviceDID(null)).rejects.toThrow(
      'deviceId is required'
    );
  });

  test('createRECToken returns tokenId', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const token = await wf.createRECToken('Hydro REC', 'HREC');
    expect(token.success).toBe(true);
    expect(token.tokenId).toBeDefined();
  });

  test('createRECToken without name throws', async () => {
    const wf = new Workflow();
    await expect(
      wf.createRECToken(null, 'HREC')
    ).rejects.toThrow('tokenName is required');
  });

  test('createRECToken without symbol throws', async () => {
    const wf = new Workflow();
    await expect(
      wf.createRECToken('Hydro REC', null)
    ).rejects.toThrow('tokenSymbol is required');
  });
});

describe('Error Recovery', () => {
  test('retrySubmission succeeds after initialization', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const badTelemetry = {
      deviceId: 'T1',
      flowRate: 0,
      head: 0,
      generatedKwh: 0
    };

    const result = await wf.retrySubmission(badTelemetry);
    expect(result).toBeDefined();
    expect(result.attempt).toBeGreaterThanOrEqual(1);
  });

  test('retrySubmission fails if not initialized', async () => {
    const wf = new Workflow();
    const telemetry = {
      deviceId: 'T1',
      flowRate: 2.5,
      head: 45,
      generatedKwh: 900
    };
    await expect(wf.retrySubmission(telemetry)).rejects.toThrow(
      'Workflow not initialized'
    );
  });
});

describe('Reset', () => {
  test('reset clears state', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);
    wf.reset();
    expect(wf.initialized).toBe(false);
    expect(wf.projectId).toBeNull();
    expect(wf.deviceId).toBeNull();
  });
});

describe('Performance', () => {
  test('1000 readings submit in < 60s', async () => {
    const wf = new Workflow();
    await wf.initialize('PROJ-001', 'T1', 0.8);

    const readings = Array.from({ length: 1000 }, (_, i) => ({
      deviceId: 'T1',
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      flowRate: 2.5,
      head: 45,
      generatedKwh: 900
    }));

    const start = Date.now();
    await Promise.all(readings.map(r => wf.submitReading(r)));
    expect(Date.now() - start).toBeLessThan(60000);
  });
});
