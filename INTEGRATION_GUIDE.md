# 📘 Complete Integration Guide: 40% → 100%

**For AI Agents & Future Developers**  
**Repository:** https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv  
**Date:** February 21, 2026  
**Version:** 1.3.0 → 1.4.0

---

## 📊 Current Status Overview

| Feature | Current % | Missing Components | Time Estimate |
|---------|-----------|-------------------|---------------|
| Time-Series Forecasting | 40% | API endpoint, persistence, testing | 2-3 hours |
| Cluster Analysis | 40% | Pipeline integration, API | 2-3 hours |
| Active Learning | 40% | Feedback system, retraining | 4-6 hours |
| Carbon Marketplace | 30% | Real API integration | 4-6 hours |
| Multi-Plant Management | 30% | Database + API | 3-5 hours |
| Renewable Adapter | 40% | Solar/wind testing | 3-4 hours |

**Total Integration Time:** 19-27 hours  
**Result:** All features → 100% production-ready

---

## 🎯 Feature 1: Time-Series Forecasting (40% → 100%)

### Current State
- ✅ **Holt-Winters algorithm** fully implemented (Forecaster.js)
- ✅ Triple exponential smoothing (level, trend, seasonality)
- ✅ Confidence intervals (95% CI)
- ✅ Underperformance detection
- ❌ No API endpoint
- ❌ No persistent storage
- ❌ Not integrated with telemetry flow

### Step 1: Add Forecasting API Endpoints

**File:** `src/api/server.js`  
**Location:** Add before `// 404 handler` (around line 76)

```javascript
// ═══════════════════════════════════════════════════════════════
// 🔮 FORECASTING ENDPOINTS
// ═══════════════════════════════════════════════════════════════
const { Forecaster } = require('../ml/Forecaster');
const fs = require('fs').promises;
const path = require('path');

// Initialize forecaster
let forecaster = new Forecaster({ seasonLength: 24 });
const forecasterModelPath = path.join(__dirname, '../../data/forecaster-model.json');

// Load existing model on startup
(async () => {
  try {
    const modelData = await fs.readFile(forecasterModelPath, 'utf8');
    forecaster = Forecaster.fromJSON(JSON.parse(modelData));
    console.log('✅ Loaded forecaster model from disk');
  } catch (err) {
    console.log('ℹ️ No existing forecaster model, starting fresh');
  }
})();

// Train forecaster with historical data
app.post('/api/v1/forecast/train', async (req, res) => {
  try {
    const { readings } = req.body;
    
    if (!Array.isArray(readings)) {
      return res.status(400).json({ error: 'readings must be an array' });
    }

    if (readings.length < 48) {
      return res.status(400).json({ 
        error: 'Insufficient data for training',
        required: 48,
        provided: readings.length,
        hint: 'Need at least 48 hourly readings (2 seasons)'
      });
    }

    // Train model
    forecaster.train(readings);
    
    // Persist model to disk
    const modelJSON = forecaster.toJSON();
    await fs.mkdir(path.dirname(forecasterModelPath), { recursive: true });
    await fs.writeFile(forecasterModelPath, JSON.stringify(modelJSON, null, 2));
    
    res.json({
      status: 'success',
      message: `Trained forecaster with ${readings.length} readings`,
      model: {
        trained: true,
        alpha: modelJSON.alpha,
        beta: modelJSON.beta,
        gamma: modelJSON.gamma,
        seasonLength: modelJSON.seasonLength
      }
    });
  } catch (error) {
    console.error('[FORECAST] Training error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get forecast for next N hours
app.get('/api/v1/forecast', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    if (hours < 1 || hours > 168) {
      return res.status(400).json({ 
        error: 'hours must be between 1 and 168 (1 week)' 
      });
    }

    if (!forecaster.trained) {
      return res.status(400).json({
        error: 'Model not trained',
        hint: 'POST training data to /api/v1/forecast/train first'
      });
    }

    const predictions = forecaster.predict(hours);
    
    res.json({
      status: 'success',
      hoursAhead: hours,
      forecasts: predictions,
      model: {
        trained: true,
        seasonLength: forecaster.seasonLength
      }
    });
  } catch (error) {
    console.error('[FORECAST] Prediction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check underperformance against forecast
app.post('/api/v1/forecast/check', async (req, res) => {
  try {
    const { actualGeneration, forecastStep } = req.body;
    
    if (!actualGeneration || !forecastStep) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['actualGeneration', 'forecastStep']
      });
    }

    if (!forecaster.trained) {
      return res.status(400).json({
        error: 'Model not trained'
      });
    }

    const result = forecaster.checkUnderperformance(actualGeneration, forecastStep);
    
    res.json({
      status: 'success',
      ...result
    });
  } catch (error) {
    console.error('[FORECAST] Check error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ Forecasting endpoints enabled: /api/v1/forecast/*');
```

