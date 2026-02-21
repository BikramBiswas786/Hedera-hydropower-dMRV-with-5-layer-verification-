/**
 * Telemetry Validation Layer
 * Prevents silent defaults and ensures data integrity before MRV processing
 *
 * Key Principle: NO SILENT DEFAULTS
 * - Missing critical fields         → REJECT immediately
 * - Missing core optional fields    → mark partial (pH, turbidity)
 * - Missing ancillary optionals     → silent warning only (temp, efficiency, DO)
 * - Invalid ranges                  → REJECT with clear error
 */

const { telemetryCounter } = require('../monitoring/metrics');

const VALIDATION_RULES = {
  // Required fields — must be present and valid
  required: {
    flowRate:     { min: 0.1, max: 100,   unit: 'm³/s' },
    head:         { min: 1,   max: 500,   unit: 'meters' },
    generatedKwh: { min: 0.01, max: 50000, unit: 'kWh' },
    timestamp:    { type: 'number' }
  },

  // Core optional fields — if missing, mark reading as partial
  // (affects carbon-credit eligibility in some registries)
  coreOptional: {
    pH:        { min: 4.0, max: 10.0, unit: 'pH' },
    turbidity: { min: 0,   max: 1000, unit: 'NTU' }
  },

  // Ancillary optional fields — logged but do NOT set partial flag
  ancillaryOptional: {
    temperature:       { min: 0,   max: 40,  unit: '°C' },
    efficiency:        { min: 0.1, max: 1.0, unit: 'decimal' },
    dissolved_oxygen:  { min: 0,   max: 20,  unit: 'mg/L' }
  }
};

// Backwards-compat: expose flat optional map for getValidationRules()
const FLAT_OPTIONAL = {
  ...VALIDATION_RULES.coreOptional,
  ...VALIDATION_RULES.ancillaryOptional
};

function validateTelemetry(reading, context = {}) {
  const errors   = [];
  const warnings = [];
  const normalized = {};
  let coreOptionalMissing = false;

  // 1. Required fields
  for (const [field, rules] of Object.entries(VALIDATION_RULES.required)) {
    if (reading[field] === undefined || reading[field] === null) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    const value = reading[field];
    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push(`Invalid type for ${field}: expected number, got ${typeof value}`);
      continue;
    }
    if (rules.min !== undefined && value < rules.min)
      errors.push(`${field} below minimum: ${value} < ${rules.min} ${rules.unit || ''}`);
    if (rules.max !== undefined && value > rules.max)
      errors.push(`${field} above maximum: ${value} > ${rules.max} ${rules.unit || ''}`);
    normalized[field] = value;
  }

  // 2. Core optional fields (pH, turbidity) — absence marks reading as partial
  for (const [field, rules] of Object.entries(VALIDATION_RULES.coreOptional)) {
    if (reading[field] === undefined || reading[field] === null) {
      warnings.push(`Core optional field missing: ${field}`);
      coreOptionalMissing = true;
      continue;
    }
    const value = reading[field];
    if (typeof value !== 'number') {
      warnings.push(`Invalid type for ${field}: expected number, got ${typeof value}`);
      coreOptionalMissing = true;
      continue;
    }
    if (rules.min !== undefined && value < rules.min)
      warnings.push(`${field} below expected range: ${value} < ${rules.min} ${rules.unit}`);
    if (rules.max !== undefined && value > rules.max)
      warnings.push(`${field} above expected range: ${value} > ${rules.max} ${rules.unit}`);
    normalized[field] = value;
  }

  // 3. Ancillary optional fields — no partial flag, just log
  for (const [field, rules] of Object.entries(VALIDATION_RULES.ancillaryOptional)) {
    if (reading[field] === undefined || reading[field] === null) {
      // silent — do NOT push to warnings, do NOT set partial
      continue;
    }
    const value = reading[field];
    if (typeof value !== 'number') {
      warnings.push(`Invalid type for ancillary field ${field}: expected number`);
      continue;
    }
    if (rules.min !== undefined && value < rules.min)
      warnings.push(`${field} below expected range: ${value} < ${rules.min} ${rules.unit}`);
    if (rules.max !== undefined && value > rules.max)
      warnings.push(`${field} above expected range: ${value} > ${rules.max} ${rules.unit}`);
    normalized[field] = value;
  }

  // 4. Metadata
  normalized.validatedAt = Date.now();
  // partial is ONLY true when core optional (pH / turbidity) are missing
  normalized.partial = coreOptionalMissing;

  const valid = errors.length === 0;

  if (!valid) {
    console.error(`[VALIDATION FAILED] Plant: ${context.plantId}, Device: ${context.deviceId}`);
    console.error(`Errors: ${errors.join(', ')}`);
  }
  if (warnings.length > 0) {
    console.warn(`[VALIDATION WARNINGS] Plant: ${context.plantId}`);
    console.warn(`Warnings: ${warnings.join(', ')}`);
  }

  return { valid, errors, warnings, normalized };
}

function validateAndNormalize(reading, context = {}) {
  const result = validateTelemetry(reading, context);
  if (!result.valid) {
    telemetryCounter.inc({
      status: 'VALIDATION_FAILED',
      plant_id: context.plantId || 'unknown'
    });
    throw new Error(`Telemetry validation failed: ${result.errors.join(', ')}`);
  }
  return result.normalized;
}

function hasMinimumFields(reading) {
  return (
    reading.flowRate     !== undefined &&
    reading.head         !== undefined &&
    reading.generatedKwh !== undefined
  );
}

function getValidationRules() {
  return {
    required:         VALIDATION_RULES.required,
    optional:         FLAT_OPTIONAL,   // backwards compat
    coreOptional:     VALIDATION_RULES.coreOptional,
    ancillaryOptional: VALIDATION_RULES.ancillaryOptional
  };
}

module.exports = {
  validateTelemetry,
  validateAndNormalize,
  hasMinimumFields,
  getValidationRules,
  VALIDATION_RULES
};
