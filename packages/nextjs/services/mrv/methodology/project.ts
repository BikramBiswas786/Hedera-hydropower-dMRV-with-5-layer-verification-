import { MethodologyError } from "./errors";
import { isLeastDevelopedCountry } from "./ldc";
import { type FuelCoefficient, type OnSiteFuel, fuelCoefficient } from "./tool03";
import { type Tool07Input, type Tool07Result, calculateGridEmissionFactor } from "./tool07";

/**
 * Project-level (ex-ante) part of the methodology for hydropower: applicability, the reservoir power-density rule,
 * the baseline scenario for greenfield, retrofit and capacity-addition plants, the grid emission factor, the fuel
 * coefficient for project emissions (TOOL03), leakage and the crediting period. The result is what a VVB validates
 * and what `registerPlant` stores on-chain.
 *
 * Two methodology versions are supported and registered per plant:
 *   - CDM: ACM0002 v22.0 (large scale) or AMS-I.D v18.0 (up to 15 MW), as issued under the CDM.
 *   - VMR0017 v1.0 (Verra, 23 April 2026), which "must be used with ACM0002, v22.0" and changes, for hydro: the
 *     applicability (15 MW or less, LDC host countries only, Table 1), additionality (VT0008), EF_Res (100 instead of
 *     90 kg CO2e/MWh, §9.1), leakage (embodied emissions, §8.3) and the grid emission factor tool (VT0011).
 */

export const METHODOLOGIES = {
  ACM0002: {
    id: "ACM0002",
    version: "22.0",
    title: "Grid-connected electricity generation from renewable sources",
  },
  "AMS-I.D": { id: "AMS-I.D", version: "18.0", title: "Grid connected renewable electricity generation" },
  VMR0017: {
    id: "VMR0017",
    version: "1.0",
    title: "Grid-connected electricity generation from renewable sources (ACM0002 revision), with ACM0002 v22.0",
  },
} as const;
export type MethodologyId = keyof typeof METHODOLOGIES;

/** `HydroCreditRegistry.Methodology`: which rule set the contract applies to a plant. */
export const METHODOLOGY_CODE = { CDM: 0, VMR0017: 1 } as const;
export type MethodologyCode = (typeof METHODOLOGY_CODE)[keyof typeof METHODOLOGY_CODE];
export const methodologyCodeOf = (id: MethodologyId): MethodologyCode =>
  id === "VMR0017" ? METHODOLOGY_CODE.VMR0017 : METHODOLOGY_CODE.CDM;

/** AMS-I.D (small scale) applies up to 15 MW of installed capacity; VMR0017 limits hydro to the same. */
export const SMALL_SCALE_LIMIT_KW = 15_000;
export const VMR0017_MAX_HYDRO_KW = 15_000;
/** Power density thresholds (W/m²) for new or enlarged reservoirs. */
export const MIN_POWER_DENSITY = 4;
export const RESERVOIR_EMISSIONS_POWER_DENSITY = 10;
/** EF_Res, the default emission factor for reservoir emissions: 90 kg CO2e/MWh under ACM0002 / AMS-I.D. */
export const RESERVOIR_EF_G_PER_MWH = 90_000;
/** VMR0017 §9.1: EF_Res = 100 kg CO2e/MWh (Hydropower Sustainability Standard and Guidelines). */
export const VMR0017_RESERVOIR_EF_G_PER_MWH = 100_000;
/** VMR0017 §9.1: EF_embodied for hydropower, 21 g CO2e/kWh (NREL 2021) = 21 000 g CO2e/MWh. */
export const VMR0017_EMBODIED_HYDRO_G_PER_MWH = 21_000;

/** Label for a registered plant: VMR0017 plants apply ACM0002 v22.0 at any size; CDM plants split at 15 MW. */
export function registeredMethodologyLabel(design: { methodology: number; capacityKw: number }): string {
  if (design.methodology === METHODOLOGY_CODE.VMR0017) return "VMR0017 v1.0 + ACM0002 v22.0";
  const m = design.capacityKw > SMALL_SCALE_LIMIT_KW ? METHODOLOGIES.ACM0002 : METHODOLOGIES["AMS-I.D"];
  return `${m.id} v${m.version}`;
}

export const reservoirEfGPerMwh = (code: number) =>
  code === METHODOLOGY_CODE.VMR0017 ? VMR0017_RESERVOIR_EF_G_PER_MWH : RESERVOIR_EF_G_PER_MWH;
export const embodiedEfGPerMwh = (code: number) =>
  code === METHODOLOGY_CODE.VMR0017 ? VMR0017_EMBODIED_HYDRO_G_PER_MWH : 0;
