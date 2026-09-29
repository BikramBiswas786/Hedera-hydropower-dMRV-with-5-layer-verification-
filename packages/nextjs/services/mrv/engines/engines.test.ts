import { DEMO_PLANTS } from "../demo";
import { prepareAnchors } from "../pipeline";
import { PREVIEW_METER_DOMAIN, generateScenario } from "../scenarios";
import { describeEngines, findEngine, verifyWithEngine } from "./index";
import { type RenewableInput, renewableEngine, verifyRenewable } from "./renewable";
import type { MonitoringReport } from "./types";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-28T12:00:00Z");
const row = (report: MonitoringReport, symbol: string) => report.parameters.find(p => p.symbol === symbol);

describe("methodology engines are plug-ins", () => {
  it("lists every engine with its documents and on-chain module", () => {
    expect(describeEngines().map(e => [e.id, e.contract])).toEqual([
      ["hydro-vmr0017", "HydroVmr0017Module"],
      ["renewable-vmr0017", "RenewableVmr0017Module"],
    ]);
    expect(findEngine("nope")).toBeNull();
    expect(verifyWithEngine("nope", {})).toBeNull();
  });

  it("runs each engine's own example through the registry", () => {
    for (const { id } of describeEngines()) {
      const engine = findEngine(id)!;
      const report = verifyWithEngine(id, engine.example(END))!;
      expect(report.engine).toBe(id);
      expect(report.decision).toBe("APPROVED");
      expect(report.reductionG).toBeGreaterThan(0);
      expect(report.findings.every(f => f.clause.length > 0)).toBe(true);
      expect(report.stages.every(s => s.clause.length > 0)).toBe(true);
    }
  });

  it("rejects input that does not match the engine's schema", () => {
    expect(() => verifyWithEngine("renewable-vmr0017", { readings: [] })).toThrow();
  });
});

describe("hydro monitoring report (VMR0017 §9 / ACM0002 §5.10, §6.1)", () => {
  it("reports each parameter with the value the engine used and its clause", () => {
    const request = generateScenario("healthy", { plant: DEMO_PLANTS[1], end: END, domain: PREVIEW_METER_DOMAIN });
    const { report } = prepareAnchors(request);
    const m = report.monitoring;
    expect(m.methodology).toBe("VMR0017 v1.0 with ACM0002 v22.0");
    expect(row(m, "EG_facility,y")).toMatchObject({ value: report.monitored.netWh / 1e6, clause: "VMR0017 §9.2" });
    expect(row(m, "EF_Res")).toMatchObject({ value: 100, clause: expect.stringContaining("VMR0017 §9.1") });
    expect(row(m, "EF_embodied")).toMatchObject({ value: 21 });
    // The storage plant's reservoir has 4 < PD ≤ 10 W/m², so PE_HP,y = EF_Res × TEG_y (ACM0002 eq. 9).
    expect(row(m, "PE_HP,y")).toMatchObject({ value: report.emissions!.reservoirG / 1e6, equation: "(9)" });
    expect(report.emissions!.reservoirG).toBeGreaterThan(0);
    expect(row(m, "LE_y")).toMatchObject({ value: report.emissions!.leakageG / 1e6, equation: "(19)" });
    expect(row(m, "ER_y")).toMatchObject({ value: report.emissions!.reductionG / 1e6, equation: "(17)" });
    expect(m.notApplied.map(n => n.symbol)).toEqual(["PE_GP,y", "PE_BESS,y", "PE_PSP,y", "PE_FSS,y"]);
  });

  it("cites a clause on every finding, including rejections", () => {
    const { report } = prepareAnchors(generateScenario("tampered", { end: END, domain: PREVIEW_METER_DOMAIN }));
    expect(report.decision).toBe("REJECTED");
    expect(report.issues.find(i => i.severity === "reject")?.clause).toContain("VMR0017 §9.2");
    expect(report.issues.every(i => i.clause)).toBe(true);
  });
});

describe("renewable engine (solar, wind, ocean)", () => {
  const example = () => renewableEngine.example(END);

  it("quantifies BE − PE − LE with the embodied factor of the technology (VMR0017 §8.3, §9.1)", () => {
    const report = verifyRenewable(example());
    const e = report.emissions!;
    const netWh = BigInt(report.monitored.netWh);
    // BE rounds down, LE (43 g CO2e/kWh for solar PV) rounds up: ACM0002 eq. 11, VMR0017 eq. 19.
    expect(BigInt(e.baselineG)).toBe((netWh * 600_000n) / 1_000_000n);
    expect(BigInt(e.leakageG)).toBe((netWh * 43_000n + 999_999n) / 1_000_000n);
    expect(e.reductionG).toBe(e.baselineG - e.fossilFuelG - e.leakageG);
    expect(row(report.monitoring, "EF_embodied")?.value).toBe(43);
    expect(report.monitoring.notApplied[0]).toMatchObject({ symbol: "PE_HP,y" });
  });

  it("refuses wind in a high-income country under VMR0017 Table 1", () => {
    const input: RenewableInput = example();
    input.plant = { ...input.plant, technology: "wind-onshore", incomeGroup: "high" };
    const report = verifyRenewable(input);
    expect(report.decision).toBe("REJECTED");
    expect(report.findings[0].clause).toContain("VMR0017 §4 Table 1");
    expect(report.emissions).toBeNull();
  });

  it("refuses AMS-I.D above the 15 MW small-scale limit", () => {
    const input = example();
    input.plant = { ...input.plant, methodology: "AMS-I.D", capacityKw: 20_000 };
    expect(verifyRenewable(input).findings.find(f => f.severity === "reject")?.clause).toContain("AMS-I.D");
  });

  it("excludes generation the measured irradiance cannot produce, and credits it as zero", () => {
    const input = example();
    const noon = input.readings.findIndex(r => (r.irradianceWm2 ?? 0) > 800);
    const clean = verifyRenewable(input);
    input.readings[noon] = { ...input.readings[noon], irradianceWm2: 100 };
    const report = verifyRenewable(input);
    expect(report.decision).toBe("FLAGGED");
    expect(report.findings.some(f => f.reading === noon && f.stage === "plausibility")).toBe(true);
    expect(report.monitored.netWh).toBeLessThan(clean.monitored.netWh);
  });

  it("deducts the meter's maximum permissible error once calibration has expired (VMR0017 §9.2)", () => {
    const input = example();
    const clean = verifyRenewable(input);
    input.metering = { ...input.metering, calibrationValidUntil: "2020-01-01T00:00:00Z" };
    const expired = verifyRenewable(input);
    expect(expired.monitored.netWh).toBeLessThan(clean.monitored.netWh);
    expect(expired.monitored.calibrationWh).toBeGreaterThan(0);
  });
});
