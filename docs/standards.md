# Standards crosswalk

Each methodology, tool and program document the template implements: the clause, where the code applies it, and
what is left to a VVB. Last checked against the documents on 29 Sep 2026. Clause numbers are the documents' own.

## VMR0017 v1.0 (23 Apr 2026), revision of ACM0002 v22.0

| Clause | Rule | Where |
| --- | --- | --- |
| §2 | TOOL01→VT0008, TOOL02→VT0009, TOOL05→VT0010, TOOL07→VT0011; TOOL32 not eligible | `project.ts` (`additionalityOf`, `gridFactor`), `tool07.ts` |
| §4 Table 1 | hydro ≤ 15 MW by the higher of rated and authorized capacity, UN LDCs only | `project.ts` (`authorizedCapacityKw`, `ldc.ts`); `HydroVmr0017Module` stores both capacities and the host country and reverts `MethodologyNotApplicable` or `NotLeastDevelopedCountry` (UN list with graduation dates, at the registration request) |
| §4 Table 1 | wind and terrestrial solar PV in low- and middle-income countries; floating solar, wave and tidal everywhere (income group as declared by the registrant) | `RenewableVmr0017Module` `NotApplicableInHighIncomeCountry`, `renewable.ts` |
| §4 Table 1 | geothermal in low- and middle-income countries | not implemented (no PE_GP) |
| §4 8(f), §8.2 eq. 18 | BESS co-location, PE_BESS, PE_PSP, PE_FSS | not implemented; the modules have no BESS |
| §6 ¶30 | retrofit alternatives P1, P2, P3 (VT0009 Step 1) | `project.ts` `baselineAlternatives` |
| §7 ¶36 | regulatory surplus, VT0008 Step 3, Step 4; no barrier analysis; record §5.4.2(2)(b)–(c) | `project.ts` `additionalityOf`, `ccpInvestmentConditions` |
| §8.2 ¶40 | PE = PE_FF + PE_GP + PE_HP + PE_BESS + PE_PSP + PE_FSS | PE_FF (TOOL03) and PE_HP only; both modules |
| §8.3 eq. 19 | LE = EG_facility × EF_embodied × 10⁻³, greenfield | both modules, rounded up, none on net import |
| §8.3 eq. 20 | LE = EG_PJ_Add × EF_embodied × 10⁻³, capacity addition | hydro module. Hydro additions are not metered separately (ACM0002 ¶61), so EG_PJ_Add is the larger of EG_PJ and EG_facility × Cap_add / Cap_PJ |
| §8.3 | retrofit: no equation given | LE = 0; retrofits under VMR0017 must be end-of-life refurbishments (VT0010 §4(5)) |
| §9.1 | EF_Res 100 kg/MWh; EF_embodied hydro 21, solar PV 43, wind 13, ocean 8 g/kWh | both modules and their TypeScript twins |
| §9.2 | EG_facility metered at the grid interface, continuous, aggregated at least monthly | meter statement, engine stage 2 |
| §9.3 | EF_grid,CM per VT0011, ex-ante or ex-post recorded | `tool07.ts` ex-ante; ex-post not offered |

## ACM0002 v22.0 (EB 122)

| Clause | Rule | Where |
| --- | --- | --- |
| ¶8(b) | additions and retrofits: existing plant operating before a ≥ 5-year reference period, unchanged since | `project.ts` `historical` |
| ¶9, eq. 7 | PD = (Cap_PJ − Cap_BL) / (A_PJ − A_BL) > 4 W/m² for new or enlarged reservoirs | engine and contract `PowerDensityTooLow` |
| ¶13 | additions and retrofits only when the baseline is P2, continuation | `project.ts` |
| eq. 9–10 | PE_HP = EF_Res × TEG when 4 < PD ≤ 10, else 0 | contract, on gross generation (TEG) |
| eq. 12 | greenfield EG_PJ = EG_facility | contract |
| ¶61, eq. 14–16 | hydro additions and retrofits: EG_facility − (EG_historical + σ) until DATE_BaselineRetrofit, never negative | contract (per crediting year, carried), `project.ts` sample σ |
| ¶67 | EG_historical over ≥ 5 calendar years | `project.ts` |
| ¶71 | no leakage (CDM path) | CDM path LE = 0 |

## AMS-I.D v18.0 (EB 81)

| Clause | Rule | Where |
| --- | --- | --- |
| ¶5 | reservoir PD > 4 W/m² | same rule as ACM0002 |
| ¶8–9 | ≤ 15 MW; for additions the *added* units | `project.ts` refuses AMS-I.D above 15 MW total, which is stricter for additions |
| ¶35 | hydro EG_historical: five years | `project.ts` |
| §5.7 | leakage only for transferred equipment | refused (`equipmentTransferred`) |
| §6.1 | EG_PJ,facility: continuous, hourly measurement, monthly recording | engine: intervals over 60 min go to review |

