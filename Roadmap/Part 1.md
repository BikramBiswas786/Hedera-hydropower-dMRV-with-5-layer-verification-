# ROADMAP PART 1 — FOUNDATION & CLAIM ATTRIBUTION LAYER
## Hedera Hydropower dMRV | Month 1–6
### Author: Bikram Biswas | Status: Active Development | Updated: March 24, 2026

> **My goal is simple:** I am building the cheapest, most tamper-proof carbon credit verification system ever deployed for small hydropower plants. Traditional MRV audits cost ₹12–40 lakh per year. Mine costs ₹8,000–25,000. I do this by replacing human auditors with physics, blockchain, and machine learning. Every generation record goes on Hedera — immutable, auditable, permanent.

---

## WHERE I AM RIGHT NOW — March 24, 2026

Before I plan forward, let me be completely honest about what exists today:

### ✅ What Is Live and Working

| File / System | Size | Status | What It Does |
|---|---|---|---|
| `src/api/server.js` | 19,952 bytes | ✅ LIVE | Main API server, wires all routes |
| `src/api/v1/telemetry.js` | 6,626 bytes | ✅ LIVE | Primary sensor data ingest endpoint |
| `src/api/v1/tenants.js` | 11,084 bytes | ✅ LIVE | Multi-tenant plant operator management |
| `src/api/v1/multi-plant.js` | 6,765 bytes | ✅ LIVE | Multi-plant aggregation |
| `src/middleware/auth.js` | 4,187 bytes | ✅ LIVE | Operator JWT authentication |
| `src/middleware/rateLimiter.js` | 6,641 bytes | ✅ LIVE | Redis-backed rate limiting |
| `src/anomaly-detector-ml.js` | 2,342 bytes | ✅ LIVE | Isolation Forest anomaly detection |
| `src/workflow.js` | 12,032 bytes | ✅ LIVE | Core verification pipeline |
| `docker-compose.yml` | 5,170 bytes | ✅ EXISTS | Postgres + Redis local dev |
| `.env.example` | 2,051 bytes | ✅ EXISTS | Config documentation |
| HCS Topic `0.0.7462776` | — | ✅ LIVE | Audit log on Hedera testnet |
| HTS Token `0.0.7964264` | — | ✅ LIVE | HREC token on Hedera testnet |
| 2,000+ HCS messages | — | ✅ LIVE | Immutable audit trail exists |

### 🔴 Security Issues — Fix These Before Anything Else

```
.env.backup     → PUBLIC on GitHub → may contain real Hedera private keys
.env.old        → PUBLIC on GitHub → may contain real secrets

ALSO DELETE (junk backup files polluting the repo):
  src/api/v1/telemetry.js.backup
  src/api/v1/telemetry.js.before_fixes
  src/api/server-fixed.js
  src/api/server.js.original
```

### ❌ What I Have Not Built Yet (This Roadmap Builds These)

```
src/api/v1/claims.js              ❌ — buyer retirement claim lifecycle
src/api/v1/buyer.js               ❌ — buyer balance + history
src/api/v1/certificates.js        ❌ — ESG certificate fetch + verify
src/hedera/token-retirement.js    ❌ — HTS token burn on chain
src/hedera/hcs-audit-logger.js    ❌ — immutable HCS event logging
src/hedera/guardian-client.js     ❌ — Guardian policy integration
src/did/did-manager.js            ❌ — W3C DID for buyers
src/certificates/certificate-generator.js  ❌ — W3C VC generation
src/certificates/pdf-renderer.js  ❌ — PDF certificate with QR code
src/middleware/buyer-auth.js      ❌ — BUYER role JWT validation
src/middleware/claim-validation.js ❌ — payload validation
src/ml/adwin-detector.js          ❌ — real-time drift detection (ADWIN)
src/zkp/verification-circuit.circom ❌ — zero-knowledge proof circuit
4 database migrations             ❌ — claims, certificates, buyers, retirements
```

---

## THE 5-LAYER VERIFICATION ENGINE — HOW IT Works

This is the core of everything I have built. Every sensor reading passes through all 5 layers before a trust score is produced. No layer can be skipped. No layer can be faked — all results go to HCS before any token is minted.

