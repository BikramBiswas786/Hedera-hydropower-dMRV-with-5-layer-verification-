import { DEMO_METERING, DEMO_PLANT, DEMO_PLANTS } from "./demo";
import { DECISION_RULES, type VerificationReport, verifyReadings } from "./engine";
import { EMPTY_LEDGER, quantifyPeriod } from "./methodology/quantify";
import { SCENARIO_NAMES, type ScenarioName, generateScenario } from "./scenarios";
import type { Reading } from "./schema";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const run = (name: ScenarioName, plant = DEMO_PLANT) => {
  const request = generateScenario(name, { end: END, plant });
  return { request, report: verifyReadings(request.readings, request.plant, request.metering) };
};
const stage = (report: VerificationReport, name: VerificationReport["stages"][number]["stage"]) =>
  report.stages.find(s => s.stage === name)?.status;

describe("verifyReadings — decisions", () => {
  const expected: Record<ScenarioName, VerificationReport["decision"]> = {
    healthy: "APPROVED",
    "diesel-backup": "APPROVED",
    "calibration-overdue": "APPROVED",
    "meter-drift": "FLAGGED",
    "data-gaps": "FLAGGED",
    spikes: "FLAGGED",
    polluted: "FLAGGED",
    inflated: "REJECTED",
    replay: "REJECTED",
  };

  for (const plant of DEMO_PLANTS) {
    for (const name of SCENARIO_NAMES) {
      it(`${plant.plantId} ${name} → ${expected[name]}`, () => {
        expect(run(name, plant).report.decision).toBe(expected[name]);
      });
    }
  }
});

describe("verifyReadings — monitoring data QA/QC", () => {
  it("nets export against import at the grid meter (EG_facility)", () => {
    const { request } = run("healthy");
    const readings: Reading[] = request.readings.map((r, i) => (i === 0 ? { ...r, importKwh: 12.5 } : r));
    const withImport = verifyReadings(readings, request.plant, request.metering);
    const healthy = run("healthy").report;
    expect(withImport.monitored.netWh).toBe(healthy.monitored.netWh - 12_500);
  });

  it("uses the lower of main and check meter when they disagree beyond their accuracy", () => {
    const { request, report } = run("meter-drift");
    const drifted = request.readings.slice(12, 18);
    const credited = request.readings.reduce(
      (s, r, i) => s + (i >= 12 && i < 18 ? (r.checkExportKwh as number) : r.exportKwh),
      0,
    );
    expect(report.monitored.netWh).toBe(Math.floor(Number((credited * 1_000).toFixed(3))));
    expect(report.monitored.deductions.checkMeterWh).toBe(
      Math.round(drifted.reduce((s, r) => s + r.exportKwh - (r.checkExportKwh as number), 0) * 1_000),
    );
    expect(stage(report, "integrity")).toBe("REVIEW");
  });

  it("applies the meter's maximum permissible error after calibration expires", () => {
    const healthy = run("healthy").report;
    const { report } = run("calibration-overdue");
    const mpe = DEMO_METERING.mainMeterAccuracyPct / 100;
    expect(report.monitored.netWh).toBe(Math.floor(healthy.monitored.netWh * (1 - mpe)));
    expect(report.issues.some(i => i.severity === "info" && /calibration expired/.test(i.message))).toBe(true);
  });

  it("assumes unverifiable calibration when no metering record is given", () => {
    const { request } = run("healthy");
    const withoutRecord = verifyReadings(request.readings, request.plant);
    const withRecord = verifyReadings(request.readings, request.plant, request.metering);
    expect(withoutRecord.monitored.netWh).toBeLessThan(withRecord.monitored.netWh);
    expect(withoutRecord.monitored.deductions.calibrationWh).toBeGreaterThan(0);
  });

  it("credits missing intervals as zero and flags coverage under 90%", () => {
    const { report } = run("data-gaps");
    expect(report.completenessBps).toBe(8_333);
    expect(report.completenessBps).toBeLessThan(DECISION_RULES.minCompletenessBps);
    expect(report.periodEnd - report.periodStart).toBe(24 * 3_600);
  });

  it("rejects replayed timestamps however good the numbers look", () => {
    const { report } = run("replay");
    expect(stage(report, "integrity")).toBe("FAIL");
    expect(report.reasoning).toMatch(/counted twice/);
  });

  it("never credits export above generation", () => {
    const { request } = run("healthy");
    // Within the meter's ±0.2%, so the interval is not excluded, but the excess is still not credited.
    const readings = request.readings.map((r, i) =>
      i === 3 ? { ...r, exportKwh: r.generationKwh * 1.001, checkExportKwh: undefined } : r,
    );
    const report = verifyReadings(readings, request.plant, request.metering);
    expect(report.monitored.deductions.aboveGenerationWh).toBeGreaterThan(0);
    expect(report.monitored.netWh).toBeLessThanOrEqual(report.monitored.grossWh);
  });
});

