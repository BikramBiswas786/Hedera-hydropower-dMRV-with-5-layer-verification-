# ROADMAP 1 — PROTOCOL FOUNDATION
## Hedera Hydropower dMRV | Week 0 → Week 8
**Author: Bikram Biswas | Updated: March 24, 2026 | Status: V3 — Hardened Core Protocol**

---

## 1. WHERE THE REPO IS RIGHT NOW

I have audited the entire codebase. Here is the exact state — no guessing:

### Root-Level Files

| File | Status | Action |
|---|---|---|
| `docker-compose.yml` | ✅ Exists (5,170 bytes) | Do NOT recreate — patch only |
| `Dockerfile` | ✅ Exists | Production container ready |
| `package.json` | ✅ Exists | Check before any `npm install` |
| `jest.config.js` | ✅ Exists | Test runner configured |
| `vercel.json` | ⚠️ Minimal (50 bytes) | May need Railway config |
| `.env.example` | ✅ Exists (2,051 bytes) | Add 6 new keys this week |
| `.env.backup` | 🔴 **PUBLIC** | **Delete immediately — may contain real keys** |
| `.env.old` | 🔴 **PUBLIC** | **Delete immediately — may contain real keys** |

### src/api/v1/ — What Actually Exists

```
EXISTING (do NOT touch during Week 1):
  analytics.js        628 bytes   — analytics endpoints
  anomalies.js      4,532 bytes   — anomaly query API
  billing.js        2,104 bytes   — billing stubs
  feedback.js       5,209 bytes   — feedback collection
  forecast.js       3,560 bytes   — generation forecast
  index.js            548 bytes   — route aggregator
  multi-plant.js    6,765 bytes   — multi-plant mgmt
  organizations.js    851 bytes   — org stubs
  plants.js           600 bytes   — plant CRUD stubs
  subscriptions.js  2,279 bytes   — subscription mgmt
  telemetry.js      6,626 bytes   — MAIN sensor ingest
  tenants.js       11,084 bytes   — LARGEST: multi-tenant

JUNK (delete these — they pollute the repo):
  telemetry.js.backup          ← delete
  telemetry.js.before_fixes    ← delete
  server-fixed.js              ← delete
  server.js.original           ← delete

MISSING — build in Week 1:
  claims.js        ❌ NOT FOUND
  buyer.js         ❌ NOT FOUND
  certificates.js  ❌ NOT FOUND
```

### The 5-Layer Engine — Layer Weights & Thresholds

My existing `src/engine/verification-engine-v1.js` uses these exact weights. I document them here so external auditors (VVBs, DOE) can reproduce my trust scores:

| Layer | Weight | What It Checks | Key Threshold |
|---|---|---|---|
| 1. Physics | 30% | P = ρgQHη within ±5% | Deviation > 20% → score = 0 |
| 2. Temporal | 25% | Ramp rate vs 15-min rolling avg | > 15% change/min → flag |
| 3. Environmental | 20% | Power vs weather data correlation | r < 0.3 → flag |
| 4. ML Anomaly | 15% | Isolation Forest anomaly score | Score < -0.1 → anomalous |
| 5. Device Trust | 10% | HMAC-SHA256 signature validity | Invalid sig → score = 0 |

**Trust score thresholding:**
- APPROVED: ≥ 0.90
- FLAGGED: 0.50–0.90
- REJECTED: < 0.50

These are locked. I do not change them during Roadmap 1.

---

## 2. TASK 0 — SECURITY FIX
### Do this before writing a single line of new code

My `.env.backup` and `.env.old` are publicly readable on GitHub. Anyone can read my testnet Hedera operator key right now.

