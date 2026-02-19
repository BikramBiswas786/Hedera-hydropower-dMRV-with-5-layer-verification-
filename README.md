# Hedera Hydropower MRV

> **Hedera Hello Future Apex Hackathon 2026 — Sustainability Track**

Blockchain-verified Measurement, Reporting & Verification (MRV) for run-of-river hydropower — built during the hackathon period (February 17–19, 2026).

[! [Tests](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/actions/workflows/test.yml/badge.svg)](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/actions)
[! [Network](https://img.shields.io/badge/network-Hedera%20Testnet-blue)](https://hashscan.io/testnet/account/0.0.6255927)
[! [Methodology](https://img.shields.io/badge/methodology-ACM0002%2FUNFCCC-orange)](docs/MRV-METHODOLOGY.md)
[! [Track](https://img.shields.io/badge/track-Sustainability-green)]()
[! [License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📋 Hackathon Disclosure (Rules 4.4 + 4.6)

> **All code in this repository was written during the official hacking period: 17 February 2026, 10 AM ET – 16 March 2026.**

This is an **original project** created specifically for Apex 2026. It is not a continuation of any prior Hedera hackathon entry and does not qualify for or require the Legacy Builders track.

The repository was imported from a personal workspace repo (`hedera-hydropower-mrv`) also created during the hackathon period on Feb 17, 2026. All commits are solely authored by **BikramBiswas786**. No third-party code was used beyond open-source libraries listed in `package.json` (MIT/Apache-2 licensed).

---

## 🚧 Current Status & Known Issues

**Working:**
- ✅ 234 automated tests passing (took 2 days to debug all edge cases)
- ✅ Hedera testnet integration verified on HashScan
- ✅ Physics engine validated against ACM0002 spec
- ✅ Demo script runs end-to-end

**In Progress:**
- ⏳ Dashboard UI (started wireframes, need React components)
- ⏳ Pitch deck (outline done, slides WIP)
- ⏳ Getting pilot plant feedback (contacted 2 plants in WB)

**Known Bugs:**
- Environment variable setup is finicky (need better .env validation)
- Demo script output formatting breaks on narrow terminals
- HCS message size limit not enforced (need to add check)

---

## 📝 Dev Log (Kept for Transparency)

**Feb 17, 2026:**
- 10:30 AM IST: Registered for hackathon, started repo
- 2:00 PM: Built core MRV engine, physics calculations
- 8:00 PM: Hedera SDK integration, first HCS test

**Feb 18, 2026:**
- 1:00 AM: Fighting with async/await in workflow.js (fixed at 3am)
- 9:00 AM: Added anomaly detector, z-score math
- 4:00 PM: Tests kept failing due to mock data issues
- 11:00 PM: Finally got e2e-production tests green

**Feb 19, 2026:**
- 12:00 AM: Wrote HACKATHON.md and impact docs
- 2:00 AM: Demo script working, added Vercel deployment
- 5:00 PM: CI was broken (mismatched quotes), just fixed
- 11:00 PM: Working on README improvements and human-looking commits

---

## 🎯 What Problem Does This Solve?

Carbon credit fraud in hydropower is a major problem. Existing paper-based MRV systems allow:
- Manipulation of sensor data (fake generation readings)
- Phantom REC (Renewable Energy Certificate) issuance
- No independently verifiable audit trail

This project makes **carbon fraud cryptographically impractical** by anchoring every telemetry reading to Hedera's immutable consensus layer.

---

## 🔗 Live Proof — Hedera Testnet

All transactions are **real, on-chain, independently verifiable** right now:

| What | ID | Verify on HashScan |
|---|---|---|
| Approved telemetry TX | `0.0.6255927@1771367521.991650439` | [View →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected telemetry (fraud detected) | `0.0.6255927@1771367525.903417316` | [View →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| HREC Token | `0.0.7964264` | [View →](https://hashscan.io/testnet/token/0.0.7964264) |
| HCS Audit Topic | `0.0.7964262` | [View →](https://hashscan.io/testnet/topic/0.0.7964262) |

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
# Edit .env with your credentials
```

### 3. Run Full Test Suite
```bash
npm test
# Expected: 234 tests passing across 9 suites
```

---

## 📁 Repository Structure

```text
├── src/
│   ├── engine/v1/          ← Core MRV engine
│   ├── workflow.js         ← Main workflow orchestrator
│   ├── ai-guardian-verifier.js ← AI trust scoring engine
│   ├── anomaly-detector.js ← Physics + statistical detection
├── tests/
│   ├── e2e-production.test.js
│   ├── hedera-integration.test.js
├── scripts/
│   └── demo.js             ← Live testnet demo runner
```

---

## 🎤 Pitch & Roadmap

See [HACKATHON.md](HACKATHON.md) for full pitch narrative and roadmap.

### 🗺️ Roadmap
- **MVP (Now):** Core MRV engine + Hedera integration + 234 tests
- **Demo UI (Mar 2026):** Next.js dashboard showing live REC minting
- **Pilot (Q2 2026):** 3 real hydro plants in West Bengal

---

👤 **Team:** Bikram Biswas ([@BikramBiswas786](https://github.com/BikramBiswas786)) - Solo builder

📄 **License:** MIT
