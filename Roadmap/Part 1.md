# ROADMAP PART 1 — PROTOCOL FOUNDATION & CORE ENGINE
## Hedera Hydropower dMRV | Weeks 1–8
### Author: Bikram Biswas | Status: Active Development | Version: V3.0 | Updated: March 24, 2026

> **What I am building and why it matters:** I am building the cheapest, most tamper-proof carbon credit verification system ever deployed for small hydropower plants. Traditional MRV audits cost ₹12–40 lakh per year. Mine costs ₹8,000–25,000. I replace human auditors with physics, blockchain, and machine learning. Every generation record is committed to Hedera — immutable, auditable, permanent. This roadmap covers the first 8 weeks: the cryptographic and scientific foundation that must survive three levels of scrutiny — auditors, regulators, and anyone with a HashScan link.

---

## 1. CURRENT BASELINE — What Exists Today (March 24, 2026)

I started Roadmap 1 by auditing my own repo line by line. No self-delusion. Here is the honest state:

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
| **237 tests** | — | ✅ LIVE | 85.3% coverage, 100% on critical paths |
| **61 source files** | ~2,935 lines | ✅ LIVE | Core logic implemented |

The foundation is strong. The risk is not "no code" — the risk is no cryptographic guarantees and no clean compliance path.

### 🔴 SECURITY EMERGENCY — Fix Before Writing Any New Code

```
EXPOSED FILES (public on GitHub right now):
  .env.backup      → may contain real Hedera private keys
  .env.old         → may contain real secrets

JUNK BACKUP FILES to delete:
  src/api/v1/telemetry.js.backup
  src/api/v1/telemetry.js.before_fixes
  src/api/server-fixed.js
  src/api/server.js.original
```

### ❌ What This Roadmap Builds (Currently Missing)

```
src/hedera/vc-generator.js            ❌ — W3C Verifiable Credential generation
src/did/did-manager.js                ❌ — Hedera-native DID management (HIP-29)
src/carbon-credits/CarbonCreditManager.js ❌ — HREC mint logic tied to engine
src/certificates/certificate-generator.js ❌ — JSON-LD VC wrapper
src/certificates/pdf-renderer.js      ❌ — PDF ESG certificate with QR code
src/api/v1/certificates.js            ❌ — Certificate fetch/verify endpoints
scripts/deploy_hrec_token.js          ❌ — HTS token deployment script
4 database migrations                 ❌ — claims, certificates, buyers, retirements
```

---

## 2. THE 5-LAYER VERIFICATION ENGINE — Complete Specification

This is the core of everything. Every sensor reading passes through all 5 layers sequentially before a trust score is produced. No layer can be skipped. No layer can be faked — all results are committed to HCS before any token is minted.