```bash
# Step 1: Read before deleting (make sure I don't lose access)
cat .env.backup
cat .env.old

# Step 2: If either has real values for any of these:
# OPERATOR_ID, OPERATOR_PRIVATE_KEY, HEDERA_PRIVATE_KEY,
# JWT_SECRET, DB_PASSWORD, REDIS_URL
# → Go to portal.hedera.com and REGENERATE KEYS FIRST

# Step 3: Remove from git history (not just working tree)
git filter-repo --path .env.backup --invert-paths
git filter-repo --path .env.old --invert-paths

# Also delete junk backup files:
git rm --cached src/api/v1/telemetry.js.backup
git rm --cached src/api/v1/telemetry.js.before_fixes
git rm --cached src/api/server-fixed.js
git rm --cached src/api/server.js.original

# Step 4: Update .gitignore
cat >> .gitignore << 'EOF'
.env.backup
.env.old
.env.production
*.backup
*.before_fixes
*.original
EOF

# Step 5: Commit and force push (history rewrite requires force)
git add .gitignore
git commit -m "security: remove exposed env files, purge git history"
git push --force origin main
```

**Why `git filter-repo` not `git rm`:**
Plain `git rm` removes the file from the working tree but the keys remain visible in git history. `git filter-repo` rewrites history so the file never existed. Anyone who cloned before this needs to re-clone.

---

## 3. WEEK 1 — COMMIT-REVEAL HASH + DRIFT DETECTION
### March 24–30 | ~12 hours

### 3.1 Commit-Reveal in src/workflow.js

`src/workflow.js` is 12,032 bytes. I add the commitment phase **before** my existing HCS submit. This closes Vulnerability #1: without this, I have no proof that sensor data was not modified post-collection.

Each extra HCS `ConsensusSubmitMessage` costs ~$0.0002. At 8,760 readings/year per plant, that is $1.75/year extra per plant — worth it for a mathematically verifiable audit trail.

```javascript
// src/workflow.js — ADD at top:
const crypto = require('crypto');

// INSIDE the existing verification function, BEFORE the existing HCS submit:
// ─── PHASE 1: COMMITMENT ───────────────────────────────────────────────
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
// ─── END COMMITMENT ────────────────────────────────────────────────────

// ... existing 5-layer verification runs here, unchanged ...

// ─── PHASE 2: REVEAL ───────────────────────────────────────────────────
// Submit full verified record with both the data AND the hash link
const revealTx = await hcsClient.submitMessage(topicId, JSON.stringify({
  type:              'REVEAL',
  version:           '1.0',
  commitmentHash:    payloadHash,
  commitmentTxId:    commitTxId,
  plantId:           rawSensorData.plantId,
  verifiedAt:        Date.now(),

  // 5-layer scores — required for VVB audit
  layer1_physics:      physicsScore,
  layer2_temporal:     temporalScore,
  layer3_environmental: envScore,
  layer4_ml:           mlScore,
  layer5_device:       deviceScore,

  trustScore:          verifiedRecord.trustScore,
  trustLevel:          verifiedRecord.trustLevel,
  energyGenerated_kWh: verifiedRecord.energyGenerated,

  sensor: {
    flowRate:    rawSensorData.flowRate,
    headHeight:  rawSensorData.headHeight,
    powerOutput: rawSensorData.powerOutput,
    efficiency:  rawSensorData.turbineEfficiency
  }
}));
// ─── END REVEAL ────────────────────────────────────────────────────────

// Return both TX IDs so callers can provide HashScan links
return {
  ...verifiedRecord,
  commitmentTxId: commitTxId,
  revealTxId:     revealTx.transactionId.toString(),
  hashScanCommitment: `https://hashscan.io/testnet/transaction/${commitTxId}`,
  hashScanReveal:     `https://hashscan.io/testnet/transaction/${revealTx.transactionId}`
};
```

### 3.2 Drift Detection in src/anomaly-detector-ml.js

The existing file is 2,342 bytes. I append `DriftDetector` at the bottom without touching existing classes.

In Phase 1, this is a rolling-window monitor. In Roadmap 3, it is replaced by the full ADWIN algorithm (see Roadmap3.md). The API is identical so the swap is non-breaking.

```javascript
// src/anomaly-detector-ml.js — APPEND at the very bottom:

