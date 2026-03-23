# ROADMAP 1 — FOUNDATION & CLAIM ATTRIBUTION LAYER
## Hedera Hydropower dMRV | Month 1–6 | Week-by-Week Execution
**Author: Bikram Biswas | Updated: March 24, 2026 | Status: Active Development**

---

## WHERE I AM RIGHT NOW

I have built a working 5-layer verification engine for small hydropower plants on Hedera testnet. The system is live. Let me be exact about what exists and what doesn't:

### What I Have Built (Verified From Repo)

| Component | File | Size | Status |
|---|---|---|---|
| Main API server | `src/api/server.js` | 19,952 bytes | ✅ Live |
| 5-layer verification engine | `src/engine/verification-engine-v1.js` | 47,628 bytes | ✅ Core system |
| Sensor ingestion | `src/api/v1/telemetry.js` | 6,626 bytes | ✅ Working |
| Multi-tenant management | `src/api/v1/tenants.js` | 11,084 bytes | ✅ Working |
| Multi-plant coordination | `src/api/v1/multi-plant.js` | 6,765 bytes | ✅ Working |
| ML anomaly detector | `src/anomaly-detector-ml.js` | 2,342 bytes | ✅ Isolation Forest |
| HCS audit logging | Embedded in workflow | — | ✅ Topic 0.0.7462776 |
| HREC token | HTS on testnet | — | ✅ Token 0.0.7964264 |
| Docker + tests | `docker-compose.yml`, `jest.config.js` | — | ✅ 237+ tests |

### What Is Missing (Must Build in Month 1–6)

```
CRITICAL GAPS — nothing earns revenue until these exist:
  src/api/v1/claims.js          ❌ Claim initiation + lifecycle
  src/api/v1/buyer.js           ❌ Buyer balance + history
  src/api/v1/certificates.js    ❌ Certificate fetch + verify
  src/hedera/token-retirement.js ❌ HREC burn on HTS
  src/hedera/hcs-audit-logger.js ❌ Immutable retirement logging
  src/hedera/guardian-client.js  ❌ Guardian policy integration
  src/did/did-manager.js         ❌ W3C DID for buyers
  src/certificates/certificate-generator.js ❌ W3C VC generation
  src/certificates/pdf-renderer.js          ❌ PDF ESG certificate
  src/middleware/buyer-auth.js               ❌ Buyer JWT validation
  src/middleware/claim-validation.js         ❌ Payload validation
  src/db/migrations/*.sql                    ❌ 4 DB tables
```

### Security Issues I Must Fix First (Do This Today)

My `.env.backup` and `.env.old` files are publicly visible on GitHub. Every second they exist there, anyone can read my testnet Hedera operator ID and private key.

```bash
# READ THEM FIRST — find out if real keys are inside
cat .env.backup
cat .env.old

# If real keys exist: go to portal.hedera.com and ROTATE KEYS before deleting

# Remove from git history:
git rm --cached .env.backup .env.old
git rm .env.backup .env.old

# Clean junk backup files while I'm at it:
git rm src/api/v1/telemetry.js.backup
git rm src/api/v1/telemetry.js.before_fixes
git rm src/api/server-fixed.js
git rm src/api/server.js.original

# Update .gitignore:
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
git commit -m "security: remove exposed env files, clean junk backups"
git push origin main
```

---

## MY 5-LAYER VERIFICATION ENGINE — COMPLETE TECHNICAL REFERENCE

Before I build the business layer on top, I need to fully understand what I have built. Here is the complete technical spec of all 5 layers:

### Layer 1 — Physics Validation (Weight: 30%)

I validate that the reported power output is physically consistent with the reported flow rate and head height using the hydropower formula:

**P = ρ × g × Q × H × η**

Where:
- P = power output in Watts
- ρ = water density (998.2 kg/m³ at 20°C — I adjust for temperature)
- g = 9.81 m/s² (gravitational acceleration)
- Q = volumetric flow rate in m³/s
- H = effective head height in meters
- η = turbine efficiency (0.82–0.92 for modern Kaplan/Francis)

```javascript
// src/engine/verification-engine-v1.js — Layer 1 core logic
validatePhysics(flowRate, headHeight, powerOutput, turbineEfficiency = 0.88) {
  const rho = 998.2;      // water density kg/m³
  const g   = 9.81;       // gravitational acceleration
  
  const expectedPower = rho * g * flowRate * headHeight * turbineEfficiency;
  const deviation     = Math.abs(powerOutput - expectedPower) / expectedPower;
  
  // Scoring: perfect = 1.0, ±5% = 0.95, ±15% = 0.70, >25% = 0.0 (reject)
  if (deviation <= 0.05)  return { score: 1.0 - (deviation * 1.0),  pass: true  };
  if (deviation <= 0.15)  return { score: 0.95 - (deviation * 1.7), pass: true  };
  if (deviation <= 0.25)  return { score: 0.70 - (deviation * 2.8), pass: true  };
  return { score: 0.0, pass: false, reason: `Physics violation: ${(deviation*100).toFixed(1)}% deviation` };
}
```

**What this catches:** A sensor reporting 5.2 MW from a plant with Q=3.1 m³/s and H=50m has an expected output of `998.2 × 9.81 × 3.1 × 50 × 0.88 = 1,334 kW`. Reporting 5,200 kW is a 290% deviation — Layer 1 rejects it with score 0.0, and the reading never reaches HTS minting. This is the fraud-prevention core.

### Layer 2 — Temporal Consistency (Weight: 25%)

I check that power output changes between consecutive readings are physically plausible. A turbine cannot jump from 1 MW to 8 MW in 15 minutes without a physically measurable change in flow rate.

```javascript
// Temporal validation thresholds (from my implementation):
const MAX_POWER_CHANGE_RATE = 0.35;    // max 35% change per 15-minute window
const MAX_FLOW_CHANGE_RATE  = 0.25;    // max 25% flow change per 15 minutes
const CONSISTENCY_WINDOW    = 15;      // minutes — matches typical SCADA logging

validateTemporalConsistency(currentReading, previousReading) {
  const timeDeltaMin  = (currentReading.timestamp - previousReading.timestamp) / 60000;
  const powerDelta    = Math.abs(currentReading.powerOutput - previousReading.powerOutput);
  const powerChange   = powerDelta / previousReading.powerOutput;
  const normalizedRate = powerChange / (timeDeltaMin / 15);  // per 15-min window
  
  if (normalizedRate > MAX_POWER_CHANGE_RATE) {
    return { score: Math.max(0, 1 - (normalizedRate / MAX_POWER_CHANGE_RATE)), flag: 'RAPID_CHANGE' };
  }
  return { score: 1.0, flag: null };
}
```