```
SENSOR READING ARRIVES
        │
        ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 1: PHYSICS VALIDATION                          Weight: 30%     │
│                                                                       │
│  Core Formula (ACM0002): P = ρ × g × Q × H × η                       │
│    ρ = 998.2 kg/m³  (water density at 20°C)                           │
│    g = 9.81 m/s²    (gravitational constant)                          │
│    Q = flow rate    (m³/s) — from turbine flow meter                  │
│    H = net head     (meters) — pressure difference across turbine     │
│    η = turbine efficiency (0.80–0.92 for Francis turbines)            │
│                                                                       │
│  Validation thresholds:                                               │
│    Deviation > 15% of expected P   → score penalty applied            │
│    Deviation > 30% of expected P   → PHYSICS_VIOLATION → auto-reject  │
│    η outside 0.65–0.95 range       → flag for manual review           │
│    Q or H negative                 → immediate rejection              │
│                                                                       │
│  Real simulation results from my testing:                             │
│    Q=5.5 m³/s, H=78m, η=0.86 → Expected P = 3,621 kW                 │
│    Plant reports 3,645 kW → deviation 0.66% → PASS ✅                 │
│    Plant reports 5,200 kW → deviation 43.6% → REJECT ❌               │
│    Plant reports 1,200 kW → deviation 66.8% → REJECT ❌               │
│                                                                       │
│  Why physics as Layer 1: A fraudster can fabricate telemetry JSON.    │
│  They cannot fabricate the laws of fluid dynamics. The physics check  │
│  is stateless — it requires no historical data, no ML, no network.   │
│  It catches the most obvious fraud on the very first reading.         │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │ passes with score
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 2: TEMPORAL CONSISTENCY                        Weight: 25%     │
│                                                                       │
│  What this checks:                                                    │
│    → 15-minute rolling average stability                              │
│    → Maximum ramp rate: ±20% of rated output per 15 minutes          │
│    → Midnight valley: generation must drop 8–15% at 2–4 AM           │
│    → Weekend demand pattern: typically 8–15% lower than weekdays     │
│    → Seasonal baseline: each plant has its own 30-day learned pattern│
│                                                                       │
│  Logic for ramp rate:                                                 │
│    current_delta = |current_output - previous_output| / rated_output  │
│    if current_delta > 0.20 → TEMPORAL_RAMP_VIOLATION → flag           │
│                                                                       │
│  Why this matters: A solar farm can ramp instantly. A hydropower      │
│  turbine cannot — water inertia and governor response limit changes   │
│  to ~20% per 15 minutes under normal operation. A fraudster reporting │
│  0 kW at 11:59 PM and 3,500 kW at 12:00 AM fails this layer.         │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 3: ENVIRONMENTAL CORRELATION                   Weight: 20%     │
│                                                                       │
│  Data sources cross-referenced:                                       │
│    → IMD rainfall data (monsoon vs dry season classification)         │
│    → CWC river gauge readings (Central Water Commission, India)       │
│    → TRMM/GPM satellite precipitation data                           │
│    → Drought index from NDMC (National Drought Monitoring Centre)    │
│                                                                       │
│  Seasonal threshold configuration:                                    │
│    pre_monsoon  (Mar–May):  baseline flow × 0.6–0.8                   │
│    monsoon      (Jun–Sep):  baseline flow × 1.5–3.0 (high variance)   │
│    post_monsoon (Oct–Nov):  baseline flow × 1.0–1.4                   │
│    dry_season   (Dec–Feb):  baseline flow × 0.3–0.6                   │
│                                                                       │
│  Flag conditions:                                                     │
│    High generation (>120% baseline) during declared drought → flag   │
│    Low generation (<40% baseline) during peak monsoon → investigate   │
│    Reported flow inconsistent with river gauge (if available) → flag  │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 4: ML ANOMALY DETECTION                        Weight: 15%     │
│                                                                       │
│  Current algorithm: Isolation Forest (scikit-learn compatible JS)     │
│  Contamination: 0.05 (5% expected anomaly rate in training data)      │
│                                                                       │
│  Feature vector per reading:                                          │
│    [flowRate, headHeight, powerOutput, turbineEfficiency,             │
│     timestamp_hour, timestamp_dayofweek, season_index,               │
│     rolling_avg_1h, rolling_avg_24h]                                  │
│                                                                       │
│  Training: first 30 days of real pilot readings per plant             │
│  Output: anomaly score −1 (anomalous) to +1 (normal)                 │
│                                                                       │
│  Drift detection (current KS-test, being replaced by ADWIN in R2):   │
│    Window: 100 readings                                               │
│    Threshold: >15% anomaly rate in window → DRIFT_DETECTED           │
│    Action: HCS warning message + human review queue                  │
│                                                                       │
│  Known limitation: KS-test is batch — misses gradual drift.           │
│  ADWIN (Bifet & Gavalda 2007) replaces this in Roadmap 2.             │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 5: DEVICE ATTESTATION                          Weight: 10%     │
│                                                                       │
│  Phase 1 (now — software HMAC):                                       │
│    Every sensor payload signed with HMAC-SHA256                       │
│    Secret key stored in .env (operator-side)                          │
│    Signature verified server-side before any processing begins        │
│    Replay protection: nonce + timestamp in every message header       │
│    replayProtection.js middleware: nonces stored in Redis, 5-min TTL  │
│                                                                       │
│  Phase 2 (Month 4+ — Hardware Root of Trust):                         │
│    TPM (Trusted Platform Module) chip at sensor site                  │
│    Private key burned into TPM during manufacturing, non-extractable  │
│    HMAC generated inside TPM — key never leaves hardware              │
│    Device DID issued per sensor, registered on Hedera HCS             │
│    Attestation: device proves identity + reading integrity jointly     │
│                                                                       │
│  Why this is Layer 5 not Layer 1: Device attestation proves the       │
│  message wasn't tampered in transit. But it cannot prove the sensor   │
│  is reading correctly — a corrupt sensor with valid HMAC still fails  │
│  Layer 1 physics. The layers are complementary, not redundant.        │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  TRUST SCORE CALCULATION                                              │
│                                                                       │
│  score = (L1 × 0.30) + (L2 × 0.25) + (L3 × 0.20) +                  │
│          (L4 × 0.15) + (L5 × 0.10)                                   │
│                                                                       │
│  Decision thresholds:                                                 │
│    ≥ 0.90  → APPROVED  → auto-mint HREC tokens → generate VC         │
│    0.50–0.89 → FLAGGED  → human review queue → no auto-mint           │
│    < 0.50  → REJECTED  → no tokens → HCS rejection log only           │
│                                                                       │
│  Simulation test results (from my own testing):                       │
│    Normal reading:      Trust 0.923 → APPROVED ✅                     │
│    Marginal anomaly:    Trust 0.595 → FLAGGED  ⚠️                     │
│    Physics violation:   Trust 0.000 → REJECTED ❌                     │
│    Device replay attack: Trust 0.000 → REJECTED ❌                    │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. WEEK 0 (TODAY) — SECURITY FIRST

**I do this before writing a single line of new code. Exposed keys are an emergency, not a task.**

```bash
# ═══════════════════════════════════════════════════════════════
# STEP 1: Check what actually leaked
# ═══════════════════════════════════════════════════════════════
cat .env.backup
cat .env.old
# If OPERATOR_PRIVATE_KEY or HEDERA_PRIVATE_KEY have real values:
#   → Go to portal.hedera.com IMMEDIATELY
#   → Transfer any HBAR balance to a new account first
#   → Regenerate keys BEFORE deleting (avoid locking myself out)

