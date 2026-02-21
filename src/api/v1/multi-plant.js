'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { PlantManager } = require('../../multi-plant/PlantManager');

// Initialize plant manager (assumes database connection exists)
const plantManager = new PlantManager();

/**
 * GET /api/v1/plants
 * List all plants with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      plantType: req.query.type,
      operator: req.query.operator,
      minCapacity: req.query.minCapacity ? parseFloat(req.query.minCapacity) : undefined,
      maxCapacity: req.query.maxCapacity ? parseFloat(req.query.maxCapacity) : undefined
    };

    const plants = await plantManager.listPlants(filters);

    res.json({
      success: true,
      data: {
        plants,
        total: plants.length,
        filters
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
 * GET /api/v1/plants/:plantId
 * Get detailed information about a specific plant
 */
router.get('/:plantId', async (req, res) => {
  try {
    const { plantId } = req.params;
    const plant = await plantManager.getPlant(plantId);

    if (!plant) {
      return res.status(404).json({
        success: false,
        error: `Plant ${plantId} not found`
      });
    }

    res.json({
      success: true,
      data: plant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/plants
 * Register a new plant
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const plantData = req.body;

    // Validation
    const required = ['plantId', 'name', 'capacityMw'];
    const missing = required.filter(field => !plantData[field]);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const plant = await plantManager.registerPlant(plantData);

    res.status(201).json({
      success: true,
      message: 'Plant registered successfully',
      data: plant
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/plants/:plantId
 * Update plant information
 */
router.put('/:plantId', authenticate, async (req, res) => {
  try {
    const { plantId } = req.params;
    const updates = req.body;

    const plant = await plantManager.updatePlant(plantId, updates);

    if (!plant) {
      return res.status(404).json({
        success: false,
        error: `Plant ${plantId} not found`
      });
    }

    res.json({
      success: true,
      message: 'Plant updated successfully',
      data: plant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/plants/:plantId
 * Decommission a plant
 */
router.delete('/:plantId', authenticate, async (req, res) => {
  try {
    const { plantId } = req.params;
    const success = await plantManager.decommissionPlant(plantId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: `Plant ${plantId} not found`
      });
    }

    res.json({
      success: true,
      message: `Plant ${plantId} decommissioned successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/plants/:plantId/telemetry
 * Get telemetry history for a plant
 */
router.get('/:plantId/telemetry', async (req, res) => {
  try {
    const { plantId } = req.params;
    const options = {
      limit: Math.min(parseInt(req.query.limit) || 100, 1000),
      offset: parseInt(req.query.offset) || 0,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      verdict: req.query.verdict
    };

    const telemetry = await plantManager.getPlantTelemetry(plantId, options);

    res.json({
      success: true,
      data: {
        plantId,
        telemetry,
        options
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
 * GET /api/v1/plants/:plantId/performance
 * Get performance metrics for a plant
 */
router.get('/:plantId/performance', async (req, res) => {
  try {
    const { plantId } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    const performance = await plantManager.getPlantPerformance(plantId, days);

    res.json({
      success: true,
      data: {
        plantId,
        days,
        performance
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
 * GET /api/v1/plants/:plantId/alerts
 * Get active alerts for a plant
 */
router.get('/:plantId/alerts', async (req, res) => {
  try {
    const { plantId } = req.params;
    const includeResolved = req.query.includeResolved === 'true';

    const alerts = await plantManager.getPlantAlerts(plantId, includeResolved);

    res.json({
      success: true,
      data: {
        plantId,
        alerts,
        total: alerts.length
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
 * POST /api/v1/plants/:plantId/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post('/:plantId/alerts/:alertId/acknowledge', authenticate, async (req, res) => {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy } = req.body;

    const success = await plantManager.acknowledgeAlert(
      parseInt(alertId),
      acknowledgedBy || req.user?.username
    );

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert acknowledged'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/plants/aggregate/summary
 * Get aggregated statistics across all plants
 */
router.get('/aggregate/summary', async (req, res) => {
  try {
    const summary = await plantManager.getAggregateSummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
