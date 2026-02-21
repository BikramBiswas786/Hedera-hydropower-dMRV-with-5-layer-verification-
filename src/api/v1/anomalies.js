'use strict';

const express = require('express');
const router = express.Router();
const { AnomalyClusterer } = require('../../ml/AnomalyClusterer');
const { authenticate } = require('../../middleware/auth');

// In-memory storage (replace with database in production)
let clustererInstance = null;
const anomalyHistory = [];

/**
 * POST /api/v1/anomalies/train
 * Train clustering model on historical anomalies
 */
router.post('/train', authenticate, async (req, res) => {
  try {
    const { anomalies, options } = req.body;

    if (!anomalies || !Array.isArray(anomalies)) {
      return res.status(400).json({
        success: false,
        error: 'anomalies array required'
      });
    }

    if (anomalies.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 4 anomalies to cluster'
      });
    }

    // Create new clusterer instance
    clustererInstance = new AnomalyClusterer(options || {});
    
    // Train model
    clustererInstance.fit(anomalies);
    
    // Store anomaly history
    anomalyHistory.push(...anomalies);

    res.json({
      success: true,
      message: 'Anomaly clusterer trained successfully',
      data: {
        trainingSamples: anomalies.length,
        clusters: clustererInstance.k,
        clusterNames: clustererInstance.clusterNames,
        modelState: clustererInstance.toJSON()
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
 * POST /api/v1/anomalies/classify
 * Classify a new anomaly into a cluster
 */
router.post('/classify', authenticate, async (req, res) => {
  try {
    if (!clustererInstance || !clustererInstance.trained) {
      return res.status(400).json({
        success: false,
        error: 'Model not trained. Call /train endpoint first.'
      });
    }

    const { anomaly } = req.body;

    if (!anomaly || !anomaly.features) {
      return res.status(400).json({
        success: false,
        error: 'anomaly object with features array required'
      });
    }

    const classification = clustererInstance.classify(anomaly);

    res.json({
      success: true,
      data: classification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/anomalies/clusters
 * Get cluster statistics and patterns
 */
router.get('/clusters', async (req, res) => {
  try {
    if (!clustererInstance || !clustererInstance.trained) {
      return res.status(400).json({
        success: false,
        error: 'Model not trained. Call /train endpoint first.'
      });
    }

    if (anomalyHistory.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No anomaly history available'
      });
    }

    const stats = clustererInstance.getClusterStats(anomalyHistory);

    res.json({
      success: true,
      data: {
        totalAnomalies: anomalyHistory.length,
        clusters: stats,
        metadata: {
          algorithm: 'K-means',
          k: clustererInstance.k,
          generatedAt: new Date().toISOString()
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
 * GET /api/v1/anomalies/history
 * Get anomaly history with pagination
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const total = anomalyHistory.length;
    const pageData = anomalyHistory.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        anomalies: pageData,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
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
 * GET /api/v1/anomalies/model
 * Get current clustering model state
 */
router.get('/model', async (req, res) => {
  try {
    if (!clustererInstance) {
      return res.status(404).json({
        success: false,
        error: 'No model loaded'
      });
    }

    res.json({
      success: true,
      data: clustererInstance.toJSON()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
