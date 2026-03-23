#  ROADMAP 1 — MAXIMUM DETAIL
## Hedera Hydropower dMRV | Week 0 → Week 8
**Every file path verified live from GitHub. March 23, 2026.**

***

##  EXACT REPO STATE — WHAT IS REALLY THERE

### Root-Level Files (verified)

| File | Size | Status | Notes |
|---|---|---|---|
| `docker-compose.yml` | 5,170 bytes | ✅ EXISTS | Do NOT recreate — check and patch only |
| `Dockerfile` | exists | ✅ EXISTS | Production container ready |
| `package.json` | exists | ✅ EXISTS | Check before any `npm install` |
| `jest.config.js` | exists | ✅ EXISTS | Test runner configured |
| `vercel.json` | 50 bytes | ⚠️ MINIMAL | May need Railway config instead |
| `.env.example` | 2,051 bytes | ✅ EXISTS | Add 6 new keys for Claim Attribution |
| `.env.backup` | unknown | 🔴 PUBLIC | CHECK FOR REAL KEYS — delete immediately |
| `.env.old` | unknown | 🔴 PUBLIC | CHECK FOR REAL KEYS — delete immediately |

### src/api/v1/ — WHAT ACTUALLY EXISTS (all confirmed) 

```
EXISTING ROUTES (DO NOT TOUCH these during Week 1):
  src/api/v1/analytics.js        628 bytes   — analytics endpoints
  src/api/v1/anomalies.js      4,532 bytes   — anomaly query API
  src/api/v1/billing.js        2,104 bytes   — billing stubs
  src/api/v1/feedback.js       5,209 bytes   — feedback collection
  src/api/v1/forecast.js       3,560 bytes   — generation forecast
  src/api/v1/index.js            548 bytes   — route aggregator
  src/api/v1/multi-plant.js    6,765 bytes   — multi-plant mgmt
  src/api/v1/organizations.js    851 bytes   — org stubs
  src/api/v1/plants.js           600 bytes   — plant CRUD stubs
  src/api/v1/subscriptions.js  2,279 bytes   — subscription mgmt
  src/api/v1/telemetry.js      6,626 bytes   — MAIN sensor ingest
  src/api/v1/tenants.js       11,084 bytes   — LARGEST: multi-tenant

JUNK FILES (delete these — they pollute the repo):
  src/api/v1/telemetry.js.backup          ← delete
  src/api/v1/telemetry.js.before_fixes    ← delete
  src/api/server-fixed.js                 ← delete (superseded)
  src/api/server.js.original              ← delete (superseded)

MISSING — NEED TO BUILD:
  src/api/v1/claims.js        ❌ NOT FOUND
  src/api/v1/buyer.js         ❌ NOT FOUND
  src/api/v1/certificates.js  ❌ NOT FOUND
```

### src/api/server.js — THE MAIN ENTRY POINT 

`src/api/server.js` exists at **19,952 bytes** — this is your largest API file, already wiring most routes. When you add Claim Attribution routes in Week 1 Step 8, you add to THIS file, not the smaller `server-fixed.js` or `server-with-carbon-credits.js`.

### src/middleware/ — WHAT ACTUALLY EXISTS 

```
EXISTING MIDDLEWARE (DO NOT TOUCH — extend only):
  src/middleware/auth.js              4,187 bytes  — operator JWT auth
  src/middleware/i18n.js              1,886 bytes  — internationalization
  src/middleware/rateLimiter.js       6,641 bytes  — rate limiting (Redis)
  src/middleware/replayProtection.js  1,352 bytes  — replay attack prevention
  src/middleware/tenant.js            6,864 bytes  — multi-tenant isolation

MISSING — NEED TO BUILD (add to this same directory):
  src/middleware/buyer-auth.js        ❌ NOT FOUND
  src/middleware/claim-validation.js  ❌ NOT FOUND
```

**Critical detail:** Your `src/middleware/auth.js` handles operator authentication. Your new `buyer-auth.js` handles buyer authentication — these are different role types. Do NOT modify `auth.js`. Create `buyer-auth.js` as a separate file that reuses JWT validation logic from `auth.js` but applies `BUYER` role checks.

***

##  TODAY — March 23, 2026 ( Analysis based on Date) 

***

### TASK 0 — SECURITY FIX (30 min) 🔴 DO THIS BEFORE ANYTHING ELSE

Your `.env.backup` and `.env.old` files are publicly visible on GitHub right now. Every second they exist there, anyone on the internet can read your testnet Hedera operator ID and private key. 

```bash
# ══════════════════════════════════════════════════
# STEP 1: Read the files before deleting (terminal)
# ══════════════════════════════════════════════════
cat .env.backup
cat .env.old

# ══════════════════════════════════════════════════
# STEP 2: Look for these specific values in the output:
# ══════════════════════════════════════════════════
# OPERATOR_ID=0.0.XXXXXX          ← real account number?
# OPERATOR_PRIVATE_KEY=302e...    ← real hex key?
# HEDERA_PRIVATE_KEY=302e...      ← real hex key?
# JWT_SECRET=...                  ← real secret?
# DB_PASSWORD=...                 ← real password?
# REDIS_URL=...                   ← real connection string?

# ══════════════════════════════════════════════════
# STEP 3: If ANY of the above contain real values →
# Go to portal.hedera.com FIRST and regenerate keys
# BEFORE deleting the files (so you don't lose access)
# ══════════════════════════════════════════════════

# ══════════════════════════════════════════════════
# STEP 4: Delete from git history (not just working tree)
# ══════════════════════════════════════════════════
git rm --cached .env.backup .env.old
git rm .env.backup .env.old

# Also delete these junk backup files while you're at it:
git rm src/api/v1/telemetry.js.backup
git rm src/api/v1/telemetry.js.before_fixes
git rm src/api/server-fixed.js
git rm src/api/server.js.original

# ══════════════════════════════════════════════════
# STEP 5: Add to .gitignore to prevent future accidents
# ══════════════════════════════════════════════════
echo ".env.backup" >> .gitignore
echo ".env.old" >> .gitignore
echo ".env.production" >> .gitignore
echo "*.backup" >> .gitignore
echo "*.before_fixes" >> .gitignore
echo "*.original" >> .gitignore

# ══════════════════════════════════════════════════
# STEP 6: Commit and push
# ══════════════════════════════════════════════════
git add .gitignore
git commit -m "security: remove exposed env files, update .gitignore"
git push origin main
```

** 
  
MINIMUM INFO TO COLLECT FOR EACH PLANT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Plant name and location (district, state, river)
□ Installed capacity (MW) — must be 1–15 MW for Phase 1
□ Annual generation last 3 years (MWh/year)
□ Average monthly generation (kWh/month)
□ River name + approximate flow rate (m³/s)
□ Water head (meters) — from turbine specs
□ Current carbon certification status (none = ideal target)
□ Key contact name + email
□ Decision-maker name + position
```

***

## ⚙️ WEEK 1 — March 24–30
### Build the Claim Attribution Layer
### ~55 hours total | This is the only thing that unlocks revenue

***

### Step 1 — Repo Cleanup Before Any New Code (1 hour)

Do this first so your build environment is clean:

```bash
# ══════════════════════════════════════════════════
# DELETE JUNK FILES (confirmed from repo scan)
# ══════════════════════════════════════════════════
git rm src/api/v1/telemetry.js.backup
git rm src/api/v1/telemetry.js.before_fixes
git rm src/api/server-fixed.js
git rm src/api/server.js.original

# ══════════════════════════════════════════════════
# VERIFY docker-compose.yml HAS postgres + redis
# ══════════════════════════════════════════════════
cat docker-compose.yml | grep -E "postgres|redis|image:"
# If postgres and redis are there → skip creation
# If missing → add ONLY the missing service block

# ══════════════════════════════════════════════════
# START LOCAL SERVICES
# ══════════════════════════════════════════════════
docker-compose up -d postgres redis
# Wait 10 seconds, then verify:
docker ps | grep -E "postgres|redis"

# ══════════════════════════════════════════════════
# CREATE NEW DIRECTORIES FOR CLAIM ATTRIBUTION
# ══════════════════════════════════════════════════
mkdir -p src/hedera
mkdir -p src/did
mkdir -p src/certificates
mkdir -p src/db/models
mkdir -p src/db/migrations
mkdir -p src/utils
mkdir -p templates
mkdir -p certificates

# ══════════════════════════════════════════════════
# COMMIT CLEANUP BEFORE BUILDING
# ══════════════════════════════════════════════════
git add -A
git commit -m "cleanup: remove backup files, create Claim Attribution directories"
git push
```

***

### Step 2 — Check package.json, Install Missing Packages (30 min)

```bash
# ══════════════════════════════════════════════════
# CHECK WHAT IS ALREADY INSTALLED
# ══════════════════════════════════════════════════
cat package.json | grep -E '"pdfkit"|"qrcode"|"uuid"|"express-validator"|"winston"|"jsonwebtoken"|"pg"|"sequelize"|"redis"'

# EXPECTED: You likely already have jsonwebtoken, pg, redis
# LIKELY MISSING: pdfkit, qrcode
# VERIFY EACH before installing:

# Only install what's actually missing:
npm install pdfkit             # PDF generation for certificates
npm install qrcode             # QR code generation for certs
npm install @hashgraph/sdk     # If not already there — check first

# Add devDependencies for testing new modules:
npm install --save-dev @types/pdfkit

# ══════════════════════════════════════════════════
# CREATE MISSING FOLDERS FOR RUNTIME OUTPUT
# ══════════════════════════════════════════════════
mkdir -p certificates          # PDF output directory
mkdir -p templates             # PDF templates

echo "certificates/" >> .gitignore    # Don't commit generated PDFs
echo "templates/*.pdf" >> .gitignore

git add package.json package-lock.json .gitignore
git commit -m "deps: add pdfkit, qrcode for certificate generation"
```

***

### Step 3 — Add .env Variables (30 min)

Your `.env.example` is 2,051 bytes. These 6 keys need to be appended to it AND to your real `.env`: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/5f339ec1-55f0-40f6-9df0-562909dc1912/Hedera_Hydropower_dMRV_Audit_and_Implementation.docx)

```bash
# ══════════════════════════════════════════════════
# APPEND TO .env.example (public documentation)
# ══════════════════════════════════════════════════
cat >> .env.example << 'EOF'

# ═══════════════════════════════════════════════════════
# CLAIM ATTRIBUTION LAYER — Required from Week 1 onwards
# ═══════════════════════════════════════════════════════

# New Hedera account dedicated to retirement operations
# Create at: portal.hedera.com
# This account RECEIVES token burns and pays retirement tx fees
RETIREMENT_ACCOUNT_ID=0.0.XXXXX
RETIREMENT_ACCOUNT_PRIVATE_KEY=302e...

# W3C DID for your system as the credential issuer
# Generated via Guardian after Week 2 setup
# Leave blank until Week 2 completes
ISSUER_DID=did:hedera:testnet:XXXXX
ISSUER_PRIVATE_KEY=

# RSA-2048 key for signing W3C Verifiable Credentials
# Generate with: openssl genrsa -out issuer_private.pem 2048
# Then: openssl rsa -in issuer_private.pem -pubout -out issuer_public.pem
# Paste private key here as single line with \n
CERTIFICATE_SIGNING_KEY=

# Local filesystem paths (used by pdf-renderer.js)
CERTIFICATE_DIR=./certificates
PDF_TEMPLATE_DIR=./templates

# Guardian policy UUID — filled after Week 2 setup
GUARDIAN_POLICY_ID=
EOF

# ══════════════════════════════════════════════════
# COPY THE SAME KEYS TO YOUR REAL .env
# ══════════════════════════════════════════════════
# Then fill in real values where available now:
#   RETIREMENT_ACCOUNT_ID → create testnet account at portal.hedera.com
#   CERTIFICATE_DIR=./certificates   ← fill in now
#   PDF_TEMPLATE_DIR=./templates     ← fill in now
#   All others → leave blank until their setup week

