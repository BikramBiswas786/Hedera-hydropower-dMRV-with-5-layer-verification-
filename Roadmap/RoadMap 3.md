# 🚀 ROADMAP 3 — TOKENISATION, GOVERNANCE & DEPLOYMENT
## Hedera Hydropower dMRV | Month 13 → Month 36
**Author: Bikram Biswas | Updated: March 24, 2026 | Version: V3.0**
**GitHub: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-)**

---

## 1. EXECUTIVE SUMMARY

Roadmap 3 moves from "working protocol" to "governed, tokenised, multi-methodology system running on Hedera mainnet." This is not a business pitch — it is a technical and regulatory execution plan. I merge my strategic compliance path (India CCTS, Verra, ISO, Solidity contracts) with concrete technical modules (ADWIN JS, ZKP Circom circuits, verifier staking, methodology router, enterprise SDK) into a single coherent plan.

**Where I arrive at Month 13:**
- ✅ 40+ active plants on Hedera mainnet
- ✅ CAD Trust double-counting prevention live
- ✅ 6 months of Verra shadow mode data in hand
- ✅ HCS topic live — 350,000+ immutable records
- ✅ HTS token 0.0.7964264 — HREC mint/burn confirmed
- ✅ Guardian policy with 3-of-5 multi-sig active
- ✅ ADWIN JS drift detection running in production
- ✅ TPM/HSM hardware attestation on pilot plants
- ❌ No ISO accreditation — blocks compliance market entry
- ❌ No on-chain Solidity contracts — governance is still off-chain JS
- ❌ No ZKP layer — institutional buyers cannot verify privately
- ❌ No methodology router — locked to hydropower only
- ❌ Solo developer — single point of failure

**Roadmap 3 closes every one of those gaps across 24 months.**

---

## 2. ROADMAP 3 MASTER TIMELINE

| Phase | Window | Primary Goal | Key Deliverable |
|---|---|---|---|
| **2A — Governance** | M13–18 | On-chain verifier staking + ISO docs | VerifierStaking.sol on HSCS |
| **2B — Privacy** | M16–22 | ZKP proof layer + Verra accreditation | zkp-proof-generator.js live |
| **3A — Expansion** | M18–28 | Methodology router + enterprise SDK | Solar + Wind engines live |
| **3B — Mainnet** | M20–30 | Full mainnet deployment + first enterprise deal | HRECMinter.sol on HashScan |
| **3C — Compliance** | M24–36 | ISO 27001 + ISO 14064-2 + India CCTS | Certified system |

---

## 3. MONTHS 13–18 — VERIFIER STAKING & GOVERNANCE

### 3.1 Why On-Chain Governance Now

My existing `src/hedera/verifier-staking.js` is off-chain JavaScript — the staking logic runs on my Railway server, which means I can override it. That is not trustless governance. For Verra pre-approval and enterprise contracts, the verification reward/slash system must be enforced by a smart contract that I cannot unilaterally modify.

This is the transition: **off-chain governance (now) → Solidity contracts on HSCS (Month 15).**

### 3.2 Off-Chain Governance Bridge (Deploy Month 13, Bridge to Month 15)

```javascript
// FILE: src/hedera/verifier-staking.js — UPDATED VERSION
// This is the production off-chain implementation.
// It bridges to VerifierStaking.sol once contract is deployed.

class VerifierStaking {
  constructor(db, hcsLogger) {
    this.db = db;
    this.hcsLogger = hcsLogger;
    this.SLASH_PERCENT = 0.10;   // 10% — conservative for early network
    // 10% rationale: Ethereum PoS uses 1-5% for first offence.
    // 20% (Manus default) deters participation in a network with <50 verifiers.
    // I set 10% for Year 2, will revisit at 500+ verifiers.
  }

  async stake(verifierId, amount, plantIds) {
    // Verifier locks HBAR/HREC as collateral before being assigned plants
    const stakeRecord = await this.db.query(
      `INSERT INTO verifier_stakes
         (verifier_id, amount_staked, plant_ids, staked_at, status)
       VALUES ($1, $2, $3, NOW(), 'ACTIVE')
       RETURNING id`,
      [verifierId, amount, JSON.stringify(plantIds)]
    );

    await this.hcsLogger._submit({
      event:      'VERIFIER_STAKED',
      verifierId,
      amount,
      plantIds,
      stakeId:    stakeRecord.rows[0].id,
      timestamp:  new Date().toISOString()
    });

    return stakeRecord.rows[0];
  }

  async slash(verifierId, reason) {
    const stake = await this.db.query(
      `SELECT * FROM verifier_stakes WHERE verifier_id = $1 AND status = 'ACTIVE'`,
      [verifierId]
    );

    if (stake.rows.length === 0) {
      throw new Error(`No active stake found for verifier ${verifierId}`);
    }

    const stakeData  = stake.rows[0];
    const penalty    = stakeData.amount_staked * this.SLASH_PERCENT;
    const remaining  = stakeData.amount_staked - penalty;

    await this.db.query(
      `UPDATE verifier_stakes
       SET amount_staked = $1, slash_count = slash_count + 1, last_slashed_at = NOW()
       WHERE verifier_id = $2 AND status = 'ACTIVE'`,
      [remaining, verifierId]
    );

    // Log slash event to HCS — immutable evidence of governance action
    const hcsTxId = await this.hcsLogger._submit({
      event:      'VERIFIER_SLASHED',
      verifierId,
      penalty,
      remaining,
      reason,
      timestamp:  new Date().toISOString()
    });

    // If stake drops below minimum (50 HBAR), disable verifier
    const MIN_STAKE = parseFloat(process.env.MIN_VERIFIER_STAKE || '50');
    if (remaining < MIN_STAKE) {
      await this.db.query(
        `UPDATE verifier_stakes SET status = 'SUSPENDED' WHERE verifier_id = $1`,
        [verifierId]
      );
    }

    return { penalty, remaining, hcsTxId };
  }

  async reward(verifierId, amount) {
    await this.db.query(
      `UPDATE verifier_stakes
       SET rewards_earned = rewards_earned + $1, last_rewarded_at = NOW()
       WHERE verifier_id = $2 AND status = 'ACTIVE'`,
      [amount, verifierId]
    );

    await this.hcsLogger._submit({
      event:      'VERIFIER_REWARDED',
      verifierId,
      amount,
      timestamp:  new Date().toISOString()
    });
  }
}

module.exports = { VerifierStaking };
```

