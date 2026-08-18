# VMR0017 / ACM0002 — Grid-Connected Renewable Energy dMRV

**Team:** Bikram786
**Event:** 2025 Apex Hackathon · Hedera Guardian Ecosystem

---

## Project Overview

A Verra v5.0B-aligned Hedera Guardian policy that digitizes **VMR0017 v1.0** (as applied to **CDM ACM0002 v22.0**) for **grid-connected electricity generation from renewable sources**, with a hydropower focus.

The policy delivers a complete digital MRV workflow — structured project description, monitoring reports, multi-role verification, an automated emission-reduction calculation engine, and on-chain VCU minting — with every schema transcribed from the VCS v5.0B templates and the underlying methodology.

---

## Key Deliverables

| File | Description |
|---|---|
| `policy.policy` | Guardian policy bundle: 58 description-complete schemas, 566 blocks, a 5-mathBlock calculation engine, and the token-mint chain. |
| `policy.yml` | Policy manifest for the Guardian Methodology Library. |
| `docs/VMR0017_ACM0002_Mapping.xlsx` | Schema-to-methodology mapping workbook. |

---

## Technical Specifications

**Architecture**
- **58 schemas**, each a distinct, fully-described section or parameter — no placeholder shells, no duplicated sections. Covers VCS PD/MR template sections, one schema per methodology parameter (EF_Res, EF_embodied, EG_PJ, EF_OM/BM, M_e,released, TEG_y, geothermal steam fractions, and more), plus safeguard schemas (Stakeholder Engagement Plan, ESG Risk Assessment, Grievance Log) and technical records.
- **566 blocks** supporting the full multi-role workflow (Project Proponent to VVB to Standard Registry to mint). The logic core is compact — 5 mathBlocks, 1 mint block, 1 report block — with the remainder handling document capture, verification routing, and on-chain/off-chain persistence.

**Methodology compliance** — faithful to VMR0017 v1.0 + ACM0002 v22.0:
- Baseline: `BE_y = EG_PJ,y * EF_grid,CM,y` (ACM0002 Eq.11), combined-margin grid EF.
- Project emissions: the 6-term VMR0017 equation including the added **BESS fire-suppression** term (Eq.18) and **hydropower reservoir emissions** with power-density banding (EF_Res = 100 kg CO2e/MWh).
- Leakage: the VMR0017-added **embodied-emissions** term `LE_y = EG * EF_embodied * 10^-3` (Eq.19/20; hydropower EF_embodied = 21 g CO2e/kWh).
- Net reductions: `ER_y = BE_y - PE_y - LE_y` (Eq.17) — the minted value.
- Tool swaps: TOOL01 to VT0008, TOOL02 to VT0009, TOOL05 to VT0010, TOOL07 to VT0011; TOOL03 retained; TOOL32 removed.

**Math engine**
- Transparent LaTeX / ComputeEngine (CortexJS 0.27.0) implementation of every methodology equation.
- **Calculated outputs (field21-field27) are strictly `readOnly`** — BE_y, PE_y, LE_y, ER_y, power density, and combined-margin EF are engine-computed, never user-entered. `field27` (ER_y) is what the mint block issues.
- **Mandatory inputs are enforced** — the grid emission factors, net electricity to the grid, and the technology-declaration flags are required; conditional technology-specific inputs are optional but default to 0, so the calculation resolves cleanly for any project configuration.
- Engine output is signed, preserving the issuer DID through the calculation for on-chain publishing.

**Verified behaviour (offline, against the calculation engine):** with representative hydro inputs (e.g. 50 GWh/yr delivered to grid), the engine computes a positive numeric `ER_y`, which the mint chain issues as VCUs.

---

## Status & Scope

The 58 schemas cover the core PD/MR sections, all key methodology parameters, and the VCS v5.0-required safeguards. Remaining work toward a full submission: completing 1-to-1 transcription of every VCS v5.0B PD/MR section and decomposing the SEP/ESG/VT-tool schemas further. Schema structure and calculation logic have been validated offline; live import and end-to-end minting should be confirmed in a Guardian instance.

---

## Authors

**Bikram786 Team** — developed for the 2025 Apex Hackathon and the Hedera Guardian community.

---

*All figures in this document (58 schemas, 566 blocks, 5 mathBlocks) reflect the actual contents of the policy bundle.*
