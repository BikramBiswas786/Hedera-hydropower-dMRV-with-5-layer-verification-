# 🚀 ROADMAP 3 — TOKENISATION, GOVERNANCE & DEPLOYMENT
## Hedera Hydropower dMRV | Month 13 → Month 36
**Author: Bikram Biswas | Updated: March 25, 2026 | Version: V4.2 — MERGED**
**GitHub: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-)**

> **⚠️ MAINNET IDs:** Testnet HCS topic: `0.0.7462776` | Testnet HTS token: `0.0.7964264`
> Mainnet equivalents must be recorded separately once deployed. Every reference to HCS/HTS below that uses a live mainnet ID must be updated in `.env.production` before production use. Do not use testnet IDs in mainnet transactions.

---

## 1. EXECUTIVE SUMMARY

Roadmap 3 moves from "working protocol" to "governed, tokenised, multi-methodology system running on Hedera mainnet." This is not a business pitch — it is a technical and regulatory execution plan. I merge my strategic compliance path (India CCTS, Verra, ISO, Solidity contracts) with concrete technical modules (ADWIN JS, ZKP Circom circuits, verifier staking, methodology router, enterprise SDK) into a single coherent plan.

**Where I arrive at Month 13:**
- ✅ 40+ active plants on Hedera mainnet
- ✅ CAD Trust double-counting prevention live
- ✅ 6 months of Verra shadow mode data in hand
- ✅ HCS topic live — 350,000+ immutable records
- ✅ HTS token 0.0.7964264 — HREC mint/burn confirmed on **testnet** (mainnet token ID set separately in `.env.production`)
- ✅ Guardian policy with 3-of-5 multi-sig active
- ✅ ADWIN JS drift detection running in production (full Bifet & Gavalda, 2007 implementation shipped in Roadmap 2 Month 6 — see §5 note)
- ✅ TPM/HSM hardware attestation on pilot plants
- ✅ Full 5-layer verification engine on mainnet
- ✅ W3C Verifiable Credentials generated + signed by issuer DID
- ✅ `src/did/did-manager.js` — DID registration module built in Roadmap 1 Week 6; used by enterprise fleet SDK in §7.1
- ✅ Claim Attribution Layer: 18 files, 4 DB tables, 262+ tests passing
- ✅ ESG certificates (PDF + JSON-LD VC + QR → HashScan) end-to-end
- ❌ No ISO accreditation — blocks compliance market entry
- ❌ No on-chain Solidity contracts — governance is still off-chain JS (`VerifierStaking.sol` is designed in §3.4; testnet deployment is Month 15, mainnet Month 17 after external audit)
- ❌ No ZKP layer — institutional buyers cannot verify privately
- ❌ No methodology router — locked to hydropower only
- ❌ Solo developer — single point of failure

**Roadmap 3 closes every one of those gaps across 24 months.**

---

## 2. ROADMAP 3 MASTER TIMELINE

| Phase | Window | Primary Goal | Key Deliverable |
|---|---|---|---|
| **2A — Governance** | M13–18 | On-chain verifier staking + ISO docs | VerifierStaking.sol on HSCS testnet (M15) → mainnet (M17) |
| **2B — Privacy** | M16–22 | ZKP proof layer + Verra accreditation | zkp-proof-generator.js live |
| **3A — Expansion** | M18–28 | Methodology router + enterprise SDK | Solar + Wind engines live |
| **3B — Mainnet** | M20–30 | Full mainnet deployment + first enterprise deal | HRECMinter.sol on HashScan |
| **3C — Compliance** | M24–36 | ISO 27001 + ISO 14064-2 + India CCTS | Certified system |

---

## 3. MONTHS 13–18 — VERIFIER STAKING & GOVERNANCE

### 3.1 Why On-Chain Governance Now

My existing `src/hedera/verifier-staking.js` is off-chain JavaScript — the staking logic runs on my Railway server, which means I can override it. That is not trustless governance. For Verra pre-approval and enterprise contracts, the verification reward/slash system must be enforced by a smart contract that I cannot unilaterally modify.

This is the transition: **off-chain governance (now) → Solidity contracts on HSCS (Month 15 testnet → Month 17 mainnet after external audit).**

### 3.2 Off-Chain Staking Logic — Production Implementation

