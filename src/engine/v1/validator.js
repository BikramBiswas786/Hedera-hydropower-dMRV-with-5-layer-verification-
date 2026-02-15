/**
 * Configuration Validator Module
 * Validates project profiles against JSON schema
 * Ensures all configurations are correct before deployment
 */

const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

class ConfigValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.schema = this.loadSchema();
    this.validate = this.ajv.compile(this.schema);
  }

  /**
   * Load JSON schema from file
   */
  loadSchema() {
    const schemaPath = path.join(__dirname, 'project-profile.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(schemaContent);
  }

  /**
   * Validate configuration against schema
   * @param {Object} config - Configuration object to validate
   * @returns {Object} - Validation result with status and errors
   */
  validateConfig(config) {
    const isValid = this.validate(config);

    if (!isValid) {
      return {
        isValid: false,
        errors: this.validate.errors,
        errorCount: this.validate.errors.length,
        errorMessages: this.formatErrors(this.validate.errors)
      };
    }

    return {
      isValid: true,
      errors: [],
      errorCount: 0,
      errorMessages: []
    };
  }

  /**
   * Validate configuration from file
   * @param {string} filePath - Path to configuration file
   * @returns {Object} - Validation result
   */
  validateConfigFile(filePath) {
    try {
      const configContent = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(configContent);
      return this.validateConfig(config);
    } catch (error) {
      return {
        isValid: false,
        errors: [{ message: `Failed to read or parse file: ${error.message}` }],
        errorCount: 1,
        errorMessages: [`Failed to read or parse file: ${error.message}`]
      };
    }
  }

  /**
   * Format validation errors into readable messages
   * @param {Array} errors - AJV validation errors
   * @returns {Array} - Formatted error messages
   */
  formatErrors(errors) {
    return errors.map((error) => {
      const path = error.instancePath || 'root';
      const message = error.message;
      const keyword = error.keyword;

      switch (keyword) {
        case 'required':
          return `Missing required field: ${error.params.missingProperty}`;
        case 'type':
          return `${path}: Expected type ${error.params.type}, got ${typeof error.instance}`;
        case 'pattern':
          return `${path}: Value does not match required pattern`;
        case 'minimum':
          return `${path}: Value must be >= ${error.params.limit}`;
        case 'maximum':
          return `${path}: Value must be <= ${error.params.limit}`;
        case 'minLength':
          return `${path}: String must be at least ${error.params.minLength} characters`;
        case 'maxLength':
          return `${path}: String must be at most ${error.params.maxLength} characters`;
        case 'enum':
          return `${path}: Value must be one of: ${error.params.allowedValues.join(', ')}`;
        case 'format':
          return `${path}: Invalid ${error.params.format} format`;
        case 'additionalProperties':
          return `${path}: Unknown property not allowed`;
        default:
          return `${path}: ${message}`;
      }
    });
  }

  /**
   * Validate specific field
   * @param {string} fieldPath - Path to field (e.g., 'projectId', 'siteConfig.flowRateBounds.min')
   * @param {*} value - Value to validate
   * @returns {Object} - Validation result
   */
  validateField(fieldPath, value) {
    // Get the schema for the specific field
    const fieldSchema = this.getFieldSchema(fieldPath);

    if (!fieldSchema) {
      return {
        isValid: false,
        errors: [{ message: `Field ${fieldPath} not found in schema` }],
        errorMessages: [`Field ${fieldPath} not found in schema`]
      };
    }

    const validate = this.ajv.compile(fieldSchema);
    const isValid = validate(value);

    if (!isValid) {
      return {
        isValid: false,
        errors: validate.errors,
        errorMessages: this.formatErrors(validate.errors)
      };
    }

    return {
      isValid: true,
      errors: [],
      errorMessages: []
    };
  }

  /**
   * Get schema for specific field
   * @param {string} fieldPath - Path to field
   * @returns {Object} - Field schema
   */
  getFieldSchema(fieldPath) {
    const parts = fieldPath.split('.');
    let schema = this.schema;

    for (const part of parts) {
      if (schema.properties && schema.properties[part]) {
        schema = schema.properties[part];
      } else {
        return null;
      }
    }

    return schema;
  }

  /**
   * Validate critical fields
   * @param {Object} config - Configuration object
   * @returns {Object} - Validation result with critical field status
   */
  validateCriticalFields(config) {
    const criticalFields = [
      'projectId',
      'deviceId',
      'gridEmissionFactor',
      'executionMode',
      'autoApproveThreshold',
      'manualReviewThreshold',
      'hederaConfig.network',
      'hederaConfig.operatorAccountId'
    ];

    const results = {};
    const allValid = true;

    for (const field of criticalFields) {
      const value = this.getFieldValue(config, field);
      const validation = this.validateField(field, value);
      results[field] = validation;

      if (!validation.isValid) {
        allValid = false;
      }
    }

    return {
      allValid,
      fieldResults: results
    };
  }

  /**
   * Get field value from nested object
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-notation path
   * @returns {*} - Field value
   */
  getFieldValue(obj, path) {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get validation report
   * @param {Object} config - Configuration object
   * @returns {Object} - Detailed validation report
   */
  getValidationReport(config) {
    const basicValidation = this.validateConfig(config);
    const criticalValidation = this.validateCriticalFields(config);

    return {
      timestamp: new Date().toISOString(),
      basicValidation,
      criticalValidation,
      summary: {
        isValid: basicValidation.isValid && criticalValidation.allValid,
        totalErrors: basicValidation.errorCount,
        criticalFieldsValid: criticalValidation.allValid
      }
    };
  }

  /**
   * Print validation report to console
   * @param {Object} report - Validation report
   */
  printReport(report) {
    console.log('\n========================================');
    console.log('Configuration Validation Report');
    console.log('========================================');
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Overall Status: ${report.summary.isValid ? '✓ VALID' : '✗ INVALID'}`);
    console.log(`Total Errors: ${report.summary.totalErrors}`);
    console.log(`Critical Fields Valid: ${report.summary.criticalFieldsValid ? 'Yes' : 'No'}`);

    if (!report.basicValidation.isValid) {
      console.log('\nValidation Errors:');
      report.basicValidation.errorMessages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. ${msg}`);
      });
    }

    if (!report.summary.criticalFieldsValid) {
      console.log('\nCritical Field Errors:');
      Object.entries(report.criticalValidation.fieldResults).forEach(([field, result]) => {
        if (!result.isValid) {
          console.log(`  ${field}: ${result.errorMessages.join(', ')}`);
        }
      });
    }

    console.log('========================================\n');
  }
}

/**
 * Standalone validation function
 * @param {string} configPath - Path to configuration file
 * @returns {Object} - Validation result
 */
function validateConfigFile(configPath) {
  const validator = new ConfigValidator();
  const result = validator.validateConfigFile(configPath);
  const report = validator.getValidationReport(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  validator.printReport(report);
  return result;
}

module.exports = {
  ConfigValidator,
  validateConfigFile
};

// CLI usage
if (require.main === module) {
  const configPath = process.argv[2];

  if (!configPath) {
    console.error('Usage: node validator.js <config-file-path>');
    process.exit(1);
  }

  const result = validateConfigFile(configPath);
  process.exit(result.isValid ? 0 : 1);
}
