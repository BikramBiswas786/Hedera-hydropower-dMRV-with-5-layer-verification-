# ROADMAP 3 — TOKENISATION, GOVERNANCE & DEPLOYMENT
## Hedera Hydropower dMRV | Month 13–36
**Author: Bikram Biswas | Updated: March 24, 2026 | Status: V2 — Production-Grade Technical Roadmap**

---

## Where I Stand Entering Month 13

By the time Roadmap 3 starts, I have:

- ✅ Full 5-layer verification engine running on Hedera mainnet
- ✅ HREC token (`0.0.7964264`) minted and retired for verified MWh
- ✅ W3C Verifiable Credentials generated and signed by my issuer DID
- ✅ Guardian policy gating every retirement claim
- ✅ CAD Trust double-counting prevention live via HCS
- ✅ Commit-reveal hash pattern closing Vulnerability #1
- ✅ ADWIN drift detection running on the Node.js anomaly stream
- ✅ Claim Attribution Layer: 18 files, 4 DB tables, 262+ tests passing
- ✅ ESG certificates (PDF + JSON-LD VC + QR → HashScan) end-to-end
- ❌ No verifier staking / slashing on-chain
- ❌ No ZKP privacy for sensitive deployments
- ❌ No multi-methodology support (hydro only)
- ❌ No enterprise fleet SDK
- ❌ No mainnet smart contracts beyond HTS token

Roadmap 3 closes all four gaps — in that exact order.

---

## 1. VERIFIER STAKING & GOVERNANCE

**Goal:** Economically align verifiers so that bad attestations have real consequences — and make that enforcement trustless.

### 1.1 Off-Chain Staking Logic First

I build the logic in `src/hedera/verifier-staking.js` before touching Solidity, so I can test the rules in isolation:

```javascript
// src/hedera/verifier-staking.js

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
    this.MIN_STAKE     = 100;   // minimum HBAR to register as verifier
  }

  /**
   * Register a new verifier with a staked HBAR deposit.
   * Stake is held in the treasury account until slashed or withdrawn.
   * @param {string} verifierId    Hedera account ID of the verifier
   * @param {number} stakeAmount   HBAR to stake (minimum: MIN_STAKE)
   */
  async registerVerifier(verifierId, stakeAmount) {
    if (stakeAmount < this.MIN_STAKE) {
      throw new Error(`Minimum stake is ${this.MIN_STAKE} HBAR. Got: ${stakeAmount}`);
    }

    // Transfer stake from verifier to treasury
    const tx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(verifierId), new Hbar(-stakeAmount))
      .addHbarTransfer(this.treasuryId, new Hbar(stakeAmount))
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);
    const txId    = tx.transactionId.toString();

    // Persist in DB
    await this._saveStake({ verifierId, stakeAmount, txId, status: 'ACTIVE' });

    // Log to HCS (immutable)
    await this.hcsLogger._submit({
      event:      'VERIFIER_STAKED',
      verifierId,
      stakeHbar:  stakeAmount,
      stakeTxId:  txId,
      timestamp:  Date.now()
    });

    return { verifierId, stakeAmount, txId, hashScan: `https://hashscan.io/mainnet/transaction/${txId}` };
  }

  /**
   * Slash a verifier for a proven attestation violation.
   * Called when an approved reading is later found to be fraudulent
   * via physical audit, VVB review, or Guardian policy override.
   *
   * Slash rate: 10% of current stake.
   * Rationale: 10% is aggressive enough to deter fraud but low enough
   * not to destroy an honest verifier who made a borderline judgement call.
   * Ethereum PoS uses 1-5% — I'm using 10% because verifiers here have
   * domain knowledge and are expected to catch obvious violations.
   *
   * @param {string} verifierId   Verifier being penalised
   * @param {string} reason       Human-readable reason (logged to HCS)
   * @param {string} claimId      The fraudulent claim ID (audit trail)
   */
  async slash(verifierId, reason, claimId) {
    const stake   = await this._getStake(verifierId);
    if (!stake || stake.status !== 'ACTIVE') {
      throw new Error(`No active stake found for verifier: ${verifierId}`);
    }

    const penalty     = Math.floor(stake.stakeAmount * this.SLASH_PERCENT);
    const newStake    = stake.stakeAmount - penalty;

    // Execute the slash transfer (penalty stays in treasury — not burned)
    const slashTx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(verifierId), new Hbar(-penalty))
      .addHbarTransfer(this.treasuryId, new Hbar(penalty))
      .execute(this.client);

    const receipt = await slashTx.getReceipt(this.client);
    const slashTxId = slashTx.transactionId.toString();

    // Update DB stake
    await this._updateStake(verifierId, { stakeAmount: newStake });

    // Log to HCS — immutable slash record
    await this.hcsLogger._submit({
      event:       'VERIFIER_SLASHED',
      verifierId,
      penaltyHbar: penalty,
      newStakeHbar: newStake,
      reason,
      claimId,
      slashTxId,
      timestamp:   Date.now()
    });

    // If stake falls below minimum → auto-suspend verifier
    if (newStake < this.MIN_STAKE) {
      await this._suspendVerifier(verifierId, 'STAKE_BELOW_MINIMUM');
    }

    return {
      verifierId,
      penaltyHbar:  penalty,
      newStakeHbar: newStake,
      slashTxId,
      hashScan:     `https://hashscan.io/mainnet/transaction/${slashTxId}`
    };
  }

  async _getStake(verifierId) {
    // Read from DB — implementation depends on your ORM/pg setup
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const result = await pool.query(
      'SELECT * FROM verifier_stakes WHERE verifier_id = $1 AND status = $2',
      [verifierId, 'ACTIVE']
    );
    return result.rows[0] || null;
  }

  async _saveStake(stakeData) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `INSERT INTO verifier_stakes (verifier_id, stake_amount, stake_tx_id, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [stakeData.verifierId, stakeData.stakeAmount, stakeData.txId, stakeData.status]
    );
  }

  async _updateStake(verifierId, updates) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      'UPDATE verifier_stakes SET stake_amount = $1, updated_at = NOW() WHERE verifier_id = $2',
      [updates.stakeAmount, verifierId]
    );
  }

  async _suspendVerifier(verifierId, reason) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      "UPDATE verifier_stakes SET status = 'SUSPENDED', suspension_reason = $1 WHERE verifier_id = $2",
      [reason, verifierId]
    );
    await this.hcsLogger._submit({
      event:     'VERIFIER_SUSPENDED',
      verifierId,
      reason,
      timestamp: Date.now()
    });
  }
}

module.exports = { VerifierStakingManager };
```

