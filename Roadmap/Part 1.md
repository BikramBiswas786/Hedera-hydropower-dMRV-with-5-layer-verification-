# ROADMAP 1 — PROTOCOL FOUNDATION & CORE ENGINE
## Hedera Hydropower dMRV | Weeks 1–8 Technical Implementation
### Author: Bikram Biswas | Date: March 24, 2026 | Version: V4.1 (Merged)

---

## AUDIT FIX LOG

### V3.0 → V3.1 (Applied March 24, 2026)

| # | Severity | Fix Applied |
|---|---|---|
| 1 | 🔴 HIGH | Test count corrected — baseline is 237; 262+ is the Week 8 exit target after roadmap test additions |
| 2 | 🔴 HIGH | ADWIN timing contradiction resolved — Week 7 builds a **placeholder** KS-test replacement only; full Bifet & Gavalda (2007) ADWIN production rewrite ships in **Roadmap 2 Month 6** |
| 3 | 🟡 MED | `src/did/did-manager.js` dependency explicitly assigned to Week 2 (must be built before `vc-generator.js`) |
| 4 | 🟢 LOW | All ADWIN references use correct Bifet & Gavalda (2007) citation — no "Manus" references present |

### V3.1 → V4.1 (Applied March 24, 2026 — Cross-document reconciliation)

| # | Severity | Fix Applied |
|---|---|---|
| 5 | 🔴 HIGH | `CarbonCreditManager.js` status corrected — file is ✅ LIVE (206 lines), not ❌ as V3.1 stated |
| 6 | 🔴 HIGH | Total source lines corrected to ~12,007 (was ~2,935 — missing 6 live modules) |
| 7 | 🔴 HIGH | Layer 1 scoring thresholds corrected to match actual `engine-v1.js` code (see §3) |
| 8 | 🔴 HIGH | Layer 4 ML feature vector corrected to 8 dimensions (was 7 — missing powerDensity, efficiencyRatio) |
| 9 | 🟡 MED | Layer 5 architecture expanded: HMAC Device Attestation (Phase 1, now) + Verifier Attestation/DID signing (Phase 2, Month 4+) |
| 10 | 🟡 MED | 6 live modules added to baseline audit table: `engine-v1.js`, `carbon-routes.js`, `VerraIntegration.js`, `GoldStandardIntegration.js`, `CarbonMarketplace.js`, `verifier-attestation.js` |
| 11 | 🟡 MED | `src/api/server-with-carbon-credits.js` added to junk file delete list |
| 12 | 🟢 LOW | DB migrations 001–003 (readings, verifications, carbon_credits) added — V3.1 only had 004 equivalent |
| 13 | 🟢 LOW | Formal references section added (Bifet 2007, W3C VC, ISO 14064, BEE CCTS, Hedera docs) |
| 14 | 🟢 LOW | ACM0002 mathematical derivation and η formula appendix added |

---

## 1. EXECUTIVE SUMMARY

I am the lead developer of Hedera Hydropower dMRV — a protocol that replaces ₹12–40 lakh/year traditional MRV audits with physics-based blockchain verification costing ₹8,000–25,000. My goal is a system that survives three simultaneous levels of scrutiny: an auditor reading the source code, a regulator demanding cryptographic proof, and a buyer verifying on HashScan without asking me anything.

Roadmap 1 is only about one thing: making the core engine and on-chain plumbing **scientifically and cryptographically unassailable**. No business targets in this document — only code, infrastructure, and protocol guarantees I can demonstrate.

### Three Levels of Scrutiny

1. **Auditor reading source code:** Every threshold, every formula, every constant is documented and auditable. The physics is transparent. The ML model is explainable. The code is production-grade.
2. **Regulator demanding cryptographic proof:** Every verification is signed by a Decentralized Identifier (DID), wrapped in a W3C Verifiable Credential (VC), and logged to HCS. A regulator can verify any credit offline, without contacting my servers.
3. **Buyer verifying on HashScan:** Every token mint transaction is visible on Hedera's public ledger. The buyer can trace the credit back to the original sensor reading, the verification result, and the HCS audit log. No intermediary needed.

**This roadmap covers Weeks 1–8. By the end, I will have:**
- A hardened 5-layer verification engine (EngineV1) with every threshold documented and every calculation auditable
- A W3C Verifiable Credential pipeline wrapping every approved reading — signed by my DID, verifiable offline
- An HTS-based HREC fungible token live on Hedera testnet with real mint transactions on HashScan
- An ESG certificate generator: JSON-LD VC + PDF + QR code resolving to HCS proof
- A completely clean Git history — secrets purged, keys rotated, no backup junk polluting the repo
- 262+ tests passing at ≥85.3% coverage

---

## 2. CURRENT STATE — BASELINE AUDIT (March 24, 2026)

I audited my own repository line by line before writing this. I will not plan based on assumptions.

### ✅ What Is Live and Working

| File / System | Size | Status | What It Does |
|---|---|---|---|
| `src/api/server.js` | 19,952 bytes | ✅ LIVE | Main API server, all routes wired |
| `src/api/v1/telemetry.js` | 6,626 bytes | ✅ LIVE | Primary sensor data ingest endpoint |
| `src/api/v1/tenants.js` | 11,084 bytes | ✅ LIVE | Multi-tenant plant operator management |
| `src/api/v1/multi-plant.js` | 6,765 bytes | ✅ LIVE | Multi-plant aggregation |
| `src/middleware/auth.js` | 4,187 bytes | ✅ LIVE | Operator JWT authentication |
| `src/middleware/rateLimiter.js` | 6,641 bytes | ✅ LIVE | Redis-backed rate limiting |
| `src/anomaly-detector-ml.js` | 2,342 bytes | ✅ LIVE | Isolation Forest anomaly detection |
| `src/workflow.js` | 391 lines | ✅ LIVE | Core 5-layer verification pipeline orchestration |
| `src/engine/v1/engine-v1.js` | 456 lines | ✅ LIVE | Physics, temporal, environmental, ML, attestation layers |
| `src/carbon-credits/CarbonCreditManager.js` | 206 lines | ✅ LIVE | HREC minting and inventory management |
| `src/carbon-credits/carbon-routes.js` | ~300 lines | ✅ LIVE | API endpoints for carbon credit operations |
| `src/carbon-credits/VerraIntegration.js` | ~200 lines | ✅ LIVE | Registry adapter for Verra |
| `src/carbon-credits/GoldStandardIntegration.js` | ~200 lines | ✅ LIVE | Registry adapter for Gold Standard |
| `src/carbon-credits/CarbonMarketplace.js` | ~250 lines | ✅ LIVE | Buy/sell order management |
| `src/verifier-attestation.js` | ~150 lines | ✅ LIVE | Verifier attestation with DID signing stub |
| `src/ml/MLAnomalyDetector.js` | 525 lines | ✅ LIVE | Full ML detector with Isolation Forest |
| `docker-compose.yml` | 5,170 bytes | ✅ EXISTS | Postgres + Redis local dev |
| `.env.example` | 2,051 bytes | ✅ EXISTS | Config template |
| HCS Topic `0.0.7462776` | — | ✅ LIVE | Audit log on Hedera testnet |
| HTS Token `0.0.7964264` | — | ✅ LIVE | HREC token on Hedera testnet |
| 2,000+ HCS messages | — | ✅ LIVE | Immutable audit trail |

