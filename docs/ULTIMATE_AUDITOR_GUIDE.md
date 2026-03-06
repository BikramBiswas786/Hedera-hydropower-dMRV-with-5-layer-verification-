# HEDERA HYDROPOWER dMRV - ULTIMATE COMPLETE AUDITOR & TESTING GUIDE

**Version 4.0 – Real On-Chain Edition**  
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

- **Step-by-step demo script** with two modes: complete fresh creation and fast production mode
- **Real on-chain transactions** — everything verifiable on HashScan
- **Direct HashScan links** to every transaction created during demo
- **Reproducible test cases** (fraud, environmental violations, replay attacks)

---

## 2. QUICK START FOR JUDGES & AUDITORS

### Prerequisites

- **Node.js** v18+ installed
- **Git** installed
- **PowerShell** (Windows) or **Bash** (Linux/macOS)
- Hedera testnet credentials (provided in `.env`)

### Two Demo Modes Available

| Command | What It Creates | Transactions | Time |
|---------|-----------------|--------------|------|
| `npm run demo:fresh` | **Everything new** — new topic, new token, new DID, telemetry, mint | 6 real TXs | ~60s |
| `npm run demo:live` | Reuses infrastructure, creates new attestations + mint | 3 real TXs | ~10s |

### Five Commands That Prove Everything

```powershell
# 1) Setup
git clone https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-.git
cd Hedera-hydropower-dMRV-with-5-layer-verification-
npm install

# 2a) COMPLETE FRESH — creates new topic + token + DID + telemetry + mint
npm run demo:fresh

# 2b) FAST LIVE — reuses infrastructure, new attestations + mint
npm run demo:live

# 3) Production test suite (6 scenarios — needs TWO windows)
# Window 1:
npm run start
# Window 2:
.\RUN_TESTS.ps1

# 4) Unit tests (227 tests, 12 suites)
npm test

# 5) Cost model (97.59% savings claim)
node scripts/show-cost-model.js
```

### What You'll See

- **demo:fresh** → 6 NEW HashScan links: topic creation, token creation, DID registration, APPROVED reading, REJECTED fraud, HREC mint
- **demo:live** → 3 NEW HashScan links: APPROVED reading, REJECTED fraud, HREC mint
- **RUN_TESTS.ps1** → 6/6 production scenarios PASS with HCS transactions
- **npm test** → 227 tests passed across 12 suites
- **Cost model** → $4,886.51/year vs $203,000/year traditional MRV

### Verification Checklist

- [ ] New HCS topic created (demo:fresh) — visible on HashScan
- [ ] New HREC token created (demo:fresh) — supply starts at 0
- [ ] DID document registered on HCS with W3C standard format
- [ ] APPROVED reading has `status: "APPROVED"`, `trustScore: 100%`, `carbon_credits` with ACM0002
- [ ] REJECTED fraud has `status: "REJECTED"`, `fraudFlag: true`, physics violation flags
- [ ] HREC mint TX is REAL — supply increases by exactly the approved MWh
- [ ] Fraud reading gets ZERO minting — enforced on-chain
- [ ] All 6 production tests PASS (fraud, environmental, zero-flow, multi-plant, replay)
- [ ] 227 unit tests all pass
- [ ] Cost model prints 97.59% reduction

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
│  { "plant_id": "PLANT-ALPHA",                               │
│    "device_id": "TURBINE-ALPHA-2026",                       │
│    "readings": { "flowRate": 2.5, "head": 45.0,            │
│      "generatedKwh": 900, "pH": 7.2 ... } }                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Sensor telemetry** → API endpoint (`POST /api/v1/telemetry`)
2. **Verification engine** → 5-layer checks, compute trust score (0–1)
3. **Status determination** → APPROVED (≥0.9), FLAGGED (0.7–0.9), REJECTED (<0.7)
4. **HCS logging** → Attestation message (reading + verification results + status)
5. **Carbon calculation** → If APPROVED: `ER = EG_MWh × EF_grid` (ACM0002)
6. **HTS minting** → If APPROVED + trustScore ≥ threshold: mint HREC tokens
7. **Response** → API returns status, trust score, HCS tx ID, carbon credits (if any)

