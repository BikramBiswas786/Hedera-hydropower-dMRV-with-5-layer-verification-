# 🚀 ROADMAP 2 — GUARDIAN PIPELINE, MARKET ENTRY & ADAPTIVE ML
## Hedera Hydropower dMRV | Month 3 → Month 12
**Author: Bikram Biswas | Updated: March 24, 2026 | Version: V4.0**
**GitHub: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-)**

---

## WHERE I AM ENTERING ROADMAP 2

By the end of Roadmap 1 (Week 8), I have delivered:
- ✅ 18 Claim Attribution Layer files committed and tested
- ✅ Guardian policy live on testnet with `GUARDIAN_POLICY_ID` filled in `.env`
- ✅ 4 DB migrations (claims, certificates, buyers, retirements) running on Railway PostgreSQL
- ✅ HTS token 0.0.7964264 live on Hedera **mainnet**
- ✅ HCS topic live on **mainnet** — all production reads logged immutably
- ✅ End-to-end: sensor → 5-layer engine → VC → HREC mint → ESG PDF → QR → HashScan
- ✅ 2–3 pilot plants onboarded with real historical data loaded
- ✅ 262+ tests passing at ≥85.3% coverage
- ✅ COST-ANALYSIS.md rewritten — $0.0001/verification documented
- ✅ Demo video (5 min MP4) + 15-slide pitch deck complete

**Revenue at Roadmap 2 entry: $0 confirmed, pipeline open.**

Roadmap 2 is about converting that pipeline into real paying customers and closing the four open gaps:
1. No India CCTS registration → blocks compliance market
2. No Verra pre-approval → blocks premium credit pricing
3. No adaptive ML → model will drift after 12 months of real data
4. No CAD Trust → double-counting prevention missing

---

## 📊 ROADMAP 2 MASTER TIMELINE

| Month | Weeks | Primary Goal | Revenue Target |
|---|---|---|---|
| Month 3 | Wk 9–10 | CAD Trust + double-counting prevention | $0 (infra) |
| Month 4 | Wk 11–12 | India CCTS registration begin | $3,700 first MRV fees |
| Month 5 | Wk 13–14 | Verra shadow mode start | $7,200/mo MRR |
| Month 6 | Wk 15–16 | ADWIN JS adaptive ML + shadow mode live | $12,000/mo MRR |
| Month 7 | Wk 17–18 | TPM/HSM Hardware Root of Trust pilot | $18,000/mo MRR |
| Month 8 | Wk 19–20 | Multi-plant dashboard + India CCTS docs | $24,000/mo MRR |
| Month 9 | Wk 21–22 | Verra shadow mode results analysis | $30,000/mo MRR |
| Month 10 | Wk 23–24 | Tiered pricing v2 + enterprise pipeline | $42,000/mo MRR |
| Month 11 | Wk 25–26 | ISO 27001 documentation start | $55,000/mo MRR |
| Month 12 | Wk 27–28 | 40 plants live, $83K ARR confirmed | **$83,000 ARR** |

---

## MONTH 3 — CAD TRUST & DOUBLE-COUNTING PREVENTION (Weeks 9–10)

### Why This Is Critical

Every HREC token I mint could theoretically be claimed by two parties — the plant operator AND an external buyer — if I don't implement a claim key system. This is double-counting, and it is the primary reason Verra and Gold Standard will reject any dMRV system that hasn't solved it.

My solution: **CAD Trust Claim Key System** — a one-time-use cryptographic claim key is generated at mint and invalidated at retirement. No key = no valid claim.

### Module: `src/hedera/cad-trust.js` (NEW FILE)

```javascript
// FILE: src/hedera/cad-trust.js
// CAD Trust: Claim Attribution and Double-counting prevention
// Every minted HREC batch gets a unique claim key.
// Key is invalidated when retirement is recorded on HCS.
// A second retirement attempt for the same key is permanently rejected.

const crypto = require('crypto');
const { HCSAuditLogger } = require('./hcs-audit-logger');

class CADTrust {
  constructor(db) {
    this.db = db;  // PostgreSQL pool from your existing db module
    this.hcsLogger = new HCSAuditLogger();
  }

  /**
   * Generate a unique claim key for a minted HREC batch.
   * Called immediately after HTS mint succeeds.
   * @param {object} mintData - { plantId, quantityMinted, mintTxId, period }
   * @returns {object} - { claimKey, keyHash, expiresAt }
   */
  async generateClaimKey(mintData) {
    // 32 bytes = 256 bits of entropy — cryptographically unguessable
    const claimKey = crypto.randomBytes(32).toString('hex');
    const keyHash  = crypto.createHash('sha256').update(claimKey).digest('hex');

    // Expiry: 2 years from mint (standard Verra credit validity window)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);

    // Store hash (NOT the key itself) in DB for validation
    await this.db.query(
      `INSERT INTO cad_claim_keys
         (key_hash, plant_id, quantity, mint_tx_id, period_start, period_end,
          status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, NOW())`,
      [
        keyHash,
        mintData.plantId,
        mintData.quantityMinted,
        mintData.mintTxId,
        mintData.periodStart,
        mintData.periodEnd,
        expiresAt
      ]
    );

    // Log key hash to HCS (immutable proof this batch exists and is unclaimed)
    const hcsTxId = await this.hcsLogger._submit({
      event:      'CAD_KEY_GENERATED',
      keyHash,                          // hash only — never log the key itself
      plantId:    mintData.plantId,
      quantity:   mintData.quantityMinted,
      mintTxId:   mintData.mintTxId,
      expiresAt:  expiresAt.toISOString(),
      status:     'ACTIVE'
    });

    return {
      claimKey,     // Send to plant operator via secure channel — NEVER log this
      keyHash,      // Public — stored in DB and HCS
      hcsTxId,      // HashScan proof of key generation
      expiresAt
    };
  }

  /**
   * Validate a claim key during retirement initiation.
   * Called by claims.js before any Guardian submission.
   * @param {string} claimKey - The raw claim key from the buyer/operator
   * @param {number} requestedQuantity - How many HREC they want to retire
   * @returns {object} - { valid: bool, reason, keyData }
   */
  async validateClaimKey(claimKey, requestedQuantity) {
    const keyHash = crypto.createHash('sha256').update(claimKey).digest('hex');

    const result = await this.db.query(
      `SELECT * FROM cad_claim_keys WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return {
        valid:  false,
        reason: 'CLAIM_KEY_NOT_FOUND',
        detail: 'This claim key does not exist in the registry.'
      };
    }

    const keyData = result.rows[0];

    if (keyData.status === 'USED') {
      return {
        valid:  false,
        reason: 'DOUBLE_COUNTING_PREVENTED',
        detail: `This batch was already retired on ${keyData.retired_at}. HashScan: ${keyData.retirement_tx_id}`,
        retirementTxId: keyData.retirement_tx_id
      };
    }

    if (keyData.status === 'EXPIRED' || new Date() > new Date(keyData.expires_at)) {
      return {
        valid:  false,
        reason: 'CLAIM_KEY_EXPIRED',
        detail: `This credit batch expired on ${keyData.expires_at}.`
      };
    }

    if (requestedQuantity > keyData.quantity) {
      return {
        valid:   false,
        reason:  'QUANTITY_EXCEEDS_BATCH',
        detail:  `Requested ${requestedQuantity} HREC but batch only has ${keyData.quantity}.`,
        available: keyData.quantity
      };
    }

    return { valid: true, keyData };
  }

  /**
   * Invalidate a claim key after successful retirement.
   * Called by token-retirement.js after burn TX is confirmed.
   * @param {string} claimKey - The raw claim key
   * @param {string} retirementTxId - HTS burn TX ID from HashScan
   */
  async invalidateClaimKey(claimKey, retirementTxId) {
    const keyHash = crypto.createHash('sha256').update(claimKey).digest('hex');

    await this.db.query(
      `UPDATE cad_claim_keys
       SET status = 'USED', retired_at = NOW(), retirement_tx_id = $1
       WHERE key_hash = $2`,
      [retirementTxId, keyHash]
    );

    // Log invalidation to HCS — immutable proof of retirement
    await this.hcsLogger._submit({
      event:          'CAD_KEY_INVALIDATED',
      keyHash,
      retirementTxId,
      invalidatedAt:  new Date().toISOString(),
      status:         'USED'
    });
  }
}

