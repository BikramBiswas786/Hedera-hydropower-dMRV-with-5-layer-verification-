import { toLedger, toLedgerJson } from "../engine";
import { MethodologyError } from "../methodology/errors";
import { EMPTY_LEDGER } from "../methodology/quantify";
import {
  INCOME_GROUP_CODE,
  type RenewableDesign,
  type RenewableQuantification,
  TECHNOLOGY_CODE,
  quantifyRenewablePeriod,
  renewableDesignErrors,
  renewableEmbodiedGPerMwh,
} from "../methodology/renewable";
import { milliCeil, milliFloor } from "../provenance";
import { ledgerSchema, meteringSchema } from "../schema";
import {
  type EngineReport,
  type Finding,
  type MethodologyEngine,
  type MonitoringParameter,
  type MonitoringReport,
  decide,
  stageStatus,
} from "./types";
import { zeroHash } from "viem";
import { z } from "zod";

/**
 * Engine for greenfield grid-connected solar, wind and ocean power under Verra VMR0017 v1.0 (revising ACM0002 v22.0)
 * or CDM ACM0002 / AMS-I.D. Its quantities are the integers `RenewableVmr0017Module` recomputes on-chain
 * (`methodology/renewable.ts`, pinned by `test/fixtures/renewableVectors.ts`); this file adds the monitoring QA/QC
 * VMR0017 §9.2 asks for and reports the period as the methodology's data and parameters tables.
 *
 * Pure and deterministic: the design's "now" is the end of the monitoring period.
 */

const TECHNOLOGIES = Object.keys(TECHNOLOGY_CODE) as [
  keyof typeof TECHNOLOGY_CODE,
  ...(keyof typeof TECHNOLOGY_CODE)[],
];
const INCOME_GROUPS = Object.keys(INCOME_GROUP_CODE) as [
  keyof typeof INCOME_GROUP_CODE,
  ...(keyof typeof INCOME_GROUP_CODE)[],
];
const MIN_COMPLETENESS_BPS = 9_000;
/** A PV array cannot deliver more than its rated power × irradiance / 1000 W/m² (STC) for long; 25% headroom. */
const PV_IRRADIANCE_HEADROOM = 1.25;
/** Typical cut-in and cut-out wind speeds: generation outside them points at a sensor or meter fault. */
const WIND_CUT_IN_MS = 3;
const WIND_CUT_OUT_MS = 25;

export const renewableReadingSchema = z.object({
  /** End of the interval. */
  timestamp: z.iso.datetime({ offset: true }),
  intervalMinutes: z.number().int().positive().max(1_440),
  /** Gross generation at the inverter or generator terminals (kWh). */
  generationKwh: z.number().nonnegative(),
  /** Main meter at the grid interface: export and import (kWh). */
  exportKwh: z.number().nonnegative(),
  importKwh: z.number().nonnegative().optional(),
  checkExportKwh: z.number().nonnegative().optional(),
  fuelKg: z.number().nonnegative().optional(),
  /** Plane-of-array irradiance (W/m²), for solar plausibility. */
  irradianceWm2: z.number().nonnegative().max(1_600).optional(),
  /** Hub-height wind speed (m/s), for wind plausibility. */
  windSpeedMs: z.number().nonnegative().max(80).optional(),
});

export const renewablePlantSchema = z.object({
  plantId: z.string().min(1).max(31),
  name: z.string().max(80),
  methodology: z.enum(["VMR0017", "ACM0002", "AMS-I.D"]),
  technology: z.enum(TECHNOLOGIES),
  /** World Bank income group of the host country (VMR0017 Table 1). */
  incomeGroup: z.enum(INCOME_GROUPS),
  capacityKw: z.number().int().positive(),
  /** EF_grid,CM,y fixed ex-ante (VT0011 on the VMR0017 path, TOOL07 on the CDM path), g CO2/MWh. */
  efGridGPerMwh: z.number().int().positive().max(2_000_000),
  /** TOOL03 COEF of the backup fuel, g CO2 per tonne; 0 when no fuel is burnt. */
  fuelCoefGPerTonne: z.number().int().nonnegative(),
  creditingStart: z.iso.datetime({ offset: true }),
  creditingEnd: z.iso.datetime({ offset: true }),
  registrationRequestedAt: z.iso.datetime({ offset: true }),
});