/** Sanity ceiling the contract enforces: 2 t CO2/MWh is above any real grid's combined margin. */
export const MAX_GRID_EF_G_PER_MWH = 2_000_000;
/** Crediting-period years are 365-day blocks, here and in the contract. */
export const CREDITING_YEAR_SECONDS = 365 * 24 * 3_600;
/** VCS Standard v5.0 Table 8: registration requests from this instant use a 5-year E&I crediting period. */
export const VCS_FIVE_YEAR_FROM = Math.floor(Date.parse("2027-01-01T00:00:00Z") / 1000);

export const PROJECT_TYPES = ["greenfield", "retrofit", "capacity-addition"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
/** Enum order of `HydroCreditRegistry.ProjectType`. */
export const PROJECT_TYPE_CODE: Record<ProjectType, number> = { greenfield: 0, retrofit: 1, "capacity-addition": 2 };

export type GridEmissionFactorSource =
  | { source: "tool07"; input: Omit<Tool07Input, "projectKind" | "creditingPeriod"> }
  /** A combined margin published by a Designated National Authority or the UNFCCC, cited by reference. */
  | { source: "published"; efTPerMwh: number; reference: string; validFrom?: string; validTo?: string };

export type Hydraulics = {
  /** Design (turbine) flow and gross head: sensor readings above them are implausible. */
  maxFlowM3s: number;
  maxHeadM: number;
  /** Water-to-wire efficiency envelope from the turbine and generator datasheets. */
  minEfficiency: number;
  maxEfficiency: number;
};

/**
 * VT0008 v1.0 additionality evidence as validated by the VVB (VMR0017 §7): regulatory surplus, Step 3 investment
 * analysis and Step 4 common practice. Barrier analysis is not applicable under VMR0017. The engine applies
 * VT0008's decision rules to the recorded figures; producing and validating those figures is the VVB's job.
 */
export type AdditionalityEvidence = {
  tool: "VT0008";
  regulatorySurplus: boolean;
  /** Which laws were checked. Required with `regulatorySurplus` under VT0008 Step 1. */
  regulatorySurplusBasis: string;
  /**
   * Step 3, benchmark analysis (§5.4.2), which must use the project or equity IRR. (a) The IRR without carbon credit
   * revenue is below the benchmark, confirmed by the sensitivity analysis; for Core Carbon Principles labels also
   * (b) credit revenue raises economic performance decisively and (c) lifts the IRR to or above the benchmark.
   */
  investment: {
    analysis: "benchmark";
    irr: "project" | "equity";
    irrWithoutCreditsPct: number;
    irrWithCreditsPct: number;
    benchmarkPct: number;
    sensitivityConfirms: boolean;
    decisiveIncrease: boolean;
    /**
     * VT0008 ¶23–24. Variables above 20% of cost or revenue, each varied by at least ±10% when no market study
     * sets a tighter range. `irrPct` is the indicator at that variation.
     */
    sensitivity: { parameter: string; variationPct: number; irrPct: number }[];
    /** VT0008 ¶25. Required when any variation reaches the benchmark. */
    sensitivityProbability?: string;
  };
  /**
   * Step 4b (renewable power is a technology switch, §5.5.1): N_all similar projects in the applicable geographic
   * area not under the VCS Program, N_diff of them with essential distinctions. Common practice when
   * F = 1 − N_diff / N_all > 20 % and N_all − N_diff > 3.
   */
  commonPractice: {
    nAll: number;
    nDiff: number;
    basis: string;
    /** Applicable geographic area the counts were taken from (VT0008 Step 4). */
    geographicArea: string;
    /**
     * Similar projects are those inside this ± capacity band. At least 50, the default in the CDM common-practice
     * guidance, unless a published study uses a wider net.
     */
    capacityBandPct: number;
  };
  /** Validation/verification body and the report the evidence comes from. */
  assessedBy?: string;
  reportUri?: string;
};

export type ProjectDesign = {
  plantId: string;
  name: string;
  /** CDM defaults to AMS-I.D up to 15 MW and ACM0002 above; VMR0017 applies ACM0002 v22.0 with Verra's changes. */
  methodology?: MethodologyId;
  /** ISO 3166-1 alpha-2 host country. VMR0017 limits hydro to Least Developed Countries. */
  hostCountry?: string;
  /** Capacity in the activity approval, when it differs from the rated capacity (VMR0017 Table 1 uses the higher). */
  authorizedCapacityKw?: number;
  /** VT0008 evidence; required under VMR0017. */
  additionality?: AdditionalityEvidence;
  projectType: ProjectType;
  /** Cap_PJ and Cap_BL: installed capacity after and before the project (kW; 0 before a greenfield plant). */
  capacityKw: number;
  baselineCapacityKw: number;
  /** A_PJ and A_BL: full-reservoir water surface after and before the project (m²; 0 for run-of-river). */
  reservoirAreaM2: number;
  baselineReservoirAreaM2: number;
  /** Retrofit / capacity addition: annual net generation of the existing plant, at least the 5 latest years. */
  historicalGenerationMwh?: number[];
  /** Same series with calendar years, when the monitoring report names them. Must match `historicalGenerationMwh`. */
  historicalYears?: { year: number; mwh: number }[];
  /** Retrofit / capacity addition: DATE_BaselineRetrofit, when the existing equipment would have been replaced. */
  baselineRetrofitDate?: string;
  /**
   * ACM0002 ¶8(b) for a retrofit or capacity addition: the existing plant was already operating before a historical
   * reference period of at least five years, and nothing was expanded or refurbished in between.
   */
  historical?: {
    /** Commercial operation of the existing plant. Must precede `referenceStart`. */
    commissionedAt: string;
    /** Start of the minimum historical reference period. */
    referenceStart: string;
    /** No capacity expansion, retrofit or rehabilitation between `referenceStart` and this project. */
    noChange: boolean;
    /** TOOL10 (remaining lifetime of equipment), or the study that fixes DATE_BaselineRetrofit. */
    remainingLifetimeBasis: string;
  };
  /** Generating equipment moved here from another activity (AMS-I.D then requires a leakage assessment). */
  equipmentTransferred: boolean;
  /**
   * VMR0017 retrofits. VT0010 excludes efficiency upgrades. Set this only for an end-of-life refurbishment,
   * which VT0010 §4(5) still covers.
   */
  endOfLifeRefurbishment?: boolean;
  /** VT0009 Step 1 alternatives. Required for a VMR0017 retrofit or capacity addition. ACM0002 needs outcome P2. */
  baselineAlternatives?: { p1: boolean; p2: boolean; p3: boolean; outcome: "P1" | "P2" | "P3" };
  /** Fossil fuel burnt on site (back-up generators, black start); null when none is used. */
  onSiteFuel: OnSiteFuel | null;
  crediting: { start: string; years: 5 | 7 | 10; period: 1 | 2 | 3 };
  /**
   * Second or third crediting period. ACM0002 §5.8 and the CDM baseline-validity tool: the original baseline is
   * reassessed, and regulatory surplus is checked again.
   */
  renewal?: {
    baselineValidity: string;
    regulatorySurplus: string;
    /** Length of the period being renewed. A renewal keeps the same length (`HydroVmr0017Module.RenewalSpan`). */
    previousYears?: 5 | 7 | 10;
  };
  /**
   * When the registration request is filed; VCS Table 8 keys off this date. Required for VMR0017 (the module
   * rejects `registrationRequestedAt = 0`); defaults to the crediting start for the CDM methodologies. Stored
   * on-chain as `registrationRequestedAt`, so it is not part of `designHash`.
   */
  registrationRequest?: string;
  grid: GridEmissionFactorSource;
  hydraulics: Hydraulics;
};

/** Integers stored by `HydroCreditRegistry.registerPlant`; the contract derives PE_HP and LE rates itself. */
export type RegisteredDesign = {
  projectType: number;
  /** `METHODOLOGY_CODE`: 0 = CDM (ACM0002 / AMS-I.D), 1 = VMR0017 v1.0. */
  methodology: number;
  capacityKw: number;
  baselineCapacityKw: number;
  reservoirAreaM2: number;
  baselineReservoirAreaM2: number;
  efGridGPerMwh: number;
  fuelCoefGPerTonne: number;
  baselineWh: number;
  baselineEndsAt: number;
  creditingStart: number;
  creditingEnd: number;
  /** DmrvRegistry only (unix seconds); absent on the legacy registry. */
  registrationRequestedAt?: number;
};

export type PowerDensity = {
  /** PD = (Cap_PJ − Cap_BL) / (A_PJ − A_BL) in W/m²; null when no reservoir area is added. */
  wPerM2: number | null;
  /** PE_HP rate: EF_Res when 4 < PD ≤ 10, otherwise 0 (g CO2e per MWh of TEG). */
  peHpGPerMwh: number;
  basis: string;
};

export type ProjectAssessment = {
  plantId: string;
  name: string;
  eligible: boolean;
  /** Applicability conditions that are not met. Empty when eligible. */
  failures: string[];
  methodology: (typeof METHODOLOGIES)[MethodologyId] & { scale: "large" | "small" };
  powerDensity: PowerDensity;
  grid: {
    source: "tool07" | "published";
    efTPerMwh: number;
    efGPerMwh: number;
    reference: string;
    tool07?: Tool07Result;
  };
  baseline: {
    projectType: ProjectType;
    equation: string;
    historicalMeanMwh?: number;
    historicalSdMwh?: number;
    /** EG_historical + σ_historical (Wh per crediting year), rounded up; 0 for greenfield. */
    baselineWh: number;
    endsAt: number;
  };
  projectEmissions: { fuel: FuelCoefficient | null; reservoir: string; gridUse: string };
  /** VCS Program scope for grid-connected hydro. Separate from `eligible`, which is the methodology. */
  vcs: { inScope: boolean; basis: string };
  leakage: { basis: string; embodiedGPerMwh: number };
  additionality: {
    basis: string;
    evidence: AdditionalityEvidence | null;
    /** VT0008 §5.5.2 factor F; null without evidence. */
    commonPracticeFactor: number | null;
    /** VT0008 §5.4.2(2)(b) and (c) hold, which VMR0017 §7 requires projects to record (CCP label eligibility). */
    ccpInvestmentConditions: boolean | null;
  };
  crediting: { start: number; end: number; years: number; period: number };
  registration: RegisteredDesign;
};

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
/** Sample standard deviation (n − 1): the larger, conservative estimate from a short record. */
const sampleSd = (values: number[]) => {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
};
const toUnix = (iso: string) => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new MethodologyError(`Invalid date: ${iso}`);
  return Math.floor(ms / 1_000);
};