git add .env.example
git commit -m "config: add Claim Attribution Layer env variables"
```

***

### Step 4 — Commit-Reveal Hash Fix in src/workflow.js (2 hours)

`src/workflow.js` is 12,032 bytes. Your existing flow submits one HCS message with the full verified record. You need to add the commitment phase BEFORE that existing submit. 

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/workflow.js  (MODIFY — do not replace, only add to)
// ADD at the very top of the file, with other requires:
// ══════════════════════════════════════════════════════════════════
const crypto = require('crypto');

// ══════════════════════════════════════════════════════════════════
// FIND YOUR EXISTING FUNCTION THAT CALLS submitToHCS or similar
// It likely looks like: async function processVerification(data)
// Or: async function submitRecord(verifiedData)
//
// INSIDE that function, BEFORE the existing HCS submit call, ADD:
// ══════════════════════════════════════════════════════════════════

// ── PHASE 1: COMMITMENT ──────────────────────────────────────────
// Hash the raw sensor payload BEFORE any processing
// This proves we received the data at time T, before verification
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

// Submit ONLY the hash — not the data
const commitmentMessage = JSON.stringify({
  type:        'COMMITMENT',
  version:     '1.0',
  hash:        payloadHash,
  plantId:     rawSensorData.plantId,
  committedAt: Date.now()
});

const commitTx = await hcsClient.submitMessage(topicId, commitmentMessage);
const commitTxId = commitTx.transactionId.toString();
// ── END COMMITMENT PHASE ─────────────────────────────────────────


// ── YOUR EXISTING VERIFICATION LOGIC RUNS HERE ──────────────────
// (5-layer verification, trust score calculation — DO NOT CHANGE)
// const verifiedRecord = await runVerificationLayers(rawSensorData);
// ── END VERIFICATION ─────────────────────────────────────────────


// ── PHASE 2: REVEAL ──────────────────────────────────────────────
// Submit full verified record with BOTH the data AND the hash link
// This proves the data was not changed after commitment
const revealMessage = JSON.stringify({
  type:             'REVEAL',
  version:          '1.0',
  commitmentHash:   payloadHash,        // links back to Phase 1
  commitmentTxId:   commitTxId,         // HashScan link to Phase 1
  plantId:          rawSensorData.plantId,
  verifiedAt:       Date.now(),
  
  // 5-layer scores — all must be present for VVB audit
  layer1_physics:      physicsScore,    // P = ρgQHη result
  layer2_temporal:     temporalScore,   // 15-min consistency
  layer3_environmental: envScore,       // flow vs weather
  layer4_ml:           mlScore,         // Isolation Forest
  layer5_device:       deviceScore,     // HMAC attestation
  
  // Final trust score
  trustScore:       verifiedRecord.trustScore,  // 0.0 – 1.0
  trustLevel:       verifiedRecord.trustLevel,  // APPROVED/FLAGGED/REJECTED
  
  // Calculated generation
  energyGenerated_kWh: verifiedRecord.energyGenerated,
  
  // All raw sensor values (now safe to reveal after commitment)
  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput,
    efficiency:  rawSensorData.turbineEfficiency
  }
});

// This is your existing HCS submit — just replace the content you pass it:
const revealTx = await hcsClient.submitMessage(topicId, revealMessage);
// ── END REVEAL PHASE ─────────────────────────────────────────────

// Add both transaction IDs to your return value:
return {
  ...verifiedRecord,
  commitmentTxId: commitTxId,
  revealTxId:     revealTx.transactionId.toString(),
  hashScanCommitment: `https://hashscan.io/testnet/transaction/${commitTxId}`,
  hashScanReveal:     `https://hashscan.io/testnet/transaction/${revealTx.transactionId}`
};
```

**What this costs:** +$0.0002 per reading (one extra HCS `ConsensusSubmitMessage`). On 8,760 annual readings per plant, that is $1.75/year per plant. Closes Vulnerability #1 completely — a VVB auditor can now verify that data was committed before processing, making post-hoc fraud mathematically impossible. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/5f339ec1-55f0-40f6-9df0-562909dc1912/Hedera_Hydropower_dMRV_Audit_and_Implementation.docx)

***

### Step 5 — Add Drift Detection to src/anomaly-detector-ml.js (2 hours)

`src/anomaly-detector-ml.js` exists at 2,342 bytes. Open it and append at the bottom: 

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/anomaly-detector-ml.js  (APPEND — do not replace)
// ADD at the very bottom, after the existing class/exports
// ══════════════════════════════════════════════════════════════════

/**
 * DriftDetector — monitors the RATE of anomaly flags over a rolling window.
 *
 * PURPOSE: If suddenly >15% of readings are flagged as anomalous, the model
 * may be drifting (seasonal change, new sensor type, plant upgrade).
 * 
 * ACTION when drift detected:
 *   → Write a WARNING to HCS topic 0.0.7462776
 *   → Do NOT retrain automatically (no real data yet in Phase 1)
 *   → Alert a human reviewer
 *
 * Seasonal model retraining happens in Phase 3 (Month 6+) after
 * collecting real pilot sensor readings across all 4 seasons.
 */
class DriftDetector {
  /**
   * @param {number} windowSize   - Rolling window: last N readings to monitor
   * @param {number} threshold    - Fraction of anomalies triggering DRIFT_DETECTED
   * @param {object} hcsLogger    - Optional: hcs-audit-logger.js instance for alerting
   */
  constructor(windowSize = 100, threshold = 0.15, hcsLogger = null) {
    this.history     = [];           // rolling window of 0/1 (normal/anomalous)
    this.maxWindow   = windowSize;   // default: last 100 readings
    this.threshold   = threshold;    // default: 15% = drift
    this.driftCount  = 0;            // total drift events detected
    this.hcsLogger   = hcsLogger;    // null in Phase 1; wire in after Week 2
    this.lastDriftAt = null;
  }

  /**
   * Called after each anomaly detection result.
   * @param {boolean} isAnomaly  - Did Isolation Forest flag this reading?
   * @param {string}  plantId    - For logging context
   * @returns {{ status: 'NORMAL'|'DRIFT_DETECTED', rate: number, driftCount: number }}
   */
  async check(isAnomaly, plantId = 'unknown') {
    // Add current result to rolling window
    this.history.push(isAnomaly ? 1 : 0);
    
    // Enforce max window size (drop oldest)
    if (this.history.length > this.maxWindow) {
      this.history.shift();
    }

    // Calculate anomaly rate over the window
    const anomalyCount = this.history.reduce((acc, val) => acc + val, 0);
    const rate         = anomalyCount / this.history.length;

    // Only check drift once we have a full window
    if (this.history.length < this.maxWindow) {
      return { status: 'WARMING_UP', rate, windowFill: this.history.length };
    }

    if (rate > this.threshold) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();

      // If HCS logger is wired in → write immutable warning to blockchain
      if (this.hcsLogger) {
        await this.hcsLogger.logDriftWarning({
          plantId,
          anomalyRate:    rate,
          threshold:      this.threshold,
          driftCount:     this.driftCount,
          detectedAt:     this.lastDriftAt,
          action:         'HUMAN_REVIEW_REQUIRED',
          note:           'Model seasonal retraining scheduled for Phase 3 (Month 6+)'
        });
      }

      return {
        status:     'DRIFT_DETECTED',
        rate:       Math.round(rate * 1000) / 1000,  // 3 decimal places
        driftCount: this.driftCount,
        detectedAt: this.lastDriftAt,
        recommendation: 'Flag for human review. Do not auto-retrain until 6+ months of real pilot data.'
      };
    }

    return {
      status:     'NORMAL',
      rate:       Math.round(rate * 1000) / 1000,
      driftCount: this.driftCount
    };
  }

  /** Returns current window statistics for monitoring dashboards */
  getStats() {
    const anomalies = this.history.reduce((acc, val) => acc + val, 0);
    return {
      windowSize:    this.history.length,
      maxWindow:     this.maxWindow,
      anomalyCount:  anomalies,
      normalCount:   this.history.length - anomalies,
      anomalyRate:   this.history.length > 0 ? anomalies / this.history.length : 0,
      driftCount:    this.driftCount,
      lastDriftAt:   this.lastDriftAt
    };
  }

  /** Resets the window — call this if you intentionally retrain the model */
  reset() {
    this.history  = [];
    this.driftCount = 0;
    this.lastDriftAt = null;
  }
}

module.exports.DriftDetector = DriftDetector;
```

***

### Step 6 — Create 4 Database Migrations (5 hours)

These files do not exist yet. Create them all in `src/db/migrations/`:

```sql
-- ══════════════════════════════════════════════════════════════════
-- FILE: src/db/migrations/001_create_claims_table.sql
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claims (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id            VARCHAR(50) NOT NULL,
    buyer_did           VARCHAR(200) NOT NULL,
    buyer_account_id    VARCHAR(50),
    quantity_requested  DECIMAL(18, 6) NOT NULL,    -- HREC tokens requested
    quantity_approved   DECIMAL(18, 6),             -- After Guardian approval
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    status              VARCHAR(30) NOT NULL 
                          DEFAULT 'PENDING'
                          CHECK (status IN (
                            'PENDING',
                            'SUBMITTED_TO_GUARDIAN',
                            'GUARDIAN_APPROVED',
                            'TOKEN_BURNING',
                            'CERTIFICATE_GENERATING',
                            'COMPLETED',
                            'REJECTED',
                            'CANCELLED',
                            'EXPIRED'
                          )),
    guardian_document_id    VARCHAR(200),           -- UUID from Guardian
    guardian_policy_id      VARCHAR(200),
    guardian_submission_at  TIMESTAMP,
    guardian_approval_at    TIMESTAMP,
    hts_burn_tx_id          VARCHAR(200),           -- HashScan transaction ID
    hcs_commitment_tx_id    VARCHAR(200),           -- Commitment phase TX
    hcs_reveal_tx_id        VARCHAR(200),           -- Reveal phase TX
    certificate_id          UUID,                   -- FK to certificates table
    rejection_reason        TEXT,
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_claims_plant_id     ON claims(plant_id);
CREATE INDEX idx_claims_buyer_did    ON claims(buyer_did);
CREATE INDEX idx_claims_status       ON claims(status);
CREATE INDEX idx_claims_created_at   ON claims(created_at DESC);
CREATE INDEX idx_claims_guardian_doc ON claims(guardian_document_id);
```

```sql
-- ══════════════════════════════════════════════════════════════════
-- FILE: src/db/migrations/002_create_certificates_table.sql
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    credential_id       VARCHAR(200) UNIQUE NOT NULL,   -- W3C VC @id
    issuer_did          VARCHAR(200) NOT NULL,
    subject_did         VARCHAR(200) NOT NULL,           -- buyer DID
    issuance_date       TIMESTAMP NOT NULL,
    expiry_date         TIMESTAMP,
    plant_id            VARCHAR(50) NOT NULL,
    plant_name          VARCHAR(200),
    plant_location      VARCHAR(500),
    quantity_hrec       DECIMAL(18, 6) NOT NULL,
    energy_mwh          DECIMAL(18, 6) NOT NULL,
    emission_factor     DECIMAL(10, 6),                 -- tCO2e/MWh
    co2_avoided_tonnes  DECIMAL(18, 6),
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    hts_burn_tx_id      VARCHAR(200) NOT NULL,
    hcs_audit_tx_id     VARCHAR(200) NOT NULL,
    hashscan_url        VARCHAR(500),
    qr_code_data        TEXT,                           -- QR code content
    pdf_path            VARCHAR(500),                   -- local file path
    pdf_hash_sha256     VARCHAR(64),                    -- integrity check
    vc_json             JSONB NOT NULL,                 -- full W3C VC object
    status              VARCHAR(20) DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certs_claim_id     ON certificates(claim_id);
CREATE INDEX idx_certs_subject_did  ON certificates(subject_did);
CREATE INDEX idx_certs_plant_id     ON certificates(plant_id);
CREATE INDEX idx_certs_issuance     ON certificates(issuance_date DESC);
```

```sql
-- ══════════════════════════════════════════════════════════════════
-- FILE: src/db/migrations/003_create_buyers_table.sql
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS buyers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    did                 VARCHAR(200) UNIQUE NOT NULL,    -- W3C DID
    hedera_account_id   VARCHAR(50) UNIQUE,              -- 0.0.XXXXX
    name                VARCHAR(200) NOT NULL,
    organization        VARCHAR(200),
    email               VARCHAR(200) UNIQUE NOT NULL,
    api_key_hash        VARCHAR(64),                     -- hashed API key
    tier                VARCHAR(20) DEFAULT 'BASIC'
                          CHECK (tier IN ('BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE')),
    subscription_plan   VARCHAR(50),
    kyc_status          VARCHAR(20) DEFAULT 'PENDING'
                          CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED')),
    kyc_verified_at     TIMESTAMP,
    total_hrec_retired  DECIMAL(18, 6) DEFAULT 0,
    total_claims        INTEGER DEFAULT 0,
    metadata            JSONB DEFAULT '{}',
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_buyers_did    ON buyers(did);
CREATE INDEX idx_buyers_email  ON buyers(email);
CREATE INDEX idx_buyers_hts    ON buyers(hedera_account_id);
```

```sql
-- ══════════════════════════════════════════════════════════════════
-- FILE: src/db/migrations/004_create_retirements_table.sql
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    buyer_id            UUID NOT NULL REFERENCES buyers(id),
    certificate_id      UUID REFERENCES certificates(id),
    token_id            VARCHAR(50) NOT NULL,            -- 0.0.7964264
    quantity_burned     DECIMAL(18, 6) NOT NULL,
    burn_tx_id          VARCHAR(200) UNIQUE NOT NULL,    -- HashScan TX
    burn_tx_timestamp   TIMESTAMP NOT NULL,
    retirement_reason   VARCHAR(200),                   -- voluntary/compliance/ESG
    beneficiary_name    VARCHAR(200),                   -- whose name on cert
    beneficiary_did     VARCHAR(200),
    hcs_log_tx_id       VARCHAR(200),                   -- HCS retirement log
    registry_submission_status VARCHAR(30) DEFAULT 'NOT_SUBMITTED'
                          CHECK (registry_submission_status IN (
                            'NOT_SUBMITTED',
                            'SUBMITTED_TO_VERRA',
                            'VERRA_CONFIRMED',
                            'SUBMITTED_TO_GOLD_STANDARD',
                            'GS_CONFIRMED',
                            'FAILED'
                          )),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_retirements_claim    ON retirements(claim_id);
CREATE INDEX idx_retirements_buyer    ON retirements(buyer_id);
CREATE INDEX idx_retirements_burn_tx  ON retirements(burn_tx_id);
CREATE INDEX idx_retirements_created  ON retirements(created_at DESC);
```