export const renewableInputSchema = z.object({
  plant: renewablePlantSchema,
  metering: meteringSchema,
  readings: z.array(renewableReadingSchema).min(1).max(2_000),
  /** The plant's on-chain ledger before this period; a new plant starts empty. */
  ledger: ledgerSchema.optional(),
});

export type RenewableInput = z.infer<typeof renewableInputSchema>;
export type RenewableReport = EngineReport & {
  plantId: string;
  periodStart: number;
  periodEnd: number;
  completenessBps: number;
  monitored: {
    netWh: number;
    grossWh: number;
    fuelG: number;
    excludedWh: number;
    checkMeterWh: number;
    calibrationWh: number;
  };
  emissions: {
    creditingYear: number;
    egProjectWh: number;
    baselineG: number;
    fossilFuelG: number;
    leakageG: number;
    reductionG: number;
    unitsMinted: number;
  } | null;
};

const CLAUSE = {
  applicability: "VMR0017 §4 Table 1 (technology, capacity, geography)",
  smallScale: "AMS-I.D v18.0 ¶6: 15 MW small-scale limit",
  crediting: "VCS v5.0 crediting period (V5#101)",
  meter: "VMR0017 §9.2 EG_facility,y: direct measurement with meters at the grid interface",
  continuity: "VMR0017 §9.2 monitor continuously; ACM0002 v22.0 ¶82: 100% of data monitored",
  hourly: "AMS-I.D v18.0 §6.1: continuous monitoring, hourly measurement",
  checkMeter: "VMR0017 §9.2 QA/QC: cross-check the meter (check meter, utility invoices)",
  calibration: "VMR0017 §9.2 QA/QC: test and calibrate meters per utility or national requirements",
  plausibility:
    "Plausibility of metered data (engine check, conservative exclusion); VCS principle of conservativeness",
  completeness: "ACM0002 v22.0 ¶82: 100% of data monitored; missing intervals credited as zero",
  quantification: "VMR0017 §8.4 eq. (17): ER_y = BE_y − PE_y − LE_y",
} as const;

const STAGES = {
  applicability: { title: "Applicability & crediting period", clause: "VMR0017 §4; ACM0002 v22.0 §2.2" },
  integrity: { title: "Monitoring data QA/QC", clause: "VMR0017 §9.2; ACM0002 v22.0 §6" },
  plausibility: { title: "Resource and capacity cross-checks", clause: CLAUSE.plausibility },
  quantification: { title: "Emission reductions (BE − PE − LE)", clause: "VMR0017 §8; ACM0002 v22.0 §5.4–5.7" },
} as const;
type Stage = keyof typeof STAGES;

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1_000);
const EMBODIED_SOURCE = {
  "solar-pv": 43,
  "floating-solar": 43,
  "wind-onshore": 13,
  "wind-offshore": 13,
  wave: 8,
  tidal: 8,
};

export function designOf(plant: RenewableInput["plant"], metering: RenewableInput["metering"]): RenewableDesign {
  return {
    methodology: plant.methodology === "VMR0017" ? 1 : 0,
    technology: TECHNOLOGY_CODE[plant.technology],
    incomeGroup: INCOME_GROUP_CODE[plant.incomeGroup],
    capacityKw: plant.capacityKw,
    efGridGPerMwh: plant.efGridGPerMwh,
    fuelCoefGPerTonne: plant.fuelCoefGPerTonne,
    creditingStart: seconds(plant.creditingStart),
    creditingEnd: seconds(plant.creditingEnd),
    registrationRequestedAt: seconds(plant.registrationRequestedAt),
    calibrationValidUntil: seconds(metering.calibrationValidUntil),
    meteringHash: zeroHash,
    designHash: zeroHash,
  };
}