### Key IDs (Hedera Testnet — Existing Infrastructure)

- **Operator Account:** `0.0.6255927`
- **HCS Audit Topic:** `0.0.7462776`
- **HREC Token:** `0.0.7964264`
- **Network:** Hedera Testnet
- **Explorer:** https://hashscan.io/testnet

> **Note:** `demo:fresh` creates NEW topic and token IDs every run. `demo:live` reuses the IDs above.

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

Example (4.87 MWh reading):
```
EG = 4.87 MWh
ER = 4.87 × 0.8 - 0 - 0 = 3.896 tCO₂e
```

**Evidence:**

- HCS attestation message contains:
  ```json
  "carbon_credits": {
    "methodology": "ACM0002",
    "ER_tCO2": 3.896,
    "EF_grid_tCO2_per_MWh": 0.8,
    "EG_MWh": 4.87
  }
  ```
- Verify on HashScan: click any APPROVED message in the HCS topic
- Code reference: `src/workflow.js` → `calculateCarbonCredits()` function

### 4.3. Claim: Real Carbon Credits

**Definition:** Each HREC token is:

- **Fungible** (HTS standard)
- **Minted only for APPROVED readings** (status check + trust score threshold)
- **1:1 backed by attested ER_tCO2** (visible on-chain)

**Evidence:**

- `demo:fresh` creates a NEW HREC token with supply starting at 0 — grows only as readings are approved
- `demo:live` mints into existing token `0.0.7964264` — supply increases by exactly the approved MWh
- Minting logic in `src/workflow.js` enforces:
  - `if (status !== 'APPROVED') { reject mint }`
  - `if (trustScore < threshold) { reject mint }`
- Fraud reading in every demo gets ZERO tokens — proven on-chain

### 4.4. Claim: Real dMRV System

**Digital MRV Definition (EBRD Protocol):**

| Component | Evidence |
|-----------|----------|
| **Monitoring** | REST API `/api/v1/telemetry` accepts plant data (flow, head, energy, pH, turbidity, temp) |
| **Reporting** | Every reading → HCS attestation with: inputs, verification results (5 layers), status, trust score, fraud flags, carbon credits |
| **Verification** | 5-layer engine: Physics, Temporal, Environmental, ML/Statistical, Consistency checks |
| **Auditability** | DID for device identity, HCS for immutable logs, HTS for credits, public HashScan explorer |
| **Reproducibility** | Full test suite (`RUN_TESTS.ps1`), `npm test` (227 tests), two demo modes |

---

## 5. COMPLETE DEMO SCRIPT (VIDEO RECORDING)

**Total time:** 10–12 minutes  
**Goal:** Show complete end-to-end workflow with REAL on-chain evidence for all four claims

---

### Pre-Recording Setup

```powershell
# Navigate to project folder
cd C:\Users\USER

# Kill any existing node processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Clear screen
cls

# Navigate to repo (if already cloned)
cd Hedera-hydropower-dMRV-with-5-layer-verification-

# Pull latest scripts
git pull

# Verify credentials
cat .env | Select-String "HEDERA"
```

**Expected output:**
```
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=302...
```

**Open browser tabs BEFORE recording:**
1. https://hashscan.io/testnet/account/0.0.6255927
2. https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-

> **Note:** For `demo:fresh`, you'll open NEW topic/token HashScan links from the output. For `demo:live`, also open:
> - https://hashscan.io/testnet/topic/0.0.7462776
> - https://hashscan.io/testnet/token/0.0.7964264

**Start screen recording (1080p, mic on)**

---

### DEMO MODE A — Complete Fresh Creation (For Judges)

> **Use this mode for the main judge presentation. Creates everything from scratch — new topic, new token, new DID, new telemetry, real mint.**

#### Step A1: Run Complete Fresh Demo

