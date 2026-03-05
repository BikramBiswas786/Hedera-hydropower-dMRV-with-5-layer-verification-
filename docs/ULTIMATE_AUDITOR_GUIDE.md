# HEDERA HYDROPOWER dMRV - ULTIMATE COMPLETE AUDITOR & TESTING GUIDE

**Version 3.0 – Evidence-Based Edition**  
**Last Updated:** March 6, 2026  
**System:** Production-Grade Digital MRV for Hydropower Carbon Credits

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Quick Start for Judges & Auditors](#2-quick-start-for-judges--auditors)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Four Core Claims & Evidence](#4-four-core-claims--evidence)
5. [Complete Demo Script (Video Recording)](#5-complete-demo-script-video-recording)
6. [One-Shot Verification Commands](#6-one-shot-verification-commands)
7. [Deep Dive: Verification Engine (5 Layers)](#7-deep-dive-verification-engine-5-layers)
8. [Test Suite Reference](#8-test-suite-reference)
9. [On-Chain Evidence Map](#9-on-chain-evidence-map)
10. [FAQ & Troubleshooting](#10-faq--troubleshooting)
11. [Appendix: Code References](#11-appendix-code-references)

---

## 1. EXECUTIVE SUMMARY

### What This System Does

This is a **production-grade digital MRV (Monitoring, Reporting, Verification) system** for hydropower plants that:

- Accepts sensor telemetry (flow, head, energy, environmental parameters)
- Runs **five automated verification layers** (physics, temporal, environmental, ML/anomaly, consistency)
- Logs every reading (valid or fraudulent) **immutably on Hedera Consensus Service (HCS)**
- Calculates carbon credits using the **ACM0002 methodology** (grid-connected renewable energy)
- Mints fungible **HREC tokens (HTS)** only for approved readings
- Assigns a **decentralized identity (DID)** to each device

### Why This Guide Exists

Judges, auditors, and independent reviewers need **verifiable, falsifiable evidence** for four claims:

1. **97.59% cost reduction** vs traditional MRV (CDM/Verra style)
2. **ACM0002 compliance** (emission reductions calculation)
3. **Real carbon credits** (HTS tokens backed by attested readings)
4. **Real dMRV system** (automated M-R-V with on-chain auditability)

This guide provides:

- **Step-by-step demo script** (what to say, what to run on screen)
- **One-command verification** (`npm run demo`, test suites, cost model)
- **Direct HashScan links** to every on-chain transaction
- **Reproducible test cases** (fraud, environmental violations, replay attacks)

---

## 2. QUICK START FOR JUDGES & AUDITORS

### Prerequisites

- **Node.js** v18+ installed
- **Git** installed
- **PowerShell** (Windows) or **Bash** (Linux/macOS)
- Hedera testnet credentials (provided in `.env`)

### Four Commands That Prove Everything

```bash
# 1) Clone repo and install dependencies
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
npm install

# 2) Full on-chain workflow (DID → valid + fraud → verification)
npm run demo

# 3) Production test suite (6 scenarios)
.\RUN_TESTS.ps1    # PowerShell (Windows)
# OR
node scripts/test-suite-complete.js    # Cross-platform

# 4) Cost model (97.59% savings claim)
node scripts/show-cost-model.js
```

**Expected time:** 5–10 minutes total

### What You'll See

- **DID registration** → HashScan link to HCS topic with W3C DID document
- **HREC token** → HashScan link to HTS token (0.0.7964264)
- **Valid reading** → APPROVED, trust score 0.985, ER_tCO2 = 0.72, HCS tx
- **Fraud reading** → FLAGGED, trust score ~0.6, fraud reasons, HCS tx
- **Carbon credit calculation** → ACM0002 formula applied correctly
- **Test results** → All 6 production scenarios PASS
- **Cost comparison** → $4,886.51/year vs $203,000/year traditional MRV

### Verification Checklist

After running the above commands, you can independently verify:

- [ ] DID document exists on Hedera testnet (HCS topic)
- [ ] HREC token exists with correct parameters (name, symbol, decimals)
- [ ] APPROVED reading has `status: "APPROVED"`, `trustScore ≈ 0.985`, `carbon_credits` object
- [ ] REJECTED fraud has `status: "FLAGGED"`, fraud reasons listed
- [ ] HTS mint capability demonstrated (minting logic tied to APPROVED status)
- [ ] All transaction fees visible on HashScan (HCS ≈ $0.0001, HTS mint ≈ $0.001)
- [ ] Test suite shows 6/6 PASS (valid, fraud, environmental, zero-flow, multi-plant, replay)
- [ ] Cost model prints 97.59% reduction with cited sources

---

## 3. SYSTEM ARCHITECTURE OVERVIEW

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     HEDERA TESTNET                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ HCS Topic    │  │ HTS Token    │  │ DID Service  │      │
│  │ 0.0.7462776  │  │ 0.0.7964264  │  │ (HCS-based)  │      │
│  │ (Audit Log)  │  │ (HREC)       │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ HCS submit, HTS mint
                            │
┌─────────────────────────────────────────────────────────────┐
│                   NODE.JS API SERVER                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Verification Engine V1 (5 Layers)                   │   │
│  │  - Physics (theoretical power vs reported)           │   │
│  │  - Temporal (time-series consistency, replay check)  │   │
│  │  - Environmental (pH, turbidity, temp ranges)        │   │
│  │  - ML/Statistical (anomaly detection, Z-score)       │   │
│  │  - Consistency (multi-plant isolation, DID check)    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Workflow Module                                     │   │
│  │  - DID deployment                                    │   │
│  │  - Telemetry processing                              │   │
│  │  - Carbon credit calculation (ACM0002)               │   │
│  │  - HTS minting (APPROVED only)                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ REST API
                            │
┌─────────────────────────────────────────────────────────────┐
│           PLANT OPERATORS / IOT SENSORS                     │
│  POST /api/v1/telemetry                                     │
│  {                                                           │
│    "plant_id": "PLANT-ALPHA",                               │
│    "device_id": "TURBINE-ALPHA-2026",                       │
│    "readings": {                                            │
│      "flowRate": 2.5, "head": 45.0,                        │
│      "generatedKwh": 900, "pH": 7.2, ...                   │
│    }                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Sensor telemetry** → API endpoint (`POST /api/v1/telemetry`)
2. **Verification engine** → 5-layer checks, compute trust score (0–1)
3. **Status determination** → APPROVED (≥0.7), FLAGGED (<0.7), REJECTED
4. **HCS logging** → Attestation message (reading + verification results + status)
5. **Carbon calculation** → If APPROVED: `ER = EG_MWh × EF_grid` (ACM0002)
6. **HTS minting** → If APPROVED + trustScore ≥ threshold: mint HREC tokens
7. **Response** → API returns status, trust score, HCS tx ID, carbon credits (if any)

### Key IDs (Hedera Testnet)

- **Operator Account:** `0.0.6255927`
- **HCS Audit Topic:** `0.0.7462776`
- **HREC Token:** `0.0.7964264`
- **Network:** Hedera Testnet
- **Explorer:** https://hashscan.io/testnet

---

## 4. FOUR CORE CLAIMS & EVIDENCE

### 4.1. Claim: 97.59% Cost Reduction

**Traditional MRV (Annual Costs for 6MW Plant):**

- Third-party auditor visits: $60,000 (4 quarterly @ $15,000 each)
- Manual data management: $67,500 (1.5 FTE staff)
- Certification & compliance: $20,000 (ISO 14064, renewals)
- Carbon credit issuance fees: $37,500 ($2.50/tCO2e × 15,000 credits)
- Legal & consulting: $18,000
- **TOTAL: $203,000/year**

**Hedera dMRV System (Annual Costs):**

- HCS telemetry anchoring: $10.51 (105,120 readings @ $0.0001)
- HREC token minting: $16.00 (15,000 tokens @ $0.001)
- Device DID management: $0.00 (amortized 10yr)
- Infrastructure (VPS + monitoring): $360.00
- Human oversight (0.1 FTE): $4,500.00
- **TOTAL: $4,886.51/year**

**Cost Reduction:** `(203,000 - 4,886.51) / 203,000 × 100% = 97.59%`

**Evidence:**

- Run `node scripts/show-cost-model.js` → prints detailed breakdown
- Sources cited: Hedera fee schedule, Verra/Gold Standard benchmarks, World Bank 2024
- Check `LIVE_DEMO_RESULTS.md` → table of real HCS tx IDs with fees from HashScan

### 4.2. Claim: ACM0002 Compliance

**Methodology:** ACM0002 – Consolidated methodology for grid-connected electricity generation from renewable sources (UNFCCC)

**Formula:**
```
ER_y = EG_y × EF_grid,y - PE_y - LE_y
```

Where:
- `ER_y` = Emission reductions (tCO₂e)
- `EG_y` = Electricity generated and fed to grid (MWh)
- `EF_grid,y` = Grid emission factor (tCO₂/MWh)
- `PE_y` = Project emissions (≈0 for hydro)
- `LE_y` = Leakage emissions (≈0 for hydro)

**Our Implementation:**

For India grid: `EF_grid = 0.8 tCO₂/MWh`

Example (900 kWh reading):
```
EG = 900 kWh = 0.9 MWh
ER = 0.9 × 0.8 - 0 - 0 = 0.72 tCO₂e
```

**Evidence:**

- API response includes:
  ```json
  "carbon_credits": {
    "methodology": "ACM0002",
    "ER_tCO2": 0.72,
    "EF_grid_tCO2_per_MWh": 0.8,
    "EG_MWh": 0.9
  }
  ```
- HCS attestation message contains same fields (verify on HashScan)
- Code reference: `src/workflow.js` → `calculateCarbonCredits()` function
- ACM0002 official documentation available in CDM registry

### 4.3. Claim: Real Carbon Credits

**Definition:** Each HREC token is:

- **Fungible** (HTS standard)
- **Minted only for APPROVED readings** (status check + trust score threshold)
- **1:1 backed by attested ER_tCO2** (visible on-chain)

**Evidence:**

- HREC token page: https://hashscan.io/testnet/token/0.0.7964264
  - Name: Hedera Renewable Energy Credit
  - Symbol: HREC
  - Decimals: 2
  - Total supply = sum of all mints (verifiable)
- Minting logic in `src/workflow.js` enforces:
  - `if (status !== 'APPROVED') { reject mint }`
  - `if (trustScore < threshold) { reject mint }`
- Demo shows: Approved reading → mints tokens; Fraud reading → no mint

### 4.4. Claim: Real dMRV System

**Digital MRV Definition (EBRD Protocol):**

- **Monitoring (M):** Automated sensor data collection
- **Reporting (R):** Structured, machine-readable attestations
- **Verification (V):** Automated rule-based checks with audit trail

**Our Implementation:**

| Component | Evidence |
|-----------|----------|
| **Monitoring** | REST API `/api/v1/telemetry` accepts plant data (flow, head, energy, pH, turbidity, temp) |
| **Reporting** | Every reading → HCS attestation with: inputs, verification results (5 layers), status, trust score, fraud flags, carbon credits |
| **Verification** | 5-layer engine: Physics, Temporal, Environmental, ML/Statistical, Consistency checks |
| **Auditability** | DID for device identity, HCS for immutable logs (every reading including fraud), HTS for credits, public HashScan explorer |
| **Reproducibility** | Full test suite (`RUN_TESTS.ps1`), demo script (`npm run demo`), independent auditor guide |

**Evidence:**

- Check `LIVE_DEMO_RESULTS.md` → approved reading has all MRV fields; fraud reading has FLAGGED status + reasons
- Code: `src/engine/v1/engine-v1.js` → `processReading()` runs all 5 layers sequentially
- Test suite validates all verification layers work correctly

---

## 5. COMPLETE DEMO SCRIPT (VIDEO RECORDING)

**Total time:** 10–12 minutes

**Goal:** Show end-to-end workflow with on-chain evidence for all four claims

### Pre-Recording Setup

**PowerShell:**

```powershell
cls
cd C:\path\to\Hedera-hydropower-dMRV-with-5-layer-verification-

# Ensure .env has credentials
cat .env | Select-String "HEDERA"
```

**Open browser tabs:**

- https://hashscan.io/testnet/account/0.0.6255927
- https://hashscan.io/testnet/topic/0.0.7462776
- https://hashscan.io/testnet/token/0.0.7964264
- GitHub repo README

**Start screen recording** (1080p, mic on)

### Demo Steps

#### Step 1: Full Live Demo

**Say:**
> "I'm running the complete live demo that shows DID registration, valid telemetry, fraud detection, and carbon credit calculation."

**PowerShell:**

```powershell
npm run demo
```

**Expected output:**

```
╔========================================================╗
║  Hedera Hydropower MRV — Live Demo                   ║
║  Apex Hackathon 2026 — Sustainability Track           ║
╚========================================================╝
  ✅ Live mode — Account: 0.0.6255927
────────────────────────────────────────────────────────────
  ✅ Connected to Hedera Testnet

STEP 1: Device DID Registration (W3C DID on Hedera)
  ✅ Device ID : TURBINE-APEX-2026-001
  ✅ DID       : did:hedera:testnet:z6Mk...

STEP 2: HREC Token (Hedera Token Service)
  ✅ Token ID  : 0.0.7964264
  ✅ Token Name: HREC (1 token = 1 verified MWh)
  ℹ  HashScan  : https://hashscan.io/testnet/token/0.0.7964264

STEP 3: Telemetry #1 — NORMAL reading
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 4.87 MW
  Trust Score: 100% → APPROVED
  ✅ TX: 0.0.6255927@1772733584.348234779
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ✅ Reading anchored to Hedera HCS

STEP 4: Telemetry #2 — FRAUD ATTEMPT
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 9.5 MW  ← INFLATED
  Trust Score: 60% → REJECTED
  ✅ TX: 0.0.6255927@1772733585.901458595
  ✅ Fraud REJECTED — evidence preserved on-chain

STEP 5: HREC Minting (approved reading only)
  Verified MWh : 4.87
  CO₂ credits  : 3.896 tCO₂ (EF_GRID=0.8)
  HREC tokens  : 4.87 (1 token = 1 MWh)
  ✅ 4.87 HREC minted

Demo complete.
```

**Say while showing:**

- "DID created for device identity"
- "HREC token is live on Hedera testnet"
- "Valid reading: APPROVED with 100% trust score and carbon credits calculated"
- "Fraud reading: REJECTED with 60% trust score, permanently logged on HCS"
- "All transactions are verifiable on HashScan"

#### Step 2: Production Test Suite

**Say:**
> "Now I'll run the complete 6-test production suite that auditors can use to verify all security features."

**PowerShell:**

```powershell
.\RUN_TESTS.ps1
```

**Expected output:**

```
========================================================
  HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE
========================================================

[TEST 1] Valid APPROVED Telemetry
  Status: APPROVED
  Trust Score: 0.985
  TEST 1 PASSED

[TEST 2] Fraud Detection - Inflated Power
  Status: FLAGGED
  TEST 2 PASSED - Fraud detected

[TEST 3] Environmental Violation Detection
  Status: FLAGGED
  TEST 3 PASSED - Environmental violation detected

[TEST 4] Zero-Flow Fraud Detection
  TEST 4 PASSED - Zero-flow fraud blocked

[TEST 5] Multi-Plant Isolation
  TEST 5 PASSED - Multi-plant isolation verified

[TEST 6] Replay Attack Prevention
  TEST 6 PASSED - Replay protection working

========================================================
              TESTING COMPLETE
========================================================

Test Results:
  [OK] TEST 1: PASSED
  [OK] TEST 2: PASSED
  [OK] TEST 3: PASSED
  [OK] TEST 4: PASSED
  [OK] TEST 5: PASSED
  [OK] TEST 6: PASSED

Summary: 6/6 tests passed

[OK] ALL TESTS PASSED - PRODUCTION READY!
```

**Say:**
> "All 6 production scenarios pass: valid readings, fraud detection, environmental monitoring, zero-flow protection, multi-plant isolation, and replay attack prevention."

#### Step 3: Cost Model

**Say:**
> "Now I'll show the cost comparison that proves our 97.59% reduction claim."

**PowerShell:**

```powershell
node scripts/show-cost-model.js
```

**Expected output:**

```
======================================================================
  HEDERA HYDROPOWER dMRV — COST MODEL COMPARISON
======================================================================

📊 TRADITIONAL MRV SYSTEM (Annual Costs)

  Third-Party Auditor Visits:        $60,000
  Manual Data Management:            $67,500
  Certification & Compliance:        $20,000
  Carbon Credit Issuance Fees:       $37,500
  Legal & Consulting:                $18,000
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TRADITIONAL TOTAL (Annual):        $203,000

⚡ HEDERA dMRV SYSTEM (Annual Costs)

  HCS Telemetry Anchoring:           $10.51
  HREC Token Minting:                $16.00
  Device DID Management:             $0.00
  Infrastructure (VPS + Monitoring): $360.00
  Human Oversight (0.1 FTE):         $4,500.00
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HEDERA dMRV TOTAL (Annual):        $4,886.51

💰 COST SAVINGS ANALYSIS

  Traditional MRV Annual Cost:       $203,000
  Hedera dMRV Annual Cost:           $4,886.51
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ANNUAL SAVINGS:                    $198,113.49
  COST REDUCTION:                    97.59%
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

======================================================================
  🏆 RESULT: 97.59% COST REDUCTION WITH HEDERA dMRV
======================================================================
```

**Say:**
> "This shows the dramatic cost reduction from $203,000 per year to less than $5,000 per year - that's 97.59% savings while maintaining full MRV compliance."

#### Step 4: HashScan Evidence

**Switch to browser** → HashScan topic tab

**Say while scrolling through messages:**

- "Every reading is permanently logged on Hedera HCS"
- "Approved readings show full verification details and carbon credits"
- "Fraud attempts are flagged and preserved as evidence"
- "All data is publicly auditable on HashScan"

**Show one approved message:**
- Status: APPROVED
- Trust score: 0.985
- Carbon credits calculation
- Transaction ID and timestamp

**Show one fraud message:**
- Status: FLAGGED
- Physics violation flag
- Lower trust score
- No carbon credits issued

---

## 6. ONE-SHOT VERIFICATION COMMANDS

### For PowerShell (Windows)

```powershell
# Complete verification in one session
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
npm install

# Set environment variables
$env:HEDERA_OPERATOR_ID  = "0.0.6255927"
$env:HEDERA_OPERATOR_KEY = "<your-key>"
$env:AUDIT_TOPIC_ID      = "0.0.7462776"
$env:EF_GRID             = "0.8"

# Run all verification
npm run demo
.\RUN_TESTS.ps1
node scripts/show-cost-model.js
```

### For Bash (Linux/macOS)

```bash
# Complete verification in one session
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
npm install

# Set environment variables
export HEDERA_OPERATOR_ID="0.0.6255927"
export HEDERA_OPERATOR_KEY="<your-key>"
export AUDIT_TOPIC_ID="0.0.7462776"
export EF_GRID="0.8"

# Run all verification
npm run demo
node scripts/test-suite-complete.js
node scripts/show-cost-model.js
```

---

## 7. DEEP DIVE: VERIFICATION ENGINE (5 LAYERS)

### Layer 1: Physics Verification

**Purpose:** Validate reported power against theoretical maximum

**Formula:**
```
P_theoretical = η × ρ × g × Q × H
where:
  η = efficiency (0.75-0.95 for hydro)
  ρ = water density (1000 kg/m³)
  g = gravity (9.81 m/s²)
  Q = flow rate (m³/s)
  H = head (m)
```

**Check:**
```javascript
if (reported_power > theoretical_max * 1.05) {
  flag = "PHYSICS_VIOLATION"
  impact = -0.3  // Reduce trust score
}
```

**Test:** TEST 2 verifies 10× inflated power is flagged

### Layer 2: Temporal Verification

**Purpose:** Detect replay attacks and time-series anomalies

**Checks:**
- Timestamp must be recent (within 5 minutes)
- No duplicate timestamps for same device
- Sequential readings must follow physical constraints

**Code:**
```javascript
if (timestamp_age > 5 * 60 * 1000) {
  flag = "STALE_READING"
}
if (isDuplicateTimestamp(device_id, timestamp)) {
  flag = "REPLAY_ATTACK"
  status = "REJECTED"
}
```

**Test:** TEST 6 verifies replay protection

### Layer 3: Environmental Verification

**Purpose:** Ensure readings are within safe environmental ranges

**Ranges:**
- pH: 6.5 - 8.5 (neutral water)
- Turbidity: 0 - 100 NTU (clear water)
- Temperature: 10 - 25°C (temperate climate)

**Check:**
```javascript
if (pH < 6.5 || pH > 8.5) {
  flag = "ENVIRONMENTAL_ANOMALY"
  impact = -0.1
}
```

**Test:** TEST 3 verifies pH=4.5 is flagged

### Layer 4: ML/Statistical Verification

**Purpose:** Detect anomalies using statistical methods

**Method:** Z-score analysis
```
z = (value - mean) / std_dev
if (|z| > 3) { flag = "STATISTICAL_ANOMALY" }
```

**Features analyzed:**
- Power output relative to historical average
- Flow rate consistency
- Efficiency trends

**Test:** Covered by fraud detection in TEST 2

### Layer 5: Consistency Verification

**Purpose:** Cross-check data consistency and isolation

**Checks:**
- Multi-plant isolation (readings from different plants don't interfere)
- DID verification (device identity matches registration)
- Data completeness (all required fields present)

**Code:**
```javascript
if (plant_id_A === plant_id_B && device_id_A !== device_id_B) {
  // Valid: different devices in same plant
} else if (plant_id_A !== plant_id_B) {
  // Must have separate verification context
  ensureIsolation(plant_id_A, plant_id_B)
}
```

**Test:** TEST 5 verifies multi-plant isolation

### Trust Score Calculation

```javascript
let trustScore = 1.0

// Apply penalties for each flag
for (const flag of flags) {
  trustScore += penalties[flag]  // e.g., -0.3 for PHYSICS_VIOLATION
}

// Ensure bounds
trustScore = Math.max(0, Math.min(1, trustScore))

// Determine status
if (trustScore >= 0.7) {
  status = "APPROVED"
} else {
  status = "FLAGGED"
}
```

---

## 8. TEST SUITE REFERENCE

### Test 1: Valid APPROVED Telemetry

**Purpose:** Verify that physically valid readings are approved

**Input:**
```json
{
  "flowRate": 2.5,
  "head": 45.0,
  "generatedKwh": 900,
  "pH": 7.2,
  "turbidity": 10,
  "temperature": 18.5,
  "efficiency": 0.85
}
```

**Expected:**
- Status: APPROVED
- Trust Score: ≥ 0.9
- Physics Check: PASS
- Carbon credits calculated
- HCS transaction created

### Test 2: Fraud Detection - Inflated Power

**Purpose:** Verify that inflated power readings are flagged

**Input:**
```json
{
  "flowRate": 2.5,
  "head": 45.0,
  "generatedKwh": 45000,  // 50× inflated
  "efficiency": 0.85
}
```

**Expected:**
- Status: FLAGGED/REJECTED
- Trust Score: < 0.7
- Physics Check: FAIL
- Flags: PHYSICS_VIOLATION
- No carbon credits issued

### Test 3: Environmental Violation Detection

**Purpose:** Verify environmental parameter monitoring

**Input:**
```json
{
  "flowRate": 2.5,
  "head": 45.0,
  "generatedKwh": 900,
  "pH": 4.5,  // Too acidic
  "turbidity": 180,  // Too high
  "temperature": 35  // Too warm
}
```

**Expected:**
- Status: FLAGGED
- Environmental Check: FAIL
- Flags: ENVIRONMENTAL_ANOMALY
- Trust score reduced

### Test 4: Zero-Flow Fraud Detection

**Purpose:** Verify impossible zero-flow with power generation is blocked

**Input:**
```json
{
  "flowRate": 0,  // No water flow
  "head": 45.0,
  "generatedKwh": 500  // But generating power??
}
```

**Expected:**
- Status: REJECTED or API 400 error
- Physics Check: FAIL
- Trust score: < 0.5

### Test 5: Multi-Plant Isolation

**Purpose:** Verify that readings from different plants are isolated

**Input:** Two simultaneous readings from PLANT-ALPHA and PLANT-BETA

**Expected:**
- Both readings processed independently
- Different HCS transaction IDs
- No cross-contamination of verification state

### Test 6: Replay Attack Prevention

**Purpose:** Verify that duplicate timestamps are rejected

**Input:** Submit same reading twice with identical timestamp

**Expected:**
- First submission: APPROVED
- Second submission: REJECTED (replay detected)
- Different handling for duplicate vs fresh data

---

## 9. ON-CHAIN EVIDENCE MAP

### HCS Topic: 0.0.7462776

**Purpose:** Immutable audit log of all readings and verifications

**Message Structure:**
```json
{
  "reading_id": "RDG-PLANT-ALPHA-XXXX",
  "plant_id": "PLANT-ALPHA",
  "device_id": "TURBINE-001",
  "timestamp": 1772736502634,
  "status": "APPROVED",
  "trust_score": 0.985,
  "readings": {
    "flowRate": 2.5,
    "head": 45.0,
    "generatedKwh": 900,
    "pH": 7.2,
    "turbidity": 10,
    "temperature": 18.5
  },
  "verification": {
    "physics_check": "PERFECT",
    "environmental_check": "PASS",
    "flags": []
  },
  "carbon_credits": {
    "methodology": "ACM0002",
    "ER_tCO2": 0.72,
    "EF_grid_tCO2_per_MWh": 0.8,
    "EG_MWh": 0.9
  },
  "hedera": {
    "transaction_id": "0.0.6255927@1772736502.634551909",
    "topic_id": "0.0.7462776",
    "consensus_timestamp": "2026-03-06T00:15:02.634Z"
  }
}
```

**How to Verify:**
1. Go to https://hashscan.io/testnet/topic/0.0.7462776
2. Click any message
3. View JSON content
4. Verify all fields are present and consistent

### HTS Token: 0.0.7964264

**Purpose:** Fungible carbon credit tokens

**Token Properties:**
- Name: Hedera Renewable Energy Credit
- Symbol: HREC
- Decimals: 2
- Type: Fungible
- Treasury: 0.0.6255927

**Mint Transactions:**
Each mint correlates to an APPROVED HCS attestation

Example:
- HCS TX: 0.0.6255927@1772736502.634551909
- Carbon Credits: 0.72 tCO₂e = 72 HREC (×100 for decimals)
- HTS Mint TX: 0.0.6255927@1772736503.123456789
- Amount: 72 HREC

**How to Verify:**
1. Find HCS attestation with `status: "APPROVED"`
2. Note `ER_tCO2` value
3. Check HTS mints around same timestamp
4. Verify mint amount = ER_tCO2 × 100 (for 2 decimals)

### DID Documents

**Purpose:** Decentralized identity for devices

**Format:** W3C DID standard
```
did:hedera:testnet:z6Mk...
```

**Storage:** DID document stored in HCS topic

**How to Verify:**
1. Get DID from demo output
2. Resolve DID using Hedera DID SDK
3. Verify device_id matches registration

---

## 10. FAQ & TROUBLESHOOTING

### Q: Tests show "0/0 tests passed" but individual tests show PASSED?

**A:** This was a PowerShell array initialization bug. Fixed in v2.6 of RUN_TESTS.ps1. Run `git pull origin main` to get the latest version.

### Q: "Unable to connect to the remote server" error?

**A:** The API server must be running. Start it with:
```powershell
npm run start    # or: npm run api
```
Then run tests in a separate terminal.

### Q: How do I verify the cost calculations?

**A:** 
1. Run `node scripts/show-cost-model.js`
2. Check Hedera fee schedule: https://hedera.com/fees
3. Verify HCS costs on HashScan for actual transactions
4. Compare with traditional MRV costs cited in the model

### Q: Can I run tests without Hedera credentials?

**A:** No. The tests make real Hedera network calls. Use the provided testnet credentials in `.env` or contact the team for demo credentials.

### Q: How do I verify ACM0002 compliance?

**A:**
1. Review `src/workflow.js` → `calculateCarbonCredits()` function
2. Check API response `carbon_credits` object
3. Verify formula: ER = EG_MWh × EF_grid
4. Compare with official ACM0002 documentation

### Q: What if a test fails?

**A:** Common causes:
1. API server not running
2. Stale Hedera credentials
3. Network connectivity issues
4. Testnet maintenance

Check `LIVE_DEMO_RESULTS.md` for expected output to compare against.

### Q: How do I run tests on Linux/macOS?

**A:** Use the Node.js test suite instead:
```bash
node scripts/test-suite-complete.js
```

### Q: Where can I see real transaction costs?

**A:** Check any HCS transaction on HashScan:
1. Go to https://hashscan.io/testnet/topic/0.0.7462776
2. Click any message
3. View "Transaction Fee" field
4. Typical cost: $0.0001 per HCS message

---

## 11. APPENDIX: CODE REFERENCES

### Key Files

**Verification Engine:**
- `src/engine/v1/engine-v1.js` - Core 5-layer verification logic
- Trust score calculation, physics checks, environmental validation

**Workflow & Integration:**
- `src/workflow.js` - DID deployment, telemetry processing, carbon calculation, HTS minting
- Main orchestration layer connecting all components

**API Server:**
- `src/api/server.js` - REST API endpoint
- Express server handling `/api/v1/telemetry` requests

**Demo & Testing:**
- `scripts/demo.js` - Complete live demo workflow
- `RUN_TESTS.ps1` - PowerShell test suite (6 scenarios)
- `scripts/test-suite-complete.js` - Node.js test suite (cross-platform)
- `scripts/show-cost-model.js` - Cost comparison calculator

**Documentation:**
- `README.md` - Project overview
- `docs/API.md` - API reference
- `docs/ARCHITECTURE.md` - System design
- `docs/METHODOLOGY.md` - ACM0002 implementation details
- `LIVE_DEMO_RESULTS.md` - Sample outputs and HashScan links

### Important Functions

**Physics Verification:**
```javascript
// src/engine/v1/engine-v1.js
calculateTheoreticalPower(flowRate, head, efficiency) {
  const rho = 1000;  // kg/m³
  const g = 9.81;    // m/s²
  return (efficiency * rho * g * flowRate * head) / 1000;  // kW
}
```

**Carbon Credits Calculation:**
```javascript
// src/workflow.js
calculateCarbonCredits(generatedKwh, EF_grid) {
  const EG_MWh = generatedKwh / 1000;
  const ER_tCO2 = EG_MWh * EF_grid;
  return {
    methodology: "ACM0002",
    ER_tCO2: ER_tCO2,
    EF_grid_tCO2_per_MWh: EF_grid,
    EG_MWh: EG_MWh
  };
}
```

**HCS Attestation:**
```javascript
// src/workflow.js
async submitToHCS(attestation) {
  const message = JSON.stringify(attestation);
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(this.topicId)
    .setMessage(message)
    .execute(this.client);
  return tx.transactionId.toString();
}
```

### Environment Variables

```bash
# Required
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=<private-key>
AUDIT_TOPIC_ID=0.0.7462776

# Optional
EF_GRID=0.8                    # Grid emission factor (tCO2/MWh)
HREC_TOKEN_ID=0.0.7964264      # HREC token ID
NODE_ENV=production             # Environment mode
```

---

## CONCLUSION

This guide provides complete, reproducible evidence for all four core claims:

1. ✅ **97.59% Cost Reduction** - Demonstrated via cost model with real Hedera fees
2. ✅ **ACM0002 Compliance** - Carbon credits calculated per official methodology
3. ✅ **Real Carbon Credits** - HTS tokens minted only for approved readings
4. ✅ **Real dMRV System** - Full M-R-V workflow with on-chain auditability

**For Judges:** Run the three commands in Section 2 to verify everything independently.

**For Technical Auditors:** Review Section 7 for verification engine deep dive and Section 11 for code references.

**For Video Demo:** Follow Section 5 script exactly to record a compelling 10-minute demo.

**Questions?** Check Section 10 FAQ or open an issue on GitHub.

---

**Document Version:** 3.0  
**Last Updated:** March 6, 2026  
**Maintained by:** Hedera Hydropower dMRV Team  
**License:** MIT  
**GitHub:** https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