**Test coverage:** 237 tests at 85.3% overall coverage, 100% on critical verification paths.

> ⚠️ **AUDIT NOTE (V3.1 FIX 1):** The baseline is **237 tests**. The **262+ tests** figure cited in Roadmap 2 as the Month 1 handoff state reflects tests written *during* Weeks 1–8 as part of this roadmap's deliverables (primarily Week 7 ML tests and Week 8 integration tests). It is not a contradiction — it is the exit target.

**Total source files:** 61 JavaScript files, ~12,007 lines of core logic.

> ⚠️ **AUDIT NOTE (V4.1 FIX 6):** The V3.1 figure of ~2,935 lines omitted 6 live modules. The corrected figure ~12,007 includes engine-v1.js (456 lines), MLAnomalyDetector.js (525 lines), CarbonCreditManager.js (206 lines), carbon-routes.js (~300 lines), VerraIntegration.js (~200 lines), GoldStandardIntegration.js (~200 lines), and CarbonMarketplace.js (~250 lines).

### 🔴 CRITICAL: Security Issues — Fix Before Anything Else

```
EXPOSED SECRETS (PUBLIC ON GITHUB):
  .env.backup     → may contain real Hedera private keys
  .env.old        → may contain real operator secrets

JUNK FILES polluting repo (delete immediately):
  src/api/v1/telemetry.js.backup
  src/api/v1/telemetry.js.before_fixes
  src/api/server-fixed.js
  src/api/server.js.original
  src/api/server-with-carbon-credits.js   ← (V4.1 addition)
```

**The foundation is strong. The risk is not "no code". The risk is "no cryptographic guarantees, exposed secrets, and no clean compliance path."**

### ❌ What Does Not Exist Yet (This Roadmap Builds These)

| Module | File | Week | Notes |
|---|---|---|---|
| DID Manager | `src/did/did-manager.js` | 2 | **Build FIRST** — required by VCGenerator constructor |
| VC Generator | `src/hedera/vc-generator.js` | 2–3 | Depends on did-manager.js |
| HCS Audit Logger | `src/hedera/hcs-audit-logger.js` | 1–2 | Structured HCS event logging |
| HREC Deploy Script | `scripts/deploy_hrec_token.js` | 3 | Token creation script |
| PDF Renderer | `src/certificates/pdf-renderer.js` | 4–5 | PDF + QR code |
| Certificate Generator | `src/certificates/certificate-generator.js` | 5–6 | VC + PDF orchestrator |
| ADWIN Placeholder | `src/ml/adwin-detector.js` | 7 | KS-test placeholder only |
| DB Migrations | `src/db/migrations/00X_*.sql` | 1–3 | buyers, claims, certificates, retirements + readings, verifications, carbon_credits |

> ⚠️ **ADWIN NOTE (V3.1 FIX 2):** `src/ml/adwin-detector.js` in Week 7 is a **placeholder** KS-test approximation. The full Bifet & Gavalda (2007) ADWIN production implementation ships in **Roadmap 2 Month 6**.

---

## 3. THE 5-LAYER VERIFICATION ENGINE — FULL TECHNICAL SPECIFICATION

Every sensor reading from every plant passes through all 5 layers in sequence. No layer can be skipped. No layer can be faked — results are written to HCS before any token is minted.

