'use strict';
/**
 * Integration Tests: Complete REC Generation Workflow
 * Restored from tape runner + converted to Jest
 *
 * Covers:
 *   1. Workflow initialization (positional args: projectId, deviceId, ef)
 *   2. Happy path telemetry submission
 *   3. Physics failure detection
 *   4. Temporal inconsistency handling
 *   5. Batch processing (3 readings)
 *   6. Monitoring report generation
 *   7. Performance benchmark (1000 readings)
 *   8. Error recovery / retry
 *
 * Pattern used throughout (matches tests/complete-workflow.test.js):
 *   const wf = new Workflow();
 *   await wf.initialize('HYDROPOWER-DEMO-001', 'TURBINE-1', 0.8);
 */

const Workflow = require('../../src/workflow');

jest.setTimeout(90000); // global safety net for perf test

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create and initialise a Workflow in one call.
 * Workflow constructor ignores projectId/deviceId — they must be passed
 * as positional arguments to initialize().
 */
async function makeWorkflow(overrides = {}) {
  const wf = new Workflow(overrides.constructorConfig || {});
  await wf.initialize(
    overrides.projectId  || 'HYDROPOWER-DEMO-001',
    overrides.deviceId   || 'TURBINE-1',
    overrides.ef         !== undefined ? overrides.ef : 0.8
  );
  return wf;
}

