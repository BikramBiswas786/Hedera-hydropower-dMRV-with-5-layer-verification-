/**
 * Telemetry Validation Layer
 * Prevents silent defaults and ensures data integrity before MRV processing
 * 
 * Key Principle: NO SILENT DEFAULTS
 * - Missing critical fields → REJECT immediately
 * - Missing optional fields → LOG and mark as partial
 * - Invalid ranges → REJECT with clear error
 */

const { telemetryCounter } = require('../monitoring/metrics');

/**
 * Validation rules for telemetry readings
 */
const VALIDATION_RULES = {
  // Required fields - must be present and valid
  required: {
    flowRate: { min: 0.1, max: 100, unit: 'm³/s' },
    head: { min: 1, max: 500, unit: 'meters' },
    generatedKwh: { min: 0.01, max: 50000, unit: 'kWh' },
    timestamp: { type: 'number' }
  },
  
  // Optional fields - if present, must be valid
  optional: {
    pH: { min: 4.0, max: 10.0, unit: 'pH' },
    turbidity: { min: 0, max: 1000, unit: 'NTU' },
    temperature: { min: 0, max: 40, unit: '°C' },
    efficiency: { min: 0.1, max: 1.0, unit: 'decimal' },
    dissolved_oxygen: { min: 0, max: 20, unit: 'mg/L' }
  }
};

/**
 * Validate a single telemetry reading
 * @param {Object} reading - Raw telemetry data
 * @param {Object} context - Plant/device context for logging
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[], normalized: Object }
 */
function validateTelemetry(reading, context = {}) {
  const errors = [];
  const warnings = [];
  const normalized = {};
  
  // 1. Validate required fields
  for (const [field, rules] of Object.entries(VALIDATION_RULES.required)) {
    if (reading[field] === undefined || reading[field] === null) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }
    
    const value = reading[field];
    
    // Type validation
    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push(`Invalid type for ${field}: expected number, got ${typeof value}`);
      continue;
    }
    
    // Range validation
    if (rules.min !== undefined && value < rules.min) {
      errors.push(`${field} below minimum: ${value} < ${rules.min} ${rules.unit || ''}`);
    }
    if (rules.max !== undefined && value > rules.max) {
      errors.push(`${field} above maximum: ${value} > ${rules.max} ${rules.unit || ''}`);
    }
    
    normalized[field] = value;
  }
  
  // 2. Validate optional fields (if present)
  for (const [field, rules] of Object.entries(VALIDATION_RULES.optional)) {
    if (reading[field] === undefined || reading[field] === null) {
      // Optional field missing - log but don't fail
      warnings.push(`Optional field missing: ${field} (will not be used in verification)`);
      continue;
    }
    
    const value = reading[field];
    
    // If present, must be valid
    if (typeof value !== 'number') {
      warnings.push(`Invalid type for optional field ${field}: expected number, got ${typeof value}`);
      continue;
    }
    
    if (rules.min !== undefined && value < rules.min) {
      warnings.push(`${field} below expected range: ${value} < ${rules.min} ${rules.unit}`);
    }
    if (rules.max !== undefined && value > rules.max) {
      warnings.push(`${field} above expected range: ${value} > ${rules.max} ${rules.unit}`);
    }
    
    normalized[field] = value;
  }
  
  // 3. Add metadata
  normalized.validatedAt = Date.now();
  normalized.partial = warnings.length > 0;
  
  const valid = errors.length === 0;
  
  // 4. Log validation result
  if (!valid) {
    console.error(`[VALIDATION FAILED] Plant: ${context.plantId}, Device: ${context.deviceId}`);
    console.error(`Errors: ${errors.join(', ')}`);
  }
  if (warnings.length > 0) {
    console.warn(`[VALIDATION WARNINGS] Plant: ${context.plantId}, Device: ${context.deviceId}`);
    console.warn(`Warnings: ${warnings.join(', ')}`);
  }
  
  return { valid, errors, warnings, normalized };
}

/**
 * Validate and normalize telemetry before submission
 * Throws if validation fails (fail-fast approach)
 * @param {Object} reading - Raw telemetry data
 * @param {Object} context - Plant/device context
 * @returns {Object} Normalized and validated reading
 */
function validateAndNormalize(reading, context = {}) {
  const result = validateTelemetry(reading, context);
  
  if (!result.valid) {
    // Increment rejection counter
    telemetryCounter.inc({ 
      status: 'VALIDATION_FAILED', 
      plant_id: context.plantId || 'unknown' 
    });
    
    throw new Error(`Telemetry validation failed: ${result.errors.join(', ')}`);
  }
  
  return result.normalized;
}

/**
 * Check if reading has critical missing fields (would fail physics validation anyway)
 * This is a pre-flight check before expensive verification
 * @param {Object} reading - Telemetry reading
 * @returns {boolean} True if reading is complete enough for verification
 */
function hasMinimumFields(reading) {
  return (
    reading.flowRate !== undefined &&
    reading.head !== undefined &&
    reading.generatedKwh !== undefined
  );
}

/**
 * Get validation rules (useful for API documentation)
 * @returns {Object} Validation rules
 */
function getValidationRules() {
  return VALIDATION_RULES;
}

module.exports = {
  validateTelemetry,
  validateAndNormalize,
  hasMinimumFields,
  getValidationRules,
  VALIDATION_RULES
};