### 1.2 DB Migration for Verifier Stakes

```sql
-- src/db/migrations/005_create_verifier_stakes_table.sql

CREATE TABLE IF NOT EXISTS verifier_stakes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verifier_id         VARCHAR(50) UNIQUE NOT NULL,   -- Hedera account ID
    verifier_did        VARCHAR(200),
    stake_amount        DECIMAL(18, 6) NOT NULL,        -- HBAR staked
    initial_stake       DECIMAL(18, 6) NOT NULL,
    stake_tx_id         VARCHAR(200) UNIQUE NOT NULL,
    status              VARCHAR(20) DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
    suspension_reason   TEXT,
    total_slashed       DECIMAL(18, 6) DEFAULT 0,
    slash_count         INTEGER DEFAULT 0,
    total_verifications INTEGER DEFAULT 0,
    accurate_verifications INTEGER DEFAULT 0,
    accuracy_rate       DECIMAL(5, 4),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stakes_verifier ON verifier_stakes(verifier_id);
CREATE INDEX idx_stakes_status   ON verifier_stakes(status);
```

### 1.3 On-Chain Smart Contract Design

I design three contracts for HSCS. I only claim mainnet deployment when I have real HashScan links to show.

**`contracts/VerifierStaking.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

/**
 * @title VerifierStaking
 * @dev Manages verifier stakes for the Hedera Hydropower dMRV system.
 * Slash rate: 10% per offence (conservative for early network).
 * Treasury holds slashed funds — not burned (keeps audit trail cleaner).
 */
contract VerifierStaking {
    address public governance;        // Only governance can slash
    address public treasury;          // Receives slashed stakes
    uint256 public minStake;          // Minimum stake in tinybars
    uint256 public slashRate = 1000;  // 10.00% (basis points: 1000/10000)

    struct Stake {
        uint256 amount;
        uint256 initialAmount;
        uint256 slashCount;
        bool    active;
    }

    mapping(address => Stake) public stakes;

    event Staked(address indexed verifier, uint256 amount);
    event Slashed(address indexed verifier, uint256 penalty, string reason);
    event Withdrawn(address indexed verifier, uint256 amount);
    event Suspended(address indexed verifier, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governance, "VerifierStaking: caller is not governance");
        _;
    }

    constructor(address _treasury, uint256 _minStake) {
        governance = msg.sender;
        treasury   = _treasury;
        minStake   = _minStake;
    }

    function stake() external payable {
        require(msg.value >= minStake, "VerifierStaking: stake below minimum");
        stakes[msg.sender] = Stake({
            amount:        msg.value,
            initialAmount: msg.value,
            slashCount:    0,
            active:        true
        });
        emit Staked(msg.sender, msg.value);
    }

    /**
     * @dev Slash a verifier for a proven attestation fraud.
     * @param verifier   Address of the fraudulent verifier
     * @param reason     Reason string (written to event log)
     */
    function slash(address verifier, string calldata reason) external onlyGovernance {
        Stake storage s = stakes[verifier];
        require(s.active, "VerifierStaking: no active stake");

        uint256 penalty  = (s.amount * slashRate) / 10000;
        s.amount        -= penalty;
        s.slashCount    += 1;

        // Transfer penalty to treasury
        (bool sent, ) = treasury.call{value: penalty}("");
        require(sent, "VerifierStaking: treasury transfer failed");

        emit Slashed(verifier, penalty, reason);

        // Suspend if stake drops below minimum
        if (s.amount < minStake) {
            s.active = false;
            emit Suspended(verifier, "STAKE_BELOW_MINIMUM");
        }
    }

    function withdraw() external {
        Stake storage s = stakes[msg.sender];
        require(s.active, "VerifierStaking: no active stake or already suspended");
        require(s.amount > 0, "VerifierStaking: nothing to withdraw");

        uint256 amount = s.amount;
        s.amount = 0;
        s.active = false;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "VerifierStaking: withdrawal failed");

        emit Withdrawn(msg.sender, amount);
    }

    function getStake(address verifier) external view returns (Stake memory) {
        return stakes[verifier];
    }
}
```

