# Development Setup Guide - Hedera Hydropower dMRV

**Quick setup for local development and testing**

---

## Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 9+
- **Git**
- **Redis** (optional, for replay protection)
- **Hedera Testnet Account** ([Get Free Account](https://portal.hedera.com/register))

---

## Quick Start (5 Minutes)

### Step 1: Clone Repository

```bash
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

#### Option A: Use Demo Credentials (Fastest)

```bash
# Copy production testnet credentials
cp .env.production .env
```

This uses the **shared testnet account** with live HCS topic 0.0.7462776.

#### Option B: Use Your Own Hedera Account

1. **Get Testnet Account**: Visit [portal.hedera.com](https://portal.hedera.com/register)
2. **Copy credentials** from Testnet tab
3. **Create `.env` file**:

```bash
# Hedera Configuration
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT_ID
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420YOUR_PRIVATE_KEY

# API Configuration
VALID_API_KEYS=demo_key_001,demo_key_002
API_PORT=3000

# Verification Thresholds
APPROVAL_THRESHOLD=0.90
MANUAL_REVIEW_THRESHOLD=0.50

# Redis (Optional)
REDIS_URL=redis://localhost:6379
```

### Step 4: Start API Server

```bash
npm run api
```

**Expected Output:**
```
[API] Server started on port 3000
[EngineV1] Initialized with Hedera account: 0.0.6255927
[EngineV1] HCS Topic: 0.0.7462776
[API] Health check available at: http://localhost:3000/health
```

### Step 5: Verify Setup

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":1740000000000,"uptime":5.2,"version":"1.0.0"}
```

✅ **Setup Complete!** Your local server is now connected to Hedera testnet.

---

## Testing

### Run All Tests

```bash
npm test
```

**Expected**: 237 tests passing, 85%+ coverage

### Run Production Test Suite

```bash
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\RUN_TESTS.ps1

# Linux/Mac
bash RUN_TESTS.sh
```

This runs the **6 production scenarios** (PS1-PS6):
- PS1: Valid telemetry → APPROVED
- PS2: Fraud detection → FLAGGED
- PS3: Environmental violations → REJECTED
- PS4: Zero-flow protection → REJECTED
- PS5: Multi-plant isolation → PASS
- PS6: Replay protection → REJECTED

### Run Coverage Report

```bash
npm run test:coverage

# Open coverage report
open coverage/lcov-report/index.html  # Mac
start coverage/lcov-report/index.html # Windows
```

---

## API Testing

### Submit Valid Telemetry

```bash
curl -X POST http://localhost:3000/api/v1/telemetry \
  -H "x-api-key: demo_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "PLANT-HP-001",
    "device_id": "TURBINE-1",
    "readings": {
      "flowRate": 2.5,
      "head": 45,
      "generatedKwh": 900,
      "timestamp": '$(date +%s)'000,
      "pH": 7.2,
      "turbidity": 10
    }
  }'
```

**Expected Response:**
```json
{
  "status": "APPROVED",
  "trust_score": 1.0,
  "reading_id": "RDG-PLANT-HP-001-XXXXX",
  "carbon_credits": {
    "amount_tco2e": 0.72,
    "methodology": "ACM0002"
  },
  "hedera": {
    "transaction_id": "0.0.6255927@1740000000.123456789",
    "topic_id": "0.0.7462776",
    "hashscan_url": "https://hashscan.io/testnet/transaction/..."
  }
}
```

### Test Fraud Detection

```bash
curl -X POST http://localhost:3000/api/v1/telemetry \
  -H "x-api-key: demo_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "PLANT-HP-001",
    "device_id": "TURBINE-1",
    "readings": {
      "flowRate": 2.5,
      "head": 45,
      "generatedKwh": 9000,
      "timestamp": '$(date +%s)'000,
      "pH": 7.2,
      "turbidity": 10
    }
  }'
```

**Expected Response:**
```json
{
  "status": "FLAGGED",
  "trust_score": 0.65,
  "verification_details": {
    "physics_check": "FAIL"
  },
  "carbon_credits": null
}
```

---

## Development Workflow

### Project Structure

```
Hedera-hydropower-dMRV-with-5-layer-verification-/
├── src/
│   ├── api/                 # Express API server
│   │   ├── server.js       # Main server file
│   │   └── routes/         # API route handlers
│   ├── engine/
│   │   └── v1/
│   │       └── engine-v1.js # 5-layer verification engine
│   ├── hedera/             # Hedera blockchain integration
│   │   ├── hcs-client.js   # HCS topic management
│   │   └── hts-client.js   # HTS token operations
│   ├── verification/       # Verification logic
│   │   ├── physics.js      # Hydropower physics validation
│   │   ├── temporal.js     # Time-series consistency
│   │   ├── environmental.js # Water quality bounds
│   │   ├── statistical.js  # Anomaly detection (3-sigma)
│   │   └── device.js       # Device profile validation
│   └── carbon/             # ACM0002 calculations
│       └── acm0002.js      # Carbon credit methodology
├── tests/                  # Jest test suites
├── scripts/                # Utility scripts
├── docs/                   # Documentation
└── evidence/               # Test evidence files
```

### Making Changes

1. **Create feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and test**:
   ```bash
   npm test
   npm run test:coverage
   ```

3. **Commit with clear message**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

4. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style

- **Linting**: ESLint configuration included
- **Formatting**: Prettier recommended
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/)

---

## Debugging

### Enable Debug Logging

```bash
# In .env
LOG_LEVEL=debug
```

### Common Issues

#### "Hedera credentials missing, running in mock mode"

**Cause**: `.env` file missing or invalid credentials  
**Fix**: Copy `.env.production` or add valid Hedera credentials

#### "INSUFFICIENT_TX_FEE" error

**Cause**: Testnet account has insufficient HBAR balance  
**Fix**: Fund your account at [portal.hedera.com](https://portal.hedera.com)

#### "Port 3000 already in use"

**Cause**: Another process is using port 3000  
**Fix**: Kill the process or change `API_PORT` in `.env`

```bash
# Linux/Mac
lsof -ti:3000 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

#### "Redis connection failed"

**Cause**: Redis not running (optional service)  
**Fix**: Either start Redis or disable replay protection:

```bash
# In .env
REDIS_URL=  # Leave empty to disable
```

---

## Architecture Overview

```
┌────────────────────────────────────────────────────┐
│  IoT Sensors (Flow, Head, Generation, Water Quality)  │
└────────────────────────┬───────────────────────────┘
                         │
                         │ REST API (Node.js/Express)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   [Input Validation]  [Replay Check]  [5-Layer Verification]
          │              │              │
          │              │        Trust Score (0-1.0)
          │              │              │
          └──────────────┼──────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    [HCS Audit Log] [ACM0002 Calc] [HREC Minting]
          │              │              │
          └──────────────┴──────────────┘
                         │
                  Hedera Network
```

**Verification Layers**:
1. **Physics** (30%) — Hydropower equation: P = ρ×g×Q×H×η
2. **Temporal** (25%) — Time-series consistency checks
3. **Environmental** (20%) — Water quality bounds (pH, turbidity, temp)
4. **Statistical** (15%) — 3-sigma outlier detection
5. **Device** (10%) — Device profile validation

---

## Production Deployment

### Switch to Mainnet

1. **Update `.env`**:
   ```bash
   HEDERA_NETWORK=mainnet
   HEDERA_OPERATOR_ID=0.0.YOUR_MAINNET_ACCOUNT
   HEDERA_OPERATOR_KEY=YOUR_MAINNET_PRIVATE_KEY
   ```

2. **Increase transaction fees** (mainnet costs more):
   ```javascript
   // In src/hedera/hcs-client.js
   client.setDefaultMaxTransactionFee(new Hbar(10));
   ```

3. **Enable production security**:
   - Store private keys in secrets manager (AWS Secrets Manager, HashiCorp Vault)
   - Enable HTTPS
   - Add rate limiting
   - Enable authentication
   - Add monitoring (Grafana)

### Security Checklist

- [ ] Private keys stored in environment variables
- [ ] `.env` file in `.gitignore`
- [ ] API key authentication enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] HTTPS/TLS enabled
- [ ] Monitoring and alerting setup
- [ ] Error messages don't leak sensitive data
- [ ] Input validation on all endpoints
- [ ] Redis replay protection enabled

---

## Resources

### Documentation
- [Quick Start Guide](./QUICK_START.md) — 5-minute setup
- [API Documentation](./docs/API.md) — REST endpoints
- [Methodology](./docs/METHODOLOGY.md) — Verification logic
- [Architecture](./docs/ARCHITECTURE.md) — System design
- [Testing Guide](./TESTING_GUIDE.md) — Running tests

### External Links
- **Hedera Docs**: [docs.hedera.com](https://docs.hedera.com)
- **HashScan Explorer**: [hashscan.io/testnet](https://hashscan.io/testnet)
- **Portal**: [portal.hedera.com](https://portal.hedera.com)
- **Live Demo**: [hydropower-mrv-19feb26.vercel.app](https://hydropower-mrv-19feb26.vercel.app)

### Support
- **Issues**: [GitHub Issues](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/issues)
- **Discussions**: [GitHub Discussions](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/discussions)

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

---

## License

MIT License - see [LICENSE](./LICENSE)

---

**Last Updated**: March 4, 2026  
**Maintainer**: [@BikramBiswas786](https://github.com/BikramBiswas786)
