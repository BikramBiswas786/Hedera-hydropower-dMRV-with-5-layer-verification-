import { MethodologyError } from "./methodology/errors";
import {
  METHODOLOGIES,
  METHODOLOGY_CODE,
  embodiedEfGPerMwh,
  methodologyCodeOf,
  powerDensity,
  reservoirEfGPerMwh,
} from "./methodology/project";
import {
  EMPTY_LEDGER,
  type PlantLedger,
  type Quantification,
  creditingPeriodViolation,
  quantifyPeriod,
} from "./methodology/quantify";
import {
  type MeterDomain,
  type MeterStatement,
  type ProvenanceCheck,
  checkProvenance,
  meterStatementOf,
  milliCeil,
  milliFloor,
} from "./provenance";
import type { LedgerJson, Metering, PlantProfile, Reading } from "./schema";
import type { Address, Hex } from "viem";

/**
 * Verifies one monitoring period of a registered hydro plant and quantifies its emission reductions.
 *
 *   1. Applicability    — the registered design satisfies ACM0002 / AMS-I.D; the period lies inside the crediting
 *                          period and within one crediting year.
 *   2. Data QA/QC       — the batch is signed by the registered meter key; no replayed or overlapping intervals;
 *                          completeness; main/check meter reconciliation; delayed-calibration deduction. Every
 *                          adjustment goes the conservative way.
 *   3. Physics          — generation within nameplate and within the hydraulic potential ρ·g·Q·H·η_max; export
 *                          never above generation. Failing intervals are excluded, i.e. credited as zero.
 *   4. Quantification   — EG_PJ, BE, PE (TOOL03 fuel, reservoir), LE and ER in exact integers, the same numbers
 *                          the contract recomputes on-chain (`methodology/quantify.ts`).
 *   5. Safeguards       — water quality; reported for review, never changes the quantity.
 *
 * Pure and deterministic (no I/O, no clock), so anyone can re-run it on the readings published to HCS.
 */

export const ENGINE_VERSION = "hydro-dmrv-engine@3.1.0";

/** P (kW) = ρ·g·Q·H·η / 1000 with ρ = 1000 kg/m³ and g = 9.81 m/s². */
const KW_PER_M4_S = 9.81;
const MIN_SAMPLE_FOR_STATISTICS = 6;
const MODIFIED_Z_OUTLIER = 3.5;

export const DECISION_RULES = {
  /** Share of the period covered by accepted intervals below which a human must review the batch. */
  minCompletenessBps: 9_000,
  /** Share of intervals excluded by physics above which the batch is treated as systematic over-reporting. */
  maxExcludedShare: 0.2,
} as const;

/**
 * Assumed when no metering record is supplied: class 0.5 meters whose calibration cannot be shown, so the
 * delayed-calibration deduction applies to every interval. Supply real metering data to avoid it.
 */
export const DEFAULT_METERING: Metering = {
  mainMeterAccuracyPct: 0.5,
  checkMeterAccuracyPct: 1,
  calibrationValidUntil: "1970-01-01T00:00:00Z",
  flowUncertaintyPct: 5,
};

export const STAGES = {
  applicability: "Applicability & crediting period",
  integrity: "Monitoring data QA/QC",
  physics: "Physical cross-checks",
  quantification: "Emission reductions (BE − PE − LE)",
  safeguards: "Environmental safeguards",
} as const;

export type Stage = keyof typeof STAGES;
export type Severity = "info" | "review" | "reject";
export type Decision = "APPROVED" | "FLAGGED" | "REJECTED";

export type Issue = {
  stage: Stage;
  /** Index into the submitted readings, or `null` for period-level issues. */
  reading: number | null;
  severity: Severity;
  message: string;
};

export type StageResult = {
  stage: Stage;
  title: string;
  status: "PASS" | "REVIEW" | "FAIL";
  summary: string;
};

export type EquationStep = { symbol: string; expression: string; value: number; unit: string };

export type Emissions = {
  creditingYear: number;
  egProjectWh: number;
  baselineG: number;
  reservoirG: number;
  fossilFuelG: number;
  projectG: number;
  /** VMR0017 embodied emissions, included in leakageG. */
  embodiedG: number;
  leakageG: number;
  reductionG: number;
  unitsMinted: number;
};