**SAY:**
> "I'm going to demonstrate the complete Hedera Hydropower dMRV system from scratch. Every single component — the audit topic, the token, the device identity, the telemetry verification, and the carbon credit minting — will be created live on Hedera testnet right now."

```powershell
npm run demo:fresh
```

**Expected output:**

```
╔========================================================╗
║  Hedera Hydropower MRV — COMPLETE FRESH DEMO        ║
║  Everything Created From Scratch                      ║
║  Apex Hackathon 2026 — Sustainability Track           ║
╚========================================================╝
  🔥 COMPLETE FRESH MODE — All new infrastructure
  ✅ Account: 0.0.6255927
────────────────────────────────────────────────────────────
  ✅ Connected to Hedera Testnet

STEP 1: Create New HCS Topic for Audit Trail
  ⏳ Creating new HCS topic for audit trail...
  ✅ Topic ID  : 0.0.XXXXXXX
  ✅ TX        : 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan  : https://hashscan.io/testnet/topic/0.0.XXXXXXX
  ℹ  All MRV attestations will be anchored to this topic

STEP 2: Create New HREC Token (HTS)
  ⏳ Creating new HREC token (HTS)...
  ✅ Token ID  : 0.0.YYYYYYY
  ✅ Token Name: HREC (Hedera Renewable Energy Credit)
  ✅ TX        : 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan  : https://hashscan.io/testnet/token/0.0.YYYYYYY
  ℹ  Each token represents 1 verified MWh

STEP 3: Register Device DID (W3C Standard)
  ⏳ Registering device DID on HCS...
  ✅ Device ID : TURBINE-APEX-2026-XXXXXXXXXX
  ✅ DID       : did:hedera:testnet:z...
  ✅ TX        : 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan  : https://hashscan.io/testnet/transaction/...
  ℹ  Device cryptographic identity registered on-chain

STEP 4: Telemetry #1 — NORMAL Reading (APPROVED)
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 4.87 MW
  Deviation: 0.16%
  Trust Score: 100% → APPROVED
  ⏳ Publishing to HCS...
  ✅ TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ✅ Reading verified and anchored to HCS
  ✓ Carbon Credits: 3.896 tCO₂

STEP 5: Telemetry #2 — FRAUD ATTEMPT (REJECTED)
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 9.5 MW  ← INFLATED
  Deviation: 94.75% (FRAUD)
  Trust Score: 60% → REJECTED
  ⏳ Publishing fraud detection to HCS...
  ✅ TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ✅ Fraud detected and logged permanently
  ✗ Carbon Credits: 0 tCO₂ (fraud = no credits)

STEP 6: Mint HREC Tokens (Approved Reading Only)
  Verified MWh : 4.87
  CO₂ credits  : 3.896 tCO₂ (EF_GRID=0.8)
  HREC tokens  : 4.87 (1 token = 1 MWh)

  Status Check:
    Reading #1: APPROVED (100% trust) → MINT
    Reading #2: REJECTED (60% trust)  → NO MINT

  ⏳ Minting 487 HREC (4.87 MWh)...
  ✅ 4.87 HREC minted — TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ℹ  Total Supply: 4.87 HREC
  Fraud reading: REJECTED → ZERO tokens minted

STEP 7: Complete On-Chain Evidence Summary
────────────────────────────────────────────────────────────
  INFRASTRUCTURE CREATED:
  1. HCS Topic  : 0.0.XXXXXXX    TX: 0.0.6255927@...
  2. HREC Token : 0.0.YYYYYYY    TX: 0.0.6255927@...
  3. Device DID : did:hedera:... TX: 0.0.6255927@...

  MRV TRANSACTIONS:
  4. APPROVED Reading (trust: 100%)   TX: 0.0.6255927@...
     Carbon: 3.896 tCO₂
  5. REJECTED Fraud (trust: 60%)      TX: 0.0.6255927@...
     Carbon: 0 tCO₂ (fraud)
  6. HREC Mint: 4.87 tokens           TX: 0.0.6255927@...

  VERIFICATION LINKS:
  ℹ  Topic   : https://hashscan.io/testnet/topic/0.0.XXXXXXX
  ℹ  Token   : https://hashscan.io/testnet/token/0.0.YYYYYYY
  ℹ  Account : https://hashscan.io/testnet/account/0.0.6255927
────────────────────────────────────────────────────────────

  🎉 COMPLETE FRESH DEMO SUCCESSFUL!

  ✅ New HCS topic created for audit trail
  ✅ New HREC token created (HTS)
  ✅ Device DID registered on-chain
  ✅ Valid reading: APPROVED with carbon credits
  ✅ Fraud reading: REJECTED with zero credits
  ✅ HREC tokens minted ONLY for approved reading
  ✅ All 6 transactions verifiable on HashScan
  ✅ Complete end-to-end dMRV system demonstrated

  Every component is REAL and on Hedera testnet.
  Carbon fraud is cryptographically impossible.
```

