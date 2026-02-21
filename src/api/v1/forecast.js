'use strict';

const express = require('express');
const router = express.Router();
const { Forecaster } = require('../../ml/Forecaster');
const { authenticate } = require('../../middleware/auth');

// In-memory storage (replace with database in production)
let forecasterInstance = null;
const historicalData = [];

/**
 * POST /api/v1/forecast/train
 * Train the forecasting model with historical data
 */
router.post('/train', authenticate, async (req, res) => {
  try {
    const { readings, options } = req.body;

    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({
        success: false,
        error: 'readings array required'
      });
    }

    // Create new forecaster instance
    forecasterInstance = new Forecaster(options || {});
    
    // Train model
    forecasterInstance.train(readings);
    
    // Store historical data
    historicalData.push(...readings);

    res.json({
      success: true,
      message: 'Forecaster trained successfully',
      data: {
        trainingSamples: readings.length,
        modelState: forecasterInstance.toJSON()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/forecast/predict
 * Get predictions for next N time steps
 */
router.get('/predict', async (req, res) => {
  try {
    if (!forecasterInstance || !forecasterInstance.trained) {
      return res.status(400).json({
        success: false,
        error: 'Model not trained. Call /train endpoint first.'
      });
    }

    const steps = parseInt(req.query.steps) || 24;
    
    if (steps < 1 || steps > 168) {
      return res.status(400).json({
        success: false,
        error: 'steps must be between 1 and 168 (7 days)'
      });
    }

    const predictions = forecasterInstance.predict(steps);

    res.json({
      success: true,
      data: {
        predictions,
        metadata: {
          steps,
          generatedAt: new Date().toISOString(),
          model: 'Holt-Winters Triple Exponential Smoothing'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/forecast/check-underperformance
 * Check if actual reading underperforms forecast
 */
router.post('/check-underperformance', authenticate, async (req, res) => {
  try {
    if (!forecasterInstance || !forecasterInstance.trained) {
      return res.status(400).json({
        success: false,
        error: 'Model not trained. Call /train endpoint first.'
      });
    }

    const { actual, step } = req.body;

    if (typeof actual !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'actual (number) required'
      });
    }

    const result = forecasterInstance.checkUnderperformance(
      actual,
      step || 1
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/forecast/model
 * Get current model state
 */
router.get('/model', async (req, res) => {
  try {
    if (!forecasterInstance) {
      return res.status(404).json({
        success: false,
        error: 'No model loaded'
      });
    }

    res.json({
      success: true,
      data: forecasterInstance.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