export type VerificationReport = {
  engine: string;
  plantId: string;
  methodology: string;
  periodStart: number;
  periodEnd: number;
  readingCount: number;
  /** Whether the batch was signed by the meter key in the metering record. */
  provenance: ProvenanceCheck;
  /** Raw totals the meter signs for the registry in `meterDomain`; the contract only accepts figures at least this
   * conservative (net ≤, fuel ≥, gross = metered capped at nameplate). */
  meterStatement: MeterStatement;
  meterDomain: MeterDomain | null;
  decision: Decision;
  reasoning: string;
  completenessBps: number;
  excludedIntervals: number[];
  stages: StageResult[];
  issues: Issue[];
  monitored: {
    /** Main-meter export as read, before any QA/QC adjustment. */
    exportWh: number;
    importWh: number;
    /** EG_facility after QA/QC; what the contract receives. */
    netWh: number;
    /** TEG as metered, capped only at what the nameplate can produce in the period (the PE_HP basis). */
    grossWh: number;
    fuelG: number;
    leakageG: number;
    /** Export not credited, by reason (Wh). */
    deductions: { excludedWh: number; checkMeterWh: number; calibrationWh: number; aboveGenerationWh: number };
  };
  parameters: {
    efGridGPerMwh: number;
    reservoirGPerMwh: number;
    fuelCoefGPerTonne: number;
    baselineWh: number;
    baselineEndsAt: number;
  };
  /** Null when the period cannot be quantified (outside the crediting period, ineligible design). */
  emissions: Emissions | null;
  ledger: { before: LedgerJson; after: LedgerJson | null };
  equations: EquationStep[];
};

export const toLedger = (json: LedgerJson): PlantLedger => ({
  attestations: json.attestations,
  balanceG: BigInt(json.balanceG),
  creditingYear: json.creditingYear,
  yearNetWh: BigInt(json.yearNetWh),
});

export const toLedgerJson = (ledger: PlantLedger): LedgerJson => ({
  attestations: ledger.attestations,
  balanceG: Number(ledger.balanceG),
  creditingYear: ledger.creditingYear,
  yearNetWh: Number(ledger.yearNetWh),
});

const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const fmt = (value: number, digits = 1) => Number(value.toFixed(digits)).toLocaleString("en-US");

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type Interval = {
  index: number;
  startMs: number;
  endMs: number;
  minutes: number;
  excluded: boolean;
  /** Export after QA/QC, import after QA/QC, TEG capped at nameplate (kWh). */
  exportKwh: number;
  importKwh: number;
  generationKwh: number;
  impliedEfficiency: number | null;
};

const PROVENANCE_SUMMARY: Record<ProvenanceCheck["status"], string> = {
  signed: "meter signature valid",
  unregistered: "no meter key registered",
  missing: "meter signature missing",
  invalid: "meter signature invalid",
};

const SAFEGUARD_BANDS = {
  ph: { range: [6, 9], label: "pH" },
  turbidityNtu: { range: [0, 100], label: "Turbidity (NTU)" },
  temperatureC: { range: [0, 35], label: "Water temperature (°C)" },
} as const;