### 3.3 Solidity Contracts — Design & Deployment (Month 15–17)

These are the three contracts that replace the off-chain JS governance. I design them in Month 13, test them in Month 14, deploy to HSCS testnet in Month 15, and promote to mainnet after audit in Month 17.

**Contract 1: `contracts/VerifierStaking.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// FILE: contracts/VerifierStaking.sol
// On-chain verifier staking for the Hedera Hydropower dMRV protocol.
// Deployed on HSCS (Hedera Smart Contract Service).
// Author: Bikram Biswas | March 2026

contract VerifierStaking {
    address public owner;
    uint256 public constant SLASH_PERCENT = 10;   // 10% — see rationale in Roadmap 3 §3.2
    uint256 public constant MIN_STAKE     = 50 ether;  // 50 HBAR minimum stake

    struct Stake {
        uint256 amount;
        uint256 rewardsEarned;
        uint256 slashCount;
        bool    active;
        uint256 stakedAt;
    }

    mapping(address => Stake) public stakes;
    address public treasury;

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
            amount:       msg.value,
            rewardsEarned: 0,
            slashCount:   0,
            active:       true,
            stakedAt:     block.timestamp
        });
        emit VerifierStaked(msg.sender, msg.value);
    }

    function slash(address verifier, string calldata reason)
        external onlyOwner onlyActive(verifier) {
        Stake storage s = stakes[verifier];
        uint256 penalty  = (s.amount * SLASH_PERCENT) / 100;
        s.amount        -= penalty;
        s.slashCount    += 1;

        // Slash amount goes to treasury (protocol fund)
        payable(treasury).transfer(penalty);
        emit VerifierSlashed(verifier, penalty, reason);

        // Suspend if below minimum
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

    function getStake(address verifier) external view returns (Stake memory) {
        return stakes[verifier];
    }
}
```

**Contract 2: `contracts/HRECMinter.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// FILE: contracts/HRECMinter.sol
// Multi-sig HREC token minting gate on HSCS.
// Enforces: 3-of-5 authorized signers before any mint.
// The HTS mint call happens off-chain after contract emits MintApproved event.

contract HRECMinter {
    address public owner;
    uint256 public constant REQUIRED_APPROVALS = 3;

    struct MintRequest {
        address plantDID;
        uint256 amountHREC;   // in units (MWh * 1000)
        uint256 approvalCount;
        bool    executed;
        string  hcsEvidenceTx;  // HCS TX ID proving verification
        mapping(address => bool) approved;
    }

    mapping(uint256 => MintRequest) public mintRequests;
    mapping(address => bool)        public authorizedSigners;
    uint256 public requestCount;

    event MintRequested(uint256 indexed requestId, address plantDID, uint256 amount);
    event MintApproved(uint256 indexed requestId, address signer, uint256 approvalCount);
    event MintExecutable(uint256 indexed requestId);  // Backend listens and calls HTS mint

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
            // Node.js backend listens for MintExecutable → calls HTS mint
        }
    }
}
```

**Contract 3: `contracts/PlantRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// FILE: contracts/PlantRegistry.sol
// On-chain registry of verified hydropower plants.
// Registration requires owner approval — not open to anyone.

contract PlantRegistry {
    address public owner;

    struct Plant {
        string  plantId;
        string  hederaDID;         // did:hedera:mainnet:<accountId>
        string  methodology;       // ACM0002, AMS-I.D, AMS-I.F etc.
        uint256 capacityMW;        // in MW * 100 (2 decimal places)
        bool    active;
        uint256 registeredAt;
        string  hcsTopicId;        // the HCS topic for this plant's telemetry
    }

    mapping(string => Plant)  public plants;   // plantId → Plant
    mapping(string => bool)   public registered;
    string[]                  public plantIds;

    event PlantRegistered(string indexed plantId, string hederaDID, string methodology);
    event PlantDeactivated(string indexed plantId);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() { owner = msg.sender; }

    function registerPlant(
        string calldata plantId,
        string calldata hederaDID,
        string calldata methodology,
        uint256         capacityMW,
        string calldata hcsTopicId
    ) external onlyOwner {
        require(!registered[plantId], "Plant already registered");
        plants[plantId] = Plant({
            plantId:      plantId,
            hederaDID:    hederaDID,
            methodology:  methodology,
            capacityMW:   capacityMW,
            active:       true,
            registeredAt: block.timestamp,
            hcsTopicId:   hcsTopicId
        });
        registered[plantId] = true;
        plantIds.push(plantId);
        emit PlantRegistered(plantId, hederaDID, methodology);
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

### 3.4 DB Migration: `verifier_stakes` Table

```sql
-- FILE: src/db/migrations/007_verifier_stakes.sql
CREATE TABLE IF NOT EXISTS verifier_stakes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verifier_id       VARCHAR(100) UNIQUE NOT NULL,
    amount_staked     DECIMAL(20, 6) NOT NULL DEFAULT 0,
    rewards_earned    DECIMAL(20, 6) NOT NULL DEFAULT 0,
    slash_count       INTEGER NOT NULL DEFAULT 0,
    plant_ids         JSONB NOT NULL DEFAULT '[]',
    status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
    staked_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_slashed_at   TIMESTAMP,
    last_rewarded_at  TIMESTAMP,
    contract_address  VARCHAR(200)  -- populated after HSCS deployment
);

CREATE INDEX idx_vs_verifier_id ON verifier_stakes(verifier_id);
CREATE INDEX idx_vs_status      ON verifier_stakes(status);
```

### 3.5 Contract Deployment Checklist

```bash
# FILE: scripts/deploy_contracts.js

# Step 1: Compile (install once)
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Step 2: Configure hardhat.config.js for HSCS testnet
# networks.hederaTestnet.url = "https://testnet.hedera.com"
# networks.hederaTestnet.accounts = [process.env.HEDERA_EVM_PRIVATE_KEY]

# Step 3: Deploy to HSCS testnet (Month 15)
npx hardhat run scripts/deploy_contracts.js --network hederaTestnet

# Step 4: Verify on HashScan
# All contracts get a 0x... EVM address on Hedera
# Verify at: https://hashscan.io/testnet/contract/<address>

