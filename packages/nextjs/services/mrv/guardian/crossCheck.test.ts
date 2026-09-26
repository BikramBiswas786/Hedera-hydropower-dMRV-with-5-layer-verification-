import { MappingError, REQUIRED_MR_FIELDS, crossCheckMonitoringReport, scaled } from "./crossCheck";
import { monitoringReportSubject } from "./fixtures";
import { describe, expect, it } from "vitest";

/** Spec §6.3 field mapping: the user's VMR0017 Monitoring Report (#e801fa39…) onto the hydro module. */
describe("Monitoring Report field mapping", () => {
  it("scales JSON decimals exactly (no float drift)", () => {
    expect(scaled(0.1, 6)).toBe(100_000n);
    expect(scaled(0.7, 6)).toBe(700_000n);
    expect(scaled(1000.000001, 6)).toBe(1_000_000_001n);
    expect(scaled(-2.5, 3)).toBe(-2_500n);
    expect(() => scaled(Number.NaN, 6)).toThrow(MappingError);
    expect(() => scaled(1e16, 6)).toThrow(MappingError);
  });

  it("recomputes a run-of-river report: BE = EG × EF_CM, LE = EG × 21 g/kWh, ER = BE − PE − LE", () => {
    const out = crossCheckMonitoringReport(monitoringReportSubject());
    expect(out.decision).toBe("MATCH");
    expect(out.oursG).toEqual({ be: 700_000_000n, pe: 0n, le: 21_000_000n, er: 679_000_000n });
    expect(out.deltaERg).toBe(0n);
    expect(out.notes).toEqual([]);
  });

  it("maps field3/4 (EF_OM/EF_BM), field5/6 (weights) and field7 (EG_PJ, MWh) exactly", () => {
    const out = crossCheckMonitoringReport(
      monitoringReportSubject({
        field3: 0.9,
        field4: 0.5,
        field5: 0.75,
        field6: 0.25,
        field7: 2000,
        field24: 1600,
        field26: 42,
        field27: 1558,
      }),
    );
    expect(out.oursG.be).toBe(1_600_000_000n); // 2000 MWh × (0.75·0.9 + 0.25·0.5) t/MWh
    expect(out.decision).toBe("MATCH");
  });

  it("accepts numbers sent as strings, as Guardian forms sometimes store them", () => {
    const out = crossCheckMonitoringReport(
      monitoringReportSubject({ field7: "1000", field24: "700", field26: "21", field27: "679" }),
    );
    expect(out.decision).toBe("MATCH");
  });

  it("computes PE_HP for a new reservoir with 4 < PD ≤ 10 W/m² (EF_Res 100 kg/MWh × TEG)", () => {
    const subject = monitoringReportSubject({ field9: 1, field10: 2, field11: 10, field30: 1010 });
    const out = crossCheckMonitoringReport(subject);
    expect(out.oursG.pe).toBe(101_000_000n); // policy: pehp = resef · teg / 1000 = 100 · 1010 / 1000 t
    const matched = crossCheckMonitoringReport({
      ...subject,
      field25: Number(out.oursG.pe) / 1e6,
      field27: Number(out.oursG.er) / 1e6,
    });
    expect(matched.decision).toBe("MATCH");
  });

  it("says MISMATCH with the per-term difference when the policy's figures disagree", () => {
    const out = crossCheckMonitoringReport(monitoringReportSubject({ field24: 710, field27: 689 }));
    expect(out.decision).toBe("MISMATCH");
    expect(out.deltaERg).toBe(-10_000_000n);
    expect(out.notes).toContain("BE differs by -10000000 g");
  });

  it("allows rounding slack only where EF_CM had to be rounded to whole g/MWh", () => {
    // EF_CM = 0.5·0.8000013 + 0.5·0.6 = 0.70000065 t/MWh → 700 001 g/MWh after rounding.
    const subject = monitoringReportSubject({ field3: 0.8000013, field24: 700.00065, field27: 679.00065 });
    const out = crossCheckMonitoringReport(subject);
    expect(out.decision).toBe("MATCH");
    expect(out.notes.some(n => n.startsWith("EF_CM rounded"))).toBe(true);
    expect(crossCheckMonitoringReport({ ...subject, field24: 700.002, field27: 679.002 }).decision).toBe("MISMATCH");
  });

  it("floors ER at 0 like the policy and notes the deficit", () => {
    const out = crossCheckMonitoringReport(
      monitoringReportSubject({
        field14: 1,
        field15: 100_000,
        field16: 0.01,
        field24: 700,
        field25: 1000,
        field26: 21,
        field27: 0,
      }),
    );
    expect(out.oursG.pe).toBe(1_000_000_000n);
    expect(out.oursG.er).toBe(0n);
    expect(out.decision).toBe("MATCH");
    expect(out.notes.some(n => n.includes("deficit"))).toBe(true);
  });

  it.each([
    [{ field8: 0 }, "not a hydropower report"],
    [{ field31: 5 }, "field31 is non-zero"],
    [{ field34: "flash" }, "geothermal plant type"],
    [{ field28: 1 }, "Cap_BL > 0"],
    [{ field11: 20 }, "above 15 MW"],
    [{ field9: 1, field10: 10, field11: 10 }, "Power density ≤ 4"],
    [{ field40: 1 }, "field40"],
  ])("is NOT_COMPARABLE for %j", (overrides, reason) => {
    const out = crossCheckMonitoringReport(monitoringReportSubject(overrides));
    expect(out.decision).toBe("NOT_COMPARABLE");
    expect(out.notes.join(" | ")).toContain(reason);
  });

  it("notes non-VMR0017 constants and weights that do not sum to 1, without changing our figures", () => {
    const out = crossCheckMonitoringReport(monitoringReportSubject({ field44: 30, field5: 0.6 }));
    expect(out.notes.join(" | ")).toContain("EF_embodied = 30");
    expect(out.notes.join(" | ")).toContain("w_OM + w_BM = 1.1");
    expect(out.oursG.le).toBe(21_000_000n);
  });

  it("refuses reports missing a required field", () => {
    for (const key of REQUIRED_MR_FIELDS) {
      const subject: Record<string, unknown> = monitoringReportSubject();
      delete subject[key];
      expect(() => crossCheckMonitoringReport(subject), key).toThrow(MappingError);
    }
    expect(() => crossCheckMonitoringReport(monitoringReportSubject({ field7: "abc" }))).toThrow(
      "field7 is not a number",
    );
  });
});