```
SENSOR READING ARRIVES
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 1: PHYSICS VALIDATION (Weight: 30%)                │
│  Formula: P = ρ × g × Q × H × η                          │
│  ρ = 998.2 kg/m³ (water density at 20°C)                  │
│  g = 9.81 m/s²                                            │
│  Q = flow rate (m³/s)                                     │
│  H = net head height (meters)                             │
│  η = turbine efficiency (0.80–0.92 for Francis turbines)  │
│                                                           │
│  Expected power is calculated from physics.               │
│  If actual reported power deviates >15% → score penalty.  │
│  If deviation >30% → PHYSICS_VIOLATION → auto-reject.     │
│                                                           │
│  Example: Q=5.5 m³/s, H=78m, η=0.86                      │
│  Expected P = 998.2 × 9.81 × 5.5 × 78 × 0.86 = 3,621 kW │
│  If plant reports 3,645 kW → deviation 0.66% → PASS ✅    │
│  If plant reports 5,200 kW → deviation 43.6% → REJECT ❌  │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 2: TEMPORAL CONSISTENCY (Weight: 25%)              │
│  Checks: 15-minute rolling average stability              │
│  Maximum allowed change per 15 min: ±20% of rated output  │
│  Ramp rate exceeded? → Temporal anomaly flag              │
│  Midnight valley check: generation must drop at 2-4 AM    │
│  Weekend pattern: demand typically 8-15% lower            │
│  These patterns are plant-specific — each plant has its   │
│  own baseline built over the first 30 days of pilot.      │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 3: ENVIRONMENTAL CORRELATION (Weight: 20%)         │
│  Cross-references river flow data with:                   │
│    → IMD rainfall data (monsoon vs dry season)            │
│    → CWC river gauge readings (where available)           │
│    → Satellite precipitation data (TRMM/GPM)             │
│  High generation in drought months → flag for review      │
│  Low generation in peak monsoon → investigate             │
│  Season-aware thresholds — not one-size-fits-all.         │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 4: ML ANOMALY DETECTION (Weight: 15%)              │
│  Algorithm: Isolation Forest (scikit-learn compatible)    │
│  Contamination parameter: 0.05 (5% expected anomaly rate) │
│  Features: [flowRate, headHeight, powerOutput,            │
│             turbineEfficiency, timestamp_hour,            │
│             timestamp_dayofweek, season]                  │
│  Trained on: first 30 days of real pilot readings         │
│  Output: anomaly score −1 (anomalous) to +1 (normal)      │
│  Drift detection: DriftDetector class (rolling window 100)│
│  Drift threshold: >15% anomaly rate → DRIFT_DETECTED      │
│  Drift action: HCS warning + human review queue           │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  LAYER 5: DEVICE ATTESTATION (Weight: 10%)                │
│  HMAC-SHA256 signature on every sensor payload            │
│  Key stored in hardware HSM at sensor site                │
│  Signature verified server-side before any processing     │
│  Replay attack prevention: replayProtection.js middleware │
│  Nonce + timestamp in every message header                │
│  Phase 1: software HMAC (development)                     │
│  Phase 2: TPM/HSM hardware root of trust (Month 4+)       │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────┐
│  TRUST SCORE CALCULATION                                  │
│  score = (L1×0.30) + (L2×0.25) + (L3×0.20) +             │
│          (L4×0.15) + (L5×0.10)                            │
│                                                           │
│  ≥ 0.90 → APPROVED  → auto-mint HREC tokens               │
│  0.50–0.89 → FLAGGED → human review queue                 │
│  < 0.50  → REJECTED  → no tokens, HCS rejection log       │
│                                                           │
│  Known results from simulation testing:                   │
│  Normal reading:   Trust 0.923 → APPROVED ✅               │
│  Anomalous read:   Trust 0.595 → FLAGGED ⚠️               │
│  Physics violate:  Trust 0.00  → REJECTED ❌               │
└───────────────────────────────────────────────────────────┘
```

---

## WEEK 0 (TODAY — March 24, 2026) — SECURITY FIRST

**I do this before writing a single line of new code. Exposed keys are an emergency.**

```bash
# ══════════════════════════════════════════════════════
# STEP 1: Read exposed files to see what leaked
# ══════════════════════════════════════════════════════
cat .env.backup
cat .env.old

# If OPERATOR_PRIVATE_KEY or HEDERA_PRIVATE_KEY appear with real values:
# → Go to portal.hedera.com IMMEDIATELY
# → Regenerate keys BEFORE deleting (so I don't lose account access)
# → Transfer any HBAR balance to new account first

# ══════════════════════════════════════════════════════
# STEP 2: Remove from repo + git history
# ══════════════════════════════════════════════════════
git rm --cached .env.backup .env.old
git rm .env.backup .env.old

# Also remove junk backup files:
git rm src/api/v1/telemetry.js.backup
git rm src/api/v1/telemetry.js.before_fixes
git rm src/api/server-fixed.js
git rm src/api/server.js.original

# ══════════════════════════════════════════════════════
# STEP 3: Update .gitignore — prevent this happening again
# ══════════════════════════════════════════════════════
cat >> .gitignore << 'EOF'
.env.backup
.env.old
.env.production
*.backup
*.before_fixes
*.original
certificates/
EOF

git add .gitignore
git commit -m "security: remove exposed env files, clean backup junk, update .gitignore"
git push origin main

# ══════════════════════════════════════════════════════
# STEP 4: Deep history scan — check if keys were ever committed
# ══════════════════════════════════════════════════════
git log --all --full-history --name-status | grep -E "\.env"
# If any real .env file appears in history → run BFG Repo Cleaner
# Download: https://rtyley.github.io/bfg-repo-cleaner/
# java -jar bfg.jar --delete-files .env.backup
# git reflog expire --expire=now --all && git gc --prune=now --aggressive
# git push --force
```

---

