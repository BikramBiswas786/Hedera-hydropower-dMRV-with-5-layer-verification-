import { RENEWABLE_VECTORS } from "../../../../hardhat/test/fixtures/renewableVectors";
import { CREDITING_YEAR_SECONDS } from "./project";
import { EMPTY_LEDGER } from "./quantify";
import {
  INCOME_GROUP_CODE,
  type RenewableDesign,
  TECHNOLOGY_CODE,
  encodeRenewableParams,
  quantifyRenewablePeriod,
  renewableDesignErrors,
  renewableEmbodiedGPerMwh,
} from "./renewable";
import { decodeAbiParameters, keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";

const START = 1_780_000_000;
const DAY = 86_400;

function design(overrides: Partial<RenewableDesign> = {}): RenewableDesign {
  return {
    methodology: 1,
    technology: TECHNOLOGY_CODE["solar-pv"],
    incomeGroup: INCOME_GROUP_CODE["lower-middle"],
    capacityKw: 5_000,
    efGridGPerMwh: 615_447,
    fuelCoefGPerTonne: 3_238_840,
    creditingStart: START,
    creditingEnd: START + 7 * CREDITING_YEAR_SECONDS,
    registrationRequestedAt: START,
    calibrationValidUntil: START + 7 * CREDITING_YEAR_SECONDS,
    meteringHash: keccak256(toHex("metering")),
    designHash: keccak256(toHex("design")),
    ...overrides,
  };
}

describe("renewable module twin: shared vectors", () => {
  for (const vector of RENEWABLE_VECTORS) {
    it(vector.name, () => {
      const d = design(vector.design);
      let ledger = EMPTY_LEDGER;
      for (const p of vector.periods) {
        const periodStart = START + p.startDay * DAY;
        const q = quantifyRenewablePeriod(d, ledger, {
          periodStart,
          periodEnd: periodStart + DAY,
          netWh: BigInt(p.netWh),
          grossWh: BigInt(p.grossWh),
          fuelG: BigInt(p.fuelG),
          leakageG: BigInt(p.leakageG),
        });
        expect({
          baselineG: Number(q.baselineG),
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

describe("renewable module twin: rules", () => {
  it("uses VMR0017's embodied factors per technology and none under the CDM", () => {
    expect(renewableEmbodiedGPerMwh(1, TECHNOLOGY_CODE["solar-pv"])).toBe(43_000);
    expect(renewableEmbodiedGPerMwh(1, TECHNOLOGY_CODE["floating-solar"])).toBe(43_000);
    expect(renewableEmbodiedGPerMwh(1, TECHNOLOGY_CODE["wind-offshore"])).toBe(13_000);
    expect(renewableEmbodiedGPerMwh(1, TECHNOLOGY_CODE.wave)).toBe(8_000);
    expect(renewableEmbodiedGPerMwh(0, TECHNOLOGY_CODE["solar-pv"])).toBe(0);
  });

  it("refuses VMR0017 wind and solar in a high-income country, but not tidal or the CDM", () => {
    const now = START + DAY;
    expect(renewableDesignErrors(design({ incomeGroup: INCOME_GROUP_CODE.high }), now)).toContain(
      "VMR0017 Table 1: wind and solar are applicable in low- and middle-income countries only",
    );
    expect(renewableDesignErrors(design({ incomeGroup: 3, technology: TECHNOLOGY_CODE.tidal }), now)).toEqual([]);
    expect(renewableDesignErrors(design({ incomeGroup: 3, methodology: 0 }), now)).toEqual([]);
  });

  it("requires a 5-year period for VMR0017 registrations requested from 2027 and a past request date", () => {
    const requested = 1_798_761_600;
    const seven = design({
      registrationRequestedAt: requested,
      creditingStart: requested,
      creditingEnd: requested + 7 * CREDITING_YEAR_SECONDS,
      calibrationValidUntil: requested + 7 * CREDITING_YEAR_SECONDS,
    });
    expect(renewableDesignErrors(seven, requested + DAY).join(" ")).toContain("5-year crediting period");
    expect(renewableDesignErrors(design(), START - 1).join(" ")).toContain("in the future");
  });

  it("refuses fuel without a registered TOOL03 coefficient and a period across crediting years", () => {
    const d = design({ fuelCoefGPerTonne: 0 });
    const base = { netWh: 1n, grossWh: 1n, leakageG: 0n };
    expect(() =>
      quantifyRenewablePeriod(d, EMPTY_LEDGER, { ...base, fuelG: 1n, periodStart: START, periodEnd: START + DAY }),
    ).toThrow(/TOOL03/);
    const edge = START + CREDITING_YEAR_SECONDS;
    expect(() =>
      quantifyRenewablePeriod(d, EMPTY_LEDGER, { ...base, fuelG: 0n, periodStart: edge - DAY, periodEnd: edge + 1 }),
    ).toThrow(/crosses/);
  });

  it("encodes params in the module's tuple layout", () => {
    const d = design();
    const [decoded] = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "methodology", type: "uint8" },
            { name: "technology", type: "uint8" },
            { name: "incomeGroup", type: "uint8" },
            { name: "capacityKw", type: "uint32" },
            { name: "efGridGPerMwh", type: "uint32" },
            { name: "fuelCoefGPerTonne", type: "uint32" },
            { name: "creditingStart", type: "uint64" },
            { name: "creditingEnd", type: "uint64" },
            { name: "registrationRequestedAt", type: "uint64" },
            { name: "calibrationValidUntil", type: "uint64" },
            { name: "meteringHash", type: "bytes32" },
            { name: "designHash", type: "bytes32" },
          ],
        },
      ],
      encodeRenewableParams(d),
    );
    expect(decoded.efGridGPerMwh).toBe(615_447);
    expect(decoded.creditingEnd).toBe(BigInt(d.creditingEnd));
    expect(decoded.designHash).toBe(d.designHash);
  });
});
