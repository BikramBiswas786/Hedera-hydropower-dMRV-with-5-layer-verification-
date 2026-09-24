import { formatHbar, mwhToUnits, quoteToTxValue, usdToCents } from "./pricing";
import { describe, expect, it } from "vitest";

describe("market input parsing", () => {
  it("converts MWh to kWh units without floating point", () => {
    expect(mwhToUnits("1")).toBe(1_000n);
    expect(mwhToUnits("0.401")).toBe(401n);
    expect(mwhToUnits("12.5")).toBe(12_500n);
  });

  it("rejects zero, negatives, and sub-kWh precision", () => {
    for (const bad of ["0", "-1", "1.0001", "abc", ""]) expect(mwhToUnits(bad)).toBeNull();
  });

  it("converts USD to cents", () => {
    expect(usdToCents("12.5")).toBe(1_250n);
    expect(usdToCents("0.01")).toBe(1n);
    expect(usdToCents("1.001")).toBeNull();
  });
});

describe("quoteToTxValue", () => {
  it("scales tinybar quotes to 18-decimal JSON-RPC value with a 1% buffer on Hedera", () => {
    const twentyHbarInTinybar = 20n * 10n ** 8n;
    expect(quoteToTxValue(twentyHbarInTinybar, 10n ** 8n)).toBe(20n * 10n ** 18n + 2n * 10n ** 17n);
  });

  it("leaves wei quotes unscaled on a local chain", () => {
    expect(quoteToTxValue(10n ** 18n, 10n ** 18n)).toBe(10n ** 18n + 10n ** 16n);
  });

  it("formats native amounts as HBAR", () => {
    expect(formatHbar(2_050_000_000n, 10n ** 8n)).toBe("20.5");
  });
});
