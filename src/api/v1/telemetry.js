/**
 * REST API v1 - Telemetry Submission Endpoint
 * Allows plants to submit sensor readings via simple HTTP POST
 * 
 * Usage:
 *   POST /api/v1/telemetry
 *   Headers: x-api-key: ghpk_demo_key_001
 *   Body: { plant_id, device_id, readings }
 */

const express = require('express');
const router = express.Router();
const { authenticateAPI } = require('../../middleware/auth');
const { validateAndNormalize } = require('../../validation/telemetry');
const { telemetryCounter, trustScoreGauge, timeVerification } = require('../../monitoring/metrics');
const Workflow = require('../../workflow');

// Apply authentication to all telemetry endpoints
router.use(authenticateAPI);

/**
 * Submit telemetry reading
 * POST /api/v1/telemetry
 */
router.post('/', async (req, res) => {
  try {
    const { plant_id, device_id, readings } = req.body;
    
    // 1. Validate request structure
    if (!plant_id || !device_id || !readings) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Required fields: plant_id, device_id, readings'
      });
    }
    
    // 2. Validate telemetry data (no silent defaults)
    let normalized;
    try {
      normalized = validateAndNormalize(readings, { plantId: plant_id, deviceId: device_id });
    } catch (validationError) {
      return res.status(400).json({
        error: 'Validation failed',
        message: validationError.message,
        readings: readings
      });
    }
    
    // 3. Submit to MRV workflow with timing
    const result = await timeVerification(async () => {
      const workflow = new Workflow();
      await workflow.initialize(plant_id, device_id, parseFloat(process.env.EF_GRID || 0.8));
      return await workflow.submitReading(normalized);
    }, 'api_submission');
    
    // 4. Update metrics
    telemetryCounter.inc({ 
      status: result.verificationStatus, 
      plant_id: plant_id 
    });
    
    trustScoreGauge.set(
      { plant_id: plant_id, device_id: device_id },
      result.trustScore
    );
    
    // 5. Build response
    const response = {
      status: result.verificationStatus,
      trust_score: result.trustScore,
      reading_id: result.readingId,
      timestamp: result.timestamp,
      hedera: {
        transaction_id: result.transactionId,
        topic_id: result.topicId,
        hashscan_url: result.transactionId 
          ? `https://hashscan.io/testnet/transaction/${result.transactionId}`
          : null
      },
      carbon_credits: result.carbonCredits ? {
        amount_tco2e: result.carbonCredits.amount,
        rec_tokens: result.carbonCredits.recTokens,
        token_id: result.carbonCredits.tokenId
      } : null,
      verification_details: {
        physics_check: result.verificationDetails?.physicsCheck || 'N/A',
        temporal_check: result.verificationDetails?.temporalCheck || 'N/A',
        environmental_check: result.verificationDetails?.environmentalCheck || 'N/A'
      }
    };
    
    // Add warning if reading was partial
    if (normalized.partial) {
      response.warning = 'Some optional fields were missing or invalid';
    }
    
    // Return appropriate status code
    const statusCode = result.verificationStatus === 'APPROVED' ? 200 : 202;
    return res.status(statusCode).json(response);
    
  } catch (error) {
    console.error('[API ERROR]', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      request_id: Date.now().toString(36)
    });
  }
});

/**
 * Get telemetry validation rules
 * GET /api/v1/telemetry/rules
 */
router.get('/rules', (req, res) => {
  const { getValidationRules } = require('../../validation/telemetry');
  return res.json({
    validation_rules: getValidationRules(),
    documentation: 'https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/docs/API.md'
  });
});

/**
 * Health check endpoint
 * GET /api/v1/telemetry/health
 */
router.get('/health', (req, res) => {
  return res.json({
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

module.exports = router;