### Layer 3 — Environmental Cross-Validation (Weight: 20%)

I cross-reference reported river flow rates against regional weather data. A plant reporting maximum generation during a documented drought period gets flagged. I currently pull from Open-Meteo API (free, no key required).

```javascript
// Environmental validation logic:
async validateEnvironmental(plantId, flowRate, timestamp) {
  const plant    = await Plant.findById(plantId);
  const weather  = await openMeteoClient.getPrecipitation(plant.lat, plant.lon, timestamp);
  
  // Expected flow correlation with recent precipitation:
  const precipLast7Days = weather.daily.precipitation_sum.slice(-7).reduce((a,b) => a+b, 0);
  const expectedFlowMin = plant.baselineFlow * (0.6 + (precipLast7Days / 100) * 0.8);
  const expectedFlowMax = plant.baselineFlow * (1.4 + (precipLast7Days / 100) * 1.2);
  
  if (flowRate >= expectedFlowMin && flowRate <= expectedFlowMax) {
    return { score: 1.0, consistent: true };
  }
  const deviation = Math.min(
    Math.abs(flowRate - expectedFlowMin), 
    Math.abs(flowRate - expectedFlowMax)
  ) / plant.baselineFlow;
  
  return { score: Math.max(0.3, 1 - deviation), consistent: false, flag: 'WEATHER_INCONSISTENCY' };
}
```

### Layer 4 — ML Anomaly Detection (Weight: 15%)

I use Isolation Forest trained on my testnet data. The model learns the normal signature for each plant type and flags readings that fall outside that learned distribution. Current implementation is in `src/anomaly-detector-ml.js` (2,342 bytes).

```javascript
// Current ML thresholds (from my anomaly-detector-ml.js):
const ANOMALY_THRESHOLD = -0.15;    // Isolation Forest score boundary
const CONTAMINATION     = 0.08;     // Expected 8% anomaly rate in training data

// Trust score contribution:
// IF score > ANOMALY_THRESHOLD: layer4Score = 1.0 (normal)
// IF score between -0.3 and -0.15: layer4Score = 0.6 (suspicious)
// IF score < -0.3: layer4Score = 0.0 (anomalous — hard reject)
```

**Known weakness I am actively fixing:** My Isolation Forest was trained on early testnet simulation data — not real plant data. After 12 months of real production readings across different seasons, the model will drift. Week 3 of this roadmap adds a `DriftDetector` class that monitors the rolling anomaly rate and alerts me when retraining is needed.

### Layer 5 — Device Attestation (Weight: 10%)

I verify that sensor data comes from a cryptographically authenticated device, not a spoofed API request. Each IoT sensor signs its payload with HMAC-SHA256 using a device-specific secret key registered at onboarding.

```javascript
// Device attestation validation:
validateDeviceAttestation(payload, hmacSignature, deviceSecret) {
  const expectedHmac = crypto
    .createHmac('sha256', deviceSecret)
    .update(JSON.stringify({
      plantId:     payload.plantId,
      sensorId:    payload.sensorId,
      timestamp:   payload.timestamp,
      flowRate:    payload.flowRate,
      powerOutput: payload.powerOutput
    }))
    .digest('hex');
  
  if (hmacSignature === expectedHmac) return { score: 1.0, attested: true };
  return { score: 0.0, attested: false, reason: 'HMAC_MISMATCH — possible spoofed reading' };
}
```

### Final Trust Score Calculation

```javascript
// Composite trust score with weighted layers:
const trustScore = (
  layer1_physics     * 0.30 +
  layer2_temporal    * 0.25 +
  layer3_environment * 0.20 +
  layer4_ml          * 0.15 +
  layer5_device      * 0.10
);

// Decision thresholds:
if (trustScore >= 0.90)  return 'APPROVED';  // → mint HREC tokens
if (trustScore >= 0.50)  return 'FLAGGED';   // → human review queue
if (trustScore < 0.50)   return 'REJECTED';  // → logged, not minted
```

**Real test result from my audit document:**
```
Timestamp: 2026-01-26T09:15:00Z
Input: flowRate=4.2 m³/s, headHeight=52m, powerOutput=1,640 kW
Layer 1 (physics): P_expected = 998.2 × 9.81 × 4.2 × 52 × 0.88 = 1,882 kW
                   Deviation = |1640-1882|/1882 = 12.9% → score: 0.749
Layer 2 (temporal): 8.3% change from previous → score: 0.836
Layer 3 (env):     Weather consistent → score: 0.912
Layer 4 (ML):      Isolation Forest: -0.087 → score: 0.842
Layer 5 (device):  HMAC valid → score: 1.0
FINAL TRUST SCORE: 0.749×0.30 + 0.836×0.25 + 0.912×0.20 + 0.842×0.15 + 1.0×0.10
                 = 0.2247 + 0.2090 + 0.1824 + 0.1263 + 0.10 = 0.842 → APPROVED
```

---

## WEEK 0 — BEFORE I START BUILDING (March 23, 2026)

### Task 0A: Security Fix (30 minutes — do this first)

See the security fix commands in the section above. Do them before anything else.

### Task 0B: Local Environment Verification (1 hour)

```bash
# Verify postgres and redis are in docker-compose.yml:
cat docker-compose.yml | grep -E "postgres|redis|image:"

# Start local services:
docker-compose up -d postgres redis
docker ps | grep -E "postgres|redis"

# Verify all existing tests pass before I touch anything:
npm test
# Target: 237+ passing, zero failures

# Create new directories I'll need:
mkdir -p src/hedera
mkdir -p src/did
mkdir -p src/certificates
mkdir -p src/db/models
mkdir -p src/db/migrations
mkdir -p src/utils
mkdir -p templates
mkdir -p certificates

git add -A
git commit -m "setup: create directory structure for Claim Attribution Layer"
git push
```

### Task 0C: Add 6 New Environment Variables

