/**
 * Shared test vectors for the emission-reduction arithmetic. `HydroCreditRegistry.test.ts` checks the contract
 * against them and `services/mrv/methodology/quantify.test.ts` checks the TypeScript mirror, so the two
 * implementations cannot drift apart. Days are offsets from the crediting start; each period lasts one day.
 *
 * Hand checks (EF 615 447 g/MWh, EF_Res 90 000 g/MWh, diesel COEF 3 238 840 g/t):
 *   1 234 567 Wh × 0.615447 = 759 810.56 → BE 759 810 (down); 1 300 000 Wh × 0.09 = 117 000 PE_HP;
 *   75 kg × 3.23884 = 242 913 PE_FF; 1 g × 3.23884 → 4 (up); retrofit: 10 MWh baseline, 6 + 6 + 3 − 1 MWh
 *   accumulates to EG_PJ 0, 2, 3, −1 MWh; the next crediting year restarts; after DATE_BaselineRetrofit, 0.
 *
 * VMR0017 (EF_Res 100 000 g/MWh, EF_embodied 21 000 g/MWh, LE rounded up, never on negative energy):
 *   1 234 567 Wh × 0.1 → 130 000 PE_HP for 1 300 000 Wh TEG; 1 234 567 Wh × 0.021 = 25 925.9 → LE 25 926;
 *   ER = 759 810 − 130 000 − 25 926 = 603 884; an import-only day has LE 0; the capacity addition pays LE on
 *   EG_PJ_Add (2 MWh → 42 000 g) only; the retrofit has no embodied-emission equation (LE 0).
 */
export type VectorPeriod = {
  startDay: number;
  netWh: number;
  grossWh: number;
  fuelG: number;
  leakageG: number;
  expected: {
    egProjectWh: number;
    baselineG: number;
    reservoirG: number;
    fossilFuelG: number;
    /** LE_y: monitored leakage plus VMR0017 embodied emissions. */
    leakageG: number;
    reductionG: number;
    unitsMinted: number;
    balanceG: number;
  };
};

export type QuantificationVector = {
  name: string;
  design: {
    projectType: number;
    /** 0 = CDM, 1 = VMR0017. */
    methodology: number;
    capacityKw: number;
    baselineCapacityKw: number;
    reservoirAreaM2: number;
    baselineReservoirAreaM2: number;
    efGridGPerMwh: number;
    fuelCoefGPerTonne: number;
    baselineWh: number;
    /** DATE_BaselineRetrofit as a day offset, or null. */
    baselineEndsAtDay: number | null;
  };
  periods: VectorPeriod[];
};

const e = (
  egProjectWh: number,
  baselineG: number,
  reservoirG: number,
  fossilFuelG: number,
  reductionG: number,
  unitsMinted: number,
  balanceG: number,
  leakageG = 0,
) => ({ egProjectWh, baselineG, reservoirG, fossilFuelG, leakageG, reductionG, unitsMinted, balanceG });