describe("verifyReadings — physical cross-checks", () => {
  it("excludes intervals above ρ·g·Q·H·η_max instead of scaling them", () => {
    const { report } = run("spikes");
    expect(report.excludedIntervals).toEqual([5, 12, 19]);
    expect(report.monitored.deductions.excludedWh).toBeGreaterThan(0);
    expect(stage(report, "physics")).toBe("REVIEW");
  });

  it("rejects systematic over-reporting and credits none of it", () => {
    const { report } = run("inflated");
    expect(report.excludedIntervals.length / report.readingCount).toBeGreaterThan(DECISION_RULES.maxExcludedShare);
    expect(report.monitored.netWh).toBe(0);
    expect(stage(report, "physics")).toBe("FAIL");
  });

  it("excludes generation above nameplate", () => {
    const { request } = run("healthy");
    const readings = request.readings.map((r, i) => (i === 0 ? { ...r, generationKwh: 600, exportKwh: 590 } : r));
    const report = verifyReadings(readings, request.plant, request.metering);
    expect(report.excludedIntervals).toContain(0);
    expect(report.issues.find(i => i.reading === 0)?.message).toMatch(/nameplate/);
  });
});

describe("verifyReadings — quantification", () => {
  it("reports exactly what quantifyPeriod (and the contract) compute from the monitored totals", () => {
    const { report } = run("diesel-backup");
    const q = quantifyPeriod(DEMO_PLANT.design, EMPTY_LEDGER, {
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      netWh: BigInt(report.monitored.netWh),
      grossWh: BigInt(report.monitored.grossWh),
      fuelG: BigInt(report.monitored.fuelG),
      leakageG: 0n,
    });
    expect(report.emissions).toMatchObject({
      egProjectWh: Number(q.egProjectWh),
      baselineG: Number(q.baselineG),
      fossilFuelG: Number(q.fossilFuelG),
      reductionG: Number(q.reductionG),
      unitsMinted: Number(q.unitsMinted),
    });
    expect(report.emissions?.fossilFuelG).toBeGreaterThan(0);
  });

  it("ER = BE − PE − LE in the equation trace", () => {
    const { report } = run("healthy", DEMO_PLANTS[1]);
    const value = (symbol: string) => report.equations.find(e => e.symbol === symbol)?.value as number;
    expect(value("PE_HP")).toBeGreaterThan(0); // 4 < PD ≤ 10 for the storage plant
    expect(value("ER")).toBeCloseTo(value("BE") - value("PE") - value("LE"), 9);
    expect(value("PE")).toBeCloseTo(value("PE_FF") + value("PE_HP"), 9);
  });

  it("uses TEG, not net export, for reservoir emissions", () => {
    const { report } = run("healthy", DEMO_PLANTS[1]);
    expect(report.emissions?.reservoirG).toBe(Math.ceil((report.monitored.grossWh * 90_000) / 1e6));
  });

  it("does not quantify a period outside the crediting period", () => {
    const request = generateScenario("healthy", { end: new Date("2025-06-01T00:00:00Z") });
    const report = verifyReadings(request.readings, request.plant, request.metering);
    expect(report.decision).toBe("REJECTED");
    expect(report.emissions).toBeNull();
    expect(stage(report, "applicability")).toBe("FAIL");
  });

  it("keeps the credited quantity when only safeguards are out of range", () => {
    expect(run("polluted").report.emissions).toEqual(run("healthy").report.emissions);
  });

  it("stays within the contract's nameplate ceiling and is deterministic", () => {
    const { report } = run("healthy");
    expect(report.monitored.grossWh).toBeLessThanOrEqual(DEMO_PLANT.design.capacityKw * 24 * 1_000);
    expect(run("healthy").report).toEqual(report);
  });
});