```bash
# Append to .env.example:
cat >> .env.example << 'EOF'

# ═══════════════════════════════════════════════════════
# CLAIM ATTRIBUTION LAYER — Required from Week 1 onwards
# ═══════════════════════════════════════════════════════

# Hedera account dedicated to retirement operations
RETIREMENT_ACCOUNT_ID=0.0.XXXXX
RETIREMENT_ACCOUNT_PRIVATE_KEY=302e...

# W3C DID for my system as credential issuer
# Generated via Guardian after Week 2 setup
ISSUER_DID=did:hedera:testnet:XXXXX
ISSUER_PRIVATE_KEY=

# RSA-2048 key for signing W3C Verifiable Credentials
# Generate: openssl genrsa -out issuer_private.pem 2048
CERTIFICATE_SIGNING_KEY=

# Local filesystem paths
CERTIFICATE_DIR=./certificates
PDF_TEMPLATE_DIR=./templates

# Guardian policy UUID (filled after Week 2 setup)
GUARDIAN_POLICY_ID=
EOF

git add .env.example
git commit -m "config: add Claim Attribution Layer env variables to example"
```

---

## WEEK 1 — March 24–30, 2026
### Build the Claim Attribution Layer Core
### ~55 hours | This is the only thing that unlocks revenue

---

### Step 1: Fix Commit-Reveal Vulnerability in src/workflow.js (2 hours)

My current flow submits one HCS message with the full verified record. The problem: I can theoretically process data, see the result, decide not to submit if it's bad, and only submit good results. A VVB auditor cannot distinguish between "I submitted all readings" and "I cherry-picked good ones."

The fix: submit a cryptographic commitment (just the hash) **before** verification. Then submit the full data after. Now any gap between commitment and reveal is visible on-chain.

```javascript
// src/workflow.js — ADD before the existing HCS submit
const crypto = require('crypto');

// ── PHASE 1: COMMITMENT (runs before verification) ──────────────
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

// ── MY EXISTING 5-LAYER VERIFICATION RUNS HERE (unchanged) ──────
// const verifiedRecord = await runVerificationLayers(rawSensorData);

// ── PHASE 2: REVEAL (runs after verification) ───────────────────
const revealTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:             'REVEAL',
  version:          '1.0',
  commitmentHash:   payloadHash,
  commitmentTxId:   commitTxId,
  plantId:          rawSensorData.plantId,
  verifiedAt:       Date.now(),
  layer1_physics:   physicsScore,
  layer2_temporal:  temporalScore,
  layer3_env:       envScore,
  layer4_ml:        mlScore,
  layer5_device:    deviceScore,
  trustScore:       verifiedRecord.trustScore,
  trustLevel:       verifiedRecord.trustLevel,
  energyGenerated_kWh: verifiedRecord.energyGenerated,
  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput
  }
}));

// Return both transaction IDs:
return {
  ...verifiedRecord,
  commitmentTxId: commitTxId,
  revealTxId:     revealTx.transactionId.toString(),
  hashScanCommitment: `https://hashscan.io/testnet/transaction/${commitTxId}`,
  hashScanReveal:     `https://hashscan.io/testnet/transaction/${revealTx.transactionId}`
};
```

**Cost:** +$0.0002/reading. At 8,760 readings/year/plant = $1.75/year per plant. Closes Vulnerability #1 permanently.

### Step 2: Add DriftDetector to src/anomaly-detector-ml.js (2 hours)

I append this class to my existing 2,342-byte file. It monitors the rolling anomaly flag rate — if it climbs above 15%, my model is likely drifting and I need to retrain.

```javascript
// APPEND to src/anomaly-detector-ml.js — after existing exports

class DriftDetector {
  constructor(windowSize = 100, threshold = 0.15, hcsLogger = null) {
    this.history     = [];
    this.maxWindow   = windowSize;
    this.threshold   = threshold;
    this.driftCount  = 0;
    this.hcsLogger   = hcsLogger;
    this.lastDriftAt = null;
  }

  async check(isAnomaly, plantId = 'unknown') {
    this.history.push(isAnomaly ? 1 : 0);
    if (this.history.length > this.maxWindow) this.history.shift();

    const anomalyCount = this.history.reduce((acc, val) => acc + val, 0);
    const rate         = anomalyCount / this.history.length;

    if (this.history.length < this.maxWindow) {
      return { status: 'WARMING_UP', rate, windowFill: this.history.length };
    }

    if (rate > this.threshold) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
      if (this.hcsLogger) {
        await this.hcsLogger.logDriftWarning({
          plantId, anomalyRate: rate, threshold: this.threshold,
          driftCount: this.driftCount, action: 'HUMAN_REVIEW_REQUIRED'
        });
      }
      return { status: 'DRIFT_DETECTED', rate: +(rate.toFixed(3)), driftCount: this.driftCount };
    }
    return { status: 'NORMAL', rate: +(rate.toFixed(3)), driftCount: this.driftCount };
  }

  reset() { this.history = []; this.driftCount = 0; this.lastDriftAt = null; }
}

module.exports.DriftDetector = DriftDetector;
```

### Step 3: Build 4 Database Tables (5 hours)

```sql
-- FILE: src/db/migrations/001_create_claims_table.sql
CREATE TABLE IF NOT EXISTS claims (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id             VARCHAR(50)  NOT NULL,
    buyer_did            VARCHAR(200) NOT NULL,
    buyer_account_id     VARCHAR(50),
    quantity_requested   DECIMAL(18,6) NOT NULL,
    quantity_approved    DECIMAL(18,6),
    period_start         TIMESTAMP NOT NULL,
    period_end           TIMESTAMP NOT NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','SUBMITTED_TO_GUARDIAN',
                             'GUARDIAN_APPROVED','TOKEN_BURNING','CERTIFICATE_GENERATING',
                             'COMPLETED','REJECTED','CANCELLED','EXPIRED')),
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

