import type { Emissions } from "../engine";
import { METHODOLOGY_CODE, embodiedEfGPerMwh, powerDensity, reservoirEfGPerMwh } from "../methodology/project";
import type { Metering, PlantProfile } from "../schema";
import type { MonitoringParameter, MonitoringReport } from "./types";

/**
 * The hydro engine's period, laid out as the methodology's data and parameters tables: ACM0002 v22.0 §5.10 (not
 * monitored) and §6.1 (monitored), as revised by VMR0017 v1.0 §9.1–9.3 on the Verra path. Every value is the one
 * the engine used; the clause column cites the table or equation it comes from.
 */

const MWH = 1e6;
const T = 1e6;
const iso = (seconds: number) => new Date(seconds * 1_000).toISOString().slice(0, 10);

export type HydroPeriod = {
  netWh: number;
  grossWh: number;
  fuelG: number;
  completenessBps: number;
  checkMeterDiscrepancies: number;
  calibrationIntervals: number;
  gapMinutes: number;
  signed: boolean;
  device: string | null;
  emissions: Emissions | null;
};

export function hydroMonitoringReport(plant: PlantProfile, metering: Metering, p: HydroPeriod): MonitoringReport {
  const { design } = plant;
  const vmr = design.methodology === METHODOLOGY_CODE.VMR0017;
  const efRes = reservoirEfGPerMwh(design.methodology);
  const pd = powerDensity(design, efRes);
  const efEmbodied = embodiedEfGPerMwh(design.methodology);
  const greenfield = design.projectType === 0;
  const addition = design.projectType === 2;
  const e = p.emissions;
  const acm = "ACM0002 v22.0";
  const calculated = (value: number | undefined, unit = 1) => (e && value !== undefined ? value / unit : null);

  const parameters: MonitoringParameter[] = [
    // ── Fixed at validation (ACM0002 §5.10, VMR0017 §9.1) ──────────────────
    {
      symbol: "EF_grid,CM,y",
      description: "Combined margin CO2 emission factor of the grid, fixed ex-ante for the crediting period",
      unit: "t CO2/MWh",
      value: design.efGridGPerMwh / T,
      kind: "validation",
      source: vmr
        ? "VT0011 (IPCC lower bound for the margins, hydro weights w_OM 0.4 / w_BM 0.6)"
        : "TOOL07 (w_OM 0.5 / w_BM 0.5)",
      equation: "(11)",
      clause: vmr ? "VMR0017 §9.3 (VT0011, ex-ante option); ACM0002 ¶83" : `${acm} ¶83 (TOOL07)`,
    },
    {
      symbol: "EF_Res",
      description: "Default emission factor for emissions from reservoirs",
      unit: "kg CO2e/MWh",
      value: efRes / 1_000,
      kind: "validation",
      source: vmr
        ? "Hydropower Sustainability Standard and Guidelines on Good International Industry Practice"
        : "Decision at EB 23",
      equation: "(9)",
      clause: vmr ? "VMR0017 §9.1 (replaces ACM0002 Data/Parameter table 6)" : `${acm} Data/Parameter table 6`,
    },
    {
      symbol: "EF_embodied",
      description: "Emission factor of the embodied emissions of the renewable energy generation plant (hydropower)",
      unit: "g CO2e/kWh",
      value: vmr ? efEmbodied / 1_000 : null,
      kind: "validation",
      source: vmr ? "NREL, Life Cycle GHG Emissions from Electricity Generation: Update (Sep 2021)" : "Not in ACM0002",
      equation: "(19), (20)",
      clause: vmr ? "VMR0017 §9.1" : `${acm} §5.6 (no leakage)`,
    },
    {
      symbol: "Cap_BL",
      description: "Installed capacity before the project activity (zero for a new plant)",
      unit: "kW",
      value: design.baselineCapacityKw,
      kind: "validation",
      source: "Manufacturer's specifications or recognized standards",
      equation: "(7)",
      clause: `${acm} Data/Parameter table 7`,
    },
    {
      symbol: "A_BL",
      description: "Reservoir area at full level before the project activity",
      unit: "m²",
      value: design.baselineReservoirAreaM2,
      kind: "validation",
      source: "Topographical surveys, maps or satellite pictures",
      equation: "(7)",
      clause: `${acm} Data/Parameter table 8`,
    },
    {
      symbol: "EG_historical + σ_historical",
      description: "Historical net generation to the grid plus one standard deviation (retrofits and additions)",
      unit: "MWh/yr",
      value: greenfield ? null : design.baselineWh / MWH,
      kind: "validation",
      source: greenfield ? "Not applicable: greenfield plant (EG_PJ,y = EG_facility,y)" : "Metered history, ≥ 5 years",
      equation: "(14)",
      clause: `${acm} Data/Parameter tables 2–3, ¶67`,
    },
    {
      symbol: "DATE_BaselineRetrofit",
      description: "When the existing equipment would have been replaced without the project",
      unit: "date",
      value: greenfield || !design.baselineEndsAt ? null : iso(design.baselineEndsAt),
      kind: "validation",
      source: greenfield ? "Not applicable: greenfield plant" : "Project activity site",
      equation: "(14)–(15)",
      clause: `${acm} Data/Parameter table 4, §5.5.2`,
    },
    {
      symbol: "COEF_i,y",
      description: "CO2 emission coefficient of the fossil fuel burnt on site",
      unit: "t CO2/t fuel",
      value: design.fuelCoefGPerTonne / T,
      kind: "validation",
      source: "TOOL03 (IPCC upper bound of the default factors)",
      equation: "TOOL03",
      clause: `TOOL03 via ${acm} ¶83`,
    },

    // ── Monitored (ACM0002 §6.1, VMR0017 §9.2) ──────────────────────────────
    {
      symbol: "Cap_PJ",
      description: "Installed capacity after the project activity",
      unit: "kW",
      value: design.capacityKw,
      kind: "monitored",
      source: "Manufacturer's specifications or commissioning data; registered on-chain",
      frequency: "Once at the beginning of each crediting period",
      equation: "(7)",
      clause: `${acm} Data/Parameter table 14`,
    },
    {
      symbol: "A_PJ",
      description: "Reservoir area at full level after the project activity",
      unit: "m²",
      value: design.reservoirAreaM2,
      kind: "monitored",
      source: "Topographical surveys, maps or satellite pictures; registered on-chain",
      frequency: "Once at the beginning of each crediting period",
      equation: "(7)",
      clause: `${acm} Data/Parameter table 15`,
    },
    {
      symbol: "EG_facility,y",
      description: "Net electricity supplied by the project plant to the grid (export − import)",
      unit: "MWh",
      value: p.netWh / MWH,
      kind: "monitored",
      source: `Direct measurement, main meter at the grid interface${p.signed && p.device ? `; batch signed by the meter key ${p.device}` : ""}`,
      frequency: "Monitored continuously; this period aggregated from its metered intervals",
      qaqc: [
        `check meter reconciled (${p.checkMeterDiscrepancies} discrepancy interval(s), lower reading used)`,
        p.calibrationIntervals
          ? `calibration expired: export × (1 − ${metering.mainMeterAccuracyPct}%) on ${p.calibrationIntervals} interval(s)`
          : `calibration valid until ${metering.calibrationValidUntil.slice(0, 10)}`,
        `${(p.completenessBps / 100).toFixed(1)}% of the period covered, ${p.gapMinutes} min of gaps credited as zero`,
      ].join("; "),
      equation: addition ? "(13), (20)" : "(12), (14), (19)",
      clause: vmr ? "VMR0017 §9.2" : `${acm} §6.1 (TOOL05)`,
    },
    {
      symbol: "TEG_y",
      description: "Total electricity produced, to the grid and to internal loads",
      unit: "MWh",
      value: p.grossWh / MWH,
      kind: "monitored",
      source: "Electricity meters at the generator terminals, capped at nameplate × period",
      frequency: "Continuous measurement and at least monthly recording",
      equation: "(9)",
      clause: `${acm} Data/Parameter table 13 (applies when 4 < PD ≤ 10 W/m²)`,
    },
    {
      symbol: "FC_i,j,y",
      description: "Fossil fuel burnt on site (backup generation)",
      unit: "t",
      value: p.fuelG / T,
      kind: "monitored",
      source: "Fuel records per interval, summed and rounded up",
      equation: "TOOL03",
      clause: `TOOL03 via ${acm} ¶83`,
    },

    // ── Calculated ─────────────────────────────────────────────────────────
    {
      symbol: "PD",
      description: "Power density of the new or enlarged reservoir",
      unit: "W/m²",
      value: pd.wPerM2 === null ? null : Number(pd.wPerM2.toFixed(2)),
      kind: "calculated",
      source: pd.basis,
      equation: "(7)–(8): PD = (Cap_PJ − Cap_BL) / (A_PJ − A_BL)",
      clause: `${acm} ¶9`,
    },
    {
      symbol: "EG_PJ,y",
      description: "Net electricity generation attributable to the project activity",
      unit: "MWh",
      value: calculated(e?.egProjectWh, MWH),
      kind: "calculated",
      source: greenfield
        ? "Greenfield: EG_PJ,y = EG_facility,y"
        : addition
          ? "Capacity addition: EG_PJ,y = EG_PJ_Add,y"
          : "Retrofit: EG_facility,y − (EG_historical + σ_historical) until DATE_BaselineRetrofit",
      equation: greenfield ? "(12)" : addition ? "(13)" : "(14)–(16)",
      clause: `${acm} §5.5.1`,
    },
    {
      symbol: "BE_y",
      description: "Baseline emissions",
      unit: "t CO2e",
      value: calculated(e?.baselineG, T),
      kind: "calculated",
      source: "EG_PJ,y × EF_grid,CM,y, rounded down",
      equation: "(11)",
      clause: vmr ? "VMR0017 §8.1 (ACM0002 unchanged); ACM0002 §5.5" : `${acm} §5.5`,
    },
    {
      symbol: "PE_HP,y",
      description: "Project emissions from the water reservoir",
      unit: "t CO2e",
      value: calculated(e?.reservoirG, T),
      kind: "calculated",
      source: pd.peHpGPerMwh ? "EF_Res × TEG_y, rounded up" : pd.basis,
      equation: pd.peHpGPerMwh ? "(9)" : "(10)",
      clause: `${acm} §5.4.3`,
    },
    {
      symbol: "PE_FF,y",
      description: "Project emissions from fossil fuel combustion",
      unit: "t CO2",
      value: calculated(e?.fossilFuelG, T),
      kind: "calculated",
      source: "FC_i,j,y × COEF_i,y, rounded up",
      equation: "TOOL03",
      clause: `${acm} §5.4.1`,
    },
    {
      symbol: "PE_y",
      description: "Project emissions",
      unit: "t CO2e",
      value: calculated(e?.projectG, T),
      kind: "calculated",
      source: "PE_FF,y + PE_HP,y (no geothermal, BESS, pumped storage or fire suppression in this plant)",
      equation: "(1)",
      clause: vmr ? "VMR0017 §8.2 eq. (1)" : `${acm} eq. (1)`,
    },
    {
      symbol: "LE_y",
      description: vmr ? "Leakage: annualized embodied emissions of the plant" : "Leakage",
      unit: "t CO2e",
      value: calculated(e?.leakageG, T),
      kind: "calculated",
      source: !vmr
        ? "No leakage under ACM0002"
        : design.projectType === 1
          ? "0: VMR0017 §8.3 gives no embodied-emission equation for a retrofit"
          : `${greenfield ? "EG_facility,y" : "EG_PJ_Add,y"} × EF_embodied × 10⁻³, rounded up`,
      equation: vmr ? (greenfield ? "(19)" : "(20)") : undefined,
      clause: vmr ? "VMR0017 §8.3 (replaces ACM0002 §5.6)" : `${acm} §5.6`,
    },
    {
      symbol: "ER_y",
      description: "Emission reductions",
      unit: "t CO2e",
      value: calculated(e?.reductionG, T),
      kind: "calculated",
      source: vmr ? "BE_y − PE_y − LE_y" : "BE_y − PE_y",
      equation: "(17)",
      clause: vmr ? "VMR0017 §8.4 (replaces ACM0002 eq. 17)" : `${acm} §5.7`,
    },
  ];

  const notApplied = vmr
    ? [
        { symbol: "PE_GP,y", clause: "VMR0017 §8.2 eq. (1)", reason: "Not a geothermal plant" },
        { symbol: "PE_BESS,y", clause: "VMR0017 §8.2, ¶49", reason: "No battery storage registered" },
        { symbol: "PE_PSP,y", clause: "VMR0017 §8.2, ¶53", reason: "Not a pumped storage plant" },
        { symbol: "PE_FSS,y", clause: "VMR0017 §8.2.1 eq. (18)", reason: "No BESS fire suppression system" },
      ]
    : [
        { symbol: "PE_GP,y", clause: `${acm} §5.4.2`, reason: "Not a geothermal plant" },
        { symbol: "PE_BESS,y", clause: `${acm} §5.4.4`, reason: "No battery storage registered" },
        { symbol: "PE_PSP,y", clause: `${acm} §5.4.5`, reason: "Not a pumped storage plant" },
      ];

  return {
    methodology: vmr ? "VMR0017 v1.0 with ACM0002 v22.0" : plant.methodology === "AMS-I.D" ? "AMS-I.D v18.0" : acm,
    documents: vmr
      ? ["VMR0017 v1.0", "ACM0002 v22.0", "VT0011 v1.0", "TOOL03", "VCS Standard v5.0"]
      : [plant.methodology === "AMS-I.D" ? "AMS-I.D v18.0" : acm, "TOOL07", "TOOL03"],
    parameters,
    notApplied,
  };
}