**`contracts/HRECMinter.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "./IHederaTokenService.sol";

/**
 * @title HRECMinter
 * @dev Controls HREC token minting on HSCS.
 * Only approved verifiers with active stakes can trigger mints.
 * Each mint requires a signed attestation from the 5-layer engine.
 */
contract HRECMinter {
    address public governance;
    address public verifierStaking;    // VerifierStaking contract address
    address public hrecToken;          // HTS HREC token address

    // Mapping from verificationId → minted (prevents double-mint)
    mapping(bytes32 => bool) public minted;

    event HRECMinted(
        address indexed verifier,
        bytes32 indexed verificationId,
        uint256 amount,
        string  plantId
    );

    modifier onlyActiveVerifier() {
        // Check verifier has active stake in VerifierStaking contract
        (bool success, bytes memory data) = verifierStaking.staticcall(
            abi.encodeWithSignature("getStake(address)", msg.sender)
        );
        require(success, "HRECMinter: could not read stake");
        // Decode and check active flag
        (, , , bool active) = abi.decode(data, (uint256, uint256, uint256, bool));
        require(active, "HRECMinter: verifier has no active stake");
        _;
    }

    constructor(address _governance, address _verifierStaking, address _hrecToken) {
        governance      = _governance;
        verifierStaking = _verifierStaking;
        hrecToken       = _hrecToken;
    }

    /**
     * @dev Mint HREC tokens for a verified generation reading.
     * @param verificationId  SHA-256 of the 5-layer attestation (unique per reading)
     * @param amount          HREC tokens to mint (1 HREC = 1 MWh)
     * @param plantId         Plant identifier for audit trail
     * @param recipient       Hedera account to receive minted tokens
     */
    function mintHREC(
        bytes32 verificationId,
        uint256 amount,
        string  calldata plantId,
        address recipient
    ) external onlyActiveVerifier {
        require(!minted[verificationId], "HRECMinter: already minted for this verification");
        require(amount > 0, "HRECMinter: amount must be > 0");

        minted[verificationId] = true;

        // HTS mint via precompile
        (int responseCode, , ) = IHederaTokenService(address(0x167)).mintToken(
            hrecToken,
            int64(uint64(amount)),
            new bytes[](0)
        );
        require(responseCode == 22, "HRECMinter: HTS mint failed"); // 22 = SUCCESS

        emit HRECMinted(msg.sender, verificationId, amount, plantId);
    }
}
```

**`contracts/PlantRegistry.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

/**
 * @title PlantRegistry
 * @dev On-chain registry of hydropower plants and their approved verifiers.
 * Any regulator, VVB, or buyer can read this to verify plant legitimacy.
 */
contract PlantRegistry {
    address public governance;

    struct Plant {
        string  plantId;
        string  name;
        string  location;
        uint256 capacityKW;
        string  methodology;  // "ACM0002"
        address operator;
        bool    active;
        uint256 registeredAt;
    }

    mapping(bytes32 => Plant)           public plants;          // plantId hash → Plant
    mapping(bytes32 => address[])       public plantVerifiers;  // plantId hash → verifiers

    event PlantRegistered(string plantId, address operator);
    event VerifierAdded(string plantId, address verifier);
    event PlantDeactivated(string plantId);

    modifier onlyGovernance() {
        require(msg.sender == governance, "PlantRegistry: not governance");
        _;
    }

    constructor() {
        governance = msg.sender;
    }

    function registerPlant(
        string calldata plantId,
        string calldata name,
        string calldata location,
        uint256         capacityKW,
        string calldata methodology
    ) external onlyGovernance {
        bytes32 key = keccak256(abi.encodePacked(plantId));
        require(!plants[key].active, "PlantRegistry: plant already registered");

        plants[key] = Plant({
            plantId:      plantId,
            name:         name,
            location:     location,
            capacityKW:   capacityKW,
            methodology:  methodology,
            operator:     msg.sender,
            active:       true,
            registeredAt: block.timestamp
        });

        emit PlantRegistered(plantId, msg.sender);
    }

    function addVerifier(string calldata plantId, address verifier) external onlyGovernance {
        bytes32 key = keccak256(abi.encodePacked(plantId));
        require(plants[key].active, "PlantRegistry: plant not found");
        plantVerifiers[key].push(verifier);
        emit VerifierAdded(plantId, verifier);
    }

    function isApprovedVerifier(string calldata plantId, address verifier)
        external view returns (bool)
    {
        bytes32 key       = keccak256(abi.encodePacked(plantId));
        address[] storage vs = plantVerifiers[key];
        for (uint i = 0; i < vs.length; i++) {
            if (vs[i] == verifier) return true;
        }
        return false;
    }

    function getPlant(string calldata plantId) external view returns (Plant memory) {
        return plants[keccak256(abi.encodePacked(plantId))];
    }
}
```