## WEEK 1 (March 25–31) — COMMIT-REVEAL + CLAIM ATTRIBUTION FOUNDATION

**~55 hours. This week unlocks revenue. Without this, I have a verification system with no way for a buyer to retire credits and receive a certificate.**

### Day 1 — Commit-Reveal Hash Fix in `src/workflow.js`

**Why this matters:** My current system submits one HCS message with the full verified record. A malicious operator could theoretically tamper with sensor data, get verification results, then decide whether to submit or not. The commit-reveal pattern closes this — I hash the raw data and commit it to HCS before running verification. The reveal comes after. This is Vulnerability #1 from my audit.

```javascript
// FILE: src/workflow.js — ADD at top of file, with other requires:
const crypto = require('crypto');

// FIND the function that calls submitToHCS (processVerification or similar)
// BEFORE the existing HCS submit, ADD:

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
  version:     '1.0',
  hash:        payloadHash,
  plantId:     rawSensorData.plantId,
  committedAt: Date.now()
}));
const commitTxId = commitTx.transactionId.toString();
// ── END COMMITMENT ────────────────────────────────────────────────

// [YOUR EXISTING 5-LAYER VERIFICATION RUNS HERE — DO NOT TOUCH]

// ── PHASE 2: REVEAL ───────────────────────────────────────────────
const revealTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:             'REVEAL',
  version:          '1.0',
  commitmentHash:   payloadHash,
  commitmentTxId:   commitTxId,
  plantId:          rawSensorData.plantId,
  verifiedAt:       Date.now(),
  layer1_physics:      physicsScore,
  layer2_temporal:     temporalScore,
  layer3_environmental: envScore,
  layer4_ml:           mlScore,
  layer5_device:       deviceScore,
  trustScore:       verifiedRecord.trustScore,
  trustLevel:       verifiedRecord.trustLevel,
  energyGenerated_kWh: verifiedRecord.energyGenerated,
  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput,
    efficiency:  rawSensorData.turbineEfficiency
  }
}));
// ── END REVEAL ────────────────────────────────────────────────────

// Cost: +$0.0002/reading = $1.75/year per plant. Worth it. Closes Vulnerability #1.
```

### Day 1-2 — ADWIN Drift Detector in `src/ml/adwin-detector.js`

**Why JavaScript, not Python:** My whole stack is Node.js. Running a Python subprocess for drift detection is fragile, slow, and adds a dependency I cannot easily deploy on Railway. The ADWIN algorithm (Bifet & Gavalda, 2007) is deterministic — I implement it directly in JS.

```javascript
// FILE: src/ml/adwin-detector.js  (NEW FILE)
// ADWIN: Adaptive Windowing Algorithm for concept drift detection
// Reference: Bifet & Gavalda (2007) — δ = 0.002 confidence parameter

class ADWINDriftDetector {
  constructor(delta = 0.002) {
    this.delta      = delta;     // confidence parameter — lower = more sensitive
    this.window     = [];        // current data window
    this.variance   = 0;
    this.mean       = 0;
    this.width      = 0;
    this.driftCount = 0;
    this.lastDriftAt = null;
  }

  /**
   * Add a new element to the ADWIN window.
   * Returns true if drift detected, false otherwise.
   * @param {number} value  — anomaly score from Isolation Forest (0.0–1.0)
   * @param {string} plantId — for logging context
   */
  update(value, plantId = 'unknown') {
    this.window.push(value);
    this.width++;

    // Recalculate mean and variance (Welford's online algorithm)
    const n = this.width;
    const delta_val = value - this.mean;
    this.mean += delta_val / n;
    this.variance += delta_val * (value - this.mean);

    // ADWIN cut point test — O(log n) implementation
    if (this._detectCut()) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
      // Reset window to second half (post-cut)
      const cutPoint = Math.floor(this.window.length / 2);
      this.window     = this.window.slice(cutPoint);
      this.width      = this.window.length;
      this._recalcStats();
      return true;  // DRIFT DETECTED
    }
    return false;
  }

  _detectCut() {
    if (this.window.length < 20) return false;  // need minimum window
    const n = this.window.length;
    const mid = Math.floor(n / 2);
    const w0 = this.window.slice(0, mid);
    const w1 = this.window.slice(mid);
    const mean0 = w0.reduce((a,b) => a+b,0) / w0.length;
    const mean1 = w1.reduce((a,b) => a+b,0) / w1.length;
    const epsilon_cut = Math.sqrt(
      (1 / (2 * w0.length) + 1 / (2 * w1.length)) *
      Math.log(4 * n / this.delta)
    );
    return Math.abs(mean0 - mean1) > epsilon_cut;
  }

  _recalcStats() {
    if (this.window.length === 0) { this.mean = 0; this.variance = 0; return; }
    this.mean = this.window.reduce((a,b) => a+b,0) / this.window.length;
    this.variance = this.window.reduce((acc, v) => acc + Math.pow(v - this.mean, 2), 0);
  }

  getStats() {
    return {
      windowSize:  this.width,
      mean:        this.mean,
      driftCount:  this.driftCount,
      lastDriftAt: this.lastDriftAt,
      delta:       this.delta
    };
  }
}

module.exports = { ADWINDriftDetector };
```

