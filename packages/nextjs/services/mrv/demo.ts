import {
  type AdditionalityEvidence,
  type ProjectAssessment,
  type ProjectDesign,
  assessProject,
} from "./methodology/project";
import type { GenerationSource, GridYear, PowerUnit, Tool07Input } from "./methodology/tool07";
import type { Metering, PlantProfile } from "./schema";
import { type Hex, keccak256, stringToBytes } from "viem";
import { privateKeyToAddress } from "viem/accounts";

/**
 * An ILLUSTRATIVE grid (not a real country) that shows every TOOL07 / VT0011 step on per-unit data: coal, gas, oil,
 * hydro, wind and solar units with three years of data, some reported with fuel consumption (option A1) and some
 * with efficiency (option A2). The /methodology page and the tool tests use it. The demo plants do NOT: they sit in
 * Uganda and use Uganda's published margins (`UGANDA_GRID`).
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

/**
 * Uganda's national grid, from the CDM standardized baseline ASB0054-2022 v01.0 (TOOL07 v7.0, ex-ante vintage, 2017-
 * 2019 data; in force 10 Aug 2022 to 9 Aug 2025): OM 0.2740 t CO2/MWh, BM 0.00001 t CO2/MWh (the most recent units
 * are hydro and solar). Its hydro CM is TOOL07's 0.5/0.5 weighting, 0.1370; on the VMR0017 path the engine re-weights
 * OM and BM with VT0011 ¶86 (0.4/0.6 for a first crediting period: 0.1096). The demo designs fix that ex-ante CM at
 * validation (1 Jul 2025), inside the baseline's validity; a project validated later needs a VT0011 calculation on
 * newer data, since this baseline has expired.
 */
export const UGANDA_GRID = {
  source: "published",
  efTPerMwh: 0.137,
  omTPerMwh: 0.274,
  bmTPerMwh: 0.00001,
  reference:
    "CDM standardized baseline ASB0054-2022 v01.0, national grid of Uganda (TOOL07 v7.0 ex-ante, 2017-2019 data)",
  validFrom: "2022-08-10T00:00:00Z",
  validTo: "2025-08-10T00:00:00Z",
  fixedAt: "2025-07-01T00:00:00Z",
} as const;

/**
 * ILLUSTRATIVE VT0008 evidence, standing in for what a VVB validates from the investment analysis and common-practice
 * study. Real projects cite their validation report here.
 */
const DEMO_ADDITIONALITY: AdditionalityEvidence = {
  tool: "VT0008",
  regulatorySurplus: true,
  regulatorySurplusBasis: "Illustrative: no law requires this plant to be built",
  investment: {
    analysis: "benchmark",
    irr: "project",
    irrWithoutCreditsPct: 8.1,
    irrWithCreditsPct: 12.4,
    benchmarkPct: 11.5,
    sensitivityConfirms: true,
    decisiveIncrease: true,
    sensitivity: [
      { parameter: "tariff", variationPct: -10, irrPct: 6.4 },
      { parameter: "tariff", variationPct: 10, irrPct: 9.7 },
      { parameter: "capex", variationPct: -10, irrPct: 9.9 },
      { parameter: "capex", variationPct: 10, irrPct: 6.2 },
    ],
  },
  commonPractice: {
    nAll: 12,
    nDiff: 10,
    basis: "Illustrative: grid-connected small hydro within ±50% of the design capacity in the host country",
    geographicArea: "Uganda",
    capacityBandPct: 50,
  },
  assessedBy: "none (illustrative demo data, not validated)",
};

/** ILLUSTRATIVE: no impact assessment or consultation took place for these demo plants. */
const DEMO_SAFEGUARDS = {
  environmentalImpactAssessment: "Illustrative: no EIA exists for this demo plant",
  stakeholderConsultation: "Illustrative: no stakeholder consultation took place",
  noNetHarm: "Illustrative: no no-net-harm assessment exists",
};

/**
 * Both demo plants use Verra VMR0017 v1.0 with ACM0002 v22.0 (published 23 April 2026, so both registration requests
 * are later). Its Table 1 limits hydro to 15 MW or less in Least Developed Countries, so the host is Uganda (an LDC)
 * and the grid factor is Uganda's published one. The additionality figures stay illustrative and are labelled so.
 *
 * On Uganda's hydro-dominated grid the storage plant earns nothing: its reservoir (PD 6.67 W/m², PE_HP = 100 kg per
 * MWh) plus embodied emissions (21 kg/MWh) exceed the 110 kg/MWh it displaces. The registry carries that deficit.
 */
export const DEMO_DESIGNS: ProjectDesign[] = [
  {
    plantId: "HYDRO-DEMO-01",
    name: "Demo run-of-river plant",
    methodology: "VMR0017",
    hostCountry: "UG",
    additionality: DEMO_ADDITIONALITY,
    safeguards: DEMO_SAFEGUARDS,
    projectType: "greenfield",
    capacityKw: 500,
    baselineCapacityKw: 0,
    reservoirAreaM2: 0,
    baselineReservoirAreaM2: 0,
    equipmentTransferred: false,
    onSiteFuel: { fuel: "gas-diesel-oil" },
    crediting: { start: "2026-01-01T00:00:00Z", years: 7, period: 1 },
    registrationRequest: "2026-05-04T00:00:00Z",
    grid: UGANDA_GRID,
    hydraulics: { maxFlowM3s: 1.6, maxHeadM: 45, minEfficiency: 0.7, maxEfficiency: 0.92 },
  },
  {
    plantId: "HYDRO-DEMO-02",
    name: "Demo storage plant",
    methodology: "VMR0017",
    hostCountry: "UG",
    additionality: DEMO_ADDITIONALITY,
    safeguards: DEMO_SAFEGUARDS,
    projectType: "greenfield",
    capacityKw: 12_000,
    baselineCapacityKw: 0,
    // 12 MW over 1.8 km² of new reservoir: PD = 6.67 W/m², so reservoir emissions apply.
    reservoirAreaM2: 1_800_000,
    baselineReservoirAreaM2: 0,
    equipmentTransferred: false,
    onSiteFuel: { fuel: "gas-diesel-oil" },
    crediting: { start: "2026-03-01T00:00:00Z", years: 7, period: 1 },
    registrationRequest: "2026-05-04T00:00:00Z",
    grid: UGANDA_GRID,
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
  // sha256 of fixed illustrative labels. Not a scanned certificate.
  calibrationCertificateSha256: "060d5c7658ff4f1d0407516b426efe4533393cdd972cd14f65c61875d9b1a6e2",
  invoiceCrossCheckSha256: "6d71c2b302ee45e3fc86894189fa83823cf6241f12cdb0ccc12a8ee1650b19ca",
  lastCalibrationUncertaintyPct: 0.2,
};

/**
 * The demo data loggers' signing keys. PUBLIC by construction (derived from the plant id) so anyone can generate
 * signed sample data; a real meter keeps its key in a secure element and only its address is published.
 */
export const demoMeterKey = (plantId: string): Hex => keccak256(stringToBytes(`hydro-dmrv demo meter ${plantId}`));

/** A demo plant's metering record, including its meter's address. */
export const demoMeteringFor = (plantId: string): Metering => ({
  ...DEMO_METERING,
  deviceAddress: privateKeyToAddress(demoMeterKey(plantId)),
});
