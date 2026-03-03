# System Architecture

**Last reviewed**: March 4, 2026

---

## System Components

```
┌─────────────────────────────────────────────────────────┐
│                    IoT Sensor Layer                     │
│  Flow sensor · Pressure transducer · Power meter        │
│  Water quality probe (pH, turbidity, temperature)       │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTPS POST /api/v1/telemetry
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   API Gateway (Express)                 │
│  • Rate limiting (Redis-backed)                         │
│  • API key authentication                               │
│  • Input validation                                     │
│  • Replay protection (Redis)                            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│             Verification Engine (engine-v1)             │
│  Layer 1: Physics      (30%)                            │
│  Layer 2: Temporal     (25%)                            │
│  Layer 3: Environmental(20%)                            │
│  Layer 4: Statistical  (15%)                            │
│  Layer 5: Device       (10%)                            │
│  → Weighted trust score → APPROVED / FLAGGED / REJECTED │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌──────────────────┐    ┌──────────────────────────────┐
│  Hedera HCS      │    │  Carbon Credit Engine        │
│  Topic: 7462776  │    │  ACM0002 ER calculation      │
│  Immutable audit │    │  HREC minting (HTS 7964264)  │
└──────────────────┘    └──────────────────────────────┘
```

---

## Directory Structure

```
├── src/
│   ├── api/
│   │   └── v1/
│   │       └── telemetry.js     # POST /api/v1/telemetry handler
│   ├── engine/
│   │   └── engine-v1.js         # 5-layer verification engine
│   ├── hedera/
│   │   ├── hcs.js               # Hedera Consensus Service client
│   │   └── hts.js               # Hedera Token Service client
│   ├── middleware/
│   │   ├── auth.js              # API key validation
│   │   ├── rateLimiter.js       # Redis rate limiter
│   │   └── replayProtection.js  # Duplicate submission prevention
│   └── workflow.js              # Orchestration layer
├── tests/
│   ├── unit/                    # Engine, ACM0002, trust score tests
│   ├── integration/             # Workflow + mocked Hedera SDK
│   └── e2e/                     # End-to-end API tests
├── docs/                        # All documentation (this directory)
├── RUN_TESTS.ps1                # PS1-PS6 production verification script
├── .env.example                 # Environment variable template
└── vercel.json                  # Vercel deployment config
```

---

## Hedera Integration

### Hedera Consensus Service (HCS)

Every telemetry reading — regardless of APPROVED/FLAGGED/REJECTED status — is written as a JSON message to HCS topic `0.0.7462776`. This creates an immutable, ordered, timestamped audit trail that cannot be altered by any party, including the system operator.

The HCS message schema:
```json
{
  "reading_id":    "RDG-PLANT-ALPHA-XXXXXXXX",
  "plant_id":      "PLANT-ALPHA",
  "device_id":     "TURBINE-001",
  "timestamp":     1772566213769,
  "trust_score":   0.985,
  "decision":      "APPROVED",
  "flags":         [],
  "carbon_tco2e":  0.72,
  "submitted_at":  "2026-03-04T01:30:13Z"
}
```

### Hedera Token Service (HTS)

For APPROVED readings, HREC (Hedera Renewable Energy Certificate) tokens are minted on HTS token `0.0.7964264`. Each token represents 1 MWh of verified generation. Tokens are fungible and can be transferred or retired on-chain.

### Why Hedera

| Property | Hedera | Ethereum (for comparison) |
|---|---|---|
| Finality | 3–5 seconds | ~13 minutes (PoS) |
| Cost per transaction | ~$0.0001 | $0.50–$50 |
| Energy consumption | Carbon-negative | ~0.05 kWh/tx |
| Governance | Council of 39 enterprises | Open/community |

---

## Data Flow: Single Reading (Happy Path)

1. IoT device POSTs telemetry to `/api/v1/telemetry` with `x-api-key` header.
2. Auth middleware validates the API key. Rejects with 401 if invalid.
3. Rate limiter checks the per-key request quota. Rejects with 429 if exceeded.
4. Input validator checks required fields and physics plausibility. Rejects with 400 if invalid.
5. Replay protection checks for duplicate `plant_id + device_id + timestamp`. Rejects with 409 if seen.
6. Verification engine runs all 5 layers and computes trust score.
7. HCS client writes the full result to the audit topic.
8. If APPROVED: HTS client mints HREC tokens.
9. API returns the full verification result with transaction ID and HashScan URL.

**Total latency** (testnet): ~1.5–2.5 seconds.

---

## Deployment Topology

### Current (Testnet)
- API: Vercel serverless functions at `hydropower-mrv-19feb26.vercel.app`
- Redis: WSL-hosted Redis 7.2.9 (development only)
- Hedera: Testnet

### Target (Mainnet / Production)
- API: Vercel Pro or dedicated Node.js server
- Redis: Managed Redis (Upstash, Redis Cloud, or AWS ElastiCache)
- Hedera: Mainnet
- Monitoring: Prometheus + Grafana

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full configuration details.
