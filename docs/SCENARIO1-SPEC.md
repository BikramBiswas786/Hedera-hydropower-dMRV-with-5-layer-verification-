# Scenario 1 Specification — Testnet Demo
**Scenario**: TURBINE-1 January 2026 Monthly Monitoring  
**Type**: Synthetic telemetry (PoC)  
**Status**: ✅ Completed — evidence on Hedera testnet

---

## 1. Scenario Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Project ID | `HYDROPOWER-DEMO-001` | ACM0002 pilot project |
| Device ID | `TURBINE-1` | Single run-of-river turbine |
| Period | January 2026 | 31-day month |
| Readings | 91 | ~3 readings/day (not continuous) |
| Execution mode | `transparent-classic` | Every reading anchored individually |
| Grid EF | 0.8 tCO2e/MWh | Indian grid (hypothetical) |

---

## 2. Synthetic Data Generation Rules

Readings are generated to simulate realistic run-of-river hydropower output:

### Base parameters
```json
{
  "flowRate_m3_per_s": { "min": 2.0, "max": 3.2, "mean": 2.5 },
  "headHeight_m": { "fixed": 45.0 },
  "efficiency": { "fixed": 0.85 },
  "capacityFactor": { "min": 0.55, "max": 0.75, "mean": 0.65 }
}
```

### Generation formula
```
Expected kWh = ρ × g × Q × H × η × 3600s
             = 997 × 9.81 × Q × 45 × 0.85 × 3600 / 3,600,000
             ≈ Q × 145.8 MWh/hour (at Q=2.5: ~364.5 kWh)
```

### Noise model
- ±5% random variation on `generatedKwh` (sensor noise)
- ±2% random variation on `flowRate` (flow measurement noise)
- Occasional spike: 1 in 20 readings has +15% generation (tests physics check)
- Rare anomaly: 1 in 90 readings has 5× generation (tests rejection)

### Environmental sensors
```json
{
  "pH": { "min": 6.8, "max": 7.6, "mean": 7.2 },
  "turbidity_ntu": { "min": 8, "max": 18, "mean": 12.5 },
  "temperature_celsius": { "min": 16, "max": 22, "mean": 18.0 }
}
```

---

## 3. Expected Outputs

### Telemetry statistics (91 readings)
| Metric | Expected | Actual (Scenario 1) |
|--------|----------|---------------------|
| Total generation | ~16,800 MWh | 16,800 MWh ✅ |
| Approved | ≥ 85 | 88 ✅ |
| Flagged | 2–4 | 2 ✅ |
| Rejected | 1 | 1 ✅ |
| Avg trust score | ≥ 0.90 | 0.924 ✅ |

### ACM0002 outputs
| Metric | Value |
|--------|-------|
| EG_y,k | 16,800 MWh |
| BE_y | 13,440 tCO2e |
| PE_y | 0 tCO2e |
| ER_y | 13,440 tCO2e |

---

## 4. Verification Alignment

### What gets checked per reading
1. **Physics check** — `generatedKwh` vs. ρgQH theoretical max
2. **Temporal check** — timestamp sequence, gap detection
3. **Environmental check** — pH, turbidity, temperature within bounds
4. **Statistical check** — z-score vs. rolling 30-reading mean
5. **AI trust score** — weighted composite (physics×0.40 + temporal×0.25 + env×0.20 + stat×0.15)

### What gets anchored to Hedera
- Per reading: 1 HCS message to topic `0.0.7462776`
- Message contains: deviceId, timestamp, trustScore, verificationStatus, attestationId
- Each message is immutable on Hedera testnet and verifiable on HashScan

---

## 5. How to Re-run Scenario 1

```bash
# 1. Install dependencies
npm install

# 2. Set Hedera credentials (testnet)
cp .env.example .env
# Edit .env: HEDERA_OPERATOR_ID=0.0.6255927, HEDERA_OPERATOR_KEY=...

# 3. Run Scenario 1 demo
node scripts/demo-transparent-classic.js

# 4. Verify on HashScan
# Open: https://hashscan.io/testnet/topic/0.0.7462776/messages
```

---

## 6. Differences from Real Deployment

| Aspect | Scenario 1 (PoC) | Real Pilot (Phase 4) |
|--------|-----------------|---------------------|
| Data source | Synthetic (code) | Physical IoT sensors |
| Network | Hedera testnet | Hedera mainnet |
| Operator | 0.0.6255927 (test) | Real operator account |
| VVB review | None | Required |
| Verra registration | None | Required |
| HBAR cost | Free (testnet) | ~$0.05/month/plant |

---

## 7. Related Documents

- [`docs/Monitoring-Report-Testnet-Scenario1.md`](./Monitoring-Report-Testnet-Scenario1.md) — Full monitoring report with on-chain evidence
- [`docs/MONITORING-PLAN.md`](./MONITORING-PLAN.md) — Monitoring methodology
- [`docs/ENGINE-V1.md`](./ENGINE-V1.md) — Physics verification engine
- [`docs/txids.csv`](./txids.csv) — All testnet transaction IDs
