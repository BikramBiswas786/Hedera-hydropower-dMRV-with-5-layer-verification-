'use strict';

/**
 * Input Validation Middleware
 * ───────────────────────────────────────────────────────
 * Uses express-validator to sanitize and validate all incoming
 * request bodies before they reach route handlers.
 *
 * Usage (inline on a route):
 *   router.post('/plants', plantCreateRules, handleValidation, handler);
 *
 * Usage (applied to all routes in a file):
 *   app.use('/api/v1/telemetry', telemetryRules, handleValidation, router);
 */

const { body, validationResult } = require('express-validator');

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Checks express-validator errors and returns 422 with details.
 * Must be placed AFTER the rule arrays in the route middleware chain.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error:   'Validation failed',
      details: errors.array().map(e => ({
        field:    e.path,
        message:  e.msg,
        received: e.value
      }))
    });
  }
  next();
}

// ─── Plants ────────────────────────────────────────────────────────────────────

const plantCreateRules = [
  body('plant_id')
    .trim()
    .notEmpty().withMessage('plant_id is required')
    .isLength({ min: 3, max: 50 }).withMessage('plant_id must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('plant_id may only contain letters, numbers, dashes, underscores'),

  body('name')
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ min: 2, max: 255 }).withMessage('name must be 2-255 characters')
    .escape(),

  body('capacity_mw')
    .notEmpty().withMessage('capacity_mw is required')
    .isFloat({ min: 0.001, max: 10000 })
    .withMessage('capacity_mw must be a number between 0.001 and 10000'),

  body('plant_type')
    .optional()
    .isIn(['hydro', 'solar', 'wind', 'biomass', 'geothermal', 'tidal'])
    .withMessage('plant_type must be one of: hydro, solar, wind, biomass, geothermal, tidal'),

  body('location')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('location must be <= 255 characters')
    .escape()
];

// ─── Forecasting ───────────────────────────────────────────────────────────────

const forecastTrainRules = [
  body('readings')
    .isArray({ min: 48 })
    .withMessage('readings must be an array with at least 48 items'),

  body('readings.*.generatedKwh')
    .isFloat({ min: 0, max: 1_000_000 })
    .withMessage('Each reading.generatedKwh must be a non-negative number'),

  body('readings.*.timestamp')
    .isNumeric()
    .withMessage('Each reading.timestamp must be a numeric Unix timestamp (ms)')
];

const forecastCheckRules = [
  body('actualGeneration')
    .isFloat({ min: 0, max: 1_000_000 })
    .withMessage('actualGeneration must be a non-negative number'),

  body('forecastStep')
    .isInt({ min: 1, max: 168 })
    .withMessage('forecastStep must be an integer between 1 and 168')
];

// ─── Active Learning ─────────────────────────────────────────────────────────────

const feedbackRules = [
  body('readingId')
    .trim()
    .notEmpty().withMessage('readingId is required')
    .isLength({ max: 100 }).withMessage('readingId must be <= 100 characters'),

  body('originalLabel')
    .isIn(['anomaly', 'normal'])
    .withMessage('originalLabel must be "anomaly" or "normal"'),

  body('correctLabel')
    .isIn(['anomaly', 'normal'])
    .withMessage('correctLabel must be "anomaly" or "normal"'),

  body('confidence')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('confidence must be a float between 0 and 1')
];

// ─── Telemetry ──────────────────────────────────────────────────────────────────
const telemetryRules = [
  body('deviceId')
    .trim()
    .notEmpty().withMessage('deviceId is required')
    .isLength({ max: 255 }),

  body('flowRate_m3_per_s')
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage('flowRate_m3_per_s must be 0–1000'),

  body('headHeight_m')
    .optional()
    .isFloat({ min: 0, max: 500 })
    .withMessage('headHeight_m must be 0–500'),

  body('generatedKwh')
    .optional()
    .isFloat({ min: 0, max: 1_000_000 })
    .withMessage('generatedKwh must be 0–1 000 000'),

  body('pH')
    .optional()
    .isFloat({ min: 0, max: 14 })
    .withMessage('pH must be 0–14'),

  body('turbidity_ntu')
    .optional()
    .isFloat({ min: 0, max: 10_000 })
    .withMessage('turbidity_ntu must be 0–10 000'),

  body('temperature_celsius')
    .optional()
    .isFloat({ min: -20, max: 100 })
    .withMessage('temperature_celsius must be −20 to 100')
];

module.exports = {
  handleValidation,
  plantCreateRules,
  forecastTrainRules,
  forecastCheckRules,
  feedbackRules,
  telemetryRules
};