```javascript
// FILE: src/hedera/verifier-staking.js — PRODUCTION VERSION
// This is the off-chain bridge used until VerifierStaking.sol is deployed
// on HSCS mainnet (Month 17). After that, this module emits calls to the
// contract instead of handling state directly.

const {
  Client, TransferTransaction, AccountBalanceQuery,
  AccountId, PrivateKey, Hbar
} = require('@hashgraph/sdk');
const { HCSAuditLogger } = require('./hcs-audit-logger');

class VerifierStakingManager {
  constructor() {
    this.client = Client.forMainnet();
    this.client.setOperator(
      AccountId.fromString(process.env.OPERATOR_ID),
      PrivateKey.fromString(process.env.OPERATOR_PRIVATE_KEY)
    );
    this.hcsLogger     = new HCSAuditLogger();
    this.treasuryId    = AccountId.fromString(process.env.TREASURY_ACCOUNT_ID);
    this.SLASH_PERCENT = 0.10;  // 10% per offence — conservative for early network
    // Rationale: Ethereum PoS uses 1-5%. I use 10% because verifiers here have
    // domain expertise and are expected to catch obvious violations.
    // Will revisit at 500+ verifiers.
    this.MIN_STAKE     = 100;   // minimum HBAR to register as verifier
  }

  async registerVerifier(verifierId, stakeAmount) {
    if (stakeAmount < this.MIN_STAKE) {
      throw new Error(`Minimum stake is ${this.MIN_STAKE} HBAR. Got: ${stakeAmount}`);
    }

    const tx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(verifierId), new Hbar(-stakeAmount))
      .addHbarTransfer(this.treasuryId, new Hbar(stakeAmount))
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);
    const txId    = tx.transactionId.toString();

    await this._saveStake({ verifierId, stakeAmount, txId, status: 'ACTIVE' });

    await this.hcsLogger._submit({
      event:      'VERIFIER_STAKED',
      verifierId,
      stakeHbar:  stakeAmount,
      stakeTxId:  txId,
      timestamp:  Date.now()
    });

    return { verifierId, stakeAmount, txId, hashScan: `https://hashscan.io/mainnet/transaction/${txId}` };
  }

  async slash(verifierId, reason, claimId) {
    const stake = await this._getStake(verifierId);
    if (!stake || stake.status !== 'ACTIVE') {
      throw new Error(`No active stake found for verifier: ${verifierId}`);
    }

    const penalty  = Math.floor(stake.stakeAmount * this.SLASH_PERCENT);
    const newStake = stake.stakeAmount - penalty;

    const slashTx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(verifierId), new Hbar(-penalty))
      .addHbarTransfer(this.treasuryId, new Hbar(penalty))
      .execute(this.client);

    const slashTxId = slashTx.transactionId.toString();
    await this._updateStake(verifierId, { stakeAmount: newStake });

    await this.hcsLogger._submit({
      event:        'VERIFIER_SLASHED',
      verifierId,
      penaltyHbar:  penalty,
      newStakeHbar: newStake,
      reason,
      claimId,
      slashTxId,
      timestamp:    Date.now()
    });

    if (newStake < this.MIN_STAKE) {
      await this._suspendVerifier(verifierId, 'STAKE_BELOW_MINIMUM');
    }

    return {
      verifierId,
      penaltyHbar:  penalty,
      newStakeHbar: newStake,
      slashTxId,
      hashScan: `https://hashscan.io/mainnet/transaction/${slashTxId}`
    };
  }

  async reward(verifierId, amount) {
    await this._db().query(
      `UPDATE verifier_stakes SET rewards_earned = rewards_earned + $1, last_rewarded_at = NOW()
       WHERE verifier_id = $2 AND status = 'ACTIVE'`,
      [amount, verifierId]
    );
    await this.hcsLogger._submit({ event: 'VERIFIER_REWARDED', verifierId, amount, timestamp: Date.now() });
  }

  _db() {
    const { Pool } = require('pg');
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }

  async _getStake(verifierId) {
    const result = await this._db().query(
      'SELECT * FROM verifier_stakes WHERE verifier_id = $1 AND status = $2',
      [verifierId, 'ACTIVE']
    );
    return result.rows[0] || null;
  }

  async _saveStake(stakeData) {
    await this._db().query(
      `INSERT INTO verifier_stakes (verifier_id, stake_amount, stake_tx_id, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [stakeData.verifierId, stakeData.stakeAmount, stakeData.txId, stakeData.status]
    );
  }

  async _updateStake(verifierId, updates) {
    await this._db().query(
      'UPDATE verifier_stakes SET stake_amount = $1, updated_at = NOW() WHERE verifier_id = $2',
      [updates.stakeAmount, verifierId]
    );
  }

  async _suspendVerifier(verifierId, reason) {
    await this._db().query(
      "UPDATE verifier_stakes SET status = 'SUSPENDED', suspension_reason = $1 WHERE verifier_id = $2",
      [reason, verifierId]
    );
    await this.hcsLogger._submit({ event: 'VERIFIER_SUSPENDED', verifierId, reason, timestamp: Date.now() });
  }
}

module.exports = { VerifierStakingManager };
```

### 3.3 DB Migration: `verifier_stakes` Table

```sql
-- FILE: src/db/migrations/005_create_verifier_stakes_table.sql

CREATE TABLE IF NOT EXISTS verifier_stakes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verifier_id           VARCHAR(100) UNIQUE NOT NULL,
    amount_staked         DECIMAL(20, 6) NOT NULL DEFAULT 0,
    initial_stake         DECIMAL(20, 6) NOT NULL DEFAULT 0,
    rewards_earned        DECIMAL(20, 6) NOT NULL DEFAULT 0,
    slash_count           INTEGER NOT NULL DEFAULT 0,
    total_slashed         DECIMAL(20, 6) DEFAULT 0,
    plant_ids             JSONB NOT NULL DEFAULT '[]',
    status                VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
    suspension_reason     TEXT,
    stake_tx_id           VARCHAR(200) UNIQUE,
    total_verifications   INTEGER DEFAULT 0,
    accurate_verifications INTEGER DEFAULT 0,
    accuracy_rate         DECIMAL(5, 4),
    contract_address      VARCHAR(200),    -- populated after HSCS mainnet deployment (Month 17)
    staked_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_slashed_at       TIMESTAMP,
    last_rewarded_at      TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vs_verifier_id ON verifier_stakes(verifier_id);
CREATE INDEX idx_vs_status      ON verifier_stakes(status);
```

### 3.4 Solidity Contracts — Design & Deployment Schedule

> **STATUS NOTE:** All three contracts below are **designs** as of Month 13. They are NOT yet deployed. Schedule: write + unit test Month 13–14 → HSCS testnet Month 15 → external security audit Month 16 → HSCS mainnet Month 17 (only after audit returns zero critical findings). Do not claim any contract is live until the HashScan mainnet contract address is recorded in `.env.production`.

Three contracts replace off-chain JS governance. Design Month 13 → testnet Month 15 → external audit Month 16 → mainnet Month 17.

**`contracts/VerifierStaking.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

// FILE: contracts/VerifierStaking.sol
// On-chain verifier staking for the Hedera Hydropower dMRV protocol.
// Target deployment: HSCS testnet Month 15, mainnet Month 17 (post-audit).
// Author: Bikram Biswas | March 2026

contract VerifierStaking {
    address public owner;
    address public treasury;
    uint256 public constant SLASH_PERCENT = 10;    // 10% — see rationale in §3.2
    uint256 public constant MIN_STAKE     = 50 ether;  // 50 HBAR minimum stake

    struct Stake {
        uint256 amount;
        uint256 initialAmount;
        uint256 rewardsEarned;
        uint256 slashCount;
        bool    active;
        uint256 stakedAt;
    }

    mapping(address => Stake) public stakes;

    event VerifierStaked(address indexed verifier, uint256 amount);
    event VerifierSlashed(address indexed verifier, uint256 penalty, string reason);
    event VerifierRewarded(address indexed verifier, uint256 amount);
    event VerifierSuspended(address indexed verifier, uint256 remainingStake);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyActive(address verifier) {
        require(stakes[verifier].active, "Verifier not active");
        _;
    }

    constructor(address _treasury) {
        owner    = msg.sender;
        treasury = _treasury;
    }

    function stake() external payable {
        require(msg.value >= MIN_STAKE, "Below minimum stake");
        stakes[msg.sender] = Stake({
            amount:        msg.value,
            initialAmount: msg.value,
            rewardsEarned: 0,
            slashCount:    0,
            active:        true,
            stakedAt:      block.timestamp
        });
        emit VerifierStaked(msg.sender, msg.value);
    }

    function slash(address verifier, string calldata reason)
        external onlyOwner onlyActive(verifier) {
        Stake storage s = stakes[verifier];
        uint256 penalty  = (s.amount * SLASH_PERCENT) / 100;
        s.amount        -= penalty;
        s.slashCount    += 1;

        payable(treasury).transfer(penalty);
        emit VerifierSlashed(verifier, penalty, reason);

        if (s.amount < MIN_STAKE) {
            s.active = false;
            emit VerifierSuspended(verifier, s.amount);
        }
    }

    function reward(address verifier, uint256 amount)
        external onlyOwner onlyActive(verifier) {
        stakes[verifier].rewardsEarned += amount;
        payable(verifier).transfer(amount);
        emit VerifierRewarded(verifier, amount);
    }

    function withdraw() external {
        Stake storage s = stakes[msg.sender];
        require(s.active, "No active stake");
        uint256 amount = s.amount;
        s.amount = 0;
        s.active = false;
        payable(msg.sender).transfer(amount);
    }

    function getStake(address verifier) external view returns (Stake memory) {
        return stakes[verifier];
    }
}
```

**`contracts/HRECMinter.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

// FILE: contracts/HRECMinter.sol
// Multi-sig HREC token minting gate on HSCS.
// Enforces: 3-of-5 authorized signers before any mint.
// The HTS mint call happens off-chain after contract emits MintExecutable event.
// Target deployment: HSCS testnet Month 15, mainnet Month 17 (post-audit).

contract HRECMinter {
    address public owner;
    uint256 public constant REQUIRED_APPROVALS = 3;

    struct MintRequest {
        address plantDID;
        uint256 amountHREC;
        uint256 approvalCount;
        bool    executed;
        string  hcsEvidenceTx;
        mapping(address => bool) approved;
    }

    mapping(uint256 => MintRequest) public mintRequests;
    mapping(address => bool)        public authorizedSigners;
    uint256 public requestCount;

    event MintRequested(uint256 indexed requestId, address plantDID, uint256 amount);
    event MintApproved(uint256 indexed requestId, address signer, uint256 approvalCount);
    event MintExecutable(uint256 indexed requestId);  // Backend listens → calls HTS mint

    modifier onlySigner() {
        require(authorizedSigners[msg.sender], "Not authorized signer");
        _;
    }

    constructor(address[] memory _signers) {
        owner = msg.sender;
        for (uint i = 0; i < _signers.length; i++) {
            authorizedSigners[_signers[i]] = true;
        }
    }

    function requestMint(
        address plantDID,
        uint256 amountHREC,
        string calldata hcsEvidenceTx
    ) external onlySigner returns (uint256 requestId) {
        requestId = requestCount++;
        MintRequest storage req = mintRequests[requestId];
        req.plantDID      = plantDID;
        req.amountHREC    = amountHREC;
        req.hcsEvidenceTx = hcsEvidenceTx;
        req.executed      = false;
        emit MintRequested(requestId, plantDID, amountHREC);
    }

    function approveMint(uint256 requestId) external onlySigner {
        MintRequest storage req = mintRequests[requestId];
        require(!req.executed, "Already executed");
        require(!req.approved[msg.sender], "Already approved");

        req.approved[msg.sender] = true;
        req.approvalCount++;
        emit MintApproved(requestId, msg.sender, req.approvalCount);

        if (req.approvalCount >= REQUIRED_APPROVALS) {
            req.executed = true;
            emit MintExecutable(requestId);
        }
    }
}
```

**`contracts/PlantRegistry.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

// FILE: contracts/PlantRegistry.sol
// On-chain registry of verified hydropower plants.
// Target deployment: HSCS testnet Month 15, mainnet Month 17 (post-audit).

contract PlantRegistry {
    address public owner;

    struct Plant {
        string  plantId;
        string  hederaDID;
        string  methodology;   // ACM0002, AMS-I.D, AMS-I.F etc.
        uint256 capacityKW;
        bool    active;
        uint256 registeredAt;
        string  hcsTopicId;
    }

    mapping(string => Plant)   public plants;
    mapping(string => bool)    public registered;
    mapping(string => address[]) public plantVerifiers;
    string[]                   public plantIds;

    event PlantRegistered(string indexed plantId, string hederaDID, string methodology);
    event VerifierAdded(string indexed plantId, address verifier);
    event PlantDeactivated(string indexed plantId);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() { owner = msg.sender; }

    function registerPlant(
        string calldata plantId,
        string calldata hederaDID,
        string calldata methodology,
        uint256         capacityKW,
        string calldata hcsTopicId
    ) external onlyOwner {
        require(!registered[plantId], "Plant already registered");
        plants[plantId] = Plant({
            plantId:      plantId,
            hederaDID:    hederaDID,
            methodology:  methodology,
            capacityKW:   capacityKW,
            active:       true,
            registeredAt: block.timestamp,
            hcsTopicId:   hcsTopicId
        });
        registered[plantId] = true;
        plantIds.push(plantId);
        emit PlantRegistered(plantId, hederaDID, methodology);
    }

    function addVerifier(string calldata plantId, address verifier) external onlyOwner {
        require(registered[plantId], "Plant not found");
        plantVerifiers[plantId].push(verifier);
        emit VerifierAdded(plantId, verifier);
    }

    function deactivatePlant(string calldata plantId) external onlyOwner {
        require(registered[plantId], "Plant not found");
        plants[plantId].active = false;
        emit PlantDeactivated(plantId);
    }

    function getPlant(string calldata plantId) external view returns (Plant memory) {
        return plants[plantId];
    }

    function getActivePlantCount() external view returns (uint256 count) {
        for (uint i = 0; i < plantIds.length; i++) {
            if (plants[plantIds[i]].active) count++;
        }
    }
}
```

### 3.5 Contract Deployment Checklist

```bash
# Step 1: Install Hardhat
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Step 2: Configure hardhat.config.js for HSCS testnet
# networks.hederaTestnet.url = "https://testnet.hedera.com"
# networks.hederaTestnet.accounts = [process.env.HEDERA_EVM_PRIVATE_KEY]

# Step 3: Deploy to HSCS testnet (Month 15)
npx hardhat run scripts/deploy_contracts.js --network hederaTestnet

# Step 4: Run full test suite
npx hardhat test test/VerifierStaking.test.js
npx hardhat test test/HRECMinter.test.js
npx hardhat test test/PlantRegistry.test.js

# Step 5: External security audit (Month 16)
# Submit to: Code4rena, Sherlock, or Hats Finance
# Minimum scope: VerifierStaking.sol slash function (highest risk)

# Step 6: Deploy to HSCS mainnet (Month 17, ONLY after audit returns zero critical findings)
npx hardhat run scripts/deploy_contracts.js --network hederaMainnet
# Verify at: https://hashscan.io/mainnet/contract/<address>
# Record all 3 contract addresses in .env.production immediately after deployment
```

---

## 4. MONTHS 16–22 — ZKP PRIVACY LAYER

### 4.1 Why ZKP Is Required for Enterprise Buyers

Large utilities and institutional ESG buyers want to verify that my dMRV readings fall within legitimate bounds — but cannot share raw telemetry with third parties for legal/commercial reasons. Standard blockchain transparency breaks this requirement.

**ZKP solution:** The buyer proves that `flow × head × efficiency = power` is within the permitted range, without revealing actual sensor values. I use `snarkjs` + Circom circuits.

### 4.2 Circuit: `circuits/hydropower_verify.circom`

```circom
// FILE: circuits/hydropower_verify.circom
// Proves: P_calculated is within [bounds.min, bounds.max]
// Physics: P = ρ × g × Q × H × η   (ACM0002)
//
// Private inputs (never revealed): Q (flow), H (head), η (efficiency)
// Public inputs (revealed):        P_calculated, bounds.min, bounds.max
pragma circom 2.0.0;

template HydropowerVerifier() {
    // Private inputs — raw sensor readings
    signal input flowRate;        // Q in m³/s × 100 (integer, scaled)
    signal input headHeight;      // H in meters × 100
    signal input efficiency;      // η × 100 (0–100)

    // Public inputs — what the verifier sees
    signal input powerCalculated; // P in kW (scaled integer)
    signal input boundsMin;       // Lower bound from Guardian policy
    signal input boundsMax;       // Upper bound from Guardian policy

    // Compute P from private inputs: P = (Q/100) × (H/100) × (η/100) × 9810
    signal flowHead;
    flowHead <== flowRate * headHeight;

    signal flowHeadEff;
    flowHeadEff <== flowHead * efficiency;

    signal powerRaw;
    powerRaw <== flowHeadEff * 981;

    // Allow ±5% tolerance for sensor precision
    signal diff;
    diff <== powerRaw - powerCalculated * 10000000;

    signal tolerance;
    tolerance <== powerCalculated * 500000;

    component lte = LessEqThan(64);
    lte.in[0] <== diff + tolerance;
    lte.in[1] <== tolerance * 2;

    component lte2 = LessEqThan(64);
    lte2.in[0] <== 0;
    lte2.in[1] <== diff + tolerance;

    lte.out === 1;
    lte2.out === 1;

    // Bounds check: boundsMin <= powerCalculated <= boundsMax
    component boundsLow = LessEqThan(64);
    boundsLow.in[0] <== boundsMin;
    boundsLow.in[1] <== powerCalculated;
    boundsLow.out === 1;

    component boundsHigh = LessEqThan(64);
    boundsHigh.in[0] <== powerCalculated;
    boundsHigh.in[1] <== boundsMax;
    boundsHigh.out === 1;
}

component main {public [powerCalculated, boundsMin, boundsMax]} = HydropowerVerifier();
```

### 4.3 Module: `src/security/zkp-proof-generator.js`

```javascript
// FILE: src/security/zkp-proof-generator.js
// ZKP proof generation for enterprise/premium tier plants.
// Uses snarkjs + Groth16 proving system.
// Only available for Standard+ tier — not Basic tier.

const snarkjs = require('snarkjs');
const fs      = require('fs');
const path    = require('path');

class ZKPProofGenerator {
  constructor() {
    this.wasmPath = path.join(__dirname, '../../circuits/hydropower_verify_js/hydropower_verify.wasm');
    this.zkeyPath = path.join(__dirname, '../../circuits/hydropower_verify_final.zkey');
    this.vkeyPath = path.join(__dirname, '../../circuits/verification_key.json');

    if (!fs.existsSync(this.wasmPath)) {
      console.warn('[ZKP] Circuit not compiled. Run: npm run compile-circuits');
    }
  }

  /**
   * Generate a ZKP proof for a single verified reading.
   * @param {object} privateInputs  { flowRate, headHeight, efficiency }
   * @param {object} publicInputs   { powerCalculated, boundsMin, boundsMax }
   * @returns {object}  { proof, publicSignals, verified, proofJson }
   */
  async generateProof(privateInputs, publicInputs) {
    const input = {
      flowRate:        Math.round(privateInputs.flowRate * 100),
      headHeight:      Math.round(privateInputs.headHeight * 100),
      efficiency:      Math.round(privateInputs.efficiency * 100),
      powerCalculated: Math.round(publicInputs.powerCalculated),
      boundsMin:       Math.round(publicInputs.boundsMin),
      boundsMax:       Math.round(publicInputs.boundsMax)
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input, this.wasmPath, this.zkeyPath
    );

    const vkey     = JSON.parse(fs.readFileSync(this.vkeyPath));
    const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    if (!verified) {
      throw new Error('ZKP self-verification failed — inputs may be outside circuit constraints');
    }

    return {
      proof,
      publicSignals,
      verified,
      proofSystem: 'groth16',
      circuit:     'hydropower_verify_v1',
      publicInputs,
      proofJson:   JSON.stringify({ proof, publicSignals }, null, 2)
    };
  }

  async verifyProof(proof, publicSignals) {
    const vkey = JSON.parse(fs.readFileSync(this.vkeyPath));
    return snarkjs.groth16.verify(vkey, publicSignals, proof);
  }

  async generateBatchProofs(readings, bounds) {
    const results = [];
    for (const reading of readings) {
      try {
        const result = await this.generateProof(reading, bounds);
        results.push({ reading: reading.id, ...result, error: null });
      } catch (err) {
        results.push({ reading: reading.id, proof: null, error: err.message });
      }
    }
    return {
      total:   results.length,
      success: results.filter(r => r.verified).length,
      failed:  results.filter(r => r.error).length,
      results
    };
  }
}

module.exports = { ZKPProofGenerator };
```

### 4.4 Circuit Compilation Setup

```bash
# Full setup sequence (run once per circuit version):
npm install circom snarkjs

npx circom circuits/hydropower_verify.circom --r1cs --wasm --sym --output circuits/
snarkjs powersoftau new bn128 12 circuits/ptau/pot12_0000.ptau -v
snarkjs powersoftau contribute circuits/ptau/pot12_0000.ptau circuits/ptau/pot12_0001.ptau --name="Bikram Biswas" -v
snarkjs powersoftau prepare phase2 circuits/ptau/pot12_0001.ptau circuits/ptau/pot12_final.ptau -v
snarkjs groth16 setup circuits/hydropower_verify.r1cs circuits/ptau/pot12_final.ptau circuits/hydropower_verify_final.zkey
snarkjs zkey export verificationkey circuits/hydropower_verify_final.zkey circuits/verification_key.json

# Test with sample inputs:
node -e "
  const { ZKPProofGenerator } = require('./src/security/zkp-proof-generator');
  const gen = new ZKPProofGenerator();
  gen.generateProof(
    { flowRate: 12.5, headHeight: 45.0, efficiency: 0.87 },
    { powerCalculated: 4750, boundsMin: 3000, boundsMax: 6000 }
  ).then(r => {
    console.log('Proof verified:', r.verified);
    console.log('Proof size (bytes):', JSON.stringify(r.proof).length);
  });
"
# Expected: Proof verified: true | Proof size: ~1,200 bytes
```

### 4.5 ZKP API Endpoints

```javascript
// FILE: src/api/v1/zkp.js

const router = express.Router();
const { ZKPProofGenerator } = require('../../security/zkp-proof-generator');

// POST /api/v1/zkp/generate — Premium tier only
router.post('/generate', premiumTierAuth, async (req, res) => {
  const { privateInputs, publicInputs, plantId } = req.body;

  const plant = await db.query('SELECT tier FROM plants WHERE plant_id = $1', [plantId]);
  if (!['PREMIUM', 'ENTERPRISE'].includes(plant.rows[0].tier)) {
    return res.status(403).json({ error: 'ZKP requires Premium or Enterprise tier' });
  }

  const generator = new ZKPProofGenerator();
  const result    = await generator.generateProof(privateInputs, publicInputs);

  const proofHash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(result.proof))
    .digest('hex');

  await hcsLogger._submit({
    event:         'ZKP_PROOF_GENERATED',
    plantId,
    proofHash,
    publicInputs,
    timestamp:     new Date().toISOString()
  });

  return res.json({
    plantId,
    proofHash,
    proof:          result.proof,
    publicSignals:  result.publicSignals,
    verifyEndpoint: '/api/v1/zkp/verify'
  });
});

// POST /api/v1/zkp/verify — Public endpoint — anyone can verify
router.post('/verify', async (req, res) => {
  const { proof, publicSignals } = req.body;
  const generator = new ZKPProofGenerator();
  const verified  = await generator.verifyProof(proof, publicSignals);
  return res.json({ verified });
});

module.exports = router;
```

---

## 5. MONTHS 13–18 — ADAPTIVE ML PIPELINE (ADWIN — FULL PRODUCTION)

> **ADWIN TIMING NOTE:** Roadmap 1 Week 7 built a placeholder drift detector (`src/ml/adwin-detector.js`) using a fixed-threshold rolling window — adequate for early testnet validation. Roadmap 2 Month 6 shipped the **full production ADWIN** (Bifet & Gavalda, 2007) as a complete rewrite of that same file. By the time Roadmap 3 begins at Month 13, the full ADWIN implementation is already live in production. The code in §5.1 below is the **canonical reference copy** — it matches exactly what was deployed in Roadmap 2 Month 6. No further rewrite is required in Roadmap 3; this section documents the live implementation for audit and review purposes.

Reference: Bifet, A. & Gavalda, R. (2007). "Learning from Time-Changing Data with Adaptive Windowing." *Proceedings of the 2007 SIAM International Conference on Data Mining*, pp. 443–448.

### 5.1 ADWIN in JavaScript — Canonical Production Implementation

```javascript
// FILE: src/ml/adwin-detector.js
// ADWIN: Adaptive Windowing for streaming drift detection
// Reference: Bifet & Gavalda (2007)
// δ = 0.002 → 99.8% confidence before declaring drift
// STATUS: Live in production since Roadmap 2 Month 6.
// This is a reference copy — do not redeploy unless retraining is triggered.

class ADWINDetector {
  constructor(delta = 0.002, maxBuckets = 5) {
    this.delta       = delta;
    this.maxBuckets  = maxBuckets;
    this.buckets     = [];    // { total, variance, count }
    this.totalCount  = 0;
    this.totalSum    = 0;
    this.totalSumSq  = 0;
    this.driftCount  = 0;
    this.lastDriftAt = null;
  }

  update(value) {
    this._insertElement(value);
    this._compress();
    const drift = this._detectDrift();
    if (drift) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
    }
    return drift;
  }

  _insertElement(value) {
    this.buckets.unshift({ total: value, variance: 0, count: 1 });
    this.totalCount  += 1;
    this.totalSum    += value;
    this.totalSumSq  += value * value;
  }

  _compress() {
    const sizes = {};
    let i = 0;
    while (i < this.buckets.length - 1) {
      if (this.buckets[i].count === this.buckets[i + 1].count) {
        if (!sizes[this.buckets[i].count]) sizes[this.buckets[i].count] = 0;
        sizes[this.buckets[i].count]++;
        if (sizes[this.buckets[i].count] >= this.maxBuckets) {
          const merged = {
            total:    this.buckets[i].total + this.buckets[i + 1].total,
            variance: this.buckets[i].variance + this.buckets[i + 1].variance,
            count:    this.buckets[i].count + this.buckets[i + 1].count
          };
          this.buckets.splice(i, 2, merged);
          continue;
        }
      }
      i++;
    }
  }

  _detectDrift() {
    let n0 = 0, sum0 = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      n0   += this.buckets[i].count;
      sum0 += this.buckets[i].total;
      const n1   = this.totalCount - n0;
      const sum1 = this.totalSum   - sum0;
      if (n0 === 0 || n1 === 0) continue;

      const mean0 = sum0 / n0;
      const mean1 = sum1 / n1;
      const m     = 1 / n0 + 1 / n1;
      const dd    = Math.log(4 * this.totalCount / this.delta);
      const eCut  = Math.sqrt(m * dd / 2);

      if (Math.abs(mean0 - mean1) >= eCut) {
        this.buckets    = this.buckets.slice(0, i);
        this.totalCount = n0;
        this.totalSum   = sum0;
        return true;
      }
    }
    return false;
  }

  getStats() {
    return {
      windowSize:  this.totalCount,
      mean:        this.totalCount > 0 ? this.totalSum / this.totalCount : 0,
      driftCount:  this.driftCount,
      lastDriftAt: this.lastDriftAt,
      bucketCount: this.buckets.length
    };
  }

  reset() {
    this.buckets    = [];
    this.totalCount = 0;
    this.totalSum   = 0;
    this.totalSumSq = 0;
    this.driftCount = 0;
    this.lastDriftAt = null;
  }
}

module.exports = { ADWINDetector };
```

### 5.2 Wiring ADWIN into the Anomaly Detector

```javascript
// In src/anomaly-detector-ml.js constructor:
const { ADWINDetector } = require('./ml/adwin-detector');
this.adwin = new ADWINDetector(0.002);  // δ=0.002 → 99.8% confidence

// In the detect() method, after computing anomaly score:
const driftDetected = this.adwin.update(anomalyScore);

if (driftDetected) {
  await this.hcsLogger._submit({
    event:      'ADWIN_DRIFT_DETECTED',
    plantId:    reading.plantId,
    adwinStats: this.adwin.getStats(),
    action:     'SEASONAL_RETRAIN_QUEUED',
    timestamp:  Date.now()
  });
  await this._queueRetraining(reading.plantId);
}
```

### 5.3 Seasonal Model Retraining (Python — offline, triggered by ADWIN)

```python
# FILE: ml/train_seasonal_models.py
# Triggered by ADWIN drift event → job queue → this script
# NOT in the request path — runs as a background worker

import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib, json
from datetime import datetime

SEASONS = {
    'pre_monsoon':  (3, 5),     # March–May
    'monsoon':      (6, 9),     # June–September
    'post_monsoon': (10, 11),   # October–November
    'dry':          (12, 2)     # December–February
}

CONTAMINATION_RATES = {
    'pre_monsoon':  0.05,
    'monsoon':      0.12,  # higher — legitimate high-variability expected
    'post_monsoon': 0.06,
    'dry':          0.04
}

def get_season(month):
    for name, (start, end) in SEASONS.items():
        if start <= end:
            if start <= month <= end: return name
        else:
            if month >= start or month <= end: return name
    return 'dry'

def train_seasonal_model(plant_id: str, season: str, df: pd.DataFrame):
    features  = ['flow_rate', 'head_height', 'power_output',
                 'efficiency', 'temperature', 'turbidity']
    available = [f for f in features if f in df.columns]

    model = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION_RATES[season],
        random_state=42,
        n_jobs=-1
    )
    model.fit(df[available])

    model_path = f'ml/models/{plant_id}_{season}.joblib'
    joblib.dump(model, model_path)

    meta = {
        'plant_id':      plant_id,
        'season':        season,
        'trained_at':    datetime.now().isoformat(),
        'n_samples':     len(df),
        'features':      available,
        'contamination': CONTAMINATION_RATES[season]
    }
    with open(f'{model_path}.meta.json', 'w') as f:
        json.dump(meta, f, indent=2)

    print(f"✅ Trained {season} model for {plant_id}: {len(df)} samples → {model_path}")
    return model_path
```

---

## 6. MONTHS 18–28 — METHODOLOGY ROUTER & MULTI-ENERGY EXPANSION

### 6.1 Architecture Philosophy

My 5-layer verification engine is physics-based. Layer 1 contains the energy-type-specific formula. Layers 2–5 (Temporal, Environmental, ML, Device) are generic — they work for any continuous sensor stream. Expanding to solar, wind, and biomass is **an extension, not a rewrite**.

| Methodology | Energy Type | TAM Unlock |
|---|---|---|
| **ACM0002** | Hydropower | Existing — live |
| **AMS-I.D** | Solar PV | +$15–40B/yr |
| **AMS-I.F** | Wind | +$12–30B/yr |
| **AMS-I.C** | Biomass | +$5–15B/yr |

### 6.2 Methodology Router: `src/engine/methodology-router.js`

```javascript
// FILE: src/engine/methodology-router.js

const { HydroEngine  } = require('./hydro-engine');   // ACM0002 — existing
const { SolarEngine  } = require('./solar-engine');   // AMS-I.D — new
const { WindEngine   } = require('./wind-engine');    // AMS-I.F — new
// const { BiomassEngine } = require('./biomass-engine'); // AMS-I.C — Month 28

class MethodologyRouter {
  constructor(config) {
    this.engines = {
      'ACM0002':  new HydroEngine(config),
      'AMS-I.D':  new SolarEngine(config),
      'AMS-I.F':  new WindEngine(config),
    };
  }

  getEngine(methodology) {
    const engine = this.engines[methodology];
    if (!engine) {
      throw new Error(`Unknown methodology: ${methodology}. Supported: ${Object.keys(this.engines).join(', ')}`);
    }
    return engine;
  }

  async verifyReading(reading, methodology) {
    return this.getEngine(methodology).verifyReading(reading);
  }

  getSupportedMethodologies() { return Object.keys(this.engines); }
}

module.exports = { MethodologyRouter };
```

### 6.3 Solar Engine: `src/engine/solar-engine.js`

```javascript
// FILE: src/engine/solar-engine.js
// AMS-I.D: Grid-connected solar PV systems
// Physics: P = G × A × η_panel × PR × temp_derating

class SolarEngine {
  constructor(config) {
    this.config = config;
    this.MAX_IRRADIANCE    = 1200;  // W/m²
    this.MAX_PANEL_EFF     = 0.25;  // 25% max commercial efficiency (2026)
    this.MIN_PANEL_EFF     = 0.12;
    this.TEMPORAL_VARIANCE = 0.30;  // ±30% for solar (clouds)
  }

  verifyLayer1Physics(reading) {
    const { irradiance_W_m2, panel_area_m2, efficiency_pct,
            reported_power_kW, temperature_c = 25, dust_factor = 0.95 } = reading;

    if (irradiance_W_m2 > this.MAX_IRRADIANCE) {
      return { score: 0, passed: false, reason: `Irradiance ${irradiance_W_m2} exceeds max ${this.MAX_IRRADIANCE}` };
    }

    const tempDerating   = 1 - Math.max(0, (temperature_c - 25) * 0.004);
    const expectedPowerKW = (irradiance_W_m2 * panel_area_m2 * (efficiency_pct / 100) * dust_factor * tempDerating) / 1000;
    const deviation       = Math.abs(reported_power_kW - expectedPowerKW) / expectedPowerKW;

    return {
      score:      deviation < 0.05 ? 1.0 : deviation < 0.10 ? 0.85 : deviation < 0.15 ? 0.70 : 0.0,
      passed:     deviation < 0.15,
      expected:   expectedPowerKW.toFixed(2),
      reported:   reported_power_kW,
      deviation:  (deviation * 100).toFixed(2) + '%',
      methodology: 'AMS-I.D',
      equation:   'P = G × A × η × dust_factor × temp_derating'
    };
  }

  async verifyReading(reading) {
    const layer1 = this.verifyLayer1Physics(reading);
    return { layer1, methodology: 'AMS-I.D' };
  }
}

module.exports = { SolarEngine };
```

### 6.4 Wind Engine: `src/engine/wind-engine.js`

```javascript
// FILE: src/engine/wind-engine.js
// AMS-I.F: Grid-connected wind power
// Physics: P = 0.5 × ρ × A × v³ × Cp   (Betz limit: Cp_max = 0.593)

class WindEngine {
  constructor(config) {
    this.config = config;
    this.BETZ_LIMIT        = 0.593;  // Physics — Cp can NEVER exceed this
    this.AIR_DENSITY_SL    = 1.225;  // kg/m³ at sea level
    this.MAX_WIND_SPEED    = 25.0;   // m/s — cut-out speed
    this.MIN_WIND_SPEED    = 3.0;    // m/s — cut-in speed
    this.TEMPORAL_VARIANCE = 0.40;   // ±40% (highly variable)
  }

  verifyLayer1Physics(reading) {
    const { wind_speed_m_s, rotor_diameter_m,
            air_density_kg_m3 = 1.225, Cp = 0.40,
            reported_power_kW } = reading;

    if (Cp > this.BETZ_LIMIT) {
      return { score: 0, passed: false, reason: `Cp ${Cp} exceeds Betz limit 0.593 — physically impossible` };
    }

    if (wind_speed_m_s < this.MIN_WIND_SPEED || wind_speed_m_s > this.MAX_WIND_SPEED) {
      return { score: 0.3, passed: true, reason: `Wind speed ${wind_speed_m_s} outside generation range` };
    }

    const area           = Math.PI * Math.pow(rotor_diameter_m / 2, 2);
    const expectedPowerKW = (0.5 * air_density_kg_m3 * area * Math.pow(wind_speed_m_s, 3) * Cp) / 1000;
    const deviation       = Math.abs(reported_power_kW - expectedPowerKW) / expectedPowerKW;

    return {
      score:      deviation < 0.05 ? 1.0 : deviation < 0.15 ? 0.80 : deviation < 0.25 ? 0.60 : 0.0,
      passed:     deviation < 0.25,
      expected:   expectedPowerKW.toFixed(2),
      reported:   reported_power_kW,
      deviation:  (deviation * 100).toFixed(2) + '%',
      betzCheck:  'PASS',
      methodology: 'AMS-I.F',
      equation:   'P = 0.5 × ρ × A × v³ × Cp'
    };
  }

  async verifyReading(reading) {
    const layer1 = this.verifyLayer1Physics(reading);
    return { layer1, methodology: 'AMS-I.F' };
  }
}

module.exports = { WindEngine };
```

---

## 7. MONTHS 20–30 — ENTERPRISE SDK & MAINNET DEPLOYMENT

### 7.1 Enterprise SDK: `src/api/v2/enterprise-sdk.js`

> **DIDManager note:** `src/did/did-manager.js` was built in Roadmap 1 Week 6 and is used here for automated DID registration during fleet deployment. If the module path has changed, update the require path accordingly. Do not redeploy the DID module from scratch — it is already live.

```javascript
// FILE: src/api/v2/enterprise-sdk.js
// White-label enterprise API — one call deploys dMRV for an entire fleet.
// Requires enterprise license agreement + dedicated Railway instance.

const router = express.Router();

router.post('/deploy-fleet', enterpriseAuth, async (req, res) => {
  const { organizationId, plantConfigs, whitelabelConfig, slaLevel } = req.body;
  const deployedPlants = [];
  const errors         = [];

  for (const plantConfig of plantConfigs) {
    try {
      const { MethodologyRouter } = require('../../engine/methodology-router');
      new MethodologyRouter({}).getEngine(plantConfig.methodology);  // validate

      const plantId = `${organizationId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      await db.query(
        `INSERT INTO plants (plant_id, name, location, capacity_kw, methodology, operator_id, tier, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ENTERPRISE', NOW())`,
        [plantId, plantConfig.name, plantConfig.location,
         plantConfig.capacityKW, plantConfig.methodology, organizationId]
      );

      // DIDManager built in Roadmap 1 Week 6 — already live, no redeploy needed
      const { DIDManager } = require('../../did/did-manager');
      const did = await new DIDManager().registerBuyerDID({ name: plantConfig.name });
      await htsService.associateToken(did.accountId, process.env.MAINNET_HTS_TOKEN_ID);

      // Only call PlantRegistry.sol if contract is deployed (Month 17+)
      if (process.env.PLANT_REGISTRY_CONTRACT_ADDRESS) {
        await contractService.registerPlant(plantId, did.did, plantConfig.methodology,
          plantConfig.capacityKW, plantConfig.hcsTopicId);
      }

      if (whitelabelConfig?.webhookUrl) {
        await webhookService.register(plantId, whitelabelConfig.webhookUrl,
          ['HREC_MINTED', 'CLAIM_APPROVED', 'ANOMALY_FLAGGED', 'DRIFT_DETECTED']);
      }

      deployedPlants.push({
        plantId,
        hederaDID:  did.did,
        htsAccount: did.accountId,
        methodology: plantConfig.methodology,
        hashScan:   `https://hashscan.io/mainnet/account/${did.accountId}`
      });

    } catch (err) {
      errors.push({ plantId: plantConfig.plantId, error: err.message });
    }
  }

  return res.status(207).json({
    organizationId,
    slaLevel,
    totalDeployed: deployedPlants.length,
    failed:        errors.length,
    deployedPlants,
    errors,
    apiKey:        await apiKeyService.issue(organizationId, 'ENTERPRISE'),
    sdkDocs:       'https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/blob/main/docs/ENTERPRISE-SDK.md'
  });
});