## VT0008 v1.0 (additionality)

| Clause | Rule | Where |
| --- | --- | --- |
| §5.1 | applicable geographic area, default host country | `commonPractice.geographicArea` |
| §5.4.2 | benchmark with project or equity IRR; (a) below benchmark without credits; (b)–(c) for CCP labels | `additionalityOf` |
| A2.4 ¶23–25 | vary inputs > 20% of cost or revenue by at least ±10%; VVB assesses any crossing | `sensitivity`, `sensitivityProbability` |
| §5.5.2(1) | similar projects within ±50% of design capacity | `capacityBandPct` ≥ 50 |
| §5.5.2 | common practice when F = 1 − N_diff / N_all > 20% and N_all − N_diff > 3 | `commonPracticeOf`, integer comparison |

## VT0009 v1.0, VT0010 v1.1, VT0011 v1.0

| Document | Rule | Where |
| --- | --- | --- |
| VT0009 Step 1 | alternatives P1–P3 for a retrofit | `baselineAlternatives` |
| VT0010 §4(5) | not applicable to efficiency upgrades; end-of-life refurbishment is not an upgrade | `endOfLifeRefurbishment` |
| VT0010 eq. 5, TDL table | PE = EC × EF × (1 + TDL), default TDL 20% for project loads | `vt0010.ts`; the registry nets imports inside EG_facility instead |
| VT0011 ¶25, ¶16 | imports at 0 t/MWh, Annex I connected systems 0 | `tool07.ts` |
| VT0011 ¶50 | multi-fuel units take the lowest factor; generation-only units 0 t/MWh | `tool07.ts` |
| VT0011 ¶75, ¶79 | BM: larger of SET_5 and SET_≥20% over all units; old units via TOOL09 defaults | `tool07.ts` |
| VT0011 ¶86 | weights hydro 0.4/0.6 then 0.25/0.75; wind and solar 0.5/0.5, 0.4/0.6, 0.3/0.7 | `combinedMarginWeights` |
| VT0011 ¶90–91 | optional LDC w_OM = 1, default BM | not offered (¶90 would credit more) |

## VCS Program

| Document | Rule | Where |
| --- | --- | --- |
| VCS v5.0, V5#101 | E&I registrations requested from 1 Jan 2027: 5-year periods | both modules `_checkSpan`, `project.ts` |
| VCS v5.0, V5#101 | registered 7-year projects move to 5-year periods at a renewal requested from 1 Jan 2027 | both modules `validateRenewal` (block time as the request date), `project.ts` `renewal.requestedAt` |
| VCS v5.0, V5#02 | regulatory surplus at validation, renewal and baseline reassessment | `regulatorySurplus`, `renewal.regulatorySurplus` |
| VCS v5.0, V5#14, #16, #17, #58 | right to operate, stakeholder engagement, safeguards, benefit sharing | `project.ts` requires the environmental and social impact assessment, the stakeholder consultation and the no-net-harm assessment to be named under VMR0017 (the demo plants say they have none); judging them is the VVB's job, and its `ValidationApproval` on-chain is where it signs off |
| VCS v5.0 project cycle | validation before registration; monitoring reports; verification before issuance | `DmrvRegistry`: `registerProject` needs a VVB's `ValidationApproval`; `recordMonitoring` records monitoring (issues nothing); `verifyPeriod` issues only on a VVB's `VerificationStatement` over the record chain and its report on HCS |
| VCS v4 scope revision | grid hydro only small scale in LDCs | `vcsScopeOf` |
| Grievance Redress Policy v1.2 | complaints and appeals to Verra | out of scope: a process, not a quantity |

## CDM standardized baseline ASB0054-2022 (Uganda)

ASB0054 publishes OM 0.2740 and BM 0.00001 t/MWh, and CM 0.1370 for hydro in a first crediting period. That CM
uses TOOL07's 0.5 / 0.5 weights. VMR0017 §9.3 requires VT0011, whose 0.4 / 0.6 gives 0.1096 t/MWh, so registering
the published CM would credit 25% more than the methodology allows. A published factor on the VMR0017 path
therefore needs its OM and BM; the engine recombines them with VT0011's weights and keeps the lower CM. On the CDM
path it checks that the published CM is TOOL07's weighting of the same margins. ASB0054 was valid from 10 Aug 2022
to 9 Aug 2025.
