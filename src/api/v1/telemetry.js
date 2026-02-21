/**
 * REST API v1 - Telemetry Submission Endpoint
 *
 * POST /api/v1/telemetry
 * Headers: x-api-key: ghpk_demo_key_001
 * Body:    { plant_id, device_id, readings }
 */

const express = require('express');
const router  = express.Router();
const { authenticateAPI }        = require('../../middleware/auth');
const { validateAndNormalize }   = require('../../validation/telemetry');
const { telemetryCounter, trustScoreGauge, timeVerification } = require('../../monitoring/metrics');
const Workflow = require('../../workflow');

router.use(authenticateAPI);

/**
 * POST /api/v1/telemetry
 * Submit a sensor reading for MRV verification.
 */
router.post('/', async (req, res) => {
  try {
    const { plant_id, device_id, readings } = req.body;

    if (!plant_id || !device_id || !readings) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Required fields: plant_id, device_id, readings'
      });
    }

    // 1. Validate — throws on missing required fields
    let normalized;
    try {
      normalized = validateAndNormalize(readings, { plantId: plant_id, deviceId: device_id });
    } catch (validationError) {
      return res.status(400).json({
        error:   'Validation failed',
        message: validationError.message,
        readings
      });
    }

    // 2. MRV workflow
    const result = await timeVerification(async () => {
      const workflow = new Workflow();
      await workflow.initialize(
        plant_id,
        device_id,
        parseFloat(process.env.EF_GRID || 0.82)  // India grid EF default
      );
      return await workflow.submitReading(normalized);
    }, 'api_submission');

    // 3. Prometheus
    telemetryCounter.inc({ status: result.verificationStatus, plant_id });
    trustScoreGauge.set({ plant_id, device_id }, result.trustScore);

    // 4. Build response
    //    carbon_credits  → from workflow (uses engine's ACM0002 ER_tCO2)
    //    verificationDetails → from workflow (maps engine check statuses)
    const response = {
      status:     result.verificationStatus,
      trust_score: result.trustScore,
      reading_id: result.readingId,
      timestamp:  result.timestamp,
      hedera: {
        transaction_id: result.transactionId,
        topic_id:       result.topicId,
        hashscan_url:   result.transactionId
          ? `https://hashscan.io/testnet/transaction/${result.transactionId}`
          : null
      },
      carbon_credits: result.carbonCredits
        ? {
            amount_tco2e:       result.carbonCredits.amount_tco2e,
            generated_mwh:      result.carbonCredits.generated_mwh,
            ef_grid:            result.carbonCredits.ef_grid_tco2_per_mwh,
            methodology:        result.carbonCredits.methodology
          }
        : null,
      verification_details: result.verificationDetails
        ? {
            physics_check:     result.verificationDetails.physicsCheck,
            temporal_check:    result.verificationDetails.temporalCheck,
            environmental_check: result.verificationDetails.environmentalCheck,
            trust_score:       result.verificationDetails.trustScore,
            flags:             result.verificationDetails.flags
          }
        : null
    };

    // Only add warning if reading is genuinely partial (missing pH/turbidity)
    if (normalized.partial) {
      response.warning = 'Core environmental sensors missing (pH/turbidity). Reading accepted but marked partial.';
    }

    return res.status(result.verificationStatus === 'APPROVED' ? 200 : 202).json(response);

  } catch (error) {
    console.error('[API ERROR]', error);
    return res.status(500).json({
      error:      'Internal server error',
      message:    error.message,
      request_id: Date.now().toString(36)
    });
  }
});

/** GET /api/v1/telemetry/rules */
router.get('/rules', (req, res) => {
  const { getValidationRules } = require('../../validation/telemetry');
  return res.json({
    validation_rules: getValidationRules(),
    documentation: 'https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/docs/API.md'
  });
});

/** GET /api/v1/telemetry/health */
router.get('/health', (req, res) => {
  return res.json({ status: 'healthy', timestamp: Date.now(), version: '1.0.0' });
});

module.exports = router;
