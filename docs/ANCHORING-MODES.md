# Anchoring Modes — Hedera Hydropower dMRV

> **Source of truth**: `src/config/default-config.js`, `src/workflow.js`  
> **Last verified**: February 2026

The system supports five execution modes that control how telemetry readings are
anchored to Hedera Consensus Service (HCS). Choosing the right mode trades off
cost, auditability, and latency.

---

## Mode Overview

| Mode | `executionMode` value | Hedera txns / reading | Est. cost / REC | Best for |
|------|-----------------------|-----------------------|-----------------|----------|
| Transparent Classic | `transparent-classic` | 1 per reading | ~$0.0028 | Audits, Verra submission |
| Efficient Transparent | `efficient-transparent` | 1 per batch (10) | ~$0.00028 | Regular monitoring |
| Project Dashboard | `project-dashboard` | Daily rollup | ~$0.00003 | Large portfolios |
| Audit-Friendly Compressed | `audit-compressed` | 1 per Merkle root | ~$0.00001 | High-volume pilots |
| Extreme Cost Saver | `extreme-cost-saver` | Monthly root only | ~$0.000003 | 500-plant scenario |

> ⚠️ All costs are Hedera **testnet** estimates. Mainnet HBAR price will vary.

---

## Mode 1 — Transparent Classic (`transparent-classic`)

### What it does
Every single telemetry reading is published as an individual HCS message to
the audit topic. Each message contains the full attestation envelope:
device ID, timestamp, trust score, verification status, and ACM0002 calculation
results.

### When to use
- Preparing for Verra VVB audit
- Hackathon demos where judge needs to verify every transaction on HashScan
- Any scenario where maximum per-reading traceability is required

### Configuration
```js
const workflow = new Workflow({
  projectId: 'HYDROPOWER-DEMO-001',
  deviceId:  'TURBINE-1',
  gridEmissionFactor: 0.8,
  executionMode: 'transparent-classic'
});
```

### Hedera footprint
- **1 HCS `TopicMessageSubmit` per reading**
- Topic: `0.0.7462776` (Gateway DID topic on testnet)
- Each message ~512 bytes JSON

### Cost breakdown (testnet observed)
| Item | Cost |
|------|------|
| HCS message fee | $0.0001 |
| AI verifier compute | $0.0015 |
| Attestation storage | $0.0012 |
| **Total per REC** | **~$0.0028** |

---

## Mode 2 — Efficient Transparent (`efficient-transparent`)

### What it does
Readings are buffered in memory and published as a batch of 10 to HCS.
Each batch message contains an array of attestation summaries plus a
SHA-256 hash of the full payload for integrity verification.

### When to use
- Daily automated monitoring across multiple turbines
- When you want full transparency at lower cost
- Pilot plants with 24×7 IoT feed (every 15 min = 96 readings/day)

### Configuration
```js
const workflow = new Workflow({
  executionMode: 'efficient-transparent',
  batchSize: 10
});
```

### Cost vs. Transparent Classic
~10× cheaper per reading. Batch of 10 = $0.0028 total vs $0.028 for
10 individual messages.

---

## Mode 3 — Project Dashboard (`project-dashboard`)

### What it does
A daily rollup is published at midnight UTC. The message contains:
- Total readings processed
- Total kWh generated
- Total tCO2e avoided
- Average trust score
- Count of APPROVED / FLAGGED / REJECTED
- SHA-256 of all individual attestation IDs

### When to use
- Large projects with 10+ devices
- When a dashboard or external portal is consuming the HCS feed
- Phase 3+ after pilot validation is complete

### Configuration
```js
const workflow = new Workflow({
  executionMode: 'project-dashboard',
  rollupSchedule: 'daily'
});
```

---

## Mode 4 — Audit-Friendly Compressed (`audit-compressed`)

### What it does
Readings are aggregated into a Merkle tree. Only the Merkle root hash is
published to HCS. Individual reading proofs are stored off-chain
(local file or IPFS) and can be presented to a VVB on demand.

### Merkle structure
```
Merkle Root (published to HCS)
├── Batch 1 (readings 1-100)
│   ├── Reading 1 hash
│   ├── Reading 2 hash
│   └── ...
└── Batch 2 (readings 101-200)
    └── ...
```

### When to use
- Pre-pilot when costs matter but auditability must be preserved
- Projects with >1000 readings/day
- When off-chain storage (IPFS) is available

### Configuration
```js
const workflow = new Workflow({
  executionMode: 'audit-compressed',
  merkleDepth: 8,
  offChainStorage: 'ipfs'
});
```

---

## Mode 5 — Extreme Cost Saver (`extreme-cost-saver`)

### What it does
One HCS message per month containing the Merkle root of the entire
month's readings. All individual proofs are stored locally in
`evidence/` directory and signed with the operator key.

### Use case: 500-plant scenario
| Scale | Monthly HCS txns | Monthly cost |
|-------|------------------|--------------|
| 1 plant | 1 | ~$0.0001 |
| 10 plants | 10 | ~$0.001 |
| 100 plants | 100 | ~$0.01 |
| 500 plants | 500 | ~$0.05 |

### Configuration
```js
const workflow = new Workflow({
  executionMode: 'extreme-cost-saver',
  rollupSchedule: 'monthly',
  offChainStorage: 'local'
});
```

---

## Mode Selection Decision Tree

```
Are you preparing for Verra VVB audit?
  └─ YES → transparent-classic
  └─ NO → Do you need per-reading HashScan links?
       └─ YES → transparent-classic or efficient-transparent
       └─ NO → How many readings/day?
            └─ < 100  → project-dashboard
            └─ 100-1000 → audit-compressed
            └─ > 1000 → extreme-cost-saver
```

---

## Related Files

- `src/workflow.js` — `executionMode` is read in `submitReading()`
- `src/config/default-config.js` — default thresholds (AI verifier, weights)
- `src/engine/v1/engine-v1.js` — physics verification applied before anchoring
- `docs/ENGINE-V1.md` — engine internals documentation
- `docs/COST-ANALYSIS.md` — full cost breakdown for 500-plant scenario