export const QUANTIFICATION_VECTORS: QuantificationVector[] = [
  {
    name: "greenfield with a new reservoir (PD 6.67 W/m²) and a diesel generator",
    design: {
      projectType: 0,
      methodology: 0,
      capacityKw: 12_000,
      baselineCapacityKw: 0,
      reservoirAreaM2: 1_800_000,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAtDay: null,
    },
    periods: [
      {
        startDay: 0,
        netWh: 1_234_567,
        grossWh: 1_300_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(1_234_567, 759_810, 117_000, 0, 642_810, 642, 810),
      },
      {
        startDay: 1,
        netWh: -500_000,
        grossWh: 0,
        fuelG: 75_000,
        leakageG: 0,
        expected: e(-500_000, -307_724, 0, 242_913, -550_637, 0, -549_827),
      },
      {
        startDay: 2,
        netWh: 2_000_000,
        grossWh: 2_100_000,
        fuelG: 1,
        leakageG: 10,
        expected: e(2_000_000, 1_230_894, 189_000, 4, 1_041_880, 492, 53, 10),
      },
    ],
  },
  {
    name: "retrofit credited above EG_historical + σ per crediting year",
    design: {
      projectType: 1,
      methodology: 0,
      capacityKw: 12_000,
      baselineCapacityKw: 8_000,
      reservoirAreaM2: 0,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 10_000_000,
      baselineEndsAtDay: 380,
    },
    periods: [
      { startDay: 0, netWh: 6_000_000, grossWh: 6_100_000, fuelG: 0, leakageG: 0, expected: e(0, 0, 0, 0, 0, 0, 0) },
      {
        startDay: 1,
        netWh: 6_000_000,
        grossWh: 6_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(2_000_000, 1_230_894, 0, 0, 1_230_894, 1_230, 894),
      },
      {
        startDay: 2,
        netWh: 3_000_000,
        grossWh: 3_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(3_000_000, 1_846_341, 0, 0, 1_846_341, 1_847, 235),
      },
      {
        startDay: 3,
        netWh: -1_000_000,
        grossWh: 0,
        fuelG: 0,
        leakageG: 0,
        expected: e(-1_000_000, -615_447, 0, 0, -615_447, 0, -615_212),
      },
      {
        startDay: 365,
        netWh: 12_000_000,
        grossWh: 12_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(2_000_000, 1_230_894, 0, 0, 1_230_894, 615, 682),
      },
      {
        startDay: 381,
        netWh: 50_000_000,
        grossWh: 50_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(0, 0, 0, 0, 0, 0, 682),
      },
    ],
  },
  {
    name: "VMR0017 greenfield: EF_Res 100 kg/MWh and embodied-emission leakage",
    design: {
      projectType: 0,
      methodology: 1,
      capacityKw: 12_000,
      baselineCapacityKw: 0,
      reservoirAreaM2: 1_800_000,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 0,
      baselineEndsAtDay: null,
    },
    periods: [
      {
        startDay: 0,
        netWh: 1_234_567,
        grossWh: 1_300_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(1_234_567, 759_810, 130_000, 0, 603_884, 603, 884, 25_926),
      },
      {
        startDay: 1,
        netWh: -500_000,
        grossWh: 0,
        fuelG: 75_000,
        leakageG: 0,
        expected: e(-500_000, -307_724, 0, 242_913, -550_637, 0, -549_753, 0),
      },
      {
        startDay: 2,
        netWh: 2_000_000,
        grossWh: 2_100_000,
        fuelG: 1,
        leakageG: 10,
        expected: e(2_000_000, 1_230_894, 210_000, 4, 978_880, 429, 127, 42_010),
      },
    ],
  },
  {
    name: "VMR0017 capacity addition: embodied emissions on the added generation only",
    design: {
      projectType: 2,
      methodology: 1,
      capacityKw: 12_000,
      baselineCapacityKw: 8_000,
      reservoirAreaM2: 0,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 10_000_000,
      baselineEndsAtDay: 380,
    },
    periods: [
      { startDay: 0, netWh: 6_000_000, grossWh: 6_100_000, fuelG: 0, leakageG: 0, expected: e(0, 0, 0, 0, 0, 0, 0) },
      {
        startDay: 1,
        netWh: 6_000_000,
        grossWh: 6_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(2_000_000, 1_230_894, 0, 0, 1_188_894, 1_188, 894, 42_000),
      },
      {
        startDay: 2,
        netWh: -1_000_000,
        grossWh: 0,
        fuelG: 0,
        leakageG: 0,
        expected: e(-1_000_000, -615_447, 0, 0, -615_447, 0, -614_553, 0),
      },
    ],
  },
  {
    name: "VMR0017 retrofit: no embodied-emission equation, so LE = 0",
    design: {
      projectType: 1,
      methodology: 1,
      capacityKw: 12_000,
      baselineCapacityKw: 8_000,
      reservoirAreaM2: 0,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
      baselineWh: 10_000_000,
      baselineEndsAtDay: 380,
    },
    periods: [
      {
        startDay: 0,
        netWh: 12_000_000,
        grossWh: 12_100_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(2_000_000, 1_230_894, 0, 0, 1_230_894, 1_230, 894, 0),
      },
    ],
  },
];
