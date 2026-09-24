/**
 * IPCC 2006 Guidelines, Vol. 2 (Energy), Chapter 1: default net calorific values (Table 1.2, TJ/Gg = GJ/t) and
 * CO2 emission factors (Table 1.4, kg CO2/TJ), each with the bounds of its 95% confidence interval.
 *
 * The CDM tools pick the bound that is conservative for the role a fuel plays:
 * - TOOL07 (grid emission factor, i.e. the baseline) uses the LOWER bounds, so the baseline is not overstated;
 * - TOOL03 (project or leakage emissions) uses the UPPER bounds, so project emissions are not understated.
 * Plant-specific or national values take precedence when a project has them; these are the fallbacks.
 */
export const FUELS = {
  "crude-oil": { label: "Crude oil", ncv: [42.3, 40.1, 44.8], co2: [73_300, 71_100, 75_500] },
  "motor-gasoline": { label: "Motor gasoline", ncv: [44.3, 42.5, 44.8], co2: [69_300, 67_500, 73_000] },
  "gas-diesel-oil": { label: "Gas/diesel oil", ncv: [43.0, 41.4, 43.3], co2: [74_100, 72_600, 74_800] },
  "residual-fuel-oil": { label: "Residual fuel oil", ncv: [40.4, 39.8, 41.7], co2: [77_400, 75_500, 78_800] },
  lpg: { label: "Liquefied petroleum gases", ncv: [47.3, 44.8, 52.2], co2: [63_100, 61_600, 65_600] },
  "natural-gas": { label: "Natural gas", ncv: [48.0, 46.5, 50.4], co2: [56_100, 54_300, 58_300] },
  anthracite: { label: "Anthracite", ncv: [26.7, 21.6, 32.2], co2: [98_300, 94_600, 101_000] },
  "other-bituminous-coal": {
    label: "Other bituminous coal",
    ncv: [25.8, 19.9, 30.5],
    co2: [94_600, 89_500, 99_700],
  },
  "sub-bituminous-coal": { label: "Sub-bituminous coal", ncv: [18.9, 11.5, 26.0], co2: [96_100, 92_800, 100_000] },
  lignite: { label: "Lignite", ncv: [11.9, 5.5, 21.6], co2: [101_000, 90_900, 115_000] },
} as const satisfies Record<
  string,
  { label: string; ncv: readonly [number, number, number]; co2: readonly [number, number, number] }
>;

export type FuelType = keyof typeof FUELS;
export const FUEL_TYPES = Object.keys(FUELS) as [FuelType, ...FuelType[]];

export type Bound = "default" | "lower" | "upper";
const INDEX: Record<Bound, 0 | 1 | 2> = { default: 0, lower: 1, upper: 2 };

/** Net calorific value in GJ per tonne of fuel. */
export const netCalorificValue = (fuel: FuelType, bound: Bound) => FUELS[fuel].ncv[INDEX[bound]];

/** CO2 emission factor in kg CO2 per TJ. */
export const co2EmissionFactorKgPerTj = (fuel: FuelType, bound: Bound) => FUELS[fuel].co2[INDEX[bound]];

/** CO2 emission factor in t CO2 per GJ (1 TJ = 1 000 GJ, 1 t = 1 000 kg). */
export const co2EmissionFactorTPerGj = (fuel: FuelType, bound: Bound) => co2EmissionFactorKgPerTj(fuel, bound) / 1e6;
