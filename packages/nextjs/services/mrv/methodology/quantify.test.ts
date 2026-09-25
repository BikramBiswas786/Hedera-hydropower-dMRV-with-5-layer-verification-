import { QUANTIFICATION_VECTORS } from "../../../../hardhat/test/fixtures/quantificationVectors";
import { CREDITING_YEAR_SECONDS, PROJECT_TYPE_CODE, type RegisteredDesign } from "./project";
import {
  EMPTY_LEDGER,
  type MonitoredQuantities,
  type PlantLedger,
  ceilDiv,
  floorDiv,
  quantifyPeriod,
} from "./quantify";
import { describe, expect, it } from "vitest";

const START = Date.parse("2026-01-01T00:00:00Z") / 1_000;
const DAY = 86_400;

const greenfield: RegisteredDesign = {
  projectType: PROJECT_TYPE_CODE.greenfield,
  methodology: 0,
  capacityKw: 12_000,
  baselineCapacityKw: 0,
  reservoirAreaM2: 0,
  baselineReservoirAreaM2: 0,
  efGridGPerMwh: 615_447,
  fuelCoefGPerTonne: 3_238_840,
  baselineWh: 0,
  baselineEndsAt: 0,
  creditingStart: START,
  creditingEnd: START + 7 * CREDITING_YEAR_SECONDS,
};

const period = (day: number, overrides: Partial<MonitoredQuantities> = {}): MonitoredQuantities => ({
  periodStart: START + day * DAY,
  periodEnd: START + (day + 1) * DAY,
  netWh: 0n,
  grossWh: 0n,
  fuelG: 0n,
  leakageG: 0n,
  ...overrides,
});

describe("integer helpers", () => {
  it("floorDiv rounds toward −∞ and ceilDiv toward +∞", () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(floorDiv(-8n, 2n)).toBe(-4n);
    expect(ceilDiv(7n, 2n)).toBe(4n);
    expect(ceilDiv(8n, 2n)).toBe(4n);
  });
});

describe("quantifyPeriod — greenfield", () => {
  it("BE = EG_PJ × EF_grid,CM, rounded down; 1 base unit = 1 kg; remainder carried", () => {
    const q = quantifyPeriod(greenfield, EMPTY_LEDGER, period(0, { netWh: 1_234_567n }));
    // 1 234 567 Wh × 615 447 g/MWh / 10⁶ = 759 810.56 g → 759 810 g
    expect(q.egProjectWh).toBe(1_234_567n);
    expect(q.baselineG).toBe(759_810n);
    expect(q.reductionG).toBe(759_810n);
    expect(q.unitsMinted).toBe(759n);
    expect(q.ledger).toEqual({ attestations: 1, balanceG: 810n, creditingYear: 0, yearNetWh: 1_234_567n });
  });

  it("PE_HP = EF_Res × TEG and PE_FF = FC × COEF, both rounded up", () => {
    const reservoir = { ...greenfield, reservoirAreaM2: 1_800_000 }; // PD = 6.67 W/m²
    const q = quantifyPeriod(
      reservoir,
      EMPTY_LEDGER,
      period(0, { netWh: 10_000_000n, grossWh: 1_234_567n, fuelG: 1n }),
    );
    expect(q.reservoirG).toBe(111_112n); // 1.234567 MWh × 90 000 g/MWh = 111 111.03
    expect(q.fossilFuelG).toBe(4n); // 1 g × 3.23884 = 3.2 g
    expect(q.baselineG).toBe(6_154_470n);
    expect(q.reductionG).toBe(6_154_470n - 111_112n - 4n);
  });

  it("75 kg of diesel is 242.913 kg CO2 (TOOL03)", () => {
    const q = quantifyPeriod(greenfield, EMPTY_LEDGER, period(0, { fuelG: 75_000n }));
    expect(q.fossilFuelG).toBe(242_913n);
  });

  it("subtracts leakage and carries a deficit into later periods", () => {
    const first = quantifyPeriod(greenfield, EMPTY_LEDGER, period(0, { netWh: -500_000n, leakageG: 10n }));
    expect(first.baselineG).toBe(-307_724n); // −307 723.5 rounded down
    expect(first.reductionG).toBe(-307_734n);
    expect(first.unitsMinted).toBe(0n);
    expect(first.ledger.balanceG).toBe(-307_734n);

    const second = quantifyPeriod(greenfield, first.ledger, period(1, { netWh: 1_000_000n }));
    expect(second.reductionG).toBe(615_447n);
    expect(second.unitsMinted).toBe(307n); // (615 447 − 307 734) / 1 000
    expect(second.ledger.balanceG).toBe(713n);
  });
});

