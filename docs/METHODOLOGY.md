# dMRV Methodology

This document is the **authoritative reference** for the Hedera Hydropower dMRV verification methodology. All other documents that describe verification logic, trust scoring, or carbon calculation should refer here rather than duplicate this content.

**Last reviewed**: March 4, 2026  
**Applies to**: Engine v1 (production)

---

## Table of Contents

1. [Overview](#overview)
2. [Input Data Schema](#input-data-schema)
3. [5-Layer Verification Engine](#5-layer-verification-engine)
4. [Trust Score Algorithm](#trust-score-algorithm)
5. [Decision Thresholds](#decision-thresholds)
6. [ACM0002 Carbon Calculation](#acm0002-carbon-calculation)
7. [Replay Protection](#replay-protection)
8. [Known Limitations](#known-limitations)

---

## Overview

Every telemetry reading submitted to the API passes through a sequential verification pipeline before being recorded on the Hedera ledger:

```
Raw telemetry
    │
    ▼
[Input Validation]  ← rejects malformed or incomplete payloads (HTTP 400)
    │
    ▼
[Replay Check]      ← rejects duplicate plant+device+timestamp (HTTP 409)
    │
    ▼
[5-Layer Engine]    ← produces a weighted trust score (0.0 – 1.0)
    │
    ▼
[Decision]          ← APPROVED / FLAGGED / REJECTED
    │
    ▼
[HCS Submission]    ← immutable record on Hedera Consensus Service
    │
    ▼
[REC Minting]       ← APPROVED readings trigger HREC token issuance
```

---

## Input Data Schema

```json
{
  "plant_id":  "string  (required)",
  "device_id": "string  (required)",
  "readings": {
    "timestamp":    "integer  Unix epoch milliseconds (required)",
    "flowRate":     "number   m³/s  (required)",
    "head":         "number   metres (required)",
    "generatedKwh": "number   kWh (required)",
    "pH":           "number   0–14 (optional)",
    "turbidity":    "number   NTU (optional)",
    "temperature":  "number   °C (optional)",
    "efficiency":   "number   0.0–1.0 (optional, default 0.85)"
  }
}
```

A payload missing any required field returns `HTTP 400 Bad Request`. A payload with `flowRate = 0` and `generatedKwh > 0` is physically impossible and is also rejected with `HTTP 400`.

---

## 5-Layer Verification Engine

### Layer 1 — Physics Validation (weight: 30%)

Verifies that the reported power output is consistent with the measured water parameters using the standard hydropower formula:

```
P_theoretical = ρ × g × Q × H × η

Where:
  ρ = water density         (998 kg/m³ at ~20°C)
  g = gravitational accel.  (9.81 m/s²)
  Q = flow rate             (m³/s)
  H = hydraulic head        (m)
  η = turbine efficiency    (dimensionless, 0–1)
```

The ratio `P_reported / P_theoretical` is mapped to a confidence tier:

| Ratio range | Tier | Layer score |
|---|---|---|
| 0.95 – 1.05 | PERFECT | 1.00 |
| 0.85 – 0.95 or 1.05 – 1.15 | EXCELLENT | 0.95 |
| 0.70 – 0.85 or 1.15 – 1.30 | GOOD | 0.85 |
| 0.50 – 0.70 or 1.30 – 1.50 | ACCEPTABLE | 0.70 |
| < 0.50 or > 1.50 | FAIL | 0.00 |

### Layer 2 — Temporal Consistency (weight: 25%)

Checks whether the reading's timestamp is plausible:

- Timestamp must be within the last 24 hours (no future timestamps, no stale readings).
- Reading rate must be consistent with the device's configured reporting interval.
- Sudden large jumps in generation between consecutive readings are flagged.

Layer score: 1.0 if all checks pass, reduced proportionally per failed check.

### Layer 3 — Environmental Bounds (weight: 20%)

Validates water quality parameters against safe operating ranges:

| Parameter | Normal range | Out-of-range action |
|---|---|---|
| pH | 6.0 – 9.0 | ENVIRONMENTAL_ANOMALY flag |
| Turbidity | 0 – 100 NTU | ENVIRONMENTAL_ANOMALY flag |
| Temperature | 4 – 30 °C | ENVIRONMENTAL_ANOMALY flag |

If one or more parameters are out of range, the layer score is reduced. If optional parameters are absent, this layer defaults to a neutral score of 0.75.

### Layer 4 — Statistical Anomaly Detection (weight: 15%)

Compares the current reading against the device's rolling historical baseline:

- Values beyond ±3 standard deviations from the 30-reading rolling mean are flagged.
- On first submission (no history), this layer defaults to a neutral score of 0.80.

### Layer 5 — Device Consistency (weight: 10%)

Checks whether device behaviour is self-consistent over time:

- Efficiency ratio must remain within a stable band across consecutive readings.
- A device that oscillates wildly between readings is flagged.
- On first submission, this layer defaults to a neutral score of 0.85.

---

## Trust Score Algorithm

The final trust score is a weighted sum of the five layer scores:

```
trust_score = (L1 × 0.30) + (L2 × 0.25) + (L3 × 0.20) + (L4 × 0.15) + (L5 × 0.10)
```

All layer scores are in the range [0.0, 1.0]. The final trust score is therefore also in [0.0, 1.0].

**These weights are fixed in Engine v1.** Any proposal to change them requires a corresponding update to this document and a re-run of the full test suite.

---

## Decision Thresholds

| Trust score range | Decision | Action |
|---|---|---|
| > 0.90 | APPROVED | Reading recorded on HCS; RECs minted |
| 0.50 – 0.90 | FLAGGED | Reading recorded on HCS; RECs withheld; flags returned in response |
| < 0.50 | REJECTED | Reading recorded on HCS (for audit); RECs not minted |

All three outcomes are written to the HCS topic regardless of decision, ensuring a complete immutable audit trail.

---

## ACM0002 Carbon Calculation

Approved readings trigger carbon credit calculation per UN CDM methodology ACM0002 (v18.0).

### Emission Reduction Formula

```
ER = BE - PE - LE

Where:
  ER = Emission Reductions (tCO2e)
  BE = Baseline Emissions   (grid electricity displaced × emission factor)
  PE = Project Emissions    (construction + operations, amortised)
  LE = Leakage Emissions    (upstream/downstream indirect effects)
```

### Simplified Calculation (current implementation)

For run-of-river plants where PE and LE are negligible relative to BE:

```
ER ≈ BE = Energy_generated_MWh × Grid_emission_factor_tCO2e_per_MWh
```

The default grid emission factor used is **0.8 tCO2e/MWh**, based on the India national grid average (CEA 2023). This value must be updated per project region for production use.

**Example**: 0.9 MWh × 0.8 tCO2e/MWh = **0.72 tCO2e**

### REC Issuance

One HREC token on the Hedera Token Service represents 1 MWh of verified renewable generation. Fractional tokens are issued for sub-MWh readings.

The token ID on testnet is `0.0.7964264`. See [HashScan](https://hashscan.io/testnet/token/0.0.7964264).

### Important Caveat

The current implementation uses a single, static grid emission factor. A production deployment targeting Verra VCS or Gold Standard certification must use project-specific, periodically updated emission factors sourced from the relevant national grid registry. See [VERRA_GUIDE.md](./VERRA_GUIDE.md) for details.

---

## Replay Protection

Duplicate readings (same `plant_id + device_id + timestamp`) are rejected with `HTTP 409 Conflict`. This is implemented via a Redis-backed deduplication store in `src/middleware/replayProtection.js`.

If Redis is unavailable at startup, the middleware logs a warning and operates in pass-through mode (no deduplication). This is acceptable for development but must not occur in production. See [DEPLOYMENT.md §Redis](./DEPLOYMENT.md#redis) for configuration.

---

## Known Limitations

| Limitation | Impact | Planned fix |
|---|---|---|
| Static grid emission factor | Carbon credits may be inaccurate for non-Indian-grid projects | Per-project emission factor config (Phase 2) |
| Statistical layer needs 30 readings for baseline | First ~30 readings per device get a default score, not a computed one | No change planned; this is standard practice |
| No real-time sensor health check | A malfunctioning sensor can submit plausible-looking but wrong data | Device DID attestation + hardware security module (Phase 3) |
| Testnet only | No mainnet deployment yet | Mainnet launch Q2 2026 |