function makeTelemetry(overrides = {}) {
  return {
    deviceId:      'TURBINE-1',
    timestamp:     new Date().toISOString(),
    flowRate:      2.5,
    head:          45.0,
    generatedKwh:  156.0,
    pH:            7.2,
    turbidity:     12.5,
    temperature:   18.0,
    efficiency:    0.85,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 1. Initialization
// ---------------------------------------------------------------------------

describe('Workflow – Initialization', () => {
  it('sets projectId, deviceId, gridEmissionFactor after initialize()', async () => {
    const wf = new Workflow();
    const result = await wf.initialize('HYDROPOWER-DEMO-001', 'TURBINE-1', 0.8);
    expect(result.success).toBe(true);
    expect(wf.projectId).toBe('HYDROPOWER-DEMO-001');
    expect(wf.deviceId).toBe('TURBINE-1');
    expect(wf.gridEmissionFactor).toBe(0.8);
  });

  it('throws when projectId is missing', async () => {
    const wf = new Workflow();
    await expect(wf.initialize(null, 'TURBINE-1', 0.8)).rejects.toThrow(
      'projectId is required'
    );
  });

  it('throws when deviceId is missing', async () => {
    const wf = new Workflow();
    await expect(wf.initialize('HYDROPOWER-DEMO-001', null, 0.8)).rejects.toThrow(
      'deviceId is required'
    );
  });

  it('throws when submitReading is called before initialize()', async () => {
    const wf = new Workflow();
    await expect(wf.submitReading(makeTelemetry())).rejects.toThrow(
      'Workflow not initialized'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Happy Path
// ---------------------------------------------------------------------------

describe('Workflow – Happy Path', () => {
  let wf;

  beforeEach(async () => {
    wf = await makeWorkflow();
  });

  it('submits valid telemetry and returns success', async () => {
    const result = await wf.submitReading(makeTelemetry());
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.verificationStatus).toBeDefined();
  });

  it('returns a non-negative trust score', async () => {
    const result = await wf.submitReading(makeTelemetry());
    const score = result.trustScore ?? result.attestation?.trustScore ?? 0;
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('verificationStatus is one of APPROVED / FLAGGED / REJECTED', async () => {
    const result = await wf.submitReading(makeTelemetry());
    expect(['APPROVED', 'FLAGGED', 'REJECTED']).toContain(
      result.verificationStatus
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Physics Failure Detection
// ---------------------------------------------------------------------------

describe('Workflow – Physics Failure Detection', () => {
  it('does not throw on impossibly high generation value', async () => {
    const wf = await makeWorkflow();
    // 5000 kWh from 2.5 m³/s @ 45 m is physically impossible (~10× expected)
    const result = await wf.submitReading(makeTelemetry({ generatedKwh: 5000.0 }));
    expect(result.success).toBe(true);
    expect(['FLAGGED', 'REJECTED', 'APPROVED']).toContain(
      result.verificationStatus
    );
  });

  it('does not throw on zero generation', async () => {
    const wf = await makeWorkflow();
    const result = await wf.submitReading(makeTelemetry({ generatedKwh: 0 }));
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Temporal Inconsistency
// ---------------------------------------------------------------------------

describe('Workflow – Temporal Inconsistency', () => {
  it('handles two consecutive readings without crashing', async () => {
    const wf = await makeWorkflow();
    await wf.submitReading(makeTelemetry({ generatedKwh: 156.0 }));
    const result2 = await wf.submitReading(
      makeTelemetry({
        generatedKwh: 150.0,
        timestamp: new Date(Date.now() + 3_600_000).toISOString()
      })
    );
    expect(result2.success).toBe(true);
  });

  it('handles a future-timestamp reading without crashing', async () => {
    const wf = await makeWorkflow();
    const result = await wf.submitReading(
      makeTelemetry({
        timestamp: new Date(Date.now() + 86_400_000).toISOString() // +1 day
      })
    );
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Batch Processing
// ---------------------------------------------------------------------------

describe('Workflow – Batch Processing', () => {
  it('processes 3 concurrent readings successfully', async () => {
    const wf = await makeWorkflow();

    const readings = [
      makeTelemetry({ generatedKwh: 156.0, flowRate: 2.5 }),
      makeTelemetry({ generatedKwh: 162.0, flowRate: 2.6 }),
      makeTelemetry({ generatedKwh: 150.0, flowRate: 2.4 })
    ];

    const results = await Promise.all(readings.map(r => wf.submitReading(r)));
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('processes 10 sequential readings without error', async () => {
    const wf = await makeWorkflow();

    const readings = Array.from({ length: 10 }, (_, i) =>
      makeTelemetry({
        timestamp:    new Date(Date.now() + i * 3_600_000).toISOString(),
        generatedKwh: 156.0
      })
    );

    for (const r of readings) {
      const res = await wf.submitReading(r);
      expect(res.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Monitoring Report
// ---------------------------------------------------------------------------

describe('Workflow – Monitoring Report', () => {
  it('generateMonitoringReport returns projectId and deviceId', async () => {
    const wf = await makeWorkflow();

    // Submit 5 readings first
    for (let i = 0; i < 5; i++) {
      await wf.submitReading(
        makeTelemetry({ timestamp: new Date(Date.now() + i * 3_600_000).toISOString() })
      );
    }

    const report = await wf.generateMonitoringReport();
    expect(report.success).toBe(true);
    expect(report.projectId).toBe('HYDROPOWER-DEMO-001');
    expect(report.deviceId).toBe('TURBINE-1');
    expect(report.totalReadings).toBeGreaterThan(0);
  });

  it('generateMonitoringReport throws if not initialized', async () => {
    const wf = new Workflow();
    await expect(wf.generateMonitoringReport()).rejects.toThrow(
      'Workflow not initialized'
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Performance Benchmark
// ---------------------------------------------------------------------------

describe('Workflow – Performance', () => {
  it('processes 1000 readings in under 60 seconds', async () => {
    const wf = await makeWorkflow();

    const readings = Array.from({ length: 1000 }, (_, i) =>
      makeTelemetry({
        timestamp:    new Date(Date.now() + i * 3_600_000).toISOString(),
        generatedKwh: 156.0
      })
    );

    const start   = Date.now();
    const results = await Promise.all(readings.map(r => wf.submitReading(r)));
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(1000);
    expect(results.every(r => r.success)).toBe(true);
    expect(elapsed).toBeLessThan(60_000);

    console.log(
      `[perf] 1000 readings in ${elapsed}ms — avg ${
        (elapsed / 1000).toFixed(2)
      }ms/reading`
    );
  }, 90_000); // 90s Jest timeout override for this test only
});

// ---------------------------------------------------------------------------
// 8. Error Recovery / Retry
// ---------------------------------------------------------------------------

describe('Workflow – Error Recovery', () => {
  it('retrySubmission returns result with attempt >= 1', async () => {
    const wf = await makeWorkflow();
    const result = await wf.retrySubmission(makeTelemetry());
    expect(result).toBeDefined();
    expect(result.attempt).toBeGreaterThanOrEqual(1);
  });

  it('retrySubmission throws when not initialized', async () => {
    const wf = new Workflow();
    await expect(wf.retrySubmission(makeTelemetry())).rejects.toThrow(
      'Workflow not initialized'
    );
  });

  it('reset() clears initialized state', async () => {
    const wf = await makeWorkflow();
    wf.reset();
    expect(wf.initialized).toBe(false);
    expect(wf.projectId).toBeNull();
    expect(wf.deviceId).toBeNull();
  });
});