### Step 2: Create Forecasting Tests

**File:** `test/api/forecast.test.js` (create new file)

```javascript
'use strict';

const request = require('supertest');
const app = require('../../src/api/server');
const { expect } = require('chai');

describe('Forecasting API Integration', () => {
  // Generate 50 hours of synthetic data
  const trainingData = Array.from({ length: 50 }, (_, i) => ({
    timestamp: Date.now() - (50 - i) * 3600000,
    generatedKwh: 800 + Math.sin(i / 12) * 200 + Math.random() * 50
  }));

  describe('POST /api/v1/forecast/train', () => {
    it('should train forecaster with valid data', async () => {
      const res = await request(app)
        .post('/api/v1/forecast/train')
        .send({ readings: trainingData })
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.model.trained).to.be.true;
      expect(res.body.model.seasonLength).to.equal(24);
    });

    it('should reject training with insufficient data', async () => {
      const res = await request(app)
        .post('/api/v1/forecast/train')
        .send({ readings: trainingData.slice(0, 10) })
        .expect(400);

      expect(res.body.error).to.include('Insufficient');
    });

    it('should reject non-array input', async () => {
      const res = await request(app)
        .post('/api/v1/forecast/train')
        .send({ readings: 'not an array' })
        .expect(400);

      expect(res.body.error).to.include('array');
    });
  });

  describe('GET /api/v1/forecast', () => {
    before(async () => {
      await request(app)
        .post('/api/v1/forecast/train')
        .send({ readings: trainingData });
    });

    it('should generate 24-hour forecast', async () => {
      const res = await request(app)
        .get('/api/v1/forecast?hours=24')
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.forecasts).to.have.lengthOf(24);
      expect(res.body.forecasts[0]).to.have.all.keys(
        'step', 'forecast', 'lower', 'upper'
      );
    });

    it('should reject invalid hour range', async () => {
      await request(app)
        .get('/api/v1/forecast?hours=200')
        .expect(400);
    });

    it('should default to 24 hours if not specified', async () => {
      const res = await request(app)
        .get('/api/v1/forecast')
        .expect(200);

      expect(res.body.hoursAhead).to.equal(24);
    });
  });

  describe('POST /api/v1/forecast/check', () => {
    before(async () => {
      await request(app)
        .post('/api/v1/forecast/train')
        .send({ readings: trainingData });
    });

    it('should detect underperformance', async () => {
      const res = await request(app)
        .post('/api/v1/forecast/check')
        .send({ actualGeneration: 500, forecastStep: 1 })
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body).to.have.property('underperforming');
      expect(res.body).to.have.property('severity');
      expect(res.body).to.have.property('deltaPercent');
    });

    it('should handle normal performance', async () => {
      const res = await request(app)
        .post('/api/v1/forecast/check')
        .send({ actualGeneration: 850, forecastStep: 1 })
        .expect(200);

      expect(res.body.severity).to.equal('NORMAL');
    });
  });
});
```

### Completion Checklist
- [ ] Add API endpoints to `src/api/server.js`
- [ ] Create `test/api/forecast.test.js`
- [ ] Run tests: `npm test -- test/api/forecast.test.js`
- [ ] Update `docs/API.md` with forecasting endpoints
- [ ] Test with real telemetry data
- [ ] Update feature status to 100%

---

## 🎯 Feature 2: Cluster Analysis (40% → 100%)

### Current State
- ✅ **K-means clustering** fully implemented (AnomalyClusterer.js)
- ✅ Auto-naming of clusters
- ✅ Convergence detection
- ❌ Not integrated with fraud detection
- ❌ No API endpoint