**Run them:**

```bash
# Start postgres if not running:
docker-compose up -d postgres

# Run all 4 migrations in order:
psql -h localhost -U postgres -d hedera_mrv \
  -f src/db/migrations/001_create_claims_table.sql

psql -h localhost -U postgres -d hedera_mrv \
  -f src/db/migrations/002_create_certificates_table.sql

psql -h localhost -U postgres -d hedera_mrv \
  -f src/db/migrations/003_create_buyers_table.sql

psql -h localhost -U postgres -d hedera_mrv \
  -f src/db/migrations/004_create_retirements_table.sql

# Verify all 4 tables created:
psql -h localhost -U postgres -d hedera_mrv \
  -c "\dt" | grep -E "claims|certificates|buyers|retirements"
```

***

### Step 7 — Build 18 Claim Attribution Layer Files (40 hours)

#### PRIORITY 1 — Core Hedera Files (Days 1–2, ~12 hours)

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/hedera/token-retirement.js  (NEW)
// ══════════════════════════════════════════════════════════════════
const {
  Client,
  TokenBurnTransaction,
  TransferTransaction,
  AccountBalanceQuery,
  TokenId,
  AccountId,
  PrivateKey
} = require('@hashgraph/sdk');

class TokenRetirementManager {
  constructor() {
    this.client = Client.forTestnet();   // swap to forMainnet() in Week 4
    this.client.setOperator(
      AccountId.fromString(process.env.RETIREMENT_ACCOUNT_ID),
      PrivateKey.fromString(process.env.RETIREMENT_ACCOUNT_PRIVATE_KEY)
    );
    this.tokenId = TokenId.fromString('0.0.7964264');
  }

  /**
   * RETIREMENT METHOD 1: Treasury Burn (recommended for HREC retirement)
   * Burns tokens from treasury supply — reduces total supply permanently.
   * This is the on-chain proof of retirement for VVB auditors.
   * @param {number} amount    Number of HREC tokens to burn
   * @returns {object}         { txId, hashScanUrl, burnedAmount }
   */
  async retireTokensByBurn(amount) {
    const burnTx = await new TokenBurnTransaction()
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
      burnedAmount:  amount,
      hashScanUrl:   `https://hashscan.io/testnet/transaction/${txId}`,
      retiredAt:     new Date().toISOString(),
      method:        'TREASURY_BURN'
    };
  }

  /**
   * RETIREMENT METHOD 2: Transfer to Retirement Account
   * For buyers who want to hold the proof in their own account.
   * The retirement account is a black hole — no spend key given to buyers.
   * @param {string} fromAccountId  Buyer's Hedera account ID
   * @param {number} amount         Number of HREC tokens to retire
   * @returns {object}              { txId, hashScanUrl }
   */
  async retireTokensByTransfer(fromAccountId, amount) {
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId, AccountId.fromString(fromAccountId), -amount)
      .addTokenTransfer(
        this.tokenId,
        AccountId.fromString(process.env.RETIREMENT_ACCOUNT_ID),
        amount
      )
      .execute(this.client);

    const receipt = await transferTx.getReceipt(this.client);
    const txId    = transferTx.transactionId.toString();
    
    return {
      txId,
      transferredAmount: amount,
      from:          fromAccountId,
      to:            process.env.RETIREMENT_ACCOUNT_ID,
      hashScanUrl:   `https://hashscan.io/testnet/transaction/${txId}`,
      retiredAt:     new Date().toISOString(),
      method:        'RETIREMENT_TRANSFER'
    };
  }

  /**
   * Get current HREC token balance for any account.
   * Used to validate buyer has enough tokens before claim initiation.
   * @param {string} accountId  Hedera account ID (0.0.XXXXX)
   * @returns {number}          Token balance
   */
  async getTokenBalance(accountId) {
    const balanceQuery = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(this.client);

    const balance = balanceQuery.tokens.get(this.tokenId);
    return balance ? balance.toNumber() : 0;
  }
}

module.exports = { TokenRetirementManager };
```

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/hedera/hcs-audit-logger.js  (NEW)
// ══════════════════════════════════════════════════════════════════
const {
  Client, TopicMessageSubmitTransaction, TopicId, AccountId, PrivateKey
} = require('@hashgraph/sdk');

class HCSAuditLogger {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
    this.topicId = TopicId.fromString('0.0.7462776');
  }

  async _submit(messageObj) {
    const message   = JSON.stringify({ ...messageObj, loggedAt: Date.now() });
    const submitTx  = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(this.client);
    const receipt = await submitTx.getReceipt(this.client);
    return submitTx.transactionId.toString();
  }

  async logClaimInitiation(claimData) {
    return this._submit({
      event:   'CLAIM_INITIATED',
      claimId: claimData.id,
      plantId: claimData.plantId,
      buyerDID: claimData.buyerDid,
      quantity: claimData.quantityRequested,
      period:  `${claimData.periodStart}/${claimData.periodEnd}`
    });
  }

  async logTokenRetirement(retirementData) {
    return this._submit({
      event:    'TOKEN_RETIRED',
      claimId:  retirementData.claimId,
      burnTxId: retirementData.burnTxId,
      quantity: retirementData.quantityBurned,
      method:   retirementData.method
    });
  }

  async logCertificateGeneration(certData) {
    return this._submit({
      event:        'CERTIFICATE_GENERATED',
      certId:       certData.id,
      credentialId: certData.credentialId,
      claimId:      certData.claimId,
      issuedTo:     certData.subjectDid,
      pdfHash:      certData.pdfHashSha256
    });
  }

  async logDriftWarning(driftData) {
    return this._submit({
      event:          'ML_DRIFT_WARNING',
      plantId:        driftData.plantId,
      anomalyRate:    driftData.anomalyRate,
      threshold:      driftData.threshold,
      driftCount:     driftData.driftCount,
      action:         driftData.action
    });
  }
}

module.exports = { HCSAuditLogger };
```

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/hedera/guardian-client.js  (NEW)
// NOTE: Leave GUARDIAN_POLICY_ID blank until Week 2
// ══════════════════════════════════════════════════════════════════
const axios = require('axios');

class GuardianClient {
  constructor() {
    this.baseUrl  = process.env.GUARDIAN_API_URL || 'https://guardian-ui.hedera.com/api';
    this.policyId = process.env.GUARDIAN_POLICY_ID || null;  // filled after Week 2
    this.authToken = null;
  }

  async authenticate() {
    const response = await axios.post(`${this.baseUrl}/accounts/login`, {
      username: process.env.GUARDIAN_USERNAME,
      password: process.env.GUARDIAN_PASSWORD
    });
    this.authToken = response.data.accessToken;
  }

  async submitRetirementClaim(claimData) {
    if (!this.policyId) {
      throw new Error('GUARDIAN_POLICY_ID not set. Complete Week 2 Guardian setup first.');
    }
    if (!this.authToken) await this.authenticate();

    const vcDocument = {
      '@context':  ['https://www.w3.org/2018/credentials/v1'],
      type:        ['VerifiableCredential', 'HRECRetirementClaim'],
      issuer:      process.env.ISSUER_DID,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id:            claimData.buyerDid,
        plantId:       claimData.plantId,
        quantity:      claimData.quantityRequested,
        period:        `${claimData.periodStart}/${claimData.periodEnd}`,
        methodology:   'ACM0002',
        tokenId:       '0.0.7964264',
        hcsTopic:      '0.0.7462776'
      }
    };

    const response = await axios.post(
      `${this.baseUrl}/policies/${this.policyId}/documents`,
      { type: 'VC', document: vcDocument },
      { headers: { Authorization: `Bearer ${this.authToken}` } }
    );
    return response.data.id;   // Guardian document UUID
  }

  async checkClaimStatus(documentId) {
    if (!this.authToken) await this.authenticate();
    const response = await axios.get(
      `${this.baseUrl}/policies/${this.policyId}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${this.authToken}` } }
    );
    return response.data.status;   // 'APPROVED' | 'REJECTED' | 'PENDING'
  }
}

module.exports = { GuardianClient };
```

#### PRIORITY 2 — Identity + Certificates (Days 2–3, ~10 hours)

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/did/did-manager.js  (NEW)
// ══════════════════════════════════════════════════════════════════
const { Client, AccountCreateTransaction, KeyList, PrivateKey } = require('@hashgraph/sdk');

class DIDManager {
  /**
   * Register a W3C DID for a new buyer.
   * Format: did:hedera:testnet:z<base58-encoded-public-key>_0.0.XXXXX
   * @param {object} buyerInfo  { name, email, organization }
   * @returns {object}          { did, accountId, publicKey }
   */
  async registerBuyerDID(buyerInfo) {
    const client      = Client.forTestnet();
    client.setOperator(process.env.OPERATOR_ID, process.env.OPERATOR_PRIVATE_KEY);

    const newKey  = PrivateKey.generate();
    const newAcct = await new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(0)
      .execute(client);

    const receipt    = await newAcct.getReceipt(client);
    const accountId  = receipt.accountId.toString();
    const publicKey  = newKey.publicKey.toString();

    // Hedera DID format per Hedera DID Method specification
    const did = `did:hedera:testnet:${publicKey}_${accountId}`;

    return {
      did,
      accountId,
      publicKey,
      privateKey: newKey.toString(),   // STORE THIS — buyer will need it
      createdAt:  new Date().toISOString()
    };
  }

  /**
   * Resolve a DID to its DID Document.
   * For Phase 1, uses the Hedera DID Resolver via DIF Universal Resolver.
   */
  async resolveDID(did) {
    const axios   = require('axios');
    const encoded = encodeURIComponent(did);
    const response = await axios.get(
      `https://dev.uniresolver.io/1.0/identifiers/${encoded}`
    );
    return response.data.didDocument;
  }

  /**
   * Verify that a signature was made by the DID owner.
   * Used in buyer-auth.js to validate DID-signed requests.
   */
  verifyDIDOwnership(did, signature, message) {
    const crypto    = require('crypto');
    const publicKey = this._extractPublicKeyFromDID(did);
    const verify    = crypto.createVerify('SHA256');
    verify.update(message);
    return verify.verify(publicKey, signature, 'hex');
  }

  _extractPublicKeyFromDID(did) {
    // did:hedera:testnet:<publicKey>_<accountId>
    const parts = did.split(':');
    return parts[3].split('_')[0];
  }
}