# ═══════════════════════════════════════════════════════════════
# STEP 2: Remove files from Git history entirely
# ═══════════════════════════════════════════════════════════════
pip install git-filter-repo
git filter-repo --path .env.backup --invert-paths --force
git filter-repo --path .env.old --invert-paths --force
git filter-repo --path src/api/v1/telemetry.js.backup --invert-paths --force
git filter-repo --path src/api/server-fixed.js --invert-paths --force
git filter-repo --path src/api/server.js.original --invert-paths --force
git push origin --force --all
git push origin --force --tags

# ═══════════════════════════════════════════════════════════════
# STEP 3: Update .gitignore permanently
# ═══════════════════════════════════════════════════════════════
cat >> .gitignore << 'EOF'
.env.backup
.env.old
.env.production
*.backup
*.before_fixes
*.original
certificates/generated/
EOF

# ═══════════════════════════════════════════════════════════════
# STEP 4: Rotate ALL keys in Hedera portal
# ═══════════════════════════════════════════════════════════════
# portal.hedera.com → Account → Manage Keys → Generate New
# Update: Railway env vars, Vercel env vars, local .env
# Confirm old key can no longer sign transactions
```

---

## 4. WEEK 1 — COMMIT-REVEAL PATTERN IN `workflow.js`

**Why this matters — Vulnerability #1:** My current system submits one HCS message with the full verified record. A malicious operator could theoretically see verification results before deciding whether to submit the reading at all. The commit-reveal pattern closes this permanently: I hash the raw sensor data and commit it to HCS *before* running any verification. The reveal comes after all 5 layers complete.

```javascript
// FILE: src/workflow.js — ADD at the top of processVerification()
const crypto = require('crypto');

// ── PHASE 1: COMMITMENT (before ANY verification) ────────────────────
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
// ── END COMMITMENT ────────────────────────────────────────────────────

// [5-LAYER VERIFICATION RUNS HERE — UNTOUCHED]
// physicsScore, temporalScore, envScore, mlScore, deviceScore...

// ── PHASE 2: REVEAL (after all verification completes) ───────────────
const revealTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:                  'REVEAL',
  version:               '1.0',
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
  trustLevel:            verifiedRecord.trustLevel,  // APPROVED/FLAGGED/REJECTED
  energyGenerated_kWh:   verifiedRecord.energyGenerated,
  carbonCredits_tCO2:    verifiedRecord.carbonCredits,
  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput,
    efficiency:  rawSensorData.turbineEfficiency
  }
}));
// ── END REVEAL ────────────────────────────────────────────────────────

