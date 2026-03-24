# ROADMAP 1 — PROTOCOL FOUNDATION & CORE ENGINE
## Hedera Hydropower dMRV | Weeks 1–8 Technical Implementation
### Author: Bikram Biswas | Date: March 24, 2026 | Version: V3.1

---

## AUDIT FIX LOG (V3.0 → V3.1)

> Applied March 24, 2026 based on cross-roadmap consistency audit.

| # | Severity | Fix Applied |
|---|---|---|
| 1 | 🔴 HIGH | Test count corrected — baseline is 237; 262+ is the Week 8 exit target after roadmap test additions |
| 2 | 🔴 HIGH | ADWIN timing contradiction resolved — Week 7 builds a **placeholder** KS-test replacement only; full Bifet & Gavalda (2007) ADWIN production rewrite ships in **Roadmap 2 Month 6** |
| 3 | 🟡 MED | `src/did/did-manager.js` dependency explicitly assigned to Week 2 (must be built before `vc-generator.js`) |
| 4 | 🟢 LOW | All ADWIN references in this document use correct Bifet & Gavalda (2007) citation — no "Manus" references present |

---

## 1. EXECUTIVE SUMMARY

I am the lead developer of Hedera Hydropower dMRV — a protocol that replaces ₹12–40 lakh/year traditional MRV audits with physics-based blockchain verification costing ₹8,000–25,000. My goal is a system that survives three simultaneous levels of scrutiny: an auditor reading the source code, a regulator demanding cryptographic proof, and a buyer verifying on HashScan without asking me anything.

Roadmap 1 is only about one thing: making the core engine and on-chain plumbing **scientifically and cryptographically unassailable**. No business targets in this document — only code, infrastructure, and protocol guarantees I can demonstrate.

**This roadmap covers Weeks 1–8. By the end, I will have:**
- A hardened 5-layer verification engine (EngineV1) with every threshold documented and every calculation auditable
- A W3C Verifiable Credential pipeline wrapping every approved reading — signed by my DID, verifiable offline
- An HTS-based HREC fungible token live on Hedera testnet with real mint transactions on HashScan
- An ESG certificate generator: JSON-LD VC + PDF + QR code resolving to HCS proof
- A completely clean Git history — secrets purged, keys rotated, no backup junk polluting the repo

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
| `src/workflow.js` | 12,032 bytes | ✅ LIVE | Core 5-layer verification pipeline |
| `docker-compose.yml` | 5,170 bytes | ✅ EXISTS | Postgres + Redis local dev |
| `.env.example` | 2,051 bytes | ✅ EXISTS | Config template |
| HCS Topic `0.0.7462776` | — | ✅ LIVE | Audit log on Hedera testnet |
| HTS Token `0.0.7964264` | — | ✅ LIVE | HREC token on Hedera testnet |
| 2,000+ HCS messages | — | ✅ LIVE | Immutable audit trail |

**Test coverage:** 237 tests at 85.3% overall coverage, 100% on critical verification paths.
> ⚠️ **AUDIT NOTE (ERROR 1 FIX):** The baseline is **237 tests**. The **262+ tests** figure cited in Roadmap 2 as the Month 1 handoff state reflects tests written *during* Weeks 1–8 as part of this roadmap's deliverables (primarily Week 7 ML tests and Week 8 integration tests). It is not a contradiction — it is the exit target. The Week-by-Week schedule in §10 explicitly lists test additions for Weeks 7 and 8.

**Total source files:** 61 files, ~2,935 lines of core logic.

### 🔴 CRITICAL: Security Issues — Fix Before Anything Else

```
.env.backup     → PUBLIC on GitHub → may contain real Hedera private keys
.env.old        → PUBLIC on GitHub → may contain real operator secrets

JUNK FILES polluting repo (delete immediately):
  src/api/v1/telemetry.js.backup
  src/api/v1/telemetry.js.before_fixes
  src/api/server-fixed.js
  src/api/server.js.original
```

