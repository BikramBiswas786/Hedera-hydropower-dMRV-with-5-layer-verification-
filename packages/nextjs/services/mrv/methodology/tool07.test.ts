import { MethodologyError } from "./errors";
import {
  type PowerUnit,
  type Tool07Input,
  calculateGridEmissionFactor,
  combinedMarginWeights,
  unitEmissionFactor,
} from "./tool07";
import { describe, expect, it } from "vitest";

// IPCC 2006 lower bounds used by TOOL07: natural gas 54 300 kg/TJ, other bituminous coal 89 500 kg/TJ and
// NCV 19.9 GJ/t, gas/diesel oil 72 600 kg/TJ and NCV 41.4 GJ/t.
const EF_GAS_50 = (0.0543 * 3.6) / 0.5; // 0.39096 t/MWh
const EF_COAL_36 = (0.0895 * 3.6) / 0.36; // 0.895 t/MWh

const SMALL_GRID_UNITS: PowerUnit[] = [
  { id: "G1", source: "natural-gas", commissioned: 2018, efficiency: 0.5 },
  { id: "C1", source: "other-bituminous-coal", commissioned: 2016, efficiency: 0.36 },
  { id: "H1", source: "hydro", commissioned: 2017 },
];
const sameEveryYear = { G1: { mwh: 100 }, C1: { mwh: 300 }, H1: { mwh: 600 } };

const smallGrid = (overrides: Partial<Tool07Input> = {}): Tool07Input => ({
  system: "test grid",
  units: SMALL_GRID_UNITS,
  years: [2023, 2024, 2025].map(year => ({ year, units: sameEveryYear })),
  lowCostMustRunShare: [0.4, 0.4, 0.4, 0.4, 0.4],
  operatingMargin: "simple",
  projectKind: "hydro",
  creditingPeriod: 1,
  ...overrides,
});

describe("TOOL07 EF_EL,m,y (option A)", () => {
  it("A2: EF_CO2 × 3.6 / η with the IPCC lower bound", () => {
    const factor = unitEmissionFactor(SMALL_GRID_UNITS[1], { mwh: 300 });
    expect(factor.option).toBe("A2");
    expect(factor.efTPerMwh).toBeCloseTo(EF_COAL_36, 12);
  });

  it("A1: Σ FC × NCV × EF_CO2 / EG with lower bounds", () => {
    const factor = unitEmissionFactor(
      { id: "D", source: "gas-diesel-oil", commissioned: 2015 },
      { mwh: 4_000, fuelT: 1_000 },
    );
    expect(factor.option).toBe("A1");
    expect(factor.efTPerMwh).toBeCloseTo((1_000 * 41.4 * 0.0726) / 4_000, 12); // 0.75141
  });

  it("low-cost/must-run units have zero marginal emissions", () => {
    expect(unitEmissionFactor(SMALL_GRID_UNITS[2], { mwh: 600 }).efTPerMwh).toBe(0);
  });

  it("refuses a fossil unit without fuel or efficiency data", () => {
    expect(() => unitEmissionFactor({ id: "X", source: "lignite", commissioned: 2000 }, { mwh: 10 })).toThrow(
      MethodologyError,
    );
  });
});

describe("TOOL07 operating margin", () => {
  it("simple OM: generation-weighted over fossil units only", () => {
    const result = calculateGridEmissionFactor(smallGrid());
    expect(result.operatingMargin.efTPerMwh).toBeCloseTo((100 * EF_GAS_50 + 300 * EF_COAL_36) / 400, 12);
  });

  it("forbids the simple OM when LCMR sources supply 50% or more", () => {
    expect(() => calculateGridEmissionFactor(smallGrid({ lowCostMustRunShare: [0.6, 0.6, 0.6, 0.6, 0.6] }))).toThrow(
      /Simple OM is only allowed/,
    );
  });

  it("average OM: all units, LCMR included", () => {
    const result = calculateGridEmissionFactor(
      smallGrid({ operatingMargin: "average", lowCostMustRunShare: [0.6, 0.6, 0.6, 0.6, 0.6] }),
    );
    expect(result.operatingMargin.efTPerMwh).toBeCloseTo((100 * EF_GAS_50 + 300 * EF_COAL_36) / 1_000, 12);
  });

  it("simple adjusted OM: (1 − λ) × EF_non-LCMR + λ × EF_LCMR", () => {
    const result = calculateGridEmissionFactor(
      smallGrid({
        operatingMargin: "simple-adjusted",
        years: [2023, 2024, 2025].map(year => ({ year, units: sameEveryYear, lambda: 0.25 })),
      }),
    );
    expect(result.operatingMargin.efTPerMwh).toBeCloseTo(0.75 * ((100 * EF_GAS_50 + 300 * EF_COAL_36) / 400), 12);
  });

  it("needs λ for the simple adjusted OM, three years and five LCMR shares", () => {
    expect(() => calculateGridEmissionFactor(smallGrid({ operatingMargin: "simple-adjusted" }))).toThrow(/λ/);
    expect(() => calculateGridEmissionFactor(smallGrid({ years: smallGrid().years.slice(1) }))).toThrow(/three/);
    expect(() => calculateGridEmissionFactor(smallGrid({ lowCostMustRunShare: [0.4] }))).toThrow(/five/);
  });
});

