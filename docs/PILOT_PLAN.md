# 90-Day Shadow Pilot Plan

**Last reviewed**: March 4, 2026

This template guides the planning and execution of a 90-day shadow-mode pilot. In shadow mode, the MRV system runs in parallel with existing manual monitoring. Discrepancies are tracked but no credits are issued. At the end of the pilot, the results determine whether the system is accurate enough to replace manual monitoring.

---

## Success Criteria

| Metric | Target |
|---|---|
| Delta vs. manual MRV reports | < 5% |
| False rejection rate | < 0.5% |
| Hedera transaction success rate | > 99% |
| Manual interventions in 90 days | 0 |

---

## Reference Plant: 6 MW Run-of-River

### Plant Assumptions
- Capacity: 6 MW
- Type: Run-of-river (no storage reservoir)
- Location: Himachal Pradesh or Uttarakhand, India
- Existing monitoring: Monthly manual reports by accredited inspector

### Estimated Pilot Economics

| Item | Cost (INR) |
|---|---|
| IoT hardware (flow, pressure, power, water quality) | ₹15,000 – ₹50,000 |
| Edge gateway (industrial) | ₹8,000 – ₹15,000 |
| Software setup and integration | ₹0 (open source) |
| Cloud / Hedera transaction costs | ₹500 – ₹1,000 |
| **Total pilot cost** | **₹23,500 – ₹66,000** |
| vs. Manual MRV per quarter | ₹1,25,000 |
| **Estimated savings** | **60–70%** |

---

## Hardware Requirements

### Minimum (Shadow Pilot)

| Sensor | Specification | Indicative cost |
|---|---|---|
| Flow sensor | Ultrasonic or electromagnetic, ±1% accuracy | ₹8,000 – ₹20,000 |
| Pressure transducer | 0–10 bar, ±0.5% accuracy | ₹3,000 – ₹8,000 |
| Power meter | Class 0.5 energy meter, pulse output | ₹2,000 – ₹8,000 |
| Water quality probe | pH, turbidity, temperature combo | ₹5,000 – ₹20,000 |
| Edge gateway | Industrial SBC or dedicated gateway | ₹5,000 – ₹15,000 |

**Note on edge devices**: Consumer-grade single-board computers (Raspberry Pi etc.) are acceptable for a shadow pilot where no real credits are issued. For production deployments where credits have financial value, use an industrial-grade gateway and apply the hardening procedures in [SECURITY.md §Edge Device](./SECURITY.md#edge-device--iot-security).

### Data Transmission
- Primary: 4G LTE (plant sites typically lack fibre)
- Backup: Store-and-forward (local SD card buffer if connectivity drops)
- Frequency: Reading every 15 minutes (96 readings/day)

---

## 90-Day Timeline

### Days 1–14: Setup and Calibration

- [ ] Install sensors and edge gateway
- [ ] Commission MRV system in shadow mode (`NODE_ENV=shadow`)
- [ ] Calibrate sensors against reference instruments
- [ ] Submit initial 50 readings manually; verify results against manual baseline
- [ ] Resolve any integration issues

### Days 15–60: Parallel Monitoring

- [ ] System runs automatically; alert on any manual intervention
- [ ] Weekly comparison of MRV output vs. manual log (target: < 5% delta)
- [ ] Review and triage any FLAGGED readings
- [ ] Log all false rejections and investigate root causes

### Days 61–90: Validation

- [ ] Full accuracy comparison: all 90-day readings vs. manual reports
- [ ] Calculate false rejection rate
- [ ] Document anomalies and resolutions
- [ ] Prepare pilot report

### Post-Pilot Decision Gate

If all four success criteria are met, proceed to:
1. Mainnet deployment
2. Verra project registration (see [VERRA_GUIDE.md](./VERRA_GUIDE.md))
3. Credit issuance

If any criterion is not met, extend the shadow period and investigate root causes before proceeding.

---

## Contacts

- For pilot inquiries: open a GitHub issue with the `pilot` label
- For Verra submission guidance: engage a Verra-accredited VVB
- For hardware procurement: see the IoT vendor list in [EDGE_GATEWAY_INTEGRATION.md](./EDGE_GATEWAY_INTEGRATION.md)