/**
 * PE_HP applicability, mirrored bit for bit by the contract with integers:
 * no added area → 0; PD ≤ 4 → not eligible; 4 < PD ≤ 10 → EF_Res; PD > 10 → 0.
 * `efRes` is the methodology's EF_Res (90 kg/MWh under the CDM, 100 under VMR0017).
 */
export function powerDensity(
  design: Pick<ProjectDesign, "capacityKw" | "baselineCapacityKw" | "reservoirAreaM2" | "baselineReservoirAreaM2">,
  efRes: number = RESERVOIR_EF_G_PER_MWH,
): PowerDensity & { eligible: boolean } {
  const addedArea = design.reservoirAreaM2 - design.baselineReservoirAreaM2;
  const addedW = (design.capacityKw - design.baselineCapacityKw) * 1_000;
  if (addedArea < 0) {
    return { wPerM2: null, peHpGPerMwh: 0, eligible: false, basis: "Reservoir area below the baseline area" };
  }
  if (addedArea === 0) {
    return {
      wPerM2: null,
      peHpGPerMwh: 0,
      eligible: true,
      basis: "No new or enlarged reservoir (A_PJ = A_BL): PE_HP,y = 0",
    };
  }
  const wPerM2 = addedW / addedArea;
  if (addedW <= MIN_POWER_DENSITY * addedArea) {
    return {
      wPerM2,
      peHpGPerMwh: 0,
      eligible: false,
      basis: `PD = ${wPerM2.toFixed(2)} W/m² ≤ ${MIN_POWER_DENSITY}: the methodology does not apply`,
    };
  }
  if (addedW <= RESERVOIR_EMISSIONS_POWER_DENSITY * addedArea) {
    return {
      wPerM2,
      peHpGPerMwh: efRes,
      eligible: true,
      basis: `${MIN_POWER_DENSITY} < PD = ${wPerM2.toFixed(2)} W/m² ≤ ${RESERVOIR_EMISSIONS_POWER_DENSITY}: PE_HP,y = EF_Res (${efRes / 1_000} kg/MWh) × TEG_y`,
    };
  }
  return {
    wPerM2,
    peHpGPerMwh: 0,
    eligible: true,
    basis: `PD = ${wPerM2.toFixed(2)} W/m² > ${RESERVOIR_EMISSIONS_POWER_DENSITY}: PE_HP,y = 0`,
  };
}

