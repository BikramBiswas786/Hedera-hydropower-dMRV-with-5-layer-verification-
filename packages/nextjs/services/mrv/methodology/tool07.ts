import { MethodologyError } from "./errors";
import { FUELS, type FuelType, co2EmissionFactorTPerGj, netCalorificValue } from "./fuels";

/**
 * TOOL07 — "Tool to calculate the emission factor for an electricity system", ex-ante option.
 *
 *   EF_grid,CM,y = w_OM × EF_grid,OM,y + w_BM × EF_grid,BM,y
 *
 * Operating margin (OM): simple, simple adjusted or average, from per-unit data (option A), as a 3-year
 * generation-weighted average. Build margin (BM): the sample group of units selected by TOOL07 step 5 (a)–(f).
 * Fuel data without plant-specific values uses the IPCC LOWER 95% bounds, the conservative side for a baseline.
 */

export type GenerationSource = FuelType | "hydro" | "wind" | "solar" | "geothermal" | "nuclear" | "biomass";

/** Low-cost/must-run (LCMR) resources: their marginal emissions are zero and they never set the simple OM. */
export const LOW_COST_MUST_RUN = ["hydro", "wind", "solar", "geothermal", "nuclear", "biomass"] as const;
export const isLowCostMustRun = (source: GenerationSource) => (LOW_COST_MUST_RUN as readonly string[]).includes(source);

export type PowerUnit = {
  id: string;
  source: GenerationSource;
  /** Year the unit started to supply electricity to the grid. */
  commissioned: number;
  /** Registered as a CDM project activity: left out of the BM sample until TOOL07 step 5(d). */
  cdm?: boolean;
  /** Net electrical efficiency, for option A2 when fuel consumption is not reported. */
  efficiency?: number;
};

export type UnitGeneration = {
  /** Net electricity delivered to the grid, EG_m,y (MWh). */
  mwh: number;
  /** Fuel burnt, FC_i,m,y (t), for option A1. */
  fuelT?: number;
};

export type GridYear = {
  year: number;
  units: Record<string, UnitGeneration>;
  /** λ_y for the simple adjusted OM: hours per year in which LCMR sources are on the margin / 8 760. */
  lambda?: number;
};

export type OperatingMarginMethod = "simple" | "simple-adjusted" | "average";

export type Tool07Input = {
  system: string;
  units: PowerUnit[];
  /** The three most recent years with data (ex-ante OM vintage). The latest one is also used for the BM. */
  years: GridYear[];
  /** LCMR share of total generation in each of the five most recent years. */
  lowCostMustRunShare: number[];
  operatingMargin: OperatingMarginMethod;
  /** Wind and solar get w_OM = 0.75; every other technology (hydro included) 0.5, then 0.25 after renewal. */
  projectKind: "hydro" | "wind-solar";
  creditingPeriod: 1 | 2 | 3;
};

export type UnitFactor = {
  id: string;
  source: GenerationSource;
  commissioned: number;
  cdm: boolean;
  mwh: number;
  /** EF_EL,m,y in t CO2/MWh. */
  efTPerMwh: number;
  option: "A1" | "A2" | "LCMR";
};

export type BuildMarginStep = "5(c) SET_sample" | "5(d) SET_sample-CDM" | "5(f) SET_sample-CDM->10yrs";