module.exports = { CADTrust };
```

### DB Migration: `005_create_cad_claim_keys.sql`

```sql
-- FILE: src/db/migrations/005_create_cad_claim_keys.sql
CREATE TABLE IF NOT EXISTS cad_claim_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash            VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 of claim key
    plant_id            VARCHAR(50) NOT NULL,
    quantity            DECIMAL(18, 6) NOT NULL,
    mint_tx_id          VARCHAR(200) NOT NULL,
    period_start        TIMESTAMP NOT NULL,
    period_end          TIMESTAMP NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
    expires_at          TIMESTAMP NOT NULL,
    retired_at          TIMESTAMP,
    retirement_tx_id    VARCHAR(200),   -- HTS burn TX on HashScan
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cad_key_hash    ON cad_claim_keys(key_hash);
CREATE INDEX idx_cad_plant_id    ON cad_claim_keys(plant_id);
CREATE INDEX idx_cad_status      ON cad_claim_keys(status);
CREATE INDEX idx_cad_expires     ON cad_claim_keys(expires_at);
```

### Wire CAD Trust Into Claims Flow

```javascript
// FILE: src/api/v1/claims.js — MODIFY initiate endpoint
// ADD before Guardian submission:

const { CADTrust } = require('../../hedera/cad-trust');

// Inside POST /initiate handler, after balance check, before Guardian:
const cadTrust = new CADTrust(db.pool);
const cadResult = await cadTrust.validateClaimKey(req.body.claimKey, quantity);

if (!cadResult.valid) {
  return res.status(400).json({
    error:   cadResult.reason,
    message: cadResult.detail,
    ...(cadResult.retirementTxId && {
      hashScanRetirement: `https://hashscan.io/mainnet/transaction/${cadResult.retirementTxId}`
    })
  });
}
// Only if valid → proceed to Guardian submission
```

**Test this:**
```bash
# Generate a valid claim key (plant operator receives this after mint)
node -e "
  const { CADTrust } = require('./src/hedera/cad-trust');
  const cad = new CADTrust(require('./src/db/pool'));
  cad.generateClaimKey({
    plantId: 'pilot-001',
    quantityMinted: 500,
    mintTxId: '0.0.7964264@1234567890',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31'
  }).then(result => {
    console.log('Claim Key:', result.claimKey);
    console.log('HCS TX:', result.hcsTxId);
    console.log('HashScan:', 'https://hashscan.io/mainnet/transaction/' + result.hcsTxId);
  });
"

# Attempt double-retirement — should REJECT with DOUBLE_COUNTING_PREVENTED
# (Try using the same key twice — second attempt must fail)
```

---

## MONTH 4 — INDIA CCTS REGISTRATION (Weeks 11–12)

### Why India CCTS Is My Fastest Revenue Unlock

India's Carbon Credit Trading Scheme (CCTS) launched under the Energy Conservation (Amendment) Act 2022. The Bureau of Energy Efficiency (BEE) is the nodal agency. Small hydropower is one of the **8 eligible technology sectors** explicitly listed. Registration is mandatory for compliance market participation but is free for project developers.

I need to start this in Month 4 because:
- The review process takes 4–6 months
- My system is already ACM0002 compliant — the physics formula is the same
- HCS immutable logs satisfy BEE's monitoring evidence requirements
- My HashScan transaction history is already a 2,000+ record audit trail

### India CCTS Registration Checklist

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: Read the official CCTS Methodology Framework
  URL: beeindia.gov.in/en/carbon-credit-trading-scheme
  Download: "CCTS Methodology Framework v1.0 (2023)"
  Read: Sections 4.2 (eligible technology), 7.1 (MRV requirements)
  
STEP 2: Register on BEE portal
  URL: www.cctsindia.in (or current BEE portal)
  Entity type: "Project Developer"
  Documents required:
    □ Aadhaar/PAN of developer
    □ Company registration (if any)
    □ Technical description of the MRV system
    □ Evidence of clean energy generation (plant records)

STEP 3: Prepare Project Design Document (PDD)
  My PDD needs:
    □ Project description — hydropower dMRV on Hedera blockchain
    □ Technology description — 5-layer verification engine
    □ Monitoring methodology — ACM0002 adapted for digital MRV
    □ Baseline emission factor — India grid CEA data (0.82 tCO2e/MWh)
    □ Expected annual emission reductions — per pilot plant data
    □ MRV system description — HCS 0.0.7462776, HTS 0.0.XXXXX
    □ Verification procedures — Guardian policy + multi-sig

STEP 4: Submit PDD for BEE technical review
  Expected review timeline: 4–6 months
  Cost: Free
  
STEP 5: Upon approval — enroll pilot plants as first projects
  Each plant files their own project registration referencing my PDD
  I provide the MRV service under my methodology
  Credits issued on India Carbon Exchange (ICX)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### What India CCTS Means for Revenue

```
REVENUE IMPACT CALCULATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Voluntary market price:   $10–15/tonne  (Year 1)
India CCTS price target:  $20–40/tonne  (compliance = 2–4× premium)

10 plants × 5,000 HREC/yr × $0.50/retirement fee = $25,000/yr (voluntary)
10 plants × 5,000 HREC/yr × $0.50 × 2× premium  = $50,000/yr (CCTS)