### Step 1: Integrate with MLAnomalyDetector

**File:** `src/ml/MLAnomalyDetector.js`  
**Location:** Add these methods to the class

```javascript
// Add at top with other requires
const { AnomalyClusterer } = require('./AnomalyClusterer');

// Add to constructor
constructor() {
  // ... existing code ...
  this.anomalyHistory = [];
  this.clusterer = null;
}

/**
 * Track anomaly in history for clustering
 */
async detectAnomaly(reading) {
  const result = await super.detectAnomaly(reading);
  
  // Store flagged readings in history
  if (result.trust_score < 0.85) {
    this.anomalyHistory.push({
      timestamp: Date.now(),
      reading,
      trust_score: result.trust_score,
      physics_score: result.physics_score,
      temporal_score: result.temporal_score,
      environmental_score: result.environmental_score,
      generatedKwh: reading.generatedKwh || 0
    });

    // Keep only last 500 anomalies
    if (this.anomalyHistory.length > 500) {
      this.anomalyHistory = this.anomalyHistory.slice(-500);
    }
  }

  return result;
}

/**
 * Cluster recent anomalies to identify patterns
 */
async clusterAnomalies(limit = 100) {
  const recentAnomalies = this.anomalyHistory.slice(-limit);

  if (recentAnomalies.length < 4) {
    return {
      status: 'insufficient_data',
      message: 'Need at least 4 anomalies for clustering',
      count: recentAnomalies.length
    };
  }

  // Extract feature vectors
  const anomaliesWithFeatures = recentAnomalies.map(anomaly => ({
    ...anomaly,
    features: this._extractFeatureVector(anomaly.reading)
  }));

  // Perform clustering
  this.clusterer = new AnomalyClusterer({ k: 4 });
  this.clusterer.fit(anomaliesWithFeatures);

  // Get cluster statistics
  const stats = this.clusterer.getClusterStats(anomaliesWithFeatures);

  // Classify each anomaly
  const classified = anomaliesWithFeatures.map(anomaly => ({
    timestamp: anomaly.timestamp,
    trust_score: anomaly.trust_score,
    cluster: this.clusterer.classify(anomaly)
  }));

  return {
    status: 'success',
    totalAnomalies: classified.length,
    clusters: stats,
    samples: classified.slice(0, 10) // First 10 as examples
  };
}

/**
 * Extract feature vector for clustering
 */
_extractFeatureVector(reading) {
  return [
    reading.flowRate || 0,
    reading.headHeight || 0,
    reading.generatedKwh || 0,
    reading.pH || 7.0,
    reading.turbidity || 5.0,
    reading.temperature || 20.0,
    reading.powerDensity || 0,
    reading.efficiencyRatio || 0
  ].map(v => parseFloat(v));
}
```

### Step 2: Add Clustering API Endpoint

**File:** `src/api/server.js`  
**Location:** Add after forecasting endpoints

```javascript
// ═══════════════════════════════════════════════════════════════
// 🧩 CLUSTERING ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get('/api/v1/anomalies/clusters', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    if (limit < 4 || limit > 500) {
      return res.status(400).json({
        error: 'limit must be between 4 and 500'
      });
    }

    // Access ML detector from workflow (you may need to adjust based on your setup)
    const result = await mlDetector.clusterAnomalies(limit);

    res.json(result);
  } catch (error) {
    console.error('[CLUSTER] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ Clustering endpoint enabled: /api/v1/anomalies/clusters');
```

### Completion Checklist
- [ ] Update `MLAnomalyDetector.js` with clustering methods
- [ ] Add clustering API endpoint
- [ ] Test with 100+ anomalies
- [ ] Document cluster patterns
- [ ] Update feature status to 100%

---

## 🎯 Feature 3: Active Learning (40% → 100%)

### Step 1: Create Feedback Storage

**File:** `src/storage/FeedbackStore.js` (create new file)