**SAY while running:**
- (STEP 1) "A brand new HCS topic just created — this is the immutable audit ledger for this plant"
- (STEP 2) "A brand new HREC token created — total supply starts at zero"
- (STEP 3) "Device DID registered — cryptographic identity on-chain for this turbine"
- (STEP 4) "Valid reading submitted — 100% trust score, APPROVED, carbon credits calculated using ACM0002"
- (STEP 5) "Fraud attempt — 9.5 MW reported but physics says maximum is 4.878 MW — instantly REJECTED"
- (STEP 6) "Real HTS mint transaction — supply goes from 0 to 4.87 HREC"
- (STEP 7) "Six real transactions on Hedera testnet, all verifiable right now on HashScan"

#### Step A2: Verify Live on HashScan

**SAY:**
> "Now I'll open HashScan to verify every transaction we just created."

1. Copy the **topic link** from STEP 1 output → open in browser → show 3 messages (DID + approved + fraud)
2. Click the **APPROVED message** → show the JSON with ACM0002 carbon credits
3. Click the **REJECTED message** → show flags: `PHYSICS_VIOLATION`
4. Copy the **token link** from STEP 2 output → show supply = 4.87 HREC
5. Copy the **mint TX link** from STEP 6 output → show the actual HTS mint transaction

---

### DEMO MODE B — Fast Live Demo (Reuses Infrastructure)

> **Use this after Mode A to show the fast production version. Same real minting, just reuses existing topic and token.**

#### Step B1: Run Fast Live Demo

**SAY:**
> "Now I'll show the same system in production mode — reusing the established infrastructure. New attestations and new minting every run."

```powershell
npm run demo:live
```

**Expected output:**

