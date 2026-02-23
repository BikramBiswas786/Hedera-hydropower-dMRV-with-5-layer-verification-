# Quick Start Guide - Hedera Hydropower MRV

##  Production-Ready Setup (5 minutes)

Your local environment is **pre-configured** to match the live Vercel deployment with real Hedera testnet credentials.

### Option 1: Automated Setup (Recommended)

```powershell
# Clone the repository
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv

# Run the automated setup script
.\setup-local-production.ps1

# Start the API server
npm run api
```

That's it! Your local server is now connected to the same Hedera testnet resources as production.

---

### Option 2: Manual Setup

```powershell
# 1. Clone and install
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
npm install

# 2. Copy production environment
Copy-Item .env.production .env

# 3. Start the API server
npm run api
```

---

## Verify Your Setup

### Test 1: Health Check

```powershell
Invoke-RestMethod -Uri http://localhost:3000/health
```

**Expected Output:**
```json
{
  "status": "healthy",
  "timestamp": 1771619234567,
  "uptime": 142.15,
  "version": "1.3.0"
}
```

---

### Test 2: Submit Valid Telemetry

```powershell
$headers = @{
    "x-api-key"    = "ghpk_demo_key_001"
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
  "trust_score": 100,
  "carbon_credits": {
    "amount_tco2e": 0.738,
    "methodology": "ACM0002",
    "baseline_emissions": 0.738,
    "project_emissions": 0,
    "leakage": 0
  },
  "verification_details": {
    "physics_check": "PERFECT",
    "temporal_check": "GOOD",
    "environmental_check": "GOOD"
  },
  "hedera": {
    "transaction_id": "0.0.6255927@1771619234.567890000",
    "explorer_url": "https://hashscan.io/testnet/transaction/0.0.6255927@1771619234.567890000",
    "topic_id": "0.0.7462776"
  },
  "timestamp": "2026-02-21T05:47:14.567Z"
}
```

Success! Your reading has been:
1. Verified through 5-layer AI validation
2. Anchored to Hedera HCS topic `0.0.7462776`
3. Converted to 0.738 tCO2e carbon credits

---

### Test 3: Check Prometheus Metrics

```powershell
Invoke-WebRequest -Uri http://localhost:3000/metrics -UseBasicParsing | Select-Object -ExpandProperty Content | Select-String "mrv_"
```

**Expected Output:**
```
mrv_telemetry_submissions_total{status="APPROVED",plant_id="PLANT-HP-001"} 1
mrv_trust_score{plant_id="PLANT-HP-001"} 100
mrv_recs_minted_total{plant_id="PLANT-HP-001"} 0.738
```

---

##  What Just Happened?

Your local API server is now running with **production Hedera credentials**:

| Resource | ID | Explorer Link |
|---|---|---|
| Hedera Account | `0.0.6255927` | [View on HashScan](https://hashscan.io/testnet/account/0.0.6255927) |
| HCS Audit Topic | `0.0.7462776` | [View Messages](https://hashscan.io/testnet/topic/0.0.7462776) |
| HREC Token | `0.0.7964264` | [View Token](https://hashscan.io/testnet/token/0.0.7964264) |
| Carbon Token (ACM0002) | `0.0.8011564` | [View Token](https://hashscan.io/testnet/token/0.0.8011564) |
| REC NFT | `0.0.8011565` | [View Token](https://hashscan.io/testnet/token/0.0.8011565) |
| DID Topic | `0.0.8011563` | [View Messages](https://hashscan.io/testnet/topic/0.0.8011563) |
| Verify Topic | `0.0.8011566` | [View Messages](https://hashscan.io/testnet/topic/0.0.8011566) |

**Every API call creates:**
- Immutable audit log on Hedera HCS
- Real-time verification via 5-layer AI engine
- Carbon credit calculation using ACM0002 v18.0 methodology
- Publicly verifiable HashScan transaction URL

---

##  Compare with Production

Your local setup is **identical** to the live Vercel deployment:

```powershell
# Local API
Invoke-RestMethod http://localhost:3000/health

# Production API (same credentials)
Invoke-RestMethod https://hydropower-mrv-19feb26.vercel.app/api/status
```

Both use the **same Hedera testnet resources** — no mocking!

---

##  Run the Full Demo

```powershell
npm run demo
```

**Demo Flow (5 steps):**
1. Create Device DID → `did:hedera:testnet:z545...`
2. Link HREC Token → `0.0.7964264`
3. Normal Reading → APPROVED (trust score: 100%)
4. Fraud Attempt → REJECTED (trust score: 60%)
5. Mint HREC → 4.87 MWh → 3.896 tCO2e credits

All operations are **permanently recorded** on Hedera HCS topic.

---

##  Next Steps

### For Developers

1. **Explore the API:**
   - API docs: http://localhost:3000/
   - Metrics: http://localhost:3000/metrics
   - Health: http://localhost:3000/health

2. **Run Tests:**
   ```powershell
   npm test
   ```
   259 tests should pass (14 test suites)

3. **View Architecture:**
   - [README.md](./README.md) — Full system overview
   - [docs/API.md](./docs/API.md) — API specification
   - [docs/MRV-METHODOLOGY.md](./docs/MRV-METHODOLOGY.md) — Verification logic

### For Plant Operators

1. **Review Integration Guide:**
   - [docs/PILOT_PLAN_6MW_PLANT.md](./docs/PILOT_PLAN_6MW_PLANT.md)
   - Hardware options: Rs 15K–50K
   - Shadow-mode validation: 90 days

2. **Cost Analysis:**
   - [docs/COST-ANALYSIS.md](./docs/COST-ANALYSIS.md)
   - Manual MRV: Rs 1.25 lakh/quarter
   - Automated MRV: Rs 38K–63K/quarter
   - Savings: 60–70%

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

##  Troubleshooting

### Issue: `[EngineV1] Hedera credentials missing, running in mock mode`

**Solution:** Your `.env` file doesn't have the production credentials.

```powershell
# Copy the production config
Copy-Item .env.production .env -Force

# Restart the server
npm run api
```

---

### Issue: `Missing required field: timestamp`

**Solution:** The `timestamp` field is required in the `readings` object.

```powershell
# Add this line to your readings:
timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
```

---

### Issue: Port 3000 already in use

**Solution:** Stop the other process.

```powershell
# Find and stop Node.js processes
Get-Process -Name node | Stop-Process -Force

# Wait 2 seconds
Start-Sleep -Seconds 2

# Restart
npm run api
```

---

##  Useful Links

- **Live Demo:** https://hydropower-mrv-19feb26.vercel.app
- **GitHub Repo:** https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv
- **Hedera Explorer:** https://hashscan.io/testnet
- **Audit Topic:** https://hashscan.io/testnet/topic/0.0.7462776
- **HREC Token:** https://hashscan.io/testnet/token/0.0.7964264
- **Carbon Token (ACM0002):** https://hashscan.io/testnet/token/0.0.8011564
- **REC NFT:** https://hashscan.io/testnet/token/0.0.8011565

---

**Built for AngelHack Apex 2026 Sustainability Track**