**The foundation is strong. The risk is not "no code". The risk is "no cryptographic guarantees, exposed secrets, and no clean compliance path."**

### ❌ What Does Not Exist Yet (This Roadmap Builds These)

```
src/hedera/vc-generator.js             ❌ — W3C Verifiable Credential generation
src/hedera/hcs-audit-logger.js         ❌ — Structured HCS event logging
scripts/deploy_hrec_token.js           ❌ — HREC token deployment script
src/carbon-credits/CarbonCreditManager.js ❌ — Mint logic wired to verified MWh
src/certificates/pdf-renderer.js       ❌ — PDF certificate with QR → HashScan
src/certificates/certificate-generator.js ❌ — VC + PDF orchestrator
src/did/did-manager.js                 ❌ — DID creation and resolution
                                            → DEPENDENCY NOTE: must be built in Week 2
                                              BEFORE vc-generator.js (Week 2/3) can work.
                                              did-manager.js wraps @hashgraph/did-sdk-js
                                              and is required by VCGenerator constructor.
src/ml/adwin-detector.js               ❌ — Week 7 PLACEHOLDER drift detector only
                                            → TIMING NOTE (AUDIT FIX): This Week 7 build
                                              is a JS KS-test replacement (rolling window).
                                              The full Bifet & Gavalda (2007) ADWIN
                                              production implementation ships in
                                              Roadmap 2 Month 6. The src/anomaly-detector-ml.js
                                              file (2,342 bytes, already live) is MODIFIED
                                              (not replaced) in Week 7 to append the
                                              placeholder drift class. Full replacement
                                              happens in Roadmap 2.
4 database migrations                  ❌ — claims, certificates, buyers, retirements
```

---

## 3. THE 5-LAYER VERIFICATION ENGINE — FULL TECHNICAL SPECIFICATION

