# 🌊 Hedera Hydropower MRV

> **Blockchain-verified Measurement, Reporting & Verification for run-of-river hydropower — built on Hedera Hashgraph**

[![Tests](https://img.shields.io/badge/tests-224%20passing-brightgreen)](evidence/EVIDENCE.md)
[![Suites](https://img.shields.io/badge/suites-9%20passing-brightgreen)](evidence/EVIDENCE.md)
[![Network](https://img.shields.io/badge/network-Hedera%20Testnet-blue)](https://hashscan.io/testnet/account/0.0.6255927)
[![Methodology](https://img.shields.io/badge/methodology-ACM0002-orange)](docs/MRV-METHODOLOGY.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 🔬 What This Solves

Carbon credit fraud in hydropower is a $4B+ problem. Paper-based MRV systems allow manipulation of generation data, phantom RECs, and unverifiable audit trails.

This system makes fraud **cryptographically impossible**:

| Problem | Solution |
|---------|----------|
| Fake generation data | Physics-based AI anomaly detector rejects implausible readings |
| No audit trail | Every reading hashed and submitted to Hedera HCS (immutable) |
| Unverifiable RECs | Hedera Token Service mints RECs only after AI guardian approval |
| Trust gap | On-chain attestation with trust score, DID-linked device identity |

---

## 🏗️ Architecture (3-Line Summary)

1. **Sensor telemetry** → AI Guardian verifies physics (flow rate × head × efficiency = power)
2. **Verified reading** → Hedera HCS topic (immutable, timestamped, globally verifiable)
3. **Approved reading** → HTS mints REC tokens tied to device DID on Hedera

---

## ✅ Live Proof — Hedera Testnet

All transactions below are **real, on-chain, independently verifiable**:

| What | ID | Verify |
|------|----|--------|
| Approved TX | `0.0.6255927@1771367521.991650439` | [HashScan ↗](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected TX (fraud detected) | `0.0.6255927@1771367525.903417316` | [HashScan ↗](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| REC Token `HREC` | `0.0.7964264` | [HashScan ↗](https://hashscan.io/testnet/token/0.0.7964264) |
| HCS Audit Topic | `0.0.7964262` | [HashScan ↗](https://hashscan.io/testnet/topic/0.0.7964262) |
| Device DID | `did:hedera:testnet:z485944524f2d54555242494e452d31` | — |

→ **Full evidence:** [evidence/EVIDENCE.md](evidence/EVIDENCE.md)

---

## 🚀 Quick Start (3 Commands)

```bash
git clone https://github.com/BikramBiswas786/hedera-hydropower-mrv.git
cd hedera-hydropower-mrv
npm install && npm test
```

### Configure .env

```text
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT
HEDERA_OPERATOR_KEY=your_ed25519_private_key
AUDIT_TOPIC_ID=0.0.YOUR_TOPIC_ID
EF_GRID=0.8
```

---

## 🧪 Test Results

| Suite | Tests | What It Proves |
|-------|-------|----------------|
| e2e-production.test.js | 11 | Full pipeline: DID → token → telemetry → REC → audit |
| complete-workflow.test.js | 18 | Live Hedera testnet, 1000-reading perf benchmark |
| hedera-integration.test.js | 56 | HCS topics, HTS tokens, transactions, accounts |
| ai-guardian-verifier.test.js | 27 | Trust scoring, auto-approval thresholds |
| verifier-attestation.test.js | 22 | Cryptographic signing, ACM0002 calculations |
| engine-v1.test.js | 7 | Full EngineV1 verification pipeline |
| anomaly-detector.test.js | 22 | Physics, temporal, environmental, statistical |
| unit/anomaly-detector.test.js | 21 | Isolated unit coverage |
| configuration-validator.test.js | 50 | Config, reading, environment schema |
| **TOTAL** | **224 ✅** | All passing — 0 failures |

### Performance Benchmarks

| Benchmark | Target | Actual |
|-----------|--------|--------|
| 100 readings E2E | < 30s | 5.2s ✅ |
| 1000 readings batch | < 60s | ~20s ✅ |
| Single verification decision | < 50ms | < 5ms ✅ |

---

## 📐 How Verification Works

```text
Sensor Reading
     │
     ▼
┌─────────────────────────────────┐
│      AI Guardian Verifier       │
│  ┌──────────────────────────┐   │
│  │ 1. Physics Check         │   │  P = ρ·g·Q·H·η
│  │ 2. Temporal Consistency  │   │  Δ between readings
│  │ 3. Environmental Bounds  │   │  pH / turbidity / temp
│  │ 4. Statistical Anomaly   │   │  z-score > 3 → flag
│  └──────────────────────────┘   │
│         Trust Score 0–100%      │
└────────────┬────────────────────┘
             │
    ┌────────▼────────┐
    │ ≥ 90% APPROVED  │──→ Hedera HCS (immutable record)
    │ 70–89% FLAGGED  │──→ HCS + manual review queue
    │ < 70% REJECTED  │──→ HCS (fraud evidence preserved)
    └─────────────────┘
             │ APPROVED only
             ▼
    Hedera Token Service
    Mint HREC tokens = MWh generated
```

---

## 🗂️ Repository Structure

```text
src/
  engine/v1/         ← Core MRV engine
  verifier/          ← AI Guardian + attestation
  anomaly/           ← Physics / temporal / statistical detectors
  hedera/            ← HCS, HTS, DID integration
tests/
  e2e-production.test.js     ← Full E2E live test
  complete-workflow.test.js  ← Performance benchmark
  hedera-integration.test.js ← Hedera mock + live
  ...
evidence/
  EVIDENCE.md        ← Live testnet proof
  HASHSCAN-LINKS.md  ← Clickable TX verification
  raw-test-output.txt← Full Jest output
docs/
  ARCHITECTURE.md    ← System design
  SECURITY.md        ← Key management, threat model
  MRV-METHODOLOGY.md ← ACM0002 alignment
```

---

## 🔗 Methodology Alignment

- **ACM0002** — UNFCCC/Verra consolidated baseline for grid-connected renewables (run-of-river hydro) [→ docs/MRV-METHODOLOGY.md](docs/MRV-METHODOLOGY.md)
- **Hedera Guardian** — Policy engine alignment path for Verra VCS issuance
- **DID standard** — W3C Decentralized Identifiers for device identity on Hedera

---

## 🤝 Funding & Partnerships

This project is built for:

- [Hedera Foundation](https://hedera.foundation/) Sustainability Grant
- [Climate Collective](https://climatecollective.org/) ReFi ecosystem
- Verra VCS registry integration

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

**Built with ❤️ on Hedera Hashgraph · All test transactions verifiable on HashScan**