```
╔========================================================╗
║  Hedera Hydropower MRV — LIVE DEMO (Real Minting)   ║
║  Apex Hackathon 2026 — Sustainability Track           ║
╚========================================================╝
  🔥 LIVE MODE — Real HCS + HTS transactions
  ✅ Account: 0.0.6255927
────────────────────────────────────────────────────────────
  ✅ Connected to Hedera Testnet

STEP 1: Device DID Registration (W3C DID on Hedera)
  ✅ Device ID : TURBINE-APEX-2026-001
  ✅ DID       : did:hedera:testnet:z54555242494e452d...
  ℹ  Every turbine gets a unique cryptographic identity on Hedera

STEP 2: HREC Token (Hedera Token Service)
  ✅ Token ID  : 0.0.7964264
  ✅ Token Name: HREC (1 token = 1 verified MWh)
  ℹ  HashScan  : https://hashscan.io/testnet/token/0.0.7964264

STEP 3: Telemetry #1 — NORMAL reading
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 4.87 MW
  Trust Score: 100% → APPROVED
  ✅ TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ✅ Reading anchored to Hedera HCS — immutable audit record created

STEP 4: Telemetry #2 — FRAUD ATTEMPT
  Flow 12.5 m³/s | Head 45.2 m | Eff 0.88
  Expected: 4.878 MW | Reported: 9.5 MW  ← INFLATED (fraud)
  Trust Score: 60% → REJECTED
  ✅ TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ✅ Fraud REJECTED — evidence preserved on-chain forever

STEP 5: HREC Minting (approved reading only)
  Verified MWh : 4.87
  CO₂ credits  : 3.896 tCO₂ (EF_GRID=0.8)
  HREC tokens  : 4.87 (1 token = 1 MWh)
  Status Check : APPROVED (100% trust)

  Minting 487 HREC (4.87 MWh)...
  ✅ 4.87 HREC minted — TX: 0.0.6255927@XXXXXXXXXX.XXXXXXXXX
  ℹ  HashScan: https://hashscan.io/testnet/transaction/...
  ℹ  New Total Supply: XXXX.XX HREC
  Fraud reading status: REJECTED → NO MINTING

STEP 6: HCS Audit Trail Summary
────────────────────────────────────────────────────────────
  HCS Topic : 0.0.7462776
  HREC Token: 0.0.7964264

  #1 APPROVED (trust: 100%)
     HCS TX: 0.0.6255927@...
     Minted: 4.87 HREC

  #2 REJECTED (trust: 60%) — fraud on-chain
     HCS TX: 0.0.6255927@...
     Minted: 0 HREC (fraud = no credits)

  ✅ Every reading permanently on Hedera HCS
  ✅ HREC tokens minted ONLY for approved readings
  ✅ Fraud attempts logged but receive ZERO carbon credits
  ✅ All transactions verifiable on HashScan
  ✅ Carbon fraud is cryptographically impossible
```

**SAY:**
> "Same real minting, same real HCS attestations — just ~10 seconds instead of 60 because infrastructure already exists. This is what production looks like at scale."

**Open HashScan:**
- https://hashscan.io/testnet/topic/0.0.7462776 → scroll to latest messages
- https://hashscan.io/testnet/token/0.0.7964264 → show supply increased

---

### Step C: Production Test Suite (6 On-Chain Scenarios)

**SAY:**
> "Now I'll run the production test suite — 6 different fraud and edge case scenarios, all creating real HCS transactions."

**Open NEW PowerShell window**

**Window 1 (API Server — keep running):**
```powershell
cd C:\Users\USER\Hedera-hydropower-dMRV-with-5-layer-verification-
npm run start
```

**Expected:**
```
🚀 Hedera Hydropower MRV API v1.6.1
✅ Server: http://localhost:3000
[EngineV1] Hedera client initialized successfully
```

**Window 2 (Run Tests):**
```powershell
cd C:\Users\USER\Hedera-hydropower-dMRV-with-5-layer-verification-
.\RUN_TESTS.ps1
```

**Expected output:**
```
========================================================
  HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE
========================================================

[TEST 1] Valid APPROVED Telemetry
  Status: APPROVED | Trust Score: 0.985
  HCS TX: 0.0.6255927@...
  ✅ TEST 1 PASSED

[TEST 2] Fraud Detection - Inflated Power
  Status: FLAGGED | Physics violation detected
  HCS TX: 0.0.6255927@...
  ✅ TEST 2 PASSED - Fraud detected

[TEST 3] Environmental Violation Detection
  Status: FLAGGED | pH=4.5, turbidity=180 out of range
  HCS TX: 0.0.6255927@...
  ✅ TEST 3 PASSED - Environmental violation detected

[TEST 4] Zero-Flow Fraud Detection
  Status: REJECTED | flowRate=0 cannot generate 500 kWh
  ✅ TEST 4 PASSED - Zero-flow fraud blocked

[TEST 5] Multi-Plant Isolation
  PLANT-ALPHA HCS TX: 0.0.6255927@...
  PLANT-BETA  HCS TX: 0.0.6255927@...
  ✅ TEST 5 PASSED - Multi-plant isolation verified

[TEST 6] Replay Attack Prevention
  First:  APPROVED  TX: 0.0.6255927@...
  Second: REJECTED  TX: 0.0.6255927@...
  ✅ TEST 6 PASSED - Replay protection working

========================================================
              TESTING COMPLETE
========================================================

  ✅ TEST 1: PASSED
  ✅ TEST 2: PASSED
  ✅ TEST 3: PASSED
  ✅ TEST 4: PASSED
  ✅ TEST 5: PASSED
  ✅ TEST 6: PASSED

Summary: 6/6 tests passed
✅ ALL TESTS PASSED - PRODUCTION READY!
```

