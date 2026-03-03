# Verra VCS Submission Guide

**Last reviewed**: March 4, 2026

This guide explains how to use the MRV system's output to support a Verra Verified Carbon Standard (VCS) project registration and credit issuance.

**Important**: This guide describes the technical alignment between the system and VCS requirements. It is not a substitute for legal and carbon market compliance advice. Engage a Verra-accredited Validation and Verification Body (VVB) before submitting a VCS project.

---

## Applicable Methodology

This system implements **ACM0002 v18.0** — "Consolidated methodology for grid-connected electricity generation from renewable sources." ACM0002 is a CDM methodology approved for small-scale hydropower projects.

VCS uses its own methodology set (VM0XXX series). ACM0002 is accepted as a VCS-eligible methodology when applied under the Clean Development Mechanism (CDM) programme activity framework.

---

## What the System Provides

| VCS Requirement | System Output | Notes |
|---|---|---|
| Measurement data | Telemetry readings with timestamps | IoT sensors provide source data |
| Data quality / verification | 5-layer trust score per reading | Refer to [METHODOLOGY.md](./METHODOLOGY.md) |
| Tamper-proof audit log | HCS topic 0.0.7462776 | Publicly verifiable on HashScan |
| Baseline emission factor | 0.8 tCO2e/MWh (India grid default) | Must be updated to project-specific value |
| ER calculation | `ER = BE - PE - LE` per ACM0002 | Current implementation uses simplified formula |
| Unique credit identifier | HREC token on HTS | Token ID: 0.0.7964264 |

---

## Steps to Submit a VCS Project

1. **Engage a VVB**: Select a Verra-accredited Validation and Verification Body to independently assess your project.

2. **Prepare the Project Description (PD)**: The PD must include plant specifications, the applicable methodology, the monitoring plan, and the baseline emission factor. The emission factor must be sourced from the relevant national or regional grid registry (not the system default).

3. **Update the emission factor**: Edit the `GRID_EMISSION_FACTOR` constant in `src/engine/engine-v1.js` to match your project's approved baseline. Document the source and date of the factor in your PD.

4. **Run shadow-mode monitoring**: Before formal submission, operate the system in parallel with manual monitoring for at least 90 days. See [PILOT_PLAN.md](./PILOT_PLAN.md) for the shadow-pilot template.

5. **Export the HCS audit trail**: The complete reading history is publicly accessible on HashScan. Export a timestamped JSON report for your VVB using:
   ```bash
   npm run export:audit -- --from 2026-01-01 --to 2026-03-31
   ```
   *(Export functionality is planned for Phase 2. Currently, readings can be retrieved directly from the HashScan API.)*

6. **Submit to Verra**: Upload the PD, monitoring report, and VVB validation statement to the [Verra Project Registry](https://registry.verra.org).

---

## Limitations and Gaps

| Gap | Impact | Required action |
|---|---|---|
| Static emission factor | Credits may be over- or under-issued | Update factor before any formal submission |
| No PE/LE calculation | ER estimate is conservative (overstates reductions) | Calculate PE and LE for project-specific accuracy |
| No audit export tool | Manual extraction needed | Planned Phase 2 feature |
| Testnet only | No mainnet deployment | Deploy to mainnet before formal monitoring period |