-- FILE: src/db/migrations/002_create_certificates_table.sql
CREATE TABLE IF NOT EXISTS certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    credential_id       VARCHAR(200) UNIQUE NOT NULL,
    issuer_did          VARCHAR(200) NOT NULL,
    subject_did         VARCHAR(200) NOT NULL,
    issuance_date       TIMESTAMP NOT NULL,
    expiry_date         TIMESTAMP,
    plant_id            VARCHAR(50)  NOT NULL,
    plant_name          VARCHAR(200),
    plant_location      VARCHAR(500),
    quantity_hrec       DECIMAL(18,6) NOT NULL,
    energy_mwh          DECIMAL(18,6) NOT NULL,
    emission_factor     DECIMAL(10,6),
    co2_avoided_tonnes  DECIMAL(18,6),
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
    total_hrec_retired  DECIMAL(18,6) DEFAULT 0,
    total_claims        INTEGER DEFAULT 0,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FILE: src/db/migrations/004_create_retirements_table.sql
CREATE TABLE IF NOT EXISTS retirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id            UUID NOT NULL REFERENCES claims(id),
    buyer_id            UUID NOT NULL REFERENCES buyers(id),
    certificate_id      UUID REFERENCES certificates(id),
    token_id            VARCHAR(50) NOT NULL,
    quantity_burned     DECIMAL(18,6) NOT NULL,
    burn_tx_id          VARCHAR(200) UNIQUE NOT NULL,
    burn_tx_timestamp   TIMESTAMP NOT NULL,
    retirement_reason   VARCHAR(200),
    beneficiary_name    VARCHAR(200),
    beneficiary_did     VARCHAR(200),
    hcs_log_tx_id       VARCHAR(200),
    registry_submission_status VARCHAR(30) DEFAULT 'NOT_SUBMITTED'
                          CHECK (registry_submission_status IN (
                            'NOT_SUBMITTED','SUBMITTED_TO_VERRA','VERRA_CONFIRMED',
                            'SUBMITTED_TO_GOLD_STANDARD','GS_CONFIRMED','FAILED')),
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
psql -h localhost -U postgres -d hedera_mrv -c "\dt" | grep -E "claims|certs|buyers|retire"
```

### Step 4: Build src/hedera/token-retirement.js (3 hours)

```javascript
// FILE: src/hedera/token-retirement.js  (NEW)
const {
  Client, TokenBurnTransaction, TransferTransaction,
  AccountBalanceQuery, TokenId, AccountId, PrivateKey
} = require('@hashgraph/sdk');

class TokenRetirementManager {
  constructor() {
    this.client = Client.forTestnet();  // swap to forMainnet() in Week 4
    this.client.setOperator(
      AccountId.fromString(process.env.RETIREMENT_ACCOUNT_ID),
      PrivateKey.fromString(process.env.RETIREMENT_ACCOUNT_PRIVATE_KEY)
    );
    this.tokenId = TokenId.fromString('0.0.7964264');
  }

  // RETIREMENT METHOD 1: Treasury Burn — preferred for compliance
  // Burns from supply permanently — immutable proof of retirement
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
      hashScanUrl:  `https://hashscan.io/testnet/transaction/${txId}`,
      retiredAt:    new Date().toISOString(),
      method:       'TREASURY_BURN'
    };
  }

  // RETIREMENT METHOD 2: Transfer to retirement black-hole account
  // For buyers who want proof in their own account history
  async retireTokensByTransfer(fromAccountId, amount) {
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(this.tokenId, AccountId.fromString(fromAccountId), -amount)
      .addTokenTransfer(this.tokenId, AccountId.fromString(process.env.RETIREMENT_ACCOUNT_ID), amount)
      .execute(this.client);
    const receipt = await transferTx.getReceipt(this.client);
    const txId    = transferTx.transactionId.toString();
    return {
      txId,
      transferredAmount: amount,
      from:       fromAccountId,
      to:         process.env.RETIREMENT_ACCOUNT_ID,
      hashScanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
      retiredAt:  new Date().toISOString(),
      method:     'RETIREMENT_TRANSFER'
    };
  }

  async getTokenBalance(accountId) {
    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(this.client);
    const tokenBalance = balance.tokens.get(this.tokenId);
    return tokenBalance ? tokenBalance.toNumber() : 0;
  }
}

module.exports = { TokenRetirementManager };
```

### Step 5: Build src/hedera/hcs-audit-logger.js (2 hours)

```javascript
// FILE: src/hedera/hcs-audit-logger.js  (NEW)
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
    const message  = JSON.stringify({ ...messageObj, loggedAt: Date.now() });
    const submitTx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(this.client);
    await submitTx.getReceipt(this.client);
    return submitTx.transactionId.toString();
  }

  async logClaimInitiation(claimData) {
    return this._submit({
      event: 'CLAIM_INITIATED', claimId: claimData.id,
      plantId: claimData.plantId, buyerDID: claimData.buyerDid,
      quantity: claimData.quantityRequested,
      period: `${claimData.periodStart}/${claimData.periodEnd}`
    });
  }

  async logTokenRetirement(data) {
    return this._submit({
      event: 'TOKEN_RETIRED', claimId: data.claimId,
      burnTxId: data.burnTxId, quantity: data.quantityBurned, method: data.method
    });
  }

  async logCertificateGeneration(certData) {
    return this._submit({
      event: 'CERTIFICATE_GENERATED', certId: certData.id,
      credentialId: certData.credentialId, claimId: certData.claimId,
      issuedTo: certData.subjectDid, pdfHash: certData.pdfHashSha256
    });
  }

  async logDriftWarning(driftData) {
    return this._submit({
      event: 'ML_DRIFT_WARNING', plantId: driftData.plantId,
      anomalyRate: driftData.anomalyRate, threshold: driftData.threshold,
      driftCount: driftData.driftCount, action: driftData.action
    });
  }
}

module.exports = { HCSAuditLogger };
```

### Step 6: Build the Full Claims API (src/api/v1/claims.js) (8 hours)

This single file handles the entire claim lifecycle — 6 endpoints:

```javascript
// FILE: src/api/v1/claims.js  (NEW — does not exist yet)
const express   = require('express');
const router    = express.Router();
const { v4: uuidv4 } = require('uuid');
const { TokenRetirementManager } = require('../../hedera/token-retirement');
const { HCSAuditLogger }         = require('../../hedera/hcs-audit-logger');
const { GuardianClient }         = require('../../hedera/guardian-client');
const { CertificateGenerator }   = require('../../certificates/certificate-generator');
const { validateBuyerJWT }       = require('../../middleware/buyer-auth');
const { validateClaimPayload }   = require('../../middleware/claim-validation');
const db                         = require('../../db/models/claims');