export function verifyRenewable(input: RenewableInput): RenewableReport {
  const { plant, metering, readings } = input;
  const findings: Finding[] = [];
  const add = (
    stage: Stage,
    severity: Finding["severity"],
    message: string,
    clause: string,
    reading: number | null = null,
  ) => findings.push({ stage, reading, severity, message, clause });

  // ── QA/QC: timeline ───────────────────────────────────────────────────────
  const spans = readings.map(r => {
    const endMs = Date.parse(r.timestamp);
    return { endMs, startMs: endMs - r.intervalMinutes * 60_000 };
  });
  let gapMinutes = 0;
  for (let i = 1; i < spans.length; i++) {
    const [previous, current] = [spans[i - 1], spans[i]];
    if (current.endMs <= previous.endMs) {
      add(
        "integrity",
        "reject",
        "Duplicate or out-of-order timestamp: the interval would be counted twice",
        CLAUSE.continuity,
        i,
      );
    } else if (current.startMs < previous.endMs) {
      add(
        "integrity",
        "reject",
        "Interval overlaps the previous one: energy would be counted twice",
        CLAUSE.continuity,
        i,
      );
    } else if (current.startMs > previous.endMs) {
      const minutes = (current.startMs - previous.endMs) / 60_000;
      gapMinutes += minutes;
      add(
        "integrity",
        "info",
        `Data gap of ${minutes} min before this interval: credited as zero`,
        CLAUSE.continuity,
        i,
      );
    }
  }
  if (plant.methodology === "AMS-I.D" && readings.some(r => r.intervalMinutes > 60)) {
    add("integrity", "review", "AMS-I.D §6.1 requires hourly measurement; some intervals are longer", CLAUSE.hourly);
  }
  const periodStartMs = Math.min(...spans.map(s => s.startMs));
  const periodEndMs = Math.max(...spans.map(s => s.endMs));
  const periodStart = Math.floor(periodStartMs / 1_000);
  const periodEnd = Math.floor(periodEndMs / 1_000);

  // ── Applicability ─────────────────────────────────────────────────────────
  const design = designOf(plant, metering);
  for (const error of renewableDesignErrors(design, periodEnd)) {
    add("applicability", "reject", error, /VCS|crediting/i.test(error) ? CLAUSE.crediting : CLAUSE.applicability);
  }
  if (plant.methodology === "AMS-I.D" && plant.capacityKw > 15_000) {
    add("applicability", "reject", `AMS-I.D is small-scale: ${plant.capacityKw} kW exceeds 15 MW`, CLAUSE.smallScale);
  }

  // ── Per interval: QA/QC adjustments and plausibility ─────────────────────
  const mpe = metering.mainMeterAccuracyPct / 100;
  const checkMpe = metering.checkMeterAccuracyPct / 100;
  const calibrationValidUntilMs = Date.parse(metering.calibrationValidUntil);
  const deductions = { excluded: 0, checkMeter: 0, calibration: 0 };
  let discrepancies = 0;
  let calibrationIntervals = 0;
  let acceptedMinutes = 0;
  let netKwh = 0;
  let grossKwh = 0;
  const solar = plant.technology === "solar-pv" || plant.technology === "floating-solar";
  const wind = plant.technology === "wind-onshore" || plant.technology === "wind-offshore";

  readings.forEach((r, i) => {
    const hours = r.intervalMinutes / 60;
    const nameplateKwh = plant.capacityKw * hours;
    const reasons: string[] = [];
    if (r.generationKwh > nameplateKwh * (1 + mpe))
      reasons.push(`generation above nameplate ${nameplateKwh.toFixed(1)} kWh`);
    if (r.exportKwh > r.generationKwh * (1 + mpe) + 0.001) reasons.push("export above generation");
    if (solar && r.irradianceWm2 !== undefined) {
      const ceiling = ((plant.capacityKw * r.irradianceWm2) / 1_000) * hours * PV_IRRADIANCE_HEADROOM;
      if (r.generationKwh > ceiling + 0.001) {
        reasons.push(
          `generation ${r.generationKwh} kWh above what ${r.irradianceWm2} W/m² can produce (${ceiling.toFixed(1)} kWh)`,
        );
      }
    }
    if (wind && r.windSpeedMs !== undefined && (r.windSpeedMs < WIND_CUT_IN_MS || r.windSpeedMs > WIND_CUT_OUT_MS)) {
      if (r.generationKwh > nameplateKwh * 0.05) {
        add(
          "plausibility",
          "review",
          `Generation at ${r.windSpeedMs} m/s wind, outside the cut-in/cut-out range`,
          CLAUSE.plausibility,
          i,
        );
      }
    }

    let exportKwh = r.exportKwh;
    let importKwh = r.importKwh ?? 0;
    if (r.checkExportKwh !== undefined) {
      const tolerance = (mpe + checkMpe) * Math.max(r.exportKwh, r.checkExportKwh) + 0.001;
      if (Math.abs(r.exportKwh - r.checkExportKwh) > tolerance) {
        discrepancies++;
        if (r.checkExportKwh < exportKwh) {
          deductions.checkMeter += exportKwh - r.checkExportKwh;
          exportKwh = r.checkExportKwh;
        }
      }
    }
    if (Date.parse(r.timestamp) > calibrationValidUntilMs) {
      calibrationIntervals++;
      deductions.calibration += exportKwh * mpe;
      exportKwh *= 1 - mpe;
      importKwh *= 1 + mpe;
    }
    grossKwh += Math.min(r.generationKwh, nameplateKwh);
    if (reasons.length) {
      add("plausibility", "review", `Excluded (credited as zero): ${reasons.join("; ")}`, CLAUSE.plausibility, i);
      deductions.excluded += exportKwh;
      exportKwh = 0;
    } else {
      acceptedMinutes += r.intervalMinutes;
    }
    netKwh += exportKwh - importKwh;
  });

  if (discrepancies) {
    add(
      "integrity",
      "review",
      `Main and check meters disagree beyond their combined accuracy in ${discrepancies} interval(s); the lower reading was used`,
      CLAUSE.checkMeter,
    );
  }
  if (calibrationIntervals) {
    add(
      "integrity",
      "info",
      `Calibration expired: export × (1 − ${metering.mainMeterAccuracyPct}%) in ${calibrationIntervals} interval(s)`,
      CLAUSE.calibration,
    );
  }
  const completenessBps = Math.min(
    10_000,
    Math.floor((acceptedMinutes / ((periodEndMs - periodStartMs) / 60_000)) * 10_000),
  );
  if (completenessBps < MIN_COMPLETENESS_BPS) {
    add(
      "integrity",
      "review",
      `Only ${(completenessBps / 100).toFixed(1)}% of the period has accepted data (minimum ${MIN_COMPLETENESS_BPS / 100}%)`,
      CLAUSE.completeness,
    );
  }

  // ── Quantification ────────────────────────────────────────────────────────
  const netWh = milliFloor(netKwh);
  const grossWh = Math.floor(grossKwh * 1_000);
  const fuelG = milliCeil(readings.reduce((s, r) => s + (r.fuelKg ?? 0), 0));
  const ledgerJson = input.ledger ?? toLedgerJson(EMPTY_LEDGER);
  let q: RenewableQuantification | null = null;
  if (!findings.some(f => f.stage === "applicability" && f.severity === "reject")) {
    try {
      q = quantifyRenewablePeriod(design, toLedger(ledgerJson), {
        periodStart,
        periodEnd,
        netWh: BigInt(netWh),
        grossWh: BigInt(grossWh),
        fuelG: BigInt(fuelG),
        leakageG: 0n,
      });
    } catch (error) {
      if (!(error instanceof MethodologyError)) throw error;
      add("applicability", "reject", error.message, CLAUSE.crediting);
    }
  }
  const emissions = q && {
    creditingYear: q.creditingYear,
    egProjectWh: Number(q.egProjectWh),
    baselineG: Number(q.baselineG),
    fossilFuelG: Number(q.fossilFuelG),
    leakageG: Number(q.leakageG),
    reductionG: Number(q.reductionG),
    unitsMinted: Number(q.unitsMinted),
  };
  if (emissions && emissions.reductionG <= 0) {
    add(
      "quantification",
      "info",
      "No net emission reduction in this period: the deficit is carried forward",
      CLAUSE.quantification,
    );
  }

  const { decision, reasoning } = decide(findings, `${(completenessBps / 100).toFixed(1)}%`);
  const methodology =
    plant.methodology === "VMR0017"
      ? "VMR0017 v1.0 with ACM0002 v22.0"
      : plant.methodology === "AMS-I.D"
        ? "AMS-I.D v18.0"
        : "ACM0002 v22.0";
  return {
    engine: renewableEngine.id,
    methodology,
    plantId: plant.plantId,
    periodStart,
    periodEnd,
    completenessBps,
    decision,
    reasoning,
    stages: (Object.keys(STAGES) as Stage[]).map(stage => ({
      stage,
      title: STAGES[stage].title,
      status: stageStatus(findings, stage),
      clause: STAGES[stage].clause,
      summary: stageSummary(stage, {
        completenessBps,
        gapMinutes,
        discrepancies,
        emissions,
        readings: readings.length,
      }),
    })),
    findings,
    reductionG: emissions?.reductionG ?? null,
    unitsMinted: emissions?.unitsMinted ?? null,
    monitored: {
      netWh,
      grossWh,
      fuelG,
      excludedWh: Math.round(deductions.excluded * 1_000),
      checkMeterWh: Math.round(deductions.checkMeter * 1_000),
      calibrationWh: Math.round(deductions.calibration * 1_000),
    },
    emissions,
    monitoring: renewableMonitoringReport(
      input,
      design,
      { netWh, fuelG, completenessBps, discrepancies, calibrationIntervals, gapMinutes },
      emissions,
    ),
  };
}