describe("TOOL07 build margin sample group (step 5)", () => {
  // AEG_total (non-CDM) = 2 000 MWh, so the 20% target is 400 MWh.
  const units: PowerUnit[] = [
    { id: "N1", source: "solar", commissioned: 2024 },
    { id: "N2", source: "natural-gas", commissioned: 2020, efficiency: 0.5 },
    { id: "N3", source: "other-bituminous-coal", commissioned: 2010, efficiency: 0.36 },
    { id: "N4", source: "other-bituminous-coal", commissioned: 2005, efficiency: 0.36 },
    { id: "N5", source: "hydro", commissioned: 2000 },
    { id: "CDM1", source: "wind", commissioned: 2019, cdm: true },
    { id: "CDM2", source: "solar", commissioned: 2016, cdm: true },
  ];
  const grid = (cdm1Mwh: number) =>
    smallGrid({
      units,
      years: [2023, 2024, 2025].map(year => ({
        year,
        units: {
          N1: { mwh: 50 },
          N2: { mwh: 100 },
          N3: { mwh: 400 },
          N4: { mwh: 450 },
          N5: { mwh: 1_000 },
          CDM1: { mwh: cdm1Mwh },
          CDM2: { mwh: 30 },
        },
      })),
    });

  it("(c) picks the larger of SET_5-units and SET_≥20%", () => {
    const { buildMargin } = calculateGridEmissionFactor(grid(150));
    expect(buildMargin.totalMwh).toBe(2_000);
    expect(buildMargin.set5Mwh).toBe(2_000); // all five non-CDM units
    expect(buildMargin.set20Mwh).toBe(550); // N1 + N2 + N3, the unit crossing 20% fully included
  });

  it("(d) drops units older than 10 years and adds CDM units, most recent first, up to 20%", () => {
    const { buildMargin } = calculateGridEmissionFactor(grid(300));
    expect(buildMargin.step).toBe("5(d) SET_sample-CDM");
    expect(buildMargin.sample.map(u => u.id)).toEqual(["N1", "N2", "CDM1"]);
    expect(buildMargin.efTPerMwh).toBeCloseTo((100 * EF_GAS_50) / 450, 12);
  });

  it("(e)–(f) falls back to older units when young and CDM units stay below 20%", () => {
    const { buildMargin } = calculateGridEmissionFactor(grid(150));
    expect(buildMargin.step).toBe("5(f) SET_sample-CDM->10yrs");
    expect(buildMargin.sample.map(u => u.id)).toEqual(["N1", "N2", "CDM1", "CDM2", "N3"]);
    expect(buildMargin.efTPerMwh).toBeCloseTo((100 * EF_GAS_50 + 400 * EF_COAL_36) / 730, 12);
  });

  it("uses SET_sample directly when no unit in it is older than 10 years", () => {
    const { buildMargin } = calculateGridEmissionFactor(smallGrid());
    expect(buildMargin.step).toBe("5(c) SET_sample");
    expect(buildMargin.sample.map(u => u.id)).toEqual(["G1", "H1", "C1"]);
  });
});

describe("TOOL07 combined margin", () => {
  it("weights OM and BM by technology and crediting period", () => {
    expect(combinedMarginWeights("hydro", 1)).toEqual({ operatingMargin: 0.5, buildMargin: 0.5 });
    expect(combinedMarginWeights("hydro", 2)).toEqual({ operatingMargin: 0.25, buildMargin: 0.75 });
    expect(combinedMarginWeights("hydro", 3)).toEqual({ operatingMargin: 0.25, buildMargin: 0.75 });
    expect(combinedMarginWeights("wind-solar", 2)).toEqual({ operatingMargin: 0.75, buildMargin: 0.25 });
  });

  it("CM = w_OM × OM + w_BM × BM, registered rounded down to whole g/MWh", () => {
    const result = calculateGridEmissionFactor(smallGrid());
    const expected = 0.5 * result.operatingMargin.efTPerMwh + 0.5 * result.buildMargin.efTPerMwh;
    expect(result.combinedMargin.efTPerMwh).toBeCloseTo(expected, 12);
    expect(result.combinedMargin.efGPerMwh).toBe(Math.floor(expected * 1e6));
  });
});