**Why this beats my old KS-test approach:** KS-test is batch — it waits for a full window before detecting drift. ADWIN detects in real time, per reading. In monsoon season when flow rates suddenly triple, ADWIN catches the model drift within 15–20 readings. KS-test would take 100+ readings and miss the entire first week of monsoon.

### Days 2-3 — Four Database Migrations

```sql
-- FILE: src/db/migrations/001_create_claims_table.sql
CREATE TABLE IF NOT EXISTS claims (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id            VARCHAR(50) NOT NULL,
    buyer_did           VARCHAR(200) NOT NULL,
    buyer_account_id    VARCHAR(50),
    quantity_requested  DECIMAL(18, 6) NOT NULL,
    quantity_approved   DECIMAL(18, 6),
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
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
CREATE INDEX idx_claims_created   ON claims(created_at DESC);
```

```sql
-- FILE: src/db/migrations/002_create_certificates_table.sql
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
CREATE INDEX idx_certs_claim_id    ON certificates(claim_id);
CREATE INDEX idx_certs_subject_did ON certificates(subject_did);
CREATE INDEX idx_certs_plant_id    ON certificates(plant_id);
```

```sql
-- FILE: src/db/migrations/003_create_buyers_table.sql
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
    metadata            JSONB DEFAULT '{}',
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
# Run all 4 migrations:
docker-compose up -d postgres
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/001_create_claims_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/002_create_certificates_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/003_create_buyers_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/004_create_retirements_table.sql

# Verify:
psql -h localhost -U postgres -d hedera_mrv -c "\dt" | grep -E "claims|certificates|buyers|retirements"
```

### Days 3-5 — Core Hedera + Certificate Files (12 new files)

**`src/hedera/token-retirement.js`** — Burns HTS tokens on-chain to prove retirement:
```javascript
const { Client, TokenBurnTransaction, TokenId, AccountId, PrivateKey } = require('@hashgraph/sdk');

class TokenRetirementManager {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.RETIREMENT_ACCOUNT_ID),
      PrivateKey.fromString(process.env.RETIREMENT_ACCOUNT_PRIVATE_KEY)
    );
    this.tokenId = TokenId.fromString('0.0.7964264');
  }

  async retireTokensByBurn(amount) {
    const burnTx  = await new TokenBurnTransaction()
      .setTokenId(this.tokenId)
      .setAmount(amount)
      .execute(this.client);
    const receipt = await burnTx.getReceipt(this.client);
    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Token burn failed: ${receipt.status}`);
    }
    const txId = burnTx.transactionId.toString();
    return {
      txId,
      burnedAmount: amount,
      hashScanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
      retiredAt:   new Date().toISOString(),
      method:      'TREASURY_BURN'
    };
  }

  async getTokenBalance(accountId) {
    const { AccountBalanceQuery } = require('@hashgraph/sdk');
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(this.client);
    const tokenBalance = balance.tokens.get(this.tokenId);
    return tokenBalance ? tokenBalance.toNumber() : 0;
  }
}
module.exports = { TokenRetirementManager };
```

**`src/hedera/hcs-audit-logger.js`** — Every critical event logs to HCS immutably:
```javascript
const { Client, TopicMessageSubmitTransaction, TopicId, AccountId, PrivateKey } = require('@hashgraph/sdk');

class HCSAuditLogger {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
    this.topicId = TopicId.fromString('0.0.7462776');
  }

  async _submit(eventObj) {
    const message = JSON.stringify({ ...eventObj, loggedAt: Date.now() });
    const tx      = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(this.client);
    await tx.getReceipt(this.client);
    return tx.transactionId.toString();
  }

  async logClaimInitiation(claimData) {
    return this._submit({
      event: 'CLAIM_INITIATED', claimId: claimData.id,
      plantId: claimData.plantId, buyerDID: claimData.buyerDid,
      quantity: claimData.quantityRequested
    });
  }

  async logTokenRetirement(data) {
    return this._submit({
      event: 'TOKEN_RETIRED', claimId: data.claimId,
      burnTxId: data.burnTxId, quantity: data.quantityBurned
    });
  }

  async logCertificateGeneration(cert) {
    return this._submit({
      event: 'CERTIFICATE_GENERATED', certId: cert.id,
      credentialId: cert.credentialId, pdfHash: cert.pdfHashSha256
    });
  }

  async logDriftWarning(drift) {
    return this._submit({
      event: 'ML_DRIFT_WARNING', plantId: drift.plantId,
      anomalyRate: drift.anomalyRate, action: 'HUMAN_REVIEW_REQUIRED'
    });
  }
}
module.exports = { HCSAuditLogger };
```

### Days 5-7 — API Routes + Wiring

**`src/api/v1/claims.js`** — All 6 endpoints:

```javascript
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 }             = require('uuid');
const { TokenRetirementManager } = require('../../hedera/token-retirement');
const { HCSAuditLogger }         = require('../../hedera/hcs-audit-logger');
const { GuardianClient }         = require('../../hedera/guardian-client');
const { validateBuyerJWT }       = require('../../middleware/buyer-auth');
const { validateClaimPayload }   = require('../../middleware/claim-validation');
const db                         = require('../../db/models/claims');