# Step 5: Run test suite (required before mainnet)
npx hardhat test test/VerifierStaking.test.js
npx hardhat test test/HRECMinter.test.js
npx hardhat test test/PlantRegistry.test.js

# Step 6: Security audit (external, Month 16)
# Submit to: Code4rena, Sherlock, or Hats Finance
# Minimum scope: VerifierStaking.sol (slash function is the highest risk)

# Step 7: Deploy to HSCS mainnet (Month 17, after audit clean)
npx hardhat run scripts/deploy_contracts.js --network hederaMainnet
# Log contract addresses to .env.production
# Verify at: https://hashscan.io/mainnet/contract/<address>
```

---

## 4. MONTHS 16–22 — ZKP PRIVACY LAYER

### 4.1 Why ZKP Is Required for Enterprise Buyers

Large utilities and institutional ESG buyers have a specific problem: they want to verify that my dMRV readings fall within legitimate bounds — but they cannot share raw telemetry with third parties for legal/commercial reasons. Standard blockchain transparency (everything on-chain = everything public) breaks this.

**ZKP solution:** The buyer proves that `flow × head × efficiency = power` is within the permitted range, without revealing the actual values. I use `snarkjs` + Circom circuits for this — the same stack the Ethereum ecosystem uses, adapted to Hedera.

### 4.2 Circuit: `circuits/mrv.circom` (NEW FILE)

```circom
// FILE: circuits/mrv.circom
// ZKP circuit for hydropower MRV verification
// Proves: power output is within valid bounds WITHOUT revealing raw sensor values
// Methodology: ACM0002 — P = ρgQHη

pragma circom 2.0.0;

template MRVVerification() {
    // Private inputs (plant operator's raw telemetry — never revealed)
    signal private input flowRate;       // Q in m³/s * 100 (2 decimal precision)
    signal private input headHeight;     // H in metres * 100
    signal private input efficiency;     // η * 1000 (0.85 = 850)
    
    // Public inputs (the bounds that buyer + verifier agree on)
    signal input minPower;              // Lower bound (kW * 100)
    signal input maxPower;              // Upper bound (kW * 100)
    signal input gravityDensity;        // ρg = 9810 (fixed constant)
    
    // Output
    signal output powerInBounds;         // 1 if valid, 0 if not

    // Physics formula: P = ρgQHη
    // Represented as integer arithmetic (circom has no floats)
    signal computedPower;
    computedPower <== (gravityDensity * flowRate * headHeight * efficiency) \ 100000000;
    
    // Range check: minPower <= computedPower <= maxPower
    // Implemented using comparison templates
    component gte = GreaterEqThan(64);
    component lte = LessEqThan(64);
    
    gte.in[0] <== computedPower;
    gte.in[1] <== minPower;
    lte.in[0] <== computedPower;
    lte.in[1] <== maxPower;
    
    powerInBounds <== gte.out * lte.out;
}

component main = MRVVerification();
```

### 4.3 Module: `src/security/zkp-proof-generator.js` (NEW FILE)

```javascript
// FILE: src/security/zkp-proof-generator.js
// ZKP proof generation for enterprise/premium tier plants.
// Uses snarkjs + Groth16 proving system.
// Only available for Standard+ tier — not Basic tier.
// Circuit: circuits/mrv.circom → compiled to mrv.wasm + mrv.zkey

const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

class ZKPProofGenerator {
  constructor() {
    this.wasmPath  = path.join(__dirname, '../../circuits/mrv.wasm');
    this.zkeyPath  = path.join(__dirname, '../../circuits/mrv.zkey');
    this.vkeyPath  = path.join(__dirname, '../../circuits/mrv_verification_key.json');
    
    // Validate that compiled circuits exist
    if (!fs.existsSync(this.wasmPath)) {
      console.warn('[ZKP] Circuit not compiled. Run: npm run compile-circuits');
    }
  }

  /**
   * Generate a ZKP proof that power output is within valid bounds.
   * Called for Premium tier plants when institutional buyer requests private verification.
   *
   * @param {object} privateInputs - Raw sensor data (NEVER sent to buyer)
   *   { flowRate, headHeight, efficiency }
   * @param {object} publicBounds - Agreed bounds (shared with buyer openly)
   *   { minPower, maxPower }
   * @returns {object} { proof, publicSignals, verified, proofJson }
   */
  async generateProof(privateInputs, publicBounds) {
    // Convert to integer representation for Circom
    // Circom works with integers only — scale by 100 for 2 decimal places
    const circuitInputs = {
      flowRate:       Math.round(privateInputs.flowRate * 100),
      headHeight:     Math.round(privateInputs.headHeight * 100),
      efficiency:     Math.round(privateInputs.efficiency * 1000),  // 0.85 → 850
      minPower:       Math.round(publicBounds.minPower * 100),
      maxPower:       Math.round(publicBounds.maxPower * 100),
      gravityDensity: 9810  // ρg constant
    };

    try {
      // Generate proof using Groth16
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        this.wasmPath,
        this.zkeyPath
      );

      // Verify the proof locally before sending to buyer
      const vkey     = JSON.parse(fs.readFileSync(this.vkeyPath));
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

      if (!verified) {
        throw new Error('ZKP self-verification failed — circuit or input issue');
      }

      return {
        proof,
        publicSignals,
        verified,
        powerInBounds:   publicSignals[0] === '1',
        // This JSON can be sent to buyer — contains NO raw sensor data
        proofJson: JSON.stringify({ proof, publicSignals }, null, 2)
      };

    } catch (err) {
      throw new Error(`ZKP proof generation failed: ${err.message}`);
    }
  }

  /**
   * Verify a proof provided by a plant operator.
   * Called by the buyer or a third-party auditor to confirm validity.
   * @param {object} proof - The proof from generateProof()
   * @param {Array} publicSignals - The public signals from generateProof()
   * @returns {boolean} - True if proof is valid
   */
  async verifyProof(proof, publicSignals) {
    const vkey = JSON.parse(fs.readFileSync(this.vkeyPath));
    return snarkjs.groth16.verify(vkey, publicSignals, proof);
  }

  /**
   * Batch proof generation for monthly reporting.
   * Called at month-end to generate ZKP proofs for all readings in a period.
   */
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
      total:    results.length,
      success:  results.filter(r => r.verified).length,
      failed:   results.filter(r => r.error).length,
      results
    };
  }
}

