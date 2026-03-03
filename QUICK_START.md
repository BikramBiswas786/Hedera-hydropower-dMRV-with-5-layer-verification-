# Quick Start Guide - Hedera Hydropower MRV

## 🚀 Production-Ready Setup (5 minutes)

Your local environment is **pre-configured** to match the live Vercel deployment with real Hedera testnet credentials.

### Option 1: Automated Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-

# Install dependencies
npm install

# Copy production environment
cp .env.production .env

# Start the API server
npm run api
```

✅ **That's it!** Your local server is now connected to the same Hedera testnet resources as production.

---

### Option 2: Manual Setup

```bash
# 1. Clone and install
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
npm install

# 2. Copy production environment
cp .env.production .env

# 3. Start the API server
npm run api
```

---

## ✅ Verify Your Setup

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

**Expected Output:**
```json
{
  "status": "healthy",
  "timestamp": 1740000000000,
  "uptime": 142.15,
  "version": "1.0.0"
}
```

---

### Test 2: Submit Valid Telemetry

**Linux/Mac:**

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

**Windows PowerShell:**

```powershell
$headers = @{
    "x-api-key"    = "demo_key_001"
    "Content-Type" = "application/json"
}

$body = @{
    plant_id  = "PLANT-HP-001"
    device_id = "TURBINE-1"
    readings  = @{
        flowRate     = 2.5
        head         = 45
        generatedKwh = 900
        timestamp    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        pH           = 7.2
        turbidity    = 10
    }
} | ConvertTo-Json

$response = Invoke-RestMethod `
    -Uri http://localhost:3000/api/v1/telemetry `
    -Method POST `
    -Headers $headers `
    -Body $body

$response | ConvertTo-Json -Depth 10
```

**Expected Output:**
```json
{
  "status": "APPROVED",
  "trust_score": 1.0,
  "carbon_credits": {
    "amount_tco2e": 0.72,
    "methodology": "ACM0002",
    "baseline_emissions": 0.72,
    "project_emissions": 0,
    "leakage": 0
  },
  "verification_details": {
    "physics_check": "PERFECT",
    "temporal_check": "GOOD",
    "environmental_check": "GOOD"
  },
  "hedera": {
    "transaction_id": "0.0.6255927@1740000000.123456789",
    "explorer_url": "https://hashscan.io/testnet/transaction/0.0.6255927@1740000000.123456789",
    "topic_id": "0.0.7462776"
  },
  "timestamp": "2026-03-04T00:00:00.000Z"
}
```

✅ **Success!** Your reading has been:
1. Verified through 5-layer AI validation
2. Anchored to Hedera HCS topic `0.0.7462776`
3. Converted to 0.72 tCO2e carbon credits

---

### Test 3: Check Prometheus Metrics

```bash
curl http://localhost:3000/metrics | grep "mrv_"
```

**Expected Output:**
```
mrv_telemetry_submissions_total{status="APPROVED",plant_id="PLANT-HP-001"} 1
mrv_trust_score{plant_id="PLANT-HP-001"} 100
mrv_recs_minted_total{plant_id="PLANT-HP-001"} 0.72
```

---

## 🔍 What Just Happened?

Your local API server is now running with **production Hedera credentials**:

| Resource | ID | Explorer Link |
|---|---|---|
| Hedera Account | `0.0.6255927` | [View on HashScan](https://hashscan.io/testnet/account/0.0.6255927) |
| HCS Audit Topic | `0.0.7462776` | [View Messages](https://hashscan.io/testnet/topic/0.0.7462776) |
| HREC Token | `0.0.7964264` | [View Token](https://hashscan.io/testnet/token/0.0.7964264) |

**Every API call creates:**
- ✅ Immutable audit log on Hedera HCS
- ✅ Real-time verification via 5-layer AI engine
- ✅ Carbon credit calculation using ACM0002 methodology
- ✅ Publicly verifiable HashScan transaction URL

---

## 👍 Compare with Production

Your local setup is **identical** to the live Vercel deployment:

```bash
# Local API
curl http://localhost:3000/health

# Production API (same credentials)
curl https://hydropower-mrv-19feb26.vercel.app/api/status
```

Both use the **same Hedera testnet resources** — no mocking!

---

## 🎬 Run the Full Demo

```bash
npm run demo
```

**Demo Flow (5 steps):**
1. 🔐 Create Device DID → `did:hedera:testnet:z545...`
2. 🪙 Link HREC Token → `0.0.7964264`
3. ✅ Normal Reading → APPROVED (trust score: 100%)
4. ⚠️ Fraud Attempt → REJECTED (trust score: 60%)
5. 💰 Mint HREC → 4.87 MWh → 3.896 tCO2e credits

All operations are **permanently recorded** on Hedera HCS topic.

---

## 🚀 Next Steps

### For Developers

1. **Explore the API:**
   - API docs: http://localhost:3000/
   - Metrics: http://localhost:3000/metrics
   - Health: http://localhost:3000/health

2. **Run Tests:**
   ```bash
   npm test
   ```
   237 tests should pass (85% coverage)

3. **View Architecture:**
   - [README.md](./README.md) — Full system overview
   - [docs/API.md](./docs/API.md) — API specification
   - [docs/METHODOLOGY.md](./docs/METHODOLOGY.md) — Verification logic

### For Plant Operators

1. **Review Integration Guide:**
   - [docs/PILOT_PLAN_6MW_PLANT.md](./docs/PILOT_PLAN_6MW_PLANT.md)
   - Hardware options: ₹15K–50K
   - Shadow-mode validation: 90 days

2. **Cost Analysis:**
   - [docs/COST-ANALYSIS.md](./docs/COST-ANALYSIS.md)
   - Manual MRV: ₹1.25 lakh/quarter
   - Automated MRV: ₹38K–63K/quarter
   - **Savings: 60–70%**

### For Investors

1. **Production Readiness:**
   - [PRODUCTION_READINESS_ROADMAP.md](./PRODUCTION_READINESS_ROADMAP.md)
   - 8–10 weeks to full production SaaS
   - Clear milestones with effort estimates

2. **Market Validation:**
   - [VALIDATION.md](./VALIDATION.md)
   - $30–60B annual market
   - 500+ GW addressable capacity

---

## ⚠️ Troubleshooting

### Issue: `[EngineV1] Hedera credentials missing, running in mock mode`

**Solution:** Your `.env` file doesn't have the production credentials.

```bash
# Copy the production config
cp .env.production .env

# Restart the server
npm run api
```

---

### Issue: `Missing required field: timestamp`

**Solution:** The `timestamp` field is required in the `readings` object.

```bash
# Add this line to your readings:
timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
```

---

### Issue: Port 3000 already in use

**Solution:** Stop the other process.

**Linux/Mac:**
```bash
lsof -ti:3000 | xargs kill -9
```

**Windows PowerShell:**
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

---

## 🔗 Useful Links

- **Live Demo:** https://hydropower-mrv-19feb26.vercel.app
- **GitHub Repo:** https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
- **Hedera Explorer:** https://hashscan.io/testnet
- **Audit Topic:** https://hashscan.io/testnet/topic/0.0.7462776
- **HREC Token:** https://hashscan.io/testnet/token/0.0.7964264

---

**Last Updated**: March 4, 2026  
**Built for Production** | **237 Tests Passing** | **85% Coverage**