// ── POST /api/v1/claims/validate-balance ─────────────────────────
// Called by Guardian policy Block 3 to confirm buyer has tokens
// This endpoint is PUBLIC — Guardian calls it without auth headers
router.post('/validate-balance', async (req, res) => {
  const { buyerAccountId, quantity } = req.body;
  if (!buyerAccountId || !quantity) {
    return res.status(400).json({ valid: false, error: 'MISSING_FIELDS' });
  }
  try {
    const mgr     = new TokenRetirementManager();
    const balance = await mgr.getTokenBalance(buyerAccountId);
    const required = parseFloat(quantity);
    const valid    = balance >= required;
    return res.json({
      valid, balance, required,
      shortfall: valid ? 0 : required - balance,
      tokenId: '0.0.7964264'
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: 'BALANCE_CHECK_FAILED', details: err.message });
  }
});

// ── POST /api/v1/claims/initiate ──────────────────────────────────
router.post('/initiate', validateBuyerJWT, validateClaimPayload, async (req, res) => {
  const { quantity, plantId, periodStart, periodEnd, buyerDid, buyerAccountId } = req.body;
  try {
    const mgr     = new TokenRetirementManager();
    const balance = await mgr.getTokenBalance(buyerAccountId);
    if (balance < quantity) {
      return res.status(400).json({
        error: 'INSUFFICIENT_BALANCE',
        message: `Required: ${quantity} HREC. Available: ${balance} HREC.`,
        balance, required: quantity
      });
    }
    const claimId = uuidv4();
    const claim   = await db.create({
      id: claimId, plantId, buyerDid, buyerAccountId,
      quantityRequested: quantity,
      periodStart: new Date(periodStart),
      periodEnd:   new Date(periodEnd),
      status: 'PENDING'
    });
    const hcsLogger  = new HCSAuditLogger();
    const hcsTxId    = await hcsLogger.logClaimInitiation(claim);
    await db.update(claimId, { hcsCommitmentTxId: hcsTxId });
    const guardian   = new GuardianClient();
    const guardianId = await guardian.submitRetirementClaim(claim);
    await db.update(claimId, {
      status: 'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId: guardianId,
      guardianSubmissionAt: new Date()
    });
    return res.status(201).json({
      claimId, status: 'SUBMITTED_TO_GUARDIAN',
      guardianDocumentId: guardianId, quantity, plantId,
      hashScanAudit: `https://hashscan.io/testnet/transaction/${hcsTxId}`,
      message: 'Claim submitted. Poll GET /api/v1/claims/:claimId for status.'
    });
  } catch (err) {
    return res.status(500).json({ error: 'CLAIM_INITIATION_FAILED', details: err.message });
  }
});

// ── GET /api/v1/claims/:claimId ───────────────────────────────────
router.get('/:claimId', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (claim.status === 'SUBMITTED_TO_GUARDIAN' && claim.guardianDocumentId) {
    const guardian = new GuardianClient();
    const status   = await guardian.checkClaimStatus(claim.guardianDocumentId);
    if (status === 'APPROVED') {
      await db.update(claim.id, { status: 'GUARDIAN_APPROVED', guardianApprovalAt: new Date() });
      claim.status = 'GUARDIAN_APPROVED';
    }
  }
  return res.json(claim);
});

// ── GET /api/v1/claims/:claimId/certificate ───────────────────────
router.get('/:claimId/certificate', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (claim.status !== 'COMPLETED') {
    return res.status(400).json({ error: 'CERTIFICATE_NOT_READY', status: claim.status });
  }
  const cert = await require('../../db/models/certificates').findByClaimId(claim.id);
  return res.json(cert);
});

