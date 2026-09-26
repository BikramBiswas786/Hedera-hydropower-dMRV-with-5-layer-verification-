import { MethodologyError } from "./errors";
import { FUELS, type FuelType, co2EmissionFactorKgPerTj, netCalorificValue } from "./fuels";

/**
 * TOOL03 — "Tool to calculate project or leakage CO2 emissions from fossil fuel combustion".
 *
 *   PE_FC,j,y = Σ_i FC_i,j,y × COEF_i,y                       (t CO2)
 *   COEF_i,y  = NCV_i,y × EF_CO2,i,y           (option B)      (t CO2 / t fuel)
 *
 * Hydro plants burn fossil fuel on site for back-up generators, black start and site vehicles; ACM0002 and AMS-I.D
 * count it as PE_FF,y through this tool. Without measured NCV and EF, the IPCC upper bounds apply.
 */
export type OnSiteFuel = {
  fuel: FuelType;
  /** Measured or supplier NCV in GJ/t; defaults to the IPCC 95% upper bound. */
  ncvGjPerT?: number;
  /** Measured or national CO2 factor in kg CO2/TJ; defaults to the IPCC 95% upper bound. */
  co2KgPerTj?: number;
};

export type FuelCoefficient = {
  fuel: FuelType;
  label: string;
  ncvGjPerT: number;
  co2KgPerTj: number;
  ncvSource: string;
  co2Source: string;
  /** COEF in t CO2 per t fuel. */
  coefTPerT: number;
  /** COEF in g CO2 per t fuel, rounded up: the integer registered on-chain. */
  coefGPerTonne: number;
};

/** Rounds away float noise (43.3 × 74 800 = 3 238 840.0000000005) before rounding up. */
const ceilClean = (value: number) => Math.ceil(Number(value.toFixed(6)));

export function fuelCoefficient({ fuel, ncvGjPerT, co2KgPerTj }: OnSiteFuel): FuelCoefficient {
  const spec = FUELS[fuel];
  if (ncvGjPerT !== undefined && (ncvGjPerT < spec.ncv[1] || ncvGjPerT > spec.ncv[2])) {
    throw new MethodologyError(
      `NCV for ${spec.label} is outside the IPCC 95% interval (${spec.ncv[1]}–${spec.ncv[2]} GJ/t)`,
    );
  }
  if (co2KgPerTj !== undefined && (co2KgPerTj < spec.co2[1] || co2KgPerTj > spec.co2[2])) {
    throw new MethodologyError(
      `EF_CO2 for ${spec.label} is outside the IPCC 95% interval (${spec.co2[1]}–${spec.co2[2]} kg/TJ)`,
    );
  }
  const ncv = ncvGjPerT ?? netCalorificValue(fuel, "upper");
  const co2 = co2KgPerTj ?? co2EmissionFactorKgPerTj(fuel, "upper");
  // GJ/t × kg/TJ = 10⁻³ kg/t = g/t, so the product of the two tabulated numbers is already g CO2 per tonne.
  const coefGPerTonne = ceilClean(ncv * co2);
  return {
    fuel,
    label: FUELS[fuel].label,
    ncvGjPerT: ncv,
    co2KgPerTj: co2,
    ncvSource: ncvGjPerT === undefined ? "IPCC 2006 Vol.2 Table 1.2, upper 95% bound" : "project-specific",
    co2Source: co2KgPerTj === undefined ? "IPCC 2006 Vol.2 Table 1.4, upper 95% bound" : "project-specific",
    coefTPerT: coefGPerTonne / 1e6,
    coefGPerTonne,
  };
}