module.exports = { ZKPProofGenerator };
```

### 4.4 Circuit Compilation Scripts

```bash
# FILE: package.json — add to scripts section:
# "compile-circuits": "npm run compile-circuit-mrv",
# "compile-circuit-mrv": "circom circuits/mrv.circom --r1cs --wasm --sym --output circuits/",
# "setup-zkp": "snarkjs groth16 setup circuits/mrv.r1cs circuits/ptau/pot12_final.ptau circuits/mrv.zkey",
# "export-vkey": "snarkjs zkey export verificationkey circuits/mrv.zkey circuits/mrv_verification_key.json"

# Full setup sequence (run once per circuit version):
npm install circom snarkjs
npx circom circuits/mrv.circom --r1cs --wasm --sym --output circuits/
snarkjs powersoftau new bn128 12 circuits/ptau/pot12_0000.ptau -v
snarkjs powersoftau contribute circuits/ptau/pot12_0000.ptau circuits/ptau/pot12_0001.ptau --name="Bikram Biswas" -v
snarkjs powersoftau prepare phase2 circuits/ptau/pot12_0001.ptau circuits/ptau/pot12_final.ptau -v
snarkjs groth16 setup circuits/mrv.r1cs circuits/ptau/pot12_final.ptau circuits/mrv.zkey
snarkjs zkey export verificationkey circuits/mrv.zkey circuits/mrv_verification_key.json

# Test the circuit with sample inputs:
node -e "
  const { ZKPProofGenerator } = require('./src/security/zkp-proof-generator');
  const gen = new ZKPProofGenerator();
  gen.generateProof(
    { flowRate: 12.5, headHeight: 45.0, efficiency: 0.87 },  // private
    { minPower: 3000, maxPower: 6000 }                        // public bounds
  ).then(r => {
    console.log('Power in bounds:', r.powerInBounds);
    console.log('Proof verified:', r.verified);
    console.log('Proof size (bytes):', JSON.stringify(r.proof).length);
  });
"
# Expected output:
# Power in bounds: true
# Proof verified: true
# Proof size (bytes): ~1,200
```

### 4.5 ZKP API Endpoint

```javascript
// FILE: src/api/v1/zkp.js (NEW)

const router = express.Router();
const { ZKPProofGenerator } = require('../../security/zkp-proof-generator');

// POST /api/v1/zkp/generate — Premium tier only
// Operator submits private readings, gets back proof (no raw data exposed)
router.post('/generate', premiumTierAuth, async (req, res) => {
  const { privateInputs, publicBounds, plantId } = req.body;

  // Validate that plant is Premium tier
  const plant = await db.query('SELECT tier FROM plants WHERE plant_id = $1', [plantId]);
  if (plant.rows[0].tier !== 'PREMIUM' && plant.rows[0].tier !== 'ENTERPRISE') {
    return res.status(403).json({ error: 'ZKP requires Premium or Enterprise tier' });
  }

  const generator = new ZKPProofGenerator();
  const result    = await generator.generateProof(privateInputs, publicBounds);

  // Store proof hash on HCS (not the full proof — just its hash)
  const proofHash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(result.proof))
    .digest('hex');

  await hcsLogger._submit({
    event:        'ZKP_PROOF_GENERATED',
    plantId,
    proofHash,    // Hash only — proof is NOT stored on HCS
    publicBounds,
    powerInBounds: result.powerInBounds,
    timestamp:    new Date().toISOString()
  });

  // Return proof to operator — they share with buyer directly
  return res.json({
    plantId,
    proofHash,
    powerInBounds: result.powerInBounds,
    proof:         result.proof,
    publicSignals: result.publicSignals,
    // Buyer uses verifyProof(proof, publicSignals) to confirm validity
    verifyEndpoint: '/api/v1/zkp/verify'
  });
});

// POST /api/v1/zkp/verify — Public endpoint — anyone can verify
router.post('/verify', async (req, res) => {
  const { proof, publicSignals } = req.body;
  const generator = new ZKPProofGenerator();
  const verified  = await generator.verifyProof(proof, publicSignals);
  return res.json({ verified, powerInBounds: publicSignals[0] === '1' });
});

module.exports = router;
```

---

## 5. MONTHS 18–28 — METHODOLOGY ROUTER & MULTI-ENERGY EXPANSION

### 5.1 Architecture Philosophy

My 5-layer verification engine is physics-based. Layer 1 (Physics) contains the energy-type-specific formula. Layers 2–5 (Temporal, Environmental, ML, Device) are generic — they work for any continuous sensor stream. This means expanding to solar, wind, and biomass is **an extension, not a rewrite**.

The methodology router is a clean switch statement that selects the correct engine based on the methodology code.

### 5.2 Module: `src/engine/methodology-router.js` (NEW FILE)

```javascript
// FILE: src/engine/methodology-router.js
// Pluggable methodology router.
// Adding a new energy type = writing a new engine class and wiring it here.

const { HydroEngine  } = require('./hydro-engine');      // Existing EngineV1 — ACM0002
const { SolarEngine  } = require('./solar-engine');      // NEW — AMS-I.D
const { WindEngine   } = require('./wind-engine');       // NEW — AMS-I.F
// const { BiomassEngine } = require('./biomass-engine'); // Month 28+ — AMS-I.C

class MethodologyRouter {
  constructor(config) {
    this.config  = config;
    this.engines = {
      'ACM0002':  new HydroEngine(config),   // Run-of-river and reservoir hydro
      'AMS-I.D':  new SolarEngine(config),   // Grid-connected solar PV
      'AMS-I.F':  new WindEngine(config),    // Grid-connected wind
      // 'AMS-I.C': new BiomassEngine(config),  // Biomass — Month 28
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
    const engine = this.getEngine(methodology);
    return engine.verifyReading(reading);
  }

  getSupportedMethodologies() {
    return Object.keys(this.engines);
  }
}

module.exports = { MethodologyRouter };
```

### 5.3 Solar Engine: `src/engine/solar-engine.js` (NEW FILE)

```javascript
// FILE: src/engine/solar-engine.js
// AMS-I.D: Grid-connected solar PV systems
// Physics: P = G × A × η_panel × PR
// G = irradiance (W/m²), A = panel area (m²), η = panel efficiency, PR = performance ratio

class SolarEngine {
  constructor(config) {
    this.config = config;
    // Thresholds (AMS-I.D compliant)
    this.MAX_IRRADIANCE     = 1200;  // W/m² — theoretical max (solar constant is 1361)
    this.MIN_IRRADIANCE     = 0;     // At night
    this.MAX_PANEL_EFF      = 0.25;  // 25% — max commercial efficiency (2026)
    this.MIN_PANEL_EFF      = 0.12;  // 12% — below this signals sensor error
    this.PR_RANGE           = { min: 0.60, max: 0.90 };  // Performance ratio
    this.TEMPORAL_VARIANCE  = 0.30;  // ±30% for solar (clouds change fast)
  }