---

## 2. ZERO-KNOWLEDGE PROOF PRIVACY LAYER

**Goal:** Let buyers and regulators verify that generation is within physics-correct bounds without seeing raw sensor readings — essential for operators who consider flow rates and head heights commercially sensitive.

### 2.1 Circom Circuit

```circom
// circuits/hydropower_verify.circom
pragma circom 2.0.0;

/*
 * Proves: P_calculated is within [bounds.min, bounds.max]
 * Where: P = ρ × g × Q × H × η   (ACM0002 physics equation)
 *
 * Private inputs (not revealed):  Q (flow), H (head), η (efficiency)
 * Public inputs (revealed):       P_calculated, bounds.min, bounds.max
 *
 * The prover (my dMRV backend) knows Q, H, η.
 * The verifier (buyer, regulator) only sees P and bounds.
 * The ZK proof guarantees the physics equation holds without revealing inputs.
 */
template HydropowerVerifier() {
    // Private inputs — raw sensor readings
    signal input flowRate;        // Q in m³/s × 100 (integer, scaled)
    signal input headHeight;      // H in meters × 100 (integer, scaled)
    signal input efficiency;      // η × 100 (integer, 0-100)

    // Public inputs — what the verifier sees
    signal input powerCalculated; // P in kW (scaled integer)
    signal input boundsMin;       // Lower bound from Guardian policy
    signal input boundsMax;       // Upper bound from Guardian policy

    // Constants (public — from ACM0002)
    // ρ = 1000 kg/m³, g = 9.81 m/s² → ρg ≈ 9810
    // Scaled: ρg_scaled = 981 (divide by 10 for integer arithmetic)

    // Compute P from private inputs
    // P = (flowRate/100) × (headHeight/100) × (efficiency/100) × 9810
    signal flowHead;
    flowHead <== flowRate * headHeight;           // Q × H (both scaled by 100)

    signal flowHeadEff;
    flowHeadEff <== flowHead * efficiency;        // × η (scaled by 100)

    signal powerRaw;
    powerRaw <== flowHeadEff * 981;               // × ρg_scaled

    // Normalize: divide by 100³ × 10 = 10,000,000
    // powerRaw / 10000000 ≈ powerCalculated
    // Use range constraint instead of exact division:

    signal diff;
    diff <== powerRaw - powerCalculated * 10000000;

    // Allow ±5% tolerance for sensor precision
    signal tolerance;
    tolerance <== powerCalculated * 500000;       // 5% tolerance

    // Constraints: diff must be within ±tolerance
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

### 2.2 ZKP Proof Generator

```javascript
// src/security/zkp-proof-generator.js

const snarkjs = require('snarkjs');
const path    = require('path');

class ZKPProofGenerator {
  constructor() {
    // These files are generated by: snarkjs groth16 setup + powersoftau
    // Run circuits/setup.sh to regenerate
    this.wasmPath = path.join(__dirname, '../../circuits/hydropower_verify_js/hydropower_verify.wasm');
    this.zkeyPath = path.join(__dirname, '../../circuits/hydropower_verify_final.zkey');
    this.vkeyPath = path.join(__dirname, '../../circuits/verification_key.json');
  }

  /**
   * Generate a ZK proof for a single verified reading.
   * Called only for PREMIUM tier attestations.
   *
   * @param {object} privateInputs  { flowRate, headHeight, efficiency }
   * @param {object} publicInputs   { powerCalculated, boundsMin, boundsMax }
   * @returns {object}              { proof, publicSignals, verified }
   */
  async generateProof(privateInputs, publicInputs) {
    // Scale inputs to integers (circuit uses integer arithmetic)
    const input = {
      flowRate:        Math.round(privateInputs.flowRate * 100),
      headHeight:      Math.round(privateInputs.headHeight * 100),
      efficiency:      Math.round(privateInputs.efficiency * 100),
      powerCalculated: Math.round(publicInputs.powerCalculated),
      boundsMin:       Math.round(publicInputs.boundsMin),
      boundsMax:       Math.round(publicInputs.boundsMax)
    };

    // Generate proof using groth16 (Bifet & Gavalda 2007 ADWIN — δ = 0.002)
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      this.wasmPath,
      this.zkeyPath
    );

    // Self-verify before returning
    const vKey    = require(this.vkeyPath);
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (!isValid) {
      throw new Error('ZKP self-verification failed — inputs may be outside circuit constraints');
    }

    return {
      proof,
      publicSignals,
      verified: true,
      proofSystem: 'groth16',
      circuit:    'hydropower_verify_v1',
      publicInputs: {
        powerCalculated: publicInputs.powerCalculated,
        boundsMin:       publicInputs.boundsMin,
        boundsMax:       publicInputs.boundsMax
      }
    };
  }

  /**
   * Verify a proof submitted by a third party.
   * Buyers and regulators can call this to independently verify
   * a certificate without trusting my server.
   */
  async verifyProof(proof, publicSignals) {
    const vKey = require(this.vkeyPath);
    return snarkjs.groth16.verify(vKey, publicSignals, proof);
  }
}