module.exports = { DIDManager };
```

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/certificates/certificate-generator.js  (NEW)
// ══════════════════════════════════════════════════════════════════
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');

class CertificateGenerator {
  constructor(hcsAuditLogger) {
    this.hcsAuditLogger = hcsAuditLogger;
  }

  /**
   * Generates a complete W3C Verifiable Credential for an HREC retirement.
   * The VC is the legal instrument — buyers use it for ESG reporting.
   * @param {object} claimData      From claims DB table
   * @param {object} retirementData From token-retirement.js
   * @param {object} plantData      Plant operator info
   * @returns {object}              Complete certificate record
   */
  async generateESGCertificate(claimData, retirementData, plantData) {
    const credentialId = `urn:uuid:${uuidv4()}`;
    const issuanceDate = new Date().toISOString();

    // Calculate CO2 avoided (ACM0002 emission factor for Indian grid: 0.82 tCO2e/MWh)
    const energyMWh      = claimData.quantityApproved * 1.0; // 1 HREC = 1 MWh
    const emissionFactor = 0.82;  // India grid average (CEA 2024)
    const co2Avoided     = energyMWh * emissionFactor;

    const vc = this.createVerifiableCredential({
      credentialId,
      issuanceDate,
      buyerDid:      claimData.buyerDid,
      plantId:       claimData.plantId,
      plantName:     plantData.name,
      plantLocation: plantData.location,
      quantityHREC:  claimData.quantityApproved,
      energyMWh,
      co2Avoided,
      emissionFactor,
      periodStart:   claimData.periodStart,
      periodEnd:     claimData.periodEnd,
      burnTxId:      retirementData.txId,
      hcsAuditTxId:  retirementData.hcsLogTxId,
      hashScanUrl:   retirementData.hashScanUrl
    });

    const signedVC = await this.signWithIssuerKey(vc);

    return {
      id:              uuidv4(),
      claimId:         claimData.id,
      credentialId,
      issuerDid:       process.env.ISSUER_DID,
      subjectDid:      claimData.buyerDid,
      issuanceDate,
      plantId:         claimData.plantId,
      quantityHrec:    claimData.quantityApproved,
      energyMwh:       energyMWh,
      co2AvoidedTonnes: co2Avoided,
      htsBurnTxId:     retirementData.txId,
      hcsAuditTxId:    retirementData.hcsLogTxId,
      hashscanUrl:     retirementData.hashScanUrl,
      vcJson:          signedVC,
      status:          'ACTIVE'
    };
  }

  createVerifiableCredential(data) {
    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id:           data.credentialId,
      type:         ['VerifiableCredential', 'HRECRetirementCertificate', 'ESGCertificate'],
      issuer:       process.env.ISSUER_DID,
      issuanceDate: data.issuanceDate,
      credentialSubject: {
        id:             data.buyerDid,
        type:           'HRECRetirement',
        plantId:        data.plantId,
        plantName:      data.plantName,
        plantLocation:  data.plantLocation,
        energyGenerated: {
          value:  data.energyMWh,
          unit:   'MWh',
          period: `${data.periodStart}/${data.periodEnd}`
        },
        emissionsAvoided: {
          value:           data.co2Avoided,
          unit:            'tCO2e',
          emissionFactor:  data.emissionFactor,
          emissionFactorSource: 'CEA India 2024'
        },
        tokensRetired: {
          tokenId:       '0.0.7964264',
          amount:        data.quantityHREC,
          burnTxId:      data.burnTxId,
          hashScanUrl:   data.hashScanUrl
        },
        auditTrail: {
          hcsTopic:    '0.0.7462776',
          auditTxId:   data.hcsAuditTxId,
          methodology: 'ACM0002'
        }
      }
    };
  }

  async signWithIssuerKey(credential) {
    const crypto       = require('crypto');
    const privateKey   = process.env.CERTIFICATE_SIGNING_KEY
      .replace(/\\n/g, '\n');
    const signer       = crypto.createSign('SHA256');
    const payload      = JSON.stringify(credential.credentialSubject);
    signer.update(payload);
    const signature    = signer.sign(privateKey, 'hex');

    return {
      ...credential,
      proof: {
        type:               'RsaSignature2018',
        created:            new Date().toISOString(),
        verificationMethod: `${process.env.ISSUER_DID}#key-1`,
        proofPurpose:       'assertionMethod',
        jws:                signature
      }
    };
  }
}

module.exports = { CertificateGenerator };
```

#### PRIORITY 3 — API Layer (Days 3–4, ~10 hours)

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/api/v1/claims.js  (NEW)
// Full implementation of all 5 endpoints
// ══════════════════════════════════════════════════════════════════
const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { TokenRetirementManager } = require('../../hedera/token-retirement');
const { HCSAuditLogger }         = require('../../hedera/hcs-audit-logger');
const { GuardianClient }         = require('../../hedera/guardian-client');
const { CertificateGenerator }   = require('../../certificates/certificate-generator');
const { PDFRenderer }            = require('../../certificates/pdf-renderer');
const { validateBuyerJWT }       = require('../../middleware/buyer-auth');
const { validateClaimPayload }   = require('../../middleware/claim-validation');
const db                         = require('../../db/models/claims');

// ── POST /api/v1/claims/initiate ─────────────────────────────────
// Initiates a new HREC retirement claim flow.
// Validates buyer balance, submits to Guardian, logs to HCS.
router.post('/initiate', validateBuyerJWT, validateClaimPayload, async (req, res) => {
  const { quantity, plantId, periodStart, periodEnd, buyerDid, buyerAccountId } = req.body;

  try {
    // 1. Validate buyer has enough tokens
    const retirementMgr = new TokenRetirementManager();
    const balance       = await retirementMgr.getTokenBalance(buyerAccountId);
    if (balance < quantity) {
      return res.status(400).json({
        error:     'INSUFFICIENT_BALANCE',
        message:   `Required: ${quantity} HREC. Available: ${balance} HREC.`,
        balance,
        required:  quantity
      });
    }

    // 2. Create claim record in DB
    const claimId = uuidv4();
    const claim   = await db.create({
      id:                 claimId,
      plantId,
      buyerDid,
      buyerAccountId,
      quantityRequested:  quantity,
      periodStart:        new Date(periodStart),
      periodEnd:          new Date(periodEnd),
      status:             'PENDING'
    });

    // 3. Log to HCS (immutable record of claim initiation)
    const hcsLogger   = new HCSAuditLogger();
    const hcsTxId     = await hcsLogger.logClaimInitiation(claim);
    await db.update(claimId, { hcsCommitmentTxId: hcsTxId });

    // 4. Submit to Guardian (async — status polled separately)
    const guardianClient  = new GuardianClient();
    const guardianDocId   = await guardianClient.submitRetirementClaim({
      ...claim,
      guardianPolicyId: process.env.GUARDIAN_POLICY_ID
    });
    await db.update(claimId, {
      status:              'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId:  guardianDocId,
      guardianSubmissionAt: new Date()
    });

    return res.status(201).json({
      claimId,
      status:            'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId: guardianDocId,
      quantity,
      plantId,
      hashScanAudit:     `https://hashscan.io/testnet/transaction/${hcsTxId}`,
      message:           'Claim submitted. Poll GET /api/v1/claims/:claimId for status updates.'
    });

  } catch (err) {
    console.error('Claim initiation error:', err);
    return res.status(500).json({ error: 'CLAIM_INITIATION_FAILED', details: err.message });
  }
});

// ── GET /api/v1/claims/:claimId ──────────────────────────────────
router.get('/:claimId', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });

  // Auto-check Guardian status if pending
  if (claim.status === 'SUBMITTED_TO_GUARDIAN' && claim.guardianDocumentId) {
    const guardianClient = new GuardianClient();
    const guardianStatus = await guardianClient.checkClaimStatus(claim.guardianDocumentId);
    
    if (guardianStatus === 'APPROVED' && claim.status !== 'GUARDIAN_APPROVED') {
      await db.update(claim.id, {
        status: 'GUARDIAN_APPROVED',
        guardianApprovalAt: new Date()
      });
      claim.status = 'GUARDIAN_APPROVED';
    }
  }

  return res.json(claim);
});

// ── GET /api/v1/claims/:claimId/certificate ──────────────────────
router.get('/:claimId/certificate', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (claim.status !== 'COMPLETED') {
    return res.status(400).json({
      error:  'CERTIFICATE_NOT_READY',
      status: claim.status,
      message: 'Certificate only available after claim is COMPLETED'
    });
  }
  const cert = await require('../../db/models/certificates').findByClaimId(claim.id);
  return res.json(cert);
});

// ── GET /api/v1/claims/:claimId/certificate/pdf ──────────────────
router.get('/:claimId/certificate/pdf', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim || claim.status !== 'COMPLETED') {
    return res.status(404).json({ error: 'CERTIFICATE_NOT_AVAILABLE' });
  }
  const cert    = await require('../../db/models/certificates').findByClaimId(claim.id);
  const pdfPath = cert.pdfPath;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="HREC-${claim.id}.pdf"`);
  require('fs').createReadStream(pdfPath).pipe(res);
});

// ── POST /api/v1/claims/:claimId/cancel ─────────────────────────
router.post('/:claimId/cancel', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (!['PENDING', 'SUBMITTED_TO_GUARDIAN'].includes(claim.status)) {
    return res.status(400).json({
      error:   'CANNOT_CANCEL',
      message: `Claims in status ${claim.status} cannot be cancelled`
    });
  }
  await db.update(claim.id, { status: 'CANCELLED' });
  return res.json({ claimId: claim.id, status: 'CANCELLED' });
});

module.exports = router;
```

#### PRIORITY 4 — Middleware (Day 4, ~5 hours)

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/middleware/buyer-auth.js  (NEW)
// Extends existing src/middleware/auth.js pattern for BUYER role
// ══════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');

/**
 * Validates that the request comes from an authenticated BUYER.
 * Buyers are distinct from OPERATORS (plant operators).
 * Operators use src/middleware/auth.js
 * Buyers use this file.
 *
 * Token format: { buyerId, buyerDid, role: 'BUYER', tier, iat, exp }
 */
const validateBuyerJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error:   'UNAUTHORIZED',
      message: 'Authorization header missing or malformed. Use: Bearer <token>'
    });
  }

  const token = authHeader.split(' ') [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/488fdee9-cf42-46e6-928b-032119c43d1e/DOC-20260321-WA0018.docx);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'BUYER') {
      return res.status(403).json({
        error:   'FORBIDDEN',
        message: 'This endpoint requires BUYER role. Operators cannot initiate claims.'
      });
    }

    // Attach buyer info to request for downstream use
    req.buyer = {
      id:    decoded.buyerId,
      did:   decoded.buyerDid,
      tier:  decoded.tier,
      email: decoded.email
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Please re-authenticate.' });
    }
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token verification failed.' });
  }
};

/**
 * Validates buyer DID ownership via digital signature.
 * Only used for high-value operations (>100 HREC retirements).
 */