router.get('/fleet/:orgId', enterpriseAuth, async (req, res) => {
  const plants = await db.query(
    `SELECT p.*, COUNT(t.id) AS total_readings_30d,
            SUM(t.energy_generated_kwh)/1000 AS mwh_30d,
            AVG(t.trust_score) AS avg_trust_30d
     FROM plants p
     LEFT JOIN telemetry_records t ON t.plant_id = p.plant_id
       AND t.timestamp > NOW() - INTERVAL '30 days'
     WHERE p.operator_id = $1 GROUP BY p.plant_id`,
    [req.params.orgId]
  );
  return res.json({ organizationId: req.params.orgId, totalPlants: plants.rows.length, plants: plants.rows });
});

module.exports = router;
```

### 7.2 Mainnet Go-Live Checklist

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MAINNET READINESS — ALL MUST BE TRUE BEFORE "LIVE" CLAIM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Infrastructure:
□ HCS topic active on mainnet — already done ✅
□ HTS token 0.0.7964264 active on testnet (mainnet token ID in .env.production)
□ PlantRegistry.sol  deployed → hashscan.io/mainnet/contract/<addr>
□ HRECMinter.sol     deployed → hashscan.io/mainnet/contract/<addr>
□ VerifierStaking.sol deployed → hashscan.io/mainnet/contract/<addr>
□ All 3 contract addresses recorded in .env.production

Security:
□ External contract audit complete (zero critical findings)
□ Multi-sig keys distributed to 5 authorized signers
□ Hardware wallet (Ledger) holding supplyKey for HTS token
□ Emergency pause function tested on testnet first

API:
□ v2 Enterprise SDK endpoints deployed to Railway production
□ Load test: 500 concurrent verifications handled without errors
□ Health check: /health returns 200 with all dependency statuses

Scale Simulation (Month 24):
□ 500 plants × 10,000 sensors simulated — targets met:
  □ Throughput ≥ 1 verification/second sustained
  □ Trust score accuracy ≥ 95% vs ground truth
  □ False positive rate < 5%
  □ HCS latency < 3s per message
  □ ADWIN false alarms < 2 in 24h
  □ ZKP proof time < 30s per proof

Documentation:
□ ENTERPRISE-SDK.md in /docs
□ All contract ABI files in /contracts/abi/
□ HashScan links for all 3 contracts in README.md
□ DEPLOYMENT.md with exact reproduction steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. MONTHS 24–36 — COMPLIANCE & ACCREDITATION

### 8.1 ISO 27001 — Information Security Certification

Target: Start Month 24, external audit Month 28–30. Required for enterprise buyers and government clients.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISO 27001 MANDATORY DOCUMENTS (Annex A compliance):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ docs/iso/INFORMATION-SECURITY-POLICY.md
  AES-256 at rest, TLS 1.3 in transit, JWT auth only

□ docs/iso/RISK-ASSESSMENT-REGISTER.xlsx
  Rows: data breach, HCS downtime, key theft, sensor tampering,
        Railway outage, Hedera network incident
  Columns: Likelihood (1-5), Impact (1-5), Mitigation, Residual Risk

□ docs/iso/ACCESS-CONTROL-POLICY.md
  Matrix: Operator / Buyer / Admin / Developer / Verifier
  Rules: RBAC via JWT, no shared credentials, 2FA on Railway/GitHub

□ docs/iso/INCIDENT-RESPONSE-PLAN.md
  P1 (30 min SLA): private key leaked, contract exploited
  P2 (4 hour SLA): API down, HCS lag > 10 minutes
  P3 (24 hour SLA): sensor offline, anomaly rate spike

□ docs/iso/BUSINESS-CONTINUITY-PLAN.md
  Hedera: Mirror nodes ensure continuity
  Railway: AWS Elastic Beanstalk as DR target
  Data: PostgreSQL point-in-time recovery, 7-day retention

□ docs/iso/SUPPLIER-SECURITY-ASSESSMENT.md
  Hedera (SOC2 Type II), Railway (SOC2), Vercel (SOC2),
  GitHub (SOC2), Redis (Railway-managed)

□ docs/iso/AUDIT-LOG-RETENTION-POLICY.md
  HCS: Permanent (immutable by construction) ✅
  PostgreSQL: 7 years | Railway logs: 90 days | API logs: 1 year

□ docs/iso/ENCRYPTION-STANDARDS.md
  DB: AES-256 PostgreSQL at rest (Railway-managed)
  Transit: TLS 1.3 enforced by Vercel/Railway
  Keys: Hedera private keys in env vars only — never in git history

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimated effort: 40–60 hours writing
External audit cost: $15,000–$30,000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 8.2 ISO 14064-2 — GHG Project Quantification

Required to sell credits into compliance markets (India CCTS, Singapore MAS, EU Article 6).

```
ISO 14064-2 SCOPE:
• Standard: ISO 14064-2:2019 — GHG emission reductions/removals
• Methodology: ACM0002 — renewable energy (hydropower)
• Emission factor: India grid CEA 2024 — 0.82 tCO2e/MWh