The same 10 plants, same infrastructure, 2× revenue.
CCTS registration is the single highest-leverage regulatory action in Year 1.
```

### PDD Template Outline (Start Writing Month 4)

```markdown
# Project Design Document — Hedera Hydropower dMRV
## BEE CCTS Submission | Author: Bikram Biswas | Version 1.0

### SECTION A: PROJECT IDENTIFICATION
Project Title: Digital MRV for Small Hydropower Carbon Credits on Hedera Blockchain
Technology: Run-of-river / reservoir hydropower, 1–15 MW
Methodology Applied: ACM0002 (adapted for digital monitoring)
Developer: Bikram Biswas, Kolkata, West Bengal, India
Contact: [email]

### SECTION B: PROJECT DESCRIPTION
This project implements digital MRV (dMRV) for small hydropower plants in India
using the Hedera blockchain network. Each plant's electricity generation is
continuously monitored and verified through a 5-layer physics verification engine:

Layer 1 — Physics: P = ρgQHη (ACM0002 formula, error tolerance ±15%)
Layer 2 — Temporal: 15-minute consistency windows, ±20% variation threshold
Layer 3 — Environmental: Cross-referenced with IMD river flow records
Layer 4 — ML: Isolation Forest anomaly detection (Manus ADWIN drift detection)
Layer 5 — Device: HMAC sensor attestation + TPM hardware seal

All verified readings are submitted to Hedera Consensus Service (HCS) as
immutable timestamped records. Carbon credits are minted as HTS fungible tokens
(HREC — Hydropower Renewable Energy Certificate) at 1 HREC = 1 MWh.

### SECTION C: MONITORING PLAN
Monitoring frequency: Hourly (8,760 records/plant/year minimum)
Data storage: Hedera HCS — immutable, publicly verifiable
Audit trail: Every reading has a HashScan URL traceable to source
Verification: Guardian policy with 3-of-5 multi-sig approval before retirement
Double-counting: CAD Trust claim key system (one-time use per batch)

### SECTION D: EMISSION REDUCTION CALCULATION
Baseline: India grid emission factor 0.82 tCO2e/MWh (CEA 2024 data)
ER = Energy_Generated_MWh × 0.82 tCO2e/MWh
Example (5 MW plant at 45% capacity factor): 
  Annual generation: 5 × 0.45 × 8,760 = 19,710 MWh
  Annual ER: 19,710 × 0.82 = 16,162 tCO2e

### SECTION E: MONITORING EVIDENCE
Primary evidence: HCS topic [mainnet topic ID] — publicly accessible
Secondary evidence: HashScan.io transaction explorer
Tertiary evidence: Guardian policy audit trail
All evidence is permanent and cannot be modified or deleted.
```

---

## MONTH 5 — VERRA VCS SHADOW MODE (Weeks 13–14)

### What Shadow Mode Means

Shadow mode means running my dMRV system **in parallel** with traditional manual MRV for 3–6 months, comparing outputs. This is not optional — Verra requires it before granting methodology pre-approval. The comparison data is my strongest evidence that digital verification matches (or exceeds) manual accuracy.

### Module: `src/validation/shadow-mode-comparator.js` (NEW FILE)

```javascript
// FILE: src/validation/shadow-mode-comparator.js
// Shadow Mode: Parallel comparison of dMRV vs. manual MRV
// Run for minimum 6 months before Verra pre-approval application

class ShadowModeComparator {
  constructor(db) {
    this.db = db;
  }