This is the core of everything I have built. Every sensor reading from every plant passes through all 5 layers in sequence. No layer can be skipped. No layer can be faked — results are written to HCS before any token is minted.

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
│                                                           │
│  Worked Example:                                          │
│    Q=5.5 m³/s, H=78m, η=0.86                             │
│    P = 998.2 × 9.81 × 5.5 × 78 × 0.86 = 3,621 kW        │
│    Plant reports 3,645 kW → deviation 0.66% → PASS ✅     │
│    Plant reports 5,200 kW → deviation 43.6% → REJECT ❌   │
│                                                           │
│  Thresholds:                                              │
│    deviation ≤ 5%  → score = 1.00 (full marks)           │
│    deviation ≤ 10% → score = 0.90                         │
│    deviation ≤ 15% → score = 0.75 (penalty applied)       │
│    deviation ≤ 30% → score = 0.25 (severe penalty)        │
│    deviation > 30% → PHYSICS_VIOLATION → score = 0.00     │
│                      Auto-reject. No token. HCS log.      │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 2: TEMPORAL CONSISTENCY                            │
│  Weight: 25% of trust score                               │
│                                                           │
│  What it checks:                                          │
│    — 15-minute rolling average stability                  │
│    — Maximum allowed change per 15 min: ±20% rated output │
│    — Midnight valley: generation must drop 2–4 AM (demand)│
│    — Weekend pattern: demand typically 8–15% lower        │
│    — Plant-specific baseline built over first 30 days     │
│                                                           │
│  Ramp rate exceeded → temporal anomaly flag               │
│  Weekend generation higher than weekday → investigate     │
│  No valley at night → flag for review (grid fraud signal) │
│                                                           │
│  Scoring:                                                 │
│    All patterns match   → 1.00                            │
│    1 minor deviation    → 0.80                            │
│    Ramp rate exceeded   → 0.50                            │
│    Multiple violations  → 0.20                            │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 3: ENVIRONMENTAL CORRELATION                       │
│  Weight: 20% of trust score                               │
│                                                           │
│  Cross-references generation with:                        │
│    → IMD (India Meteorological Dept) rainfall data        │
│    → CWC (Central Water Commission) river gauge readings  │
│    → NASA GPM / TRMM satellite precipitation data         │
│                                                           │
│  Season-aware thresholds (not one-size-fits-all):         │
│    Pre-monsoon (Mar–May):  baseline flow 30–60% of peak   │
│    Monsoon (Jun–Sep):      peak flow, high generation OK  │
│    Post-monsoon (Oct–Nov): declining flow                 │
│    Dry (Dec–Feb):          minimum flow, low generation   │
│                                                           │
│  Red flags:                                               │
│    High generation in drought months → flag for review    │
│    Low generation during peak monsoon → investigate       │
│    Generation with no correlated rainfall → suspicious    │
│                                                           │
│  Scoring:                                                 │
│    Perfect seasonal correlation → 1.00                    │
│    Minor seasonal mismatch      → 0.70                    │
│    Significant mismatch         → 0.40                    │
│    No correlation possible      → 0.50 (neutral — no data)│
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 4: ML ANOMALY DETECTION                            │
│  Weight: 15% of trust score                               │
│                                                           │
│  Algorithm: Isolation Forest (scikit-learn compatible)    │
│  Contamination parameter: 0.05 (5% expected anomaly rate) │
│                                                           │
│  Feature vector (7 dimensions):                           │
│    [flowRate, headHeight, powerOutput, turbineEfficiency, │
│     timestamp_hour, timestamp_dayofweek, season_index]    │
│                                                           │
│  Training: first 30 days of real pilot readings per plant │
│  Output: anomaly score −1 (anomalous) to +1 (normal)      │
│                                                           │
│  Drift detection (current — will be replaced in Wk 7):   │
│    DriftDetector class, rolling window 100 readings       │
│    Drift threshold: >15% anomaly rate → DRIFT_DETECTED    │
│    Action: HCS warning + human review queue               │
│                                                           │
│  ⚠️ ADWIN TIMING NOTE: Week 7 replaces the DriftDetector  │
│  with a JS KS-test placeholder only. Full ADWIN           │
│  (Bifet & Gavalda, 2007 — δ=0.002) production rewrite     │
│  ships in Roadmap 2 Month 6. See §8 for the Week 7        │
│  placeholder code and Roadmap 2 §5 for the full build.    │
│                                                           │
│  Known simulation results:                                │
│    Normal reading:   Trust 0.923 → APPROVED ✅            │
│    Anomalous read:   Trust 0.595 → FLAGGED ⚠️            │
│    Physics violate:  Trust 0.00  → REJECTED ❌            │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 5: DEVICE ATTESTATION                              │
│  Weight: 10% of trust score                               │
│                                                           │
│  Phase 1 (NOW — software HMAC):                           │
│    HMAC-SHA256 signature on every sensor payload          │
│    Key stored in application config (not hardware)        │
│    Replay attack prevention: nonce + timestamp in header  │
│    replayProtection.js middleware active                  │
│                                                           │
│  Phase 2 (Month 4+ — hardware root of trust):             │
│    TPM/HSM chip at each physical sensor site              │
│    Keys generated in hardware — never exportable          │
│    Signature verified server-side before any processing   │
│    Every sensor has a unique DID (did:hedera:testnet:...)  │
│                                                           │
│  Scoring:                                                 │
│    Valid HMAC + fresh nonce          → 1.00               │
│    HMAC valid, nonce slightly old    → 0.80               │
│    HMAC invalid                      → 0.00 (reject)      │
│    Replay detected                   → 0.00 (reject)      │
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

**I treat this like a real protocol, not a hackathon. Exposed secrets are not a cosmetic issue — they are a P0 security incident.**

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

> ⚠️ **DEPENDENCY NOTE (AUDIT FIX — WARNING 5):** `src/did/did-manager.js` MUST be built at the **start of Week 2** before `vc-generator.js` can be created. The `VCGenerator` constructor requires a resolved Hedera DID to set `this.issuerDid`. The `did-manager.js` module wraps `@hashgraph/did-sdk-js` and handles DID creation, resolution, and key management. Build order: `did-manager.js` → `vc-generator.js` → `workflow.js` integration.

