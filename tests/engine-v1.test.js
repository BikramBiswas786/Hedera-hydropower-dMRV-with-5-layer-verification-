// test/engine-v1.test.js

// ---- Ensure env vars exist before requiring the module ----
process.env.HEDERA_OPERATOR_ID = '0.0.1001';
process.env.HEDERA_OPERATOR_KEY = '302e020100300506032b657004220420dummy';
process.env.AUDIT_TOPIC_ID = '0.0.2001';
// Optional: override EF_GRID, otherwise defaults to 0.8 in engine-v1.js
process.env.EF_GRID = '0.8';

const mockExecute = jest.fn();
const mockGetReceipt = jest.fn();

// ---- Mock @hashgraph/sdk so no real network is used ----
jest.mock('@hashgraph/sdk', () => {
  const mockClient = {
    setOperator: jest.fn(),
    setDefaultMaxTransactionFee: jest.fn(),
    close: jest.fn()
  };

  const mockTopicMsgTx = function () {
    return {
      setTopicId: jest.fn().mockReturnThis(),
      setMessage: jest.fn().mockReturnThis(),
      freezeWith: jest.fn().mockReturnThis(),
      sign: jest.fn().mockReturnThis(),
      execute: mockExecute.mockResolvedValue({
        getReceipt: mockGetReceipt.mockResolvedValue({
          status: { toString: () => 'SUCCESS' }
        }),
        transactionId: { toString: () => '0.0.1001@123456789.000000000' }
      })
    };
  };

  return {
    Client: {
      forTestnet: jest.fn(() => mockClient)
    },
    TopicMessageSubmitTransaction: mockTopicMsgTx,
    PrivateKey: {
      fromString: jest.fn(() => ({}))
    },
    AccountId: {
      fromString: jest.fn(() => ({}))
    },
    TopicId: {
      fromString: jest.fn(() => ({}))
    },
    Hbar: jest.fn()
  };
});

// ---- Now require the engine, after env + mocks are in place ----
const { EngineV1 } = require('../src/engine/v1/engine-v1');

