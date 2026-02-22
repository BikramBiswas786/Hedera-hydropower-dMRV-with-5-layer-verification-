# Features - Hedera Hydropower MRV

This document describes the implemented features organized by functional area.

---

## Infrastructure

### Docker and Production Config

**Files:**
- `Dockerfile` - Multi-stage build with Alpine Linux (~150 MB)
- `docker-compose.yml` - Full stack (API, Redis, PostgreSQL, Prometheus, Grafana)
- `.env.example` - Production environment template
- `scripts/init-db.sql` - PostgreSQL schema with indexes

**Notes:**
- Health checks on all services
- Non-root user for security
- ML model training runs automatically during build
- Named volumes for data persistence
- Network isolation between services

**Start the stack:**
```bash
cp .env.example .env
docker-compose up -d
```

---

### API Authentication and Rate Limiting

**Files:**
- `src/middleware/auth.js` - JWT + API key authentication
- `src/middleware/rateLimiter.js` - Redis-backed sliding window

**Authentication methods:**
1. JWT tokens - For dashboard users (expires 7 days)
2. API keys - For device telemetry (HMAC-SHA256 hashed)
3. Role-based access - admin, operator, auditor, viewer

**Rate limits:**
- Anonymous: 100 req / 15 min
- Authenticated: 1000 req / 15 min
- Devices: 10,000 req / hour