```javascript
'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Feedback Storage for Active Learning
 * Stores human corrections to ML predictions
 */
class FeedbackStore {
  constructor(filePath = './data/feedback.json') {
    this.filePath = path.resolve(filePath);
    this.feedback = [];
  }

  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      this.feedback = JSON.parse(data);
      console.log(`✅ Loaded ${this.feedback.length} feedback entries`);
    } catch (err) {
      console.log('ℹ️ No existing feedback file, starting fresh');
      this.feedback = [];
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.feedback, null, 2)
    );
  }

  async addFeedback(entry) {
    this.feedback.push({
      ...entry,
      timestamp: Date.now(),
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    await this.save();
  }

  getFeedback(filters = {}) {
    let result = this.feedback;

    if (filters.correctLabel !== undefined) {
      result = result.filter(f => f.correctLabel === filters.correctLabel);
    }

    if (filters.confidence !== undefined) {
      result = result.filter(f => (f.confidence || 1.0) < filters.confidence);
    }

    if (filters.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  getStats() {
    const stats = {
      total: this.feedback.length,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0
    };

    this.feedback.forEach(f => {
      if (f.originalLabel === 'anomaly' && f.correctLabel === 'anomaly') {
        stats.truePositives++;
      } else if (f.originalLabel === 'anomaly' && f.correctLabel === 'normal') {
        stats.falsePositives++;
      } else if (f.originalLabel === 'normal' && f.correctLabel === 'anomaly') {
        stats.falseNegatives++;
      } else if (f.originalLabel === 'normal' && f.correctLabel === 'normal') {
        stats.trueNegatives++;
      }
    });

    // Calculate metrics
    const precision = stats.truePositives / (stats.truePositives + stats.falsePositives) || 0;
    const recall = stats.truePositives / (stats.truePositives + stats.falseNegatives) || 0;
    const accuracy = (stats.truePositives + stats.trueNegatives) / stats.total || 0;

    return {
      ...stats,
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      accuracy: parseFloat(accuracy.toFixed(4))
    };
  }
}

module.exports = { FeedbackStore };
```

### Step 2: Add Active Learning API Endpoints

**File:** `src/api/server.js`  
**Location:** Add after clustering endpoints

```javascript
// ═══════════════════════════════════════════════════════════════
// 🎓 ACTIVE LEARNING ENDPOINTS
// ═══════════════════════════════════════════════════════════════
const { FeedbackStore } = require('../storage/FeedbackStore');

const feedbackStore = new FeedbackStore();

// Load feedback on startup
(async () => {
  await feedbackStore.load();
  console.log('✅ Feedback store initialized');
})();

// Submit feedback on a prediction
app.post('/api/v1/feedback', async (req, res) => {
  try {
    const { readingId, originalLabel, correctLabel, confidence, reading, notes } = req.body;

    if (!readingId || !originalLabel || !correctLabel) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['readingId', 'originalLabel', 'correctLabel']
      });
    }

    await feedbackStore.addFeedback({
      readingId,
      originalLabel,
      correctLabel,
      confidence: confidence || null,
      reading: reading || null,
      notes: notes || null
    });

    const stats = feedbackStore.getStats();

    // Trigger retraining notification if threshold reached
    if (stats.total >= 50 && stats.total % 50 === 0) {
      console.log(`[ACTIVE LEARNING] 🔄 ${stats.total} feedback entries collected - Consider retraining model`);
    }

    res.json({
      status: 'success',
      message: 'Feedback recorded successfully',
      stats
    });
  } catch (error) {
    console.error('[FEEDBACK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get feedback statistics
app.get('/api/v1/feedback/stats', async (req, res) => {
  try {
    const stats = feedbackStore.getStats();
    res.json({
      status: 'success',
      ...stats
    });
  } catch (error) {
    console.error('[FEEDBACK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent feedback entries
app.get('/api/v1/feedback', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const feedback = feedbackStore.getFeedback({ limit });

    res.json({
      status: 'success',
      count: feedback.length,
      feedback
    });
  } catch (error) {
    console.error('[FEEDBACK] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log('✅ Active learning endpoints enabled: /api/v1/feedback/*');
```

### Completion Checklist
- [ ] Create `src/storage/FeedbackStore.js`
- [ ] Add feedback API endpoints
- [ ] Test feedback submission workflow
- [ ] Document feedback format
- [ ] Update feature status to 100%

---

## 🎯 Feature 4: Carbon Marketplace (30% → 100%)

### Integration Steps

**File:** `src/carbon/MarketplaceConnector.js`  
**What to update:**