function stageSummary(
  stage: Stage,
  s: {
    completenessBps: number;
    gapMinutes: number;
    discrepancies: number;
    emissions: RenewableReport["emissions"];
    readings: number;
  },
): string {
  switch (stage) {
    case "applicability":
      return "Technology, capacity, host-country income group and crediting period against the registered design";
    case "integrity":
      return `${(s.completenessBps / 100).toFixed(1)}% of the period covered, ${s.gapMinutes} min of gaps, ${s.discrepancies} meter discrepancies`;
    case "plausibility":
      return `${s.readings} intervals against nameplate and the measured resource (irradiance or wind speed)`;
    case "quantification":
      return s.emissions
        ? `ER = ${(s.emissions.reductionG / 1e6).toFixed(3)} t CO2e from ${(s.emissions.egProjectWh / 1e6).toFixed(3)} MWh EG_PJ`
        : "Not quantified";
  }
}

function renewableMonitoringReport(
  input: RenewableInput,
  design: RenewableDesign,
  p: {
    netWh: number;
    fuelG: number;
    completenessBps: number;
    discrepancies: number;
    calibrationIntervals: number;
    gapMinutes: number;
  },
  e: RenewableReport["emissions"],
): MonitoringReport {
  const { plant, metering } = input;
  const vmr = plant.methodology === "VMR0017";
  const acm = "ACM0002 v22.0";
  const t = (g: number | undefined) => (e && g !== undefined ? g / 1e6 : null);
  const embodied = renewableEmbodiedGPerMwh(design.methodology, design.technology) / 1_000;
  const parameters: MonitoringParameter[] = [
    {
      symbol: "EF_grid,CM,y",
      description: "Combined margin CO2 emission factor of the grid, fixed ex-ante",
      unit: "t CO2/MWh",
      value: plant.efGridGPerMwh / 1e6,
      kind: "validation",
      source: vmr ? "VT0011 (wind and solar weights ¶86)" : "TOOL07",
      equation: "(11)",
      clause: vmr ? "VMR0017 §9.3 (VT0011, ex-ante option)" : `${acm} ¶83 (TOOL07)`,
    },
    {
      symbol: "EF_embodied",
      description: `Embodied emissions factor for ${plant.technology}`,
      unit: "g CO2e/kWh",
      value: vmr ? embodied : null,
      kind: "validation",
      source: vmr
        ? `NREL (Sep 2021): ${EMBODIED_SOURCE[plant.technology]} g CO2e/kWh for this technology`
        : "Not in ACM0002",
      equation: "(19)",
      clause: vmr ? "VMR0017 §9.1" : `${acm} §5.6 (no leakage)`,
    },
    {
      symbol: "COEF_i,y",
      description: "CO2 emission coefficient of backup fuel",
      unit: "t CO2/t fuel",
      value: plant.fuelCoefGPerTonne / 1e6,
      kind: "validation",
      source: "TOOL03",
      equation: "TOOL03",
      clause: `TOOL03 via ${acm} ¶83`,
    },
    {
      symbol: "Cap_PJ",
      description: "Installed capacity of the project plant",
      unit: "kW",
      value: plant.capacityKw,
      kind: "monitored",
      source: "Manufacturer's specifications or commissioning data; registered on-chain",
      frequency: "Once at the beginning of each crediting period",
      clause: vmr ? "VMR0017 §4 Table 1" : `${acm} §2.2`,
    },
    {
      symbol: "EG_facility,y",
      description: "Net electricity supplied by the project plant to the grid (export − import)",
      unit: "MWh",
      value: p.netWh / 1e6,
      kind: "monitored",
      source: "Direct measurement, main meter at the grid interface",
      frequency: "Monitored continuously; aggregated for this period",
      qaqc: [
        `check meter reconciled (${p.discrepancies} discrepancy interval(s), lower reading used)`,
        p.calibrationIntervals
          ? `calibration expired: export × (1 − ${metering.mainMeterAccuracyPct}%) on ${p.calibrationIntervals} interval(s)`
          : `calibration valid until ${metering.calibrationValidUntil.slice(0, 10)}`,
        `${(p.completenessBps / 100).toFixed(1)}% of the period covered, ${p.gapMinutes} min of gaps credited as zero`,
      ].join("; "),
      equation: "(12), (19)",
      clause: vmr ? "VMR0017 §9.2" : `${acm} §6.1 (TOOL05)`,
    },
    {
      symbol: "FC_i,j,y",
      description: "Fossil fuel burnt on site",
      unit: "t",
      value: p.fuelG / 1e6,
      kind: "monitored",
      source: "Fuel records per interval, summed and rounded up",
      equation: "TOOL03",
      clause: `TOOL03 via ${acm} ¶83`,
    },
    {
      symbol: "EG_PJ,y",
      description: "Net generation attributable to the project (greenfield)",
      unit: "MWh",
      value: e ? e.egProjectWh / 1e6 : null,
      kind: "calculated",
      source: "EG_PJ,y = EG_facility,y",
      equation: "(12)",
      clause: `${acm} §5.5.1`,
    },
    {
      symbol: "BE_y",
      description: "Baseline emissions",
      unit: "t CO2e",
      value: t(e?.baselineG),
      kind: "calculated",
      source: "EG_PJ,y × EF_grid,CM,y, rounded down",
      equation: "(11)",
      clause: vmr ? "VMR0017 §8.1; ACM0002 §5.5" : `${acm} §5.5`,
    },
    {
      symbol: "PE_FF,y",
      description: "Project emissions from fossil fuel",
      unit: "t CO2",
      value: t(e?.fossilFuelG),
      kind: "calculated",
      source: "FC_i,j,y × COEF_i,y, rounded up",
      equation: "TOOL03",
      clause: `${acm} §5.4.1`,
    },
    {
      symbol: "PE_y",
      description: "Project emissions",
      unit: "t CO2e",
      value: t(e?.fossilFuelG),
      kind: "calculated",
      source: "PE_FF,y (no reservoir, geothermal, BESS, pumped storage or fire suppression terms)",
      equation: "(1)",
      clause: vmr ? "VMR0017 §8.2 eq. (1)" : `${acm} eq. (1)`,
    },
    {
      symbol: "LE_y",
      description: vmr ? "Leakage: annualized embodied emissions" : "Leakage",
      unit: "t CO2e",
      value: t(e?.leakageG),
      kind: "calculated",
      source: vmr ? "EG_facility,y × EF_embodied × 10⁻³, rounded up, never on net import" : "No leakage under ACM0002",
      equation: vmr ? "(19)" : undefined,
      clause: vmr ? "VMR0017 §8.3" : `${acm} §5.6`,
    },
    {
      symbol: "ER_y",
      description: "Emission reductions",
      unit: "t CO2e",
      value: t(e?.reductionG),
      kind: "calculated",
      source: vmr ? "BE_y − PE_y − LE_y" : "BE_y − PE_y",
      equation: "(17)",
      clause: vmr ? "VMR0017 §8.4" : `${acm} §5.7`,
    },
  ];
  return {
    methodology: vmr ? "VMR0017 v1.0 with ACM0002 v22.0" : plant.methodology === "AMS-I.D" ? "AMS-I.D v18.0" : acm,
    documents: vmr
      ? ["VMR0017 v1.0", "ACM0002 v22.0", "VT0011 v1.0", "TOOL03", "VCS Standard v5.0"]
      : [acm, "TOOL07", "TOOL03"],
    parameters,
    notApplied: [
      { symbol: "PE_HP,y", clause: `${acm} §5.4.3`, reason: "Not a hydropower plant" },
      { symbol: "PE_GP,y", clause: vmr ? "VMR0017 §8.2 eq. (1)" : `${acm} §5.4.2`, reason: "Not a geothermal plant" },
      {
        symbol: "PE_BESS,y",
        clause: vmr ? "VMR0017 §8.2, ¶49" : `${acm} §5.4.4`,
        reason: "No battery storage registered",
      },
      { symbol: "PE_PSP,y", clause: vmr ? "VMR0017 §8.2, ¶53" : `${acm} §5.4.5`, reason: "Not a pumped storage plant" },
      ...(vmr
        ? [{ symbol: "PE_FSS,y", clause: "VMR0017 §8.2.1 eq. (18)", reason: "No BESS fire suppression system" }]
        : []),
    ],
  };
}