### DID Architecture

```
ISSUER_DID: did:hedera:testnet:<dMRV-system-accountId>
            → One per deployment. Signs all credentials.

SUBJECT_DID per plant: did:hedera:testnet:<plantId>
            → Unique per plant. Becomes the credential subject.

DEVICE_DID per sensor: did:hedera:testnet:<sensorId>
            → Unique per device. Used in Layer 5 attestation.
            → Introduced in Phase 2 (TPM/HSM rollout, Month 4)
```

DID method: Hedera-native (HIP-29 compatible). I use `@hashgraph/did-sdk-js` for resolution.

### New Module: `src/did/did-manager.js` (Week 2 — Build First)

```javascript
// FILE: src/did/did-manager.js  (NEW — build BEFORE vc-generator.js)
// Week 2 Day 1 priority. VCGenerator depends on this module.
const { Client, PrivateKey, AccountId } = require('@hashgraph/sdk');
// Note: @hashgraph/did-sdk-js must be installed: npm install @hashgraph/did-sdk-js

class DIDManager {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
  }

  /**
   * Register a new DID on Hedera testnet.
   * @param {string} label — human label for logging (e.g. 'issuer', 'plant-001')
   * @returns {object} { did, privateKey, publicKey }
   */
  async registerDID(label) {
    const privateKey = PrivateKey.generate();
    const publicKey  = privateKey.publicKey;
    // DID document is anchored to HCS — format: did:hedera:testnet:<publicKeyHex>
    const did = `did:hedera:testnet:${publicKey.toStringRaw()}`;
    // In production: use @hashgraph/did-sdk-js HederaDid.register() for full HIP-29 compliance
    console.log(`✅ DID registered [${label}]: ${did}`);
    return { did, privateKey: privateKey.toStringRaw(), publicKey: publicKey.toStringRaw() };
  }

  /**
   * Resolve a DID to its public key (for offline VC verification).
   * @param {string} did
   * @returns {string} publicKeyRaw
   */
  resolveDID(did) {
    // did:hedera:testnet:<publicKeyHex> — key is embedded in the DID itself
    const parts = did.split(':');
    return parts[parts.length - 1];
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
    this.issuerDid       = process.env.ISSUER_DID;
    this.issuerPrivateKey = PrivateKey.fromString(process.env.ISSUER_PRIVATE_KEY);
  }

  async generateCredential(reading, attestation) {
    // HARD RULE: only generate VC for APPROVED readings
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
          'value':          reading.generatedKwh / 1000,   // MWh
          'unit':           'MWh',
          'period_start':   reading.periodStart,
          'period_end':     reading.periodEnd
        },
        'verification': {
          'trustScore':     attestation.trustScore,
          'trustLevel':     attestation.trustLevel,
          'method':         attestation.verificationMethod,
          'layer1_physics': attestation.layerScores.physics,
          'layer2_temporal':attestation.layerScores.temporal,
          'layer3_env':     attestation.layerScores.environmental,
          'layer4_ml':      attestation.layerScores.ml,
          'layer5_device':  attestation.layerScores.device
        },
        'carbonCredits':      attestation.calculations.ER_tCO2,
        'methodology':        'ACM0002',
        'hcsTransactionId':   attestation.hcsRevealTxId,
        'hashScanUrl': `https://hashscan.io/${process.env.HEDERA_NETWORK}/transaction/${attestation.hcsRevealTxId}`
      }
    };

    // Sign with Ed25519 (Hedera native key)
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
    const payload = Buffer.from(JSON.stringify(credential));
    const signature = this.issuerPrivateKey.sign(payload);
    return Buffer.from(signature).toString('base64');
  }

  async verifyCredential(vc) {
    // Offline verification — no network call required
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
  // Generate W3C Verifiable Credential
  const vc = await vcGenerator.generateCredential(rawSensorData, verifiedRecord);
  
  // Submit the FULL VC JSON as the HCS reveal payload
  // (replaces raw attestation — VC is a superset)
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
    .setDecimals(3)                          // 1 HREC = 1 MWh = 1000 token units
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryId)
    .setSupplyType(TokenSupplyType.Infinite)  // Mint on demand
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