/** VT0008 §5.5.2: F = 1 − N_diff / N_all; common practice when F > 20 % and N_all − N_diff > 3. */
export function commonPracticeOf({ nAll, nDiff }: { nAll: number; nDiff: number }) {
  const similar = nAll - nDiff;
  // F > 20% ⇔ 5·(N_all − N_diff) > N_all, compared in integers so F = 20% exactly never tips over in floating point.
  return { factor: nAll === 0 ? 0 : similar / nAll, commonPractice: 5 * similar > nAll && similar > 3 };
}

/** VMR0017 §7: regulatory surplus, VT0008 Step 3 and Step 4 must all support additionality. */
function additionalityOf(
  design: ProjectDesign,
  vmr0017: boolean,
  failures: string[],
): ProjectAssessment["additionality"] {
  const evidence = design.additionality ?? null;
  const none = { commonPracticeFactor: null, ccpInvestmentConditions: null };
  if (!vmr0017) {
    return {
      basis: "CDM: additionality per TOOL01/TOOL02 is part of validation and is not recorded here",
      evidence,
      ...none,
    };
  }
  if (!evidence) {
    failures.push(
      "VMR0017 §7: VT0008 additionality evidence (regulatory surplus, investment analysis, common practice) is required",
    );
    return { basis: "VT0008 evidence missing", evidence: null, ...none };
  }
  const { investment } = evidence;
  if (!evidence.regulatorySurplus) failures.push("VT0008: the project must demonstrate regulatory surplus");
  if (evidence.regulatorySurplus && evidence.regulatorySurplusBasis.trim().length < 8) {
    failures.push("VT0008 Step 1: name the laws checked for regulatory surplus");
  }
  if (investment.irrWithoutCreditsPct >= investment.benchmarkPct) {
    failures.push(
      `VT0008 §5.4.2(2)(a): the ${investment.irr} IRR without carbon credit revenue (${investment.irrWithoutCreditsPct}%) must be below the benchmark (${investment.benchmarkPct}%)`,
    );
  }
  if (!investment.sensitivityConfirms) {
    failures.push("VT0008 §5.4.2(3): the sensitivity analysis must confirm the result under reasonable variations");
  }
  const sensitivity = investment.sensitivity ?? [];
  const coversTen = sensitivity.some(row => row.variationPct <= -10) && sensitivity.some(row => row.variationPct >= 10);
  if (!coversTen) {
    failures.push(
      "VT0008 ¶24: the sensitivity table must vary a critical variable by at least −10% and +10% when no market study sets the range",
    );
  }
  const crossesBenchmark = sensitivity.some(row => row.irrPct >= investment.benchmarkPct);
  if (crossesBenchmark && !investment.sensitivityProbability?.trim()) {
    failures.push("VT0008 ¶25: a variation reaches the benchmark, so the VVB must assess how likely that scenario is");
  }
  if (investment.irrWithCreditsPct < investment.irrWithoutCreditsPct) {
    failures.push("VT0008: the IRR with carbon credit revenue cannot be below the IRR without it");
  }
  if (evidence.commonPractice.nDiff > evidence.commonPractice.nAll) {
    failures.push("VT0008 §5.5.2: N_diff cannot exceed N_all");
  }
  if (!evidence.commonPractice.geographicArea.trim()) {
    failures.push("VT0008 Step 4: the applicable geographic area is required");
  }
  if (evidence.commonPractice.capacityBandPct < 50) {
    failures.push("VT0008 Step 4: the capacity band used to select similar projects must be at least ±50%");
  }
  if (!evidence.assessedBy?.trim()) {
    failures.push("VT0008: name the independent assessor who checked the additionality evidence");
  }
  const { factor, commonPractice } = commonPracticeOf(evidence.commonPractice);
  if (commonPractice) {
    failures.push(
      `VT0008 §5.5.2: common practice (F = ${(factor * 100).toFixed(1)}% > 20% and N_all − N_diff = ${evidence.commonPractice.nAll - evidence.commonPractice.nDiff} > 3)`,
    );
  }
  const ccp = investment.decisiveIncrease && investment.irrWithCreditsPct >= investment.benchmarkPct;
  return {
    basis:
      `VT0008: regulatory surplus; ${investment.irr} IRR ${investment.irrWithoutCreditsPct}% without and ${investment.irrWithCreditsPct}% with carbon revenue against a ${investment.benchmarkPct}% benchmark; ` +
      `F = ${(factor * 100).toFixed(1)}%, ${commonPractice ? "common practice" : "not common practice"}` +
      (ccp
        ? "; §5.4.2(2)(b)–(c) met (CCP-eligible)"
        : "; §5.4.2(2)(b)–(c) not met: additional, but may not be CCP-eligible") +
      (evidence.assessedBy ? `; assessor: ${evidence.assessedBy}` : ""),
    evidence,
    commonPracticeFactor: factor,
    ccpInvestmentConditions: ccp,
  };
}