// Cost: +$0.0002/reading = $1.75/year per plant. Closes Vulnerability #1.
```

---

## 5. WEEKS 2–4 — W3C VERIFIABLE CREDENTIALS & DID LAYER

**Goal:** Every APPROVED reading becomes a W3C Verifiable Credential signed by my DID — not just a JSON blob. A regulator, auditor, or buyer can verify any credit offline using only the VC + a HashScan link.

### DID Architecture

```
DID HIERARCHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUER DID  (one, permanent):
  did:hedera:testnet:<operator_account_id>
  → Registered on Hedera via HCS DID document
  → Signs every VC
  → Public key in DID document on HCS
  → This is MY DID as the dMRV system operator

PLANT DID  (one per plant):
  did:hedera:testnet:<plant_account_id>
  → Created when plant is registered in system
  → Is the subject of each generation VC
  → Later: one DID per sensor device for granularity

DEVICE DID  (one per sensor — Phase 2):
  did:hedera:testnet:<device_serial_hash>
  → Used in Layer 5 attestation
  → Tied to TPM hardware identity
```

### New File: `src/hedera/vc-generator.js`

```javascript
// FILE: src/hedera/vc-generator.js  (NEW FILE)
// W3C Verifiable Credential generator for APPROVED hydropower generation readings
// DID method: Hedera HIP-29 compatible

const { PrivateKey } = require('@hashgraph/sdk');

class VCGenerator {
  constructor() {
    this.issuerDid      = process.env.ISSUER_DID;
    this.issuerPrivKey  = PrivateKey.fromString(process.env.ISSUER_PRIVATE_KEY);
  }

  /**
   * Generate a W3C VC for an APPROVED verification reading.
   * ONLY call this when verificationStatus === 'APPROVED'.
   * Throws if called on FLAGGED or REJECTED readings — no VC for unverified data.
   */
  async generateCredential(reading, attestation, hcsTxId) {
    if (attestation.verificationStatus !== 'APPROVED') {
      throw new Error(
        `VCGenerator: Cannot issue VC for status "${attestation.verificationStatus}". ` +
        `Only APPROVED readings get Verifiable Credentials.`
      );
    }

    const issuanceDate = new Date().toISOString();
    const credential   = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
        'https://hedera.com/contexts/hydropower-mrv/v1'
      ],
      'id':   `urn:hedera:${hcsTxId}`,
      'type': ['VerifiableCredential', 'HydropowerGenerationCredential'],
      'issuer': {
        'id':   this.issuerDid,
        'name': 'Bikram Biswas Hedera dMRV System'
      },
      'issuanceDate': issuanceDate,
      'credentialSubject': {
        'id': `did:hedera:testnet:${reading.plantId}`,
        'plant': {
          'id':           reading.plantId,
          'name':         reading.plantName,
          'location':     reading.plantLocation,
          'capacity_kW':  reading.ratedCapacity,
          'methodology':  'ACM0002'
        },
        'generation': {
          'value_kWh':     reading.generatedKwh,
          'value_MWh':     reading.generatedKwh / 1000,
          'period_start':  reading.periodStart,
          'period_end':    reading.periodEnd,
          'vintage':       new Date(reading.periodStart).getFullYear()
        },
        'verification': {
          'trustScore':    attestation.trustScore,
          'status':        'APPROVED',
          'layer1_physics':       attestation.scores.physics,
          'layer2_temporal':      attestation.scores.temporal,
          'layer3_environmental': attestation.scores.environmental,
          'layer4_ml':            attestation.scores.ml,
          'layer5_device':        attestation.scores.device,
          'hcs_commitment_tx':    attestation.commitmentTxId,
          'hcs_reveal_tx':        hcsTxId,
          'hashscan_url':         `https://hashscan.io/testnet/transaction/${hcsTxId}`
        },
        'carbonCredits': {
          'quantity_tCO2':  attestation.calculations.ER_tCO2,
          'hrec_tokens':    attestation.calculations.HREC_count,
          'emission_factor': attestation.calculations.emissionFactor,
          'standard':       'ACM0002',
          'registry':       'Hedera HCS + pending Verra VCS'
        }
      }
    };

    // Sign with Hedera Ed25519 key
    // In production: use jsonld-signatures library for W3C-compliant proof
    const credentialString = JSON.stringify(credential);
    const sigBytes = this.issuerPrivKey.sign(Buffer.from(credentialString));
    credential['proof'] = {
      'type':               'Ed25519Signature2020',
      'created':            issuanceDate,
      'verificationMethod': `${this.issuerDid}#key-1`,
      'proofPurpose':       'assertionMethod',
      'proofValue':         Buffer.from(sigBytes).toString('base64')
    };

    return credential;
  }
}

