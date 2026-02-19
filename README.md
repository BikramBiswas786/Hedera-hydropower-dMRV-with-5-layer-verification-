# Hedera Hydropower MRV

> **Hedera Hello Future Apex Hackathon 2026 — Sustainability Track**

Blockchain-verified Measurement, Reporting & Verification (MRV) for run-of-river hydropower — built entirely on Hedera Hashgraph during the hackathon period (February 17–19, 2026).

[![Tests](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/actions/workflows/test.yml/badge.svg)](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/actions)
[![Network](https://img.shields.io/badge/network-Hedera%20Testnet-blue)](https://hashscan.io/testnet/account/0.0.6255927)
[![Methodology](https://img.shields.io/badge/methodology-ACM0002%2FUNFCCC-orange)](docs/MRV-METHODOLOGY.md)
[![Track](https://img.shields.io/badge/track-Sustainability-green)]()
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📋 Hackathon Disclosure (Rules 4.4 + 4.6)

> **All code in this repository was written during the official hacking period: 17 February 2026, 10 AM ET – 16 March 2026.**
>
> This is an **original project** created specifically for Apex 2026. It is not a continuation of any prior Hedera hackathon entry and does not qualify for or require the Legacy Builders track.
>
> The repository was imported from a personal workspace repo (`hedera-hydropower-mrv`) also created during the hackathon period on Feb 17, 2026. All commits are solely authored by **BikramBiswas786**. No third-party code was used beyond open-source libraries listed in `package.json` (MIT/Apache-2 licensed).

---

## 🎯 What Problem Does This Solve?

Carbon credit fraud in hydropower is a **multi-billion dollar problem**. Existing paper-based MRV systems allow:

- Manipulation of sensor data (fake generation readings)
- Phantom REC (Renewable Energy Certificate) issuance
- No independently verifiable audit trail
- No cryptographic proof of device identity

This project makes **carbon fraud cryptographically impractical** by anchoring every telemetry reading to Hedera's immutable consensus layer.

---

## 🏗️ Architecture

```
Sensor Telemetry (flow, head, pH, turbidity)
          │
          ▼
┌─────────────────────────────┐
│     AI Guardian Verifier    │  ← Physics check: P = ρ·g·Q·H·η
│  • Temporal consistency     │  ← Delta between consecutive readings
│  • Environmental bounds     │  ← pH, turbidity, temperature
│  • Statistical z-score      │  ← Flags readings > 3σ from baseline
│  • Trust Score 0–100%       │
└────────────┬────────────────┘
             │
    ┌────────▼────────┐
    │ ≥90% APPROVED   │──▶ Hedera HCS (immutable audit record)
    │ 70–89% FLAGGED  │──▶ HCS + manual review queue
    │  <70% REJECTED  │──▶ HCS (fraud evidence preserved on-chain)
    └────────┬────────┘
             │ APPROVED only
             ▼
    Hedera Token Service
    Mint HREC tokens (1 token = 1 MWh verified)
             │
             ▼
    Device DID (W3C + Hedera)
    Cryptographic device identity anchored on-chain
```

---

## 🔗 Live Proof — Hedera Testnet

All transactions are **real, on-chain, independently verifiable** right now:

| What | ID | Verify on HashScan |
|------|-----|--------------------|
| Approved telemetry TX | `0.0.6255927@1771367521.991650439` | [View →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected telemetry (fraud detected) | `0.0.6255927@1771367525.903417316` | [View →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| HREC Token | `0.0.7964264` | [View →](https://hashscan.io/testnet/token/0.0.7964264) |
| HCS Audit Topic | `0.0.7964262` | [View →](https://hashscan.io/testnet/topic/0.0.7964262) |
| Operator Account | `0.0.6255927` | [View →](https://hashscan.io/testnet/account/0.0.6255927) |
| Device DID | `did:hedera:testnet:z485944524f2d54555242494e452d31` | — |

Full evidence log: [evidence/EVIDENCE.md](evidence/EVIDENCE.md)

---

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env:
# HEDERA_OPERATOR_ID=0.0.6255927
# HEDERA_OPERATOR_KEY=your_ed25519_private_key
# AUDIT_TOPIC_ID=0.0.7964262
# EF_GRID=0.8
```

### 3. Run Full Test Suite

```bash
npm test
# Expected: 224 tests passing across 9 suites
```

### 4. Run Live Demo (Testnet)

```bash
node scripts/demo.js
# Submits a real telemetry reading, verifies via AI Guardian,
# anchors to HCS, and mints an HREC token — all on Hedera Testnet
```

---

## ✅ Test Coverage

| Suite | Tests | Coverage |
|-------|-------|----------|
| `e2e-production.test.js` | 11 | Full E2E: DID → token → telemetry → REC → audit |
| `complete-workflow.integration.test.js` | 18 | Live Hedera testnet + 1000-reading performance |
| `hedera-integration.test.js` | 56 | HCS topics, HTS tokens, transactions, accounts |
| `ai-guardian-verifier.test.js` | 27 | Trust scoring, auto-approval thresholds |
| `verifier-attestation.test.js` | 22 | Cryptographic signing, ACM0002 calculations |
| `engine-v1.test.js` | 7 | Full EngineV1 verification pipeline |
| `anomaly-detector.test.js` | 22 | Physics, temporal, environmental, statistical |
| `unit/anomaly-detector.test.js` | 21 | Isolated anomaly detector unit coverage |
| `configuration-validator.test.js` | 50 | Config, reading, environment schema validation |
| **Total** | **234** | **All passing — 0 failures** |

### Performance

| Benchmark | Target | Actual |
|-----------|--------|--------|
| 100 readings E2E | < 30 s | ~5.2 s |
| 1000 readings batch | < 60 s | ~20 s |
| Single verification | < 50 ms | < 5 ms |

---

## 📁 Repository Structure

```
https-github.com-BikramBiswas786-hedera-hydropower-mrv/
├── src/
│   ├── engine/v1/              ← Core MRV engine (engine-v1.js, validator.js, ...)
│   ├── workflow.js             ← Main workflow orchestrator
│   ├── ai-guardian-verifier.js ← AI trust scoring engine
│   ├── anomaly-detector.js     ← Physics + statistical anomaly detection
│   └── verifier-attestation.js ← ACM0002 calculations + signing
├── tests/
│   ├── e2e-production.test.js
│   ├── hedera-integration.test.js
│   ├── ai-guardian-verifier.test.js
│   ├── integration/complete-workflow.integration.test.js
│   └── unit/
├── evidence/
│   ├── EVIDENCE.md             ← Live testnet proof with TXIDs
│   └── HASHSCAN-LINKS.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── MRV-METHODOLOGY.md      ← ACM0002/UNFCCC alignment
│   ├── SECURITY.md
│   ├── ENGINE-V2-TWO-TIER-MODES.md
│   └── SMART-SAMPLING-STRATEGY.md
├── scripts/
│   └── demo.js                 ← Live testnet demo runner
├── .github/workflows/test.yml  ← CI with Hedera testnet creds
├── jest.config.js
├── package.json
└── .env.example
```

---

## 🧠 Judging Criteria Alignment

### 🔬 Innovation (10%)
First on-chain MRV system combining **ACM0002 physics-based AI anomaly detection** with **Hedera HCS immutable audit trails** and **HTS token-backed RECs**. Novel AI Guardian scoring layer (0–100% trust) enables graduated responses: approve, flag, or reject — all recorded on-chain. No comparable open-source system exists on Hedera.

### ⚙️ Feasibility (10%)
Fully executable on Hedera Testnet today with real transaction IDs. The system is designed around ACM0002 (UNFCCC), the most-used carbon methodology for hydropower globally. The business model is clear: MRV-as-a-service fee per verified MWh, with Verra/Gold Standard integration path.

### 🛠️ Execution (20%)
- ✅ 234 automated tests passing (9 suites)
- ✅ Live Hedera Testnet transactions verifiable on HashScan
- ✅ CI/CD pipeline via GitHub Actions
- ✅ Full physics engine, anomaly detector, HCS/HTS/DID integration
- ✅ Clear README, deployment guide, and environment setup
- 🔲 Dashboard UI (in progress — see roadmap)

### 🔌 Integration (15%)
Deep Hedera-native integration:
- **HCS** — every telemetry reading anchored as immutable message
- **HTS** — HREC token minted per verified MWh
- **DID** — W3C Decentralized Identifier for each sensor device
- **Hedera SDK** — full use of `@hashgraph/sdk` v2 for all on-chain operations
- **ACM0002** — UNFCCC baseline methodology for emission factor calculations

### 🌍 Success Potential (20%)
Global voluntary carbon market is **$50B+ and growing**. Run-of-river hydropower represents ~16% of global electricity. Every 1 GWh verified = ~800 tCO₂ credits worth $8,000–$24,000 at current prices. The system targets:
- 500+ hydro plants in South/Southeast Asia (immediate addressable market)
- Integration path with Hedera Guardian for Verra VCS issuance
- Potential for Hedera network: thousands of TPS for real-time telemetry anchoring

### 📊 Validation (15%)
- Live Hedera Testnet proof: verified transactions and minted HREC tokens
- ACM0002 methodology alignment validated against UNFCCC documentation
- Performance benchmarks: 1000 readings in ~20 seconds, < 5ms per verification
- Evidence directory contains full, timestamped on-chain proof

### 🎤 Pitch (10%)
See [HACKATHON.md](HACKATHON.md) for full pitch narrative, market sizing, and roadmap.

---

## 🗺️ Roadmap

| Phase | Timeline | Milestone |
|-------|----------|-----------|
| MVP | Feb 2026 (now) | Core MRV engine + Hedera integration + 234 tests |
| Demo UI | Mar 2026 | Next.js dashboard showing live REC minting + HCS feed |
| HOL Agent | Mar 2026 | Wrap AIGuardianVerifier as HCS-10 agent in HOL Registry |
| Pilot | Q2 2026 | 3 real hydro plants in India (West Bengal / Northeast) |
| Verra Integration | Q3 2026 | Guardian policy engine → live VCS issuance |
| Scale | Q4 2026 | 50+ plants, multi-chain evidence anchoring |

---

## 🔐 Methodology

- **ACM0002** (UNFCCC/Verra) — Consolidated baseline for grid-connected renewable electricity
- **Physics formula**: P = ρ · g · Q · H · η (density × gravity × flow × head × efficiency)
- **W3C DID** — Device identity: `did:hedera:testnet:...`
- **Hedera Guardian** — alignment path for automated Verra VCS policy execution

Full methodology doc: [docs/MRV-METHODOLOGY.md](docs/MRV-METHODOLOGY.md)

---

## 🛡️ Third-Party Credits (Rule 4.7 + 4.8)

| Library | License | Use |
|---------|---------|-----|
| `@hashgraph/sdk` | Apache-2.0 | Hedera HCS / HTS / DID operations |
| `jest` | MIT | Test runner |
| `ajv` | MIT | JSON schema validation |
| `dotenv` | BSD-2-Clause | Environment config |

All other code is original, written during the hackathon period.

---

## 👤 Team

| Name | GitHub | Role |
|------|--------|------|
| Bikram Biswas | [@BikramBiswas786](https://github.com/BikramBiswas786) | Solo builder — full-stack |

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

*Built on Hedera Hashgraph. All test transactions are independently verifiable on [HashScan](https://hashscan.io/testnet).*
