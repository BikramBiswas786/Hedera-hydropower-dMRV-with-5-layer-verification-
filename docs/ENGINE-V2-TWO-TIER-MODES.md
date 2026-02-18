# ENGINE V2 — Two-Tier Verification Modes

**Version**: 2.0 (Layer 3 Revolutionary Upgrade)  
**Status**: Design Complete  
**Date**: February 15, 2026  
**Depends on**: ENGINE-V1.md (Layer 2)  
**Related**: SMART-SAMPLING-STRATEGY.md

> This file is the canonical `.md` version, migrated from `ENGINE-V2-TWO-TIER-MODES.md.txt`.

---

## Executive Summary

ENGINE V2 introduces **two-tier verification modes** that enable:
- **Mode A (Regulator-Strict)**: 0.97 threshold, conservative for pilots
- **Mode B (Evidence-Rich)**: 0.90 threshold, optimised for mature operations

**Cost impact**: Mode B reduces VVB cost from $3–5/REC → **$0.50–1.00/REC** (80–90% reduction).

---

## The Problem with ENGINE V1

ENGINE V1 uses a **single verification threshold** (0.90):
- All readings treated equally regardless of device maturity
- No flexibility for different regulatory risk appetites
- VVBs nervous about full automation
- Stuck at ~70% cost reduction, can’t reach 80–90% target

---

## Mode A — Regulator-Strict (Pilots & New Plants)

**Auto-approval threshold**: trust score ≥ **0.97**

**Sampling strategy**:
- 100% human review for trust scores 0.50–0.96
- Random 30% sample of auto-approved readings
- Mandatory review of first 100 readings per new device

**When to use**:
- Verra MIN approval pilots
- First 6 months of new plant operation
- Plants with compliance history issues
- Jurisdictions with strict audit requirements

**Expected outcomes**:
- Auto-approval rate: 40–60%
- VVB comfort level: Very high
- Cost per REC: **$3–5**

---

## Mode B — Evidence-Rich (Mature Plants)

**Auto-approval threshold**: trust score ≥ **0.90**

**Sampling strategy**:
- Statistical sampling of auto-approved readings
  - Base rate: 5% random sample
  - Risk-adjusted: +5% if plant < 6 months operational
  - Anomaly-triggered: +10% if recent anomaly detected
- Targeted review only for trust scores 0.70–0.89
- Full human review only for trust scores < 0.70

**Evidence requirements** (what makes it “evidence-rich”):
- Full derivation log (all check scores, intermediate values)
- Sample of 5 random readings with complete sensor data
- Statistical summary (mean, σ, outliers, z-scores)
- Comparison to device baseline and fleet baseline

**Expected outcomes**:
- Auto-approval rate: 90–95%
- VVB comfort level: High
- Cost per REC: **$0.50–1.00**

---

## Mode Comparison

| Dimension | Mode A (Strict) | Mode B (Evidence-Rich) |
|-----------|----------------|------------------------|
| Auto-approval threshold | ≥0.97 | ≥0.90 |
| Auto-approval rate | 40–60% | 90–95% |
| Human review rate | 40–60% | 5–10% |
| Sampling of auto-approved | 30% | 5–15% adaptive |
| VVB labour per 1000 readings | 400–600 reviews | 50–150 reviews |
| VVB cost per REC | $3–5 | **$0.50–1.00** |
| Regulatory comfort | Very high | High |

---

## Transition: Mode A → Mode B

### Graduation Criteria (ALL must be met)

1. **Operational time**: ≥6 months in Mode A
2. **Anomaly rate**: <2% of readings rejected in last 3 months
3. **VVB sign-off**: Written approval from assigned VVB
4. **Device stability**: No replacements or major maintenance in last 30 days
5. **Regulatory compliance**: Zero Verra/regulatory findings
6. **Data quality**: ≥95% of readings with complete sensor suite

### Reversion Triggers (ANY one)

- Critical anomaly spike: >5% of readings with trust < 0.50 over 1 week
- Device calibration failure: Detected drift beyond acceptable bounds
- Maintenance event: Device replacement or major configuration change
- VVB request: During periodic audit or after regulatory inquiry
- Operator request: Voluntary downgrade for any reason

---

## Configuration Schema

```json
{
  "projectId": "HYDRO-001",
  "deviceId": "TURBINE-1",
  "verification": {
    "mode": "strict",
    "thresholds": {
      "autoApprove": 0.97,
      "flag": 0.50,
      "reject": 0.50
    },
    "samplingStrategy": {
      "method": "stratified",
      "baseRate": 0.30,
      "riskAdjustments": {
        "newDeviceBonus": 0.10,
        "recentAnomalyBonus": 0.10,
        "lowTrustScoreBonus": 0.05
      }
    },
    "graduationCriteria": {
      "enabled": true,
      "minOperationalDays": 180,
      "maxAnomalyRatePercent": 2.0,
      "minDataQualityPercent": 95.0,
      "vvbApprovalRequired": true,
      "autoGraduate": false
    },
    "evidenceGeneration": {
      "derivationLogs": true,
      "sampleReadings": 5,
      "statisticalSummary": true,
      "baselineComparison": true
    }
  }
}
```

---

## Related Documents

- [`docs/ENGINE-V1.md`](./ENGINE-V1.md) — Current production engine
- [`docs/SMART-SAMPLING-STRATEGY.md`](./SMART-SAMPLING-STRATEGY.md) — Statistical sampling methodology
- [`docs/ANCHORING-MODES.md`](./ANCHORING-MODES.md) — HCS anchoring cost modes
- [`src/config/default-config.js`](../src/config/default-config.js) — Threshold configuration
