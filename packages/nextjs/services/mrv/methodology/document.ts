import { DECISION_RULES, ENGINE_VERSION } from "../engine";
import { FUELS } from "./fuels";
import { LDC_COUNT, LDC_LIST_AS_OF } from "./ldc";
import {
  METHODOLOGIES,
  MIN_POWER_DENSITY,
  RESERVOIR_EF_G_PER_MWH,
  RESERVOIR_EMISSIONS_POWER_DENSITY,
  SMALL_SCALE_LIMIT_KW,
  VMR0017_EMBODIED_HYDRO_G_PER_MWH,
  VMR0017_MAX_HYDRO_KW,
  VMR0017_RESERVOIR_EF_G_PER_MWH,
} from "./project";

/** The methodology as implemented, in Markdown: served as the MCP resource `hydro-dmrv://methodology`. */
export const METHODOLOGY_MARKDOWN = `# Hydro dMRV methodology (${ENGINE_VERSION})

Each plant is registered on-chain under one of two rule sets:

- **Verra VMR0017 v${METHODOLOGIES.VMR0017.version}** (23 April 2026), applied with **ACM0002 v${METHODOLOGIES.ACM0002.version}** as it requires. The
  demo plants use it. For hydro it changes ACM0002 as follows: hydroelectric projects of ${VMR0017_MAX_HYDRO_KW / 1_000} MW or less (rated or
  authorized capacity, whichever is higher) in Least Developed Countries only (Table 1; ${LDC_COUNT} LDCs as of ${LDC_LIST_AS_OF});
  additionality by VT0008 (regulatory surplus, investment analysis, common practice; no barrier analysis, no TOOL32);
  EF_Res = ${VMR0017_RESERVOIR_EF_G_PER_MWH / 1_000} kg CO2e/MWh; leakage from embodied emissions, ${VMR0017_EMBODIED_HYDRO_G_PER_MWH / 1_000} g CO2e/kWh for hydro (§8.3); TOOL07
  replaced by VT0011. Verra inactivates ACM0002 and AMS-I.D as standalone methodologies on 1 January 2027.
- **CDM ${METHODOLOGIES["AMS-I.D"].id} v${METHODOLOGIES["AMS-I.D"].version}** (up to ${SMALL_SCALE_LIMIT_KW / 1_000} MW) and **${METHODOLOGIES.ACM0002.id} v${METHODOLOGIES.ACM0002.version}** (above).

Both use **TOOL03** for fossil fuel combustion; the grid emission factor follows TOOL07's procedure (see "Not implemented"
for VT0011). The contract \`HydroCreditRegistry\` recomputes every figure below from the registered design and methodology,
so a verifier cannot mint more than the equations allow. 1 credit = 1 t CO2e; 1 token base unit = 1 kg CO2e.

## Emission reductions

    ER_y = BE_y − PE_y − LE_y

| Term | Equation | Rounding |
| --- | --- | --- |
| EG_PJ,y | greenfield: EG_facility,y · retrofit / capacity addition: EG_facility,y − (EG_historical + σ_historical) until DATE_BaselineRetrofit, then 0 | exact Wh |
| BE_y | EG_PJ,y × EF_grid,CM,y | down |
| PE_FF,y | Σ FC × COEF, COEF = NCV × EF_CO2 (TOOL03 option B) | up |
| PE_HP,y | EF_Res × TEG_y when ${MIN_POWER_DENSITY} < PD ≤ ${RESERVOIR_EMISSIONS_POWER_DENSITY} W/m², else 0 (EF_Res = ${VMR0017_RESERVOIR_EF_G_PER_MWH / 1_000} kg CO2e/MWh under VMR0017, ${RESERVOIR_EF_G_PER_MWH / 1_000} under the CDM) | up |
| LE_y | VMR0017: EG_facility,y (greenfield) or EG_PJ_Add,y (capacity addition) × ${VMR0017_EMBODIED_HYDRO_G_PER_MWH / 1_000} g CO2e/kWh, never on negative energy; 0 for retrofits (no equation in §8.3). CDM: 0 (ACM0002; AMS-I.D without transferred equipment) | up |

- EG_facility,y is **net**: export − import at the grid meter. TEG_y is gross generation at the generator terminals.
- Retrofits apply the annual equation cumulatively per crediting year: nothing is credited until the year's generation
  passes EG_historical + σ_historical (mean and sample standard deviation of ≥ 5 years), never more than the excess.
- A negative ER (e.g. a period of import only) is carried forward and netted against later issuance, not ignored.
- Sub-kg remainders are carried, never rounded up into a credit.

## Applicability (checked by the engine and, where marked, by the contract)

- Grid-connected hydro: greenfield, retrofit or capacity addition (contract checks the baseline fields per type).
- Power density PD = (Cap_PJ − Cap_BL) / (A_PJ − A_BL): PD ≤ ${MIN_POWER_DENSITY} W/m² is **not eligible** (contract reverts);
  no added reservoir area means PE_HP = 0.
- AMS-I.D ≤ ${SMALL_SCALE_LIMIT_KW / 1_000} MW; transferred equipment under AMS-I.D needs a leakage assessment (refused).
- VMR0017: hydro ≤ ${VMR0017_MAX_HYDRO_KW / 1_000} MW (contract reverts above), host country on the UN LDC list at the crediting start,
  and complete VT0008 evidence: regulatory surplus, the project's financial indicator without carbon revenue below the
  benchmark, not common practice. The engine checks the recorded evidence; the VVB makes the determination.
- Crediting period: 7 years (renewable twice) or 10 years fixed, counted in 365-day years; a monitoring period must stay
  inside the crediting period and inside one crediting year (contract checks both).

## Grid emission factor (TOOL07, ex-ante)

    EF_grid,CM = w_OM × EF_grid,OM + w_BM × EF_grid,BM

- OM: simple (only if low-cost/must-run sources supply < 50% on a 5-year average), simple adjusted
  ((1 − λ) × EF_non-LCMR + λ × EF_LCMR) or average OM, per-unit option A: A1 = Σ FC × NCV × EF_CO2 / EG, A2 = EF_CO2 × 3.6 / η;
  3-year generation-weighted average.
- BM: sample group per step 5 — the larger of the 5 most recent units and the most recent units supplying ≥ 20% of
  generation (CDM units excluded); if that set holds units older than 10 years, drop them and add CDM units, then older units, up to 20%.
- Weights: hydro 0.5 / 0.5 in the first crediting period, 0.25 / 0.75 after renewal; wind and solar 0.75 / 0.25.
- IPCC 2006 defaults use the **lower** 95% bound for the baseline (TOOL07) and the **upper** bound for project
  emissions (TOOL03), so both sides err toward fewer credits.
- A combined margin published by a DNA can be registered instead, with its reference.

## Monitoring and QA/QC

| Data | Treatment |
| --- | --- |
| Source | metering record names a meter key → the batch must carry its EIP-191 signature; missing, wrong key or edited after signing → REJECTED |
| Timestamps | duplicates, out-of-order and overlapping intervals → REJECTED (double counting) |
| Gaps | credited as zero; coverage < ${DECISION_RULES.minCompletenessBps / 100}% → FLAGGED; the contract enforces the same floor |
| Main vs check meter | disagreement beyond combined accuracy → lower reading used, FLAGGED |
| Calibration expired | export × (1 − MPE), import × (1 + MPE) |
| No metering record | class 0.5 meters with unverifiable calibration are assumed: the MPE deduction applies |
| Export above generation | excess not credited |
| Physics | generation above nameplate or above ρ·g·Q·H·η_max (widened by flow uncertainty) → interval credited as zero, FLAGGED; > ${DECISION_RULES.maxExcludedShare * 100}% of intervals → REJECTED |
| Efficiency outliers | modified z-score ≥ 3.5 on water-to-wire efficiency → FLAGGED |
| Fuel | burnt on site with no registered fuel → REJECTED (PE_FF cannot be computed) |
| Water quality | pH, turbidity, temperature out of range → FLAGGED for environmental review; quantity unchanged |

Only APPROVED periods can be attested. Every attestation publishes the raw readings, metering data and ledger state to
HCS, then the report, so anyone can re-run the engine and compare every figure with the contract.

## Fuels (IPCC 2006 Vol. 2 Ch. 1, NCV GJ/t and CO2 kg/TJ: default, lower, upper)

${Object.values(FUELS)
  .map(f => `- ${f.label}: NCV ${f.ncv.join(" / ")}; EF ${f.co2.map(v => v.toLocaleString("en-US")).join(" / ")}`)
  .join("\n")}

## Not implemented

VT0011 as a separate tool (the grid factor follows TOOL07's procedure; register a DNA- or Verra-published combined margin
where VT0011 differs), battery and pumped storage and BESS fire suppression (VMR0017 PE_BESS, PE_PSP, PE_FSS),
TOOL07 option B and dispatch-data OM, ex-post OM vintage, off-grid plants and imports in the grid factor, integrated
hydro projects (several reservoirs), battery storage and geothermal emission sources, TOOL05 for grid electricity
consumed by the project (net metering covers imports at the plant). A VVB must still validate the design and verify
the monitoring plan; this is a digital implementation of the equations, not a certification.
`;
