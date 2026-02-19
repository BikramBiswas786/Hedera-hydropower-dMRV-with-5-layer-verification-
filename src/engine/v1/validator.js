'use strict';
/**
 * Configuration & Reading Validator
 * Exports plain functions expected by tests and the application layer.
 * Also exports ConfigValidator class for advanced schema-based usage.
 */

// ---------------------------------------------------------------------------
// Plain function API  (used by configuration-validator.test.js and app code)
// ---------------------------------------------------------------------------

/**
 * Validate device/project configuration.
 * Throws with descriptive message on first failure.
 * @param {*} config
 * @returns {true}
 */
function validateConfig(config) {
  if (config === null || config === undefined) {
    throw new Error('Config is required');
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Config must be an object');
  }
  if (config.deviceId === undefined || config.deviceId === null || config.deviceId === '') {
    throw new Error('deviceId is required');
  }
  const validTypes = ['string', 'number'];
  if (!validTypes.includes(typeof config.deviceId)) {
    throw new Error('deviceId must be string or number');
  }
  // capacity=0 is falsy but valid — use explicit undefined/null check
  if (config.capacity === undefined || config.capacity === null) {
    throw new Error('capacity is required');
  }
  return true;
}

/**
 * Validate a telemetry reading.
 * Throws with descriptive message on first failure.
 * @param {*} reading
 * @returns {true}
 */
function validateReading(reading) {
  if (reading === null || reading === undefined) {
    throw new Error('Reading is required');
  }
  if (typeof reading !== 'object' || Array.isArray(reading)) {
    throw new Error('Reading must be an object');
  }
  if (typeof reading.flowRate !== 'number' || isNaN(reading.flowRate)) {
    throw new Error('flowRate must be number');
  }
  if (typeof reading.head !== 'number' || isNaN(reading.head)) {
    throw new Error('head must be number');
  }
  return true;
}

/**
 * Validate environment variables object.
 * Throws with descriptive message on first failure.
 * @param {*} env
 * @returns {true}
 */
function validateEnvironment(env) {
  if (env === null || env === undefined) {
    throw new Error('HEDERA_ACCOUNT_ID required');
  }
  if (!env.HEDERA_ACCOUNT_ID || !env.HEDERA_ACCOUNT_ID.trim()) {
    throw new Error('HEDERA_ACCOUNT_ID required');
  }
  if (!env.HEDERA_PRIVATE_KEY || !env.HEDERA_PRIVATE_KEY.trim()) {
    throw new Error('HEDERA_PRIVATE_KEY required');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Class-based AJV validator (kept for advanced/schema usage)
// ---------------------------------------------------------------------------

let Ajv, fs, path;
try { Ajv  = require('ajv'); }  catch (_) {}
try { fs   = require('fs'); }   catch (_) {}
try { path = require('path'); } catch (_) {}

class ConfigValidator {
  constructor() {
    if (!Ajv || !fs || !path) {
      this._ready = false;
      return;
    }
    try {
      this.ajv = new Ajv({ allErrors: true, verbose: true });
      const schemaPath = path.join(__dirname, 'project-profile.schema.json');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      this.schema = JSON.parse(schemaContent);
      this._validate = this.ajv.compile(this.schema);
      this._ready = true;
    } catch (e) {
      this._ready = false;
    }
  }

  validateConfig(config) {
    if (!this._ready) return { isValid: true, errors: [], errorCount: 0, errorMessages: [] };
    const ok = this._validate(config);
    if (!ok) {
      return { isValid: false, errors: this._validate.errors, errorCount: this._validate.errors.length,
        errorMessages: this._validate.errors.map(e => e.message) };
    }
    return { isValid: true, errors: [], errorCount: 0, errorMessages: [] };
  }

  validateConfigFile(filePath) {
    try {
      const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return this.validateConfig(config);
    } catch (e) {
      return { isValid: false, errors: [{ message: e.message }], errorCount: 1, errorMessages: [e.message] };
    }
  }
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------
module.exports = {
  // Plain functions (primary test/app interface)
  validateConfig,
  validateReading,
  validateEnvironment,
  // Class (advanced usage)
  ConfigValidator
};