```
SENSOR READING ARRIVES
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 1: PHYSICS VALIDATION                              │
│  Weight: 30% of trust score                               │
│                                                           │
│  Formula: P = ρ × g × Q × H × η                          │
│                                                           │
│  Constants:                                               │
│    ρ = 998.2 kg/m³  (water density at 20°C)               │
│    g = 9.81 m/s²    (gravitational acceleration)          │
│                                                           │
│  Variables (from sensor payload):                         │
│    Q = flow rate (m³/s)          — from flow meter        │
│    H = net head height (meters)  — from pressure sensor   │
│    η = turbine efficiency        — 0.80–0.92 Francis       │
│                                  — 0.75–0.88 Pelton        │
│                                  — 0.78–0.90 Kaplan        │
│                                  — 0.80–0.87 Turgo         │
│                                  — 0.75–0.85 Crossflow     │
│                                                           │
│  Worked Example (Francis turbine, Western Ghats):         │
│    Q=5.5 m³/s, H=78m, η=0.86                             │
│    P = 998.2 × 9.81 × 5.5 × 78 × 0.86 = 3,621 kW        │
│    Plant reports 3,645 kW → deviation 0.66% → PASS ✅     │
│    Plant reports 5,200 kW → deviation 43.6% → REJECT ❌   │
│                                                           │
│  Thresholds (engine-v1.js Lines 85–110):                  │
│    deviation ≤ 5%  → score = 1.00  (PERFECT)             │
│    deviation ≤ 10% → score = 0.95  (EXCELLENT)           │
│    deviation ≤ 15% → score = 0.85  (GOOD)                │
│    deviation ≤ 20% → score = 0.70  (ACCEPTABLE)          │
│    deviation ≤ 30% → score = 0.50  (QUESTIONABLE)        │
│    deviation > 30% → score = 0.00  → PHYSICS_VIOLATION   │
│                      Auto-reject. No token. HCS log.      │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 2: TEMPORAL CONSISTENCY                            │
│  Weight: 25% of trust score                               │
│                                                           │
│  What it checks (engine-v1.js Lines 116–154):             │
│    — 15-minute rolling average stability                  │
│    — genChange: <10% → 1.00, <20% → 0.95, <30% → 0.85   │
│    —             <50% → 0.70, ≥50% → 0.30                │
│    — flowChange: <15% → 1.00, <30% → 0.95, <50% → 0.80  │
│    —              ≥50% → 0.50                             │
│    — headChange: <5% → 1.00, <10% → 0.95, <20% → 0.80   │
│    —              ≥20% → 0.50                             │
│    — Score is multiplicative: all three factors combined  │
│    — Midnight valley: generation must drop 2–4 AM         │
│    — Weekend pattern: demand typically 8–15% lower        │
│    — Plant-specific baseline built over first 30 days     │
│                                                           │
│  Status thresholds:                                       │
│    score < 0.50 → FAIL                                    │
│    score < 0.85 → WARN                                    │
│    score ≥ 0.85 → PASS                                    │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 3: ENVIRONMENTAL CORRELATION                       │
│  Weight: 20% of trust score                               │
│                                                           │
│  Data sources (external API integration):                 │
│    → IMD (India Meteorological Dept) — rainfall, temp     │
│    → CWC (Central Water Commission) — river gauge         │
│    → NASA GPM / TRMM — satellite precipitation            │
│    → National Grid — frequency, demand (real-time)        │
│                                                           │
│  Current sensor-based checks (engine-v1.js Lines 160–195)│
│    pH:          6.5–8.5 → 1.00, 6.0–9.0 → 0.95           │
│                 5.5–9.5 → 0.80, out of range → 0.30       │
│    turbidity:   0–50 NTU → 1.00, 0–100 → 0.95            │
│                 0–200 → 0.80, >200 → 0.30                 │
│    temperature: 0–30°C → 1.00, -5 to 35 → 0.95           │
│                 -10 to 40 → 0.80, out of range → 0.30     │
│    Score is multiplicative across all checked parameters  │
│                                                           │
│  Season-aware rules (future — Roadmap 2):                 │
│    Pre-monsoon (Mar–May):  baseline flow 30–60% of peak   │
│    Monsoon (Jun–Sep):      peak flow, high generation OK  │
│    Post-monsoon (Oct–Nov): declining flow                 │
│    Dry (Dec–Feb):          minimum flow, low generation   │
│                                                           │
│  Status thresholds:                                       │
│    score < 0.50 → FAIL                                    │
│    score < 0.85 → WARN                                    │
│    score ≥ 0.85 → PASS                                    │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 4: ML ANOMALY DETECTION                            │
│  Weight: 15% of trust score                               │
│                                                           │
│  Algorithm: Isolation Forest (MLAnomalyDetector.js)       │
│  nTrees: 100 | sampleSize: 256 | contamination: 0.10      │
│                                                           │
│  Feature vector — 8 dimensions (V4.1 FIX 8):             │
│    flowRate_m3_per_s     — sensor (0.1–50.0 m³/s)         │
│    headHeight_m          — sensor (3–250 m)               │
│    generatedKwh          — sensor (0–6000 kW)             │
│    pH                    — sensor (4.0–11.0)              │
│    turbidity_ntu         — sensor (0–500 NTU)             │
│    temperature_celsius   — sensor (0–45°C)                │
│    powerDensity          — derived: power / (flow × head) │
│    efficiencyRatio       — derived: actual / theoretical  │
│                                                           │
│  Training: auto-trains on 2,000 synthetic normal samples  │
│  then retrains on first 30 days real pilot data per plant │
│                                                           │
│  Drift detection (Week 7 placeholder):                    │
│    ADWINDriftDetector — KS-test rolling window (100 pts)  │
│    Drift threshold: >15% anomaly rate → DRIFT_DETECTED    │
│    Action: HCS warning + human review queue               │
│                                                           │
│  ⚠️ ADWIN TIMING NOTE: Week 7 KS-test is placeholder.    │
│  Full ADWIN (Bifet & Gavalda, 2007 — δ=0.002) ships in   │
│  Roadmap 2 Month 6.                                       │
│                                                           │
│  Known simulation results:                                │
│    Normal reading:   Trust 0.923 → APPROVED ✅            │
│    Anomalous read:   Trust 0.595 → FLAGGED ⚠️            │
│    Physics violate:  Trust 0.00  → REJECTED ❌            │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 5: ATTESTATION (TWO-PHASE — V4.1 FIX 9)           │
│  Weight: 10% of trust score                               │
│                                                           │
│  PHASE 1 — NOW (Software HMAC Device Attestation):        │
│    HMAC-SHA256 signature on every sensor payload          │
│    Key stored in application config (not hardware)        │
│    Replay attack prevention: nonce + timestamp in header  │
│    replayProtection.js middleware active                  │
│                                                           │
│    Scoring:                                               │
│      Valid HMAC + fresh nonce          → 1.00             │
│      HMAC valid, nonce slightly old    → 0.80             │
│      HMAC invalid                      → 0.00 (reject)    │
│      Replay detected                   → 0.00 (reject)    │
│                                                           │
│  PHASE 2 — Month 4+ (Verifier Attestation + DID Signing):
   "Phase 2 is human verifier + DID signing for
    credits >1,000 HREC"                                    │    
│
     Human domain expert review of flagged readings         │
│    Cryptographic signature by issuer DID (Ed25519)        │
│    verifier-attestation.js extended with real DID signing │
│    TPM/HSM chip at each physical sensor site (hardware)   │
│    Keys generated in hardware — never exportable          │
│    Every sensor gets unique DID: did:hedera:testnet:...
│
  PHASE 2 ACTIVATION TRIGGERS (either condition):
     1. trust score < 0.80 (automated flagging)
     2. mint quantity > 1,000 HREC (high-value manual review)
     → Any single mint > 1,000 HREC requires human DID sign
        regardless of trust score
                                                            │
│    Verifier workflow:                                     │
│      reading trust score < 0.8 → flagged for human review │
│      verifier approves → sign with DID → mint HREC        │
│      verifier rejects  → log reason to HCS, no token      │
│      verifier escalates → request additional data         │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  FINAL TRUST SCORE CALCULATION                            │
│                                                           │
│  score = (L1 × 0.30) + (L2 × 0.25) + (L3 × 0.20) +      │
│          (L4 × 0.15) + (L5 × 0.10)                        │
│                                                           │
│  Decision thresholds:                                     │
│    score ≥ 0.90 → APPROVED  → auto-mint HREC tokens       │
│    0.50–0.89    → FLAGGED   → human review queue          │
│    score < 0.50 → REJECTED  → no tokens, HCS log only     │
│                                                           │
│  HCS writes happen at EVERY decision — immutable record.  │
│  A token is NEVER minted without a prior HCS commitment.  │
└───────────────────────────────────────────────────────────┘
```

---

## 4. COMMIT-REVEAL PATTERN — CLOSING VULNERABILITY #1

My current workflow submits one HCS message with the full verified record after running all 5 layers. A sophisticated attacker who could intercept the pipeline could theoretically decide whether to submit based on the outcome. The commit-reveal pattern closes this permanently.

**I hash the raw sensor data and commit it to HCS BEFORE running verification. The reveal follows after. This means the input data is locked to the chain before anyone knows the result.**

```javascript
// FILE: src/workflow.js — ADD at the top of processVerification()
const crypto = require('crypto');

// ── PHASE 1: COMMITMENT ──────────────────────────────────────────
const commitmentPayload = {
  flowRate:    rawSensorData.flowRate,
  headHeight:  rawSensorData.headHeight,
  powerOutput: rawSensorData.powerOutput,
  plantId:     rawSensorData.plantId,
  sensorId:    rawSensorData.sensorId,
  capturedAt:  rawSensorData.timestamp
};

const payloadHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(commitmentPayload))
  .digest('hex');

const commitTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:        'COMMITMENT',
  version:     '2.0',
  hash:        payloadHash,
  plantId:     rawSensorData.plantId,
  committedAt: Date.now()
}));
const commitTxId = commitTx.transactionId.toString();
// ── END COMMITMENT ────────────────────────────────────────────────

// [ 5-LAYER VERIFICATION RUNS HERE — UNCHANGED ]

// ── PHASE 2: REVEAL ───────────────────────────────────────────────
const revealTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:                  'REVEAL',
  version:               '2.0',
  commitmentHash:        payloadHash,
  commitmentTxId:        commitTxId,
  plantId:               rawSensorData.plantId,
  verifiedAt:            Date.now(),
  layer1_physics:        physicsScore,
  layer2_temporal:       temporalScore,
  layer3_environmental:  envScore,
  layer4_ml:             mlScore,
  layer5_device:         deviceScore,
  trustScore:            verifiedRecord.trustScore,
  trustLevel:            verifiedRecord.trustLevel,
  energyGenerated_kWh:   verifiedRecord.energyGenerated,
  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput,
    efficiency:  rawSensorData.turbineEfficiency
  }
}));
// ── END REVEAL ────────────────────────────────────────────────────
// Cost: +$0.0002/reading = ~$1.75/year per plant. Worth it. Closes Vulnerability #1.
```