**SAY:**
> "Six production scenarios — valid readings, physics fraud, environmental violations, zero-flow fraud, multi-plant isolation, replay attack protection — all pass, all creating real HCS transactions on Hedera."

---

### Step D: Unit Test Suite (227 Tests)

**SAY:**
> "Now I'll run the full unit test suite — 227 tests across 12 suites covering every verification layer."

```powershell
npm test
```

**Expected output:**
```
Test Suites: 12 passed, 12 total
Tests:       227 passed, 227 total
Time:        ~15s
```

**SAY:**
> "227 tests, 12 suites, all passing — this covers physics verification, temporal checks, environmental monitoring, ML anomaly detection, DID management, HTS minting logic, ACM0002 calculations, and more."

---

### Step E: Cost Model

**SAY:**
> "Finally, the cost comparison that proves our 97.59% reduction claim."

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

**SAY:**
> "$203,000 per year for traditional MRV drops to $4,886 with Hedera — 97.59% reduction while maintaining full ACM0002 compliance, immutable audit trail, and real-time fraud detection."

---

## 6. ONE-SHOT VERIFICATION COMMANDS

### For PowerShell (Windows)

```powershell
# Navigate to project
cd C:\Users\USER
cd Hedera-hydropower-dMRV-with-5-layer-verification-

# Pull latest
git pull

# Verify credentials
cat .env | Select-String "HEDERA"

# ── DEMO MODE A: Complete fresh (everything new) ──
npm run demo:fresh

# ── DEMO MODE B: Fast live (reuse infrastructure) ──
npm run demo:live

# ── PRODUCTION TESTS (needs TWO windows) ──
# Window 1:
npm run start
# Window 2:
.\RUN_TESTS.ps1

# ── UNIT TESTS (227 tests, 12 suites) ──
npm test

# ── COST MODEL ──
node scripts/show-cost-model.js
```

### For Bash (Linux/macOS)

```bash
# Navigate to home
cd ~
cd Hedera-hydropower-dMRV-with-5-layer-verification-

# Pull latest
git pull

# Verify credentials
grep HEDERA .env

# ── DEMO MODE A: Complete fresh (everything new) ──
npm run demo:fresh

# ── DEMO MODE B: Fast live (reuse infrastructure) ──
npm run demo:live

# ── PRODUCTION TESTS ──
# Terminal 1:
npm run start
# Terminal 2:
node scripts/test-suite-complete.js

# ── UNIT TESTS ──
npm test

# ── COST MODEL ──
node scripts/show-cost-model.js
```

### Command Reference Table

| Command | Purpose | On-Chain TXs | Time |
|---------|---------|--------------|------|
| `npm run demo:fresh` | Complete fresh E2E demo | 6 new TXs | ~60s |
| `npm run demo:live` | Fast demo reusing infrastructure | 3 new TXs | ~10s |
| `npm run start` | Start API server for test suite | — | — |
| `.\RUN_TESTS.ps1` | 6-scenario production test suite | 8–11 new TXs | ~30s |
| `npm test` | 227 unit tests, 12 suites | 0 (unit tests) | ~15s |
| `node scripts/show-cost-model.js` | 97.59% cost reduction proof | 0 | ~1s |

---

**Document Version:** 4.0  
**Key Changes in v4.0:**
- Replaced `npm run demo` (mock minting) with `npm run demo:fresh` (real everything) and `npm run demo:live` (real minting, reuse infrastructure)
- Full expected output for both demo modes with real transaction IDs
- Updated verification checklist to reflect real on-chain evidence
- Added 227 unit test step to demo script
- Removed all references to mock/fake transactions

**Last Updated:** March 6, 2026