/**
 * DriftDetector — Phase 1 implementation.
 * Monitors anomaly flag rate over a rolling window.
 * If > 15% of readings are flagged, the model may be drifting.
 *
 * Replaced by full ADWIN (Bifet & Gavalda 2007) in Roadmap 3.
 * API is identical — swap is non-breaking.
 */
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
        await this.hcsLogger._submit({
          event:       'ML_DRIFT_WARNING',
          plantId,
          anomalyRate: rate,
          threshold:   this.threshold,
          driftCount:  this.driftCount,
          action:      'HUMAN_REVIEW_REQUIRED'
        });
      }

      return {
        status:          'DRIFT_DETECTED',
        rate:            Math.round(rate * 1000) / 1000,
        driftCount:      this.driftCount,
        detectedAt:      this.lastDriftAt,
        recommendation:  'Flag for human review. ADWIN-based retraining scheduled for Roadmap 3.'
      };
    }

    return { status: 'NORMAL', rate: Math.round(rate * 1000) / 1000, driftCount: this.driftCount };
  }

  getStats() {
    const anomalies = this.history.reduce((acc, v) => acc + v, 0);
    return {
      windowSize:   this.history.length,
      maxWindow:    this.maxWindow,
      anomalyCount: anomalies,
      anomalyRate:  this.history.length > 0 ? anomalies / this.history.length : 0,
      driftCount:   this.driftCount,
      lastDriftAt:  this.lastDriftAt
    };
  }

  reset() {
    this.history = []; this.driftCount = 0; this.lastDriftAt = null;
  }
}