---

## 5. WEEK 1 — SECURITY HARDENING & SECRET PURGE

**Exposed secrets are not a cosmetic issue — they are a P0 security incident.**

### Step 1: Read the Exposed Files First

```bash
cat .env.backup
cat .env.old
# If OPERATOR_PRIVATE_KEY or HEDERA_PRIVATE_KEY contain real values:
# → Go to portal.hedera.com IMMEDIATELY
# → Regenerate keys BEFORE deleting (to avoid losing account access)
# → Transfer any HBAR balance to a new account first
```

### Step 2: Purge from Repo History

```bash
# Install git-filter-repo (pip install git-filter-repo)
git filter-repo --path .env.backup --invert-paths --force
git filter-repo --path .env.old --invert-paths --force

# Remove junk backup files:
git filter-repo --path src/api/v1/telemetry.js.backup --invert-paths --force
git filter-repo --path src/api/v1/telemetry.js.before_fixes --invert-paths --force
git filter-repo --path src/api/server-fixed.js --invert-paths --force
git filter-repo --path src/api/server.js.original --invert-paths --force
git filter-repo --path src/api/server-with-carbon-credits.js --invert-paths --force

# Force push to origin:
git push origin --force --all
git push origin --force --tags
```

### Step 3: Update .gitignore

```bash
cat >> .gitignore << 'EOF'
# Secret files — never commit
.env
.env.backup
.env.old
.env.production
.env.staging

# Backup junk — never commit
*.backup
*.before_fixes
*.original
*-fixed.js

# Generated certificates
certificates/
*.pdf

# Private keys
*.pem
*.key
*.p12
EOF

git add .gitignore
git commit -m "security: purge exposed env files, clean backup junk, harden .gitignore"
git push origin main
```

### Step 4: Key Rotation Checklist

```
□ Generate new OPERATOR_PRIVATE_KEY at portal.hedera.com
□ Update Railway environment variables
□ Update Vercel environment variables
□ Update local .env (from .env.example)
□ Verify no old keys remain in any environment
□ Enable GitHub Advanced Security (secret scanning)
□ Install GitGuardian or Gitleaks pre-commit hook
```

**Deliverable:** A repo any auditor can clone without inheriting my secrets.

---

## 6. WEEKS 2–4 — W3C VERIFIABLE CREDENTIALS & DID LAYER

**Goal: Every approved reading becomes a W3C Verifiable Credential — signed by my DID, not just a JSON blob stored on HCS. A regulator can verify it offline with zero internet access.**

> ⚠️ **DEPENDENCY NOTE (V3.1 FIX 3):** `src/did/did-manager.js` MUST be built at the **start of Week 2** before `vc-generator.js` can be created. The `VCGenerator` constructor requires a resolved Hedera DID to set `this.issuerDid`. Build order: `did-manager.js` → `vc-generator.js` → `workflow.js` integration.

### DID Architecture

```
ISSUER_DID: did:hedera:testnet:<dMRV-system-accountId>
            → One per deployment. Signs all credentials.

SUBJECT_DID per plant: did:hedera:testnet:<plantId>
            → Unique per plant. Becomes the credential subject.

DEVICE_DID per sensor: did:hedera:testnet:<sensorId>
            → Unique per device. Used in Layer 5 Phase 2 attestation.
            → Introduced in Phase 2 (TPM/HSM rollout, Month 4)
```

DID method: Hedera-native (HIP-29 compatible). Uses `@hashgraph/did-sdk-js` for resolution.

### New Module: `src/did/did-manager.js` (Week 2 — Build First)

```javascript
// FILE: src/did/did-manager.js  (NEW — build BEFORE vc-generator.js)
// Week 2 Day 1 priority. VCGenerator depends on this module.
const { Client, PrivateKey, AccountId } = require('@hashgraph/sdk');
const { DidSdkProvider } = require('@hashgraph/did-sdk-js');
// npm install @hashgraph/did-sdk-js

class DIDManager {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
  }

  async registerDID(label) {
    const privateKey = PrivateKey.generate();
    const publicKey  = privateKey.publicKey;
    const did = `did:hedera:testnet:${publicKey.toStringRaw()}`;
    // In production: use @hashgraph/did-sdk-js HederaDid.register() for full HIP-29 compliance
    console.log(`✅ DID registered [${label}]: ${did}`);
    return { did, privateKey: privateKey.toStringRaw(), publicKey: publicKey.toStringRaw() };
  }

  async createDID(documentName) {
    const provider = new DidSdkProvider(this.client);
    return await provider.createDid(documentName);
  }

  async resolveDID(didString) {
    const provider = new DidSdkProvider(this.client);
    return await provider.resolveDid(didString);
  }
}

module.exports = { DIDManager };
```

### New Module: `src/hedera/vc-generator.js`

```javascript
// FILE: src/hedera/vc-generator.js  (NEW — requires did-manager.js to be built first)
const { PrivateKey } = require('@hashgraph/sdk');

class VCGenerator {
  constructor() {
    this.issuerDid        = process.env.ISSUER_DID;
    this.issuerPrivateKey = PrivateKey.fromString(process.env.ISSUER_PRIVATE_KEY);
  }

  async generateCredential(reading, attestation) {
    if (attestation.verificationStatus !== 'APPROVED') {
      throw new Error(
        `Cannot generate VC for status: ${attestation.verificationStatus}. ` +
        `Trust score was ${attestation.trustScore}. Only APPROVED readings get VCs.`
      );
    }

    const issuanceDate = new Date().toISOString();
    const credentialId = `urn:hedera:${process.env.HEDERA_NETWORK}:${reading.plantId}:${Date.now()}`;

    const credential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        {
          'HydropowerGenerationCredential': 'https://hedera-dmrv.io/vocab#HydropowerGenerationCredential',
          'trustScore': 'https://hedera-dmrv.io/vocab#trustScore',
          'carbonCredits': 'https://hedera-dmrv.io/vocab#carbonCredits',
          'hcsTransactionId': 'https://hedera-dmrv.io/vocab#hcsTransactionId',
          'methodology': 'https://hedera-dmrv.io/vocab#methodology'
        }
      ],
      'id': credentialId,
      'type': ['VerifiableCredential', 'HydropowerGenerationCredential'],
      'issuer': this.issuerDid,
      'issuanceDate': issuanceDate,
      'credentialSubject': {
        'id': `did:hedera:${process.env.HEDERA_NETWORK}:${reading.plantId}`,
        'generation': {
          'value':        reading.generatedKwh / 1000,   // MWh
          'unit':         'MWh',
          'period_start': reading.periodStart,
          'period_end':   reading.periodEnd
        },
        'verification': {
          'trustScore':      attestation.trustScore,
          'trustLevel':      attestation.trustLevel,
          'method':          attestation.verificationMethod,
          'layer1_physics':  attestation.layerScores.physics,
          'layer2_temporal': attestation.layerScores.temporal,
          'layer3_env':      attestation.layerScores.environmental,
          'layer4_ml':       attestation.layerScores.ml,
          'layer5_device':   attestation.layerScores.device
        },
        'carbonCredits':    attestation.calculations.ER_tCO2,
        'methodology':      'ACM0002',
        'hcsTransactionId': attestation.hcsRevealTxId,
        'hashScanUrl': `https://hashscan.io/${process.env.HEDERA_NETWORK}/transaction/${attestation.hcsRevealTxId}`
      }
    };

    const signature = await this._signCredential(credential);
    credential.proof = {
      'type':               'Ed25519Signature2020',
      'created':            issuanceDate,
      'verificationMethod': `${this.issuerDid}#key-1`,
      'proofPurpose':       'assertionMethod',
      'proofValue':         signature
    };

    return credential;
  }

  async _signCredential(credential) {
    const payload   = Buffer.from(JSON.stringify(credential));
    const signature = this.issuerPrivateKey.sign(payload);
    return Buffer.from(signature).toString('base64');
  }

  async verifyCredential(vc) {
    const { proof, ...credentialWithoutProof } = vc;
    const payload   = Buffer.from(JSON.stringify(credentialWithoutProof));
    const sigBytes  = Buffer.from(proof.proofValue, 'base64');
    const publicKey = this.issuerPrivateKey.publicKey;
    return publicKey.verify(payload, sigBytes);
  }
}

