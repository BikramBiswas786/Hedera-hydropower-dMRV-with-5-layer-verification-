/**
 * Telemetry validation for edge gateway submissions
 * Prevents silent defaults and ensures data quality
 */

const REQUIRED_FIELDS = ['flowRate', 'head', 'generatedKwh', 'timestamp'];
const OPTIONAL_FIELDS = ['pH', 'turbidity', 'temperature', 'efficiency'];

/**
 * Validate telemetry reading before submission
 * @param {Object} reading - Raw telemetry reading from sensors
 * @returns {Object} { valid: boolean, errors: string[], normalized: Object }
 */
function validateTelemetry(reading) {
  const errors = [];
  const warnings = [];
  const normalized = {};

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (reading[field] === undefined || reading[field] === null) {
      errors.push(`Missing required field: ${field}`);
    } else if (typeof reading[field] === 'number' && !isFinite(reading[field])) {
      errors.push(`Invalid ${field}: must be finite number, got ${reading[field]}`);
    } else {
      normalized[field] = reading[field];
    }
  }

  // Validate field ranges (basic sanity checks)
  if (normalized.flowRate !== undefined) {
    if (normalized.flowRate < 0 || normalized.flowRate > 100) {
      errors.push(`flowRate out of range: ${normalized.flowRate} m³/s (expected 0-100)`);
    }
  }

  if (normalized.head !== undefined) {
    if (normalized.head < 0 || normalized.head > 500) {
      errors.push(`head out of range: ${normalized.head} m (expected 0-500)`);
    }
  }

  if (normalized.generatedKwh !== undefined) {
    if (normalized.generatedKwh < 0) {
      errors.push(`generatedKwh cannot be negative: ${normalized.generatedKwh}`);
    }
  }

  // Handle optional fields - NO SILENT DEFAULTS
  for (const field of OPTIONAL_FIELDS) {
    if (reading[field] !== undefined && reading[field] !== null) {
      if (typeof reading[field] === 'number' && !isFinite(reading[field])) {
        warnings.push(`Invalid ${field}: ${reading[field]}, omitting from submission`);
      } else {
        normalized[field] = reading[field];
      }
    } else {
      warnings.push(`Optional field ${field} not provided - will use AI Guardian defaults`);
    }
  }

  // Validate timestamp
  if (normalized.timestamp) {
    const ts = new Date(normalized.timestamp);
    if (isNaN(ts.getTime())) {
      errors.push(`Invalid timestamp: ${normalized.timestamp}`);
    } else {
      // Check if timestamp is reasonable (not too far in past/future)
      const now = Date.now();
      const diff = Math.abs(now - ts.getTime());
      if (diff > 24 * 60 * 60 * 1000) { // 24 hours
        warnings.push(`Timestamp differs from current time by ${Math.round(diff/3600000)} hours`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized
  };
}

module.exports = { validateTelemetry };
