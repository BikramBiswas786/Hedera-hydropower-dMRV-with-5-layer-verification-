/**
 * Shared vectors for `RenewableVmr0017Module` (solar, wind, ocean). `RenewableVmr0017Module.test.ts` checks the
 * contract and `services/mrv/methodology/renewable.test.ts` checks the TypeScript twin against the same integers.
 * Days are offsets from the crediting start; each period lasts one day.
 *
 * Hand checks:
 *   Solar PV, VMR0017 (EF_grid 615 447 g/MWh, EF_embodied 43 g/kWh, diesel COEF 3 238 840 g/t):
 *     day 0: 1 234 567 Wh × 0.615447 = 759 810.56 → BE 759 810 (down); × 0.043 = 53 086.38 → LE 53 087 (up);
 *            ER 706 723 → 706 units, 723 g carried.
 *     day 1: import 5 000 Wh → BE floor(−3 077.235) = −3 078; 75 kg diesel × 3.23884 = 242 913 PE_FF; LE 0 on
 *            negative export; ER −245 991 → balance −245 268, no units.
 *     day 2: 2 000 000 Wh → BE 1 230 894, LE 86 000, ER 1 144 894 → balance 899 626 → 899 units, 626 g carried.
 *   Wind onshore, VMR0017 (EF 800 000, EF_embodied 13 g/kWh): 1 000 001 Wh → BE floor(800 000.8) = 800 000,
 *     LE ceil(13 000.013) = 13 001, ER 786 999 → 786 units, 999 g.
 *   Solar PV, CDM ACM0002 / AMS-I.D (no embodied leakage): BE 759 810 = ER → 759 units, 810 g.
 *   Tidal, VMR0017, high-income host (ocean energy is global; EF 500 000, EF_embodied 8 g/kWh): 3 333 333 Wh →
 *     BE floor(1 666 666.5) = 1 666 666, LE ceil(26 666.664) = 26 667, ER 1 639 999 → 1 639 units, 999 g.
 */
export type RenewableVectorPeriod = {
  startDay: number;
  netWh: number;
  grossWh: number;
  fuelG: number;
  leakageG: number;
  expected: {
    baselineG: number;
    fossilFuelG: number;
    leakageG: number;
    reductionG: number;
    unitsMinted: number;
    balanceG: number;
  };
};

export type RenewableVector = {
  name: string;
  design: {
    /** 0 = CDM ACM0002 / AMS-I.D, 1 = VMR0017. */
    methodology: number;
    /** 0 solar PV, 1 floating solar, 2 wind onshore, 3 wind offshore, 4 wave, 5 tidal. */
    technology: number;
    /** World Bank group of the host country: 0 low, 1 lower-middle, 2 upper-middle, 3 high. */
    incomeGroup: number;
    capacityKw: number;
    efGridGPerMwh: number;
    fuelCoefGPerTonne: number;
  };
  periods: RenewableVectorPeriod[];
};

const e = (
  baselineG: number,
  fossilFuelG: number,
  leakageG: number,
  reductionG: number,
  unitsMinted: number,
  balanceG: number,
) => ({ baselineG, fossilFuelG, leakageG, reductionG, unitsMinted, balanceG });

export const RENEWABLE_VECTORS: RenewableVector[] = [
  {
    name: "VMR0017 solar PV with an import day and diesel backup",
    design: {
      methodology: 1,
      technology: 0,
      incomeGroup: 1,
      capacityKw: 5_000,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 3_238_840,
    },
    periods: [
      {
        startDay: 0,
        netWh: 1_234_567,
        grossWh: 1_300_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(759_810, 0, 53_087, 706_723, 706, 723),
      },
      {
        startDay: 1,
        netWh: -5_000,
        grossWh: 0,
        fuelG: 75_000,
        leakageG: 0,
        expected: e(-3_078, 242_913, 0, -245_991, 0, -245_268),
      },
      {
        startDay: 2,
        netWh: 2_000_000,
        grossWh: 2_050_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(1_230_894, 0, 86_000, 1_144_894, 899, 626),
      },
    ],
  },
  {
    name: "VMR0017 onshore wind",
    design: {
      methodology: 1,
      technology: 2,
      incomeGroup: 0,
      capacityKw: 5_000,
      efGridGPerMwh: 800_000,
      fuelCoefGPerTonne: 0,
    },
    periods: [
      {
        startDay: 0,
        netWh: 1_000_001,
        grossWh: 1_010_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(800_000, 0, 13_001, 786_999, 786, 999),
      },
    ],
  },
  {
    name: "CDM ACM0002 / AMS-I.D solar PV (no embodied leakage)",
    design: {
      methodology: 0,
      technology: 0,
      incomeGroup: 3,
      capacityKw: 5_000,
      efGridGPerMwh: 615_447,
      fuelCoefGPerTonne: 0,
    },
    periods: [
      {
        startDay: 0,
        netWh: 1_234_567,
        grossWh: 1_300_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(759_810, 0, 0, 759_810, 759, 810),
      },
    ],
  },
  {
    name: "VMR0017 tidal in a high-income country",
    design: {
      methodology: 1,
      technology: 5,
      incomeGroup: 3,
      capacityKw: 5_000,
      efGridGPerMwh: 500_000,
      fuelCoefGPerTonne: 0,
    },
    periods: [
      {
        startDay: 0,
        netWh: 3_333_333,
        grossWh: 3_400_000,
        fuelG: 0,
        leakageG: 0,
        expected: e(1_666_666, 0, 26_667, 1_639_999, 1_639, 999),
      },
    ],
  },
];