WHAT THE AUDITOR REVIEWS:
□ Monitoring plan — 5-layer engine measurement methodology
□ Calculation methodology — P = ρgQHη → MWh → tCO2e avoided
□ Uncertainty quantification — sensor error bounds, Layer 1 tolerance
□ Data quality management — HCS immutability, 7-year retention
□ Verification procedures — Guardian policy + multi-sig
□ Shadow mode accuracy — variance < 5% vs manual MRV

TIMELINE:
  Month 24: Start ISO 14064-2 documentation
  Month 27: Submit for external review
  Month 30: Certification expected
  Month 31: Submit to India CCTS as part of PDD
```

### 8.3 Verra VCS Formal Accreditation (Month 27–35)

Shadow mode data from Roadmap 2 (6 months, <5% variance) is the primary evidence for submission.

```
VERRA VCS SUBMISSION STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1 (Month 27): Submit dMRV system for VCS methodology approval
  Required:
  → Shadow mode report (6 months, average variance documented)
  → ISO 14064-2 certification
  → DOE (Designated Operational Entity) co-signature
  → PDD Section E: HCS links + HashScan TX evidence
  → VerificationEngine.sol external audit report

Step 2: Verra technical review (3–6 months)
  → Respond with HashScan evidence links
  → Guardian policy execution logs
  → 7-year HCS audit trail reference