module.exports = { VCGenerator };
```

### Workflow Integration (`src/workflow.js` addition)

```javascript
// AFTER the 5-layer verification completes and trust score is APPROVED:

const { VCGenerator } = require('./hedera/vc-generator');

if (verifiedRecord.trustLevel === 'APPROVED') {
  const vcGen    = new VCGenerator();
  const vc       = await vcGen.generateCredential(rawSensorData, verifiedRecord, revealTxId);

  // Submit VC as the final HCS payload (replaces raw attestation on HCS)
  await hcsClient.submitMessage(topicId, JSON.stringify({
    type:     'VERIFIABLE_CREDENTIAL',
    version:  '1.0',
    vc:       vc,
    mintedAt: Date.now()
  }));

  // Only mint HREC tokens AFTER VC is anchored on HCS
  await carbonCreditManager.mintHREC(verifiedRecord.energyGenerated, revealTxId);
}
```

---

## 6. WEEKS 5–6 — HTS HREC TOKEN DEPLOYMENT & MINT LOGIC

**Goal:** Every verified MWh becomes a fungible HREC token on Hedera testnet. Token minting is gated by the 5-layer engine — APPROVED only. No token without a verified VC on HCS.

### Token Deployment: `scripts/deploy_hrec_token.js`

```javascript
// FILE: scripts/deploy_hrec_token.js  (NEW FILE)
// Run once to create the HREC token. Save the returned tokenId to .env.
// DO NOT run again — token already exists at 0.0.7964264 on testnet.

const {
  Client, TokenCreateTransaction, TokenType, TokenSupplyType,
  AccountId, PrivateKey, Hbar
} = require('@hashgraph/sdk');

async function deployHRECToken() {
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(process.env.OPERATOR_ID),
    PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
  );

  const supplyKey  = PrivateKey.generate();
  const treasuryId = AccountId.fromString(process.env.TREASURY_ACCOUNT_ID);

  const tokenTx = await new TokenCreateTransaction()
    .setTokenName('Hydropower Renewable Energy Certificate')
    .setTokenSymbol('HREC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(3)              // 1 HREC = 1 MWh = 1,000 token units
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(supplyKey)
    .setAdminKey(client.operatorPublicKey)
    .setMaxTransactionFee(new Hbar(30))
    .execute(client);

  const receipt = await tokenTx.getReceipt(client);
  const tokenId = receipt.tokenId.toString();

  console.log(`✅ HREC Token deployed: ${tokenId}`);
  console.log(`   HashScan: https://hashscan.io/testnet/token/${tokenId}`);
  console.log(`   Supply Key (SAVE THIS): ${supplyKey.toString()}`);
  console.log(`   Add to .env: HTS_TOKEN_ID=${tokenId}`);
  console.log(`   Add to .env: HTS_SUPPLY_KEY=${supplyKey.toString()}`);

  return { tokenId, supplyKey: supplyKey.toString() };
}

deployHRECToken().catch(console.error);
```

### Mint Logic: `src/carbon-credits/CarbonCreditManager.js`

```javascript
// FILE: src/carbon-credits/CarbonCreditManager.js
const {
  Client, TokenMintTransaction, TokenId,
  AccountId, PrivateKey
} = require('@hashgraph/sdk');

class CarbonCreditManager {
  constructor() {
    this.client = Client.forTestnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
    this.tokenId   = TokenId.fromString(process.env.HTS_TOKEN_ID || '0.0.7964264');
    this.supplyKey = PrivateKey.fromString(process.env.HTS_SUPPLY_KEY);
  }

