import { MethodologyError } from "./errors";
import { type FuelCoefficient, type OnSiteFuel, fuelCoefficient } from "./tool03";
import { type Tool07Input, type Tool07Result, calculateGridEmissionFactor } from "./tool07";

/**
 * Project-level (ex-ante) part of ACM0002 / AMS-I.D for hydropower: applicability, the reservoir power-density rule,
 * the baseline scenario for greenfield, retrofit and capacity-addition plants, the grid emission factor (TOOL07),
 * the fuel coefficient for project emissions (TOOL03) and the crediting period. The result is what a VVB validates
 * and what `registerPlant` stores on-chain.
 */

export const METHODOLOGIES = {
  ACM0002: {
    id: "ACM0002",
    version: "22.0",
    title: "Grid-connected electricity generation from renewable sources",
  },
  "AMS-I.D": { id: "AMS-I.D", version: "18.0", title: "Grid connected renewable electricity generation" },
} as const;
export type MethodologyId = keyof typeof METHODOLOGIES;

/** AMS-I.D (small scale) applies up to 15 MW of installed capacity. */
export const SMALL_SCALE_LIMIT_KW = 15_000;
/** Power density thresholds (W/m²) for new or enlarged reservoirs. */
export const MIN_POWER_DENSITY = 4;
export const RESERVOIR_EMISSIONS_POWER_DENSITY = 10;
/** EF_Res: default emission factor for reservoir emissions, 90 kg CO2e/MWh = 90 000 g CO2e/MWh. */
export const RESERVOIR_EF_G_PER_MWH = 90_000;
/** Sanity ceiling the contract enforces: 2 t CO2/MWh is above any real grid's combined margin. */
export const MAX_GRID_EF_G_PER_MWH = 2_000_000;
/** Crediting-period years are 365-day blocks, here and in the contract. */
export const CREDITING_YEAR_SECONDS = 365 * 24 * 3_600;

export const PROJECT_TYPES = ["greenfield", "retrofit", "capacity-addition"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
/** Enum order of `HydroCreditRegistry.ProjectType`. */
export const PROJECT_TYPE_CODE: Record<ProjectType, number> = { greenfield: 0, retrofit: 1, "capacity-addition": 2 };

export type GridEmissionFactorSource =
  | { source: "tool07"; input: Omit<Tool07Input, "projectKind" | "creditingPeriod"> }
  /** A combined margin published by a Designated National Authority or the UNFCCC, cited by reference. */
  | { source: "published"; efTPerMwh: number; reference: string };

export type Hydraulics = {
  /** Design (turbine) flow and gross head: sensor readings above them are implausible. */
  maxFlowM3s: number;
  maxHeadM: number;
  /** Water-to-wire efficiency envelope from the turbine and generator datasheets. */
  minEfficiency: number;
  maxEfficiency: number;
};

export type ProjectDesign = {
  plantId: string;
  name: string;
  /** Defaults to AMS-I.D up to 15 MW and ACM0002 above. */
  methodology?: MethodologyId;
  projectType: ProjectType;
  /** Cap_PJ and Cap_BL: installed capacity after and before the project (kW; 0 before a greenfield plant). */
  capacityKw: number;
  baselineCapacityKw: number;
  /** A_PJ and A_BL: full-reservoir water surface after and before the project (m²; 0 for run-of-river). */
  reservoirAreaM2: number;
  baselineReservoirAreaM2: number;
  /** Retrofit / capacity addition: annual net generation of the existing plant, at least the 5 latest years. */
  historicalGenerationMwh?: number[];
  /** Retrofit / capacity addition: DATE_BaselineRetrofit, when the existing equipment would have been replaced. */
  baselineRetrofitDate?: string;
  /** Generating equipment moved here from another activity (AMS-I.D then requires a leakage assessment). */
  equipmentTransferred: boolean;
  /** Fossil fuel burnt on site (back-up generators, black start); null when none is used. */
  onSiteFuel: OnSiteFuel | null;
  crediting: { start: string; years: 7 | 10; period: 1 | 2 | 3 };
  grid: GridEmissionFactorSource;
  hydraulics: Hydraulics;
};

/** Integers stored by `HydroCreditRegistry.registerPlant`; the contract derives PE_HP from the areas itself. */
export type RegisteredDesign = {
  projectType: number;
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
  projectEmissions: { fuel: FuelCoefficient | null; reservoir: string };
  leakage: { basis: string };
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
 */
export function powerDensity(
  design: Pick<ProjectDesign, "capacityKw" | "baselineCapacityKw" | "reservoirAreaM2" | "baselineReservoirAreaM2">,
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
      peHpGPerMwh: RESERVOIR_EF_G_PER_MWH,
      eligible: true,
      basis: `${MIN_POWER_DENSITY} < PD = ${wPerM2.toFixed(2)} W/m² ≤ ${RESERVOIR_EMISSIONS_POWER_DENSITY}: PE_HP,y = EF_Res × TEG_y`,
    };
  }
  return {
    wPerM2,
    peHpGPerMwh: 0,
    eligible: true,
    basis: `PD = ${wPerM2.toFixed(2)} W/m² > ${RESERVOIR_EMISSIONS_POWER_DENSITY}: PE_HP,y = 0`,
  };
}