module.exports.DriftDetector = DriftDetector;
```

---

## 4. WEEKS 2–4 — W3C VERIFIABLE CREDENTIAL PIPELINE
### ~20 hours

**Goal:** Replace plain JSON attestations with W3C Verifiable Credentials signed by my issuer DID. This is the legal instrument that buyers use for ESG reporting.

### 4.1 DID and Issuer Model

One issuer DID for the whole dMRV system. One subject DID per plant (later per device):

```
ISSUER_DID  = did:hedera:testnet:<issuerPublicKey>_<issuerAccountId>
PLANT_DID   = did:hedera:testnet:<plantPublicKey>_<plantAccountId>
```

Both follow the Hedera DID Method specification. I generate them via Guardian (Week 2 setup) or directly via the DID SDK.

### 4.2 src/hedera/vc-generator.js

```javascript
// src/hedera/vc-generator.js  (NEW)

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class VCGenerator {
  /**
   * Generate a W3C Verifiable Credential for an APPROVED reading.
   * Throws if verificationStatus is not APPROVED — no VC for flagged/rejected.
   *
   * @param {object} reading      Raw sensor reading
   * @param {object} attestation  Output from 5-layer engine
   * @returns {object}            Signed W3C VC
   */
  async generateCredential(reading, attestation) {
    if (attestation.verificationStatus !== 'APPROVED') {
      throw new Error(
        `VC generation blocked: status is ${attestation.verificationStatus}. ` +
        'Only APPROVED readings get a Verifiable Credential.'
      );
    }

    const credentialId  = `urn:uuid:${uuidv4()}`;
    const issuanceDate  = new Date().toISOString();
    const energyMWh     = attestation.calculations.EG_MWh;

    const credential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id:           credentialId,
      type:         ['VerifiableCredential', 'HydropowerGenerationCredential'],
      issuer:       process.env.ISSUER_DID,
      issuanceDate,
      credentialSubject: {
        id:         reading.plantDid || `did:hedera:testnet:${reading.plantId}`,
        type:       'HydropowerGeneration',
        generation: {
          value:       energyMWh,
          unit:        'MWh',
          periodStart: reading.periodStart,
          periodEnd:   reading.periodEnd
        },
        verification: {
          trustScore:    attestation.trustScore,
          trustLevel:    attestation.trustLevel,  // APPROVED
          method:        '5-layer-verification-v1',
          methodology:   'ACM0002',
          hcsTopic:      '0.0.7462776',
          commitTxId:    attestation.commitmentTxId,
          revealTxId:    attestation.revealTxId
        },
        emissions: {
          er_tCO2e:        attestation.calculations.ER_tCO2e,
          emissionFactor:  0.82,
          source:          'CEA India 2024'
        }
      }
    };

    // Sign with issuer private key
    const signed = await this._signCredential(credential);
    return signed;
  }

  async _signCredential(credential) {
    const privateKey = process.env.CERTIFICATE_SIGNING_KEY.replace(/\\n/g, '\n');
    const signer     = crypto.createSign('SHA256');
    signer.update(JSON.stringify(credential.credentialSubject));
    const signature  = signer.sign(privateKey, 'hex');

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

module.exports = { VCGenerator };
```

### 4.3 Wire Into src/workflow.js

After the commit-reveal block, add VC generation for all APPROVED readings:

```javascript
// In src/workflow.js, after the REVEAL phase:
const { VCGenerator } = require('./hedera/vc-generator');
const vcGen = new VCGenerator();

if (verifiedRecord.verificationStatus === 'APPROVED') {
  const vc = await vcGen.generateCredential(rawSensorData, verifiedRecord);
  
  // Log the VC to HCS as the main payload
  await hcsClient.submitMessage(topicId, JSON.stringify({
    type: 'VERIFIABLE_CREDENTIAL',
    vcId: vc.id,
    revealTxId: revealTx.transactionId.toString(),
    plantId: rawSensorData.plantId,
    trustScore: verifiedRecord.trustScore
  }));

  verifiedRecord.vc = vc;
}
```

**Exit criteria for Weeks 2–4:**
- For any APPROVED reading: I can export a standards-compliant W3C VC
- The VC is signed by my DID and anchored on Hedera via HCS
- `verificationStatus !== 'APPROVED'` throws — no VC for bad readings

---

## 5. WEEKS 5–6 — HTS HREC TOKEN & MINTING
### ~12 hours

**Goal:** Robust fungible HREC token on Hedera testnet, linked deterministically to verified MWh.

### 5.1 Token Creation Script

```javascript
// scripts/deploy_hrec_token.js  (NEW or update if exists)

const {
  Client, TokenCreateTransaction, TokenType, TokenSupplyType,
  PrivateKey, AccountId, Hbar
} = require('@hashgraph/sdk');

async function deployHRECToken() {
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(process.env.OPERATOR_ID),
    PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
  );

  const supplyKey = PrivateKey.generate();

  const tx = await new TokenCreateTransaction()
    .setTokenName('Hedera Renewable Energy Certificate')
    .setTokenSymbol('HREC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(3)               // 1 HREC = 1 MWh = 1000 units
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(supplyKey)
    .setTreasuryAccountId(AccountId.fromString(process.env.OPERATOR_ID))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const tokenId = receipt.tokenId.toString();

  console.log(`✅ HREC Token deployed: ${tokenId}`);
  console.log(`Supply Key (save in .env as HREC_SUPPLY_KEY): ${supplyKey.toString()}`);
  console.log(`HashScan: https://hashscan.io/testnet/token/${tokenId}`);

  // Update .env.example with the real token ID
  console.log(`\nAdd to .env:\nHREC_TOKEN_ID=${tokenId}`);
  return tokenId;
}

deployHRECToken().catch(console.error);
```

### 5.2 Mint Integration

In `src/carbon-credits/CarbonCreditManager.js`, add minting for APPROVED readings only:

```javascript
// In CarbonCreditManager.js — ADD mintForAttestation method:

async mintForAttestation(attestation) {
  // Hard block: never mint for non-APPROVED
  if (attestation.verificationStatus !== 'APPROVED') {
    throw new Error(
      `Cannot mint: status=${attestation.verificationStatus}. ` +
      'HREC only minted for APPROVED attestations.'
    );
  }

  const MWh           = attestation.calculations.EG_MWh;
  const amountToMint  = Math.floor(MWh * 1000);  // 1 MWh = 1000 units (3 decimals)

  if (amountToMint <= 0) {
    throw new Error(`Mint amount must be > 0. Got: ${amountToMint} (MWh: ${MWh})`);
  }

  const mintTx = await new TokenMintTransaction()
    .setTokenId(TokenId.fromString(process.env.HREC_TOKEN_ID))
    .setAmount(amountToMint)
    .execute(this.client);

  const receipt = await mintTx.getReceipt(this.client);
  const txId    = mintTx.transactionId.toString();

  return {
    mintedAmount:  amountToMint,
    MWh,
    txId,
    hashScanUrl:   `https://hashscan.io/testnet/transaction/${txId}`,
    tokenId:       process.env.HREC_TOKEN_ID
  };
}
```

**Exit criteria for Weeks 5–6:**
- HREC token exists on testnet with verified token ID
- For a sample plant + reading set, I can show:
  - VC (JSON-LD, signed)
  - HCS commit TX + reveal TX on HashScan
  - HREC mint TX on HashScan
  - All three linked in the return value from `workflow.js`

---

## 6. WEEKS 7–8 — ESG CERTIFICATE PDF PIPELINE
### ~16 hours

**Goal:** ESG certificates that non-technical buyers and regulators understand — backed by on-chain data they can independently verify.

### 6.1 Install Dependencies

```bash
# Check first — don't reinstall what already exists:
cat package.json | grep -E '"pdfkit"|"qrcode"'

# Only install what is missing:
npm install pdfkit    # PDF rendering
npm install qrcode    # QR code generation

mkdir -p certificates  # PDF output
echo "certificates/" >> .gitignore
```

### 6.2 src/certificates/pdf-renderer.js

```javascript
// src/certificates/pdf-renderer.js  (NEW)

const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const path        = require('path');
const fs          = require('fs');
const crypto      = require('crypto');

class PDFRenderer {
  /**
   * Render an ESG certificate PDF for a completed HREC retirement.
   *
   * @param {object} certData  From certificate-generator.js
   * @param {string} outputDir Local directory to write the PDF
   * @returns {object}         { pdfPath, pdfHashSha256, filename }
   */
  async renderCertificate(certData, outputDir = './certificates') {
    const filename   = `HREC-${certData.id}.pdf`;
    const pdfPath    = path.join(outputDir, filename);

    // Ensure output dir exists
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Generate QR code pointing to HashScan retirement transaction
    const qrDataUrl = await QRCode.toDataURL(certData.hashscanUrl, {
      width:       200,
      margin:      1,
      color:       { dark: '#1a1a2e', light: '#FFFFFF' }
    });
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // ─── HEADER ───────────────────────────────────────────────────
      doc.fontSize(22).font('Helvetica-Bold')
         .text('VERIFIED HYDROPOWER GENERATION CERTIFICATE', {
           align: 'center'
         });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica')
         .text('Issued under ACM0002 | Hedera Hashgraph Blockchain', {
           align: 'center', color: '#666'
         });

      doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).stroke();
      doc.moveDown(1);

      // ─── CERTIFICATE DETAILS ──────────────────────────────────────
      const details = [
        ['Certificate ID',     certData.credentialId],
        ['Issued To',          certData.subjectDid],
        ['Plant Name',         certData.plantId],
        ['Plant Location',     certData.plantLocation || 'On file'],
        ['Generation Period',  `${certData.periodStart} → ${certData.periodEnd}`],
        ['Energy Generated',   `${certData.energyMwh?.toFixed(3)} MWh`],
        ['HREC Tokens Retired', `${certData.quantityHrec?.toFixed(3)} HREC`],
        ['CO₂ Avoided',       `${certData.co2AvoidedTonnes?.toFixed(3)} tCO₂e`],
        ['Emission Factor',    '0.82 tCO₂e/MWh (CEA India 2024)'],
        ['Token ID',           '0.0.7964264'],
        ['HTS Retirement TX',  certData.htsBurnTxId],
        ['HCS Audit TX',       certData.hcsAuditTxId],
        ['Issuance Date',      new Date().toLocaleDateString('en-IN')]
      ];

      details.forEach(([label, value]) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value || 'N/A');
        doc.moveDown(0.3);
      });

      // ─── QR CODE ──────────────────────────────────────────────────
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica-Bold').text('Verify on Hedera HashScan:', { align: 'center' });
      doc.image(qrBuffer, (doc.page.width - 100) / 2, doc.y + 5, { width: 100, height: 100 });
      doc.moveDown(7);

      doc.fontSize(8).font('Helvetica').fillColor('#999')
         .text(certData.hashscanUrl, { align: 'center' });

      // ─── FOOTER ───────────────────────────────────────────────────
      doc.moveTo(50, doc.page.height - 80).lineTo(545, doc.page.height - 80).stroke();
      doc.fontSize(8).fillColor('#666')
         .text(
           'This certificate is cryptographically signed and anchored on the Hedera Hashgraph network. ' +
           'Verification methodology: ACM0002 (UNFCCC Clean Development Mechanism). ' +
           'Issuer DID: ' + process.env.ISSUER_DID,
           50, doc.page.height - 70,
           { width: 495, align: 'center' }
         );

      doc.end();

      stream.on('finish', () => {
        // Calculate SHA-256 of the PDF for integrity verification
        const pdfBuffer     = fs.readFileSync(pdfPath);
        const pdfHashSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
        resolve({ pdfPath, pdfHashSha256, filename });
      });
      stream.on('error', reject);
    });
  }
}

