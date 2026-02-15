
# 🚀 INSTALLATION & USAGE GUIDE

## 📂 File Organization

```
hedera-hydropower-mrv/
├── code/
│   └── playground/
│       ├── 01_deploy_did_complete.js    ← Copy here
│       ├── 02_create_rec_token.js       ← Copy here
│       └── 03_submit_telemetry.js       ← Copy here
├── scripts/
│   ├── mint-recs.js                     ← Copy here
│   ├── generate-report.js               ← Copy here
│   └── verify-evidence.js               ← Copy here
├── engine-v1.js                         ✓ Already exists
├── engine-v2.js                         ✓ Already exists
└── .env                                 ✓ Already exists
```

---

## 📋 STEP-BY-STEP DEPLOYMENT

### Step 1: Create Directory Structure
```powershell
# Create directories if they don't exist
mkdir -p code/playground
mkdir -p scripts
```

### Step 2: Copy Files
Download all 6 files from above and place them:
- `01_deploy_did_complete.js` → `code/playground/`
- `02_create_rec_token.js` → `code/playground/`
- `03_submit_telemetry.js` → `code/playground/`
- `mint-recs.js` → `scripts/`
- `generate-report.js` → `scripts/`
- `verify-evidence.js` → `scripts/`

### Step 3: Deploy DID
```powershell
cd code/playground
node 01_deploy_did_complete.js
```
**Expected output:**
```
✓ DID Topic created: 0.0.XXXXXXX
✓ DID Document published
DID: did:hedera:testnet:0.0.XXXXXXX_0.0.0
```

**Action:** Copy `DID_TOPIC_ID` to your `.env` file

---

### Step 4: Create REC Token
```powershell
node 02_create_rec_token.js
```
**Expected output:**
```
✓ REC Token created: 0.0.YYYYYYY
Name: Himalayan Hydropower REC
Symbol: HH-REC
```

**Action:** Copy `REC_TOKEN_ID` to your `.env` file

---

### Step 5: Submit Telemetry & Verify
```powershell
node 03_submit_telemetry.js TURBINE-1 10
```
**Expected output:**
```
✓ TURBINE-1 - APPROVED
  Trust Score: 0.9450
  RECs: 0.000720 tCO2
  TX: 0.0.XXXXX@1234567890.123456789

=== SUMMARY ===
Total Readings: 10
✓ Approved: 8
⚠ Flagged: 2
✗ Rejected: 0
Total RECs Issued: 0.005760 tCO2
```

**Output:** Creates `telemetry-results-TURBINE-1-<timestamp>.json`

---

### Step 6: Mint RECs
```powershell
cd ../../scripts
node mint-recs.js ../telemetry-results-TURBINE-1-<timestamp>.json
```
**Expected output:**
```
✓ RECs minted successfully!
Transaction ID: 0.0.XXXXX@1234567890.123456789
New Total Supply: 5760
```

---

### Step 7: Generate Report
```powershell
node generate-report.js
```
**Expected output:**
```
✓ JSON report saved: monitoring-report-<timestamp>.json
✓ Markdown report saved: monitoring-report-<timestamp>.md

=== SUMMARY ===
Total Readings: 10
Approval Rate: 80.00%
Total RECs: 0.005760 tCO2
```

---

### Step 8: Verify Evidence on-chain
```powershell
node verify-evidence.js
```
**Expected output:**
```
✓ Found 10 messages

Message 1: ✓ VALID
  Device: TURBINE-1
  Status: APPROVED
  Trust: 0.9450
  RECs: 0.000720 tCO2
  Sequence: 1

=== VERIFICATION SUMMARY ===
✓ Valid: 10
✗ Invalid: 0
```

---

## 🔄 COMPLETE WORKFLOW

```powershell
# 1. Setup (one-time)
cd code/playground
node 01_deploy_did_complete.js
node 02_create_rec_token.js

# 2. Daily operations
node 03_submit_telemetry.js TURBINE-1 100

# 3. Mint RECs (after verification)
cd ../../scripts
node mint-recs.js ../telemetry-results-TURBINE-1-*.json

# 4. Generate reports
node generate-report.js

# 5. Audit verification
node verify-evidence.js
```

---

## ✅ SUCCESS CRITERIA

After running all scripts, you should have:
- ✓ DID Topic created on Hedera
- ✓ REC Token created on Hedera
- ✓ 10+ attestations published to HCS
- ✓ RECs minted based on approved attestations
- ✓ Monitoring report generated
- ✓ Evidence verified from on-chain data

---

## 🎯 NEXT STEPS AFTER INSTALLATION

1. **Test with multiple devices:**
   ```powershell
   node 03_submit_telemetry.js TURBINE-1 50
   node 03_submit_telemetry.js TURBINE-2 50
   ```

2. **Test Engine V2 with strict mode:**
   ```powershell
   cd ../..
   node engine-v2.js batch config-strict.json TURBINE-1 20
   ```

3. **Commit to GitHub:**
   ```powershell
   git add code/playground scripts
   git commit -m "feat: Add complete REC workflow scripts"
   git push origin main
   ```

---

**All scripts are production-ready and integrate with your existing Engine V1/V2 system!** 🚀