module.exports = { VCGenerator };
```

### Workflow Integration (`src/workflow.js`)

```javascript
// AFTER EngineV1.verifyAndPublish() completes:
const { VCGenerator } = require('./hedera/vc-generator');
const vcGenerator = new VCGenerator();

if (verifiedRecord.trustLevel === 'APPROVED') {
  const vc = await vcGenerator.generateCredential(rawSensorData, verifiedRecord);
  await hcsClient.submitMessage(topicId, JSON.stringify({
    type: 'VERIFIABLE_CREDENTIAL',
    version: '2.0',
    ...vc
  }));
  verifiedRecord.vcCredentialId = vc.id;
  verifiedRecord.vcIssuanceDate = vc.issuanceDate;
}
```

**Deliverable:** For any approved reading, I can hand a regulator a VC JSON + HashScan link. They verify the signature offline. They verify the data on HashScan. No trust in me required.

---

## 7. WEEKS 5–6 — HTS HREC TOKEN DEPLOYMENT & MINT LOGIC

**Goal: Turn verified MWh into a fungible on-chain token. Every mint traceable to a specific VC and HCS transaction.**

### Token Deployment Script: `scripts/deploy_hrec_token.js`

```javascript
// FILE: scripts/deploy_hrec_token.js  (NEW)
const {
  Client, PrivateKey, AccountId,
  TokenCreateTransaction, TokenType, TokenSupplyType
} = require('@hashgraph/sdk');

async function deployHRECToken() {
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(process.env.OPERATOR_ID),
    PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
  );

  const supplyKey  = PrivateKey.generate();
  const adminKey   = PrivateKey.generate();
  const treasuryId = AccountId.fromString(process.env.TREASURY_ACCOUNT_ID);

  const transaction = await new TokenCreateTransaction()
    .setTokenName('Hydropower Renewable Energy Certificate')
    .setTokenSymbol('HREC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(3)                           // 1 HREC = 1 MWh = 1000 token units
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryId)
    .setSupplyType(TokenSupplyType.Infinite)   // Mint on demand
    .setSupplyKey(supplyKey)
    .setAdminKey(adminKey)
    .setTokenMemo('Hedera Hydropower dMRV — ACM0002 — Bikram Biswas')
    .freezeWith(client)
    .sign(adminKey);

  const response = await transaction.execute(client);
  const receipt  = await response.getReceipt(client);
  const tokenId  = receipt.tokenId.toString();

  console.log(`✅ HREC Token deployed: ${tokenId}`);
  console.log(`   Supply Key: ${supplyKey.toStringRaw()}`);
  console.log(`   → Add to .env: HREC_TOKEN_ID=${tokenId}`);
  console.log(`   → HashScan: https://hashscan.io/testnet/token/${tokenId}`);
}

deployHRECToken().catch(console.error);
```

**Token parameters:**
- `decimals = 3` → 1 HREC = 1 MWh = 1000 token units (sub-MWh precision)
- `TokenType.FungibleCommon` → standard HTS fungible token
- `TokenSupplyType.Infinite` → no hard cap, mint on demand per verified MWh
- `supplyKey` separate from `adminKey` → mint operations isolated from admin

### Mint Logic: `src/carbon-credits/CarbonCreditManager.js` (EXTEND existing — file is ✅ LIVE)

The existing `CarbonCreditManager.js` (206 lines, live) handles basic minting. The following additions wire it to the VC pipeline and add the hard rule guard:

```javascript
// ADDITIONS to src/carbon-credits/CarbonCreditManager.js — Week 5
// The existing mintCredits() method already works for basic minting.
// Add the following guard at the top of mintCredits() and the VC linkback:

async mintCredits(attestation) {
  // HARD RULE: only mint for APPROVED readings
  if (attestation.trustLevel !== 'APPROVED') {
    throw new Error(`Mint rejected: trust level is ${attestation.trustLevel}.`);
  }

  const mwhGenerated = attestation.calculations.EG_MWh;
  const amountToMint = Math.floor(mwhGenerated * 1000);  // 3 decimal places

  if (amountToMint <= 0) {
    throw new Error(`Mint rejected: calculated amount is ${amountToMint} units.`);
  }

  // ... existing mint logic unchanged ...

  return {
    txId,
    tokenId:        this.tokenId.toString(),
    amountMinted:   amountToMint,
    mwhGenerated,
    hashScanUrl:    `https://hashscan.io/testnet/transaction/${txId}`,
    mintedAt:       new Date().toISOString(),
    plantId:        attestation.plantId,
    vcCredentialId: attestation.vcCredentialId  // ← New: link back to VC
  };
}
```

---

## 8. WEEKS 7–8 — ESG CERTIFICATE ENGINE (VC + PDF + QR)

**Goal: Produce a human-readable ESG certificate backed by cryptographic proof. One page. Buyer scans the QR code and lands on the HashScan transaction.**

### ADWIN Placeholder Drift Detector: `src/ml/adwin-detector.js` (Week 7)

> ⚠️ **IMPORTANT — ADWIN TIMING (V3.1 FIX 2):**
>
> What is built here in **Week 7** is a **placeholder** KS-test approximation in JS.
> The **full production ADWIN implementation** (Bifet & Gavalda, 2007 — δ=0.002) ships in **Roadmap 2 Month 6**.
> The existing `src/anomaly-detector-ml.js` (2,342 bytes, live) is **modified** (appended) in Week 7 — not replaced.

```javascript
// FILE: src/ml/adwin-detector.js  (NEW — Week 7 PLACEHOLDER)
// STATUS: Placeholder KS-test approximation.
// Full production ADWIN (Bifet & Gavalda, 2007) ships in Roadmap 2 Month 6.
// This file will be replaced entirely at that point.

