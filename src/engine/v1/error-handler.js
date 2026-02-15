/**
 * Error Handling Utilities Module
 * Provides custom error classes and error handling strategies
 */

const logger = require('./logger');

/**
 * Custom Error Classes
 */

class HydropowerError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500) {
    super(message);
    this.name = 'HydropowerError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends HydropowerError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
      value: this.value
    };
  }
}

class PhysicsConstraintError extends HydropowerError {
  constructor(message, constraint = null, expectedRange = null, actualValue = null) {
    super(message, 'PHYSICS_CONSTRAINT_ERROR', 400);
    this.name = 'PhysicsConstraintError';
    this.constraint = constraint;
    this.expectedRange = expectedRange;
    this.actualValue = actualValue;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      constraint: this.constraint,
      expectedRange: this.expectedRange,
      actualValue: this.actualValue
    };
  }
}

class TemporalConsistencyError extends HydropowerError {
  constructor(message, issue = null, previousValue = null, currentValue = null) {
    super(message, 'TEMPORAL_CONSISTENCY_ERROR', 400);
    this.name = 'TemporalConsistencyError';
    this.issue = issue;
    this.previousValue = previousValue;
    this.currentValue = currentValue;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      issue: this.issue,
      previousValue: this.previousValue,
      currentValue: this.currentValue
    };
  }
}

class EnvironmentalBoundsError extends HydropowerError {
  constructor(message, parameter = null, bounds = null, value = null) {
    super(message, 'ENVIRONMENTAL_BOUNDS_ERROR', 400);
    this.name = 'EnvironmentalBoundsError';
    this.parameter = parameter;
    this.bounds = bounds;
    this.value = value;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      parameter: this.parameter,
      bounds: this.bounds,
      value: this.value
    };
  }
}

class AnomalyDetectionError extends HydropowerError {
  constructor(message, zScore = null, threshold = null) {
    super(message, 'ANOMALY_DETECTION_ERROR', 400);
    this.name = 'AnomalyDetectionError';
    this.zScore = zScore;
    this.threshold = threshold;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      zScore: this.zScore,
      threshold: this.threshold
    };
  }
}

class HederaError extends HydropowerError {
  constructor(message, hederaCode = null, transactionId = null) {
    super(message, 'HEDERA_ERROR', 500);
    this.name = 'HederaError';
    this.hederaCode = hederaCode;
    this.transactionId = transactionId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      hederaCode: this.hederaCode,
      transactionId: this.transactionId
    };
  }
}

class VerificationError extends HydropowerError {
  constructor(message, verificationStatus = null, trustScore = null, reasons = []) {
    super(message, 'VERIFICATION_ERROR', 400);
    this.name = 'VerificationError';
    this.verificationStatus = verificationStatus;
    this.trustScore = trustScore;
    this.reasons = reasons;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      verificationStatus: this.verificationStatus,
      trustScore: this.trustScore,
      reasons: this.reasons
    };
  }
}

class ConfigurationError extends HydropowerError {
  constructor(message, configField = null, expectedFormat = null) {
    super(message, 'CONFIGURATION_ERROR', 400);
    this.name = 'ConfigurationError';
    this.configField = configField;
    this.expectedFormat = expectedFormat;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      configField: this.configField,
      expectedFormat: this.expectedFormat
    };
  }
}

/**
 * Error Handler Class
 */

class ErrorHandler {
  /**
   * Handle error and log it
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {Object} - Error response
   */
  static handle(error, context = {}) {
    // Log the error
    logger.error(error.message, error);

    // Build error response
    const response = {
      success: false,
      error: {
        name: error.name || 'Error',
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        statusCode: error.statusCode || 500
      }
    };

    // Add custom error details if available
    if (error.toJSON) {
      response.error = { ...response.error, ...error.toJSON() };
    }

    // Add context if provided
    if (Object.keys(context).length > 0) {
      response.context = context;
    }

    return response;
  }