describe("quantifyPeriod — retrofit and capacity addition", () => {
  const retrofit: RegisteredDesign = {
    ...greenfield,
    projectType: PROJECT_TYPE_CODE.retrofit,
    baselineCapacityKw: 8_000,
    baselineWh: 10_000_000, // EG_historical + σ = 10 MWh per crediting year
    baselineEndsAt: START + 400 * DAY,
  };

  it("credits only generation above the annual baseline, as the year accumulates", () => {
    let ledger: PlantLedger = EMPTY_LEDGER;
    const eg: bigint[] = [];
    for (const [day, netWh] of [
      [0, 6_000_000n],
      [1, 6_000_000n],
      [2, 3_000_000n],
      [3, -1_000_000n],
    ] as const) {
      const q = quantifyPeriod(retrofit, ledger, period(day, { netWh }));
      eg.push(q.egProjectWh);
      ledger = q.ledger;
    }
    expect(eg).toEqual([0n, 2_000_000n, 3_000_000n, -1_000_000n]);
    expect(ledger.yearNetWh).toBe(14_000_000n);
  });

  it("restarts the baseline count in each crediting year", () => {
    const late = quantifyPeriod(retrofit, EMPTY_LEDGER, period(364, { netWh: 12_000_000n }));
    expect(late.egProjectWh).toBe(2_000_000n);
    const nextYear = quantifyPeriod(retrofit, late.ledger, period(365, { netWh: 6_000_000n }));
    expect(nextYear.creditingYear).toBe(1);
    expect(nextYear.egProjectWh).toBe(0n);
    expect(nextYear.ledger.yearNetWh).toBe(6_000_000n);
  });

  it("credits nothing once DATE_BaselineRetrofit has passed", () => {
    const q = quantifyPeriod(retrofit, EMPTY_LEDGER, period(400, { netWh: 50_000_000n }));
    expect(q.egProjectWh).toBe(0n);
    expect(q.reductionG).toBe(0n);
  });
});

describe("quantifyPeriod — refusals the contract mirrors", () => {
  it("rejects periods outside the crediting period or across a crediting year", () => {
    expect(() => quantifyPeriod(greenfield, EMPTY_LEDGER, period(-1))).toThrow(/outside the registered/);
    expect(() => quantifyPeriod(greenfield, EMPTY_LEDGER, period(7 * 365))).toThrow(/outside the registered/);
    const crossing = { ...period(364), periodEnd: START + 366 * DAY };
    expect(() => quantifyPeriod(greenfield, EMPTY_LEDGER, crossing)).toThrow(/crosses from crediting year 1 into 2/);
  });

  it("rejects fuel use when no fuel coefficient is registered", () => {
    expect(() =>
      quantifyPeriod({ ...greenfield, fuelCoefGPerTonne: 0 }, EMPTY_LEDGER, period(0, { fuelG: 1n })),
    ).toThrow(/TOOL03/);
  });
});

describe("shared vectors (the contract test asserts the same numbers)", () => {
  for (const vector of QUANTIFICATION_VECTORS) {
    it(vector.name, () => {
      const { baselineEndsAtDay, ...integers } = vector.design;
      const design: RegisteredDesign = {
        ...integers,
        baselineEndsAt: baselineEndsAtDay === null ? 0 : START + baselineEndsAtDay * DAY,
        creditingStart: START,
        creditingEnd: START + 7 * CREDITING_YEAR_SECONDS,
      };
      let ledger: PlantLedger = EMPTY_LEDGER;
      for (const p of vector.periods) {
        const q = quantifyPeriod(design, ledger, {
          ...period(p.startDay),
          netWh: BigInt(p.netWh),
          grossWh: BigInt(p.grossWh),
          fuelG: BigInt(p.fuelG),
          leakageG: BigInt(p.leakageG),
        });
        expect({
          egProjectWh: Number(q.egProjectWh),
          baselineG: Number(q.baselineG),
          reservoirG: Number(q.reservoirG),
          fossilFuelG: Number(q.fossilFuelG),
          leakageG: Number(q.leakageG),
          reductionG: Number(q.reductionG),
          unitsMinted: Number(q.unitsMinted),
          balanceG: Number(q.ledger.balanceG),
        }).toEqual(p.expected);
        ledger = q.ledger;
      }
    });
  }
});
