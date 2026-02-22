# Validation Evidence

> **Judging criterion: Validation (15% weight)**
> This document provides market research, technical validation, community feedback,
> and outreach evidence for Hedera Hydropower MRV.

---

##  Technical Validation

### 1. Live Hedera Testnet Proof

The system has executed **real transactions** on Hedera Testnet:

| Transaction | TXID | Result |
|-------------|------|--------|
| Approved telemetry (trust score 94%) | `0.0.6255927@1771367521.991650439` | [Verify →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected telemetry (fraud detected) | `0.0.6255927@1771367525.903417316` | [Verify →](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| HREC Token created | `0.0.7964264` | [Verify →](https://hashscan.io/testnet/token/0.0.7964264) |
| HCS Audit Topic | `0.0.7964262` | [Verify →](https://hashscan.io/testnet/topic/0.0.7964262) |

These are **not simulated** — they are real Hedera Testnet transactions verifiable
by any third party at any time.

### 2. ACM0002 Methodology Validation

The physics engine implements the **UNFCCC ACM0002 consolidated baseline
methodology** for grid-connected renewable electricity:

- **Emission factor formula**: EF = (Net MWh generated) × (Grid emission factor in tCO₂/MWh)
- **Power calculation**: P = ρ · g · Q · H · η (density × gravity × flow × head × efficiency)
- **Anomaly thresholds**: Based on IEC 60041 standard for hydraulic turbine testing
- **Trust scoring**: Multi-factor weighted average across physics, temporal, environmental, statistical checks

ACM0002 source: [UNFCCC CDM Methodology Booklet](https://cdm.unfccc.int/methodologies/index.html)

### 3. Automated Test Coverage

234 automated tests across 9 suites validate every component:

| What is validated | Test file | Tests |
|-------------------|-----------|-------|
| Physics-based anomaly detection | `anomaly-detector.test.js` | 22 |
| AI Guardian trust scoring | `ai-guardian-verifier.test.js` | 27 |
| Hedera HCS/HTS/DID operations | `hedera-integration.test.js` | 56 |
| ACM0002 calculations | `verifier-attestation.test.js` | 22 |
| Full E2E live pipeline | `e2e-production.test.js` | 11 |
| Configuration validation | `configuration-validator.test.js` | 50 |
| Integration workflow | `complete-workflow.integration.test.js` | 18 |

### 4. Performance Benchmarks

| Benchmark | Target | Measured |
|-----------|--------|----------|
| Single reading verification | < 50ms | < 5ms |
| 100 readings batch (E2E) | < 30s | ~5.2s |
| 1,000 readings batch | < 60s | ~20s |
| Throughput at scale | — | ~50 readings/sec |

---

## 🌍 Market Research

### Voluntary Carbon Market Size

- **Current size**: $2B (2022) → **$50B projected by 2030** (McKinsey Voluntary Carbon Markets report)
- **Annual growth rate**: ~20% CAGR driven by net-zero corporate commitments
- **Hydropower carbon credits**: Run-of-river hydro = one of the most credible
  carbon methodologies (no reservoir emissions; recognized by Verra, Gold Standard, ACM0002)

### Hydropower Market Size

- **Global run-of-river plants**: ~50,000 (IEA Hydropower Special Market Report 2021)
- **India alone**: 4,924 small hydropower projects (Ministry of New and Renewable Energy, 2023)
- **West Bengal / Northeast India**: ~300 operational small hydro plants — the builder’s immediate pilot geography
- **Current MRV standard**: Excel spreadsheets + manual field audits — ripe for disruption

### MRV Market Gap

| Current state | Problem | This solution |
|---------------|---------|---------------|
| Excel + PDF reports | No audit trail | HCS immutable ledger |
| Manual field audits | Slow, expensive, gameable | Real-time automated verification |
| Centralized registries | Single point of trust failure | Decentralized, cryptographic proof |
| No device identity | Sensor spoofing possible | W3C DID per device |

---

##  Community Feedback & Outreach

### Hedera Ecosystem Engagement

- **Hedera Hello Future Apex Discord**: Monitoring `#sustainability` and `#general`
  channels for feedback from other builders and mentors. *(Active since Feb 17, 2026)*
- **Hedera Developer Office Hours**: Scheduled to attend AMA session
  (Feb 24–25, 2026) — will submit question via AMA form and consult mentor.
  *(This also qualifies for the $40 Ask-Mentor-Anything side quest.)*

### ReFi / Climate Tech Community

- **Climate Collective**: Identified as a key distribution partner.
  Outreach planned post-hackathon for pilot partnership discussion.
- **Verra Community Forum**: ACM0002 methodology alignment reviewed
  against public Verra documentation and CDM methodology booklet.

### Builder's Domain Context

The builder (Bikram Biswas) is based in **Balurghat, West Bengal, India** —
directly adjacent to the Northeast India small hydropower corridor.
This geographic proximity provides:
- First-hand knowledge of local grid emission factors (India CEA data)
- Direct access to plant operators for pilot discussions
- Familiarity with Indian MoNRE reporting requirements

*Note: Formal pilot LOIs (Letters of Intent) are being pursued for Q2 2026.
This document will be updated with signed LOIs as they are received.*

---

##  Competitive Analysis

| Solution | On-chain? | ACM0002? | Open source? | Hedera-native? |
|----------|-----------|----------|--------------|----------------|
| Verra Registry (paper) | ❌ | ✅ | ❌ | ❌ |
| Hedera Guardian (general) | ✅ | ✅ (template) | ✅ | ✅ |
| **This project** | **✅** | **✅ (implemented)** | **✅** | **✅** |
| Other Apex sustainability entries | Unknown | Unknown | Unknown | Unknown |

Key differentiator: **physics-based AI anomaly detection** that rejects implausible
readings before they reach the chain — no other open-source Hedera MRV system has this.

---

##  Validation Summary

| Evidence type | Status |
|---------------|--------|
| Live Hedera Testnet TXIDs | ✅ Verifiable now |
| ACM0002 methodology alignment | ✅ Documented |
| Automated test suite (234 tests) | ✅ Passing |
| Performance benchmarks | ✅ Measured |
| Market size research | ✅ Cited sources |
| Community engagement | ⚠️ In progress (hackathon period) |
| Pilot LOIs | ⚠️ Pursuing post-hackathon |
| Beta testers | ⚠️ Recruiting via Discord |