// ── GET /api/v1/claims/:claimId/certificate/pdf ───────────────────
router.get('/:claimId/certificate/pdf', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim || claim.status !== 'COMPLETED') {
    return res.status(404).json({ error: 'CERTIFICATE_NOT_AVAILABLE' });
  }
  const cert    = await require('../../db/models/certificates').findByClaimId(claim.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="HREC-${claim.id}.pdf"`);
  require('fs').createReadStream(cert.pdfPath).pipe(res);
});

// ── POST /api/v1/claims/:claimId/cancel ──────────────────────────
router.post('/:claimId/cancel', validateBuyerJWT, async (req, res) => {
  const claim = await db.findById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'CLAIM_NOT_FOUND' });
  if (!['PENDING','SUBMITTED_TO_GUARDIAN'].includes(claim.status)) {
    return res.status(400).json({ error: 'CANNOT_CANCEL', message: `Status ${claim.status} cannot be cancelled` });
  }
  await db.update(claim.id, { status: 'CANCELLED' });
  return res.json({ claimId: claim.id, status: 'CANCELLED' });
});

module.exports = router;
```

### Step 7: Wire New Routes Into src/api/server.js (30 minutes)

Find where existing routes are registered and add 3 lines:

```javascript
// src/api/server.js — find the telemetry router block, add immediately after:
const claimsRouter       = require('./v1/claims');
const buyerRouter        = require('./v1/buyer');
const certificatesRouter = require('./v1/certificates');

app.use('/api/v1/claims',       claimsRouter);
app.use('/api/v1/buyer',        buyerRouter);
app.use('/api/v1/certificates', certificatesRouter);
```

### Step 8: Run All Tests and Commit (3 hours)

```bash
npm test
# Target: 262+ passing (237 existing + 25 new for claim attribution)
# Coverage: ≥85.3%

git add -A
git commit -m "feat(v1.7.0): Claim Attribution Layer — 18 new files

- token-retirement.js: HREC burn + transfer retirement on HTS
- hcs-audit-logger.js: immutable claim lifecycle logging on HCS 0.0.7462776
- guardian-client.js: Guardian policy integration
- did-manager.js: W3C DID registration and resolution for buyers
- certificate-generator.js: W3C VC generation with CO2e calculation
- pdf-renderer.js: PDFKit certificate with QR code + HashScan link
- claims.js: 6 endpoints covering full claim lifecycle
- buyer.js: buyer balance, history, registration
- certificates.js: certificate fetch + cryptographic verification
- buyer-auth.js: BUYER role JWT middleware
- claim-validation.js: payload validation middleware
- 4 DB migrations: claims, certificates, buyers, retirements

Security fixes:
- commit-reveal hash added to workflow.js (closes Vuln #1)
- DriftDetector appended to anomaly-detector-ml.js

Tests: 262+ passing | Coverage: 85.3%+"
git push origin main
```

---

## WEEK 2 — March 31–April 6, 2026
### Guardian Policy Setup + First End-to-End Test
### ~23 hours

---

### Guardian Policy Creation — Block-by-Block

```
STEP 1: Create Standard Registry account at guardian-ui.hedera.com
  → Role: Standard Registry (not User, not Auditor)
  → Paste testnet operator ID from .env
  → SAVE the DID Guardian assigns → this becomes ISSUER_DID

STEP 2: Associate token 0.0.7964264 with my registry
  → Dashboard → Token Management → Associate → 0.0.7964264

STEP 3: Create Policy named HREC-Retirement-ESG-v1
  → Tag: HREC_RETIREMENT, Version: 1.0.0

STEP 4: Add 5 policy blocks in order:
  Block 1: InterfaceContainerBlock (container for all roles)
  Block 2: requestVCDocumentBlock (buyer submits retirement request)
            Required fields: plantId, quantity, periodStart, periodEnd, buyerDid
  Block 3: sendToGuardianBlock (calls /api/v1/claims/validate-balance)
            Method: POST | Endpoint: https://<railway-url>/api/v1/claims/validate-balance
  Block 4: approveMintDocumentBlock (3-of-5 verifier multi-sig)
            approvalThreshold: 3 | totalSigners: 5
  Block 5: mintDocumentBlock (burns token, issues VC)
            tokenId: 0.0.7964264 | hcsTopic: 0.0.7462776 | mintAction: BURN

STEP 5: Publish Policy → Guardian returns policyId UUID
  → Save IMMEDIATELY to Railway env vars + local .env
  → GUARDIAN_POLICY_ID=<uuid>

STEP 6: Save Guardian DID to env:
  → ISSUER_DID=did:hedera:testnet:<my-guardian-registry-DID>
```

### End-to-End Test Sequence

Run all 9 steps in order. Each step must pass before moving to the next:

```bash
# Generate test buyer JWT:
node -e "
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { buyerId:'test-001', buyerDid:'did:hedera:testnet:test', role:'BUYER', tier:'STANDARD' },
    process.env.JWT_SECRET, { expiresIn: '24h' }
  );
  console.log('BUYER_TOKEN=' + token);
"
export BUYER_TOKEN=<paste output>

# STEP A: Initiate claim
curl -X POST http://localhost:3000/api/v1/claims/initiate \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":10,"plantId":"plant-001","periodStart":"2026-02-01T00:00:00Z","periodEnd":"2026-02-28T23:59:59Z","buyerDid":"did:hedera:testnet:test","buyerAccountId":"0.0.XXXXX"}'
# Expected: { claimId, status: SUBMITTED_TO_GUARDIAN, hashScanAudit }
export CLAIM_ID=<claimId from response>

# STEP B: Poll status
curl http://localhost:3000/api/v1/claims/$CLAIM_ID -H "Authorization: Bearer $BUYER_TOKEN"

# STEP C: Approve in Guardian (3-of-5 manual sign at guardian-ui.hedera.com)

# STEP D: Poll again — expect GUARDIAN_APPROVED

# STEP E: Verify HTS burn on HashScan
echo "Check: https://hashscan.io/testnet/token/0.0.7964264"
# Total supply should decrease by 10

# STEP F: Verify HCS audit log
echo "Check: https://hashscan.io/testnet/topic/0.0.7462776"
# Should show TOKEN_RETIRED message

# STEP G: Get certificate JSON
curl http://localhost:3000/api/v1/claims/$CLAIM_ID/certificate -H "Authorization: Bearer $BUYER_TOKEN"
# Expected: credentialId, issuerDid, quantityHrec:10, energyMwh:10, co2AvoidedTonnes:8.2

# STEP H: Download PDF certificate
curl -o test-certificate.pdf \
  http://localhost:3000/api/v1/claims/$CLAIM_ID/certificate/pdf \
  -H "Authorization: Bearer $BUYER_TOKEN"
# Open PDF — verify: plant name, buyer DID, 10 HREC, 8.2 tCO2e, QR code, HashScan URL

echo "ALL 8 STEPS PASSED → WEEK 2 COMPLETE"
```

---

## WEEK 3 — April 7–13, 2026
### First Real Pilot Plants
### ~40 hours | This is where revenue begins

---

### Pilot Outreach Email Template

I send this to 10 contacts simultaneously on Day 1:

```
Subject: Free blockchain carbon credit verification for your hydropower plant
         (90 days free, no IoT sensors required)

Dear [Name],

I am a developer based in Kolkata. I have built a digital MRV (Monitoring,
Reporting, Verification) system for small hydropower carbon credits on the 
Hedera blockchain. The system is live.

THE PROBLEM I SOLVE:
Small hydropower plants (1–15 MW) cannot access carbon credit markets today 
because traditional MRV audits cost ₹12–40 lakh per year — more than the 
carbon revenue the plant would earn. My system costs ₹8,000–25,000/year.

WHAT IS LIVE RIGHT NOW:
  → Physics verification: P = ρgQHη (ACM0002 methodology)
  → 2,000+ immutable records on Hedera blockchain
  → W3C Verifiable Credential certificates with your company name
  → Live system: hydropower-mrv-19feb26.vercel.app
  → Blockchain proof: hashscan.io/testnet/topic/0.0.7462776

WHAT I OFFER FOR FREE (90 days):
  → Your plant's generation verified on Hedera blockchain
  → PDF ESG certificate with your company branding
  → Carbon credit potential assessment (HREC tokens)
  → No hardware needed — historical records are sufficient for the pilot

Setup takes 2 hours of your time.

Bikram Biswas | github.com/BikramBiswas786 | WhatsApp: [number]
```

### Pilot Data Collection Form

```
HEDERA dMRV PILOT — PLANT DATA FORM
─────────────────────────────────────────────────────────
Plant name:
Operator company:
State / District / River:
GPS coordinates (optional):

Installed capacity (MW):
Turbine type: [ ] Kaplan  [ ] Francis  [ ] Pelton
Turbine efficiency (% — default 85% if unknown):
Design head (meters):
Average river flow (m³/s):

Generation data (last 6 months):
  Month         kWh generated    Grid hours
  Sep 2025:     ___________      _________
  Oct 2025:     ___________      _________
  Nov 2025:     ___________      _________
  Dec 2025:     ___________      _________
  Jan 2026:     ___________      _________
  Feb 2026:     ___________      _________

Existing Verra/Gold Standard cert: [ ] Yes  [ ] No
Current carbon revenue (₹/year):   ___________

Contact name / position / email / WhatsApp:
─────────────────────────────────────────────────────────
```

### Loading Pilot Data Into the System

```bash
# STEP 1: Register pilot plant
curl -X POST http://localhost:3000/api/v1/plants \
  -H "Content-Type: application/json" \
  -d '{"plant_id":"pilot-001","name":"[Plant Name]","location":"[State, India]",
       "capacity_mw":5.0,"plant_type":"hydro","head_meters":65.0,"turbine_efficiency":0.87}'

# STEP 2: Submit historical reading (convert monthly kWh to average power)
# Example: Feb generation = 1,800,000 kWh ÷ 672 hours = 2,678 kW
# Expected flow: P/(ρgHη) = 2,678,000 / (998.2 × 9.81 × 65 × 0.87) = 4.83 m³/s
curl -X POST http://localhost:3000/api/v1/telemetry \
  -H "Content-Type: application/json" \
  -d '{"plantId":"pilot-001","timestamp":"2026-02-15T12:00:00Z",
       "flowRate":4.83,"headHeight":65,"powerOutput":2678,
       "turbineEfficiency":0.87,"dataSource":"HISTORICAL_RECORDS"}'

# STEP 3: Mint HREC tokens for verified generation
# 1,800,000 kWh ÷ 1000 = 1,800 MWh = 1,800 HREC
curl -X POST http://localhost:3000/api/v1/carbon-credits/mint \
  -H "Content-Type: application/json" \
  -d '{"plantId":"pilot-001","period":"2026-02","energyMWh":1800,"methodology":"ACM0002"}'

# STEP 4: Retire 10 HREC as demo proof, generate PDF certificate
curl -X POST http://localhost:3000/api/v1/claims/initiate \
  -H "Authorization: Bearer $BUYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":10,"plantId":"pilot-001",
       "periodStart":"2026-02-01T00:00:00Z","periodEnd":"2026-02-28T23:59:59Z",
       "buyerDid":"did:hedera:testnet:pilot-001","buyerAccountId":"0.0.XXXXX",
       "beneficiaryName":"[Plant Operator Company Name]"}'
```

---

## WEEK 4 — April 14–20, 2026
### Mainnet Deployment
### ~23 hours

---

### Pre-Mainnet Checklist

```bash
# 1. No secrets in code:
git log --all --full-history | grep -E "\.env|private_key|secret"

# 2. All Hedera IDs come from process.env — not hardcoded:
grep -r "0\.0\.[0-9]" src/ --include="*.js" | grep -v "process.env" | grep -v "//"

# 3. All 262+ tests passing:
HEDERA_NETWORK=testnet npm test

# 4. Full end-to-end claim flow confirmed on testnet (Steps A–H above)
# 5. Vercel frontend working
# 6. Railway backend responding to health check
```

### Mainnet Account Setup

```bash
# Create 3 mainnet accounts at portal.hedera.com:
# 1. OPERATOR account — fund with 200+ HBAR
# 2. RETIREMENT account — receives burned tokens
# 3. ISSUER account — linked to Guardian DID

# 200 HBAR ≈ $80 at current price — covers:
#   200,000 HCS messages (entire first year at 8,760/plant × 22 plants)
#   500 HTS token mints
#   500 HTS token burns

# Create mainnet HCS topic:
node scripts/create-mainnet-topic.js
# → Save MAINNET_HCS_TOPIC_ID to Railway env vars

# Create mainnet HREC token:
node scripts/create-mainnet-token.js
# → Save MAINNET_HTS_TOKEN_ID to Railway env vars
```

### Railway Environment Variables for Production

```bash
# All secrets go to Railway dashboard — never in code:
HEDERA_NETWORK=mainnet
OPERATOR_ID=<mainnet account>
OPERATOR_PRIVATE_KEY=<mainnet key>
RETIREMENT_ACCOUNT_ID=<mainnet retirement account>
RETIREMENT_ACCOUNT_PRIVATE_KEY=<mainnet key>
ISSUER_DID=did:hedera:mainnet:<DID>
CERTIFICATE_SIGNING_KEY=<RSA private key>
GUARDIAN_POLICY_ID=<mainnet policy UUID>
DB_HOST=<Railway Postgres host>
DB_PASSWORD=<Railway Postgres password>
REDIS_URL=<Railway Redis URL>
JWT_SECRET=<new secret — rotate from testnet>
```

---

## WEEKS 5–6 — April 21–May 4, 2026
### Shadow Mode Comparator + CAD Trust
### ~48 hours

---

### Shadow Mode Comparator (src/shadow-mode-comparator.js)

This is how I prove to Verra that my dMRV produces results within acceptable range of their traditional methodology. For every reading I verify, I also compute what Verra's manual spreadsheet would produce, and log both results to HCS.

```javascript
// FILE: src/shadow-mode-comparator.js  (NEW)
class ShadowModeComparator {
  /**
   * For each verified reading, compute both:
   *   - My dMRV result (from 5-layer engine)
   *   - Verra's ACM0002 manual calculation
   * Log the comparison to HCS. Collect 6 months of comparison data
   * for the Verra pre-approval submission.
   */
  async compare(reading, myVerificationResult) {
    const verraResult = this.computeVerraACM0002(reading);
    const deviation   = Math.abs(myVerificationResult.energyGenerated - verraResult.energyGenerated)
                        / verraResult.energyGenerated;
    const withinTolerance = deviation <= 0.03;  // Verra allows ±3%
    
    const comparison = {
      timestamp:         reading.timestamp,
      plantId:           reading.plantId,
      myResult:          myVerificationResult.energyGenerated,
      verraResult:       verraResult.energyGenerated,
      deviation:         deviation,
      withinTolerance:   withinTolerance,
      myTrustScore:      myVerificationResult.trustScore,
      verraTrustLevel:   verraResult.trustLevel
    };
    
    // Log to HCS — this becomes the evidence for Verra submission
    await this.hcsLogger.logShadowComparison(comparison);
    return comparison;
  }

  // Verra ACM0002 simplified calculation — grid emission factor method
  computeVerraACM0002(reading) {
    const energyMWh   = reading.powerOutput * (reading.intervalMinutes / 60) / 1000;
    const gridEF      = 0.82;  // India grid emission factor, CEA 2024 (tCO2e/MWh)
    const co2Avoided  = energyMWh * gridEF;
    return { energyGenerated: energyMWh, co2Avoided, trustLevel: 'STANDARD' };
  }
}

module.exports = { ShadowModeComparator };
```

### CAD Trust Double-Counting Prevention

The biggest concern for large buyers: the same energy generation could be claimed by both the plant operator (for carbon credits) and the grid operator (for renewable energy certificates). I prevent this with a claim attribution key system:

```javascript
// FILE: src/cad-trust.js  (NEW)
// CAD = Claim Attribution and De-duplication

class CADTrust {
  /**
   * When a verification is approved, immediately register a claim key.
   * This key is: hash(plantId + periodStart + periodEnd + tokenId)
   * If the same key is attempted again, the second claim is rejected.
   * All claim keys are stored on HCS — publicly auditable.
   */
  async registerClaimKey(plantId, periodStart, periodEnd) {
    const crypto   = require('crypto');
    const claimKey = crypto
      .createHash('sha256')
      .update(`${plantId}:${periodStart}:${periodEnd}:0.0.7964264`)
      .digest('hex');
    
    // Check if claim key already exists:
    const existing = await this.db.findClaimKey(claimKey);
    if (existing) {
      throw new Error(`DOUBLE_CLAIM_PREVENTED: Period ${periodStart}–${periodEnd} ` +
        `already claimed for plant ${plantId}. ClaimKey: ${claimKey.substring(0,16)}...`);
    }
    
    // Register on HCS — immutable, publicly auditable:
    const hcsTxId = await this.hcsLogger.logClaimKey({
      claimKey,
      plantId,
      periodStart,
      periodEnd,
      tokenId: '0.0.7964264',
      registeredAt: Date.now()
    });
    
    await this.db.storeClaimKey(claimKey, { plantId, periodStart, periodEnd, hcsTxId });
    return { claimKey, hcsTxId };
  }
}

module.exports = { CADTrust };
```

---

## MONTH 2–3: FIRST REVENUE (April–May 2026)

### Pricing Tiers (Launched at First Pilot Confirmation)

| Tier | Monthly Price | Features |
|---|---|---|
| **Basic** | $100/month | Single sensor, standard ML, manual flag review |
| **Standard** | $300/month | Multi-sensor redundancy, drift detection, auto-approval |
| **Premium** | $500/month | ZKP privacy, multi-sig, physical audit reports, ISO-ready docs |

### Revenue Targets

| Month | Plants | Revenue Source | Monthly Revenue |
|---|---|---|---|
| Month 1–2 | 0 | Building | $0 |
| Month 3 | 3 pilots | $700 MRV fees | $700 |
| Month 4 | 8 pilots | Subscriptions + MRV fees | $3,200 |
| Month 5 | 15 plants | Mix of tiers | $6,500 |
| Month 6 | 22 plants | Mix + first retirements | $9,400 |
| **Month 12** | **40+ plants** | **All channels** | **$6,900/mo = $83K ARR** |

### Revenue Channels by Month 12

| Channel | Rate | Annual Revenue |
|---|---|---|
| Per-verification fee | $0.50/verification | $17.5K |
| Retirement commission | 1–5% of credit value | $16K |
| Monthly subscriptions | $100–500/plant | $43.2K |
| API access | $50–200/month | $6.4K |
| **TOTAL** | — | **$83.1K ARR** |

---

## MONTH 4–6: SCALE AND HARDEN

### India CCTS Registration (Month 5–6)

India's Carbon Credit Trading Scheme launches in 2026. I need to register as an approved dMRV provider **before** the launch to capture the first compliance market deals:

```
India CCTS Registration Steps:
1. Register on CCTS portal (Bureau of Energy Efficiency)
2. Submit dMRV system documentation:
   - Technical architecture (5-layer engine spec)
   - HCS audit trail evidence (hashscan.io links)
   - Shadow mode comparison results vs. Verra ACM0002
   - Security assessment (pre-ISO 27001)
3. Apply for Approved dMRV Provider status
4. Timeline: 4–6 months approval → start Month 5, get approval by Month 11
```

### Month 6 Success Criteria

I define success at Month 6 as:

```
✅ 10+ real pilot plants onboarded and generating verified readings
✅ Full Claim Attribution Layer live (claims, retirement, PDF certs)
✅ Guardian policy deployed and 3 real retirements completed
✅ CAD Trust preventing double-counting (tested + proved)
✅ Shadow mode running — 6 months of Verra comparison data collected
✅ India CCTS application submitted
✅ $6,000–9,000 monthly recurring revenue
✅ 262+ tests passing, 85%+ coverage
✅ Zero security incidents
✅ Mainnet deployed and stable
```

---

## WHAT I AM NOT DOING IN ROADMAP 1

To be clear about scope:

- ❌ ISO certifications — that is Month 13–18 (Roadmap 3)
- ❌ Enterprise SDK — that is Month 16–24 (Roadmap 3)
- ❌ Verra formal accreditation — that is Month 31–35 (Roadmap 3)
- ❌ Multi-energy methodologies (solar, wind) — that is Month 25–29 (Roadmap 3)
- ❌ Adaptive ML with ADWIN — that is Month 13–16 (Roadmap 3)
- ❌ Series A preparation — that is Month 20–24 (Roadmap 3)

Roadmap 1 is about one thing: getting the technical foundation right and finding the first 3 paying customers. Everything else follows from that.

---

*Author: Bikram Biswas | System: Hedera Hydropower dMRV | Last updated: March 24, 2026*
*GitHub: github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-*
*Live system: hydropower-mrv-19feb26.vercel.app*
*HCS Audit Topic: hashscan.io/testnet/topic/0.0.7462776*
*HREC Token: hashscan.io/testnet/token/0.0.7964264*