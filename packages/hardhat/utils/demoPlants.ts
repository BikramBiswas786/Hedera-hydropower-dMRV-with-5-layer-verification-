/**
 * The demo plants registered by `deploy/01_setup_hydro_registry.ts`. These integers are the output of the
 * methodology engine for the designs in `packages/nextjs/services/mrv/demo.ts` (VMR0017 v1.0 with ACM0002 v22.0,
 * VT0011 combined margin, TOOL03 diesel coefficient, crediting periods); `designHash` is the SHA-256 of each design
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
      efGridGPerMwh: 573_378,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAt: 0,
      creditingStart: 1_767_225_600,
      creditingEnd: 1_987_977_600,
      designHash: "0x4e49cf6d78fcc1e42a1a0e0839a5210801e41613c0e2620672893e91983f26cf",
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
      efGridGPerMwh: 524_404,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAt: 0,
      creditingStart: 1_772_323_200,
      creditingEnd: 1_993_075_200,
      designHash: "0xfeeb57c92e8f179888fef2f1e8ee8d34e6af56b9ccdc5ad59b1558a8d399ea22",
    },
  },
];