  /**
   * Handle async function with error catching
   * @param {Function} fn - Async function to execute
   * @param {Object} context - Additional context
   * @returns {Promise} - Result or error response
   */
  static async handleAsync(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      return this.handle(error, context);
    }
  }

  /**
   * Validate required fields
   * @param {Object} data - Data to validate
   * @param {Array} requiredFields - Required field names
   * @throws {ValidationError} - If required fields are missing
   */
  static validateRequired(data, requiredFields) {
    for (const field of requiredFields) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        throw new ValidationError(`Missing required field: ${field}`, field);
      }
    }
  }

  /**
   * Validate field type
   * @param {*} value - Value to validate
   * @param {string} expectedType - Expected type
   * @param {string} fieldName - Field name
   * @throws {ValidationError} - If type doesn't match
   */
  static validateType(value, expectedType, fieldName) {
    const actualType = typeof value;
    if (actualType !== expectedType) {
      throw new ValidationError(
        `Field ${fieldName} has wrong type: expected ${expectedType}, got ${actualType}`,
        fieldName,
        value
      );
    }
  }

  /**
   * Validate number range
   * @param {number} value - Value to validate
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {string} fieldName - Field name
   * @throws {ValidationError} - If value is out of range
   */
  static validateRange(value, min, max, fieldName) {
    if (value < min || value > max) {
      throw new ValidationError(
        `Field ${fieldName} out of range: expected ${min}-${max}, got ${value}`,
        fieldName,
        value
      );
    }
  }

  /**
   * Validate enum value
   * @param {*} value - Value to validate
   * @param {Array} allowedValues - Allowed values
   * @param {string} fieldName - Field name
   * @throws {ValidationError} - If value not in allowed values
   */
  static validateEnum(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(
        `Field ${fieldName} has invalid value: expected one of ${allowedValues.join(', ')}, got ${value}`,
        fieldName,
        value
      );
    }
  }

  /**
   * Validate pattern match
   * @param {string} value - Value to validate
   * @param {RegExp} pattern - Pattern to match
   * @param {string} fieldName - Field name
   * @throws {ValidationError} - If pattern doesn't match
   */
  static validatePattern(value, pattern, fieldName) {
    if (!pattern.test(value)) {
      throw new ValidationError(
        `Field ${fieldName} does not match required pattern: ${pattern}`,
        fieldName,
        value
      );
    }
  }

  /**
   * Create physics constraint error
   * @param {string} message - Error message
   * @param {string} constraint - Constraint name
   * @param {Object} expectedRange - Expected range
   * @param {number} actualValue - Actual value
   * @throws {PhysicsConstraintError}
   */
  static throwPhysicsError(message, constraint, expectedRange, actualValue) {
    throw new PhysicsConstraintError(message, constraint, expectedRange, actualValue);
  }

  /**
   * Create temporal consistency error
   * @param {string} message - Error message
   * @param {string} issue - Issue description
   * @param {*} previousValue - Previous value
   * @param {*} currentValue - Current value
   * @throws {TemporalConsistencyError}
   */
  static throwTemporalError(message, issue, previousValue, currentValue) {
    throw new TemporalConsistencyError(message, issue, previousValue, currentValue);
  }

  /**
   * Create environmental bounds error
   * @param {string} message - Error message
   * @param {string} parameter - Parameter name
   * @param {Object} bounds - Bounds
   * @param {number} value - Actual value
   * @throws {EnvironmentalBoundsError}
   */
  static throwEnvironmentalError(message, parameter, bounds, value) {
    throw new EnvironmentalBoundsError(message, parameter, bounds, value);
  }

  /**
   * Create anomaly detection error
   * @param {string} message - Error message
   * @param {number} zScore - Z-score value
   * @param {number} threshold - Threshold value
   * @throws {AnomalyDetectionError}
   */
  static throwAnomalyError(message, zScore, threshold) {
    throw new AnomalyDetectionError(message, zScore, threshold);
  }

  /**
   * Create Hedera error
   * @param {string} message - Error message
   * @param {string} hederaCode - Hedera error code
   * @param {string} transactionId - Transaction ID
   * @throws {HederaError}
   */
  static throwHederaError(message, hederaCode, transactionId) {
    throw new HederaError(message, hederaCode, transactionId);
  }

  /**
   * Create verification error
   * @param {string} message - Error message
   * @param {string} status - Verification status
   * @param {number} trustScore - Trust score
   * @param {Array} reasons - Rejection reasons
   * @throws {VerificationError}
   */
  static throwVerificationError(message, status, trustScore, reasons) {
    throw new VerificationError(message, status, trustScore, reasons);
  }

  /**
   * Create configuration error
   * @param {string} message - Error message
   * @param {string} configField - Configuration field
   * @param {string} expectedFormat - Expected format
   * @throws {ConfigurationError}
   */
  static throwConfigError(message, configField, expectedFormat) {
    throw new ConfigurationError(message, configField, expectedFormat);
  }
}

/**
 * Retry mechanism for transient failures
 */

class RetryHandler {
  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {Object} options - Retry options
   * @returns {Promise} - Result of function
   */
  static async retry(fn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;
    const maxDelay = options.maxDelay || 30000;
    const backoffMultiplier = options.backoffMultiplier || 2;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${maxRetries}`, { function: fn.name });
        return await fn();
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed: ${error.message}`, { attempt, error: error.message });

        if (attempt < maxRetries) {
          logger.info(`Retrying in ${delay}ms...`, { delay });
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Retry with circuit breaker pattern
   * @param {Function} fn - Function to retry
   * @param {Object} options - Circuit breaker options
   * @returns {Promise} - Result of function
   */
  static async retryWithCircuitBreaker(fn, options = {}) {
    const failureThreshold = options.failureThreshold || 5;
    const resetTimeout = options.resetTimeout || 60000;

    if (!this.circuitBreakers) {
      this.circuitBreakers = {};
    }

    const key = fn.name || 'unknown';
    const breaker = this.circuitBreakers[key] || {
      failures: 0,
      lastFailureTime: null,
      state: 'closed' // closed, open, half-open
    };

    // Check if circuit should be reset
    if (breaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailureTime;
      if (timeSinceLastFailure > resetTimeout) {
        breaker.state = 'half-open';
        breaker.failures = 0;
      } else {
        throw new Error(`Circuit breaker is open for ${key}`);
      }
    }

    try {
      const result = await fn();
      breaker.failures = 0;
      breaker.state = 'closed';
      this.circuitBreakers[key] = breaker;
      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailureTime = Date.now();

      if (breaker.failures >= failureThreshold) {
        breaker.state = 'open';
      }

      this.circuitBreakers[key] = breaker;
      throw error;
    }
  }
}

module.exports = {
  // Error classes
  HydropowerError,
  ValidationError,
  PhysicsConstraintError,
  TemporalConsistencyError,
  EnvironmentalBoundsError,
  AnomalyDetectionError,
  HederaError,
  VerificationError,
  ConfigurationError,
  // Handlers
  ErrorHandler,
  RetryHandler
};