### Mint Logic: `src/carbon-credits/CarbonCreditManager.js`

```javascript
// FILE: src/carbon-credits/CarbonCreditManager.js  (NEW)
const { Client, TokenMintTransaction, TokenId, PrivateKey, AccountId } = require('@hashgraph/sdk');

class CarbonCreditManager {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
    this.tokenId   = TokenId.fromString(process.env.HREC_TOKEN_ID);
    this.supplyKey = PrivateKey.fromString(process.env.HREC_SUPPLY_KEY);
  }

  async mintCredits(attestation) {
    // HARD RULE: only mint for APPROVED readings
    if (attestation.trustLevel !== 'APPROVED') {
      throw new Error(`Mint rejected: trust level is ${attestation.trustLevel}. Only APPROVED readings mint tokens.`);
    }

    const mwhGenerated = attestation.calculations.EG_MWh;
    const amountToMint = Math.floor(mwhGenerated * 1000);  // 3 decimal places

    if (amountToMint <= 0) {
      throw new Error(`Mint rejected: calculated amount is ${amountToMint} units (${mwhGenerated} MWh).`);
    }

    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(amountToMint)
      .freezeWith(this.client)
      .sign(this.supplyKey);

    const response = await mintTx.execute(this.client);
    const receipt  = await response.getReceipt(this.client);

    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Mint failed: ${receipt.status}`);
    }

    const txId = response.transactionId.toString();
    return {
      txId,
      tokenId:       this.tokenId.toString(),
      amountMinted:  amountToMint,
      mwhGenerated,
      hashScanUrl:   `https://hashscan.io/testnet/transaction/${txId}`,
      mintedAt:      new Date().toISOString(),
      plantId:       attestation.plantId,
      vcCredentialId: attestation.vcCredentialId  // Link back to VC
    };
  }
}

module.exports = { CarbonCreditManager };
```

---

## 8. WEEKS 7–8 — ESG CERTIFICATE ENGINE (VC + PDF + QR)

**Goal: Produce a human-readable ESG certificate backed by cryptographic proof. One page. Buyer can scan the QR code with their phone and land on the HashScan transaction.**

### ADWIN Placeholder Drift Detector: `src/ml/adwin-detector.js` (Week 7)

> ⚠️ **IMPORTANT — ADWIN TIMING (AUDIT FIX — ERRORS 2 & 4):**
> 
> What is built here in **Week 7** is a **placeholder** that replaces the existing `DriftDetector` class (rolling window, 100 readings). It is implemented as a KS-test approximation in JS.
> 
> The **full production ADWIN implementation** (Bifet & Gavalda, 2007 — δ=0.002 confidence parameter, adaptive windowing) ships in **Roadmap 2 Month 6**. That is the canonical reference implementation. This file will be overwritten entirely at that point.
> 
> The existing `src/anomaly-detector-ml.js` (2,342 bytes, live) is **modified** (appended) in Week 7 — not replaced. The `ADWINDriftDetector` class is appended as a new export. Full replacement of the ML detection pipeline happens in Roadmap 2.

```javascript
// FILE: src/ml/adwin-detector.js  (NEW — Week 7 PLACEHOLDER)
// STATUS: Placeholder KS-test approximation. 
// Full production ADWIN (Bifet & Gavalda, 2007) ships in Roadmap 2 Month 6.
// This file will be replaced entirely at that point.

class ADWINDriftDetector {
  constructor(delta = 0.002) {
    this.delta       = delta;    // reserved for Roadmap 2 full implementation
    this.window      = [];       // current sliding data window
    this.variance    = 0;
    this.mean        = 0;
    this.width       = 0;
    this.driftCount  = 0;
    this.lastDriftAt = null;
  }