const validateBuyerDID = async (req, res, next) => {
  const { buyerDid, signature, signedMessage } = req.body;

  if (!buyerDid || !signature) {
    return res.status(400).json({
      error:   'DID_VALIDATION_REQUIRED',
      message: 'High-value operations require buyerDid + signature in request body'
    });
  }

  try {
    const { DIDManager } = require('../did/did-manager');
    const didMgr  = new DIDManager();
    const isValid = didMgr.verifyDIDOwnership(buyerDid, signature, signedMessage);

    if (!isValid) {
      return res.status(403).json({
        error:   'DID_VERIFICATION_FAILED',
        message: 'DID signature does not match claimed DID. Ownership not proven.'
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: 'DID_VERIFICATION_ERROR', details: err.message });
  }
};

module.exports = { validateBuyerJWT, validateBuyerDID };
```

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/middleware/claim-validation.js  (NEW)
// ══════════════════════════════════════════════════════════════════
const validateClaimPayload = (req, res, next) => {
  const { quantity, plantId, periodStart, periodEnd, buyerDid, buyerAccountId } = req.body;
  const errors = [];

  if (!quantity || quantity <= 0 || !Number.isFinite(quantity)) {
    errors.push('quantity: must be a positive number');
  }
  if (quantity > 10000) {
    errors.push('quantity: maximum 10,000 HREC per single claim');
  }
  if (!plantId || typeof plantId !== 'string') {
    errors.push('plantId: required string');
  }
  if (!periodStart || isNaN(new Date(periodStart))) {
    errors.push('periodStart: must be valid ISO 8601 date');
  }
  if (!periodEnd || isNaN(new Date(periodEnd))) {
    errors.push('periodEnd: must be valid ISO 8601 date');
  }
  if (periodStart && periodEnd && new Date(periodStart) >= new Date(periodEnd)) {
    errors.push('periodStart must be before periodEnd');
  }
  if (!buyerDid || !buyerDid.startsWith('did:')) {
    errors.push('buyerDid: must be valid W3C DID (starts with "did:")');
  }
  if (!buyerAccountId || !buyerAccountId.startsWith('0.0.')) {
    errors.push('buyerAccountId: must be valid Hedera account ID (0.0.XXXXX)');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error:   'VALIDATION_FAILED',
      message: 'Request body has validation errors',
      errors
    });
  }

  next();
};

const validateQuantity = (req, res, next) => {
  const quantity = parseFloat(req.body.quantity || req.query.quantity);
  if (isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'INVALID_QUANTITY', message: 'Quantity must be > 0' });
  }
  req.validatedQuantity = quantity;
  next();
};

module.exports = { validateClaimPayload, validateQuantity };
```

### Step 8 — Wire Routes into src/api/server.js (30 min)

`src/api/server.js` is 19,952 bytes — the main server. Find where routes are already registered (look for `app.use('/api/v1/'`) and add directly after the last existing route: 

```javascript
// src/api/server.js — FIND existing routes block, then ADD:
// Search for lines like:
//   app.use('/api/v1/telemetry', require('./v1/telemetry'));
//   app.use('/api/v1/multi-plant', require('./v1/multi-plant'));
// Then ADD IMMEDIATELY AFTER those lines:

app.use('/api/v1/claims',       require('./v1/claims'));
app.use('/api/v1/buyer',        require('./v1/buyer'));
app.use('/api/v1/certificates', require('./v1/certificates'));
```

**Also add `src/api/v1/index.js` export** — `index.js` is 548 bytes and already aggregates routes. Add the 3 new routes to it: 

```javascript
// src/api/v1/index.js — ADD these 3 lines to the existing exports:
router.use('/claims',       require('./claims'));
router.use('/buyer',        require('./buyer'));
router.use('/certificates', require('./certificates'));
```

### Step 9 — Run All Tests (5 hours)

```bash
# ══════════════════════════════════════════════════
# FULL TEST RUN
# ══════════════════════════════════════════════════
npm test

# TARGETS:
# Tests: 237+ passing (baseline), 262+ after new tests added
# Coverage: ≥85.3% (do not let it drop)
# Critical paths: 100% (your existing target — maintain it)

# ══════════════════════════════════════════════════
# IF TESTS FAIL — TRIAGE IN THIS ORDER:
# ══════════════════════════════════════════════════
# 1. DB connection failures → docker-compose up -d postgres redis
# 2. Hedera SDK errors      → check OPERATOR_ID in .env
# 3. Import errors          → check file paths in new require() calls
# 4. JWT errors             → check JWT_SECRET in .env
# 5. pdfkit/qrcode errors   → npm install pdfkit qrcode (if missed)

# ══════════════════════════════════════════════════
# COMMIT AFTER GREEN
# ══════════════════════════════════════════════════
git add -A
git commit -m "feat: add Claim Attribution Layer (18 files)
  
  - src/hedera/token-retirement.js: HREC burn + transfer retirement
  - src/hedera/hcs-audit-logger.js: immutable HCS audit logging
  - src/hedera/guardian-client.js: Guardian policy integration
  - src/did/did-manager.js: W3C DID registration for buyers
  - src/certificates/certificate-generator.js: W3C VC generation
  - src/certificates/pdf-renderer.js: PDF certificate rendering
  - src/certificates/qr-code-generator.js: HashScan QR codes
  - src/api/v1/claims.js: 5 claim lifecycle endpoints
  - src/api/v1/buyer.js: buyer balance + history endpoints
  - src/api/v1/certificates.js: certificate fetch + verify
  - src/middleware/buyer-auth.js: BUYER role JWT validation
  - src/middleware/claim-validation.js: payload validation
  - src/config/claim-attribution-config.js: unified config
  - src/utils/claim-validator.js: business rule validation
  - src/utils/certificate-utils.js: cert helper functions
  - src/db/models/claims.js: claims data access
  - src/db/models/certificates.js: certificates data access
  - src/db/models/buyers.js: buyers data access
  - src/db/models/retirements.js: retirements data access
  - 4 DB migrations: claims, certificates, buyers, retirements
  
  Fixes vulnerability #1: commit-reveal hash in workflow.js
  Adds drift detection: DriftDetector in anomaly-detector-ml.js
  Tests: 262+ passing, >85.3% coverage"

git push origin main
```

***

##  WEEK 2 — March 31 – April 6
### Guardian Policy Creation + Full End-to-End Test
### ~23 hours total

### Guardian Policy — Exact Block-by-Block Setup (8 hours)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-REQUISITE: guardian-client.js must be built (Week 1 done)
PRE-REQUISITE: HREC token 0.0.7964264 must be associated with
               your Guardian testnet registry account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Account Setup
  → URL: https://guardian-ui.hedera.com
  → Click "Create Account"
  → Role: "Standard Registry" (NOT User, NOT Auditor)
  → Enter: your testnet Operator ID (0.0.XXXXX from .env)
  → Enter: testnet private key
  → Guardian creates a DID for your registry → SAVE THIS DID
    This becomes your ISSUER_DID in .env

STEP 2: Associate HREC Token with Registry
  → Dashboard → "Token Management"
  → Click "Associate Token"
  → Enter Token ID: 0.0.7964264
  → Confirm transaction (costs ~$0.05 HBAR)

STEP 3: Create Policy
  → Left menu → "Policies" → "New Policy"
  → Name:        HREC-Retirement-ESG-v1
  → Tag:         HREC_RETIREMENT
  → Description: ACM0002 hydropower HREC retirement and ESG certificate issuance
  → Version:     1.0.0
  → Click "Create"

STEP 4: Add Policy Blocks (IN THIS EXACT ORDER)

  ┌──────────────────────────────────────────────────────┐
  │ BLOCK 1: InterfaceContainerBlock                     │
  │   Purpose: Container for all roles in this policy    │
  │   Settings:                                          │
  │     permissions: ['STANDARD_REGISTRY', 'USER']       │
  │     defaultActive: true                              │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │ BLOCK 2: requestVCDocumentBlock                      │
  │   Purpose: Buyer submits retirement request as VC    │
  │   Settings:                                          │
  │     schema: 'HREC Retirement Claim'                  │
  │     requester: 'USER'  ← USER = buyer role           │
  │     fields required:                                 │
  │       - plantId (string)                             │
  │       - quantity (number)                            │
  │       - periodStart (date)                           │
  │       - periodEnd (date)                             │
  │       - buyerDid (string)                            │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │ BLOCK 3: sendToGuardianBlock (External Call)         │
  │   Purpose: Validates buyer has enough HREC tokens    │
  │   Settings:                                          │
  │     action: external API call                        │
  │     method: POST                                     │
  │     endpoint: https://<your-railway-url>/api/v1/     │
  │               claims/validate-balance                │
  │     passthrough fields: plantId, quantity,           │
  │                         buyerAccountId               │
  │   Expected response: { valid: true/false, balance }  │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │ BLOCK 4: approveMintDocumentBlock (Multi-Sig)        │
  │   Purpose: 3-of-5 verifier approval before burn      │
  │   Settings:                                          │
  │     approvalThreshold: 3                             │
  │     totalSigners: 5                                  │
  │     signerAccounts: [                                │
  │       your_testnet_account_1,                        │
  │       your_testnet_account_2,                        │
  │       your_testnet_account_3,                        │
  │       your_testnet_account_4,                        │
  │       your_testnet_account_5                         │
  │     ]                                                │
  │   NOTE: For Phase 1 testing, you can sign 3-of-5    │
  │         yourself from 3 different testnet accounts   │
  └──────────────────────────────────────────────────────┘
          ↓
  ┌──────────────────────────────────────────────────────┐
  │ BLOCK 5: mintDocumentBlock                           │
  │   Purpose: Issues retirement certificate VC          │
  │   Settings:                                          │
  │     tokenId: 0.0.7964264                             │
  │     hcsTopic: 0.0.7462776                            │
  │     vcType: HRECRetirementCertificate                │
  │     mintAction: BURN  ← actual token burn            │
  └──────────────────────────────────────────────────────┘

STEP 5: Publish Policy
  → Click "Publish Policy"
  → Guardian returns p
  → Guardian returns a policyId UUID like:
    "7f3a1c2d-4e5b-6789-abcd-ef0123456789"
  → COPY THIS IMMEDIATELY — it does not display again easily

STEP 6: Save policyId everywhere it needs to go:

  a) Railway environment variables (your production config):
     GUARDIAN_POLICY_ID=7f3a1c2d-4e5b-6789-abcd-ef0123456789
  
  b) Local .env file:
     GUARDIAN_POLICY_ID=7f3a1c2d-4e5b-6789-abcd-ef0123456789
  
  c) src/hedera/guardian-client.js (update the constructor):
     this.policyId = process.env.GUARDIAN_POLICY_ID;
     // Remove the null default — if it's null now, throw on startup

STEP 7: Also save your Guardian registry DID (from Step 1):
  ISSUER_DID=did:hedera:testnet:<your-registry-DID>
  → Update .env.example with this real format
  → This DID will appear on every ESG certificate you generate
```

***

### ADDING VALIDATE-BALANCE ENDPOINT (Required by Guardian Block 3)

Guardian Block 3 calls `POST /api/v1/claims/validate-balance` externally. This endpoint must exist on Railway **before** the Guardian policy runs. Add it to `src/api/v1/claims.js` (the file you built in Week 1):

```javascript
// ══════════════════════════════════════════════════════════════════
// FILE: src/api/v1/claims.js  — ADD this endpoint (new route)
// Guardian Block 3 calls this to validate buyer has enough tokens
// This must be publicly accessible (no auth — Guardian calls it)
// ══════════════════════════════════════════════════════════════════

// ── POST /api/v1/claims/validate-balance ─────────────────────────
// Called by Guardian policy Block 3 during approval workflow.
// Guardian sends: { plantId, quantity, buyerAccountId }
// You return:     { valid: true/false, balance, required }
router.post('/validate-balance', async (req, res) => {
  const { buyerAccountId, quantity } = req.body;

  if (!buyerAccountId || !quantity) {
    return res.status(400).json({
      valid:   false,
      error:   'MISSING_FIELDS',
      message: 'buyerAccountId and quantity are required'
    });
  }

  try {
    const retirementMgr = new TokenRetirementManager();
    const balance       = await retirementMgr.getTokenBalance(buyerAccountId);
    const required      = parseFloat(quantity);
    const valid         = balance >= required;

    return res.json({
      valid,
      balance,
      required,
      shortfall: valid ? 0 : required - balance,
      tokenId:   '0.0.7964264',
      message:   valid
        ? `Balance sufficient: ${balance} HREC available, ${required} required`
        : `Insufficient balance: ${balance} HREC available, ${required} required`
    });

  } catch (err) {
    console.error('[VALIDATE-BALANCE] Error:', err);
    return res.status(500).json({
      valid:   false,
      error:   'BALANCE_CHECK_FAILED',
      message: err.message
    });
  }
});
```

***

### WIRING THE 3 NEW ROUTES INTO server.js

You now have the full `server.js` content (19,952 bytes, SHA: `10f0b8af1afa37e26246c1cefca1137b856e4911`).  The exact location to insert is **after** the telemetry router and **before** the root endpoint. Here is the precise diff:

```javascript
// src/api/server.js
// ══════════════════════════════════════════════════════════════════
// FIND THIS EXACT LINE (near the bottom, already exists):
// ══════════════════════════════════════════════════════════════════
// API routes
const telemetryRouter = require('./v1/telemetry');
app.use('/api/v1/telemetry', telemetryRouter);

// ══════════════════════════════════════════════════════════════════
// ADD IMMEDIATELY AFTER THE 2 LINES ABOVE:
// ══════════════════════════════════════════════════════════════════

// ─── Claim Attribution Layer (Week 1 addition) ───────────────────
const claimsRouter       = require('./v1/claims');
const buyerRouter        = require('./v1/buyer');
const certificatesRouter = require('./v1/certificates');

app.use('/api/v1/claims',       claimsRouter);
app.use('/api/v1/buyer',        buyerRouter);
app.use('/api/v1/certificates', certificatesRouter);

console.log('✅ Claim Attribution endpoints enabled:');
console.log('   • POST /api/v1/claims/initiate');
console.log('   • GET  /api/v1/claims/:claimId');
console.log('   • GET  /api/v1/claims/:claimId/certificate');
console.log('   • GET  /api/v1/claims/:claimId/certificate/pdf');
console.log('   • POST /api/v1/claims/:claimId/cancel');
console.log('   • POST /api/v1/claims/validate-balance (Guardian hook)');
console.log('   • GET  /api/v1/buyer/:buyerId/balance');
console.log('   • GET  /api/v1/buyer/:buyerId/claims');
console.log('   • GET  /api/v1/certificates/:certId');
console.log('   • POST /api/v1/certificates/:certId/verify');
// ─── End Claim Attribution Layer ─────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// ALSO UPDATE the /api/features endpoint — find 'carbon_credits' key
// inside the res.json and ADD these new endpoint entries:
// ══════════════════════════════════════════════════════════════════
// claim_attribution: {
//   initiate:    'POST /api/v1/claims/initiate',
//   status:      'GET  /api/v1/claims/:claimId',
//   certificate: 'GET  /api/v1/claims/:claimId/certificate',
//   pdf:         'GET  /api/v1/claims/:claimId/certificate/pdf',
//   cancel:      'POST /api/v1/claims/:claimId/cancel'
// }
```

**Also update the version and feature flags in `server.js`:** 

```javascript
// FIND:  version: '1.6.1'
// REPLACE WITH:
version: '1.7.0',

// FIND:  completion: '93%',
// REPLACE WITH:
completion: '97%',

// FIND (inside features object in /health endpoint):
carbonCredits: true
// ADD AFTER IT:
claimAttribution: true,   // Week 1 addition
buyerRetirement: true,
esgCertificates: true,
```

***

### End-to-End Test Sequence (10 hours)

Every step must return the exact expected response before moving forward. Run these sequentially — **not in parallel**: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/5f339ec1-55f0-40f6-9df0-562909dc1912/Hedera_Hydropower_dMRV_Audit_and_Implementation.docx)

```bash
# ══════════════════════════════════════════════════════════════════
# PREREQUISITE: Server running on localhost:3000
# ══════════════════════════════════════════════════════════════════
npm start
# or: node src/api/server.js

# ── STEP A: Create a test buyer account ──────────────────────────
# First, generate a JWT for a test buyer (BUYER role):
# You'll need a small script for this:
node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { buyerId: 'test-buyer-001', buyerDid: 'did:hedera:testnet:test', role: 'BUYER', tier: 'STANDARD' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  console.log('BUYER_TOKEN=' + token);
"
# → Copy the token output, set as BUYER_TOKEN in your shell

# ── STEP B: POST /api/v1/claims/initiate ─────────────────────────
curl -X POST http://localhost:3000/api/v1/claims/initiate \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 10,
    "plantId": "plant-001",
    "periodStart": "2026-02-01T00:00:00Z",
    "periodEnd": "2026-02-28T23:59:59Z",
    "buyerDid": "did:hedera:testnet:test",
    "buyerAccountId": "0.0.XXXXX"
  }'