function gridFactor(
  design: ProjectDesign,
  creditingStart: number,
  vmr0017: boolean,
  failures: string[],
): ProjectAssessment["grid"] {
  if (design.grid.source === "published") {
    const { efTPerMwh, reference, validFrom, validTo } = design.grid;
    if (vmr0017 && (!validFrom || !validTo)) {
      failures.push(
        "A published grid factor on the VMR0017 path needs validFrom and validTo. VT0011 replaces a CDM standardized baseline such as ASB0054",
      );
    } else if (validFrom && validTo) {
      const from = toUnix(validFrom);
      const to = toUnix(validTo);
      if (creditingStart < from || creditingStart >= to) {
        failures.push("The crediting start is outside the published grid factor's validity window");
      }
    }
    return {
      source: "published",
      efTPerMwh,
      efGPerMwh: Math.floor(Number((efTPerMwh * 1e6).toFixed(6))),
      reference,
    };
  }
  const vt0011 = design.methodology === "VMR0017";
  const tool07 = calculateGridEmissionFactor({
    ...design.grid.input,
    projectKind: "hydro",
    creditingPeriod: design.crediting.period,
    tool: vt0011 ? "VT0011" : "TOOL07",
  });
  return {
    source: "tool07",
    efTPerMwh: tool07.combinedMargin.efTPerMwh,
    efGPerMwh: tool07.combinedMargin.efGPerMwh,
    reference: vt0011
      ? `VT0011 v1.0 (with TOOL07 v7.0) ex-ante combined margin for ${tool07.system}`
      : `TOOL07 ex-ante combined margin for ${tool07.system}`,
    tool07,
  };
}