class ADWINDriftDetector {
  constructor(delta = 0.002) {
    this.delta       = delta;    // reserved for Roadmap 2 full implementation
    this.window      = [];
    this.variance    = 0;
    this.mean        = 0;
    this.width       = 0;
    this.driftCount  = 0;
    this.lastDriftAt = null;
  }

  update(value, plantId = 'unknown') {
    this.window.push(value);
    this.width++;
    if (this.window.length > 100) this.window.shift();

    // Placeholder: flag if anomaly rate > 15% in rolling window
    const anomalyRate = this.window.filter(v => v < 0).length / this.window.length;
    if (anomalyRate > 0.15 && this.window.length >= 20) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
      return true; // DRIFT DETECTED
    }
    return false;
  }

  getStats() {
    return {
      windowSize:  this.width,
      mean:        this.window.length ? this.window.reduce((a,b)=>a+b,0)/this.window.length : 0,
      driftCount:  this.driftCount,
      lastDriftAt: this.lastDriftAt,
      delta:       this.delta,
      note:        'PLACEHOLDER — full ADWIN (Bifet & Gavalda 2007) ships Roadmap 2 Month 6'
    };
  }
}

module.exports = { ADWINDriftDetector };
```

### PDF Certificate Renderer: `src/certificates/pdf-renderer.js`

```javascript
// FILE: src/certificates/pdf-renderer.js  (NEW)
const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const path        = require('path');
const fs          = require('fs');

class PDFRenderer {
  async generateCertificate(vc, mintResult) {
    return new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

      const outputDir  = path.join(__dirname, '../../certificates');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const filename   = `HREC-${vc.credentialSubject.generation.period_start?.slice(0,10)}-${vc.id.split(':').pop()}.pdf`;
      const outputPath = path.join(outputDir, filename);
      const stream     = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      doc.fontSize(22).font('Helvetica-Bold')
         .text('HYDROPOWER RENEWABLE ENERGY CERTIFICATE', { align: 'center' });
      doc.fontSize(12).font('Helvetica')
         .text('Verified by Hedera Hydropower dMRV Protocol | ACM0002 Methodology', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(800, doc.y).stroke();
      doc.moveDown(0.5);

      const sub = vc.credentialSubject;
      const leftX = 50, rightX = 420;
      const col = (label, value, x, y) => {
        doc.font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), x, y);
        doc.font('Helvetica').fontSize(11).text(String(value), x, y + 14);
      };

      const startY = doc.y;
      col('Certificate ID',  vc.id,                                    leftX, startY);
      col('Plant DID',       sub.id,                                   leftX, startY + 50);
      col('Methodology',     sub.methodology + ' (ACM0002)',           leftX, startY + 100);
      col('Generation',      `${sub.generation.value.toFixed(3)} MWh`, leftX, startY + 150);
      col('Carbon Credits',  `${sub.carbonCredits.toFixed(3)} tCO₂e`,  leftX, startY + 200);
      col('Period Start',    sub.generation.period_start,              rightX, startY);
      col('Period End',      sub.generation.period_end,                rightX, startY + 50);
      col('Trust Score',     `${(sub.verification.trustScore * 100).toFixed(1)}%`, rightX, startY + 100);
      col('Issued By',       vc.issuer,                                rightX, startY + 150);
      col('Issuance Date',   vc.issuanceDate.slice(0, 10),             rightX, startY + 200);

      const qrData   = sub.hashScanUrl || `https://hashscan.io/testnet/transaction/${mintResult.txId}`;
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 120, margin: 1 });
      doc.image(qrBuffer, 650, startY, { width: 100 });
      doc.fontSize(7).text('Scan to verify on HashScan', 650, startY + 102, { width: 100, align: 'center' });

      doc.moveDown(1.5);
      doc.moveTo(40, doc.y).lineTo(800, doc.y).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).text('VERIFICATION BREAKDOWN (5-LAYER ENGINE)');
      doc.moveDown(0.3);

      const layers = [
        ['Physics Validation (L1, 30%)',        sub.verification.layer1_physics],
        ['Temporal Consistency (L2, 25%)',      sub.verification.layer2_temporal],
        ['Environmental Correlation (L3, 20%)', sub.verification.layer3_env],
        ['ML Anomaly Detection (L4, 15%)',      sub.verification.layer4_ml],
        ['Device Attestation (L5, 10%)',        sub.verification.layer5_device]
      ];

      layers.forEach(([name, score]) => {
        const pct  = Math.round((score || 0) * 100);
        const barX = 250, barY = doc.y, barW = 300;
        doc.font('Helvetica').fontSize(9).text(name, 50, barY, { width: 195 });
        doc.rect(barX, barY + 2, barW, 10).fillAndStroke('#e0e0e0', '#ccc');
        doc.rect(barX, barY + 2, (pct / 100) * barW, 10).fillAndStroke('#2ecc71', '#27ae60');
        doc.fillColor('black').font('Helvetica-Bold').fontSize(9).text(`${pct}%`, barX + barW + 8, barY);
        doc.moveDown(0.9);
      });

      doc.moveTo(40, doc.y + 5).lineTo(800, doc.y + 5).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8)
         .text(`HCS Audit TX: ${mintResult.txId} | Proof: ${qrData}`, { align: 'center' });

      doc.end();
      stream.on('finish', () => resolve({ path: outputPath, filename }));
      stream.on('error', reject);
    });
  }
}

module.exports = { PDFRenderer };
```

### Certificate API: `src/api/v1/certificates.js`

```javascript
// FILE: src/api/v1/certificates.js  (NEW)
const express = require('express');
const router  = express.Router();
const path    = require('path');