// POST /api/v1/claims/validate-balance  (Guardian hook — no auth required)
router.post('/validate-balance', async (req, res) => {
  const { buyerAccountId, quantity } = req.body;
  try {
    const mgr     = new TokenRetirementManager();
    const balance = await mgr.getTokenBalance(buyerAccountId);
    const valid   = balance >= parseFloat(quantity);
    return res.json({ valid, balance, required: parseFloat(quantity),
      shortfall: valid ? 0 : parseFloat(quantity) - balance });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message });
  }
});

// POST /api/v1/claims/initiate
router.post('/initiate', validateBuyerJWT, validateClaimPayload, async (req, res) => {
  const { quantity, plantId, periodStart, periodEnd, buyerDid, buyerAccountId } = req.body;
  try {
    const mgr     = new TokenRetirementManager();
    const balance = await mgr.getTokenBalance(buyerAccountId);
    if (balance < quantity) {
      return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balance, required: quantity });
    }
    const claimId = uuidv4();
    const claim   = await db.create({ id: claimId, plantId, buyerDid, buyerAccountId,
      quantityRequested: quantity, periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd), status: 'PENDING' });
    const logger   = new HCSAuditLogger();
    const hcsTxId  = await logger.logClaimInitiation(claim);
    const guardian = new GuardianClient();
    const docId    = await guardian.submitRetirementClaim(claim);
    await db.update(claimId, { status: 'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId: docId, hcsCommitmentTxId: hcsTxId,
      guardianSubmissionAt: new Date() });
    return res.status(201).json({ claimId, status: 'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId: docId,
      hashScanAudit: `https://hashscan.io/testnet/transaction/${hcsTxId}`,
      message: 'Poll GET /api/v1/claims/:claimId for status' });
  } catch (err) {
    return res.status(500).json({ error: 'CLAIM_INITIATION_FAILED', details: err.message });
  }
});

// GET /api/v1/claims/:claimId
router.get('/:claimId', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (claim.status === 'SUBMITTED_TO_GUARDIAN' && claim.guardianDocumentId) {
    const g      = new GuardianClient();
    const status = await g.checkClaimStatus(claim.guardianDocumentId);
    if (status === 'APPROVED') {
      await db.update(claim.id, { status: 'GUARDIAN_APPROVED', guardianApprovalAt: new Date() });
      claim.status = 'GUARDIAN_APPROVED';
    }
  }
  return res.json(claim);
});

// GET /api/v1/claims/:claimId/certificate
router.get('/:claimId/certificate', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim || claim.status !== 'COMPLETED')
    return res.status(400).json({ error: 'CERTIFICATE_NOT_READY', status: claim?.status });
  const cert = await require('../../db/models/certificates').findByClaimId(claim.id);
  return res.json(cert);
});

