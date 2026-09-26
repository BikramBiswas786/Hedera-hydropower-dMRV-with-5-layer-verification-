import { DEMO_ASSESSMENTS, DEMO_DESIGNS } from "../demo";
import {
  CREDITING_YEAR_SECONDS,
  METHODOLOGY_CODE,
  type ProjectDesign,
  RESERVOIR_EF_G_PER_MWH,
  VMR0017_EMBODIED_HYDRO_G_PER_MWH,
  VMR0017_RESERVOIR_EF_G_PER_MWH,
  assessProject,
  commonPracticeOf,
  powerDensity,
  vcsScopeOf,
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

  it("rejects a measured factor outside the IPCC 95% interval", () => {
    expect(() => fuelCoefficient({ fuel: "gas-diesel-oil", ncvGjPerT: 50 })).toThrow(/outside the IPCC 95% interval/);
    expect(() => fuelCoefficient({ fuel: "gas-diesel-oil", co2KgPerTj: 70_000 })).toThrow(
      /outside the IPCC 95% interval/,
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
  const historical = {
    commissionedAt: "2010-01-01T00:00:00Z",
    referenceStart: "2018-01-01T00:00:00Z",
    noChange: true,
    remainingLifetimeBasis: "TOOL10: equipment remains in service past 2031",
  };

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
        historical,
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
      "ACM0002 ¶8(b): record the existing plant's commissioning date, the historical reference start, a no-change attestation and the TOOL10 basis for DATE_BaselineRetrofit",
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

  it("the demo plants are eligible and use the VT0011 hydro weights of their crediting period", () => {
    for (const assessment of DEMO_ASSESSMENTS) expect(assessment.failures).toEqual([]);
    const [first, renewed] = DEMO_ASSESSMENTS;
    expect(first.grid.tool07?.tool).toBe("VT0011");
    expect(first.grid.tool07?.weights).toEqual({ operatingMargin: 0.4, buildMargin: 0.6 });
    expect(renewed.grid.tool07?.weights).toEqual({ operatingMargin: 0.25, buildMargin: 0.75 });
    expect(renewed.powerDensity.peHpGPerMwh).toBe(VMR0017_RESERVOIR_EF_G_PER_MWH);
    expect(DEMO_DESIGNS.map(d => d.plantId)).toEqual(["HYDRO-DEMO-01", "HYDRO-DEMO-02"]);
    expect(DEMO_ASSESSMENTS.map(a => a.registration.methodology)).toEqual([1, 1]);
  });
});

describe("VMR0017 v1.0 (with ACM0002 v22.0)", () => {
  const evidence: NonNullable<ProjectDesign["additionality"]> = {
    tool: "VT0008",
    regulatorySurplus: true,
    regulatorySurplusBasis: "No law requires this plant",
    investment: {
      analysis: "benchmark",
      irr: "project",
      irrWithoutCreditsPct: 8,
      irrWithCreditsPct: 12,
      benchmarkPct: 11,
      sensitivityConfirms: true,
      decisiveIncrease: true,
      sensitivity: [
        { parameter: "tariff", variationPct: -10, irrPct: 6 },
        { parameter: "tariff", variationPct: 10, irrPct: 9.5 },
      ],
    },
    commonPractice: {
      nAll: 12,
      nDiff: 10,
      basis: "test",
      geographicArea: "host country",
      capacityBandPct: 50,
    },
    assessedBy: "independent assessor",
  };
  const historical = {
    commissionedAt: "2010-01-01T00:00:00Z",
    referenceStart: "2018-01-01T00:00:00Z",
    noChange: true,
    remainingLifetimeBasis: "TOOL10: equipment remains in service past 2031",
  };
  const vmr = (overrides: Partial<ProjectDesign> = {}) =>
    assessProject(
      design({
        methodology: "VMR0017",
        registrationRequest: "2026-01-01T00:00:00Z",
        hostCountry: "UG",
        additionality: evidence,
        grid: {
          source: "published",
          efTPerMwh: 0.6,
          reference: "illustrative factor",
          validFrom: "2020-01-01T00:00:00Z",
          validTo: "2035-01-01T00:00:00Z",
        },
        ...overrides,
      }),
    );

  it("registers under methodology code 1 with EF_Res 100 kg/MWh and embodied leakage", () => {
    const a = vmr({ reservoirAreaM2: 1_800_000 });
    expect(a.failures).toEqual([]);
    expect(a.registration.methodology).toBe(METHODOLOGY_CODE.VMR0017);
    expect(a.powerDensity.peHpGPerMwh).toBe(100_000);
    expect(a.leakage.embodiedGPerMwh).toBe(VMR0017_EMBODIED_HYDRO_G_PER_MWH);
    expect(a.leakage.basis).toMatch(/EG_facility,y × EF_embodied \(21 g CO2e\/kWh/);
  });

  it("keeps the CDM factors for CDM plants", () => {
    const a = assessProject(design({ reservoirAreaM2: 1_800_000 }));
    expect(a.registration.methodology).toBe(METHODOLOGY_CODE.CDM);
    expect(a.powerDensity.peHpGPerMwh).toBe(RESERVOIR_EF_G_PER_MWH);
    expect(a.leakage.embodiedGPerMwh).toBe(0);
  });

  it("limits hydro to 15 MW by the higher of rated and authorized capacity (Table 1)", () => {
    expect(vmr({ capacityKw: 15_000 }).failures).toEqual([]);
    expect(vmr({ capacityKw: 15_001 }).failures.join()).toMatch(/15 MW or less/);
    expect(vmr({ capacityKw: 12_000, authorizedCapacityKw: 16_000 }).failures.join()).toMatch(/15 MW or less/);
  });

  it("accepts Least Developed Countries only, as of the crediting start", () => {
    expect(vmr({ hostCountry: "IN" }).failures.join()).toMatch(/LDC countries only; IN/);
    expect(vmr({ hostCountry: undefined }).failures.join()).toMatch(/host country is required/);
    // Nepal graduates on 24 November 2026.
    expect(vmr({ hostCountry: "NP" }).failures).toEqual([]);
    const afterGraduation = { start: "2026-12-01T00:00:00Z", years: 7 as const, period: 1 as const };
    expect(vmr({ hostCountry: "NP", crediting: afterGraduation }).failures.join()).toMatch(/NP is not an LDC/);
  });

  it("requires complete, consistent VT0008 additionality evidence", () => {
    expect(vmr({ additionality: undefined }).failures.join()).toMatch(/VT0008 additionality evidence/);
    expect(vmr({ additionality: { ...evidence, regulatorySurplus: false } }).failures.join()).toMatch(
      /regulatory surplus/,
    );
    const investment = (changes: Partial<typeof evidence.investment>) => ({
      ...evidence,
      investment: { ...evidence.investment, ...changes },
    });
    expect(vmr({ additionality: investment({ irrWithoutCreditsPct: 11 }) }).failures.join()).toMatch(
      /project IRR without carbon credit revenue \(11%\) must be below the benchmark \(11%\)/,
    );
    expect(vmr({ additionality: investment({ sensitivityConfirms: false }) }).failures.join()).toMatch(
      /sensitivity analysis/,
    );
    expect(vmr({ additionality: investment({ irrWithCreditsPct: 7 }) }).failures.join()).toMatch(
      /cannot be below the IRR without it/,
    );
    const counts = {
      ...evidence,
      commonPractice: { nAll: 3, nDiff: 4, basis: "test", geographicArea: "host country", capacityBandPct: 50 },
    };
    expect(vmr({ additionality: counts }).failures.join()).toMatch(/N_diff cannot exceed N_all/);
  });

  it("VT0008 Step 4b: common practice when F > 20% and N_all − N_diff > 3", () => {
    expect(commonPracticeOf({ nAll: 10, nDiff: 2 })).toEqual({ factor: 0.8, commonPractice: true });
    // F = 60% but only three similar projects without essential distinctions (footnote 17).
    expect(commonPracticeOf({ nAll: 5, nDiff: 2 }).commonPractice).toBe(false);
    // Exactly 20% is not above the threshold.
    expect(commonPracticeOf({ nAll: 20, nDiff: 16 })).toEqual({ factor: 0.2, commonPractice: false });
    expect(commonPracticeOf({ nAll: 0, nDiff: 0 })).toEqual({ factor: 0, commonPractice: false });

    const common = vmr({
      additionality: {
        ...evidence,
        commonPractice: { nAll: 10, nDiff: 2, basis: "test", geographicArea: "host country", capacityBandPct: 50 },
      },
    });
    expect(common.failures.join()).toMatch(/common practice \(F = 80\.0% > 20% and N_all − N_diff = 8 > 3\)/);
    const passing = vmr();
    expect(passing.additionality.commonPracticeFactor).toBeCloseTo(1 / 6);
    expect(passing.additionality.basis).toMatch(/F = 16\.7%, not common practice/);
  });

  it("records whether the CCP investment conditions §5.4.2(2)(b)–(c) are met without failing the plant", () => {
    expect(vmr().additionality.ccpInvestmentConditions).toBe(true);
    const belowBenchmark = vmr({
      additionality: { ...evidence, investment: { ...evidence.investment, irrWithCreditsPct: 10 } },
    });
    expect(belowBenchmark.failures).toEqual([]);
    expect(belowBenchmark.additionality.ccpInvestmentConditions).toBe(false);
    expect(belowBenchmark.additionality.basis).toMatch(/may not be CCP-eligible/);
    const notDecisive = vmr({
      additionality: { ...evidence, investment: { ...evidence.investment, decisiveIncrease: false } },
    });
    expect(notDecisive.additionality.ccpInvestmentConditions).toBe(false);
    expect(assessProject(design({})).additionality.ccpInvestmentConditions).toBeNull();
  });

  it("has no embodied-emission equation for an end-of-life refurbishment", () => {
    const history = {
      projectType: "retrofit" as const,
      baselineCapacityKw: 8_000,
      historicalGenerationMwh: [40_000, 41_000, 39_500, 40_200, 40_800],
      baselineRetrofitDate: "2031-01-01T00:00:00Z",
      historical,
    };
    const bare = vmr(history);
    expect(bare.failures.join()).toMatch(/end-of-life refurbishment/);
    expect(bare.failures.join()).toMatch(/P1, P2 and P3/);

    const wrongOutcome = vmr({
      ...history,
      endOfLifeRefurbishment: true,
      baselineAlternatives: { p1: true, p2: true, p3: true, outcome: "P1" },
    });
    expect(wrongOutcome.failures.join()).toMatch(/continuation of the current situation \(P2\)/);

    const a = vmr({
      ...history,
      endOfLifeRefurbishment: true,
      baselineAlternatives: { p1: true, p2: true, p3: true, outcome: "P2" },
    });
    expect(a.failures).toEqual([]);
    expect(a.leakage.basis).toMatch(/LE_y = 0 for a retrofit/);
  });

  it("requires VT0009 P2 for a VMR0017 capacity addition and bounds its leakage", () => {
    const addition = {
      projectType: "capacity-addition" as const,
      baselineCapacityKw: 8_000,
      historicalGenerationMwh: [40_000, 41_000, 39_500, 40_200, 40_800],
      baselineRetrofitDate: "2031-01-01T00:00:00Z",
      baselineAlternatives: { p1: true, p2: true, p3: true, outcome: "P2" as const },
      historical,
    };
    const a = vmr(addition);
    expect(a.failures).toEqual([]);
    expect(a.leakage.basis).toMatch(/max\(EG_PJ,y, EG_facility,y × Cap_add \/ Cap_PJ\)/);
    expect(vmr({ ...addition, baselineAlternatives: undefined }).failures.join()).toMatch(/P1, P2 and P3/);
  });

  it("uses a 5-year period for a VMR0017 registration request on or after 1 January 2027", () => {
    const seven = vmr({
      registrationRequest: "2027-01-01T00:00:00Z",
      crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 1 },
    });
    expect(seven.eligible).toBe(false);
    expect(seven.failures.join()).toMatch(/5-year crediting period/);

    const five = vmr({
      registrationRequest: "2027-01-01T00:00:00Z",
      crediting: { start: "2027-01-01T00:00:00Z", years: 5, period: 1 },
    });
    expect(five.failures).toEqual([]);
    expect(five.crediting.end - five.crediting.start).toBe(5 * CREDITING_YEAR_SECONDS);
    // A request filed before 2027 can still use the 7-year period.
    expect(vmr().failures).toEqual([]);
  });

  it("rejects a VMR0017 published factor with no validity window, or one that does not cover the crediting start", () => {
    const missing = vmr({ grid: { source: "published", efTPerMwh: 0.6, reference: "ASB0054-2022" } });
    expect(missing.failures.join()).toMatch(/validFrom and validTo/);
    const expired = vmr({
      grid: {
        source: "published",
        efTPerMwh: 0.137,
        reference: "ASB0054-2022",
        validFrom: "2022-08-10T00:00:00Z",
        validTo: "2025-08-09T00:00:00Z",
      },
    });
    expect(expired.failures.join()).toMatch(/validity window/);
  });

  it("requires the VT0008 sensitivity table, geographic area, capacity band and assessor", () => {
    const thin = {
      ...evidence,
      investment: {
        ...evidence.investment,
        sensitivity: [{ parameter: "tariff", variationPct: 5, irrPct: 8.2 }],
      },
    };
    expect(vmr({ additionality: thin }).failures.join()).toMatch(/−10% and \+10%/);
    const crosses = {
      ...evidence,
      investment: {
        ...evidence.investment,
        sensitivity: [
          { parameter: "tariff", variationPct: -10, irrPct: 6 },
          { parameter: "tariff", variationPct: 10, irrPct: 11 },
        ],
      },
    };
    expect(vmr({ additionality: crosses }).failures.join()).toMatch(/how likely that scenario is/);
    const noted = {
      ...crosses,
      investment: { ...crosses.investment, sensitivityProbability: "The VVB judges this tariff unlikely" },
    };
    expect(vmr({ additionality: noted }).failures).toEqual([]);
    const narrow = vmr({
      additionality: {
        ...evidence,
        commonPractice: { ...evidence.commonPractice, capacityBandPct: 20 },
      },
    });
    expect(narrow.failures.join()).toMatch(/at least ±50%/);
  });

  it("rejects a VMR0017 design without a registration request date (the module needs registrationRequestedAt)", () => {
    const missing = vmr({ registrationRequest: undefined });
    expect(missing.eligible).toBe(false);
    expect(missing.failures.join()).toMatch(/registration request date/);
    expect(vmr().registration.registrationRequestedAt).toBe(Date.parse("2026-01-01T00:00:00Z") / 1000);
  });

  it("rejects a renewal whose length differs from the period it renews (RenewalSpan)", () => {
    const renewal = { baselineValidity: "TOOL11 reassessment", regulatorySurplus: "no new law" };
    const mismatch = vmr({
      crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 2 },
      renewal: { ...renewal, previousYears: 5 },
    });
    expect(mismatch.eligible).toBe(false);
    expect(mismatch.failures.join()).toMatch(/keeps the length .*RenewalSpan/);
    const same = vmr({
      crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 2 },
      renewal: { ...renewal, previousYears: 7 },
    });
    expect(same.failures).toEqual([]);
  });

  it("requires a baseline-validity reference when the crediting period is renewed", () => {
    const renewed = { start: "2026-01-01T00:00:00Z", years: 7 as const, period: 2 as const };
    expect(vmr({ crediting: renewed }).failures.join()).toMatch(/baseline-validity reference/);
    const withEvidence = vmr({
      crediting: renewed,
      renewal: { baselineValidity: "TOOL11 reassessment", regulatorySurplus: "no new law" },
    });
    expect(withEvidence.failures).toEqual([]);
  });

  it("rejects a historical window that starts after the plant or after crediting", () => {
    const addition = {
      projectType: "capacity-addition" as const,
      baselineCapacityKw: 8_000,
      historicalGenerationMwh: [40_000, 41_000, 39_500, 40_200, 40_800],
      baselineRetrofitDate: "2031-01-01T00:00:00Z",
      baselineAlternatives: { p1: true, p2: true, p3: true, outcome: "P2" as const },
      historical: {
        commissionedAt: "2020-01-01T00:00:00Z",
        referenceStart: "2018-01-01T00:00:00Z",
        noChange: false,
        remainingLifetimeBasis: "TOOL10",
      },
    };
    const failures = vmr(addition).failures.join();
    expect(failures).toMatch(/no capacity expansion/);
    expect(failures).toMatch(/before the historical reference period/);
  });
});

describe("VCS scope", () => {
  it("is only small-scale hydro in an LDC under VMR0017", () => {
    const start = Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000);
    expect(vcsScopeOf({ capacityKw: 12_000, hostCountry: "UG" }, "VMR0017", start).inScope).toBe(true);
    expect(vcsScopeOf({ capacityKw: 12_000, hostCountry: "IN" }, "AMS-I.D", start).inScope).toBe(false);
    expect(vcsScopeOf({ capacityKw: 50_000, hostCountry: "UG" }, "ACM0002", start).inScope).toBe(false);
    expect(assessProject(design({ capacityKw: 50_000 })).vcs.inScope).toBe(false);
  });
});
