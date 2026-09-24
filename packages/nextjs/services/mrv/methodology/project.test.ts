import { DEMO_ASSESSMENTS, DEMO_DESIGNS } from "../demo";
import {
  CREDITING_YEAR_SECONDS,
  type ProjectDesign,
  RESERVOIR_EF_G_PER_MWH,
  assessProject,
  powerDensity,
} from "./project";
import { fuelCoefficient } from "./tool03";
import { describe, expect, it } from "vitest";

const base: ProjectDesign = {
  plantId: "TEST",
  name: "Test plant",
  projectType: "greenfield",
  capacityKw: 12_000,
  baselineCapacityKw: 0,
  reservoirAreaM2: 0,
  baselineReservoirAreaM2: 0,
  equipmentTransferred: false,
  onSiteFuel: null,
  crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 1 },
  grid: { source: "published", efTPerMwh: 0.6, reference: "test" },
  hydraulics: { maxFlowM3s: 10, maxHeadM: 100, minEfficiency: 0.7, maxEfficiency: 0.93 },
};
const design = (overrides: Partial<ProjectDesign>): ProjectDesign => ({ ...base, ...overrides });

describe("TOOL03 fuel coefficient", () => {
  it("COEF = NCV × EF_CO2 with the IPCC upper bounds (diesel: 43.3 GJ/t × 74 800 kg/TJ)", () => {
    const coef = fuelCoefficient({ fuel: "gas-diesel-oil" });
    expect(coef.ncvGjPerT).toBe(43.3);
    expect(coef.co2KgPerTj).toBe(74_800);
    expect(coef.coefGPerTonne).toBe(3_238_840); // 3.23884 t CO2 per t of diesel
  });

  it("prefers measured values and rounds the registered integer up", () => {
    expect(fuelCoefficient({ fuel: "gas-diesel-oil", ncvGjPerT: 42.91, co2KgPerTj: 74_100 }).coefGPerTonne).toBe(
      Math.ceil(42.91 * 74_100),
    );
  });
});

describe("power density rule (PE_HP applicability)", () => {
  const pd = (capacityKw: number, reservoirAreaM2: number, baselineReservoirAreaM2 = 0) =>
    powerDensity({ capacityKw, baselineCapacityKw: 0, reservoirAreaM2, baselineReservoirAreaM2 });

  it("no new or enlarged reservoir: PE_HP = 0", () => {
    expect(pd(500, 0)).toMatchObject({ eligible: true, peHpGPerMwh: 0, wPerM2: null });
    expect(pd(500, 5_000, 5_000)).toMatchObject({ eligible: true, peHpGPerMwh: 0 });
  });

  it("4 < PD ≤ 10 W/m²: EF_Res = 90 kg CO2e/MWh, boundary 10 included", () => {
    expect(pd(12_000, 1_800_000)).toMatchObject({ eligible: true, peHpGPerMwh: RESERVOIR_EF_G_PER_MWH });
    expect(pd(10_000, 1_000_000)).toMatchObject({ eligible: true, peHpGPerMwh: 90_000, wPerM2: 10 });
  });

  it("PD > 10 W/m²: reservoir emissions are neglected", () => {
    expect(pd(12_000, 1_000_000)).toMatchObject({ eligible: true, peHpGPerMwh: 0 });
  });

  it("PD ≤ 4 W/m² is not eligible (4 exactly included), rather than PE_HP = 0", () => {
    expect(pd(12_000, 3_000_000)).toMatchObject({ eligible: false, wPerM2: 4 });
    expect(pd(1_000, 1_000_000)).toMatchObject({ eligible: false });
  });

  it("uses the added capacity and added area for enlarged reservoirs", () => {
    const result = powerDensity({
      capacityKw: 12_000,
      baselineCapacityKw: 8_000,
      reservoirAreaM2: 1_600_000,
      baselineReservoirAreaM2: 1_000_000,
    });
    expect(result.wPerM2).toBeCloseTo(4_000_000 / 600_000, 12);
    expect(result.peHpGPerMwh).toBe(90_000);
  });

  it("rejects a reservoir smaller than the baseline", () => {
    expect(pd(12_000, 1_000, 2_000).eligible).toBe(false);
  });
});