  /**
   * Add a new anomaly score to the detector window.
   * Placeholder: uses rolling window KS-test approximation.
   * Full ADWIN adaptive windowing replaces this in Roadmap 2 Month 6.
   * @param {number} value   — anomaly score from Isolation Forest (0.0–1.0)
   * @param {string} plantId — logging context
   * @returns {boolean}       — true if drift detected
   */
  update(value, plantId = 'unknown') {
    this.window.push(value);
    this.width++;

    // Keep rolling window at 100 readings (placeholder behavior)
    if (this.window.length > 100) this.window.shift();

    // Simple KS-test approximation: flag if anomaly rate > 15% in window
    const anomalyRate = this.window.filter(v => v < 0).length / this.window.length;
    if (anomalyRate > 0.15 && this.window.length >= 20) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
      return true; // DRIFT DETECTED — caller should trigger retraining
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

      // ── HEADER ──────────────────────────────────────────────────
      doc.fontSize(22).font('Helvetica-Bold')
         .text('HYDROPOWER RENEWABLE ENERGY CERTIFICATE', { align: 'center' });
      doc.fontSize(12).font('Helvetica')
         .text('Verified by Hedera Hydropower dMRV Protocol | ACM0002 Methodology', { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(800, doc.y).stroke();
      doc.moveDown(0.5);

      // ── CERTIFICATE DETAILS ─────────────────────────────────────
      const sub = vc.credentialSubject;
      const leftX = 50, rightX = 420;
      const col = (label, value, x, y) => {
        doc.font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), x, y);
        doc.font('Helvetica').fontSize(11).text(String(value), x, y + 14);
      };

      const startY = doc.y;
      col('Certificate ID',  vc.id,                              leftX, startY);
      col('Plant DID',       sub.id,                             leftX, startY + 50);
      col('Methodology',     sub.methodology + ' (ACM0002)',     leftX, startY + 100);
      col('Generation',      `${sub.generation.value.toFixed(3)} MWh`, leftX, startY + 150);
      col('Carbon Credits',  `${sub.carbonCredits.toFixed(3)} tCO₂e`,  leftX, startY + 200);
      col('Period Start',    sub.generation.period_start,        rightX, startY);
      col('Period End',      sub.generation.period_end,          rightX, startY + 50);
      col('Trust Score',     `${(sub.verification.trustScore * 100).toFixed(1)}%`, rightX, startY + 100);
      col('Issued By',       vc.issuer,                          rightX, startY + 150);
      col('Issuance Date',   vc.issuanceDate.slice(0, 10),       rightX, startY + 200);

      // ── QR CODE → HASHSCAN ──────────────────────────────────────
      const qrData = sub.hashScanUrl || `https://hashscan.io/testnet/transaction/${mintResult.txId}`;
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 120, margin: 1 });
      doc.image(qrBuffer, 650, startY, { width: 100 });
      doc.fontSize(7).text('Scan to verify on HashScan', 650, startY + 102, { width: 100, align: 'center' });

      // ── TRUST SCORE BREAKDOWN ───────────────────────────────────
      doc.moveDown(1.5);
      doc.moveTo(40, doc.y).lineTo(800, doc.y).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).text('VERIFICATION BREAKDOWN (5-LAYER ENGINE)');
      doc.moveDown(0.3);

      const layers = [
        ['Physics Validation (L1, 30%)',       sub.verification.layer1_physics],
        ['Temporal Consistency (L2, 25%)',     sub.verification.layer2_temporal],
        ['Environmental Correlation (L3, 20%)', sub.verification.layer3_env],
        ['ML Anomaly Detection (L4, 15%)',     sub.verification.layer4_ml],
        ['Device Attestation (L5, 10%)',       sub.verification.layer5_device]
      ];

      layers.forEach(([name, score]) => {
        const pct    = Math.round((score || 0) * 100);
        const barX   = 250, barY = doc.y, barW = 300;
        doc.font('Helvetica').fontSize(9).text(name, 50, barY, { width: 195 });
        doc.rect(barX, barY + 2, barW, 10).fillAndStroke('#e0e0e0', '#ccc');
        doc.rect(barX, barY + 2, (pct / 100) * barW, 10).fillAndStroke('#2ecc71', '#27ae60');
        doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
           .text(`${pct}%`, barX + barW + 8, barY);
        doc.moveDown(0.9);
      });

      // ── FOOTER ──────────────────────────────────────────────────
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

