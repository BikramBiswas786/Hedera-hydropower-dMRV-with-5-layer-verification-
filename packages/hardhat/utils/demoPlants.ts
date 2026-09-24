/**
 * The demo plants registered by `deploy/01_setup_hydro_registry.ts`. These integers are the output of the
 * methodology engine for the designs in `packages/nextjs/services/mrv/demo.ts` (TOOL07 combined margin, TOOL03
 * diesel coefficient, crediting periods); `designHash` is the SHA-256 of each design document. A vitest test in
 * the nextjs package recomputes all of them and fails if they drift, so regenerate them rather than editing.
 */
export type DemoPlant = {
  plantId: string;
  name: string;
  design: {
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
    designHash: string;
  };
};

export const DEMO_PLANTS: DemoPlant[] = [
  {
    plantId: "HYDRO-DEMO-01",
    name: "Demo run-of-river plant",
    design: {
      projectType: 0,
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
      designHash: "0x7778f94d3b77bba0f351303735d8192081205e6466fd9341a185c5182a8f5061",
    },
  },
  {
    plantId: "HYDRO-DEMO-02",
    name: "Demo storage plant, renewed crediting period",
    design: {
      projectType: 0,
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
      designHash: "0x0a3dfb0c4eb7b2f885dc645a0f1b44b1ede402f9b72f5565500b5c89d709f07d",
    },
  },
];