describe('EngineV1 verification pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeTelemetry(overrides = {}) {
    return {
      deviceId: overrides.deviceId || 'TURBINE-1',
      timestamp: overrides.timestamp || new Date().toISOString(),
      readings: {
        flowRate_m3_per_s: 2.5,
        headHeight_m: 45,
        // This is aligned with physics formula so deviation is very small
        generatedKwh: 938.08,
        pH: 7.2,
        turbidity_ntu: 10,
        temperature_celsius: 18,
        efficiency: 0.85,
        ...overrides.readings
      }
    };
  }

  test('approves a clean, physically consistent reading with high trust', async () => {
    const engine = new EngineV1();

    const telemetry = makeTelemetry();
    const result = await engine.verifyAndPublish(telemetry);

    expect(result.attestation.verificationStatus).toBe('APPROVED');
    expect(result.attestation.trustScore).toBeGreaterThanOrEqual(0.9);
    expect(result.attestation.checks.physics.status).toBe('PERFECT');
    expect(result.status).toBe('SUCCESS');
    expect(typeof result.transactionId).toBe('string');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockGetReceipt).toHaveBeenCalledTimes(1);
  });

  test('flags or rejects obviously bad physics (huge mismatch)', async () => {
    const engine = new EngineV1();

    // Make generatedKwh wildly inconsistent with flow/head
    const telemetry = makeTelemetry({
      readings: {
        generatedKwh: 1e7
      }
    });

    const result = await engine.verifyAndPublish(telemetry);

    // Physics check should fail
    expect(result.attestation.checks.physics.status).toBe('FAIL');
    // Trust should drop below auto-approve, and often below manual threshold
    expect(result.attestation.trustScore).toBeLessThan(0.9);
    expect(['FLAGGED', 'REJECTED']).toContain(
      result.attestation.verificationStatus
    );
  });

  test('temporal check penalizes large jumps between readings of same device', async () => {
    const engine = new EngineV1();

    // First reading establishes history
    await engine.verifyAndPublish(makeTelemetry());

    // Second reading with large jump in generatedKwh and flow
    const badTemporal = makeTelemetry({
      readings: {
        generatedKwh: 2000,
        flowRate_m3_per_s: 8
      }
    });

    const result2 = await engine.verifyAndPublish(badTemporal);
    const temporal = result2.attestation.checks.temporal;

    expect(temporal.genChange).toBeGreaterThan(50); // >50% change
    expect(['WARN', 'FAIL']).toContain(temporal.status);
  });

  test('environmental bounds downgrade score when pH/turbidity/temp are off', async () => {
    const engine = new EngineV1();

    const telemetry = makeTelemetry({
      readings: {
        pH: 5.0,            // outside perfect range
        turbidity_ntu: 150, // high
        temperature_celsius: 39
      }
    });

    const result = await engine.verifyAndPublish(telemetry);
    const env = result.attestation.checks.environmental;

    expect(['WARN', 'FAIL']).toContain(env.status);
    expect(env.details.pH.status).not.toBe('PERFECT');
    expect(env.details.turbidity.status).not.toBe('PERFECT');
    expect(env.details.temperature.status).not.toBe('PERFECT');
  });

  test('statistical anomaly detection marks strong outliers as OUTLIER', async () => {
    const engine = new EngineV1();

    // Build history with fairly stable generation
    for (let i = 0; i < 10; i++) {
      await engine.verifyAndPublish(
        makeTelemetry({
          readings: {
            generatedKwh: 900 + i * 5
          }
        })
      );
    }

    // Now an extreme outlier
    const extreme = makeTelemetry({
      readings: {
        generatedKwh: 5000
      }
    });

    const result = await engine.verifyAndPublish(extreme);
    const stat = result.attestation.checks.statistical;

    expect(stat.status).toBe('OUTLIER');
    expect(stat.zScore).toBeGreaterThanOrEqual(3.0);
  });

  test('device consistency check fails when readings exceed profile limits', async () => {
    const engine = new EngineV1({
      deviceProfile: {
        capacity: 1000,
        maxFlow: 5,
        maxHead: 50,
        minEfficiency: 0.7
      }
    });

    const telemetry = makeTelemetry({
      readings: {
        generatedKwh: 5000,        // exceeds capacity
        flowRate_m3_per_s: 20,     // exceeds maxFlow
        headHeight_m: 600,         // exceeds maxHead
        efficiency: 0.5            // below minEfficiency
      }
    });

    const result = await engine.verifyAndPublish(telemetry);
    const cons = result.attestation.checks.consistency;

    expect(cons.status).toBe('FAIL');
    expect(cons.details.capacity.status).toBe('EXCEEDS');
    expect(cons.details.flow.status).toBe('EXCEEDS');
    expect(cons.details.head.status).toBe('EXCEEDS');
    expect(cons.details.efficiency.status).toBe('OUT_OF_RANGE');
  });

  test('verifyBatch aggregates counts and average trust correctly', async () => {
    const engine = new EngineV1();

    const clean = makeTelemetry({ deviceId: 'T1' });
    const borderline = makeTelemetry({
      deviceId: 'T2',
      readings: { generatedKwh: 2000 }
    });
    const bad = makeTelemetry({
      deviceId: 'T3',
      readings: {
        generatedKwh: 1e7,
        pH: 5.0,
        turbidity_ntu: 150
      }
    });

    const summary = await engine.verifyBatch([clean, borderline, bad]);

    expect(summary.totalReadings).toBe(3);
    expect(summary.approved + summary.flagged + summary.rejected).toBe(3);
    expect(summary.averageTrustScore).toBeGreaterThan(0);
    expect(summary.results).toHaveLength(3);
  });
});
