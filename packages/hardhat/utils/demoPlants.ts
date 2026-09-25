/**
 * The demo plants registered by `deploy/01_setup_hydro_registry.ts`. These integers are the output of the
 * methodology engine for the designs in `packages/nextjs/services/mrv/demo.ts` (VMR0017 v1.0 with ACM0002 v22.0,
 * TOOL07 combined margin, TOOL03 diesel coefficient, crediting periods); `designHash` is the SHA-256 of each design
 * document. A vitest test in
 * the nextjs package recomputes all of them and fails if they drift, so regenerate them rather than editing.
 */
export type DemoPlant = {
  plantId: string;
  name: string;
  design: {
    projectType: number;
    /** 0 = CDM (ACM0002 / AMS-I.D), 1 = VMR0017 v1.0. */
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
    designHash: string;
  };
};

export const DEMO_PLANTS: DemoPlant[] = [
  {
    plantId: "HYDRO-DEMO-01",
    name: "Demo run-of-river plant",
    design: {
      projectType: 0,
      methodology: 1,
      capacityKw: 500,
      baselineCapacityKw: 0,
      reservoirAreaM2: 0,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAt: 0,
      creditingStart: 1_767_225_600,
      creditingEnd: 1_987_977_600,
      designHash: "0x476866da1400cb120c94a6af3e0a33c58c9786da37938cbbc885dab91b80fe47",
    },
  },
  {
    plantId: "HYDRO-DEMO-02",
    name: "Demo storage plant, renewed crediting period",
    design: {
      projectType: 0,
      methodology: 1,
      capacityKw: 12_000,
      baselineCapacityKw: 0,
      reservoirAreaM2: 1_800_000,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 538_535,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAt: 0,
      creditingStart: 1_772_323_200,
      creditingEnd: 1_993_075_200,
      designHash: "0x542bb47410fab12b624fba4f4a81564bf535a80c67a8934945f7abaa4e7bf9ac",
    },
  },
];