export type Tool07Result = {
  system: string;
  operatingMargin: {
    method: OperatingMarginMethod;
    efTPerMwh: number;
    lowCostMustRunShare: number;
    perYear: { year: number; efTPerMwh: number; generationMwh: number; lambda?: number }[];
  };
  buildMargin: {
    efTPerMwh: number;
    referenceYear: number;
    step: BuildMarginStep;
    totalMwh: number;
    set5Mwh: number;
    set20Mwh: number;
    sample: UnitFactor[];
  };
  weights: { operatingMargin: number; buildMargin: number };
  combinedMargin: {
    efTPerMwh: number;
    /** EF_grid,CM rounded down to whole g CO2/MWh: the integer registered on-chain. */
    efGPerMwh: number;
  };
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const weightedAverage = (items: { mwh: number; efTPerMwh: number }[]) => {
  const total = sum(items.map(i => i.mwh));
  return total === 0 ? 0 : sum(items.map(i => i.mwh * i.efTPerMwh)) / total;
};

/** EF_EL,m,y: option A1 from fuel burnt, option A2 from efficiency; LCMR units emit nothing at the margin. */
export function unitEmissionFactor(unit: PowerUnit, data: UnitGeneration): UnitFactor {
  const base = { id: unit.id, source: unit.source, commissioned: unit.commissioned, cdm: !!unit.cdm, mwh: data.mwh };
  if (isLowCostMustRun(unit.source)) return { ...base, efTPerMwh: 0, option: "LCMR" };

  const fuel = unit.source as FuelType;
  const ef = co2EmissionFactorTPerGj(fuel, "lower");
  if (data.fuelT !== undefined) {
    if (data.mwh <= 0) throw new MethodologyError(`Unit ${unit.id}: fuel reported without generation`);
    // A1: EF_EL = Σ FC × NCV × EF_CO2 / EG
    return { ...base, efTPerMwh: (data.fuelT * netCalorificValue(fuel, "lower") * ef) / data.mwh, option: "A1" };
  }
  if (unit.efficiency !== undefined) {
    if (unit.efficiency <= 0 || unit.efficiency > 1) {
      throw new MethodologyError(`Unit ${unit.id}: efficiency must be in (0, 1]`);
    }
    // A2: EF_EL = EF_CO2 × 3.6 / η   (3.6 GJ per MWh)
    return { ...base, efTPerMwh: (ef * 3.6) / unit.efficiency, option: "A2" };
  }
  throw new MethodologyError(
    `Unit ${unit.id} (${FUELS[fuel].label}): option A needs fuel consumption (A1) or net efficiency (A2)`,
  );
}

function factorsForYear(input: Tool07Input, year: GridYear): UnitFactor[] {
  return input.units
    .filter(unit => (year.units[unit.id]?.mwh ?? 0) > 0)
    .map(unit => unitEmissionFactor(unit, year.units[unit.id]));
}

function operatingMargin(input: Tool07Input) {
  const lcmrShare = sum(input.lowCostMustRunShare) / input.lowCostMustRunShare.length;
  if (input.operatingMargin === "simple" && lcmrShare >= 0.5) {
    throw new MethodologyError(
      `Simple OM is only allowed when low-cost/must-run sources supply < 50% of generation (5-year average is ${(lcmrShare * 100).toFixed(1)}%). Use the simple adjusted or average OM.`,
    );
  }

  const perYear = input.years.map(year => {
    const factors = factorsForYear(input, year);
    const fossil = factors.filter(f => f.option !== "LCMR");
    const lcmr = factors.filter(f => f.option === "LCMR");
    const generationMwh = sum(factors.map(f => f.mwh));
    switch (input.operatingMargin) {
      case "simple":
        return { year: year.year, efTPerMwh: weightedAverage(fossil), generationMwh: sum(fossil.map(f => f.mwh)) };
      case "average":
        return { year: year.year, efTPerMwh: weightedAverage(factors), generationMwh };
      case "simple-adjusted": {
        const lambda = year.lambda;
        if (lambda === undefined || lambda < 0 || lambda > 1) {
          throw new MethodologyError(`Simple adjusted OM needs λ in [0, 1] for ${year.year}`);
        }
        const efTPerMwh = (1 - lambda) * weightedAverage(fossil) + lambda * weightedAverage(lcmr);
        return { year: year.year, efTPerMwh, generationMwh, lambda };
      }
    }
  });

  // Ex-ante vintage: generation-weighted average over the three years (for the simple OM this equals
  // Σ_y Σ_m EG_m,y·EF_EL,m,y / Σ_y Σ_m EG_m,y).
  const efTPerMwh = weightedAverage(perYear.map(y => ({ mwh: y.generationMwh, efTPerMwh: y.efTPerMwh })));
  return { method: input.operatingMargin, efTPerMwh, lowCostMustRunShare: lcmrShare, perYear };
}

/** Adds units in order until the set supplies `target` MWh; the unit crossing the threshold is fully included. */
function fillTo(set: UnitFactor[], candidates: UnitFactor[], target: number): UnitFactor[] {
  const result = [...set];
  for (const unit of candidates) {
    if (sum(result.map(u => u.mwh)) >= target) break;
    result.push(unit);
  }
  return result;
}

function buildMargin(input: Tool07Input) {
  const latest = input.years.reduce((a, b) => (b.year > a.year ? b : a));
  const referenceYear = latest.year;
  // "Started most recently" first; ties keep input order.
  const byRecency = factorsForYear(input, latest)
    .map((factor, index) => ({ factor, index }))
    .sort((a, b) => b.factor.commissioned - a.factor.commissioned || a.index - b.index)
    .map(({ factor }) => factor);
  const nonCdm = byRecency.filter(u => !u.cdm);
  const cdm = byRecency.filter(u => u.cdm);
  const mwhOf = (set: UnitFactor[]) => sum(set.map(u => u.mwh));
  const isOld = (u: UnitFactor) => referenceYear - u.commissioned > 10;

  // (a) five most recent units, (b) most recent units supplying ≥ 20% of AEG_total, both excluding CDM units.
  const totalMwh = mwhOf(nonCdm);
  const target = 0.2 * totalMwh;
  const set5 = nonCdm.slice(0, 5);
  const set20 = fillTo([], nonCdm, target);
  // (c) the set with the larger generation is SET_sample.
  const sample = mwhOf(set5) > mwhOf(set20) ? set5 : set20;

  let step: BuildMarginStep = "5(c) SET_sample";
  let chosen = sample;
  if (sample.some(isOld)) {
    // (d) drop units older than 10 years and add CDM units, most recent first, until 20% is reached.
    chosen = fillTo(
      sample.filter(u => !isOld(u)),
      cdm,
      target,
    );
    step = "5(d) SET_sample-CDM";
    if (mwhOf(chosen) < target) {
      // (e)–(f) then add older units, most recent first, until 20% is reached.
      chosen = fillTo(
        chosen,
        byRecency.filter(u => isOld(u) && !chosen.includes(u)),
        target,
      );
      step = "5(f) SET_sample-CDM->10yrs";
    }
  }

  return {
    efTPerMwh: weightedAverage(chosen),
    referenceYear,
    step,
    totalMwh,
    set5Mwh: mwhOf(set5),
    set20Mwh: mwhOf(set20),
    sample: chosen,
  };
}

export function combinedMarginWeights(projectKind: Tool07Input["projectKind"], creditingPeriod: 1 | 2 | 3) {
  if (projectKind === "wind-solar") return { operatingMargin: 0.75, buildMargin: 0.25 };
  return creditingPeriod === 1
    ? { operatingMargin: 0.5, buildMargin: 0.5 }
    : { operatingMargin: 0.25, buildMargin: 0.75 };
}

function validate(input: Tool07Input) {
  const years = new Set(input.years.map(y => y.year));
  if (input.years.length !== 3 || years.size !== 3) {
    throw new MethodologyError("The ex-ante OM needs data for three distinct years");
  }
  if (input.lowCostMustRunShare.length !== 5 || input.lowCostMustRunShare.some(s => s < 0 || s > 1)) {
    throw new MethodologyError("Give the low-cost/must-run share (0–1) for each of the five most recent years");
  }
  const ids = new Set(input.units.map(u => u.id));
  if (ids.size !== input.units.length) throw new MethodologyError("Power unit ids must be unique");
  for (const year of input.years) {
    for (const [id, data] of Object.entries(year.units)) {
      if (!ids.has(id)) throw new MethodologyError(`${year.year}: unknown power unit ${id}`);
      if (data.mwh < 0 || (data.fuelT ?? 0) < 0) throw new MethodologyError(`${year.year}: ${id} has negative data`);
    }
  }
}

export function calculateGridEmissionFactor(input: Tool07Input): Tool07Result {
  validate(input);
  const om = operatingMargin(input);
  const bm = buildMargin(input);
  const weights = combinedMarginWeights(input.projectKind, input.creditingPeriod);
  const efTPerMwh = weights.operatingMargin * om.efTPerMwh + weights.buildMargin * bm.efTPerMwh;
  return {
    system: input.system,
    operatingMargin: om,
    buildMargin: bm,
    weights,
    combinedMargin: { efTPerMwh, efGPerMwh: Math.floor(Number((efTPerMwh * 1e6).toFixed(6))) },
  };
}