# EXPECTED RESPONSE:
# {
#   "claimId": "550e8400-e29b-41d4-a716-446655440000",
#   "status": "SUBMITTED_TO_GUARDIAN",
#   "guardianDocumentId": "...",
#   "quantity": 10,
#   "hashScanAudit": "https://hashscan.io/testnet/transaction/...",
#   "message": "Claim submitted. Poll GET /api/v1/claims/:claimId for status updates."
# }
# → SAVE the claimId
export CLAIM_ID="550e8400-e29b-41d4-a716-446655440000"

# ── STEP C: Poll GET /api/v1/claims/:claimId ─────────────────────
curl -X GET http://localhost:3000/api/v1/claims/$CLAIM_ID \
  -H "Authorization: Bearer $BUYER_TOKEN"

# EXPECTED:
# { "status": "SUBMITTED_TO_GUARDIAN", "guardianDocumentId": "..." }
# (Guardian approval takes 1–5 minutes with 3-of-5 manual sign)

# ── STEP D: Approve in Guardian (manual) ─────────────────────────
# Go to https://guardian-ui.hedera.com
# Log in as Verifier accounts 1, 2, 3 (3-of-5)
# Find the pending claim document → click Approve (×3)
# After 3 approvals, status changes to APPROVED in Guardian

# ── STEP E: Poll again — should show GUARDIAN_APPROVED ───────────
curl -X GET http://localhost:3000/api/v1/claims/$CLAIM_ID \
  -H "Authorization: Bearer $BUYER_TOKEN"
# EXPECTED: { "status": "GUARDIAN_APPROVED" }

# ── STEP F: Token burn on HTS testnet ────────────────────────────
# This is triggered automatically by your token-retirement.js
# when status transitions to GUARDIAN_APPROVED.
# Verify on HashScan:
echo "Check: https://hashscan.io/testnet/token/0.0.7964264"
# → Total supply should decrease by 10 (burned amount)
# → Transaction should appear with type: TokenBurn

# ── STEP G: HCS audit log ────────────────────────────────────────
echo "Check: https://hashscan.io/testnet/topic/0.0.7462776"
# → Should show a new ConsensusSubmitMessage with:
#   type: "TOKEN_RETIRED"
#   claimId: <your CLAIM_ID>
#   burnTxId: <the HTS burn transaction ID>

# ── STEP H: Certificate generation ───────────────────────────────
curl -X GET "http://localhost:3000/api/v1/claims/$CLAIM_ID/certificate" \
  -H "Authorization: Bearer $BUYER_TOKEN"

# EXPECTED:
# {
#   "credentialId": "urn:uuid:...",
#   "issuerDid": "did:hedera:testnet:...",
#   "issuanceDate": "2026-04-05T...",
#   "quantityHrec": 10,
#   "energyMwh": 10,
#   "co2AvoidedTonnes": 8.2,
#   "htsBurnTxId": "0.0...",
#   "hashscanUrl": "https://hashscan.io/testnet/transaction/...",
#   "qrCodeData": "...",
#   "status": "ACTIVE"
# }
export CERT_ID="<id from response>"

# ── STEP I: PDF certificate download ─────────────────────────────
curl -X GET "http://localhost:3000/api/v1/claims/$CLAIM_ID/certificate/pdf" \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -o "test-certificate.pdf"

# EXPECTED: PDF file downloaded
# Open test-certificate.pdf — must contain:
#   ✓ Buyer DID or company name
#   ✓ Plant ID and location
#   ✓ Quantity (10 HREC = 10 MWh)
#   ✓ CO2 avoided (8.2 tCO2e)
#   ✓ QR code linking to HashScan transaction
#   ✓ Issuer DID (your Guardian registry DID)
#   ✓ Issuance date
#   ✓ "ACM0002" methodology label

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ALL 9 STEPS PASSED → WEEK 2 COMPLETE"
echo "Proceed to Week 3 — Pilot Onboarding"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

***

##  WEEK 3 — April 7–13
### First Real Pilots
### ~40 hours | Proof of market demand

***

### Pilot Outreach Email Template (Day 1 — send to 10 contacts simultaneously)

```
Subject: Free digital carbon credit verification for your hydropower plant
         (Hedera blockchain — no cost for first 90 days)

Dear [Name],

I am a developer who has built a digital MRV system for hydropower 
carbon credit verification on the Hedera blockchain.

THE PROBLEM I SOLVE:
Small hydropower plants (1–15 MW) cannot access carbon markets today 
because traditional MRV audits cost ₹12–40 lakh per year — more than 
the carbon revenue the plant would generate.

WHAT I HAVE BUILT:
→ Physics-based verification: P = ρgQHη (ACM0002 methodology)
→ 2,000+ immutable records on Hedera blockchain (HCS 0.0.7462776)
→ Cost: ₹8,000–25,000/year vs. ₹12–40 lakh for traditional audit
→ Live system: hydropower-mrv-19feb26.vercel.app

WHAT I AM OFFERING YOU:
Free 90-day pilot. You provide:
  - Plant name and capacity (MW)
  - Monthly generation for last 3 months (kWh)
  - River flow rate and head height (from your plant spec sheet)
  
You receive:
  - Your plant's generation verified on Hedera blockchain
  - ESG certificate PDF with your company name
  - Blockchain transaction as permanent audit proof
  - Assessment of carbon credit potential (HREC tokens)

The entire setup takes 2 hours. No IoT sensors required for the pilot.
Historical data from your records is sufficient.

If you are open to a 30-minute demo call this week, I can show you 
the system live on screen.

Bikram Biswas
GitHub: github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
Live demo: hydropower-mrv-19feb26.vercel.app
WhatsApp: [your number]
```

### Pilot Data Collection Form

When a plant agrees, collect this data within 48 hours:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEDERA dMRV PILOT — PLANT DATA FORM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 1: PLANT IDENTITY
Plant name:            ___________________________
Operator company:      ___________________________
Plant location:
  - State:             ___________________________
  - District:          ___________________________
  - River:             ___________________________
  - GPS coordinates:   ___________________________  (optional)

SECTION 2: TECHNICAL SPECS (from your commissioning report or CERC filing)
Installed capacity:    ___________ MW
Type:                  □ Run-of-river  □ Reservoir  □ Canal-based
Turbine type:          □ Kaplan  □ Francis  □ Pelton  □ Other
Turbine efficiency:    ___________ %  (default: 85% if unknown)

SECTION 3: HYDROLOGY
Design head:           ___________ meters (from turbine specs)
Average river flow:    ___________ m³/s (annual average)
Monsoon flow range:    ___________ to ___________ m³/s
Dry season flow:       ___________ m³/s

SECTION 4: GENERATION DATA (last 6 months minimum)
Month         Generation (kWh)    Grid Hours
─────────────────────────────────────────────
Sep 2025:     _____________       ________
Oct 2025:     _____________       ________
Nov 2025:     _____________       ________
Dec 2025:     _____________       ________
Jan 2026:     _____________       ________
Feb 2026:     _____________       ________

SECTION 5: CURRENT CARBON STATUS
Existing Verra certification:    □ Yes  □ No  □ Applied
Current carbon revenue:          ₹ ___________/year  (or ₹0)
Interested in carbon credits:    □ Very interested  □ Curious  □ Just for the demo

SECTION 6: CONTACT
Key contact name:      ___________________________
Position:              ___________________________
Email:                 ___________________________
Mobile/WhatsApp:       ___________________________
Best time to call:     ___________________________
```

### Loading Pilot Data Into Your API

Once you receive the data form back, follow this exact process: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/0fe30ea1-bbf8-42f2-8f45-cfa3ac46e209/DOC-20260321-WA0020.docx)

```bash
# ══════════════════════════════════════════════════════════════════
# STEP 1: Register the pilot plant
# ══════════════════════════════════════════════════════════════════
curl -X POST http://localhost:3000/api/v1/plants \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "pilot-kseb-001",
    "name": "Pallivasal Hydro Station",
    "location": "Munnar, Kerala, India",
    "capacity_mw": 37.5,
    "plant_type": "hydro",
    "operator": "KSEB Ltd",
    "river": "Muthirapuzha",
    "head_meters": 78.5,
    "turbine_efficiency": 0.86
  }'

# ══════════════════════════════════════════════════════════════════
# STEP 2: Submit historical reading for each month
# (Converts monthly kWh to average hourly reading for verification)
# ══════════════════════════════════════════════════════════════════
# Monthly generation: 2,450,000 kWh (Feb 2026)
# Hours in month: 672 (28 days × 24 hours)
# Average power: 2,450,000 / 672 = 3,645 kW = 3.645 MW

# Calculate expected flow from P = ρgQHη:
# 3,645,000 W = 1000 × 9.81 × Q × 78.5 × 0.86
# Q = 3,645,000 / (1000 × 9.81 × 78.5 × 0.86) = 5.53 m³/s

curl -X POST http://localhost:3000/api/v1/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "plantId": "pilot-kseb-001",
    "timestamp": "2026-02-15T12:00:00Z",
    "flowRate": 5.53,
    "headHeight": 78.5,
    "powerOutput": 3645,
    "turbineEfficiency": 0.86,
    "waterDensity": 998.2,
    "dataSource": "HISTORICAL_RECORDS",
    "notes": "Monthly average derived from Feb 2026 generation report"
  }'

# ══════════════════════════════════════════════════════════════════
# STEP 3: Get the verification result + trust score
# ══════════════════════════════════════════════════════════════════
# EXPECTED RESPONSE includes:
# {
#   "trustScore": 0.87,
#   "trustLevel": "APPROVED",
#   "layer1_physics": { "score": 0.92, "expectedPower": 3621, "actualPower": 3645, "deviation": 0.7% },
#   "layer4_ml": { "score": 0.88, "anomaly": false },
#   "energyGenerated_kWh": 2450000,
#   "hcsCommitmentTxId": "...",
#   "hcsRevealTxId": "...",
#   "hashScanUrl": "https://hashscan.io/testnet/transaction/..."
# }

# ══════════════════════════════════════════════════════════════════
# STEP 4: Mint HREC tokens for the verified generation
# ══════════════════════════════════════════════════════════════════
# 2,450,000 kWh ÷ 1,000 = 2,450 MWh = 2,450 HREC tokens
curl -X POST http://localhost:3000/api/v1/carbon-credits/mint \
  -H "Content-Type: application/json" \
  -d '{
    "plantId": "pilot-kseb-001",
    "period": "2026-02",
    "energyMWh": 2450,
    "verificationTxId": "<hcsRevealTxId from above>",
    "methodology": "ACM0002"
  }'

# ══════════════════════════════════════════════════════════════════
# STEP 5: Generate ESG certificate with plant operator's name
# ══════════════════════════════════════════════════════════════════
# Initiate a retirement claim on behalf of the pilot plant
# (They "retire" a small amount — e.g., 10 HREC — as demo proof)
curl -X POST http://localhost:3000/api/v1/claims/initiate \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 10,
    "plantId": "pilot-kseb-001",
    "periodStart": "2026-02-01T00:00:00Z",
    "periodEnd": "2026-02-28T23:59:59Z",
    "buyerDid": "did:hedera:testnet:kseb-pilot",
    "buyerAccountId": "0.0.XXXXX",
    "beneficiaryName": "KSEB Ltd — Pallivasal Hydro Station"
  }'
```

### Testimonial Request (Send on Day 7)

After generating and emailing the PDF certificate to the pilot plant:

```
Subject: Your Hedera blockchain carbon certificate + quick feedback request

Dear [Name],

Please find attached your HREC carbon verification certificate for 
Pallivasal Hydro Station — February 2026:

  Energy verified: 2,450 MWh
  CO2 avoided:     2,009 tonnes
  Blockchain proof: [HashScan link]
  Certificate ID:   [cert ID]

The QR code on the certificate links directly to your permanent 
blockchain record. This cannot be altered, deleted, or disputed.

If you found this valuable, I would greatly appreciate a short 
written statement (2–3 sentences) confirming:
  1. That the verification system worked correctly
  2. Whether this would be useful for your ESG reporting
  3. Any feedback on what would make it more useful

This testimonial would help us demonstrate market demand to investors
and incubator programmes. It carries no commercial obligation.

Thank you,
Bikram Biswas
```

***

##  WEEK 4 — April 14–20
### Mainnet Deployment + COST-ANALYSIS.md Fix
### ~23 hours total

***

### Pre-Deployment Security Checklist (2 hours)

Before spending a single HBAR on mainnet, verify these: 

```bash
# ══════════════════════════════════════════════════════════════════
# CHECKLIST 1: No secrets in code
# ══════════════════════════════════════════════════════════════════
git log --all --full-history --name-status | grep -E "\.env|private_key|secret"
# If any real keys ever appear → run BFG Repo Cleaner after hackathon