1. Register accounts:
   - Verra Registry: https://registry.verra.org/
   - Gold Standard: https://www.goldstandard.org/

2. Get API credentials and update `.env`:
```
VERRA_API_KEY=your_key_here
VERRA_API_SECRET=your_secret
GOLD_STANDARD_API_KEY=your_key
```

3. Replace mock methods with real API calls

**Time:** 4-6 hours (depends on vendor approval)

---

## 🎯 Feature 5: Multi-Plant Management (30% → 100%)

### Database Schema

**File:** Create `migrations/001_multi_plant.sql`

```sql
-- Plants table
CREATE TABLE IF NOT EXISTS plants (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  capacity_mw DECIMAL(10,2) NOT NULL,
  commissioned_date DATE,
  operator VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Plant telemetry
CREATE TABLE IF NOT EXISTS plant_telemetry (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(50) REFERENCES plants(plant_id) ON DELETE CASCADE,
  reading JSONB NOT NULL,
  trust_score DECIMAL(5,4),
  hedera_tx_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_plant_telemetry_plant ON plant_telemetry(plant_id);
CREATE INDEX idx_plant_telemetry_created ON plant_telemetry(created_at);
CREATE INDEX idx_plants_status ON plants(status);
```

### API Endpoints

Add to `src/api/server.js`:

```javascript
// Multi-plant management endpoints
app.post('/api/v1/plants', async (req, res) => {
  // Register new plant
});

app.get('/api/v1/plants', async (req, res) => {
  // List all plants
});

app.get('/api/v1/plants/:id/metrics', async (req, res) => {
  // Get plant-specific metrics
});

app.get('/api/v1/plants/aggregate', async (req, res) => {
  // Aggregated statistics across all plants
});
```

**Time:** 3-5 hours

---

## 🎯 Feature 6: Renewable Adapter (40% → 100%)

### Add Validation Rules

**File:** `src/renewable/RenewableAdapter.js`

Add methods for each energy type:

```javascript
validateSolar(reading) {
  // Irradiance: 200-1000 W/m²
  // Panel efficiency: 15-22%
  // Temperature coefficient validation
}

validateWind(reading) {
  // Wind speed: 3-25 m/s (cut-in to cut-out)
  // Turbine RPM validation
  // Power curve validation
}

validateBiomass(reading) {
  // Fuel consumption rate
  // Combustion efficiency: 70-90%
  // Emissions validation
}
```

**Time:** 3-4 hours

---

## 📋 Master Integration Checklist

```markdown
## Forecasting (40% → 100%)
- [ ] Add API endpoints ✅
- [ ] Create tests ✅
- [ ] Test with 50+ readings
- [ ] Update docs
- [ ] Mark as 100%

## Clustering (40% → 100%)
- [ ] Update MLAnomalyDetector ✅
- [ ] Add API endpoint ✅
- [ ] Test with anomalies
- [ ] Mark as 100%

## Active Learning (40% → 100%)
- [ ] Create FeedbackStore ✅
- [ ] Add endpoints ✅
- [ ] Test feedback loop
- [ ] Mark as 100%

## Marketplace (30% → 100%)
- [ ] Get API credentials
- [ ] Implement OAuth
- [ ] Test sandbox
- [ ] Mark as 100%

## Multi-Plant (30% → 100%)
- [ ] Create DB schema ✅
- [ ] Add CRUD endpoints
- [ ] Test aggregation
- [ ] Mark as 100%

## Renewable Adapter (40% → 100%)
- [ ] Add solar validation
- [ ] Add wind validation
- [ ] Test each type
- [ ] Mark as 100%

## Final Steps
- [ ] Update /api/features with 100%
- [ ] Run all tests
- [ ] Update STATUS.md
- [ ] Tag v1.4.0
- [ ] Create demo
```

---

## 🤖 AI Agent Quick Start Prompt

```
Complete [FEATURE_NAME] integration in Hedera Hydropower MRV.

Repo: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv

Steps:
1. Read existing code in [FILE_PATH]
2. Implement missing [COMPONENTS]
3. Add API endpoints
4. Write tests
5. Update documentation

Follow INTEGRATION_GUIDE.md!
```

---

**Guide Complete!** All features can now reach 100% by following these steps systematically. 🚀