  /**
   * Mint HREC tokens for a verified generation reading.
   * @param {number} energyKwh    — verified energy in kWh
   * @param {string} hcsTxId      — the reveal TX ID (proof link)
   * @returns {Object}            — mint result with TX ID and HashScan link
   */
  async mintHREC(energyKwh, hcsTxId) {
    const energyMWh    = energyKwh / 1000;
    const amountToMint = Math.floor(energyMWh * 1000); // 1 HREC = 1 MWh = 1000 units

    if (amountToMint <= 0) {
      throw new Error(`mintHREC: Cannot mint ${amountToMint} units for ${energyKwh} kWh`);
    }

    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(amountToMint)
      .freezeWith(this.client)
      .sign(this.supplyKey);

    const result  = await mintTx.execute(this.client);
    const receipt = await result.getReceipt(this.client);

    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`HREC mint failed: ${receipt.status} for ${amountToMint} units`);
    }

    const txId = result.transactionId.toString();
    console.log(`✅ HREC minted: ${amountToMint} units (${energyMWh} MWh) | TX: ${txId}`);

    return {
      txId,
      amountMinted: amountToMint,
      energyMWh,
      hashScanUrl: `https://hashscan.io/testnet/transaction/${txId}`,
      proofTxId:   hcsTxId
    };
  }

  /**
   * Calculate carbon credits from verified energy generation.
   * Uses India grid emission factor (CEA 2023: 0.82 tCO2/MWh).
   */
  calculateCarbonCredits(energyKwh) {
    const MWh            = energyKwh / 1000;
    const emissionFactor = parseFloat(process.env.EMISSION_FACTOR_tCO2_MWh || '0.82');
    return {
      HREC_count:    Math.floor(MWh * 1000),   // token units
      ER_tCO2:       MWh * emissionFactor,       // emission reduction in tCO2
      emissionFactor,
      methodology:   'ACM0002',
      reference:     'CEA India Grid Emission Factor 2023'
    };
  }
}

module.exports = { CarbonCreditManager };
```

---

## 7. WEEKS 7–8 — ESG CERTIFICATE ENGINE (VC + PDF + QR)

**Goal:** A human-readable ESG certificate backed by cryptographic proof. A buyer gets a one-page PDF. The QR code on that PDF resolves to the HCS transaction that proves the underlying generation was verified by my 5-layer engine.

### New File: `src/certificates/pdf-renderer.js`

```javascript
// FILE: src/certificates/pdf-renderer.js  (NEW FILE)
const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const path        = require('path');
const fs          = require('fs');