**Notes:**
- Falls back to in-memory store if Redis is unavailable
- Returns `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers
- bcrypt password hashing (cost 10)

---

### Database Schema (PostgreSQL)

**Tables:**
- `devices` - Registered hydropower devices
- `readings` - Time-series telemetry (indexed by timestamp)
- `attestations` - MRV verification results with HCS transaction IDs
- `ml_models` - ML model audit trail (hash, metrics, Hedera sequence)
- `carbon_credits` - REC issuance records
- `users` - Dashboard users with roles

**Notes:**
- JSONB columns for flexible data
- Foreign keys with CASCADE
- Composite indexes for query performance
- UUID primary keys
- Timestamps with timezone

---

## Machine Learning

### Time-Series Forecasting

**File:** `src/ml/Forecaster.js`

**Algorithm:** Triple Exponential Smoothing (Holt-Winters)
- Handles trend (increasing/decreasing generation)
- Handles seasonality (monsoon cycles, 24-hour patterns)
- Predicts next 24 hours of generation
- 95% confidence intervals

**Notes:**
- Detects underperformance (actual < forecast by 5%+)
- Alerts operators to maintenance needs
- Model state can be exported and imported

**Example:**
```javascript
const forecaster = new Forecaster();
forecaster.train(historicalReadings);
const forecast = forecaster.predict(24);
const check = forecaster.checkUnderperformance(actualKwh, 1);
// { underperforming: true, severity: 'HIGH', deltaPercent: -15.2 }
```

---

### Anomaly Clustering

**File:** `src/ml/AnomalyClusterer.js`

**Algorithm:** K-means clustering on anomaly feature vectors
- Groups similar anomalies (fraud, sensor fault, environmental, normal variance)
- Unsupervised - no labels required
- Automatic cluster naming

**Notes:**
- Classifies new anomalies into known patterns
- Confidence scoring based on distance to centroid
- Cluster statistics (size, percentage, centroid coordinates)

**Generated cluster names:**
- `fraud_high_efficiency`
- `generation_spike`
- `environmental_anomaly`
- `power_density_outlier`

---

### Active Learning Loop

**File:** `src/ml/ActiveLearner.js`

**How it works:**
- Operators label flagged readings (approve/reject/uncertain)
- Model retrains automatically after 50+ feedbacks
- Tracks false positive rate
- Reports precision, recall, F1 metrics

**Notes:**
- Prioritizes uncertain cases for human review
- Auto-retrain trigger when FP rate exceeds 30%
- Integrates with metrics dashboard

**Feedback types:**
- `true_positive` - Correctly flagged fraud
- `false_positive` - Wrongly flagged normal reading
- `false_negative` - Missed fraud
- `true_negative` - Correctly approved normal reading

---

## Carbon Markets

### Carbon Marketplace Integration

**File:** `src/carbon/MarketplaceConnector.js`

**Integrations:**
- Verra Registry
- Gold Standard
- Carbon price APIs (real-time spot pricing)

**Notes:**
- Submits verified RECs for certification automatically
- Tracks REC prices in USD per tCO2e
- Calculates revenue projections in USD and INR
- Supports batch REC retirement

**Example:**
```javascript
const connector = new MarketplaceConnector();
const result = await connector.submitToVerra(attestations);
const price = await connector.getCurrentPrice();
const revenue = await connector.calculateRevenue(100); // 100 tCO2e
```

---

### Investor Dashboard

**File:** `src/dashboard/InvestorDashboard.js`

**Public-facing metrics** (no sensitive operational data):
- Real-time MWh generation counter
- Total CO2 offset since inception
- Uptime percentage
- Monthly generation charts
- Impact metrics (equivalent cars, homes powered, trees)

**Endpoint:**
```http
GET /api/public/metrics
```

---

### Multi-Plant Fleet Management

**File:** `src/multi-plant/PlantManager.js`

**Notes:**
- Manages 10+ hydropower plants
- Aggregates statistics across the fleet
- Comparative analytics (plant vs. plant efficiency)
- Regional breakdown by monsoon pattern

**Example:**
```javascript
const manager = new PlantManager();
manager.registerPlant('HYDRO-001', { name: 'Pune Plant', capacity_mw: 6, region: 'Maharashtra' });
const fleet = manager.getFleetStats();
const comparison = manager.comparePlants('HYDRO-001', 'HYDRO-002');
```

---

## Geographic Expansion

### Renewable Source Adapters

**File:** `src/renewable/RenewableAdapter.js`

**Supported sources:**
1. Hydropower (native)
2. Solar - irradiance, panel temperature, inverter efficiency
3. Wind - wind speed, direction, blade RPM, hub height
4. Biomass - fuel type, combustion temperature, moisture content

**Notes:**
- Normalizes telemetry to a standard format
- Source-specific efficiency calculations
- Same MRV engine handles all source types

---

### Localization

**Files:**
- `src/locales/hi.json` - Hindi
- `src/locales/ta.json` - Tamil
- `src/locales/te.json` - Telugu
- `src/middleware/i18n.js` - Translation middleware

**Notes:**
- Language auto-detected from `Accept-Language` header
- INR currency formatting
- DD/MM/YYYY date format
- Asia/Kolkata timezone

---

## Monitoring and Security

### Prometheus and Grafana

**Files:**
- `src/monitoring/PrometheusMetrics.js` - Metrics exporter
- `monitoring/prometheus.yml` - Prometheus config
- `monitoring/grafana/dashboards/mrv-dashboard.json` - Pre-built dashboard

**Tracked metrics:**
- `mrv_readings_total`
- `mrv_readings_approved`
- `mrv_readings_flagged`
- `mrv_anomalies_detected`
- `mrv_hedera_tx_success`
- `mrv_api_latency_avg`

**Grafana panels:** total readings, anomaly rate, Hedera TX success rate, trust score distribution, API latency

Access Grafana at `http://localhost:3001` (default credentials in `.env.example`).

---

### Multi-Signature Wallet

**File:** `src/security/MultiSigWallet.js`

**2-of-3 signature requirement:**
- Signer 1: Project owner
- Signer 2: Third-party auditor
- Signer 3: Regulatory authority

**Notes:**
- REC minting requires threshold signatures before execution
- Prevents unilateral changes

---

### Security Auditor

**File:** `src/security/SecurityAuditor.js`

Runs checks against OWASP Top 10 categories: SQL injection, XSS, authentication, sensitive data exposure, access control, security misconfiguration, insecure deserialization, logging, and SSRF.

```javascript
const auditor = new SecurityAuditor();
const report = auditor.runFullAudit();
```

---

## Summary

| Area | Count |
|------|-------|
| ML algorithms | 4 (Isolation Forest, Holt-Winters, K-means, Active Learning) |
| API endpoints | 20+ |
| Docker services | 5 (API, Redis, PostgreSQL, Prometheus, Grafana) |
| Supported languages | 4 (English, Hindi, Tamil, Telugu) |
| Renewable source types | 4 (Hydro, Solar, Wind, Biomass) |
| OWASP security checks | 10 |

See [DEPLOYMENT.md](DEPLOYMENT.md) for setup instructions.