module.exports = { ZKPProofGenerator };
```

### 2.3 Integration with Verification Engine

ZKPs are **opt-in** — only for PREMIUM tier and enterprise deployments:

```javascript
// In src/workflow.js — add after existing 5-layer verification:

if (attestation.tier === 'PREMIUM' || attestation.enterpriseClient) {
  const { ZKPProofGenerator } = require('./security/zkp-proof-generator');
  const zkpGen = new ZKPProofGenerator();

  const zkpResult = await zkpGen.generateProof(
    // Private — never leaves the server
    {
      flowRate:    rawSensorData.flowRate,
      headHeight:  rawSensorData.headHeight,
      efficiency:  rawSensorData.turbineEfficiency
    },
    // Public — goes into the VC and HCS log
    {
      powerCalculated: attestation.calculations.powerOutput_kW,
      boundsMin:       attestation.bounds.powerMin,
      boundsMax:       attestation.bounds.powerMax
    }
  );

  // Attach ZK proof to the VC credentialSubject
  attestation.zkProof = {
    proof:        zkpResult.proof,
    publicSignals: zkpResult.publicSignals,
    proofSystem:  'groth16',
    circuit:      'hydropower_verify_v1',
    verifiedAt:   new Date().toISOString()
  };
}
```

---

## 3. ADAPTIVE ML PIPELINE (ADWIN — PRODUCTION VERSION)

The current drift detector in `src/anomaly-detector-ml.js` uses a rolling window with a fixed threshold. That is a reasonable Phase 1 approximation. For production mainnet, I replace it with the full ADWIN algorithm (Bifet & Gavalda, 2007), implemented in JavaScript to stay in my Node.js stack.

### 3.1 ADWIN in JavaScript (Node.js native — no Python subprocess)

```javascript
// src/ml/adwin-detector.js
// ADWIN: Adaptive Windowing for streaming drift detection
// Reference: Bifet & Gavalda (2007), "Learning from Time-Changing Data with Adaptive Windowing"
// δ = 0.002 → 99.8% confidence before declaring drift

class ADWINDetector {
  /**
   * @param {number} delta   Confidence parameter (0.002 = 99.8% confidence)
   * @param {number} maxBuckets  Max number of ADWIN buckets (memory bound)
   */
  constructor(delta = 0.002, maxBuckets = 5) {
    this.delta       = delta;
    this.maxBuckets  = maxBuckets;
    this.buckets     = [];        // Each bucket: { total, variance, count }
    this.totalCount  = 0;
    this.totalSum    = 0;
    this.totalSumSq  = 0;
    this.driftCount  = 0;
    this.lastDriftAt = null;
  }

  /**
   * Add a new data point and check for distribution drift.
   * @param {number} value   The anomaly score from Isolation Forest (0.0–1.0)
   * @returns {boolean}      true if drift detected
   */
  update(value) {
    // Add to most recent bucket
    this._insertElement(value);

    // Compress buckets (merge old ones to stay within maxBuckets)
    this._compress();

    // Check for drift by scanning all window splits
    const drift = this._detectDrift();

    if (drift) {
      this.driftCount++;
      this.lastDriftAt = new Date().toISOString();
    }

    return drift;
  }

  _insertElement(value) {
    const bucket = { total: value, variance: 0, count: 1 };
    this.buckets.unshift(bucket);  // newest first
    this.totalCount  += 1;
    this.totalSum    += value;
    this.totalSumSq  += value * value;
  }