function baselineOf(design: ProjectDesign, failures: string[]): ProjectAssessment["baseline"] {
  if (design.projectType === "greenfield") {
    if (design.baselineCapacityKw !== 0) failures.push("A greenfield plant has no existing capacity (Cap_BL = 0)");
    return { projectType: "greenfield", equation: "EG_PJ,y = EG_facility,y", baselineWh: 0, endsAt: 0 };
  }

  let history = design.historicalGenerationMwh ?? [];
  if (design.historicalYears?.length) {
    const fromYears = design.historicalYears.map(row => row.mwh);
    const mismatches =
      history.length > 0 &&
      (history.length !== fromYears.length || history.some((mwh, index) => mwh !== fromYears[index]));
    if (mismatches) {
      failures.push("historicalYears must list the same MWh figures, in the same order, as historicalGenerationMwh");
    }
    if (history.length === 0) history = fromYears;
  }
  if (design.baselineCapacityKw <= 0) failures.push(`A ${design.projectType} needs the existing capacity Cap_BL`);
  if (design.projectType === "capacity-addition" && design.capacityKw <= design.baselineCapacityKw) {
    failures.push("A capacity addition must increase installed capacity");
  }
  if (history.length < 5) failures.push("EG_historical needs at least five years of annual generation data");
  if (!design.baselineRetrofitDate) failures.push("DATE_BaselineRetrofit is required for retrofits and additions");
  const window = design.historical;
  if (!window) {
    failures.push(
      "ACM0002 ¶8(b): record the existing plant's commissioning date, the historical reference start, a no-change attestation and the TOOL10 basis for DATE_BaselineRetrofit",
    );
  } else {
    if (!window.noChange) {
      failures.push(
        "ACM0002 ¶8(b): no capacity expansion, retrofit or rehabilitation between the historical reference start and the project",
      );
    }
    if (!window.remainingLifetimeBasis.trim()) {
      failures.push("DATE_BaselineRetrofit needs a TOOL10 remaining-lifetime basis");
    }
    const commissioned = toUnix(window.commissionedAt);
    const reference = toUnix(window.referenceStart);
    if (commissioned > reference) {
      failures.push("The existing plant must have started commercial operation before the historical reference period");
    }
    if (reference >= toUnix(design.crediting.start)) {
      failures.push("The historical reference period must start before the crediting period");
    }
  }

  const historicalMeanMwh = history.length ? mean(history) : 0;
  const historicalSdMwh = history.length > 1 ? sampleSd(history) : 0;
  return {
    projectType: design.projectType,
    equation: "EG_PJ,y = EG_facility,y − (EG_historical + σ_historical) until DATE_BaselineRetrofit, then EG_PJ,y = 0",
    historicalMeanMwh,
    historicalSdMwh,
    baselineWh: Math.ceil(Number(((historicalMeanMwh + historicalSdMwh) * 1e6).toFixed(3))),
    endsAt: design.baselineRetrofitDate ? toUnix(design.baselineRetrofitDate) : 0,
  };
}