export function verifyReadings(
  readings: Reading[],
  plant: PlantProfile,
  metering: Metering = DEFAULT_METERING,
  ledgerJson: LedgerJson = toLedgerJson(EMPTY_LEDGER),
  signature?: string,
  /** The registry the meter statement is signed for; `null` checks the legacy batch signature (before readings@5). */
  domain: MeterDomain | null = null,
): VerificationReport {
  if (readings.length === 0) throw new Error("At least one reading is required");

  const { design, hydraulics } = plant;
  const issues: Issue[] = [];
  const add = (stage: Stage, severity: Severity, message: string, reading: number | null = null) =>
    issues.push({ stage, reading, severity, message });

  // ── 2. Monitoring data QA/QC: source ──────────────────────────────────────
  const provenance = checkProvenance(
    plant.plantId,
    readings,
    metering.deviceAddress as Address | undefined,
    signature as Hex | undefined,
    domain,
  );
  const meterStatement = meterStatementOf(plant.plantId, readings);
  switch (provenance.status) {
    case "unregistered":
      add("integrity", "info", "No meter key in the metering record: the batch cannot be traced to its source");
      break;
    case "missing":
      add("integrity", "reject", `The batch is not signed by the registered meter ${provenance.device}`);
      break;
    case "invalid":
      add(
        "integrity",
        "reject",
        `The meter signature does not match these readings: they changed after ${provenance.device} signed them, or another key signed`,
      );
      break;
    case "signed":
      add("integrity", "info", `Signed at the source by the registered meter ${provenance.device}`);
      break;
  }

  // ── 2. Monitoring data QA/QC: timeline ────────────────────────────────────
  const spans = readings.map((r, index) => {
    const endMs = Date.parse(r.timestamp);
    return { index, endMs, startMs: endMs - r.intervalMinutes * 60_000 };
  });
  let gapMinutes = 0;
  for (let i = 1; i < spans.length; i++) {
    const previous = spans[i - 1];
    const current = spans[i];
    if (current.endMs <= previous.endMs) {
      add("integrity", "reject", "Duplicate or out-of-order timestamp: the interval would be counted twice", i);
    } else if (current.startMs < previous.endMs) {
      add("integrity", "reject", "Interval overlaps the previous one: energy would be counted twice", i);
    } else if (current.startMs > previous.endMs) {
      const minutes = (current.startMs - previous.endMs) / 60_000;
      gapMinutes += minutes;
      add("integrity", "info", `Data gap of ${fmt(minutes, 0)} min before this interval: credited as zero`, i);
    }
  }
  const periodStartMs = Math.min(...spans.map(s => s.startMs));
  const periodEndMs = Math.max(...spans.map(s => s.endMs));
  const periodStart = Math.floor(periodStartMs / 1_000);
  const periodEnd = Math.floor(periodEndMs / 1_000);

  // ── 2 + 3. Per interval: physics, meter reconciliation, calibration ──────
  const mpe = metering.mainMeterAccuracyPct / 100;
  const checkMpe = metering.checkMeterAccuracyPct / 100;
  const calibrationValidUntilMs = Date.parse(metering.calibrationValidUntil);
  const deductions = { excluded: 0, checkMeter: 0, calibration: 0, aboveGeneration: 0 };
  let rawExportKwh = 0;
  let checkMeterDiscrepancies = 0;
  let calibrationIntervals = 0;

  const intervals: Interval[] = readings.map((r, i) => {
    const hours = r.intervalMinutes / 60;
    const nameplateKwh = design.capacityKw * hours;
    const hydraulicKwh = KW_PER_M4_S * r.flowRateM3s * r.headM * hydraulics.maxEfficiency * hours;
    const generation = r.generationKwh;
    const importRaw = r.importKwh ?? 0;
    rawExportKwh += r.exportKwh;

    const exclusions: string[] = [];
    if (generation > nameplateKwh * (1 + mpe)) {
      exclusions.push(`generation ${fmt(generation)} kWh exceeds nameplate ${fmt(nameplateKwh)} kWh`);
    }
    if (generation > hydraulicKwh * (1 + metering.flowUncertaintyPct / 100)) {
      exclusions.push(
        `generation ${fmt(generation)} kWh exceeds the hydraulic potential ρ·g·Q·H·η_max = ${fmt(hydraulicKwh)} kWh`,
      );
    }
    if (r.exportKwh > generation * (1 + mpe) + 0.001) {
      exclusions.push(`export ${fmt(r.exportKwh)} kWh exceeds generation ${fmt(generation)} kWh`);
    }
    if (r.flowRateM3s > hydraulics.maxFlowM3s || r.headM > hydraulics.maxHeadM * 1.05) {
      add("physics", "review", "Flow or head above the turbine design envelope: check the sensors", i);
    }

    let exportKwh = r.exportKwh;
    let importKwh = importRaw;
    if (r.checkExportKwh !== undefined) {
      const tolerance = (mpe + checkMpe) * Math.max(r.exportKwh, r.checkExportKwh) + 0.001;
      if (Math.abs(r.exportKwh - r.checkExportKwh) > tolerance) {
        checkMeterDiscrepancies++;
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

    const cappedGeneration = Math.min(generation, nameplateKwh);
    if (exportKwh > cappedGeneration) {
      deductions.aboveGeneration += exportKwh - cappedGeneration;
      exportKwh = cappedGeneration;
    }

    const excluded = exclusions.length > 0;
    if (excluded) {
      add("physics", "review", `Excluded (credited as zero): ${exclusions.join("; ")}`, i);
      deductions.excluded += exportKwh;
      exportKwh = 0;
    }

    const hydraulicAtUnitEfficiency = KW_PER_M4_S * r.flowRateM3s * r.headM * hours;
    return {
      index: i,
      startMs: spans[i].startMs,
      endMs: spans[i].endMs,
      minutes: r.intervalMinutes,
      excluded,
      exportKwh,
      importKwh,
      generationKwh: cappedGeneration,
      impliedEfficiency: hydraulicAtUnitEfficiency > 0 ? generation / hydraulicAtUnitEfficiency : null,
    };
  });

  if (checkMeterDiscrepancies) {
    add(
      "integrity",
      "review",
      `Main and check meters disagree beyond their combined accuracy in ${checkMeterDiscrepancies} interval(s); the lower reading was used`,
    );
  }
  if (calibrationIntervals) {
    add(
      "integrity",
      "info",
      `Main meter calibration expired: export reduced and import increased by its ±${metering.mainMeterAccuracyPct}% maximum permissible error in ${calibrationIntervals} interval(s)`,
    );
  }

  const excludedIntervals = intervals.filter(i => i.excluded).map(i => i.index);
  if (excludedIntervals.length / intervals.length > DECISION_RULES.maxExcludedShare) {
    add(
      "physics",
      "reject",
      `${excludedIntervals.length}/${intervals.length} intervals report energy the plant cannot physically produce: systematic over-reporting`,
    );
  }

  // Robust outlier test on water-to-wire efficiency (modified z-score, Iglewicz & Hoaglin).
  const efficiencies = intervals.filter(i => !i.excluded && i.impliedEfficiency !== null && i.generationKwh > 0);
  if (efficiencies.length >= MIN_SAMPLE_FOR_STATISTICS) {
    const values = efficiencies.map(i => i.impliedEfficiency as number);
    const med = median(values);
    const mad = median(values.map(v => Math.abs(v - med)));
    for (const interval of efficiencies) {
      const value = interval.impliedEfficiency as number;
      const z = mad === 0 ? (value === med ? 0 : Infinity) : (0.6745 * (value - med)) / mad;
      if (Math.abs(z) >= MODIFIED_Z_OUTLIER) {
        add(
          "physics",
          "review",
          `Water-to-wire efficiency ${pct(value)} is an outlier against the period median ${pct(med)} (modified z = ${Number.isFinite(z) ? z.toFixed(1) : "∞"})`,
          interval.index,
        );
      } else if (value < hydraulics.minEfficiency) {
        add(
          "physics",
          "info",
          `Efficiency ${pct(value)} below the design minimum: check the flow meter`,
          interval.index,
        );
      }
    }
  }

  const periodMinutes = (periodEndMs - periodStartMs) / 60_000;
  const acceptedMinutes = intervals.filter(i => !i.excluded).reduce((s, i) => s + i.minutes, 0);
  const completenessBps = Math.min(10_000, Math.floor((acceptedMinutes / periodMinutes) * 10_000));
  if (completenessBps < DECISION_RULES.minCompletenessBps) {
    add(
      "integrity",
      "review",
      `Only ${(completenessBps / 100).toFixed(1)}% of the period has accepted data (minimum ${DECISION_RULES.minCompletenessBps / 100}%)`,
    );
  }

  // ── 5. Safeguards ─────────────────────────────────────────────────────────
  for (const key of Object.keys(SAFEGUARD_BANDS) as (keyof typeof SAFEGUARD_BANDS)[]) {
    const { range, label } = SAFEGUARD_BANDS[key];
    const values = readings.map(r => r[key]).filter((v): v is number => v !== undefined);
    const outside = values.filter(v => v < range[0] || v > range[1]);
    if (outside.length) {
      add(
        "safeguards",
        "review",
        `${label} outside ${range[0]}–${range[1]} in ${outside.length} interval(s) (${Math.min(...outside)}–${Math.max(...outside)}): environmental review, quantity unchanged`,
      );
    }
  }

  // ── Aggregate monitored quantities (conservative rounding) ───────────────
  const sum = (pick: (i: Interval) => number) => intervals.reduce((s, i) => s + pick(i), 0);
  const maxEnergyWh = Math.floor((design.capacityKw * (periodEnd - periodStart) * 1_000) / 3_600);
  const netWh = milliFloor(sum(i => i.exportKwh - i.importKwh));
  // Not reduced by QA/QC: TEG is the PE_HP basis, so only the physical ceiling of the period applies.
  const grossWh = Math.min(meterStatement.grossWh, maxEnergyWh);
  const fuelG = milliCeil(readings.reduce((s, r) => s + (r.fuelKg ?? 0), 0));
  const leakageG = 0;

  // ── 1. Applicability ──────────────────────────────────────────────────────
  const pd = powerDensity(design, reservoirEfGPerMwh(design.methodology));
  if (methodologyCodeOf(plant.methodology) !== design.methodology) {
    add(
      "applicability",
      "reject",
      `The plant profile says ${plant.methodology} but the registered design uses another methodology`,
    );
  }
  if (!pd.eligible) add("applicability", "reject", pd.basis);
  const periodViolation = creditingPeriodViolation(design, periodStart, periodEnd);
  if (periodViolation) add("applicability", "reject", periodViolation);
  if (fuelG > 0 && design.fuelCoefGPerTonne === 0) {
    add("applicability", "reject", "Fossil fuel was burnt on site but no fuel is registered for TOOL03");
  }

  // ── 4. Quantification ─────────────────────────────────────────────────────
  const ledgerBefore = toLedger(ledgerJson);
  let quantification: Quantification | null = null;
  if (!issues.some(i => i.stage === "applicability" && i.severity === "reject")) {
    try {
      quantification = quantifyPeriod(design, ledgerBefore, {
        periodStart,
        periodEnd,
        netWh: BigInt(netWh),
        grossWh: BigInt(grossWh),
        fuelG: BigInt(fuelG),
        leakageG: BigInt(leakageG),
      });
    } catch (error) {
      if (!(error instanceof MethodologyError)) throw error;
      add("applicability", "reject", error.message);
    }
  }
  const emissions: Emissions | null = quantification && {
    creditingYear: quantification.creditingYear,
    egProjectWh: Number(quantification.egProjectWh),
    baselineG: Number(quantification.baselineG),
    reservoirG: Number(quantification.reservoirG),
    fossilFuelG: Number(quantification.fossilFuelG),
    projectG: Number(quantification.reservoirG + quantification.fossilFuelG),
    embodiedG: Number(quantification.embodiedG),
    leakageG: Number(quantification.leakageG),
    reductionG: Number(quantification.reductionG),
    unitsMinted: Number(quantification.unitsMinted),
  };
  if (emissions && emissions.reductionG <= 0) {
    add(
      "quantification",
      "info",
      emissions.egProjectWh <= 0
        ? "No generation above the baseline in this period: nothing to credit"
        : "Project emissions exceed baseline emissions: the deficit is carried forward",
    );
  }

  const summaries: Record<Stage, string> = {
    applicability: `${methodologyLabel(plant.methodology)}; ${pd.basis}; crediting year ${(emissions?.creditingYear ?? 0) + 1}`,
    integrity: `${PROVENANCE_SUMMARY[provenance.status]}; ${(completenessBps / 100).toFixed(1)}% of the period covered, ${fmt(gapMinutes, 0)} min of gaps, ${checkMeterDiscrepancies} meter discrepancies`,
    physics: `${intervals.length - excludedIntervals.length}/${intervals.length} intervals within nameplate and ρ·g·Q·H·η_max`,
    quantification: emissions
      ? `ER = ${fmt(emissions.reductionG / 1e6, 3)} t CO2e from ${fmt(emissions.egProjectWh / 1e6, 3)} MWh EG_PJ`
      : "Not quantified",
    safeguards: "Water quality is monitored for review only; it never changes the credited quantity",
  };
  const stages = (Object.keys(STAGES) as Stage[]).map(stage => stageResult(stage, issues, summaries[stage]));
  const { decision, reasoning } = decide(issues, completenessBps);
  const reservoirGPerMwh = pd.peHpGPerMwh;

  return {
    engine: ENGINE_VERSION,
    plantId: plant.plantId,
    methodology: methodologyLabel(plant.methodology),
    periodStart,
    periodEnd,
    readingCount: readings.length,
    provenance,
    meterStatement,
    meterDomain: domain,
    decision,
    reasoning,
    completenessBps,
    excludedIntervals,
    stages,
    issues,
    monitored: {
      exportWh: Math.round(rawExportKwh * 1_000),
      importWh: Math.round(sum(i => i.importKwh) * 1_000),
      netWh,
      grossWh,
      fuelG,
      leakageG,
      deductions: {
        excludedWh: Math.round(deductions.excluded * 1_000),
        checkMeterWh: Math.round(deductions.checkMeter * 1_000),
        calibrationWh: Math.round(deductions.calibration * 1_000),
        aboveGenerationWh: Math.round(deductions.aboveGeneration * 1_000),
      },
    },
    parameters: {
      efGridGPerMwh: design.efGridGPerMwh,
      reservoirGPerMwh,
      fuelCoefGPerTonne: design.fuelCoefGPerTonne,
      baselineWh: design.baselineWh,
      baselineEndsAt: design.baselineEndsAt,
    },
    emissions,
    ledger: { before: ledgerJson, after: quantification && toLedgerJson(quantification.ledger) },
    equations: equationsFor(plant, netWh, grossWh, fuelG, emissions, reservoirGPerMwh),
  };
}

function methodologyLabel(id: PlantProfile["methodology"]) {
  const m = METHODOLOGIES[id];
  return id === "VMR0017" ? `VMR0017 v${m.version} with ACM0002 v22.0` : `${m.id} v${m.version}`;
}

function stageResult(stage: Stage, issues: Issue[], summary: string): StageResult {
  const own = issues.filter(i => i.stage === stage);
  const status = own.some(i => i.severity === "reject")
    ? "FAIL"
    : own.some(i => i.severity === "review")
      ? "REVIEW"
      : "PASS";
  return { stage, title: STAGES[stage], status, summary };
}

function decide(issues: Issue[], completenessBps: number): { decision: Decision; reasoning: string } {
  const rejects = issues.filter(i => i.severity === "reject");
  if (rejects.length) {
    return { decision: "REJECTED", reasoning: [...new Set(rejects.map(i => i.message))].join("; ") };
  }
  const reviews = issues.filter(i => i.severity === "review");
  if (reviews.length) {
    const stages = [...new Set(reviews.map(i => STAGES[i.stage]))].join(", ");
    return {
      decision: "FLAGGED",
      reasoning: `${reviews.length} finding(s) need a verifier's review (${stages}); quantities already exclude unsupported data`,
    };
  }
  return {
    decision: "APPROVED",
    reasoning: `All checks passed with ${(completenessBps / 100).toFixed(1)}% data coverage; eligible for issuance`,
  };
}

function equationsFor(
  plant: PlantProfile,
  netWh: number,
  grossWh: number,
  fuelG: number,
  emissions: Emissions | null,
  reservoirGPerMwh: number,
): EquationStep[] {
  const { design } = plant;
  const steps: EquationStep[] = [
    { symbol: "EG_facility", expression: "Σ (export − import) after QA/QC", value: netWh / 1e6, unit: "MWh" },
    { symbol: "TEG", expression: "Σ gross generation", value: grossWh / 1e6, unit: "MWh" },
    {
      symbol: "EF_grid,CM",
      expression:
        design.methodology === METHODOLOGY_CODE.VMR0017
          ? "w_OM × EF_OM + w_BM × EF_BM (TOOL07 procedure; VMR0017 names VT0011)"
          : "TOOL07: w_OM × EF_OM + w_BM × EF_BM",
      value: design.efGridGPerMwh / 1e6,
      unit: "t CO2/MWh",
    },
  ];
  if (!emissions) return steps;
  steps.push(
    {
      symbol: "EG_PJ",
      expression:
        design.projectType === 0 ? "EG_facility" : "EG_facility − (EG_historical + σ) over the crediting year",
      value: emissions.egProjectWh / 1e6,
      unit: "MWh",
    },
    { symbol: "BE", expression: "EG_PJ × EF_grid,CM", value: emissions.baselineG / 1e6, unit: "t CO2e" },
    {
      symbol: "PE_HP",
      expression: reservoirGPerMwh
        ? `EF_Res (${reservoirGPerMwh / 1_000} kg/MWh) × TEG`
        : "0 (no reservoir emissions: PD > 10 or no new area)",
      value: emissions.reservoirG / 1e6,
      unit: "t CO2e",
    },
    {
      symbol: "PE_FF",
      expression: `FC (${fmt(fuelG / 1e6, 3)} t) × COEF (${fmt(design.fuelCoefGPerTonne / 1e6, 4)} t CO2/t), TOOL03`,
      value: emissions.fossilFuelG / 1e6,
      unit: "t CO2e",
    },
    { symbol: "PE", expression: "PE_FF + PE_HP", value: emissions.projectG / 1e6, unit: "t CO2e" },
    {
      symbol: "LE",
      expression: embodiedEfGPerMwh(design.methodology)
        ? design.projectType === 1
          ? "0 (VMR0017 §8.3 has no embodied-emission equation for a retrofit)"
          : `${design.projectType === 0 ? "EG_facility" : "max(EG_PJ, EG_facility × Cap_add / Cap_PJ)"} × EF_embodied (${embodiedEfGPerMwh(design.methodology) / 1_000} g CO2e/kWh), VMR0017 §8.3`
        : "0 (leakage not applicable)",
      value: emissions.leakageG / 1e6,
      unit: "t CO2e",
    },
    { symbol: "ER", expression: "BE − PE − LE", value: emissions.reductionG / 1e6, unit: "t CO2e" },
  );
  return steps;
}