/** A 5 MW solar PV plant in a lower-middle-income country, 24 hourly intervals ending at `end`. */
function exampleInput(end: Date): RenewableInput {
  const endMs = Math.floor(end.getTime() / 3_600_000) * 3_600_000;
  const readings = Array.from({ length: 24 }, (_, i) => {
    const timestamp = new Date(endMs - (23 - i) * 3_600_000);
    const hour = timestamp.getUTCHours();
    const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const irradianceWm2 = Math.round(950 * sun);
    const generationKwh = Math.round(5_000 * (irradianceWm2 / 1_000) * 0.82 * 1_000) / 1_000;
    const exportKwh = Math.round(generationKwh * 0.985 * 1_000) / 1_000;
    return {
      timestamp: timestamp.toISOString(),
      intervalMinutes: 60,
      generationKwh,
      exportKwh,
      importKwh: sun === 0 ? 2.5 : 0,
      checkExportKwh: exportKwh,
      irradianceWm2,
    };
  });
  // Registered 30 days before this period with a 5-year crediting period, valid before and after VCS v5's 2027 rule.
  const creditingStartMs = Math.floor(endMs / 86_400_000) * 86_400_000 - 30 * 86_400_000;
  const day = (ms: number) => new Date(ms).toISOString();
  return {
    plant: {
      plantId: "SOLAR-DEMO-01",
      name: "Demo 5 MW solar PV plant",
      methodology: "VMR0017",
      technology: "solar-pv",
      incomeGroup: "lower-middle",
      capacityKw: 5_000,
      efGridGPerMwh: 600_000,
      fuelCoefGPerTonne: 3_238_840,
      creditingStart: day(creditingStartMs),
      creditingEnd: day(creditingStartMs + 5 * 365 * 86_400_000),
      registrationRequestedAt: day(creditingStartMs - 86_400_000),
    },
    metering: {
      mainMeterAccuracyPct: 0.2,
      checkMeterAccuracyPct: 0.5,
      calibrationValidUntil: day(creditingStartMs + 365 * 86_400_000),
      flowUncertaintyPct: 0,
    },
    readings,
  };
}

export const renewableEngine: MethodologyEngine<RenewableInput> = {
  id: "renewable-vmr0017",
  title: "Grid-connected solar, wind and ocean power",
  documents: ["VMR0017 v1.0", "ACM0002 v22.0", "AMS-I.D v18.0", "VT0011 v1.0", "TOOL03"],
  scope: "Greenfield solar PV (terrestrial and floating), onshore and offshore wind, wave and tidal plants",
  contract: "RenewableVmr0017Module",
  parse: input => renewableInputSchema.parse(input),
  verify: verifyRenewable,
  example: exampleInput,
};