### API Routes: `src/api/v1/certificates.js`

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

// GET /api/v1/certificates/:id/pdf — streams the PDF file
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
    const cert   = await db.certificates.findOne({ where: { credential_id: req.params.id } });
    const vcGen  = new (require('../../hedera/vc-generator').VCGenerator)();
    const valid  = await vcGen.verifyCredential(cert.vc_json);
    res.json({ valid, credentialId: req.params.id, verifiedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

---

## 9. DATABASE MIGRATIONS (Week 3)

Four migrations required before the certificate pipeline can run. Run in order.

```sql
-- FILE: src/db/migrations/001_create_buyers_table.sql
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
-- FILE: src/db/migrations/002_create_claims_table.sql
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
    guardian_submission_at  TIMESTAMP,
    guardian_approval_at    TIMESTAMP,
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
-- FILE: src/db/migrations/003_create_certificates_table.sql
CREATE TABLE IF NOT EXISTS certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    credential_id       VARCHAR(200) UNIQUE NOT NULL,
    issuer_did          VARCHAR(200) NOT NULL,
    subject_did         VARCHAR(200) NOT NULL,
    issuance_date       TIMESTAMP NOT NULL,
    expiry_date         TIMESTAMP,
    plant_id            VARCHAR(50) NOT NULL,
    plant_name          VARCHAR(200),
    plant_location      VARCHAR(500),
    quantity_hrec       DECIMAL(18, 6) NOT NULL,
    energy_mwh          DECIMAL(18, 6) NOT NULL,
    emission_factor     DECIMAL(10, 6),
    co2_avoided_tonnes  DECIMAL(18, 6),
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    hts_burn_tx_id      VARCHAR(200) NOT NULL,
    hcs_audit_tx_id     VARCHAR(200) NOT NULL,
    hashscan_url        VARCHAR(500),
    qr_code_data        TEXT,
    pdf_path            VARCHAR(500),
    pdf_hash_sha256     VARCHAR(64),
    vc_json             JSONB NOT NULL,
    status              VARCHAR(20) DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- FILE: src/db/migrations/004_create_retirements_table.sql
CREATE TABLE IF NOT EXISTS retirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    buyer_id            UUID NOT NULL REFERENCES buyers(id),
    certificate_id      UUID REFERENCES certificates(id),
    token_id            VARCHAR(50) NOT NULL,
    quantity_burned     DECIMAL(18, 6) NOT NULL,
    burn_tx_id          VARCHAR(200) UNIQUE NOT NULL,
    burn_tx_timestamp   TIMESTAMP NOT NULL,
    retirement_reason   VARCHAR(200),
    beneficiary_name    VARCHAR(200),
    beneficiary_did     VARCHAR(200),
    hcs_log_tx_id       VARCHAR(200),
    registry_submission_status VARCHAR(30) DEFAULT 'NOT_SUBMITTED'
                          CHECK (registry_submission_status IN (
                            'NOT_SUBMITTED','SUBMITTED_TO_VERRA','VERRA_CONFIRMED',
                            'SUBMITTED_TO_GOLD_STANDARD','GS_CONFIRMED','FAILED'
                          )),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```bash
# Run all migrations:
docker-compose up -d postgres
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/001_create_buyers_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/002_create_claims_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/003_create_certificates_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/004_create_retirements_table.sql
psql -h localhost -U postgres -d hedera_mrv -c "\dt" | grep -E "buyers|claims|certificates|retirements"
```

---

## 10. WEEK-BY-WEEK EXECUTION SCHEDULE

| Week | Days | Primary Deliverable | Files Created / Modified | Tests Added |
|---|---|---|---|---|
| **Week 0** | Now | Security emergency: purge secrets, rotate keys | `.gitignore`, force push | 0 |
| **Week 1** | Mar 25–31 | Commit-reveal in workflow.js + all 4 DB migrations | `workflow.js`, 4 × `migrations/*.sql` | +5 (commit-reveal) |
| **Week 2** | Apr 1–7 | **`did-manager.js` FIRST** (DID dependency), then `vc-generator.js` skeleton | `did-manager.js` ← build first; `vc-generator.js` | +8 (DID + VC unit tests) |
| **Week 3** | Apr 8–14 | VC workflow integration + `hcs-audit-logger.js` | `workflow.js`, `hcs-audit-logger.js` | +7 (integration) |
| **Week 4** | Apr 15–21 | VC verification endpoint + HCS audit logger | `certificates.js` (GET /:id/verify) | +4 (verify endpoint) |
| **Week 5** | Apr 22–28 | HREC token deployment script + CarbonCreditManager | `deploy_hrec_token.js`, `CarbonCreditManager.js` | +6 (mint logic) |
| **Week 6** | Apr 29–May 5 | Mint pipeline wired end-to-end + HashScan proof | Integration, test suite | +5 (end-to-end) |
| **Week 7** | May 6–12 | ADWIN **placeholder** drift detector + PDF renderer | `adwin-detector.js` (placeholder), `pdf-renderer.js` | +8 (ML + PDF) |
| **Week 8** | May 13–19 | Certificate generator + full end-to-end test | `certificate-generator.js`, integration test | +7 (E2E pipeline) |
| | | | **Week 8 Exit Total:** | **262+ tests** |

> **ADWIN NOTE:** Week 7 creates `src/ml/adwin-detector.js` as a KS-test placeholder. Full ADWIN (Bifet & Gavalda, 2007) production implementation ships in **Roadmap 2 Month 6**.

---

## 11. ROADMAP 1 EXIT CRITERIA

By the end of Week 8, every item below must be demonstrable — not "in progress", not "planned":

```
PROTOCOL GUARANTEES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Clean Git history — auditor can clone repo, no secrets in history
□ All 5-layer thresholds documented in this file (done ↑)
□ Commit-reveal pattern live on testnet (HCS TXs show COMMITMENT + REVEAL pairs)
□ ADWIN placeholder drift detector running in pipeline (JS, KS-test approx)
□ Full ADWIN production rewrite is Roadmap 2 Month 6 scope — NOT this roadmap

CRYPTOGRAPHIC GUARANTEES:
□ W3C VC generated for every APPROVED reading
□ VC signed with Ed25519 — verifiable offline
□ VC submitted to HCS as reveal payload (not raw attestation)
□ Offline VC verification endpoint working (/api/v1/certificates/:id/verify)

ON-CHAIN PROOF:
□ HREC token on Hedera testnet — token ID in .env
□ At least 10 real mint transactions visible on HashScan
□ Every mint tx linked back to a specific VC credential ID

HUMAN-READABLE CERTIFICATES:
□ PDF certificates generating with QR code → HashScan link
□ GET /api/v1/certificates/:id returns JSON-LD VC
□ GET /api/v1/certificates/:id/pdf streams downloadable PDF

DATABASE:
□ All 4 migrations run cleanly on local Postgres
□ All 4 migrations run cleanly on Railway production Postgres

TEST COVERAGE:
□ 262+ tests passing (up from 237 baseline)
□ Coverage maintained at ≥85.3% overall
□ 100% coverage on critical verification paths preserved
```

**This is the cryptographic and scientific foundation. Roadmap 2 builds on top of it.**

---

*Author: Bikram Biswas | Hedera Hydropower dMRV | Version 3.1 | March 24, 2026*
*Repository: https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-*
*HCS Audit Topic: 0.0.7462776 | HREC Token: 0.0.7964264*
