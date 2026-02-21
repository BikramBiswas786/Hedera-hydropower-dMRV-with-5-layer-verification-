'use strict';

const express = require('express');
const router = express.Router();
const { FeedbackStore } = require('../../storage/FeedbackStore');
const { authenticate } = require('../../middleware/auth');

// Initialize feedback store
const feedbackStore = new FeedbackStore('./data/feedback.json');

// Load existing feedback on startup
feedbackStore.load().catch(err => {
  console.error('[FeedbackAPI] Failed to load feedback:', err);
});

/**
 * POST /api/v1/feedback
 * Submit human feedback on ML predictions (Active Learning)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      readingId,
      originalLabel,
      correctLabel,
      confidence,
      reading,
      notes
    } = req.body;

    // Validation
    if (!readingId || !originalLabel || !correctLabel) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: readingId, originalLabel, correctLabel'
      });
    }

    if (!['anomaly', 'normal'].includes(originalLabel) || 
        !['anomaly', 'normal'].includes(correctLabel)) {
      return res.status(400).json({
        success: false,
        error: 'Labels must be "anomaly" or "normal"'
      });
    }

    // Add feedback
    const entry = await feedbackStore.addFeedback({
      readingId,
      originalLabel,
      correctLabel,
      confidence,
      reading,
      notes
    });

    res.json({
      success: true,
      message: 'Feedback recorded successfully',
      data: {
        feedbackId: entry.id,
        timestamp: entry.timestamp,
        needsRetraining: feedbackStore.getFeedback().length >= 50
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
 * GET /api/v1/feedback
 * Retrieve feedback entries with optional filters
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const filters = {
      correctLabel: req.query.correctLabel,
      confidence: req.query.confidence ? parseFloat(req.query.confidence) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : 100
    };

    const feedback = feedbackStore.getFeedback(filters);

    res.json({
      success: true,
      data: {
        feedback,
        total: feedback.length,
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
 * GET /api/v1/feedback/stats
 * Get performance statistics and confusion matrix
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = feedbackStore.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        metadata: {
          generatedAt: new Date().toISOString(),
          description: 'Model performance metrics based on human feedback'
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
 * GET /api/v1/feedback/insights
 * Get actionable insights and retraining recommendations
 */
router.get('/insights', async (req, res) => {
  try {
    const insights = feedbackStore.getInsights();
    const stats = feedbackStore.getStats();

    res.json({
      success: true,
      data: {
        insights,
        performance: {
          accuracy: stats.accuracy,
          f1Score: stats.f1Score,
          precision: stats.precision,
          recall: stats.recall
        },
        metadata: {
          totalFeedback: stats.total,
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
 * GET /api/v1/feedback/export
 * Export feedback data for model retraining
 */
router.get('/export', authenticate, async (req, res) => {
  try {
    const trainingData = feedbackStore.exportForTraining();

    res.json({
      success: true,
      data: {
        samples: trainingData,
        total: trainingData.length,
        format: {
          features: 'Original reading data',
          label: '1 for anomaly, 0 for normal',
          weight: 'Sample importance (higher for uncertain predictions)'
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          purpose: 'Model retraining with human-corrected labels'
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
 * DELETE /api/v1/feedback
 * Clear all feedback (admin only)
 */
router.delete('/', authenticate, async (req, res) => {
  try {
    // Additional admin check would go here
    const confirmToken = req.body.confirmToken;
    
    if (confirmToken !== 'CONFIRM_DELETE_ALL_FEEDBACK') {
      return res.status(400).json({
        success: false,
        error: 'Missing confirmation token. Send confirmToken: "CONFIRM_DELETE_ALL_FEEDBACK"'
      });
    }

    await feedbackStore.clear();

    res.json({
      success: true,
      message: 'All feedback cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