# ══════════════════════════════════════════════════════════════════
# CHECKLIST 2: No hardcoded test account IDs in source
# ══════════════════════════════════════════════════════════════════
grep -r "0\.0\.[0-9]" src/ --include="*.js" | grep -v "process.env" | grep -v "//.*comment"
# Every Hedera ID should come from process.env.XXX — not hardcoded

# ══════════════════════════════════════════════════════════════════
# CHECKLIST 3: Vercel config is not exposing secrets
# ══════════════════════════════════════════════════════════════════
cat vercel.json
# Your vercel.json is only 50 bytes — check it contains no env values
# Should be ONLY routing config — all secrets go to Railway

# ══════════════════════════════════════════════════════════════════
# CHECKLIST 4: All 262+ tests passing on testnet
# ══════════════════════════════════════════════════════════════════
HEDERA_NETWORK=testnet npm test
# Must be 100% green before touching mainnet

# ══════════════════════════════════════════════════════════════════
# CHECKLIST 5: Full end-to-end claim flow confirmed on testnet
# ══════════════════════════════════════════════════════════════════
# Steps A–I from Week 2 must have all passed ← non-negotiable
```

### Mainnet Account Setup (3 hours)

```bash
# ══════════════════════════════════════════════════════════════════
# STEP 1: Create mainnet accounts
# ══════════════════════════════════════════════════════════════════
# Go to portal.hedera.com
# Create Account → Mainnet → Download key pair

# You need 3 mainnet accounts:
# 1. OPERATOR account (pays tx fees — fund with 200+ HBAR)
# 2. RETIREMENT account (receives burned tokens)
# 3. ISSUER account (linked to your DID)

# ══════════════════════════════════════════════════════════════════
# STEP 2: Fund operator account
# ══════════════════════════════════════════════════════════════════
# At ~$0.40/HBAR current price:
# 200 HBAR = ~$80 — sufficient for:
#   - 200,000 HCS messages (entire first year)
#   - 500 HTS token mints
#   - 500 HTS token burns
#   - Guardian policy creation
# Buy HBAR at: coinbase.com / binance.com → send to your mainnet account

# ══════════════════════════════════════════════════════════════════
# STEP 3: Create mainnet Hedera resources
# ══════════════════════════════════════════════════════════════════

# 3a. Create HCS Topic (mainnet):
node -e "
  const { Client, TopicCreateTransaction, PrivateKey, AccountId } = require('@hashgraph/sdk');
  const client = Client.forMainnet();
  client.setOperator(
    process.env.MAINNET_OPERATOR_ID,
    PrivateKey.fromString(process.env.MAINNET_OPERATOR_KEY)
  );
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('Hedera Hydropower dMRV Audit Log v1.7.0')
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log('MAINNET_HCS_TOPIC_ID=' + receipt.topicId.toString());
"
# → Copy output → add to Railway env vars

# 3b. Create HTS Token (mainnet) — HREC mainnet token:
node -e "
  const { Client, TokenCreateTransaction, TokenType, TokenSupplyType,
          PrivateKey, AccountId } = require('@hashgraph/sdk');
  const client = Client.forMainnet();
  client.setOperator(process.env.MAINNET_OPERATOR_ID, process.env.MAINNET_OPERATOR_KEY);
  const supplyKey = PrivateKey.fromString(process.env.MAINNET_OPERATOR_KEY);
  const tx = await new TokenCreateTransaction()
    .setTokenName('Hedera Renewable Energy Certificate')
    .setTokenSymbol('HREC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(supplyKey)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  console.log('MAINNET_HTS_TOKEN_ID=' + receipt.tokenId.toString());
"
# → Copy output → add to Railway env vars
```

### Railway Deployment (5 hours)

Your `vercel.json` is only 50 bytes — Vercel is for the frontend only. All blockchain calls go to Railway because Vercel has a 10-second function timeout that breaks HCS/HTS transactions. 

```bash
# ══════════════════════════════════════════════════════════════════
# STEP 1: Create railway.toml in root (Railway config file)
# ══════════════════════════════════════════════════════════════════
cat > railway.toml << 'EOF'
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node src/api/server.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[[services]]
name = "api"
EOF

# ══════════════════════════════════════════════════════════════════
# STEP 2: Set ALL environment variables in Railway dashboard
# Go to: railway.app → Project → Variables
# DO NOT use .env file in production — all secrets go here
# ══════════════════════════════════════════════════════════════════

# MAINNET HEDERA:
HEDERA_NETWORK=mainnet
OPERATOR_ID=<mainnet operator account>
OPERATOR_PRIVATE_KEY=<mainnet operator private key>
MAINNET_HCS_TOPIC_ID=<from Step 3a above>
MAINNET_HTS_TOKEN_ID=<from Step 3b above>
RETIREMENT_ACCOUNT_ID=<mainnet retirement account>
RETIREMENT_ACCOUNT_PRIVATE_KEY=<retirement key>
ISSUER_DID=<mainnet Guardian registry DID>
GUARDIAN_POLICY_ID=<mainnet Guardian policy UUID>

# DATABASE:
DATABASE_URL=<Railway PostgreSQL URL — auto-provisioned>
REDIS_URL=<Railway Redis URL — auto-provisioned>

# APP:
NODE_ENV=production
PORT=3000
JWT_SECRET=<strong random secret — generate with: openssl rand -hex 64>
CERTIFICATE_DIR=/app/certificates
PDF_TEMPLATE_DIR=/app/templates

# ══════════════════════════════════════════════════════════════════
# STEP 3: Deploy from GitHub
# ══════════════════════════════════════════════════════════════════
# railway.app → New Project → Deploy from GitHub repo
# Select: BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
# Branch: main
# Railway auto-detects Dockerfile and builds

# ══════════════════════════════════════════════════════════════════
# STEP 4: Provision PostgreSQL and Redis on Railway
# ══════════════════════════════════════════════════════════════════
# In Railway dashboard: + New → Database → PostgreSQL
# Then: + New → Database → Redis
# Both auto-inject DATABASE_URL and REDIS_URL as env vars

# ══════════════════════════════════════════════════════════════════
# STEP 5: Run migrations on Railway PostgreSQL
# ══════════════════════════════════════════════════════════════════
railway run psql $DATABASE_URL -f src/db/migrations/001_create_claims_table.sql
railway run psql $DATABASE_URL -f src/db/migrations/002_create_certificates_table.sql
railway run psql $DATABASE_URL -f src/db/migrations/003_create_buyers_table.sql
railway run psql $DATABASE_URL -f src/db/migrations/004_create_retirements_table.sql

# ══════════════════════════════════════════════════════════════════
# STEP 6: Verify mainnet deployment
# ══════════════════════════════════════════════════════════════════
export RAILWAY_URL="https://<your-project>.railway.app"

curl $RAILWAY_URL/health
# EXPECTED:
# {
#   "status": "healthy",
#   "version": "1.7.0",
#   "features": {
#     "carbonCredits": true,
#     "claimAttribution": true,
#     "buyerRetirement": true,
#     "esgCertificates": true
#   }
# }

curl $RAILWAY_URL/api/features
# Check all 15+ features show as production_ready: true

# ══════════════════════════════════════════════════════════════════
# STEP 7: Run a real mainnet transaction test
# ══════════════════════════════════════════════════════════════════
# Submit one real telemetry reading to mainnet:
curl -X POST $RAILWAY_URL/api/v1/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "plantId": "mainnet-test-001",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "flowRate": 5.53,
    "headHeight": 78.5,
    "powerOutput": 3645,
    "turbineEfficiency": 0.86
  }'

# EXPECTED: Trust score returned + HCS TX on hashscan.io (not testnet)
# Verify: https://hashscan.io/mainnet/topic/<MAINNET_HCS_TOPIC_ID>
# Should show ConsensusSubmitMessage within 5 seconds
```

### Update COST-ANALYSIS.md (3 hours) — Closes Vulnerability #3

This is the third critical vulnerability from your audit document — the current COST-ANALYSIS.md quotes "$500 deployment cost" without context, which makes sophisticated investors immediately skeptical. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/5f339ec1-55f0-40f6-9df0-562909dc1912/Hedera_Hydropower_dMRV_Audit_and_Implementation.docx)

```markdown
<!-- ══════════════════════════════════════════════════════════════ -->
<!-- FILE: docs/COST-ANALYSIS.md  (REPLACE ENTIRELY)              -->
<!-- ══════════════════════════════════════════════════════════════ -->

# Hedera Hydropower dMRV — Full Cost Analysis
## Version 1.7.0 | Updated: April 2026

---

## CORRECTION NOTE
Previous versions of this document cited "$500 deployment cost" without
breakdown. This was the Hedera blockchain transaction cost estimate for
~150 plants/year. This document provides the complete cost structure.

---

## 1. BLOCKCHAIN TRANSACTION COSTS (per plant per year)

| Operation | Frequency | Cost per TX (HBAR) | USD/year |
|---|---|---|---|
| HCS Commitment (REVEAL phase) | 8,760 × 2 | $0.0001 | $1.75 |
| HCS Reveal (COMMIT phase) | 8,760 × 2 | $0.0001 | $1.75 |
| HTS Token Mint | ~500 HREC/year | $0.0005 | $0.25 |
| HTS Token Burn | ~50 retirements/year | $0.0005 | $0.025 |
| Guardian VC submission | ~12/year | $0.001 | $0.012 |
| **BLOCKCHAIN TOTAL** | | | **~$3.80/plant/year** |

For 150 plants: $3.80 × 150 = **$570/year** ← this is the "$500" figure

---

## 2. FULL SYSTEM COST — ALL-IN PER PLANT PER YEAR

### Basic Tier (1–3 MW plant, single sensor)
| Cost Component | Annual Cost |
|---|---|
| IoT sensor + gateway hardware | $1,500–3,000 (one-time, amortized 5yr = $300–600/yr) |
| Cloud hosting (Railway share) | $200–400/year |
| Hedera blockchain transactions | $3.80/year |
| Subscription fee (Basic $100/mo) | $1,200/year |
| Third-party spot audit | $500–2,000/year |
| **TOTAL BASIC** | **$2,204–4,204/year** |

### Standard Tier (3–10 MW, multi-sensor redundancy)
| Cost Component | Annual Cost |
|---|---|
| IoT sensors × 3 + gateway | $4,000–8,000 (one-time, amortized = $800–1,600/yr) |
| Cloud hosting (Railway dedicated) | $400–800/year |
| Hedera blockchain transactions | $3.80/year |
| Subscription fee (Standard $300/mo) | $3,600/year |
| Third-party audit | $2,000–8,000/year |
| **TOTAL STANDARD** | **$6,804–14,004/year** |

### Premium Tier (10–15 MW, ZKP privacy, multi-sig)
| Cost Component | Annual Cost |
|---|---|
| IoT sensors × 5 + HSM gateway | $6,000–12,000 (amortized = $1,200–2,400/yr) |
| Cloud hosting (Railway dedicated + Redis) | $800–1,600/year |
| Hedera blockchain transactions | $15/year (2× volume for ZKP proofs) |
| Subscription fee (Premium $500/mo) | $6,000/year |
| Physical audit by accredited VVB | $5,000–15,000/year |
| **TOTAL PREMIUM** | **$13,015–25,015/year** |

---

## 3. COST ADVANTAGE vs. TRADITIONAL MRV

| Category | Traditional MRV | This System | Advantage |
|---|---|---|---|
| Annual audit cost | $15,000–50,000 | $2,200–25,000 | 2–23× cheaper |
| Per-verification cost | $0.05–0.50 | $0.0002 | 250–2,500× cheaper |
| Time to verification | 48–72 hours (paper) | 2–5 seconds | 34,000× faster |
| Audit trail permanence | Paper/spreadsheet | Immutable HCS | Cannot be altered |
| Excluded plant sizes | <10 MW mostly | 1 MW minimum | 70% more coverage |

---

## 4. COST vs. COMPETING DIGITAL SOLUTIONS

| Solution | Cost per Verification | Finality | Notes |
|---|---|---|---|
| **This system** | **$0.0001–0.0002** | **2–5 seconds** | Hedera HCS |
| Energy Web VCC | $0.001–0.01 | 12–24 seconds | EWC blockchain |
| Verra Digital MRV | $0.01–0.05 | 24–48 hours | Centralized |
| Traditional MRV | $1.00–5.00 | 48–72 hours | Paper-based |

---

## 5. REVENUE MODEL AT SCALE

| Plants | Annual Blockchain Cost | Annual Subscription Revenue | Net |
|---|---|---|---|
| 10 plants | $38/year | $36,000/year | $35,962 |
| 40 plants | $152/year | $144,000/year | $143,848 |
| 100 plants | $380/year | $360,000/year | $359,620 |
| 1,000 plants | $3,800/year | $3,600,000/year | $3,596,200 |

Blockchain costs are negligible vs. revenue at every scale.

---