  /**
   * Record a manual MRV reading from plant operator's physical logs.
   * This is what the plant operator reports manually (old method).
   * @param {object} manualReading - From plant's paper/spreadsheet log
   */
  async recordManualReading(manualReading) {
    await this.db.query(
      `INSERT INTO shadow_mode_readings
         (plant_id, timestamp, manual_generation_kwh, manual_flow_rate,
          manual_head_height, manual_source, recorded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        manualReading.plantId,
        manualReading.timestamp,
        manualReading.generationKwh,
        manualReading.flowRate || null,
        manualReading.headHeight || null,
        manualReading.source,   // 'OPERATOR_LOG', 'SCADA', 'ENERGY_METER'
        manualReading.recordedBy
      ]
    );
  }

  /**
   * Compare dMRV result vs. manual reading for the same period.
   * @param {string} plantId
   * @param {string} periodStart - ISO8601
   * @param {string} periodEnd - ISO8601
   * @returns {object} Comparison report
   */
  async compareForPeriod(plantId, periodStart, periodEnd) {
    // Get dMRV verified readings from existing DB
    const dmrvResult = await this.db.query(
      `SELECT SUM(energy_generated_kwh) AS dmrv_total,
              AVG(trust_score) AS avg_trust,
              COUNT(*) AS verification_count,
              SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
              SUM(CASE WHEN status = 'FLAGGED' THEN 1 ELSE 0 END) AS flagged_count
       FROM telemetry_records
       WHERE plant_id = $1
         AND timestamp BETWEEN $2 AND $3
         AND status IN ('APPROVED', 'FLAGGED')`,
      [plantId, periodStart, periodEnd]
    );

    // Get manual MRV readings for same period
    const manualResult = await this.db.query(
      `SELECT SUM(manual_generation_kwh) AS manual_total,
              COUNT(*) AS manual_readings
       FROM shadow_mode_readings
       WHERE plant_id = $1
         AND timestamp BETWEEN $2 AND $3`,
      [plantId, periodStart, periodEnd]
    );

    const dmrv    = dmrvResult.rows[0];
    const manual  = manualResult.rows[0];

    const dmrvTotal   = parseFloat(dmrv.dmrv_total || 0);
    const manualTotal = parseFloat(manual.manual_total || 0);

    // Variance calculation — Verra accepts <5% for methodology approval
    const variance = manualTotal > 0
      ? Math.abs((dmrvTotal - manualTotal) / manualTotal) * 100
      : null;

    const status = variance === null ? 'INSUFFICIENT_DATA'
      : variance < 2  ? 'EXCELLENT'   // <2% = strong approval case
      : variance < 5  ? 'ACCEPTABLE'  // 2-5% = Verra acceptable
      : variance < 10 ? 'MARGINAL'    // 5-10% = needs investigation
      : 'FAILED';                     // >10% = methodology has issues

    return {
      plantId,
      period:         { start: periodStart, end: periodEnd },
      dMRV: {
        totalKwh:          dmrvTotal,
        verificationCount: parseInt(dmrv.verification_count),
        approvedCount:     parseInt(dmrv.approved_count),
        flaggedCount:      parseInt(dmrv.flagged_count),
        avgTrustScore:     parseFloat(dmrv.avg_trust || 0).toFixed(3)
      },
      manual: {
        totalKwh:     manualTotal,
        readingCount: parseInt(manual.manual_readings)
      },
      comparison: {
        variancePercent:  variance ? variance.toFixed(2) : 'N/A',
        status,
        verraCompliant:  variance !== null && variance < 5,
        recommendation:  this._getRecommendation(status, variance)
      }
    };
  }

  _getRecommendation(status, variance) {
    switch (status) {
      case 'EXCELLENT':
        return 'Strong evidence for Verra methodology pre-approval. Include in PDD Section E.';
      case 'ACCEPTABLE':
        return 'Within Verra 5% threshold. Document measurement uncertainties in PDD.';
      case 'MARGINAL':
        return 'Investigate Layer 1 (physics) calibration. Check sensor accuracy.';
      case 'FAILED':
        return 'Do not submit to Verra yet. Review sensor hardware and Layer 2 temporal consistency.';
      default:
        return 'Collect at least 3 months of parallel data before comparison.';
    }
  }

  /**
   * Generate Verra-ready shadow mode report.
   * Output this as PDF and include in Verra pre-approval package.
   */
  async generateVerraReport(plantId, startDate, endDate) {
    const monthlyComparisons = [];
    let current = new Date(startDate);

    while (current < new Date(endDate)) {
      const monthEnd = new Date(current);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const comparison = await this.compareForPeriod(
        plantId,
        current.toISOString(),
        monthEnd.toISOString()
      );
      monthlyComparisons.push(comparison);
      current = monthEnd;
    }

    const avgVariance = monthlyComparisons
      .filter(m => m.comparison.variancePercent !== 'N/A')
      .reduce((sum, m) => sum + parseFloat(m.comparison.variancePercent), 0)
      / monthlyComparisons.length;

    return {
      plantId,
      reportPeriod:     { start: startDate, end: endDate },
      methodology:      'ACM0002',
      blockchain:       'Hedera HCS 0.0.7462776',
      monthlyData:      monthlyComparisons,
      summary: {
        totalMonths:     monthlyComparisons.length,
        avgVariance:     avgVariance.toFixed(2) + '%',
        verraCompliant:  avgVariance < 5,
        overallStatus:   avgVariance < 2 ? 'EXCELLENT' : avgVariance < 5 ? 'ACCEPTABLE' : 'NEEDS_IMPROVEMENT'
      },
      verraSectionReference: 'VCS Standard v4.4 Section 4.1.2 — Digital MRV Equivalence'
    };
  }
}

module.exports = { ShadowModeComparator };
```

### DB Migration: `006_shadow_mode_readings.sql`

```sql
-- FILE: src/db/migrations/006_shadow_mode_readings.sql
CREATE TABLE IF NOT EXISTS shadow_mode_readings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id              VARCHAR(50) NOT NULL,
    timestamp             TIMESTAMP NOT NULL,
    manual_generation_kwh DECIMAL(18, 6) NOT NULL,
    manual_flow_rate      DECIMAL(10, 4),
    manual_head_height    DECIMAL(10, 4),
    manual_source         VARCHAR(50) NOT NULL
                            CHECK (manual_source IN (
                              'OPERATOR_LOG', 'SCADA', 'ENERGY_METER',
                              'STATE_LOAD_DISPATCH', 'MANUAL_CALCULATION'
                            )),
    recorded_by           VARCHAR(200) NOT NULL,
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shadow_plant_id  ON shadow_mode_readings(plant_id);
CREATE INDEX idx_shadow_timestamp ON shadow_mode_readings(timestamp);
```

### Verra Pre-Approval Email Template (Send Month 5)

```
To: info@verra.org
Subject: Pre-submission inquiry — Digital MRV methodology for small hydropower 
         (ACM0002 adaptation, Hedera blockchain)

Dear Verra Methodology Team,

I am the developer of a digital MRV system for small hydropower carbon credit 
verification deployed on the Hedera blockchain network. I am writing to request 
guidance on the pre-submission pathway for methodology approval.

SYSTEM OVERVIEW:
• Physics verification: P = ρgQHη (ACM0002 formula, Layer 1 of 5-layer engine)
• Blockchain: Hedera HCS for immutable audit logs, HTS for HREC tokens
• Live evidence: hashscan.io/mainnet/topic/[topic-id] (2,000+ records)
• Guardian integration: ACM0002 policy (PRs #5687 and #5715 merged to mainnet)
• Current status: 6-month shadow mode underway vs. manual MRV (results by Month 9)

SHADOW MODE EVIDENCE (to be completed by Month 9):
• Variance between dMRV and manual: target <5% (Verra standard)
• Monthly reports generated by src/validation/shadow-mode-comparator.js
• Available for Verra technical review upon request

I would like to understand:
1. The correct pre-submission pathway for a digital MRV methodology
2. Whether my existing Guardian policy (mainnet) satisfies VCS §4.1.2
3. Timeline expectations for technical review

I can provide a technical demo, HashScan evidence, and shadow mode data on request.

Bikram Biswas
GitHub: github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
```

---

## MONTH 6 — ADWIN JS ADAPTIVE ML (Weeks 15–16)

### Why I Replace Python river With JavaScript ADWIN

My entire stack is Node.js. Running a Python subprocess for drift detection in production means:
- Additional container memory (~150MB for Python runtime)
- Process spawn latency (200–500ms per detection)
- Dependency hell between Python + Node versions in Docker
- No clean error propagation back to my API

The correct approach is a native JavaScript ADWIN implementation in the same process. This is the Bifet & Gavalda (2007) algorithm, which I implement below based on the Manus specification but verified against the original paper.

### Module: `src/ml/adwin-detector.js` (NEW FILE — Replaces Python approach)

```javascript
// FILE: src/ml/adwin-detector.js
// ADWIN (ADaptive WINdowing) — Bifet & Gavalda (2007)
// "Learning from Time-Changing Data with Adaptive Windowing"
// δ (delta) = confidence parameter: 0.002 = 99.8% confidence before triggering
//
// PURPOSE: Detect when my Isolation Forest model is drifting.
// When ADWIN triggers: log to HCS, flag for seasonal retraining.
// When to retrain: After 6+ months of real pilot data per season.

class ADWINDetector {
  /**
   * @param {number} delta - Confidence parameter (default: 0.002 per Manus spec)
   *   Lower = more sensitive to drift, more false positives
   *   Higher = less sensitive, slower to detect real drift
   *   Bifet & Gavalda recommend 0.002 for most data streams
   */
  constructor(delta = 0.002) {
    this.delta     = delta;
    this.window    = [];          // Sliding window of recent scores
    this.variance  = 0;
    this.mean      = 0;
    this.total     = 0;
    this.driftCount = 0;
    this.lastDriftAt = null;
  }

  /**
   * Update the detector with a new observation.
   * Call this after every anomaly detection in the ML pipeline.
   * @param {number} value - Anomaly score from Isolation Forest (0.0–1.0)
   * @returns {object} - { driftDetected, reason, driftCount, windowSize }
   */
  update(value) {
    this.window.push(value);
    this._updateStats(value);

    // ADWIN core: test all possible split points in the window
    // Drift detected if mean of any subwindow differs significantly
    const driftDetected = this._testForDrift();

    if (driftDetected) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();

      // ADWIN prescription: drop the oldest half when drift detected
      const halfLength = Math.floor(this.window.length / 2);
      this.window = this.window.slice(halfLength);
      this._recalculateStats();

      return {
        driftDetected: true,
        reason:        'MEAN_SHIFT_DETECTED',
        driftCount:    this.driftCount,
        detectedAt:    this.lastDriftAt,
        windowSize:    this.window.length,
        currentMean:   this.mean.toFixed(4),
        action:        'SCHEDULE_SEASONAL_RETRAINING'
      };
    }

    return {
      driftDetected: false,
      driftCount:    this.driftCount,
      windowSize:    this.window.length,
      currentMean:   this.mean.toFixed(4)
    };
  }

  /**
   * ADWIN statistical test.
   * Tests if splitting the window at any point reveals a statistically
   * significant difference in means (using Hoeffding/McDiarmid bounds).
   */
  _testForDrift() {
    if (this.window.length < 10) return false;  // Minimum window size

    const n = this.window.length;

    for (let splitPoint = 1; splitPoint < n - 1; splitPoint++) {
      const leftWindow  = this.window.slice(0, splitPoint);
      const rightWindow = this.window.slice(splitPoint);

      const leftMean  = leftWindow.reduce((a, b) => a + b, 0) / leftWindow.length;
      const rightMean = rightWindow.reduce((a, b) => a + b, 0) / rightWindow.length;

      const n0 = leftWindow.length;
      const n1 = rightWindow.length;

      // Epsilon-cut formula from Bifet & Gavalda (2007), Equation 2
      // ε_cut = sqrt( (1/(2m)) * ln(4n/delta) ) where m = harmonic mean of n0, n1
      const m         = 1 / ((1 / n0) + (1 / n1));
      const epsilonCut = Math.sqrt((1 / (2 * m)) * Math.log(4 * n / this.delta));

      if (Math.abs(leftMean - rightMean) > epsilonCut) {
        return true;  // Drift confirmed
      }
    }

    return false;
  }

  _updateStats(value) {
    this.total++;
    const delta     = value - this.mean;
    this.mean      += delta / this.total;
    this.variance  += delta * (value - this.mean);  // Welford's online algorithm
  }

  _recalculateStats() {
    this.total    = this.window.length;
    this.mean     = this.window.reduce((a, b) => a + b, 0) / this.total;
    this.variance = this.window.reduce((s, v) => s + Math.pow(v - this.mean, 2), 0);
  }

  getStats() {
    return {
      windowSize:   this.window.length,
      mean:         this.mean.toFixed(4),
      variance:     this.total > 1 ? (this.variance / (this.total - 1)).toFixed(4) : '0',
      driftCount:   this.driftCount,
      lastDriftAt:  this.lastDriftAt,
      delta:        this.delta
    };
  }

  reset() {
    this.window   = [];
    this.variance = 0;
    this.mean     = 0;
    this.total    = 0;
  }
}

module.exports = { ADWINDetector };
```

### Integrate ADWIN Into Existing ML Pipeline

```javascript
// FILE: src/anomaly-detector-ml.js — MODIFY (append)
// ADD at bottom of existing file:
const { ADWINDetector } = require('./ml/adwin-detector');
const { HCSAuditLogger } = require('./hedera/hcs-audit-logger');

// One detector per seasonal model
const adwinDetectors = {
  pre_monsoon:  new ADWINDetector(0.002),
  monsoon:      new ADWINDetector(0.005),   // Higher delta = less sensitive during expected variability
  post_monsoon: new ADWINDetector(0.002),
  dry:          new ADWINDetector(0.001),   // Dry season = most stable = more sensitive
};

function getSeason(timestamp) {
  const month = new Date(timestamp).getMonth() + 1; // 1–12
  if (month >= 3  && month <= 5)  return 'pre_monsoon';
  if (month >= 6  && month <= 9)  return 'monsoon';
  if (month >= 10 && month <= 11) return 'post_monsoon';
  return 'dry';  // Dec, Jan, Feb
}

/**
 * Wrap existing anomaly detection with ADWIN drift monitoring.
 * Call this after your existing Isolation Forest score.
 */
async function detectWithDriftMonitoring(reading, isolationForestScore, plantId) {
  const season   = getSeason(reading.timestamp);
  const detector = adwinDetectors[season];
  const result   = detector.update(isolationForestScore);

  if (result.driftDetected) {
    // Log drift warning to HCS — immutable signal for retraining
    const hcsLogger = new HCSAuditLogger();
    const hcsTxId   = await hcsLogger.logDriftWarning({
      plantId,
      season,
      anomalyRate:  isolationForestScore,
      threshold:    detector.delta,
      driftCount:   result.driftCount,
      action:       'SCHEDULE_SEASONAL_RETRAINING',
      note:         'ADWIN drift detected. Seasonal model retraining required.'
    });

    console.warn(`[ADWIN] Drift detected for ${plantId} (${season}). HCS TX: ${hcsTxId}`);
  }

  return {
    isolationForestScore,
    adwinResult: result,
    season,
    requiresRetraining: result.driftDetected
  };
}

module.exports.detectWithDriftMonitoring = detectWithDriftMonitoring;
module.exports.adwinDetectors = adwinDetectors;
module.exports.getSeason = getSeason;
```

### Seasonal Model Retraining Strategy

```javascript
// FILE: src/ml/seasonal-retrain.js (NEW — Month 6+)
// Only run after 6 months of real pilot data exists per season
// Triggered by ADWIN drift detection event

class SeasonalRetrain {
  async retrain(season, plantId) {
    // 1. Pull last 90 days of THIS season's readings from DB
    const trainingData = await this._getSeasonalData(season, plantId, 90);

    if (trainingData.length < 500) {
      console.log(`[RETRAIN] Insufficient data for ${season}/${plantId}: ${trainingData.length} readings. Need 500+.`);
      return { success: false, reason: 'INSUFFICIENT_DATA', count: trainingData.length };
    }

    // 2. Train new Isolation Forest via Python subprocess (offline)
    //    (Python remains for TRAINING only — not for production detection)
    const { execSync } = require('child_process');
    const trainScript = `python3 scripts/train_isolation_forest.py \
      --season ${season} \
      --plant ${plantId} \
      --output models/${season}_${plantId}_v${Date.now()}.pkl`;

    execSync(trainScript);

    // 3. Validate new model on holdout set
    const validationResult = await this._validateNewModel(season, plantId);

    if (validationResult.accuracy >= 0.92) {
      // 4. Deploy new model — update reference in DB
      await this._deployModel(season, plantId, validationResult.modelPath);
      return { success: true, accuracy: validationResult.accuracy, season, plantId };
    }

    return { success: false, reason: 'VALIDATION_FAILED', accuracy: validationResult.accuracy };
  }
}
```

---

## MONTH 7 — HARDWARE ROOT OF TRUST (TPM/HSM) (Weeks 17–18)

### Why Hardware Security Is Required for Verra

The biggest attack surface in any IoT-based MRV system is the sensor → API pathway. An operator could modify their flow sensor output to claim more generation than actually happened. Without hardware-level trust anchors, this is undetectable.

I implement Hardware Root of Trust in two tiers:

| Tier | Technology | Cost | Use Case |
|---|---|---|---|
| Basic | TPM 2.0 chip (embedded in Pi/edge device) | $5–15/device | Small plants ≤3 MW |
| Standard | HSM (Hardware Security Module) | $200–500/device | Plants 3–15 MW |
| Premium | HSM + TPM + tamper-evident enclosure | $500–1,200/device | Enterprise / Verra audit |

### Module: `src/security/hardware-attestation.js` (NEW FILE)

```javascript
// FILE: src/security/hardware-attestation.js
// Hardware Root of Trust — TPM/HSM attestation for sensor readings
// Each sensor device has a unique hardware key embedded at manufacture
// Readings are signed with this key — forgery requires physical hardware access

const crypto = require('crypto');

class HardwareAttestation {
  /**
   * Verify a sensor reading signed with TPM/HSM device key.
   * @param {object} reading - Sensor reading with hardware signature
   * @param {string} devicePublicKey - Registered device public key from DB
   * @returns {object} - { valid, reason, trustBonus }
   */
  async verifyDeviceSignature(reading, devicePublicKey) {
    const { sensorData, signature, deviceId, nonce, timestamp } = reading;

    if (!signature || !deviceId) {
      return {
        valid:      false,
        reason:     'NO_HARDWARE_SIGNATURE',
        trustBonus: 0,        // No bonus — treat as standard reading
        layer5Score: 0.5      // Neutral score for Layer 5
      };
    }

    // Reconstruct the exact payload that was signed by the hardware
    // Order matters — must match what the device firmware signs
    const signedPayload = JSON.stringify({
      flowRate:    sensorData.flowRate,
      headHeight:  sensorData.headHeight,
      powerOutput: sensorData.powerOutput,
      deviceId,
      nonce,
      timestamp
    });

    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(signedPayload);
      const isValid = verify.verify(devicePublicKey, signature, 'hex');

      if (!isValid) {
        return {
          valid:       false,
          reason:      'SIGNATURE_INVALID',
          detail:      'Hardware signature does not match registered device key. Possible tampering.',
          layer5Score: 0.0    // Hard reject — security violation
        };
      }

      // Check nonce freshness — prevent replay attacks
      const nonceAge = Date.now() - parseInt(nonce);
      if (nonceAge > 300000) {  // 5 minutes = stale nonce
        return {
          valid:       false,
          reason:      'NONCE_STALE',
          detail:      `Nonce is ${Math.round(nonceAge / 1000)}s old. Max 300s allowed.`,
          layer5Score: 0.2
        };
      }

      return {
        valid:       true,
        reason:      'HARDWARE_VERIFIED',
        detail:      `TPM/HSM signature valid. Device: ${deviceId}`,
        layer5Score: 1.0,     // Maximum Layer 5 score
        trustBonus:  0.05     // +5% to final trust score for hardware-attested readings
      };

    } catch (err) {
      return {
        valid:       false,
        reason:      'SIGNATURE_ERROR',
        detail:      err.message,
        layer5Score: 0.0
      };
    }
  }

  /**
   * Register a new sensor device in the DB.
   * Called when deploying hardware to a plant.
   * @param {object} deviceInfo - { deviceId, plantId, publicKey, deviceType, installedAt }
   */
  async registerDevice(deviceInfo) {
    // Verify the public key format before storing
    try {
      crypto.createPublicKey(deviceInfo.publicKey);
    } catch (err) {
      throw new Error(`Invalid public key format for device ${deviceInfo.deviceId}: ${err.message}`);
    }

    await this.db.query(
      `INSERT INTO registered_devices
         (device_id, plant_id, public_key, device_type, firmware_version,
          installed_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [
        deviceInfo.deviceId,
        deviceInfo.plantId,
        deviceInfo.publicKey,
        deviceInfo.deviceType,   // 'TPM2', 'HSM', 'HMAC_ONLY'
        deviceInfo.firmwareVersion || '1.0.0',
        deviceInfo.installedAt || new Date()
      ]
    );
  }
}

module.exports = { HardwareAttestation };
```

---

## MONTH 8 — MULTI-PLANT DASHBOARD UPGRADE (Weeks 19–20)

### What My Dashboard Needs To Show Paying Customers

My existing `src/api/v1/multi-plant.js` is 6,765 bytes but lacks the analytics that plant operators need to justify their subscription fee. A customer paying $300/month needs to see ROI immediately.

### New Dashboard API Endpoints

```javascript
// FILE: src/api/v1/analytics.js — EXTEND (currently 628 bytes)
// Add these high-value endpoints that operators actually use:

// GET /api/v1/analytics/plant/:plantId/mrv-report
// Returns: Complete MRV report for the period — what I show to buyers
router.get('/plant/:plantId/mrv-report', operatorAuth, async (req, res) => {
  const { periodStart, periodEnd } = req.query;

  const report = await db.query(`
    SELECT
      COUNT(*) AS total_readings,
      SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'FLAGGED'  THEN 1 ELSE 0 END) AS flagged,
      SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
      AVG(trust_score)                                       AS avg_trust,
      SUM(energy_generated_kwh) / 1000                      AS total_mwh,
      SUM(co2_avoided_tonnes)                                AS total_co2,
      SUM(hrec_minted)                                       AS total_hrec_minted,
      SUM(hrec_retired)                                      AS total_hrec_retired,
      MIN(timestamp)                                         AS period_start,
      MAX(timestamp)                                         AS period_end
    FROM telemetry_records
    WHERE plant_id = $1
      AND timestamp BETWEEN $2 AND $3
  `, [req.params.plantId, periodStart, periodEnd]);

  const row = report.rows[0];

  return res.json({
    plantId:      req.params.plantId,
    period:       { start: periodStart, end: periodEnd },
    generation: {
      totalMWh:         parseFloat(row.total_mwh || 0).toFixed(2),
      approvedReadings: parseInt(row.approved),
      flaggedReadings:  parseInt(row.flagged),
      rejectedReadings: parseInt(row.rejected),
      approvalRate:     ((row.approved / row.total_readings) * 100).toFixed(1) + '%',
      avgTrustScore:    parseFloat(row.avg_trust || 0).toFixed(3)
    },
    carbonCredits: {
      co2AvoidedTonnes: parseFloat(row.total_co2 || 0).toFixed(2),
      hrecMinted:       parseInt(row.total_hrec_minted),
      hrecRetired:      parseInt(row.total_hrec_retired),
      hrecAvailable:    parseInt(row.total_hrec_minted) - parseInt(row.total_hrec_retired)
    },
    auditTrail: {
      hcsTopic:      process.env.MAINNET_HCS_TOPIC_ID || '0.0.7462776',
      hashScanUrl:   `https://hashscan.io/mainnet/topic/${process.env.MAINNET_HCS_TOPIC_ID}`
    },
    subscription: {
      tier:       req.operator.tier,      // BASIC/STANDARD/PREMIUM
      monthlyFee: req.operator.monthlyFee
    }
  });
});

// GET /api/v1/analytics/portfolio — All plants summary for enterprise buyers
router.get('/portfolio', operatorAuth, async (req, res) => {
  const plants = await db.query(
    `SELECT plant_id, name, capacity_mw, location FROM plants WHERE operator_id = $1`,
    [req.operator.id]
  );

  const portfolioData = await Promise.all(
    plants.rows.map(async (plant) => {
      const latest = await db.query(
        `SELECT SUM(energy_generated_kwh)/1000 AS mwh,
                SUM(hrec_minted) AS hrec,
                AVG(trust_score) AS trust
         FROM telemetry_records
         WHERE plant_id = $1
           AND timestamp > NOW() - INTERVAL '30 days'`,
        [plant.plant_id]
      );
      return { ...plant, last30Days: latest.rows[0] };
    })
  );

  return res.json({
    operatorId:     req.operator.id,
    totalPlants:    plants.rows.length,
    plants:         portfolioData,
    totalMRV30Days: portfolioData.reduce((s, p) => s + parseFloat(p.last30Days?.mwh || 0), 0),
    totalHREC30Days: portfolioData.reduce((s, p) => s + parseInt(p.last30Days?.hrec || 0), 0)
  });
});
```

---

## MONTH 9 — VERRA SHADOW MODE RESULTS (Weeks 21–22)

### Actions After 6 Months of Shadow Mode Data

```bash
# Generate Verra report for all pilot plants
node -e "
  const { ShadowModeComparator } = require('./src/validation/shadow-mode-comparator');
  const db = require('./src/db/pool');
  const comparator = new ShadowModeComparator(db);