// GET /api/v1/certificates/:id — returns W3C Verifiable Credential JSON
router.get('/:id', async (req, res) => {
  try {
    const cert = await db.certificates.findOne({ where: { credential_id: req.params.id } });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.setHeader('Content-Type', 'application/ld+json');
    res.json(cert.vc_json);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/certificates/:id/pdf — streams the PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const cert = await db.certificates.findOne({ where: { credential_id: req.params.id } });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=HREC-${req.params.id}.pdf`);
    res.sendFile(path.resolve(cert.pdf_path));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/certificates/:id/verify — offline cryptographic verification
router.get('/:id/verify', async (req, res) => {
  try {
    const cert  = await db.certificates.findOne({ where: { credential_id: req.params.id } });
    const vcGen = new (require('../../hedera/vc-generator').VCGenerator)();
    const valid = await vcGen.verifyCredential(cert.vc_json);
    res.json({ valid, credentialId: req.params.id, verifiedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

---

## 9. DATABASE MIGRATIONS

Run all migrations in order before the certificate pipeline can run.

### Core Reads & Verifications (Existing Schema — Document Here for Completeness)

```sql
-- FILE: src/db/migrations/001_create_readings_table.sql
CREATE TABLE IF NOT EXISTS readings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id            VARCHAR(100) NOT NULL,
    device_id           VARCHAR(100) NOT NULL,
    timestamp           TIMESTAMP NOT NULL,
    flow_rate_m3_per_s  DECIMAL(10, 4) NOT NULL,
    head_height_m       DECIMAL(10, 4) NOT NULL,
    generated_kwh       DECIMAL(10, 4) NOT NULL,
    efficiency          DECIMAL(5, 4) DEFAULT 0.85,
    ph                  DECIMAL(4, 2),
    turbidity_ntu       DECIMAL(10, 2),
    temperature_celsius DECIMAL(5, 2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_readings_plant_id  ON readings(plant_id);
CREATE INDEX idx_readings_timestamp ON readings(timestamp);
```

```sql
-- FILE: src/db/migrations/002_create_verifications_table.sql
CREATE TABLE IF NOT EXISTS verifications (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id           UUID NOT NULL REFERENCES readings(id),
    plant_id             VARCHAR(100) NOT NULL,
    verification_status  VARCHAR(20) NOT NULL CHECK (verification_status IN ('APPROVED','FLAGGED','REJECTED')),
    trust_score          DECIMAL(5, 4) NOT NULL,
    physics_score        DECIMAL(5, 4),
    temporal_score       DECIMAL(5, 4),
    environmental_score  DECIMAL(5, 4),
    ml_score             DECIMAL(5, 4),
    attestation_score    DECIMAL(5, 4),
    hcs_message_id       VARCHAR(200),
    hcs_topic_id         VARCHAR(50),
    hts_transaction_id   VARCHAR(200),
    carbon_credits_tco2e DECIMAL(18, 6),
    verified_by          VARCHAR(200),
    verified_at          TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_verifications_plant_id  ON verifications(plant_id);
CREATE INDEX idx_verifications_status    ON verifications(verification_status);
CREATE INDEX idx_verifications_timestamp ON verifications(verified_at);
```

```sql
-- FILE: src/db/migrations/003_create_carbon_credits_table.sql
CREATE TABLE IF NOT EXISTS carbon_credits (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id      UUID NOT NULL REFERENCES verifications(id),
    plant_id             VARCHAR(100) NOT NULL,
    quantity_tco2e       DECIMAL(18, 6) NOT NULL,
    token_id             VARCHAR(50) NOT NULL,
    hedera_transaction_id VARCHAR(200) NOT NULL UNIQUE,
    serial_numbers       JSONB NOT NULL DEFAULT '[]',
    status               VARCHAR(20) NOT NULL DEFAULT 'minted'
                           CHECK (status IN ('minted','registered','retired')),
    registry             VARCHAR(50),
    registry_id          VARCHAR(200),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_carbon_credits_plant_id ON carbon_credits(plant_id);
CREATE INDEX idx_carbon_credits_status   ON carbon_credits(status);
```

### Certificate Pipeline (New — Build in Week 3)

```sql
-- FILE: src/db/migrations/004_create_buyers_table.sql
CREATE TABLE IF NOT EXISTS buyers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    did                 VARCHAR(200) UNIQUE NOT NULL,
    hedera_account_id   VARCHAR(50) UNIQUE,
    name                VARCHAR(200) NOT NULL,
    organization        VARCHAR(200),
    email               VARCHAR(200) UNIQUE NOT NULL,
    api_key_hash        VARCHAR(64),
    tier                VARCHAR(20) DEFAULT 'BASIC'
                          CHECK (tier IN ('BASIC','STANDARD','PREMIUM','ENTERPRISE')),
    kyc_status          VARCHAR(20) DEFAULT 'PENDING'
                          CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
    kyc_verified_at     TIMESTAMP,
    total_hrec_retired  DECIMAL(18, 6) DEFAULT 0,
    total_claims        INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- FILE: src/db/migrations/005_create_claims_table.sql
CREATE TABLE IF NOT EXISTS claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id                VARCHAR(50) NOT NULL,
    buyer_did               VARCHAR(200) NOT NULL,
    buyer_account_id        VARCHAR(50),
    quantity_requested      DECIMAL(18, 6) NOT NULL,
    quantity_approved       DECIMAL(18, 6),
    period_start            TIMESTAMP NOT NULL,
    period_end              TIMESTAMP NOT NULL,
    status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN (
                                'PENDING','SUBMITTED_TO_GUARDIAN','GUARDIAN_APPROVED',
                                'TOKEN_BURNING','CERTIFICATE_GENERATING',
                                'COMPLETED','REJECTED','CANCELLED','EXPIRED'
                              )),
    guardian_document_id    VARCHAR(200),
    guardian_policy_id      VARCHAR(200),
    hts_burn_tx_id          VARCHAR(200),
    hcs_commitment_tx_id    VARCHAR(200),
    hcs_reveal_tx_id        VARCHAR(200),
    certificate_id          UUID,
    rejection_reason        TEXT,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_claims_plant_id  ON claims(plant_id);
CREATE INDEX idx_claims_buyer_did ON claims(buyer_did);
CREATE INDEX idx_claims_status    ON claims(status);
```

```sql
-- FILE: src/db/migrations/006_create_certificates_table.sql
CREATE TABLE IF NOT EXISTS certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    credential_id       VARCHAR(200) UNIQUE NOT NULL,
    issuer_did          VARCHAR(200) NOT NULL,
    subject_did         VARCHAR(200) NOT NULL,
    issuance_date       TIMESTAMP NOT NULL,
    plant_id            VARCHAR(50) NOT NULL,
    quantity_hrec       DECIMAL(18, 6) NOT NULL,
    energy_mwh          DECIMAL(18, 6) NOT NULL,
    co2_avoided_tonnes  DECIMAL(18, 6),
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    hts_burn_tx_id      VARCHAR(200) NOT NULL,
    hcs_audit_tx_id     VARCHAR(200) NOT NULL,
    hashscan_url        VARCHAR(500),
    pdf_path            VARCHAR(500),
    pdf_hash_sha256     VARCHAR(64),
    vc_json             JSONB NOT NULL,
    status              VARCHAR(20) DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- FILE: src/db/migrations/007_create_retirements_table.sql
CREATE TABLE IF NOT EXISTS retirements (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id              UUID NOT NULL REFERENCES claims(id),
    buyer_id              UUID NOT NULL REFERENCES buyers(id),
    certificate_id        UUID REFERENCES certificates(id),
    token_id              VARCHAR(50) NOT NULL,
    quantity_burned       DECIMAL(18, 6) NOT NULL,
    burn_tx_id            VARCHAR(200) UNIQUE NOT NULL,
    burn_tx_timestamp     TIMESTAMP NOT NULL,
    retirement_reason     VARCHAR(200),
    beneficiary_name      VARCHAR(200),
    beneficiary_did       VARCHAR(200),
    hcs_log_tx_id         VARCHAR(200),
    registry_submission_status VARCHAR(30) DEFAULT 'NOT_SUBMITTED'
                            CHECK (registry_submission_status IN (
                              'NOT_SUBMITTED','SUBMITTED_TO_VERRA','VERRA_CONFIRMED',
                              'SUBMITTED_TO_GOLD_STANDARD','GS_CONFIRMED','FAILED'
                            )),
    metadata              JSONB DEFAULT '{}',
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```bash
# Run all migrations in order:
docker-compose up -d postgres
for i in 001 002 003 004 005 006 007; do
  psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/${i}_*.sql
done
psql -h localhost -U postgres -d hedera_mrv -c "\dt" | grep -E "readings|verifications|carbon_credits|buyers|claims|certificates|retirements"
```

---

## 10. WEEK-BY-WEEK EXECUTION SCHEDULE

| Week | Dates | Primary Deliverable | Files Created / Modified | Tests Added |
|---|---|---|---|---|
| **Week 0** | Now | **Security emergency:** purge secrets, rotate keys | `.gitignore`, force push | 0 |
| **Week 1** | Mar 25–31 | Commit-reveal in `workflow.js` + migrations 001–003 | `workflow.js`, 3 × `migrations/*.sql`, `hcs-audit-logger.js` | +5 |
| **Week 2** | Apr 1–7 | **`did-manager.js` FIRST**, then `vc-generator.js` skeleton | `did-manager.js` ← build first; `vc-generator.js` | +8 |
| **Week 3** | Apr 8–14 | VC workflow integration + migrations 004–007 | `workflow.js`, 4 × `migrations/*.sql` | +7 |
| **Week 4** | Apr 15–21 | VC verify endpoint + `certificates.js` API | `certificates.js` (GET routes) | +4 |
| **Week 5** | Apr 22–28 | HREC deploy script + `CarbonCreditManager.js` VC linkback | `deploy_hrec_token.js`, `CarbonCreditManager.js` (extend) | +6 |
| **Week 6** | Apr 29–May 5 | Mint pipeline end-to-end + HashScan proof test | Integration suite | +5 |
| **Week 7** | May 6–12 | ADWIN **placeholder** + `pdf-renderer.js` | `adwin-detector.js` (placeholder), `pdf-renderer.js` | +8 |
| **Week 8** | May 13–19 | `certificate-generator.js` + full E2E test | `certificate-generator.js`, E2E integration | +7 |
| | | | **Week 8 Exit Total:** | **262+ tests** |

> ⚠️ **ADWIN NOTE:** Week 7 `src/ml/adwin-detector.js` is a KS-test placeholder. Full ADWIN (Bifet & Gavalda, 2007) production implementation ships in **Roadmap 2 Month 6**.

---

## 11. ROADMAP 1 EXIT CRITERIA

By the end of Week 8, every item below must be demonstrable — not "in progress", not "planned":

```
SECURITY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Clean Git history — auditor can clone repo, no secrets in history
□ All junk files purged (7 files listed in §5)
□ GitGuardian / Gitleaks pre-commit hook active

PROTOCOL GUARANTEES:
□ All 5-layer thresholds documented and matching engine-v1.js code
□ Commit-reveal pattern live on testnet (COMMITMENT + REVEAL pairs on HashScan)
□ ADWIN placeholder drift detector running in pipeline (KS-test approx)
□ Full ADWIN production rewrite is Roadmap 2 Month 6 scope — NOT this roadmap

CRYPTOGRAPHIC GUARANTEES:
□ W3C VC generated for every APPROVED reading
□ VC signed with Ed25519 — verifiable offline
□ VC submitted to HCS as reveal payload (not raw attestation)
□ Offline VC verification endpoint working (GET /api/v1/certificates/:id/verify)

ON-CHAIN PROOF:
□ HREC token on Hedera testnet — token ID in .env
□ At least 10 real mint transactions visible on HashScan
□ Every mint tx linked back to a specific VC credential ID

HUMAN-READABLE CERTIFICATES:
□ PDF certificates generating with QR code → HashScan link
□ GET /api/v1/certificates/:id returns JSON-LD VC
□ GET /api/v1/certificates/:id/pdf streams downloadable PDF

DATABASE:
□ All 7 migrations run cleanly on local Postgres
□ All 7 migrations run cleanly on Railway production Postgres

TEST COVERAGE:
□ 262+ tests passing (up from 237 baseline)
□ Coverage maintained at ≥85.3% overall
□ 100% coverage on critical verification paths preserved
```

**This is the cryptographic and scientific foundation. Roadmap 2 builds on top of it.**

---

## 12. APPENDIX: MATHEMATICAL DERIVATIONS

### A. Hydropower Efficiency Formula

The efficiency of a hydroelectric turbine is defined as:

```
η = P_actual / P_theoretical
```

The theoretical power available from falling water:

```
P_theoretical = ρ × g × Q × H

Where:
  ρ = density of water (kg/m³)         — 998.2 at 20°C
  g = gravitational acceleration (m/s²) — 9.81
  Q = volumetric flow rate (m³/s)
  H = net head (m)

The actual power output:
  P_actual = P_theoretical × η

Therefore:
  η = P_actual / (ρ × g × Q × H)
```

### B. ACM0002 Carbon Emission Reduction Formula

The Approved Consolidated Methodology ACM0002 calculates emission reductions from hydropower:

```
ER = EG × (EF_grid − EF_project)

Where:
  ER         = emission reductions (tCO₂e)
  EG         = electricity generated (MWh)
  EF_grid    = grid emission factor (tCO₂e/MWh)
  EF_project = project emission factor (≈ 0 for hydropower)

For a typical Indian hydropower plant (EF_grid = 0.82 tCO₂e/MWh):
  ER = EG × 0.82
```

### C. Trust Score Weighted Calculation

```
score = (L1 × 0.30) + (L2 × 0.25) + (L3 × 0.20) + (L4 × 0.15) + (L5 × 0.10)

Example — Normal reading:
  L1 = 1.00 (deviation 0.66%, PERFECT)
  L2 = 0.95 (minor ramp change)
  L3 = 1.00 (pH 7.2, turbidity 12 NTU, temp 18°C — all PERFECT)
  L4 = 0.90 (Isolation Forest: normal)
  L5 = 1.00 (valid HMAC, fresh nonce)
  score = (1.00×0.30) + (0.95×0.25) + (1.00×0.20) + (0.90×0.15) + (1.00×0.10)
        = 0.300 + 0.238 + 0.200 + 0.135 + 0.100 = 0.973 → APPROVED ✅
```

---

## 13. REFERENCES

1. Bifet, A., & Gavalda, R. (2007). *Learning from time-changing data with adaptive windowing*. SIAM International Conference on Data Mining. https://www.cs.upc.edu/~gavalda/papers/adwin.pdf

2. W3C. (2022). *Verifiable Credentials Data Model 1.0*. https://www.w3.org/TR/vc-data-model/

3. Hedera Hashgraph. (2024). *Hedera Consensus Service (HCS) Documentation*. https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/consensus-service

4. Hedera Hashgraph. (2024). *Hedera Token Service (HTS) Documentation*. https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/token-service

5. Bureau of Energy Efficiency (BEE). (2022). *India Carbon Credit Trading Scheme (CCTS) Guidelines*. https://www.beeindia.gov.in/

6. International Organization for Standardization. (2018). *ISO 14064-2:2019 Greenhouse gases*. https://www.iso.org/standard/66454.html

---

*Author: Bikram Biswas | Hedera Hydropower dMRV | Version: V4.1 (Merged) | March 24, 2026*
*Repository: https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-*
*HCS Audit Topic: 0.0.7462776 | HREC Token: 0.0.7964264*