  verifyLayer1Physics(reading) {
    const { irradiance, panelArea, panelEfficiency, performanceRatio } = reading;

    // Guard: irradiance bounds
    if (irradiance < this.MIN_IRRADIANCE || irradiance > this.MAX_IRRADIANCE) {
      return { score: 0, passed: false, reason: `Irradiance ${irradiance} out of bounds [0, ${this.MAX_IRRADIANCE}]` };
    }

    // Calculate expected power (W)
    const expectedPower = irradiance * panelArea * panelEfficiency * performanceRatio;
    const actualPower   = reading.powerOutputKw * 1000;  // kW → W

    // Tolerance: ±15% for solar (same as ACM0002 hydro)
    const deviation = Math.abs((actualPower - expectedPower) / expectedPower);
    const score     = deviation < 0.05 ? 1.0
      : deviation < 0.10 ? 0.85
      : deviation < 0.15 ? 0.70
      : 0.0;

    return {
      score,
      passed: score > 0,
      expectedPowerW: expectedPower.toFixed(2),
      actualPowerW:   actualPower.toFixed(2),
      deviationPct:   (deviation * 100).toFixed(2)
    };
  }

  async verifyReading(reading) {
    // Layers 2–5 are inherited from the base engine (identical across methodologies)
    // Only Layer 1 changes
    const layer1 = this.verifyLayer1Physics(reading);
    // ... (remaining layers identical to HydroEngine)
    return { layer1, methodology: 'AMS-I.D' };
  }
}

module.exports = { SolarEngine };
```

### 5.4 Wind Engine: `src/engine/wind-engine.js` (NEW FILE)

```javascript
// FILE: src/engine/wind-engine.js
// AMS-I.F: Grid-connected wind power
// Physics: P = 0.5 × ρ × A × v³ × Cp
// ρ = air density (kg/m³), A = rotor swept area (m²), v = wind speed (m/s), Cp = power coefficient

class WindEngine {
  constructor(config) {
    this.config = config;
    // Thresholds (AMS-I.F compliant)
    this.BETZ_LIMIT         = 0.593;  // Betz limit — Cp can never exceed this (physics)
    this.TYPICAL_CP         = 0.40;   // Typical modern turbine
    this.AIR_DENSITY_SL     = 1.225;  // kg/m³ at sea level
    this.MAX_WIND_SPEED     = 25.0;   // m/s — cut-out speed (turbine shuts down above)
    this.MIN_WIND_SPEED     = 3.0;    // m/s — cut-in speed (turbine starts below)
    this.TEMPORAL_VARIANCE  = 0.40;   // ±40% for wind (highly variable)
  }