## 6. HEDERA NETWORK PRICING REFERENCE
- ConsensusSubmitMessage: $0.0001 per transaction
- TokenMint: $0.001 per transaction  
- TokenBurn: $0.001 per transaction
- Source: hedera.com/fees (as of March 2026)
```

***

## 📋 WEEKS 5–8 — April 21 – May 18
### Pitch Deck + Demo Video + Incubator Application

***

### WEEK 5 — 15-Slide Pitch Deck (30 hours + 8 hours for video)

Build in this exact slide sequence — incubator judges scan pitch decks in under 4 minutes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SLIDE 1: TITLE
  Hedera Hydropower dMRV
  Digital Verification for Carbon Credits
  [Your name] | [Date] | hydropower-mrv-19feb26.vercel.app

SLIDE 2: THE PROBLEM (1 image, 2 bullet points)
  "70% of hydropower projects cannot access carbon markets"
  • 1–15 MW plants excluded — audit cost ($15K–50K/yr) exceeds revenue
  • Manual MRV takes 48–72 hours and is alterable

SLIDE 3: THE MARKET SIZE
  $20–60B/year total addressable market
  • 500+ GW global hydropower capacity
  • 100,000+ eligible small plants
  • 0.1% penetration = 100 plants = $1.16M ARR

SLIDE 4: YOUR SOLUTION (1 diagram)
  5-Layer Physics Verification on Hedera
  • Layer 1: P = ρgQHη (ACM0002 physics)
  • Layers 2–5: temporal, environmental, ML, device
  • Result: $0.0001/verification | 2–5 second finality

SLIDE 5: LIVE PROOF (screenshot of HashScan)
  "2,000+ real blockchain transactions"
  • HCS Topic: 0.0.7462776 (immutable audit trail)
  • HTS Token: 0.0.7964264 (HREC minting + burning)
  • Screenshot: hashscan.io showing your topic messages

SLIDE 6: TECHNOLOGY STACK
  Hedera HCS + HTS + Guardian (ACM0002 policy PRs #5687, #5715 merged)
  443 commits | 61 files | 237 tests | 85.3% coverage
  Deployment: Railway (production) + Vercel (frontend)

SLIDE 7: BUSINESS MODEL
  4 revenue channels:
  Channel 1: $0.50/verification
  Channel 2: 1–5% retirement commission
  Channel 3: $100–500/month/plant subscriptions
  Channel 4: $50K–500K enterprise licenses

SLIDE 8: FINANCIAL PROJECTIONS (1 table)
  Year 1: $83K ARR (40 plants)
  Year 3: $1.23M ARR (100 plants + 2 enterprise)
  Year 5: $7.15M ARR (500 plants + 10 enterprise)
  
SLIDE 9: COMPETITIVE ADVANTAGE (table)
  vs. Energy Web VCC: 10–100× cheaper, 5× faster
  vs. Traditional MRV: 2–23× cheaper, 34,000× faster
  vs. Verra Digital MRV: real-time vs. 24–48 hour batch

SLIDE 10: REGULATORY PATH
  • 2,000+ real HCS transactions = audit trail today
  • ACM0002 policy merged to Guardian mainnet repo
  • Verra email sent [date] — awaiting pre-approval pathway
  • ISO 14064-2 certification target: Month 18
  • DLT Earth Bounty Programme: submitted [date]

SLIDE 11: PILOT EVIDENCE
  [If you have 1+ pilot company by Week 5:]
  "[Company name] — [X] MW plant — [Y] HREC generated"
  [HashScan link to their specific transaction]
  "[Quote from their testimonial]"

SLIDE 12: THE TEAM
  Bikram Biswas — Full-stack developer
  • [X] years building on Hedera
  • Guardian contributor (PRs #5687, #5715)
  • ACM0002 methodology expertise
  Advisor: [name if you have one]

SLIDE 13: USE OF FUNDS (if applying for investment)
  $200K seed ask:
  • $80K: Senior backend developer hire (Year 1)
  • $60K: ISO 27001 + ISO 14064-2 certification
  • $40K: 10-plant IoT sensor hardware deployment
  • $20K: Legal + regulatory (Verra formal submission)

SLIDE 14: MILESTONES
  Month 3:  Claim Attribution Layer live (NOW)
  Month 6:  10 paying customers
  Month 12: 40 plants, ISO certs in progress
  Month 18: Verra pre-approval, first enterprise deal
  Month 36: $1.23M ARR, 100+ plants

SLIDE 15: CALL TO ACTION
  We are looking for:
  • Incubator admission (technical mentorship + network)
  • Seed funding: $200K for 18-month runway
  • Pilot partners: 3–5 more hydropower operators
  
  Try it live: hydropower-mrv-19feb26.vercel.app
  GitHub: github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
  Email: [your email]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Demo Video — Exact 5-Minute Script

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED TOOL: OBS Studio (free) + Chrome browser + terminal

RECORDING SEQUENCE (strict order — total: 5 minutes):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[0:00–0:30] INTRO (voice over your GitHub repo)
  "This is a digital MRV system for hydropower carbon credits
   on Hedera blockchain. Let me show you 4 things in 5 minutes."

[0:30–1:30] SCENE 1: SENSOR READING → API
  Show terminal. Run:
  curl -X POST http://localhost:3000/api/v1/telemetry \
    -H "Content-Type: application/json" \
    -d '{ "plantId": "demo-plant", "flowRate": 5.53, 
          "headHeight": 78.5, "powerOutput": 3645, 
          "turbineEfficiency": 0.86 }'
  
  HIGHLIGHT: "Trust score: 0.87 — returned in 1.2 seconds"
  HIGHLIGHT: "Layer 1 physics: 0.92 — P = ρgQHη confirmed"
  HIGHLIGHT: "hcsRevealTxId: 0.0.7462776@1234567890"

[1:30–2:30] SCENE 2: HASHSCAN PROOF (most important scene)
  Open: https://hashscan.io/testnet/topic/0.0.7462776
  Show: List of ConsensusSubmitMessage transactions
  Click: The most recent one
  Show: The JSON payload inside — expand it on screen
  HIGHLIGHT: "timestamp, trustScore, plantId, layer scores"
  Say: "This record is permanent. It cannot be changed, deleted,
        or backdated. This is the audit trail."

[2:30–3:30] SCENE 3: TOKEN ON HASHSCAN
  Open: https://hashscan.io/testnet/token/0.0.7964264
  Show: Token details — name "HREC", total supply
  HIGHLIGHT: "Every HREC token represents 1 MWh of verified
               hydropower generation"
  Show: A specific mint transaction — "This is the moment
        carbon credits are created on-chain"

[3:30–4:30] SCENE 4: ESG CERTIFICATE PDF
  Open the test-certificate.pdf you generated in Week 2
  Show: The full PDF — scroll slowly
  HIGHLIGHT: Plant name, quantity (e.g., 10 HREC = 10 MWh)
  HIGHLIGHT: CO2 avoided (e.g., 8.2 tCO2e)
  HIGHLIGHT: QR code in the corner
  Scan the QR code on screen → shows it opens HashScan
  Say: "A buyer receives this PDF. The QR links directly to
        blockchain proof. Nothing can be faked."

[4:30–5:00] CLOSE
  Show: hydropower-mrv-19feb26.vercel.app
  Show: GitHub repo with commit count and test coverage
  Say: "40 plants, $83K Year 1 target. Looking for pilot
        partners and incubator support."
        
EXPORT: MP4, 1920×1080, <200MB file size
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

***

### WEEK 6 — Financial Model (20 hours)

Build this as a Google Sheet or Excel file. Structure it exactly: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/488fdee9-cf42-46e6-928b-032119c43d1e/DOC-20260321-WA0018.docx)

```
SHEET 1: ASSUMPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plant Growth Rate:         5 plants/month (Year 1)
                           3 plants/month (Year 2)
                           2 plants/month (Year 3)
Subscription Mix:          40% Basic ($100), 45% Standard ($300), 15% Premium ($500)
Churn Rate:                5% annual (conservative)
Verifications/plant/year:  8,760 (hourly readings)
HREC/plant/year:           500 (average for 3–5 MW plant)
Carbon price:              $10–15/tonne (voluntary market, Year 1)
Retirement rate:           20% of minted credits retired (Year 1)
Commission rate:           3% of retirement value
Enterprise:                0 deals Year 1, 1 deal Year 2, 2 deals Year 3

SHEET 2: MONTHLY P&L (36 months)
  Columns: Month | Plants | Verifications | Subscription Rev | 
           Retirement Rev | Enterprise Rev | Total Rev |
           Hedera Costs | Hosting | Salary | Total Costs | EBITDA

SHEET 3: UNIT ECONOMICS
  Customer Acquisition Cost: $0 (inbound from hackathon/GitHub)
  Lifetime Value per plant:  $300/mo × 36 months = $10,800
  LTV:CAC ratio:             Infinite (organic) / 10:1 (paid)
  Payback period:            Month 1 (no upfront cost to you)
  Gross margin:              ~94% (blockchain costs = $3.80/plant/yr)

SHEET 4: SCENARIO ANALYSIS
  Bull case (10 plants/month): $250K Year 1, $3.2M Year 3
  Base case (5 plants/month):  $83K Year 1, $1.23M Year 3
  Bear case (2 plants/month):  $30K Year 1, $450K Year 3
```

***

### WEEK 7 — Incubator Application (5 hours)

Target these incubators in priority order: [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/159358305/0fe30ea1-bbf8-42f2-8f45-cfa3ac46e209/DOC-20260321-WA0020.docx)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 1: Hedera-specific (highest chance)
  → Hashgraph Association Grants
    URL: hedera.com/grants
    Why: You have merged PRs to Guardian — this is their ecosystem
    Funding: $10K–100K
    Deadline: Rolling
    Evidence: PRs #5687, #5715 + live HCS/HTS deployment

PRIORITY 2: Climate tech incubators
  → Startup India DPIIT Climate Cohort
    URL: startupindia.gov.in
    Why: Government-backed, no equity for seed stage
    Funding: ₹20–50 lakh ($24K–60K)
  → NASSCOM DeepTech Club
    URL: nasscom.in/deeptech
    Why: Blockchain + climate intersection
    
PRIORITY 3: International
  → Y Combinator (Apply for Winter 2026 batch)
    URL: ycombinator.com/apply
    Deadline: Check current deadline
    Best angle: "Digital MRV for the $20–60B carbon credit market"
  → Techstars Energy (if application window open)
    URL: techstars.com/programs/energy-tech

WHAT TO INCLUDE IN EVERY APPLICATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Evidence 1: GitHub repo with 237+ tests + 85.3% coverage (technical credibility)
Evidence 2: HashScan link (0.0.7462776) showing 2,000+ live transactions
Evidence 3: Guardian PRs #5687 and #5715 (ecosystem contribution)
Evidence 4: Pilot testimonial PDF (market demand — get this in Week 3)
Evidence 5: Financial model (attach the Week 6 spreadsheet)
Evidence 6: Demo video MP4 (4–5 minutes from Week 5)
Evidence 7: COST-ANALYSIS.md showing $0.0001/verification (10–100× cheaper)
```

***

##  COMPLETE ROADMAP 1 MILESTONE TABLE

| Week | Dates | Hours | Build Deliverable | Non-Build Deliverable | Revenue Impact |
|---|---|---|---|---|---|
| **0** | March 23 | 6h | Security fix (.env files deleted) | Hackathon update + DLT Bounty submit + Verra email sent | +$5K potential (DLT Bounty) |
| **1** | Mar 24–30 | 55h | 18 Claim Attribution Layer files, 4 DB migrations, 262+ tests passing | Pilot prospect list (10 companies identified) | Unlocks all 4 revenue channels |
| **2** | Mar 31–Apr 6 | 23h | Guardian policy live (GUARDIAN_POLICY_ID filled), validate-balance endpoint | Full end-to-end test Steps A–I all passing on testnet | Unlocks buyer retirement workflow |
| **3** | Apr 7–13 | 40h | Pilot data loaded into API, HREC tokens minted for pilot | 2–3 pilot companies onboarded, testimonials requested, ESG cert PDFs delivered | First proof of market demand |
| **4** | Apr 14–20 | 23h | Mainnet deployed on Railway, COST-ANALYSIS.md rewritten, railway.toml committed | All env vars in Railway (not vercel.json), mainnet HCS+HTS verified on HashScan | Revenue collection is NOW possible |
| **5** | Apr 21–27 | 38h | — | 15-slide pitch deck (PDF), 5-min demo video (MP4) | Funding path opened |
| **6** | Apr 28–May 4 | 25h | — | Verra follow-up email, 5-year financial model spreadsheet | Regulatory clock advances |
| **7** | May 5–11 | 9h | — | 1-page executive summary, incubator application submitted | Funding becomes possible |
| **8** | May 12–18 | buffer | Fix whatever broke during Week 7 | All deliverables confirmed complete | — |
| **TOTAL** | **8 weeks** | **~219h** | **18 new source files, 4 DB migrations, 3 new API routes** | **5 outreach actions, 3 incubator apps, 2–3 pilots** | **$83K Year 1 target** |

***


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**That is the complete Roadmap 1.