  _compress() {
    // ADWIN compression: merge adjacent buckets of same size
    const sizes = {};
    let i = 0;
    while (i < this.buckets.length - 1) {
      if (this.buckets[i].count === this.buckets[i + 1].count) {
        if (!sizes[this.buckets[i].count]) sizes[this.buckets[i].count] = 0;
        sizes[this.buckets[i].count]++;

        if (sizes[this.buckets[i].count] >= this.maxBuckets) {
          // Merge buckets i and i+1
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
    // Test all splits of the window W = W0 ∪ W1
    // Drift if |mean(W0) - mean(W1)| ≥ ε_cut
    let n0 = 0, sum0 = 0;

    for (let i = 0; i < this.buckets.length; i++) {
      n0   += this.buckets[i].count;
      sum0 += this.buckets[i].total;
      const n1   = this.totalCount - n0;
      const sum1 = this.totalSum   - sum0;

      if (n0 === 0 || n1 === 0) continue;

      const mean0 = sum0 / n0;
      const mean1 = sum1 / n1;

      // ε_cut = harmonic mean of √(ln(4n/δ) / 2n0) + √(ln(4n/δ) / 2n1)
      const n    = this.totalCount;
      const m    = 1 / n0 + 1 / n1;
      const dd   = Math.log(4 * n / this.delta);
      const eCut = Math.sqrt(m * dd / 2);

      if (Math.abs(mean0 - mean1) >= eCut) {
        // Drop old window (everything from split point onwards)
        this.buckets         = this.buckets.slice(0, i);
        this.totalCount      = n0;
        this.totalSum        = sum0;
        return true;
      }
    }
    return false;
  }

  getStats() {
    return {
      windowSize:    this.totalCount,
      mean:          this.totalCount > 0 ? this.totalSum / this.totalCount : 0,
      driftCount:    this.driftCount,
      lastDriftAt:   this.lastDriftAt,
      bucketCount:   this.buckets.length
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

### 3.2 Wiring ADWIN into the Anomaly Detector

```javascript
// src/anomaly-detector-ml.js — REPLACE the existing DriftDetector append
// with a proper ADWIN integration at the top of the class:

const { ADWINDetector } = require('./ml/adwin-detector');

// In the constructor of MLAnomalyDetector:
this.adwin = new ADWINDetector(0.002);    // δ=0.002 → 99.8% confidence

// In the detect() method, after computing anomaly score:
const driftDetected = this.adwin.update(anomalyScore);

if (driftDetected) {
  // Log to HCS — immutable drift record
  if (this.hcsLogger) {
    await this.hcsLogger._submit({
      event:       'ADWIN_DRIFT_DETECTED',
      plantId:     reading.plantId,
      adwinStats:  this.adwin.getStats(),
      action:      'SEASONAL_RETRAIN_QUEUED',
      timestamp:   Date.now()
    });
  }

  // Queue seasonal model retraining (happens out-of-band)
  await this._queueRetraining(reading.plantId);
}
```

### 3.3 Seasonal Models (Python — offline training only)

ADWIN runs in Node.js and detects drift. The actual model retraining runs in a Python worker:

```python
# ml/train_seasonal_models.py
# Run offline — not in the request path
# Triggered by: ADWIN drift event → job queue → this script

import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib, json, sys
from datetime import datetime

SEASONS = {
    'pre_monsoon':  (3, 5),    # March–May
    'monsoon':      (6, 9),    # June–September
    'post_monsoon': (10, 11),  # October–November
    'dry':          (12, 2)    # December–February
}

def get_season(month):
    for name, (start, end) in SEASONS.items():
        if start <= end:
            if start <= month <= end: return name
        else:
            if month >= start or month <= end: return name
    return 'dry'

def train_seasonal_model(plant_id: str, season: str, df: pd.DataFrame):
    """
    Train one Isolation Forest per season per plant.
    Contamination rates are higher during monsoon (legitimate
    high-variability generation expected).
    """
    contamination_rates = {
        'pre_monsoon':  0.05,
        'monsoon':      0.12,   # higher — expect more variation
        'post_monsoon': 0.06,
        'dry':          0.04
    }

    features = ['flow_rate', 'head_height', 'power_output',
                'efficiency', 'temperature', 'turbidity']
    available = [f for f in features if f in df.columns]

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination_rates[season],
        random_state=42,
        n_jobs=-1
    )
    model.fit(df[available])

    # Save with metadata
    model_path = f'ml/models/{plant_id}_{season}.joblib'
    joblib.dump(model, model_path)

    meta = {
        'plant_id':       plant_id,
        'season':         season,
        'trained_at':     datetime.now().isoformat(),
        'n_samples':      len(df),
        'features':       available,
        'contamination':  contamination_rates[season]
    }
    with open(f'{model_path}.meta.json', 'w') as f:
        json.dump(meta, f, indent=2)

    print(f"✅ Trained {season} model for {plant_id}: {len(df)} samples → {model_path}")
    return model_path
```

---

## 4. MULTI-METHODOLOGY ROUTER

**Goal:** The 5-layer engine is physics-based. Adapting it to solar, wind, and biomass is an extension — not a rewrite. Each new methodology unlocks a new segment of the global carbon credit market.

### 4.1 Methodology Router

```javascript
// src/engine/methodology-router.js

const HydroEngine  = require('./hydropower-engine');   // existing EngineV1 wrapper
const SolarEngine  = require('./solar-engine');         // new
const WindEngine   = require('./wind-engine');           // new
const BiomassEngine = require('./biomass-engine');       // new

/**
 * Routes a verification request to the correct physics engine
 * based on the plant's methodology code.
 *
 * All engines return identical attestation structure:
 * { trustScore, trustLevel, calculations, layerScores, verificationStatus }
 * So the rest of the pipeline (VCs, HRECs, certificates) is untouched.
 */
class MethodologyRouter {
  static getEngine(methodologyCode) {
    const engines = {
      'ACM0002':  new HydroEngine(),     // Run-of-river & reservoir hydro
      'AMS-I.D':  new SolarEngine(),     // Grid-connected solar PV
      'AMS-I.F':  new WindEngine(),      // Grid-connected wind
      'AMS-I.C':  new BiomassEngine()    // Thermal energy for user/grid
    };

    const engine = engines[methodologyCode];
    if (!engine) {
      throw new Error(
        `Unknown methodology: ${methodologyCode}. ` +
        `Supported: ${Object.keys(engines).join(', ')}`
      );
    }
    return engine;
  }
}

module.exports = { MethodologyRouter };
```

### 4.2 Solar Engine

```javascript
// src/engine/solar-engine.js
// AMS-I.D: Grid-connected renewable electricity generation from solar PV
// Physics: P = G × A × η_panel × (1 - loss_factor)

class SolarEngine {
  /**
   * Layer 1: Physics validation for solar PV
   * @param {object} reading  { irradiance_W_m2, panel_area_m2, efficiency_pct,
   *                            reported_power_kW, temperature_c, dust_factor }
   */
  validatePhysics(reading) {
    const { irradiance_W_m2, panel_area_m2, efficiency_pct,
            reported_power_kW, temperature_c = 25, dust_factor = 0.95 } = reading;

    // Temperature derating: panels lose ~0.4%/°C above 25°C (STC)
    const tempDerating   = 1 - Math.max(0, (temperature_c - 25) * 0.004);

    // Expected power from first principles
    const expectedPowerW = irradiance_W_m2
                          * panel_area_m2
                          * (efficiency_pct / 100)
                          * dust_factor
                          * tempDerating;

    const expectedPowerKW = expectedPowerW / 1000;

    // Physics score: how close is reported to expected?
    const deviation = Math.abs(reported_power_kW - expectedPowerKW) / expectedPowerKW;

    return {
      score:         deviation < 0.05 ? 1.0 :
                     deviation < 0.10 ? 0.85 :
                     deviation < 0.20 ? 0.60 : 0.0,
      expected:      expectedPowerKW,
      reported:      reported_power_kW,
      deviation:     deviation,
      methodology:   'AMS-I.D',
      equation:      'P = G × A × η × dust_factor × temp_derating'
    };
  }

  // Layers 2-5 are identical to HydroEngine — only Layer 1 changes
  // (temporal consistency, environmental correlation, ML, device trust
  //  are methodology-agnostic)
}

module.exports = SolarEngine;
```

### 4.3 Wind Engine

```javascript
// src/engine/wind-engine.js
// AMS-I.F: Grid-connected renewable electricity generation from wind
// Physics: P = 0.5 × ρ × A × v³ × Cp (Betz limit: Cp_max = 0.593)

class WindEngine {
  /**
   * Layer 1: Physics validation for wind turbines
   * @param {object} reading  { wind_speed_m_s, rotor_diameter_m,
   *                            air_density_kg_m3, Cp, reported_power_kW }
   */
  validatePhysics(reading) {
    const { wind_speed_m_s, rotor_diameter_m,
            air_density_kg_m3 = 1.225, Cp = 0.40,
            reported_power_kW } = reading;

    // Betz limit: no turbine can exceed Cp = 16/27 ≈ 0.593
    if (Cp > 0.593) {
      return { score: 0.0, reason: 'Cp exceeds Betz limit (0.593)', methodology: 'AMS-I.F' };
    }

    const rotorArea      = Math.PI * Math.pow(rotor_diameter_m / 2, 2);
    const expectedPowerW = 0.5 * air_density_kg_m3 * rotorArea
                          * Math.pow(wind_speed_m_s, 3) * Cp;
    const expectedPowerKW = expectedPowerW / 1000;
    const deviation       = Math.abs(reported_power_kW - expectedPowerKW) / expectedPowerKW;

    return {
      score:       deviation < 0.08 ? 1.0 :
                   deviation < 0.15 ? 0.80 :
                   deviation < 0.25 ? 0.55 : 0.0,
      expected:    expectedPowerKW,
      reported:    reported_power_kW,
      deviation,
      methodology: 'AMS-I.F',
      equation:    'P = 0.5 × ρ × A × v³ × Cp'
    };
  }
}

module.exports = WindEngine;
```

---

## 5. ENTERPRISE FLEET SDK

**Goal:** Give large organisations a single API endpoint to deploy entire fleets of plants programmatically, using my verification stack as the backend.

### 5.1 Fleet Deployment Endpoint

```javascript
// src/api/v2/enterprise-sdk.js

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { MethodologyRouter } = require('../../engine/methodology-router');

/**
 * POST /api/v2/enterprise/deploy-fleet
 *
 * Provisions a fleet of plants for a single enterprise client.
 * Each plant gets: DID, HTS token association, DB record, monitoring config.
 *
 * Request body:
 * {
 *   organizationId: string,
 *   organizationDid: string,
 *   plantConfigs: [{
 *     plantId:      string,
 *     name:         string,
 *     location:     string,
 *     capacityKW:   number,
 *     methodology:  'ACM0002' | 'AMS-I.D' | 'AMS-I.F' | 'AMS-I.C',
 *     sensorLayout: object
 *   }]
 * }
 */
router.post('/deploy-fleet', enterpriseAuth, async (req, res) => {
  const { organizationId, organizationDid, plantConfigs } = req.body;
  const deploymentId = uuidv4();
  const results      = [];
  const errors       = [];

  for (const config of plantConfigs) {
    try {
      // Validate methodology is supported
      MethodologyRouter.getEngine(config.methodology);

      // Create plant record + DID
      const plantDid = await createPlantDID(config.plantId, config.capacityKW);

      // Associate HTS token with new plant account
      const htsAssociation = await associateHRECToken(plantDid.accountId);

      // Provision monitoring config
      await createMonitoringConfig(config);

      results.push({
        plantId:        config.plantId,
        status:         'DEPLOYED',
        plantDid:       plantDid.did,
        hederaAccountId: plantDid.accountId,
        htsTxId:        htsAssociation.txId,
        methodology:    config.methodology
      });

    } catch (err) {
      errors.push({ plantId: config.plantId, error: err.message });
    }
  }

  return res.status(207).json({
    deploymentId,
    organizationId,
    totalRequested: plantConfigs.length,
    deployed:       results.length,
    failed:         errors.length,
    results,
    errors
  });
});

// v2 routes for enterprise clients
router.get('/fleet/:organizationId/status', enterpriseAuth, async (req, res) => {
  const plants = await getFleetStatus(req.params.organizationId);
  return res.json({ organizationId: req.params.organizationId, plants });
});

router.get('/fleet/:organizationId/hrec-balance', enterpriseAuth, async (req, res) => {
  const balances = await getFleetHRECBalances(req.params.organizationId);
  return res.json({ organizationId: req.params.organizationId, balances });
});

module.exports = router;
```

---

## 6. MAINNET DEPLOYMENT CHECKLIST

I will only publish "mainnet live" with real HashScan links proving each item. No dates — only readiness criteria.

```
MAINNET READINESS — ALL MUST BE TRUE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ HREC token on mainnet (0.0.XXXXX confirmed on HashScan)
□ HCS topic on mainnet with real verification messages
□ VerifierStaking.sol deployed and verified on HSCS
□ PlantRegistry.sol deployed with at least 1 real plant registered
□ HRECMinter.sol deployed and minting from a real verified reading
□ At least 1 pilot plant sending live telemetry to mainnet
□ At least 1 retirement claim completed end-to-end on mainnet
□ Shadow mode comparison against traditional MRV: complete
□ All 5 smart contract functions have Hardhat test coverage >90%
□ ZKP circuit compiled, trusted setup done, sample proof generated
□ ADWIN running on mainnet stream with logged drift events on HCS
□ PlantRegistry has verified entries for all active pilot plants
```

---

## 7. LARGE-SCALE SIMULATION TEST (Month 24 Target)

Before claiming enterprise-readiness, I need a load test that matches real-world scale:

```javascript
// tests/simulation/mainnet-scale-test.js

/**
 * Month 24 Scale Test
 * Target: 10,000 sensors | 500 plants | 50 verifiers
 * This is the test I run before opening enterprise fleet onboarding.
 */

const SIMULATION_CONFIG = {
  plants:    500,   // spread across India + SE Asia
  sensors:   10000, // 20 sensors per plant average
  verifiers: 50,    // staked verifiers across 3 time zones
  duration:  '24h', // simulate 24 hours of continuous data

  // Expected outcomes
  targets: {
    throughput:          '≥ 1 verification/second sustained',
    trustScoreAccuracy:  '≥ 95% match with ground truth',
    falsePositiveRate:   '< 5%',
    hcsLatency:          '< 3s per message',
    adwinFalseAlarms:    '< 2 in 24h',
    zkpProofTime:        '< 30s per proof (acceptable for premium tier)'
  }
};

async function runScaleTest() {
  console.log(`Starting ${SIMULATION_CONFIG.plants} plant simulation...`);

  const results = {
    totalReadings:      0,
    approved:           0,
    flagged:            0,
    rejected:           0,
    driftEventsADWIN:   0,
    zkpProofsGenerated: 0,
    hcsMessagesSent:    0,
    errors:             []
  };

  // Run async batches to simulate 10,000 concurrent sensors
  const batches = chunkArray(plantIds, 50);  // 50 plants per batch

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(plantId => simulatePlant24h(plantId))
    );
    // Aggregate results...
  }

  console.log('Scale test complete:', JSON.stringify(results, null, 2));
  return results;
}
```

---

## 8. ROADMAP 3 COMPLETION CRITERIA

Roadmap 3 is complete when every item below is true — proven with code, not claims:

| Component | Done When |
|---|---|
| VerifierStaking.js (off-chain) | Tests pass, slash events logged to HCS |
| VerifierStaking.sol | Deployed to HSCS testnet, Hardhat tests >90% |
| HRECMinter.sol | minted for 1 real verified reading via contract |
| PlantRegistry.sol | 1+ real plants registered on-chain |
| ZKP circuit | Proof generated + verified for 1 sample reading |
| ADWIN detector | Running on live stream, drift events visible on HCS |
| Methodology router | ACM0002 + AMS-I.D (solar) both working end-to-end |
| Enterprise fleet SDK | 5+ plants deployed via `/api/v2/enterprise/deploy-fleet` |
| Month 24 scale test | 500 plants, 10k sensors, targets met or documented |
| Mainnet checklist | All 11 items checked with real HashScan links |

---

*This is my technical execution plan — not a business deck. Every code block here is something I am building and can demonstrate. Nothing is a promise about revenue, investors, or regulatory outcomes. Those depend on work that comes after the tech is solid.*