describe("assessProject", () => {
  it("chooses AMS-I.D up to 15 MW and ACM0002 above", () => {
    expect(assessProject(design({ capacityKw: 15_000 })).methodology.id).toBe("AMS-I.D");
    expect(assessProject(design({ capacityKw: 15_001 })).methodology.id).toBe("ACM0002");
    const forced = assessProject(design({ capacityKw: 20_000, methodology: "AMS-I.D" }));
    expect(forced.eligible).toBe(false);
    expect(forced.failures.join()).toMatch(/15 MW/);
  });

  it("retrofit baseline: EG_historical + σ_historical with the sample standard deviation, rounded up", () => {
    const history = [38_200, 41_500, 36_900, 40_100, 39_300]; // mean 39 200, Σ(x − x̄)² = 12.4e6
    const assessment = assessProject(
      design({
        projectType: "retrofit",
        baselineCapacityKw: 8_000,
        historicalGenerationMwh: history,
        baselineRetrofitDate: "2031-06-30T00:00:00Z",
      }),
    );
    const sd = Math.sqrt(12.4e6 / 4);
    expect(assessment.eligible).toBe(true);
    expect(assessment.baseline.historicalMeanMwh).toBeCloseTo(39_200, 9);
    expect(assessment.baseline.historicalSdMwh).toBeCloseTo(sd, 9);
    expect(assessment.registration.baselineWh).toBe(40_960_681_687);
    expect(assessment.registration.baselineEndsAt).toBe(Date.parse("2031-06-30T00:00:00Z") / 1_000);
  });

  it("requires five years of history and DATE_BaselineRetrofit for retrofits", () => {
    const assessment = assessProject(
      design({ projectType: "capacity-addition", baselineCapacityKw: 8_000, historicalGenerationMwh: [1, 2, 3] }),
    );
    expect(assessment.failures).toEqual([
      "EG_historical needs at least five years of annual generation data",
      "DATE_BaselineRetrofit is required for retrofits and additions",
    ]);
  });

  it("leakage: AMS-I.D needs an assessment when equipment is transferred, ACM0002 neglects leakage", () => {
    expect(assessProject(design({ equipmentTransferred: true })).eligible).toBe(false);
    const large = assessProject(design({ capacityKw: 50_000, equipmentTransferred: true }));
    expect(large.eligible).toBe(true);
    expect(large.leakage.basis).toMatch(/ACM0002: no leakage/);
  });

  it("crediting period: 365-day years, fixed 10-year periods are not renewable", () => {
    const assessment = assessProject(design({}));
    expect(assessment.crediting.end - assessment.crediting.start).toBe(7 * CREDITING_YEAR_SECONDS);
    expect(assessProject(design({ crediting: { start: "2026-01-01T00:00:00Z", years: 10, period: 2 } })).eligible).toBe(
      false,
    );
  });

  it("registers the published combined margin rounded down", () => {
    expect(
      assessProject(design({ grid: { source: "published", efTPerMwh: 0.7123456789, reference: "DNA" } })).registration
        .efGridGPerMwh,
    ).toBe(712_345);
  });

  it("the demo plants are eligible and use the TOOL07 weights of their crediting period", () => {
    for (const assessment of DEMO_ASSESSMENTS) expect(assessment.failures).toEqual([]);
    const [first, renewed] = DEMO_ASSESSMENTS;
    expect(first.grid.tool07?.weights).toEqual({ operatingMargin: 0.5, buildMargin: 0.5 });
    expect(renewed.grid.tool07?.weights).toEqual({ operatingMargin: 0.25, buildMargin: 0.75 });
    expect(renewed.powerDensity.peHpGPerMwh).toBe(90_000);
    expect(DEMO_DESIGNS.map(d => d.plantId)).toEqual(["HYDRO-DEMO-01", "HYDRO-DEMO-02"]);
  });
});
