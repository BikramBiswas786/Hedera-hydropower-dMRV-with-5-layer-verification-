# Documentation Index

This is the single entry point for all project documentation. Follow the hierarchy below — each document covers a distinct concern and links to more specific resources when needed.

## Start Here

| If you want to… | Read this |
|---|---|
| Understand what the project does | [Root README](../README.md) |
| Understand *how* the MRV verification works | [METHODOLOGY.md](./METHODOLOGY.md) |
| Set up the system locally | [Root README → Quick Start](../README.md#quick-start) |
| Deploy to production | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Integrate with the REST API | [API.md](./API.md) |
| Run the test suite | [TESTING.md](./TESTING.md) |
| Operate a live plant installation | [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md) |
| Plan a pilot deployment | [PILOT_PLAN.md](./PILOT_PLAN.md) |
| Submit credits to Verra | [VERRA_GUIDE.md](./VERRA_GUIDE.md) |
| Understand the security model | [SECURITY.md](./SECURITY.md) |
| Understand the system design | [ARCHITECTURE.md](./ARCHITECTURE.md) |

## Document Map

```
docs/
├── README.md               ← You are here
├── METHODOLOGY.md          ← Authoritative: 5-layer verification, trust scoring, ACM0002
├── ARCHITECTURE.md         ← System components, data flow, Hedera integration
├── API.md                  ← REST API reference (all endpoints)
├── SECURITY.md             ← Threat model, controls, secure deployment
├── DEPLOYMENT.md           ← Production deployment guide (Vercel, Docker, bare-metal)
├── TESTING.md              ← Test suite guide and result interpretation
├── OPERATOR_GUIDE.md       ← Day-to-day plant operations
├── PILOT_PLAN.md           ← 90-day shadow-pilot template
├── VERRA_GUIDE.md          ← Verra VCS / Gold Standard submission guide
├── ARCHITECTURE.md         ← Technical architecture deep-dive
├── archived/               ← Superseded documents (read-only reference)
└── assets/                 ← Diagrams and images
```

## Authoritative Parameters

The following values are the **single source of truth**. Any discrepancy in other documents should be resolved in favour of the values here.

| Parameter | Value | Source |
|---|---|---|
| Physics layer weight | 30% | [METHODOLOGY.md §Trust Score](./METHODOLOGY.md#trust-score-algorithm) |
| Temporal layer weight | 25% | [METHODOLOGY.md §Trust Score](./METHODOLOGY.md#trust-score-algorithm) |
| Environmental layer weight | 20% | [METHODOLOGY.md §Trust Score](./METHODOLOGY.md#trust-score-algorithm) |
| Statistical layer weight | 15% | [METHODOLOGY.md §Trust Score](./METHODOLOGY.md#trust-score-algorithm) |
| Device consistency weight | 10% | [METHODOLOGY.md §Trust Score](./METHODOLOGY.md#trust-score-algorithm) |
| APPROVED threshold | > 0.90 | [METHODOLOGY.md §Thresholds](./METHODOLOGY.md#decision-thresholds) |
| FLAGGED threshold | 0.50 – 0.90 | [METHODOLOGY.md §Thresholds](./METHODOLOGY.md#decision-thresholds) |
| REJECTED threshold | < 0.50 | [METHODOLOGY.md §Thresholds](./METHODOLOGY.md#decision-thresholds) |
| Carbon intensity (grid) | 0.8 tCO2e/MWh | [METHODOLOGY.md §ACM0002](./METHODOLOGY.md#acm0002-carbon-calculation) |
| HCS Topic ID (testnet) | 0.0.7462776 | [HashScan](https://hashscan.io/testnet/topic/0.0.7462776) |
| HTS Token ID (testnet) | 0.0.7964264 | [HashScan](https://hashscan.io/testnet/token/0.0.7964264) |

## Archived Documents

Documents in `docs/archived/` are superseded and kept for historical reference only. Do not update them. If you need information from an archived document, consolidate it into the relevant canonical file above.
