'use strict';
/**
 * Configuration Validator Tests
 * Tests the plain-function API exported by src/engine/v1/validator.js:
 *   validateConfig(config)   — throws on invalid config
 *   validateReading(reading) — throws on invalid reading
 *   validateEnvironment(env) — throws on invalid env vars object
 */

const validator = require('../src/engine/v1/validator.js');

// ---------------------------------------------------------------------------
// Configuration Validation
// ---------------------------------------------------------------------------
describe('Configuration Validation', () => {
  test('validates complete config', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1', capacity: 100 })).not.toThrow();
  });

  test('rejects missing deviceId', () => {
    expect(() => validator.validateConfig({ capacity: 100 })).toThrow('deviceId is required');
  });

  test('rejects missing capacity', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1' })).toThrow('capacity is required');
  });

  test('rejects null config', () => {
    expect(() => validator.validateConfig(null)).toThrow('Config is required');
  });

  test('rejects undefined config', () => {
    expect(() => validator.validateConfig(undefined)).toThrow('Config is required');
  });

  test('accepts config with optional fields', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1', capacity: 100, minEfficiency: 0.70 })).not.toThrow();
  });

  test('accepts numeric capacity', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1', capacity: 100.5 })).not.toThrow();
  });

  test('accepts zero capacity (falsy but valid)', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1', capacity: 0 })).not.toThrow();
  });

  test('rejects empty config object', () => {
    expect(() => validator.validateConfig({})).toThrow();
  });

  test('accepts large capacity values', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1', capacity: 1_000_000 })).not.toThrow();
  });

  test('accepts string deviceId with special chars', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-1_@#$', capacity: 100 })).not.toThrow();
  });

  test('accepts unicode deviceId', () => {
    expect(() => validator.validateConfig({ deviceId: 'TURBINE-日本語', capacity: 100 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Reading Validation
// ---------------------------------------------------------------------------
describe('Reading Validation', () => {
  test('validates complete reading', () => {
    expect(() => validator.validateReading({
      flowRate: 2.5, head: 45.0, efficiency: 0.85,
      generatedKwh: 106.3, pH: 7.5, turbidity: 25, temperature: 18.0
    })).not.toThrow();
  });

  test('rejects non-numeric flowRate', () => {
    expect(() => validator.validateReading({ flowRate: 'bad', head: 45.0 }))
      .toThrow('flowRate must be number');
  });

  test('rejects NaN flowRate', () => {
    expect(() => validator.validateReading({ flowRate: NaN, head: 45.0 }))
      .toThrow('flowRate must be number');
  });

  test('rejects non-numeric head', () => {
    expect(() => validator.validateReading({ flowRate: 2.5, head: 'bad' }))
      .toThrow('head must be number');
  });

  test('rejects null reading', () => {
    expect(() => validator.validateReading(null)).toThrow('Reading is required');
  });

  test('rejects undefined reading', () => {
    expect(() => validator.validateReading(undefined)).toThrow('Reading is required');
  });

  test('accepts zero flowRate', () => {
    expect(() => validator.validateReading({ flowRate: 0, head: 45.0 })).not.toThrow();
  });

  test('accepts negative flowRate', () => {
    expect(() => validator.validateReading({ flowRate: -2.5, head: 45.0 })).not.toThrow();
  });

  test('accepts very large values', () => {
    expect(() => validator.validateReading({ flowRate: 999999.99, head: 999999.99 })).not.toThrow();
  });

  test('accepts reading with extra fields', () => {
    expect(() => validator.validateReading({ flowRate: 2.5, head: 45.0, customField: 'value' })).not.toThrow();
  });

  test('Infinity flowRate passes (not NaN, is a number type)', () => {
    expect(() => validator.validateReading({ flowRate: Infinity, head: 45.0 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Environment Validation
// ---------------------------------------------------------------------------
describe('Environment Validation', () => {
  test('validates complete environment', () => {
    expect(() => validator.validateEnvironment({
      HEDERA_ACCOUNT_ID: '0.0.123456', HEDERA_PRIVATE_KEY: 'test-key-123'
    })).not.toThrow();
  });

  test('rejects missing HEDERA_ACCOUNT_ID', () => {
    expect(() => validator.validateEnvironment({ HEDERA_PRIVATE_KEY: 'k' }))
      .toThrow('HEDERA_ACCOUNT_ID required');
  });

  test('rejects missing HEDERA_PRIVATE_KEY', () => {
    expect(() => validator.validateEnvironment({ HEDERA_ACCOUNT_ID: '0.0.123456' }))
      .toThrow('HEDERA_PRIVATE_KEY required');
  });

  test('rejects null environment', () => {
    expect(() => validator.validateEnvironment(null)).toThrow();
  });

  test('rejects undefined environment', () => {
    expect(() => validator.validateEnvironment(undefined)).toThrow();
  });

  test('rejects empty string HEDERA_ACCOUNT_ID', () => {
    expect(() => validator.validateEnvironment({
      HEDERA_ACCOUNT_ID: '', HEDERA_PRIVATE_KEY: 'k'
    })).toThrow('HEDERA_ACCOUNT_ID required');
  });

  test('rejects whitespace-only HEDERA_ACCOUNT_ID', () => {
    expect(() => validator.validateEnvironment({
      HEDERA_ACCOUNT_ID: '   ', HEDERA_PRIVATE_KEY: 'k'
    })).toThrow('HEDERA_ACCOUNT_ID required');
  });

  test('accepts environment with extra fields', () => {
    expect(() => validator.validateEnvironment({
      HEDERA_ACCOUNT_ID: '0.0.123456', HEDERA_PRIVATE_KEY: 'k', EXTRA: 'x'
    })).not.toThrow();
  });

  test('accepts various key formats', () => {
    expect(() => validator.validateEnvironment({
      HEDERA_ACCOUNT_ID: '0.0.123456', HEDERA_PRIVATE_KEY: 'abcdef0123456789'
    })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------
describe('Edge Cases', () => {
  test('handles very long deviceId string', () => {
    expect(() => validator.validateConfig({ deviceId: 'A'.repeat(10000), capacity: 100 })).not.toThrow();
  });

  test('handles circular reference in config', () => {
    const config = { deviceId: 'TURBINE-1', capacity: 100 };
    config.self = config;
    expect(() => validator.validateConfig(config)).not.toThrow();
  });

  test('numeric deviceId is valid (string or number accepted)', () => {
    expect(() => validator.validateConfig({ deviceId: 123, capacity: 100 })).not.toThrow();
  });

  test('string "123" deviceId is valid', () => {
    expect(() => validator.validateConfig({ deviceId: '123', capacity: 100 })).not.toThrow();
  });

  test('nested config fields are accepted', () => {
    expect(() => validator.validateConfig({
      deviceId: 'T-1', capacity: 100, location: { lat: 40.71, lon: -74.00 }
    })).not.toThrow();
  });

  test('array fields in config are accepted', () => {
    expect(() => validator.validateConfig({
      deviceId: 'T-1', capacity: 100, sensors: ['flow', 'head']
    })).not.toThrow();
  });

  test('error message for missing deviceId includes field name', () => {
    try {
      validator.validateConfig({ capacity: 100 });
    } catch (e) {
      expect(e.message).toContain('deviceId');
    }
  });
});