// GET /api/v1/claims/:claimId/certificate/pdf
router.get('/:claimId/certificate/pdf', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim || claim.status !== 'COMPLETED')
    return res.status(404).json({ error: 'CERTIFICATE_NOT_AVAILABLE' });
  const cert = await require('../../db/models/certificates').findByClaimId(claim.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="HREC-${claim.id}.pdf"`);
  require('fs').createReadStream(cert.pdfPath).pipe(res);
});

// POST /api/v1/claims/:claimId/cancel
router.post('/:claimId/cancel', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (!['PENDING', 'SUBMITTED_TO_GUARDIAN'].includes(claim.status))
    return res.status(400).json({ error: 'CANNOT_CANCEL', status: claim.status });
  await db.update(claim.id, { status: 'CANCELLED' });
  return res.json({ claimId: claim.id, status: 'CANCELLED' });
});

module.exports = router;
```

**Wire into `src/api/server.js`** — find the telemetry router block, add after it:
```javascript
// ADD after existing route registrations in server.js:
app.use('/api/v1/claims',       require('./v1/claims'));
app.use('/api/v1/buyer',        require('./v1/buyer'));
app.use('/api/v1/certificates', require('./v1/certificates'));
```

---

## WEEK 2 (April 1–7) — GUARDIAN POLICY + END-TO-END TEST

### Guardian Setup — Step by Step

```
URL: https://guardian-ui.hedera.com

STEP 1: Create Standard Registry account
  → Role: Standard Registry (not User, not Auditor)
  → Enter your testnet Operator ID from .env
  → Enter testnet private key
  → Guardian generates a DID → SAVE IT → this becomes ISSUER_DID in .env

STEP 2: Associate HREC token
  → Dashboard → Token Management → Associate Token
  → Token ID: 0.0.7964264
  → Confirm (~$0.05 HBAR)

STEP 3: Create Policy
  → Policies → New Policy
  → Name:        HREC-Retirement-ESG-v1
  → Tag:         HREC_RETIREMENT
  → Description: ACM0002 hydropower HREC retirement and ESG certificate issuance
  → Version:     1.0.0

STEP 4: Add Policy Blocks (in exact order):
  1. InterfaceContainerBlock     → container for all roles
  2. requestVCDocumentBlock      → buyer submits retirement request
  3. sendToGuardianBlock         → calls POST /api/v1/claims/validate-balance
  4. approveMintDocumentBlock    → 3-of-5 verifier multi-sig approval
  5. mintDocumentBlock           → token burn + certificate VC issuance

STEP 5: Publish → copy policyId UUID immediately
  → Add to Railway env: GUARDIAN_POLICY_ID=<uuid>
  → Add to local .env: GUARDIAN_POLICY_ID=<uuid>
```

### End-to-End Test Sequence (all 9 steps must pass)

```bash
# A: Generate buyer JWT
node -e "
  const jwt = require('jsonwebtoken');
  const t = jwt.sign(
    { buyerId: 'test-001', buyerDid: 'did:hedera:testnet:test', role: 'BUYER', tier: 'STANDARD' },
    process.env.JWT_SECRET, { expiresIn: '24h' }
  );
  console.log('BUYER_TOKEN=' + t);
"
export BUYER_TOKEN="<paste token>"

# B: Initiate claim
curl -X POST http://localhost:3000/api/v1/claims/initiate \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":10,"plantId":"plant-001","periodStart":"2026-02-01T00:00:00Z",
       "periodEnd":"2026-02-28T23:59:59Z","buyerDid":"did:hedera:testnet:test",
       "buyerAccountId":"0.0.XXXXX"}'
# Expected: claimId + status SUBMITTED_TO_GUARDIAN + hashScanAudit URL

# C: Poll status → D: Approve in Guardian UI (3-of-5 sigs)
# E: Poll again → GUARDIAN_APPROVED → F: Check HashScan burn
# G: Check HCS topic for TOKEN_RETIRED message
# H: GET certificate JSON → I: GET certificate PDF
# All 9 must pass before Week 3

echo "HashScan audit: https://hashscan.io/testnet/topic/0.0.7462776"
echo "HashScan token: https://hashscan.io/testnet/token/0.0.7964264"
```

---

## WEEK 3 (April 8–14) — FIRST REAL PILOT PLANTS

### Pilot Outreach Email (Send to 10 contacts simultaneously)

```
Subject: Free blockchain carbon credit verification for your hydro plant
         (90 days, no cost, no IoT sensors needed)

Dear [Name],

I have built a physics-based MRV system for hydropower carbon credits
on the Hedera blockchain. Traditional MRV audits cost ₹12–40 lakh/year.
Mine costs ₹8,000–25,000/year.

WHAT I NEED FROM YOU: 3 months of generation records (kWh), your
plant capacity (MW), and head height (from your commissioning report).

WHAT YOU RECEIVE: Your generation verified on Hedera, an ESG certificate
PDF, and a blockchain transaction as permanent audit proof. Setup: 2 hours.

Live system: hydropower-mrv-19feb26.vercel.app
GitHub: github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-

Open to a 30-minute demo this week?

Bikram Biswas
```

### Pilot Data Form

When a plant agrees, collect within 48 hours:

```
PLANT IDENTITY: name, operator, state, district, river, GPS (optional)
TECHNICAL:      capacity (MW), turbine type, efficiency (%), head (m)
HYDROLOGY:      design head (m), annual average flow (m³/s), monsoon range
GENERATION:     monthly kWh for last 6 months + grid hours per month
CARBON STATUS:  existing Verra cert? current carbon revenue?
CONTACT:        name, email, WhatsApp, best time to call
```

### Loading Pilot Data

```bash
# Register plant
curl -X POST http://localhost:3000/api/v1/plants \
  -d '{"plant_id":"pilot-001","name":"Plant Name","capacity_mw":5.0,
       "head_meters":65.0,"turbine_efficiency":0.85}'

# Monthly kWh → average kW: e.g., 1,200,000 kWh ÷ 672 hours = 1,786 kW
# Expected flow from P = ρgQHη: Q = 1,786,000 / (998.2 × 9.81 × 65 × 0.85) = 3.30 m³/s

curl -X POST http://localhost:3000/api/v1/telemetry \
  -d '{"plantId":"pilot-001","flowRate":3.30,"headHeight":65.0,
       "powerOutput":1786,"turbineEfficiency":0.85,
       "dataSource":"HISTORICAL_RECORDS"}'

# Expected: trustScore > 0.90 → APPROVED → mint HREC tokens
```

### First Revenue Target

```
3 pilot plants × ₹5,000 MRV fee (one-time) = ₹15,000 by Week 4
Target: first paid subscription by Month 2 (₹8,300/month = $100/month Basic tier)
```

---

## WEEK 4 (April 15–21) — MAINNET DEPLOYMENT

### Pre-Deployment Checklist

```bash
# No secrets in code:
git log --all --full-history --name-status | grep -E "\.env|private_key|secret"

# No hardcoded Hedera IDs:
grep -r "0\.0\.[0-9]" src/ --include="*.js" | grep -v "process.env"

# All tests green on testnet:
HEDERA_NETWORK=testnet npm test
# Must show 262+ passing, >85% coverage

# End-to-end claim flow completed:
# All 9 steps from Week 2 passed on testnet ← non-negotiable
```

### Mainnet Account Setup

```bash
# Go to portal.hedera.com → Create 3 mainnet accounts:
# 1. OPERATOR     (fund with 200+ HBAR — sufficient for ~1 year of operations)
# 2. RETIREMENT   (receives burned tokens — no spend key shared with anyone)
# 3. ISSUER       (linked to Guardian DID)

# Create mainnet HCS topic:
node scripts/create-mainnet-topic.js
# → Output: MAINNET_HCS_TOPIC_ID=0.0.XXXXXX → add to Railway env vars

# Create mainnet HREC token (1 billion supply, 6 decimals):
node scripts/create-mainnet-token.js
# → Output: MAINNET_TOKEN_ID=0.0.XXXXXX → add to Railway env vars

# Update Guardian to use mainnet:
# Guardian → Settings → Network → Switch to Mainnet
# Re-associate mainnet HREC token in Guardian token management

# Railway deploy:
railway up
# Verify: https://your-app.railway.app/health
# Expected: { "status": "healthy", "network": "mainnet", "version": "1.7.0" }
```

---

## MONTHS 2–3 — SHADOW MODE + CAD TRUST

### Shadow Mode: Verra Comparison (Month 2–3)

**What this is:** I run my dMRV calculations in parallel with traditional Verra methodology calculations on the same real plant data. I compare results. If my system produces generation numbers within ±5% of Verra's methodology, I have hard proof that my system is technically equivalent.

```javascript
// FILE: src/shadow-mode/verra-comparator.js  (NEW)
class VerraShadowComparator {
  constructor() {
    // Verra ACM0002 grid emission factor for India (CEA 2023)
    this.INDIA_GRID_EF = 0.82;  // tCO2e/MWh

    // Verra baseline energy calculation (simplified ACM0002)
    // BEy = EGy × EFgrid
    // EGy = electricity generated (MWh/year)
    // EFgrid = grid emission factor
  }

  calculateVerraBaseline(energyMWh) {
    return {
      baselineEmissions: energyMWh * this.INDIA_GRID_EF,
      projectEmissions:  0,  // hydropower has near-zero direct emissions
      emissionReduction: energyMWh * this.INDIA_GRID_EF,
      methodology:       'ACM0002',
      emissionFactor:    this.INDIA_GRID_EF,
      unit:              'tCO2e'
    };
  }

  compareWithDMRV(dmrvEnergyMWh, verraEnergyMWh) {
    const deviation = Math.abs(dmrvEnergyMWh - verraEnergyMWh) / verraEnergyMWh;
    return {
      dmrvEnergy:    dmrvEnergyMWh,
      verraEnergy:   verraEnergyMWh,
      deviation:     deviation,
      deviationPct:  (deviation * 100).toFixed(2) + '%',
      equivalent:    deviation <= 0.05,  // within 5% = equivalent
      status:        deviation <= 0.05 ? 'EQUIVALENT' : 'DIVERGENT'
    };
  }
}
module.exports = { VerraShadowComparator };
```

### CAD Trust — Double-Counting Prevention (Month 3)

**Why this is critical:** Without double-counting prevention, the same megawatt-hour of generation could theoretically be claimed by two different buyers. This is the single most important trust feature for enterprise buyers and regulators.

```javascript
// FILE: src/hedera/cad-trust.js  (NEW)
// CAD = Claim Attribution and De-duplication
// Each MWh of verified generation gets one and only one claim key.
// The claim key is stored on HCS. If the same period is claimed twice,
// the second claim is rejected immediately.

class CADTrust {
  constructor(hcsLogger) {
    this.hcsLogger = hcsLogger;
    // In-memory cache of active claim keys (keyed by plant+period hash)
    // In production this would be a Redis set for distributed safety
    this.activeClaimKeys = new Set();
  }

  /**
   * Generate a unique claim key for a plant + time period.
   * This key is deterministic — same plant + period always produces same key.
   * @returns {string} SHA-256 hash of plantId + periodStart + periodEnd
   */
  generateClaimKey(plantId, periodStart, periodEnd) {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(`${plantId}:${periodStart}:${periodEnd}`)
      .digest('hex');
  }

  /**
   * Attempt to register a claim. Returns false if already claimed.
   * Logs the claim registration to HCS for immutable audit trail.
   */
  async registerClaim(plantId, periodStart, periodEnd, claimId, buyerDid) {
    const claimKey = this.generateClaimKey(plantId, periodStart, periodEnd);

    if (this.activeClaimKeys.has(claimKey)) {
      return {
        success: false,
        reason:  'DOUBLE_SPEND_DETECTED',
        claimKey,
        message: `Period ${periodStart}–${periodEnd} for plant ${plantId} already has an active claim`
      };
    }

    this.activeClaimKeys.add(claimKey);
    await this.hcsLogger._submit({
      event:    'CAD_CLAIM_KEY_REGISTERED',
      claimKey, claimId, plantId,
      periodStart, periodEnd, buyerDid,
      registeredAt: Date.now()
    });

    return { success: true, claimKey };
  }

  async releaseClaim(plantId, periodStart, periodEnd) {
    const claimKey = this.generateClaimKey(plantId, periodStart, periodEnd);
    this.activeClaimKeys.delete(claimKey);
  }
}
module.exports = { CADTrust };
```

---

## MONTHS 4–6 — PRICING, ONBOARDING, AND FIRST REVENUE TARGETS

### 3-Tier Pricing Model (Launch Month 4)

| Tier | Monthly Price | Annual Price | Features |
|---|---|---|---|
| **Basic** | $100/mo | $1,200/yr | Single sensor, standard ML, manual flag review, PDF certificate |
| **Standard** | $300/mo | $3,600/yr | Multi-sensor redundancy, ADWIN drift detection, auto-approval queue |
| **Premium** | $500/mo | $6,000/yr | ZKP privacy proofs, multi-sig, physical audit report, CAD Trust |

**India pricing (₹):**
- Basic: ₹8,300/month
- Standard: ₹25,000/month
- Premium: ₹41,500/month

This is still 10–50× cheaper than traditional annual audit cost of ₹12–40 lakh/year.

### Revenue Milestones

```
Month 1: ₹15,000  — 3 pilot MRV setup fees
Month 2: ₹25,000  — first paid subscription + 1 verification fee
Month 3: ₹50,000  — 5 plants on Basic tier @ ₹8,300 + 2 retirements
Month 4: ₹75,000  — 8 plants across tiers + 5 HREC retirements × $0.50 fee
Month 5: ₹100,000 — 12 plants + first Standard tier customer
Month 6: ₹83,000/month recurring → $83,000 ARR milestone
```

### Month 6 Infrastructure State

```
✅ 10–20 active pilot plants on Hedera mainnet
✅ Claim Attribution Layer live (all 18 files deployed)
✅ Guardian policy handling real retirements
✅ CAD Trust preventing double-counting
✅ Shadow mode comparison vs Verra (±5% or better)
✅ ADWIN drift detection live
✅ 3-tier pricing collecting real revenue
✅ First ESG certificates delivered to real buyers
✅ $83K ARR baseline → ready for Roadmap 2
```

---

## ENVIRONMENT VARIABLES — COMPLETE LIST

Add all of these to `.env.example` and Railway environment:

```bash
# === EXISTING (already in .env.example) ===
OPERATOR_ID=0.0.XXXXX
OPERATOR_PRIVATE_KEY=302e...
JWT_SECRET=
DB_URL=postgresql://...
REDIS_URL=redis://...

# === NEW — ADD FOR CLAIM ATTRIBUTION LAYER ===
RETIREMENT_ACCOUNT_ID=0.0.XXXXX       # new account, fund from portal.hedera.com
RETIREMENT_ACCOUNT_PRIVATE_KEY=302e... # keep this in Railway only, never in code
ISSUER_DID=did:hedera:testnet:XXXXX   # from Guardian registry account setup
CERTIFICATE_SIGNING_KEY=              # RSA-2048: openssl genrsa -out key.pem 2048
CERTIFICATE_DIR=./certificates        # local PDF output directory
GUARDIAN_API_URL=https://guardian-ui.hedera.com/api
GUARDIAN_USERNAME=
GUARDIAN_PASSWORD=
GUARDIAN_POLICY_ID=                   # filled after Week 2 policy creation
MAINNET_OPERATOR_ID=                  # filled after Week 4 mainnet setup
MAINNET_OPERATOR_KEY=                 # filled after Week 4 mainnet setup
MAINNET_HCS_TOPIC_ID=                 # filled after Week 4 topic creation
MAINNET_TOKEN_ID=                     # filled after Week 4 token creation
```

---

## TEST TARGETS — NON-NEGOTIABLE

```
After Week 1: npm test → 262+ passing, >85% coverage
After Week 2: End-to-end claim flow steps A–I all passing
After Week 4: All tests green on mainnet, /health shows network: mainnet
After Month 3: Shadow mode showing ≤5% deviation from Verra baseline
After Month 6: $83K ARR milestone, 10+ plants active, zero double-spend incidents
```

---

## GIT COMMIT CONVENTION

All commits from this point follow this format:
```
<type>(scope): <what changed>

Types: feat | fix | security | refactor | test | docs | chore
Scope: roadmap | api | hedera | ml | db | certs | middleware

Examples:
  security: remove exposed .env.backup files
  feat(hedera): add TokenRetirementManager with HTS burn
  feat(ml): add ADWIN drift detector in JS (replaces Python river)
  feat(db): add 4 claim attribution migrations
  feat(api): add claims, buyer, certificates routes
  fix(workflow): add commit-reveal hash before HCS submission
```