module.exports = { PDFRenderer };
```

### 6.3 API Endpoints for Certificates

```javascript
// src/api/v1/certificates.js  (NEW)

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const { validateBuyerJWT } = require('../../middleware/buyer-auth');
const certDb  = require('../../db/models/certificates');

// GET /api/v1/certificates/:certId — returns W3C VC JSON
router.get('/:certId', validateBuyerJWT, async (req, res) => {
  const cert = await certDb.findById(req.params.certId);
  if (!cert) return res.status(404).json({ error: 'CERTIFICATE_NOT_FOUND' });
  return res.json(cert.vcJson);
});

// GET /api/v1/certificates/:certId/pdf — streams the PDF
router.get('/:certId/pdf', validateBuyerJWT, async (req, res) => {
  const cert = await certDb.findById(req.params.certId);
  if (!cert || !cert.pdfPath || !fs.existsSync(cert.pdfPath)) {
    return res.status(404).json({ error: 'PDF_NOT_FOUND' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="HREC-${cert.id}.pdf"`);
  fs.createReadStream(cert.pdfPath).pipe(res);
});

// GET /api/v1/certificates/:certId/verify — public endpoint (no auth)
// Returns minimal verification data for third-party validators
router.get('/:certId/verify', async (req, res) => {
  const cert = await certDb.findById(req.params.certId);
  if (!cert) return res.status(404).json({ error: 'CERTIFICATE_NOT_FOUND' });
  return res.json({
    valid:           cert.status === 'ACTIVE',
    credentialId:    cert.credentialId,
    issuerDid:       cert.issuerDid,
    subjectDid:      cert.subjectDid,
    htsBurnTxId:     cert.htsBurnTxId,
    hashScanUrl:     cert.hashscanUrl,
    issuanceDate:    cert.issuanceDate,
    pdfHashSha256:   cert.pdfHashSha256   // buyer can verify PDF integrity
  });
});

module.exports = router;
```

**Exit criteria for Weeks 7–8:**
- Given a verified, retired batch:
  - `GET /api/v1/certificates/:id` returns the W3C VC
  - `GET /api/v1/certificates/:id/pdf` streams the PDF
  - `GET /api/v1/certificates/:id/verify` works without auth
  - PDF contains QR code linking to HashScan retirement TX
  - PDF SHA-256 stored in DB for integrity verification

---

## 7. ROADMAP 1 COMPLETION CRITERIA

Roadmap 1 is done when every item below is provable with code or HashScan links:

| Area | Done When |
|---|---|
| Security | `.env.backup` and `.env.old` purged from git history. No real keys in repo. |
| Commit-reveal | `workflow.js` submits commitment hash BEFORE reveal. Both TX IDs in return value. |
| Drift detection | `DriftDetector` appended to `anomaly-detector-ml.js`. Exports `DriftDetector` class. |
| DID & VC | `vc-generator.js` generates signed W3C VCs for APPROVED readings only. |
| HTS Token | HREC token on testnet. Mint called from `CarbonCreditManager.mintForAttestation`. |
| PDF Certificates | `pdf-renderer.js` generates PDF with QR code. `GET /api/v1/certificates/:id/pdf` works. |
| Tests | 262+ passing, coverage ≥ 85.3%. New modules have ≥ 80% coverage each. |

At this point the core protocol is solid: end-to-end from raw telemetry → 5-layer verification → commit-reveal on HCS → W3C VC → HREC mint → PDF ESG certificate.

---

*This is a developer execution plan. Every file path, SHA-256 usage, and Hedera SDK call is verifiable in the codebase. No business projections in this document — those live in Roadmap 2 and 3.*
