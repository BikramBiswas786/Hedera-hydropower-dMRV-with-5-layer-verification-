# Hedera Network Impact — Hydropower MRV

This document estimates the projected impact on the Hedera network and the global carbon market based on current deployment plans.

---

## Hedera Network Impact

### New Accounts

Each onboarded plant creates:
- 1 Hedera account for the operator
- 1 device DID per turbine unit
- 1 HCS topic (audit log)
- 1 HTS token (HREC)

| Scenario | Plants | New Hedera Accounts | New HCS Topics | New HTS Tokens |
|----------|--------|---------------------|----------------|----------------|
| Pilot (Year 1) | 3 | 3 | 3 | 3 |
| Phase 1 (India) | 500 | 500 | 500 | 500 |
| Long-term Goal | 5,000 | 5,000 | 5,000 | 5,000 |

### HCS Transaction Volume

Each telemetry reading = 1 HCS transaction.

| Reading Frequency | Plants | Daily HCS TXs | Annual HCS TXs |
|-------------------|--------|---------------|----------------|
| 1/hour per plant | 500 | 12,000 | 4,380,000 |
| 1/hour per plant | 5,000 | 120,000 | 43,800,000 |

At a scale of 500 plants with hourly reporting, the system contributes approximately 4.38 million transactions per year to the Hedera network.

---

## Economic Impact

### Carbon Credit Value (Conservative Estimates)

| Scenario | Annual MWh | CO2 Credits (800 tCO2/GWh) | Potential Value |
|----------|-----------|---------------------------|-------------------|
| 5 pilot plants | 43,800 | 35,040 tCO2 | ~$525,600/year |
| 500 plants | 4,380,000 | 3,504,000 tCO2 | ~$52.5M/year |

Calculations use $15/tCO2 as a conservative market price. Revenue is verified and recorded on the Hedera network.