/** Grid hydro is in the VCS scope note only at 15 MW or less in a UN LDC. CDM paths are not that scope. */
export function vcsScopeOf(
  design: Pick<ProjectDesign, "capacityKw" | "authorizedCapacityKw" | "hostCountry">,
  methodologyId: MethodologyId,
  creditingStart: number,
): { inScope: boolean; basis: string } {
  if (methodologyId !== "VMR0017") {
    return {
      inScope: false,
      basis:
        "Not VCS-eligible. The scope note excludes grid-connected hydro except a plant of 15 MW or less in a UN LDC, which this template registers under VMR0017. ACM0002 and AMS-I.D stay for CDM comparison.",
    };
  }
  const capacityKw = Math.max(design.capacityKw, design.authorizedCapacityKw ?? 0);
  if (capacityKw > VMR0017_MAX_HYDRO_KW) {
    return { inScope: false, basis: "Not VCS-eligible: large-scale grid hydro is excluded." };
  }
  if (!design.hostCountry || !isLeastDevelopedCountry(design.hostCountry, creditingStart)) {
    return {
      inScope: false,
      basis:
        "Not VCS-eligible: the host must be a UN Least Developed Country at the crediting start. The contract does not store the country. It is inside the design document whose hash is registered.",
    };
  }
  return {
    inScope: true,
    basis: `VCS scope: ${design.hostCountry}, ${capacityKw / 1_000} MW or less, under VMR0017. The host country is in the design hash, not its own contract field.`,
  };
}