  const plants = ['pilot-001', 'pilot-002', 'pilot-003'];
  plants.forEach(async (plantId) => {
    const report = await comparator.generateVerraReport(
      plantId,
      '2026-04-01',   // Month 5 start
      '2026-09-30'    // Month 9 end
    );
    console.log('Plant:', plantId);
    console.log('Avg Variance:', report.summary.avgVariance);
    console.log('Verra Compliant:', report.summary.verraCompliant);
    console.log('---');
  });
"

# EXPECTED OUTPUT (target):
# Plant: pilot-001
# Avg Variance: 3.2%
# Verra Compliant: true
# ---
# Plant: pilot-002
# Avg Variance: 2.8%
# Verra Compliant: true
```

### Month 9 Verra Follow-Up (Second Email)

```
To: info@verra.org
Subject: Shadow mode data ready — Hedera hydropower dMRV methodology review request

Dear Verra Technical Team,

Further to my inquiry in [Month 5 date], I am writing to advise that I have 
completed 6 months of shadow mode operation for my digital MRV system.

RESULTS:
• Plant 1: 3.2% variance vs. manual MRV (within Verra 5% threshold)
• Plant 2: 2.8% variance vs. manual MRV (within Verra 5% threshold)  
• Plant 3: 4.1% variance vs. manual MRV (within Verra 5% threshold)
• Average variance: 3.4% — qualifies as ACCEPTABLE per VCS §4.1.2

SUPPORTING EVIDENCE:
• 6-month shadow mode report (attached PDF)
• HashScan audit trail: hashscan.io/mainnet/topic/[topic-id]
• Guardian policy execution logs (available on request)
• Technical specification: github.com/BikramBiswas786/[repo]

REQUEST: Guidance on formal methodology pre-approval submission process.

Bikram Biswas
```

---

## MONTH 10 — TIERED PRICING V2 + ENTERPRISE PIPELINE (Weeks 23–24)

### Revised 3-Tier Pricing Model (Based on Real Pilot Data)

| Tier | Monthly Fee | What's Included | Target Plant | Break-Even |
|---|---|---|---|---|
| **Basic** | $100/mo ($1,200/yr) | Single sensor, hourly verification, ESG cert | 1–3 MW | Plant earns >$2,000/yr in credits |
| **Standard** | $300/mo ($3,600/yr) | Multi-sensor redundancy, ADWIN ML, shadow mode report | 3–10 MW | Plant earns >$6,000/yr |
| **Premium** | $500/mo ($6,000/yr) | TPM/HSM hardware, ZKP privacy, physical audit reports, Verra docs | 10–15 MW | Plant earns >$12,000/yr |
| **Enterprise** | Custom ($50K–500K/yr) | White-label API, dedicated Railway instance, SLA, custom VVB | 15+ MW / utilities | Enterprise ESG budget |

### Enterprise Pipeline Actions

```bash
# Month 10 enterprise outreach targets:
# Priority 1: India — state utilities with small hydro portfolios
TARGETS_INDIA=(
  "NHPC Limited (nhpcindia.com) — 7,071 MW portfolio, needs digital MRV at scale"
  "SJVN Limited (sjvn.nic.in) — 40+ small hydro projects"
  "THDC India Limited — Uttarakhand hydro projects"
  "Karnataka Power Corporation — 30+ small hydro plants"
)

# Priority 2: Southeast Asia
TARGETS_SEA=(
  "Vietnam Electricity (EVN) — 14,000+ MW, digital MRV mandate 2026"
  "PLN Indonesia — 6,000+ MW hydro capacity"
  "Nepal Electricity Authority — 50+ run-of-river projects"
)

# Priority 3: DFI/Finance channel
TARGETS_DFI=(
  "Asian Development Bank (ADB) — Climate finance desk"
  "International Finance Corporation (IFC) — carbon market programs"
  "Green Climate Fund (GCF) — digital MRV interest"
)
```

### Enterprise SDK Outline (Build Month 10)

```javascript
// FILE: src/api/v2/enterprise-sdk.js (NEW)
// White-label API for utilities to embed dMRV in their own platforms

const router = express.Router();

// POST /api/v2/enterprise/deploy-fleet
// Deploys dMRV for an entire fleet of plants in one API call
router.post('/deploy-fleet', enterpriseAuth, async (req, res) => {
  const { organizationId, plantConfigs, whitelabelConfig } = req.body;

  const deployedPlants = [];
  for (const plantConfig of plantConfigs) {
    // 1. Register plant in DB
    const plantId = await plantService.register(plantConfig);
    
    // 2. Create Hedera DID for plant
    const { DIDManager } = require('../../did/did-manager');
    const did = await new DIDManager().registerBuyerDID({ name: plantConfig.name });
    
    // 3. Associate HTS token with plant's Hedera account
    await htsService.associateToken(did.accountId, process.env.MAINNET_HTS_TOKEN_ID);
    
    // 4. Provision Guardian policy for this plant
    const policyId = await guardianService.clonePolicy(
      process.env.GUARDIAN_POLICY_ID,
      plantId,
      whitelabelConfig.brandName
    );
    
    deployedPlants.push({ plantId, did: did.did, policyId });
  }

  return res.status(201).json({
    organizationId,
    deployedPlants,
    totalDeployed:   deployedPlants.length,
    message:         `Fleet of ${deployedPlants.length} plants deployed and ready for MRV`
  });
});

module.exports = router;
```

---

## MONTH 11 — ISO 27001 DOCUMENTATION (Weeks 25–26)

### What ISO 27001 Actually Requires From Me

ISO 27001 is an information security management standard. Enterprise buyers and government clients require it. The documentation I need to write is not code — it is policies and procedures.

**Complete Documentation Checklist:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY ISO 27001 DOCUMENTS (Annex A):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Information Security Policy (1–3 pages)
  Content: What data I hold, who can access it, encryption standard
  My position: AES-256 at rest, TLS 1.3 in transit, JWT auth only

□ Risk Assessment Register (spreadsheet)
  Rows: each identified risk (data breach, HCS downtime, key theft etc.)
  Columns: likelihood (1–5), impact (1–5), mitigation, residual risk

□ Access Control Policy (1–2 pages)
  Content: Who can access what (operator vs buyer vs admin vs me)
  My position: Role-based JWT, no shared credentials, 2FA on Railway/GitHub

□ Incident Response Plan (2–4 pages)
  Content: What happens if private key is leaked / HCS goes down / DB breach
  My position: 30-min response SLA for Critical, 4-hour for High

□ Business Continuity Plan (1–2 pages)
  Content: What if Railway goes down? Vercel? Hedera itself?
  My position: Hedera has 99.9%+ uptime SLA. Railway → AWS fallback.

□ Supplier Security Assessment (1 page per vendor)
  Vendors: Hedera, Railway, Vercel, Redis, GitHub
  Content: Their security certifications, data residency

□ Data Classification Policy (1 page)
  Public: HCS messages, HashScan URLs, token IDs
  Confidential: Operator keys, buyer DIDs, plant operator emails
  Restricted: Hedera private keys (never stored in DB — env vars only)

□ Audit Log Retention Policy (1 paragraph)
  My position: HCS logs permanent (Hedera design), DB 7 years, Railway 90 days

□ Encryption Standard Document (1 page)
  DB: AES-256 PostgreSQL encryption at rest (Railway-managed)
  Transit: TLS 1.3 for all API endpoints
  Keys: Hedera private keys in env vars only, never in git history

□ Vulnerability Management Policy (1 page)
  Process: npm audit weekly, dependabot alerts on GitHub, patch SLA 7 days
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTIMATED EFFORT: 40–60 hours of writing
EXTERNAL COST: $15,000–30,000 for formal audit
TIMELINE: Documents Month 11, Audit Month 15–17
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## MONTH 12 — 40 PLANTS LIVE, $83K ARR CONFIRMED (Weeks 27–28)

### Revenue Breakdown At $83K ARR Target

| Channel | Calculation | Annual |
|---|---|---|
| **Subscriptions** | 40 plants × $173/mo avg (mix of tiers) × 12 | $83,040 |
| **Per-verification** | 40 plants × 8,760 readings × $0.0001/reading | $35 (negligible) |
| **HREC retirement commission** | 40 × 500 HREC × $12/tonne × 3% | $7,200 |
| **MRV fees** | 3 pilot plants × $1,000/plant setup fee | $3,000 |
| **TOTAL** | | **~$93,240** ← slightly above $83K |

**Tier mix target at Month 12:**
- 20 Basic ($100/mo) = $2,000/mo
- 15 Standard ($300/mo) = $4,500/mo
- 5 Premium ($500/mo) = $2,500/mo
- Total subscription MRR = $9,000/mo = **$108,000 ARR**

### Month 12 Complete System Architecture

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION SYSTEM AT MONTH 12:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRONTEND:   Vercel (hydropower-mrv-19feb26.vercel.app)
            → Plant operator dashboard
            → ESG certificate viewer
            → HashScan explorer links

BACKEND:    Railway (production)
            → Node.js API v1.8.0
            → 262+ tests passing
            → All 4 revenue channels active
            → ADWIN ML drift detection live

DATABASE:   Railway PostgreSQL
            → 6 tables (plants, readings, claims, certs, buyers, cad_keys)
            → 40 plants × 8,760 rows/yr = 350,400 rows/year

BLOCKCHAIN: Hedera Mainnet
            → HCS topic: XXXXX (all readings logged)
            → HTS token: XXXXX (HREC mint/burn)
            → Guardian policy: ACTIVE (3-of-5 multi-sig)

ML:         ADWIN JS detector (per-season, 4 models)
            → Drift count: <5 (target)
            → False positive rate: <8%
            → Retrained: as triggered by ADWIN

SECURITY:   CAD Trust claim keys active
            → 0 double-counting events
            → All retirements logged to HCS
            
COMPLIANCE: India CCTS registration: IN REVIEW (Month 4 → Month 10)
            Verra shadow mode: COMPLETE (6 months, avg 3.4% variance)
            ISO 27001 docs: IN PROGRESS (Month 11)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ROADMAP 2 MILESTONE SUMMARY

| Month | Code Deliverable | Business Deliverable | Revenue |
|---|---|---|---|
| **3** | cad-trust.js + Migration 005 | 0 double-counting events | $0 |
| **4** | shadow-mode-comparator.js + Migration 006 | India CCTS PDD submitted to BEE | $3,700 |
| **5** | Verra email sent, shadow mode running | 5 pilot plants loading manual MRV data | $7,200/mo |
| **6** | adwin-detector.js (ADWIN JS, δ=0.002) | ADWIN live, seasonal models active | $12,000/mo |
| **7** | hardware-attestation.js, registered_devices table | TPM deployed on 2 pilot plants | $18,000/mo |
| **8** | analytics.js expanded, enterprise-sdk.js outline | Multi-plant dashboard, enterprise outreach started | $24,000/mo |
| **9** | Shadow mode report generator | Verra 2nd email + 6-month shadow mode data | $30,000/mo |
| **10** | enterprise-sdk.js POST /deploy-fleet | First enterprise demo, tiered pricing v2 live | $42,000/mo |
| **11** | ISO docs in docs/ directory | ISO 27001 documentation written | $55,000/mo |
| **12** | All 40 plants live, v1.8.0 deployed | $83K ARR confirmed, incubator pitch ready | **$83K ARR** |

---

*Author: Bikram Biswas | Repo: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-) | Version: V4.0 | March 24, 2026*
