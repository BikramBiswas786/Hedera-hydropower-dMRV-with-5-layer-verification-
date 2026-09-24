import { type ProjectAssessment, type ProjectDesign, assessProject } from "./methodology/project";
import type { GenerationSource, GridYear, PowerUnit, Tool07Input } from "./methodology/tool07";
import type { Metering, PlantProfile } from "./schema";

/**
 * An ILLUSTRATIVE grid (not a real country) for the demo plants' TOOL07 calculation: coal, gas, oil, hydro, wind
 * and solar units with three years of data, some reported with fuel consumption (option A1) and some with
 * efficiency (option A2). Replace it with the host country's data, or use a DNA-published combined margin.
 */
const GRID_YEARS = [2023, 2024, 2025] as const;

// id, source, commissioned, efficiency (A2) or null (A1), generation MWh per year, fuel t per year (A1) or null
const GRID_UNITS: [string, GenerationSource, number, number | null, number[], number[] | null, boolean?][] = [
  ["COAL-1", "other-bituminous-coal", 1996, 0.34, [5_400_000, 5_300_000, 5_200_000], null],
  ["COAL-2", "other-bituminous-coal", 2009, null, [4_700_000, 4_750_000, 4_800_000], [2_420_000, 2_435_000, 2_450_000]],
  ["COAL-3", "sub-bituminous-coal", 2016, 0.36, [2_000_000, 2_050_000, 2_100_000], null],
  ["CCGT-1", "natural-gas", 2012, 0.52, [3_500_000, 3_550_000, 3_600_000], null],
  ["OCGT-1", "natural-gas", 2017, 0.34, [650_000, 620_000, 600_000], null],
  ["DIESEL-1", "gas-diesel-oil", 2014, null, [260_000, 255_000, 250_000], [64_500, 63_200, 62_000]],
  ["HFO-1", "residual-fuel-oil", 2019, 0.4, [400_000, 410_000, 420_000], null],
  ["CCGT-2", "natural-gas", 2024, 0.55, [0, 950_000, 1_900_000], null],
  ["HYDRO-1", "hydro", 1985, null, [7_300_000, 7_600_000, 7_500_000], null],
  ["HYDRO-2", "hydro", 2021, null, [880_000, 910_000, 900_000], null],
  ["WIND-1", "wind", 2022, null, [600_000, 640_000, 650_000], null],
  ["SOLAR-1", "solar", 2023, null, [150_000, 470_000, 480_000], null],
  ["SOLAR-2", "solar", 2020, null, [290_000, 295_000, 300_000], null, true],
];

export const DEMO_GRID: Omit<Tool07Input, "projectKind" | "creditingPeriod"> = {
  system: "Illustrative interconnected grid",
  units: GRID_UNITS.map(
    ([id, source, commissioned, efficiency, , , cdm]): PowerUnit => ({
      id,
      source,
      commissioned,
      ...(efficiency === null ? {} : { efficiency }),
      ...(cdm ? { cdm } : {}),
    }),
  ),
  years: GRID_YEARS.map(
    (year, y): GridYear => ({
      year,
      units: Object.fromEntries(
        GRID_UNITS.map(([id, , , , mwh, fuelT]) => [id, fuelT ? { mwh: mwh[y], fuelT: fuelT[y] } : { mwh: mwh[y] }]),
      ),
    }),
  ),
  lowCostMustRunShare: [0.338, 0.341, 0.353, 0.357, 0.343],
  operatingMargin: "simple",
};

export const DEMO_DESIGNS: ProjectDesign[] = [
  {
    plantId: "HYDRO-DEMO-01",
    name: "Demo run-of-river plant",
    projectType: "greenfield",
    capacityKw: 500,
    baselineCapacityKw: 0,
    reservoirAreaM2: 0,
    baselineReservoirAreaM2: 0,
    equipmentTransferred: false,
    onSiteFuel: { fuel: "gas-diesel-oil" },
    crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 1 },
    grid: { source: "tool07", input: DEMO_GRID },
    hydraulics: { maxFlowM3s: 1.6, maxHeadM: 45, minEfficiency: 0.7, maxEfficiency: 0.92 },
  },
  {
    plantId: "HYDRO-DEMO-02",
    name: "Demo storage plant, renewed crediting period",
    projectType: "greenfield",
    capacityKw: 12_000,
    baselineCapacityKw: 0,
    // 12 MW over 1.8 km² of new reservoir: PD = 6.67 W/m², so reservoir emissions apply.
    reservoirAreaM2: 1_800_000,
    baselineReservoirAreaM2: 0,
    equipmentTransferred: false,
    onSiteFuel: { fuel: "gas-diesel-oil" },
    crediting: { start: "2026-03-01T00:00:00Z", years: 7, period: 2 },
    grid: { source: "tool07", input: DEMO_GRID },
    hydraulics: { maxFlowM3s: 16, maxHeadM: 95, minEfficiency: 0.75, maxEfficiency: 0.93 },
  },
];

export const DEMO_ASSESSMENTS: ProjectAssessment[] = DEMO_DESIGNS.map(assessProject);

export const DEMO_PLANTS: PlantProfile[] = DEMO_DESIGNS.map((design, i) => ({
  plantId: design.plantId,
  name: design.name,
  methodology: DEMO_ASSESSMENTS[i].methodology.id,
  design: DEMO_ASSESSMENTS[i].registration,
  hydraulics: design.hydraulics,
}));

export const DEMO_PLANT = DEMO_PLANTS[0];

export const findDemoPlant = (plantId: string) => DEMO_PLANTS.find(p => p.plantId === plantId);
export const findDemoDesign = (plantId: string) => DEMO_DESIGNS.find(d => d.plantId === plantId);

/** Class 0.2S main meter, class 0.5S check meter, calibrated until mid-2027, ±5% ultrasonic flow meter. */
export const DEMO_METERING: Metering = {
  mainMeterAccuracyPct: 0.2,
  checkMeterAccuracyPct: 0.5,
  calibrationValidUntil: "2027-06-30T00:00:00Z",
  flowUncertaintyPct: 5,
};