function gridFactor(design: ProjectDesign): ProjectAssessment["grid"] {
  if (design.grid.source === "published") {
    const { efTPerMwh, reference } = design.grid;
    return {
      source: "published",
      efTPerMwh,
      efGPerMwh: Math.floor(Number((efTPerMwh * 1e6).toFixed(6))),
      reference,
    };
  }
  const tool07 = calculateGridEmissionFactor({
    ...design.grid.input,
    projectKind: "hydro",
    creditingPeriod: design.crediting.period,
  });
  return {
    source: "tool07",
    efTPerMwh: tool07.combinedMargin.efTPerMwh,
    efGPerMwh: tool07.combinedMargin.efGPerMwh,
    reference: `TOOL07 ex-ante combined margin for ${tool07.system}`,
    tool07,
  };
}

function baselineOf(design: ProjectDesign, failures: string[]): ProjectAssessment["baseline"] {
  if (design.projectType === "greenfield") {
    if (design.baselineCapacityKw !== 0) failures.push("A greenfield plant has no existing capacity (Cap_BL = 0)");
    return { projectType: "greenfield", equation: "EG_PJ,y = EG_facility,y", baselineWh: 0, endsAt: 0 };
  }

  const history = design.historicalGenerationMwh ?? [];
  if (design.baselineCapacityKw <= 0) failures.push(`A ${design.projectType} needs the existing capacity Cap_BL`);
  if (design.projectType === "capacity-addition" && design.capacityKw <= design.baselineCapacityKw) {
    failures.push("A capacity addition must increase installed capacity");
  }
  if (history.length < 5) failures.push("EG_historical needs at least five years of annual generation data");
  if (!design.baselineRetrofitDate) failures.push("DATE_BaselineRetrofit is required for retrofits and additions");

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
  const scale = methodologyId === "AMS-I.D" ? "small" : "large";
  if (methodologyId === "AMS-I.D" && design.capacityKw > SMALL_SCALE_LIMIT_KW) {
    failures.push(`AMS-I.D is limited to ${SMALL_SCALE_LIMIT_KW / 1_000} MW; use ACM0002`);
  }

  const pd = powerDensity(design);
  if (!pd.eligible) failures.push(pd.basis);

  // ACM0002 neglects leakage outright; AMS-I.D only when no equipment is transferred from another activity.
  let leakageBasis =
    methodologyId === "ACM0002"
      ? "ACM0002: no leakage emissions are considered (LE_y = 0)"
      : "AMS-I.D: equipment is not transferred from another activity, so LE_y = 0";
  if (methodologyId === "AMS-I.D" && design.equipmentTransferred) {
    failures.push("AMS-I.D: equipment transferred from another activity requires a leakage assessment");
    leakageBasis = "Leakage from transferred equipment must be assessed; not supported";
  }

  const { years, period } = design.crediting;
  if (years === 10 && period !== 1) failures.push("A fixed 10-year crediting period cannot be renewed");
  const creditingStart = toUnix(design.crediting.start);
  const creditingEnd = creditingStart + years * CREDITING_YEAR_SECONDS;

  const baseline = baselineOf(design, failures);
  const grid = gridFactor(design);
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
    },
    leakage: { basis: leakageBasis },
    crediting: { start: creditingStart, end: creditingEnd, years, period },
    registration: {
      projectType: PROJECT_TYPE_CODE[design.projectType],
      ...integers,
      efGridGPerMwh: grid.efGPerMwh,
      fuelCoefGPerTonne: fuel?.coefGPerTonne ?? 0,
      baselineWh: baseline.baselineWh,
      baselineEndsAt: baseline.endsAt,
      creditingStart,
      creditingEnd,
    },
  };
}