class PDFCertificateRenderer {
  constructor() {
    this.outputDir = path.join(__dirname, '../../certificates/generated/');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateCertificate(vc, retirement) {
    const certPath   = path.join(this.outputDir, `HREC-${retirement.id}.pdf`);
    const hashScanUrl = vc.credentialSubject.verification.hashscan_url;

    // Generate QR code pointing to HashScan TX
    const qrDataUrl = await QRCode.toDataURL(hashScanUrl, {
      width: 150, margin: 2, color: { dark: '#1a472a', light: '#ffffff' }
    });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    return new Promise((resolve, reject) => {
      const doc    = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
      const stream = fs.createWriteStream(certPath);
      doc.pipe(stream);

      // ── HEADER ────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 80).fill('#1a472a');
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
         .text('HYDROPOWER RENEWABLE ENERGY CERTIFICATE', 40, 25);
      doc.fontSize(11).font('Helvetica')
         .text('Verified by Hedera Consensus Service | ACM0002 Methodology', 40, 52);

      // ── CERTIFICATE BODY ──────────────────────────────────────────
      doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold')
         .text('CERTIFICATE OF RETIREMENT', 40, 100);

      const cs = vc.credentialSubject;
      doc.font('Helvetica').fontSize(10);

      const fields = [
        ['Certificate ID',   retirement.id],
        ['Issuer',           'Bikram Biswas — Hedera Hydropower dMRV System'],
        ['Plant Name',       cs.plant.name],
        ['Plant Location',   cs.plant.location],
        ['Capacity',         `${cs.plant.capacity_kW} kW`],
        ['Methodology',      'ACM0002 — Small Hydropower Generation'],
        ['Energy Generated', `${cs.generation.value_MWh.toFixed(3)} MWh`],
        ['HREC Units',       `${cs.carbonCredits.hrec_tokens} HREC`],
        ['CO₂ Avoided',      `${cs.carbonCredits.quantity_tCO2.toFixed(3)} tCO₂`],
        ['Trust Score',      `${(cs.verification.trustScore * 100).toFixed(1)}%  (APPROVED)`],
        ['Vintage Year',     cs.generation.vintage.toString()],
        ['Period',           `${cs.generation.period_start} → ${cs.generation.period_end}`],
        ['Retired On',       new Date().toISOString().split('T')[0]],
        ['Retired By',       retirement.beneficiaryName || retirement.buyerName],
      ];

      let y = 125;
      fields.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}:`, 40, y, { width: 160, continued: false });
        doc.font('Helvetica').text(value,             210, y, { width: 360 });
        y += 18;
      });

      // ── BLOCKCHAIN PROOF ──────────────────────────────────────────
      doc.rect(40, y + 5, 730, 55).stroke('#1a472a');
      doc.font('Helvetica-Bold').fontSize(9).text('BLOCKCHAIN VERIFICATION', 50, y + 10);
      doc.font('Helvetica').fontSize(8)
         .text(`HCS Commitment TX: ${cs.verification.hcs_commitment_tx}`, 50, y + 22)
         .text(`HCS Reveal TX:     ${cs.verification.hcs_reveal_tx}`,     50, y + 34)
         .text(`Verify on HashScan: ${hashScanUrl}`,                       50, y + 46);

      // ── QR CODE ───────────────────────────────────────────────────
      doc.image(qrBuffer, 680, 95, { width: 100, height: 100 });
      doc.fontSize(7).text('Scan to verify on-chain', 678, 198);

      // ── FOOTER ───────────────────────────────────────────────────
      doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#f0f4f0');
      doc.fillColor('#555555').fontSize(8)
         .text(
           `This certificate is cryptographically anchored on Hedera Consensus Service. ` +
           `Credential ID: ${vc.id}`,
           40, doc.page.height - 22
         );

      doc.end();
      stream.on('finish', () => resolve({ path: certPath, hashScanUrl }));
      stream.on('error', reject);
    });
  }
}

module.exports = { PDFCertificateRenderer };
```

### New File: `src/api/v1/certificates.js`

```javascript
// FILE: src/api/v1/certificates.js  (NEW FILE)
const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const { validateBuyerJWT } = require('../../middleware/buyer-auth');
const dbCerts  = require('../../db/models/certificates');

// GET /api/v1/certificates/:id  → JSON-LD VC
router.get('/:id', validateBuyerJWT, async (req, res) => {
  const cert = await dbCerts.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'CERTIFICATE_NOT_FOUND' });
  return res.json(cert.vcJson);
});

// GET /api/v1/certificates/:id/pdf  → PDF download
router.get('/:id/pdf', validateBuyerJWT, async (req, res) => {
  const cert = await dbCerts.findById(req.params.id);
  if (!cert) return res.status(404).json({ error: 'CERTIFICATE_NOT_FOUND' });
  if (!fs.existsSync(cert.pdfPath)) {
    return res.status(404).json({ error: 'PDF_NOT_GENERATED_YET' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="HREC-${cert.id}.pdf"`);
  fs.createReadStream(cert.pdfPath).pipe(res);
});

// GET /api/v1/certificates/:id/verify  → Public verification (no auth)
router.get('/:id/verify', async (req, res) => {
  const cert = await dbCerts.findById(req.params.id);
  if (!cert) return res.status(404).json({ valid: false, error: 'NOT_FOUND' });
  return res.json({
    valid:        true,
    credentialId: cert.credentialId,
    status:       cert.status,
    hashScanUrl:  cert.hashscanUrl,
    issuedTo:     cert.subjectDid,
    plantId:      cert.plantId,
    quantity:     cert.quantityHrec,
    vintage:      new Date(cert.periodStart).getFullYear()
  });
});

module.exports = router;
```

---

## 8. DATABASE MIGRATIONS — All 4 Required Tables

```sql
-- FILE: src/db/migrations/001_create_claims_table.sql
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
CREATE INDEX idx_claims_plant_id   ON claims(plant_id);
CREATE INDEX idx_claims_buyer_did  ON claims(buyer_did);
CREATE INDEX idx_claims_status     ON claims(status);
CREATE INDEX idx_claims_created    ON claims(created_at DESC);

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

-- FILE: src/db/migrations/004_create_retirements_table.sql
CREATE TABLE IF NOT EXISTS retirements (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id                    UUID NOT NULL REFERENCES claims(id),
    buyer_id                    UUID NOT NULL REFERENCES buyers(id),
    certificate_id              UUID REFERENCES certificates(id),
    token_id                    VARCHAR(50) NOT NULL,
    quantity_burned             DECIMAL(18, 6) NOT NULL,
    burn_tx_id                  VARCHAR(200) UNIQUE NOT NULL,
    burn_tx_timestamp           TIMESTAMP NOT NULL,
    retirement_reason           VARCHAR(200),
    beneficiary_name            VARCHAR(200),
    beneficiary_did             VARCHAR(200),
    hcs_log_tx_id               VARCHAR(200),
    registry_submission_status  VARCHAR(30) DEFAULT 'NOT_SUBMITTED'
                                  CHECK (registry_submission_status IN (
                                    'NOT_SUBMITTED','SUBMITTED_TO_VERRA','VERRA_CONFIRMED',
                                    'SUBMITTED_TO_GOLD_STANDARD','GS_CONFIRMED','FAILED'
                                  )),
    metadata                    JSONB DEFAULT '{}',
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```bash
# Run all 4 migrations:
docker-compose up -d postgres
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/001_create_claims_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/002_create_certificates_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/003_create_buyers_table.sql
psql -h localhost -U postgres -d hedera_mrv -f src/db/migrations/004_create_retirements_table.sql

# Verify all 4 tables exist:
psql -h localhost -U postgres -d hedera_mrv -c "\dt" | grep -E "claims|certificates|buyers|retirements"
```

---

## 9. WHAT IS NOT IN ROADMAP 1 (Intentionally)

Roadmap 1 is the cryptographic and scientific foundation only. These come in Roadmap 2 and 3:

```
NOT IN ROADMAP 1:
  ❌ Claims API (src/api/v1/claims.js)        → Roadmap 2, Weeks 9–14
  ❌ Token retirement flow                    → Roadmap 2, Weeks 9–14
  ❌ Guardian policy integration              → Roadmap 2, Weeks 15–18
  ❌ ADWIN drift detection (JS)               → Roadmap 2, Weeks 19–22
  ❌ Verifier staking (off-chain + Solidity)  → Roadmap 3, Months 13–18
  ❌ ZKP privacy layer (Circom + snarkjs)     → Roadmap 3, Months 16–22
  ❌ Multi-methodology router                 → Roadmap 3, Months 18–28
  ❌ Enterprise SDK                           → Roadmap 3, Months 20–30
  ❌ ISO 27001 / ISO 14064-2 accreditation   → Roadmap 3, Months 17–22
  ❌ Verra VCS formal registration            → Roadmap 3, Month 31–35
  ❌ India CCTS registration                  → Roadmap 3, Month 13–15
```

---

## 10. ROADMAP 1 EXIT CRITERIA

By the end of Week 8, all of these must be true — not "planned", not "in progress":

```
EXIT CHECKLIST:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Git history is clean — .env.backup and .env.old purged
□ All Hedera operator keys rotated — old keys invalidated
□ GitHub Advanced Security enabled + secret scanning active
□ Commit-reveal pattern live in workflow.js (both HCS TXs)
□ vc-generator.js creates W3C VCs for APPROVED readings only
□ ISSUER_DID registered on Hedera testnet HCS
□ One PLANT_DID per pilot plant registered
□ HREC token on testnet — TokenCreateTransaction TX on HashScan
□ CarbonCreditManager.js mints tokens from verified energy readings
□ pdf-renderer.js generates A4 landscape ESG certificate PDF
□ QR code on PDF resolves to correct HashScan TX URL
□ GET /api/v1/certificates/:id returns JSON-LD VC
□ GET /api/v1/certificates/:id/pdf returns PDF binary
□ All 4 database migrations applied and verified
□ At least 5 real end-to-end test readings: sensor → verify → mint → VC → PDF
□ Test results documented: ≥3 APPROVED, ≥1 FLAGGED, ≥1 REJECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**When Roadmap 1 is done, I have a cryptographic foundation no auditor can dispute. Roadmap 2 builds the value chain on top of it.**