export function assessProject(design: ProjectDesign): ProjectAssessment {
  const failures: string[] = [];
  const integers = {
    capacityKw: design.capacityKw,
    baselineCapacityKw: design.baselineCapacityKw,
    reservoirAreaM2: design.reservoirAreaM2,
    baselineReservoirAreaM2: design.baselineReservoirAreaM2,
  };
  for (const [key, value] of Object.entries(integers)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new MethodologyError(`${key} must be a whole number ≥ 0`);
  }
  if (design.capacityKw === 0) throw new MethodologyError("capacityKw must be positive");

  const methodologyId =
    design.methodology ?? (design.capacityKw <= SMALL_SCALE_LIMIT_KW ? "AMS-I.D" : ("ACM0002" as const));
  const code = methodologyCodeOf(methodologyId);
  const vmr0017 = code === METHODOLOGY_CODE.VMR0017;
  const scale = design.capacityKw <= SMALL_SCALE_LIMIT_KW ? "small" : "large";
  if (methodologyId === "AMS-I.D" && design.capacityKw > SMALL_SCALE_LIMIT_KW) {
    failures.push(`AMS-I.D is limited to ${SMALL_SCALE_LIMIT_KW / 1_000} MW; use ACM0002`);
  }

  const { years, period } = design.crediting;
  if (years === 10 && period !== 1) failures.push("A fixed 10-year crediting period cannot be renewed");
  if (period > 1) {
    const renewal = design.renewal;
    if (!renewal?.baselineValidity.trim() || !renewal.regulatorySurplus.trim()) {
      failures.push(
        "A renewed crediting period needs a baseline-validity reference (TOOL11) and a fresh regulatory-surplus check",
      );
    }
    if (renewal?.previousYears !== undefined && renewal.previousYears !== years) {
      failures.push(
        `A renewed crediting period keeps the length of the one it renews (${renewal.previousYears} years, not ${years}); the registry rejects it with RenewalSpan`,
      );
    }
  }
  const creditingStart = toUnix(design.crediting.start);
  const creditingEnd = creditingStart + years * CREDITING_YEAR_SECONDS;
  const requestAt = design.registrationRequest ? toUnix(design.registrationRequest) : creditingStart;
  if (vmr0017 && !design.registrationRequest) {
    failures.push(
      "VMR0017 needs the registration request date: VCS Standard v5.0 Table 8 sets the crediting-period length from it, and the registry stores it as registrationRequestedAt",
    );
  }
  if (vmr0017 && requestAt >= VCS_FIVE_YEAR_FROM && years !== 5) {
    failures.push(
      "VCS Standard v5.0 Table 8: an E&I registration request on or after 1 January 2027 uses a 5-year crediting period, renewable twice",
    );
  }

  if (vmr0017 && design.projectType === "retrofit" && !design.endOfLifeRefurbishment) {
    failures.push(
      "VMR0017 applies VT0010, which excludes an efficiency upgrade. Record an end-of-life refurbishment, or do not register the retrofit under VMR0017",
    );
  }
  if (vmr0017 && design.projectType !== "greenfield") {
    const alternatives = design.baselineAlternatives;
    if (!alternatives?.p1 || !alternatives.p2 || !alternatives.p3) {
      failures.push("VMR0017 §6: VT0009 Step 1 must record alternatives P1, P2 and P3");
    } else if (alternatives.outcome !== "P2") {
      failures.push("ACM0002 applies only when the baseline is continuation of the current situation (P2)");
    }
  }

  if (vmr0017) {
    // Table 1: hydroelectric, 15 MW or less by rated or authorized capacity (whichever is higher), LDCs only.
    const capacity = Math.max(design.capacityKw, design.authorizedCapacityKw ?? 0);
    if (capacity > VMR0017_MAX_HYDRO_KW) {
      failures.push(
        `VMR0017 Table 1: hydroelectric projects must be ${VMR0017_MAX_HYDRO_KW / 1_000} MW or less (rated or authorized capacity)`,
      );
    }
    if (!design.hostCountry) {
      failures.push("VMR0017 Table 1: the host country is required (hydroelectric: LDC countries only)");
    } else if (!isLeastDevelopedCountry(design.hostCountry, creditingStart)) {
      failures.push(
        `VMR0017 Table 1: hydroelectric projects are eligible in LDC countries only; ${design.hostCountry} is not an LDC at the crediting start`,
      );
    }
  }

  const pd = powerDensity(design, reservoirEfGPerMwh(code));
  if (!pd.eligible) failures.push(pd.basis);

  // ACM0002 neglects leakage; AMS-I.D only without transferred equipment; VMR0017 §8.3 adds embodied emissions.
  let leakageBasis =
    methodologyId === "ACM0002"
      ? "ACM0002: no leakage emissions are considered (LE_y = 0)"
      : "AMS-I.D: equipment is not transferred from another activity, so LE_y = 0";
  if (vmr0017) {
    leakageBasis =
      design.projectType === "retrofit"
        ? "VMR0017 §8.3 gives embodied-emission equations for greenfield plants and capacity additions only: LE_y = 0 for a retrofit"
        : `VMR0017 §8.3: LE_y = ${
            design.projectType === "greenfield" ? "EG_facility,y" : "max(EG_PJ,y, EG_facility,y × Cap_add / Cap_PJ)"
          } × EF_embodied (${VMR0017_EMBODIED_HYDRO_G_PER_MWH / 1_000} g CO2e/kWh for hydropower)`;
  } else if (methodologyId === "AMS-I.D" && design.equipmentTransferred) {
    failures.push("AMS-I.D: equipment transferred from another activity requires a leakage assessment");
    leakageBasis = "Leakage from transferred equipment must be assessed; not supported";
  }
  const additionality = additionalityOf(design, vmr0017, failures);

  const baseline = baselineOf(design, failures);
  const grid = gridFactor(design, creditingStart, vmr0017, failures);
  if (grid.efGPerMwh <= 0 || grid.efGPerMwh > MAX_GRID_EF_G_PER_MWH) {
    failures.push(`EF_grid,CM must be above 0 and at most ${MAX_GRID_EF_G_PER_MWH / 1e6} t CO2/MWh`);
  }
  const fuel = design.onSiteFuel ? fuelCoefficient(design.onSiteFuel) : null;

  return {
    plantId: design.plantId,
    name: design.name,
    eligible: failures.length === 0,
    failures,
    methodology: { ...METHODOLOGIES[methodologyId], scale },
    powerDensity: { wPerM2: pd.wPerM2, peHpGPerMwh: pd.peHpGPerMwh, basis: pd.basis },
    grid,
    baseline,
    projectEmissions: {
      fuel,
      reservoir: pd.basis,
      gridUse:
        "Imports are netted 1:1 inside EG_facility (TDL = 0). VT0010 equation (5) is projectElectricityG: EC × EF × (1 + TDL), default TDL 20%. That term is not in the credited integer, because the registry recomputes ER from the meter net.",
    },
    leakage: { basis: leakageBasis, embodiedGPerMwh: embodiedEfGPerMwh(code) },
    additionality,
    vcs: vcsScopeOf(design, methodologyId, creditingStart),
    crediting: { start: creditingStart, end: creditingEnd, years, period },
    registration: {
      projectType: PROJECT_TYPE_CODE[design.projectType],
      methodology: code,
      ...integers,
      efGridGPerMwh: grid.efGPerMwh,
      fuelCoefGPerTonne: fuel?.coefGPerTonne ?? 0,
      baselineWh: baseline.baselineWh,
      baselineEndsAt: baseline.endsAt,
      creditingStart,
      creditingEnd,
      registrationRequestedAt: requestAt,
    },
  };
}