  verifyLayer1Physics(reading) {
    const { windSpeed, rotorDiameter, powerCoefficient, airDensity } = reading;
    const density  = airDensity || this.AIR_DENSITY_SL;
    const area     = Math.PI * Math.pow(rotorDiameter / 2, 2);  // πr²

    // Guard: Betz limit violation
    if (powerCoefficient > this.BETZ_LIMIT) {
      return {
        score: 0, passed: false,
        reason: `Power coefficient ${powerCoefficient} exceeds Betz limit ${this.BETZ_LIMIT} — physically impossible`
      };
    }

    // Guard: cut-in/cut-out range
    if (windSpeed < this.MIN_WIND_SPEED || windSpeed > this.MAX_WIND_SPEED) {
      return {
        score: 0.3, passed: true,
        reason: `Wind speed ${windSpeed} outside generation range — turbine offline, zero output expected`
      };
    }

    // Calculate expected power (W)
    const expectedPower = 0.5 * density * area * Math.pow(windSpeed, 3) * powerCoefficient;
    const actualPower   = reading.powerOutputKw * 1000;

    const deviation = Math.abs((actualPower - expectedPower) / expectedPower);
    const score     = deviation < 0.05 ? 1.0
      : deviation < 0.15 ? 0.80
      : deviation < 0.25 ? 0.60   // Wind gets larger tolerance due to turbulence
      : 0.0;

    return {
      score,
      passed:          score > 0,
      expectedPowerW:  expectedPower.toFixed(2),
      actualPowerW:    actualPower.toFixed(2),
      deviationPct:    (deviation * 100).toFixed(2),
      betzLimitCheck:  powerCoefficient <= this.BETZ_LIMIT ? 'PASS' : 'FAIL'
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

## 6. MONTHS 20–30 — ENTERPRISE SDK & MAINNET DEPLOYMENT

### 6.1 Enterprise SDK: `src/api/v2/enterprise-sdk.js` (NEW FILE)

```javascript
// FILE: src/api/v2/enterprise-sdk.js
// White-label enterprise API for utilities deploying dMRV at scale.
// One API call deploys dMRV for an entire fleet of plants.
// Requires enterprise license agreement + dedicated Railway instance.

const router = express.Router();

// POST /api/v2/enterprise/deploy-fleet
// Deploys dMRV for an entire organization's plant portfolio in one call.
router.post('/deploy-fleet', enterpriseAuth, async (req, res) => {
  const {
    organizationId,
    plantConfigs,       // Array of { name, location, capacityMW, methodology, hcsTopicId }
    whitelabelConfig,   // { brandName, webhookUrl, reportFormat }
    slaLevel            // 'STANDARD' (99.5%) | 'ENTERPRISE' (99.9%)
  } = req.body;

  const deployedPlants = [];

  for (const plantConfig of plantConfigs) {
    // 1. Register plant in PostgreSQL
    const plantId = `${organizationId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    await db.query(
      `INSERT INTO plants
         (plant_id, name, location, capacity_mw, methodology, operator_id, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ENTERPRISE', NOW())`,
      [plantId, plantConfig.name, plantConfig.location,
       plantConfig.capacityMW, plantConfig.methodology, organizationId]
    );

    // 2. Create Hedera DID for plant
    const { DIDManager } = require('../../did/did-manager');
    const did = await new DIDManager().registerBuyerDID({ name: plantConfig.name });

    // 3. Associate HREC token with plant's Hedera account
    await htsService.associateToken(did.accountId, process.env.MAINNET_HTS_TOKEN_ID);

    // 4. Register plant in PlantRegistry.sol on-chain
    if (process.env.PLANT_REGISTRY_CONTRACT_ADDRESS) {
      await contractService.registerPlant(
        plantId, did.did, plantConfig.methodology,
        plantConfig.capacityMW, plantConfig.hcsTopicId
      );
    }

    // 5. Set up webhook for real-time event push
    if (whitelabelConfig.webhookUrl) {
      await webhookService.register(plantId, whitelabelConfig.webhookUrl, [
        'HREC_MINTED', 'CLAIM_APPROVED', 'ANOMALY_FLAGGED', 'DRIFT_DETECTED'
      ]);
    }

    deployedPlants.push({
      plantId,
      hederaDID:   did.did,
      htsAccount:  did.accountId,
      methodology: plantConfig.methodology,
      hashScan:    `https://hashscan.io/mainnet/account/${did.accountId}`
    });
  }

  return res.status(201).json({
    organizationId,
    slaLevel,
    totalDeployed:   deployedPlants.length,
    deployedPlants,
    apiKey:          await apiKeyService.issue(organizationId, 'ENTERPRISE'),
    sdkDocs:         'https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/blob/main/docs/ENTERPRISE-SDK.md',
    message:         `Fleet of ${deployedPlants.length} plants deployed. MRV active immediately.`
  });
});

// GET /api/v2/enterprise/fleet/:orgId — Portfolio view for enterprise dashboards
router.get('/fleet/:orgId', enterpriseAuth, async (req, res) => {
  const plants = await db.query(
    `SELECT p.*, 
            COUNT(t.id) AS total_readings_30d,
            SUM(t.energy_generated_kwh)/1000 AS mwh_30d,
            AVG(t.trust_score) AS avg_trust_30d
     FROM plants p
     LEFT JOIN telemetry_records t ON t.plant_id = p.plant_id
       AND t.timestamp > NOW() - INTERVAL '30 days'
     WHERE p.operator_id = $1
     GROUP BY p.plant_id`,
    [req.params.orgId]
  );

  return res.json({
    organizationId:    req.params.orgId,
    totalPlants:       plants.rows.length,
    plants:            plants.rows,
    portfolioHashScan: `https://hashscan.io/mainnet/topic/${process.env.MAINNET_HCS_TOPIC_ID}`
  });
});

module.exports = router;
```

### 6.2 Mainnet Deployment Checklist

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MAINNET GO-LIVE CHECKLIST (Month 20–22)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Infrastructure:
□ HCS topic active on mainnet (0.0.XXXXXXX) — already done ✅
□ HTS token active on mainnet (0.0.7964264) — already done ✅
□ All 3 Solidity contracts deployed on HSCS mainnet
  □ PlantRegistry.sol  → hashscan.io/mainnet/contract/<addr>
  □ HRECMinter.sol     → hashscan.io/mainnet/contract/<addr>
  □ VerifierStaking.sol → hashscan.io/mainnet/contract/<addr>
□ Contract addresses added to .env.production

Security:
□ External contract audit complete (zero critical findings)
□ Multi-sig keys distributed to 5 authorized signers
□ Hardware wallet (Ledger) holding supplyKey for HTS token
□ Emergency pause function tested on testnet first

API:
□ v2 Enterprise SDK endpoints deployed to Railway production
□ Load test: 500 concurrent verifications handled without errors
□ Health check: /health returns 200 with all dependency statuses
□ Rate limiting active on all public endpoints

Monitoring:
□ Uptime monitoring via Better Uptime or Betterstack
□ Error alerting via Sentry or Railway built-in logs
□ HCS backlog alert: if >100 unprocessed messages, notify me

Documentation:
□ ENTERPRISE-SDK.md committed to /docs
□ All contract ABI files in /contracts/abi/
□ HashScan links for all 3 contracts in README.md
□ DEPLOYMENT.md with exact steps to reproduce this setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.3 Scale Simulation Test (Month 24)

```javascript
// FILE: scripts/scale-simulation.js
// Simulate the Month 24 target load before enterprise launch.
// Target: 500 plants × 20 verifiers × 10,000 sensors

async function runScaleSimulation() {
  const PLANTS    = 500;
  const VERIFIERS = 20;
  const READINGS_PER_PLANT_PER_DAY = 24;  // Hourly readings

  console.log(`Scale simulation: ${PLANTS} plants, ${VERIFIERS} verifiers`);
  const startTime = Date.now();

  // Generate synthetic readings
  const readings = [];
  for (let p = 0; p < PLANTS; p++) {
    for (let h = 0; h < READINGS_PER_PLANT_PER_DAY; h++) {
      readings.push({
        plantId:     `sim-plant-${p}`,
        timestamp:   new Date(Date.now() - (h * 3600 * 1000)).toISOString(),
        flowRate:    8.0 + Math.random() * 4.0,
        headHeight:  42.0 + Math.random() * 6.0,
        efficiency:  0.82 + Math.random() * 0.06,
        powerOutputKw: 2800 + Math.random() * 400
      });
    }
  }

  // Run all readings through MethodologyRouter
  const { MethodologyRouter } = require('../src/engine/methodology-router');
  const router = new MethodologyRouter({});

  let passed = 0, flagged = 0, rejected = 0;
  const errors = [];

  for (const reading of readings) {
    try {
      const result = await router.verifyReading(reading, 'ACM0002');
      if (result.trustScore >= 0.90)      passed++;
      else if (result.trustScore >= 0.50)  flagged++;
      else                                 rejected++;
    } catch (err) {
      errors.push(err.message);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCALE SIMULATION RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total readings processed: ${readings.length}
Passed (trust ≥ 0.90):    ${passed} (${(passed/readings.length*100).toFixed(1)}%)
Flagged (0.50–0.89):      ${flagged} (${(flagged/readings.length*100).toFixed(1)}%)
Rejected (< 0.50):        ${rejected} (${(rejected/readings.length*100).toFixed(1)}%)
Errors:                   ${errors.length}
Total elapsed:            ${elapsed}ms
Per-reading avg:          ${(elapsed/readings.length).toFixed(2)}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

runScaleSimulation().catch(console.error);
```

---

## 7. MONTHS 24–36 — COMPLIANCE & ACCREDITATION

### 7.1 ISO 27001 — Information Security Certification

ISO 27001 is not optional for enterprise buyers or government clients. I start documentation in Month 24 and target the formal audit in Month 28–30. Below is every document I need to write.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISO 27001 MANDATORY DOCUMENTS (Annex A compliance):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ docs/iso/INFORMATION-SECURITY-POLICY.md
  Content: AES-256 at rest, TLS 1.3 in transit, JWT auth only,
           no plaintext credentials in any environment

□ docs/iso/RISK-ASSESSMENT-REGISTER.xlsx
  Rows: data breach, HCS downtime, key theft, physical sensor
        tampering, Railway outage, Hedera network incident
  Columns: Likelihood (1-5), Impact (1-5), Mitigation, Residual Risk

□ docs/iso/ACCESS-CONTROL-POLICY.md
  Matrix: Operator / Buyer / Admin / Developer / Verifier
  Rules: RBAC via JWT, no shared credentials, 2FA on Railway/GitHub

□ docs/iso/INCIDENT-RESPONSE-PLAN.md
  Critical (P1 - 30 min SLA): private key leaked, contract exploited
  High (P2 - 4 hour SLA): API down, HCS lag > 10 minutes
  Medium (P3 - 24 hour SLA): sensor offline, anomaly rate spike

□ docs/iso/BUSINESS-CONTINUITY-PLAN.md
  Hedera failover: Mirror nodes ensure continuity
  Railway failover: AWS Elastic Beanstalk as DR target
  Data recovery: PostgreSQL point-in-time recovery, 7-day retention

□ docs/iso/SUPPLIER-SECURITY-ASSESSMENT.md
  Vendors: Hedera (SOC2 Type II), Railway (SOC2), Vercel (SOC2),
           GitHub (SOC2), Redis (Railway-managed)

□ docs/iso/DATA-CLASSIFICATION-POLICY.md
  PUBLIC: HCS messages, HashScan URLs, token IDs, API responses
  CONFIDENTIAL: Operator keys, buyer DIDs, email addresses
  RESTRICTED: Hedera private keys (env vars only, never in git)

□ docs/iso/AUDIT-LOG-RETENTION-POLICY.md
  HCS: Permanent (Hedera design — immutable by construction)
  PostgreSQL: 7 years
  Railway app logs: 90 days
  API access logs: 1 year

□ docs/iso/ENCRYPTION-STANDARDS.md
  DB: AES-256 PostgreSQL encryption at rest (Railway-managed)
  Transit: TLS 1.3 for all API endpoints (enforced by Vercel/Railway)
  Keys: Hedera private keys in env vars only, never in git history

□ docs/iso/VULNERABILITY-MANAGEMENT-POLICY.md
  Process: npm audit weekly, Dependabot on GitHub, patch SLA 7 days
  Contracts: Re-audit after any code change to staking logic
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimated effort: 40–60 hours of writing
External audit cost: $15,000–$30,000
Target audit date: After 6 months of sustained production operation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7.2 ISO 14064-2 — GHG Project Quantification

This certification is required to sell credits into the compliance market (India CCTS, Singapore MAS, EU Article 6). Without it, I can only sell into the voluntary market.

```
ISO 14064-2 SCOPE:
• Standard: ISO 14064-2:2019 "Quantification, monitoring and reporting of
  GHG emission reductions or removal enhancements"
• Methodology applied: ACM0002 — renewable energy (hydropower)
• Emission factor: India grid CEA 2024 — 0.82 tCO2e/MWh

WHAT THE AUDITOR REVIEWS:
□ My monitoring plan — how I measure generation (5-layer engine)
□ My calculation methodology — P = ρgQHη → MWh → tCO2e avoided
□ My uncertainty quantification — sensor error bounds, Layer 1 tolerance
□ My data quality management — HCS immutability, 7-year retention
□ My verification procedures — Guardian policy + multi-sig
□ Evidence of shadow mode accuracy — variance < 5% vs. manual MRV

TARGET TIMELINE:
  Month 24: Start ISO 14064-2 documentation
  Month 27: Submit for external review
  Month 30: Receive certification (estimated)
  Month 31: Submit to India CCTS as part of PDD
```

### 7.3 Verra VCS Formal Accreditation (Month 27–35)

My shadow mode data (6 months, <5% variance) from Roadmap 2 is the primary evidence. Here is the formal Verra submission process:

```
VERRA VCS SUBMISSION STEPS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Submit dMRV system for VCS methodology approval (Month 27)
  Required:
  → Shadow mode report (6 months, average variance documented)
  → ISO 14064-2 certification (from §7.2 above)
  → DOE (Designated Operational Entity) co-signature
  → PDD Section E: monitoring evidence (HCS links, HashScan TXs)
  → VerificationEngine.sol audit report

Step 2: Verra technical review (3–6 months)
  I respond with:
  → HashScan evidence links for every questioned data point
  → Guardian policy execution logs
  → 7-year HCS audit trail reference
  → Simulation test results from scale-simulation.js

Step 3: Conditional approval
  → First 1,000 credits issued under DOE supervision
  → DOE spot-checks 10% of verifications
  → Zero tolerance for trust score below 0.90 on any spot-checked reading

Step 4: Full approval — credits tradeable on Verra registry
  → Opens compliance market
  → Premium pricing: $20–50/HREC vs. current $10–15 voluntary
  → All future credits automatically qualify for Verra registry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7.4 India CCTS Formal Enrollment (Month 28–33)

```
INDIA CCTS NEXT STEPS (building on Roadmap 2 PDD submission):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Month 28: Follow up on BEE review (submitted in Roadmap 2, Month 4)
  → Reference CCTS Methodology Framework v1.0
  → Attach ISO 14064-2 certification
  → Attach shadow mode results

Month 30: BEE approval expected (4–6 months from Month 4 submission + updates)
  → Methodology approval for digital MRV under CCTS

Month 31: Enroll pilot plants as first India CCTS projects
  → Each plant files individual project registration
  → References my approved PDD (methodology approval)
  → Credits issued on India Carbon Exchange (ICX)

Month 33: First India compliance market credits sold
  → Price target: ₹500–2,000/tonne ($6–24 vs. $10–15 voluntary)
  → Revenue channel active: per-retirement fee on ICX trades
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 7.5 Shadow Mode Comparator — Final Report Generation

```javascript
// FILE: src/validation/shadow-mode-comparator.js — generateVerraReport()
// Called at Month 27 to generate the formal Verra submission report.
// Already implemented in Roadmap 2 — this section covers the final output format.

// MONTH 27 COMMAND TO RUN:
// node -e "
//   const { ShadowModeComparator } = require('./src/validation/shadow-mode-comparator');
//   const comparator = new ShadowModeComparator(require('./src/db/pool'));
//   ['pilot-001', 'pilot-002', 'pilot-003'].forEach(async plantId => {
//     const report = await comparator.generateVerraReport(
//       plantId, '2026-04-01', '2026-10-01'  // 6 months
//     );
//     const fs = require('fs');
//     fs.writeFileSync(
//       `docs/verra/shadow-mode-${plantId}.json`,
//       JSON.stringify(report, null, 2)
//     );
//     console.log(plantId, '→ Avg Variance:', report.summary.avgVariance);
//   });
// "

// EXPECTED OUTPUT FORMAT FOR VERRA SUBMISSION:
// {
//   "plantId": "pilot-001",
//   "reportPeriod": { "start": "2026-04-01", "end": "2026-10-01" },
//   "methodology": "ACM0002",
//   "blockchain": "Hedera HCS 0.0.7462776",
//   "summary": {
//     "totalMonths": 6,
//     "avgVariance": "3.4%",
//     "verraCompliant": true,
//     "overallStatus": "ACCEPTABLE"
//   },
//   "verraSectionReference": "VCS Standard v4.4 Section 4.1.2 — Digital MRV Equivalence"
// }
```

---

## 8. ROADMAP 3 EXIT CRITERIA

By the end of Roadmap 3, if I execute this plan, the system has:

**On-Chain Governance:**
- ✅ `VerifierStaking.sol` deployed on HSCS mainnet — 10% slash enforced by contract, not by me
- ✅ `HRECMinter.sol` deployed — 3-of-5 multi-sig enforced by contract
- ✅ `PlantRegistry.sol` deployed — all 100+ plants registered on-chain
- ✅ All 3 contracts verified on HashScan — anyone can read the code

**Privacy Layer:**
- ✅ `src/security/zkp-proof-generator.js` live — Groth16 proofs from Circom circuits
- ✅ `circuits/mrv.circom` compiled to `.wasm` + `.zkey` — ZKP available for Premium tier
- ✅ Institutional buyers can verify generation bounds without seeing raw telemetry

**Multi-Methodology:**
- ✅ `src/engine/methodology-router.js` routes ACM0002 (Hydro), AMS-I.D (Solar), AMS-I.F (Wind)
- ✅ Each engine implements 5-layer verification — Layer 1 physics differs, Layers 2–5 identical
- ✅ Adding Biomass (AMS-I.C) requires writing `biomass-engine.js` — nothing else changes

**Enterprise SDK:**
- ✅ `POST /api/v2/enterprise/deploy-fleet` — deploys dMRV for 100 plants in one API call
- ✅ Webhook push for HREC_MINTED, CLAIM_APPROVED, ANOMALY_FLAGGED events
- ✅ White-label config — enterprise buyers see their own brand on certificates

**Mainnet:**
- ✅ Every claim, every contract call, every slash event visible on HashScan
- ✅ No component that is only "in code" — everything that matters has an on-chain TX ID

**Compliance:**
- ✅ ISO 27001 documentation complete (audit in progress or complete)
- ✅ ISO 14064-2 certification received — GHG quantification methodology approved
- ✅ Verra VCS conditional approval — first 1,000 credits issued under supervision
- ✅ India CCTS enrollment live — pilot plants registered on India Carbon Exchange

**Scale:**
- ✅ 500-plant simulation passes without errors
- ✅ ADWIN drift detection running on 4 seasonal models — false positive rate < 3%
- ✅ ZKP proof generation tested on 10,000-reading batch

**No claim in this roadmap is made without a corresponding GitHub commit, HashScan TX, or external certification document. If it cannot be shown, it will not be claimed.**

---

## 9. MILESTONE SUMMARY TABLE

| Month | Code Deliverable | Infrastructure | Compliance |
|---|---|---|---|
| **13** | verifier-staking.js updated (10% slash) | Off-chain governance bridge | Verra follow-up (Month 9 data ready) |
| **14** | VerifierStaking.sol written + tests | Hardhat + HSCS testnet config | ISO 27001 docs start |
| **15** | HRECMinter.sol + PlantRegistry.sol | 3 contracts on HSCS testnet | ISO 27001 risk register |
| **16** | zkp-proof-generator.js (snarkjs) | circuits/mrv.circom compiled | ISO 27001 incident response |
| **17** | ZKP API endpoints live | 3 contracts on HSCS mainnet (post-audit) | ISO 27001 docs complete |
| **18** | methodology-router.js skeleton | Scale simulation test v1 | ISO 27001 external audit submitted |
| **19** | solar-engine.js (AMS-I.D) | Solar engine on testnet | — |
| **20** | wind-engine.js (AMS-I.F) | Wind engine on testnet | ISO 14064-2 docs start |
| **21** | enterprise-sdk.js /deploy-fleet | Enterprise SDK on mainnet | — |
| **22** | Enterprise webhooks + portfolio API | First enterprise demo ready | — |
| **24** | scale-simulation.js (500 plants) | Scale test passes | ISO 27001 certification expected |
| **26** | Biomass engine (AMS-I.C) skeleton | 4 methodologies on mainnet | ISO 14064-2 submitted |
| **27** | Shadow mode Verra report generated | — | Verra formal submission |
| **28** | Active learning feedback loop | — | BEE India CCTS follow-up |
| **30** | v2.0.0 enterprise release tag | All contracts production-verified | ISO 14064-2 certification expected |
| **31** | /docs/verra/ submission package | — | Verra conditional approval |
| **33** | India ICX integration endpoint | — | India CCTS credits live on ICX |
| **35** | Full compliance automation | — | Verra full approval |
| **36** | v3.0.0 mainnet release | 100+ plants, 3+ methodologies | All certifications active |

---

*Author: Bikram Biswas | Repo: [BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-) | Version: V3.0 | March 24, 2026*