Step 3: Conditional approval
  → First 1,000 credits issued under DOE supervision
  → DOE spot-checks 10% of verifications
  → Zero tolerance for trust score < 0.90 on spot-checked reading

Step 4: Full approval → credits tradeable on Verra registry
  → Opens compliance market ($50–100B/yr)
  → Premium pricing: $20–50/HREC vs current $10–15 voluntary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 8.4 India CCTS Enrollment (Month 28–33)

```
INDIA CCTS NEXT STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Month 28: Follow up on BEE review (submitted Roadmap 2, Month 4)
  → Attach ISO 14064-2 certification
  → Attach shadow mode results

Month 30: BEE methodology approval expected

Month 31: Enroll pilot plants as first India CCTS projects
  → Each plant files individual project registration
  → References approved PDD
  → Credits issued on India Carbon Exchange (ICX)

Month 33: First India compliance market credits sold
  → Price target: ₹500–2,000/tonne ($6–24)
  → Revenue channel active: per-retirement fee on ICX trades
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 8.5 3-Tier Pricing Model (Month 14–16)

| Tier | Monthly Price | Features | Target |
|---|---|---|---|
| **Basic** | $100/mo | Single sensor, standard ML, manual flag review | Small (<1 MW) plants |
| **Standard** | $300/mo | Multi-sensor redundancy, ADWIN ML, auto-approval | 1–5 MW projects |
| **Premium** | $500/mo | ZKP privacy, multi-sig, physical audit reports, ISO docs | 5–15 MW regulated |

### 8.6 Revenue Architecture at $1.23M ARR (Month 36 Target)

| Channel | Year 3 Target | How |
|---|---|---|
| Per-verification ($0.50) | $50K | 100K verifications/year |
| Retirement commission (1–5%) | $300K | $6M credits retired × 5% |
| Subscriptions ($100–500/mo) | $480K | 100 plants × avg $400/mo × 12 |
| Enterprise licenses ($50–500K) | $400K | 2 enterprise deals @ $200K avg |
| **TOTAL** | **$1.23M** | |

---

## 9. ROADMAP 3 COMPLETION CRITERIA

Roadmap 3 is complete when every item below is proven with code, HashScan links, or external certificates — not claims.

| Component | Done When |
|---|---|
| VerifierStakingManager.js | Tests pass, slash events logged to HCS |
| VerifierStaking.sol | Deployed to HSCS testnet (M15), Hardhat tests >90% coverage |
| HRECMinter.sol | Deployed to HSCS mainnet (M17), minted for 1 real reading via contract |
| PlantRegistry.sol | 1+ real plants registered on-chain with HashScan link |
| ZKP circuit | Proof generated + verified for 1 real sample reading |
| ADWINDetector | Running on live stream since Roadmap 2 M6, drift events visible on HCS |
| Methodology router | ACM0002 + AMS-I.D (solar) + AMS-I.F (wind) working end-to-end |
| Seasonal ML models | 4 season-specific IsolationForest models trained + deployed |
| Enterprise fleet SDK | 5+ plants deployed via `/api/v2/enterprise/deploy-fleet` |
| Month 24 scale test | 500 plants, 10k sensors, all targets met or documented |
| ISO 27001 docs | All 8 Annex A documents complete, audit submitted |
| ISO 14064-2 | Certification received |
| Verra VCS | Conditional approval — first 1,000 credits issued |
| India CCTS | Pilot plants enrolled on India Carbon Exchange |

---

## 10. MILESTONE SUMMARY TABLE

| Month | Code Deliverable | Infrastructure | Compliance |
|---|---|---|---|
| **13** | verifier-staking.js + DB migration | Off-chain governance bridge | Verra follow-up |
| **14** | VerifierStaking.sol written + tests | Hardhat + HSCS testnet config | ISO 27001 docs start |
| **15** | HRECMinter.sol + PlantRegistry.sol | 3 contracts on HSCS **testnet** | ISO 27001 risk register |
| **16** | zkp-proof-generator.js + circuit | circuits/hydropower_verify.circom compiled | ISO 27001 incident response |
| **17** | ZKP API endpoints live | 3 contracts on HSCS **mainnet** (post external audit, zero criticals) | ISO 27001 docs complete |
| **18** | methodology-router.js skeleton | Scale simulation test v1 | ISO 27001 external audit submitted |
| **19** | solar-engine.js (AMS-I.D) | Solar engine on testnet | — |
| **20** | wind-engine.js (AMS-I.F) | Wind engine on testnet | ISO 14064-2 docs start |
| **21** | enterprise-sdk.js /deploy-fleet | Enterprise SDK on mainnet | — |
| **22** | Enterprise webhooks + portfolio API | First enterprise demo | — |
| **24** | scale-simulation.js (500 plants) | Scale test passes | ISO 27001 certification expected |
| **26** | Biomass engine (AMS-I.C) skeleton | 4 methodologies on mainnet | ISO 14064-2 submitted |
| **27** | Shadow mode Verra report generated | — | Verra formal submission |
| **28** | Seasonal ML retraining pipeline | — | BEE India CCTS follow-up |
| **30** | v2.0.0 enterprise release tag | All contracts production-verified | ISO 14064-2 certification |
| **31** | /docs/verra/ submission package | — | Verra conditional approval |
| **33** | India ICX integration endpoint | — | India CCTS credits live |
| **35** | Full compliance automation | — | Verra full approval |
| **36** | v3.0.0 mainnet release | 100+ plants, 4 methodologies | All certifications active |

---

*This is a technical and regulatory execution plan — not a business deck. Every code block is something I am building and can demonstrate. Nothing here is a promise about revenue, investors, or regulatory outcomes. Those depend on work that comes after the tech is solid.*

*Author: Bikram Biswas | Repo: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-) | Version: **V4.2 — MERGED** | March 25, 2026*
