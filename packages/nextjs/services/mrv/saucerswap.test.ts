import { deviationBps, hbarUsd8FromReserves } from "./saucerswap";
import { describe, expect, it } from "vitest";

describe("SaucerSwap WHBAR/USDC spot", () => {
  it("prices the mainnet reserves at 8 decimals", () => {
    // Reserves read from pair 0.0.1462797. USDC is token0.
    expect(hbarUsd8FromReserves(269_466_084_778n, 284_484_651_742_462n)).toBe(9_472_078n);
  });

  it("uses the contract's deviation formula", () => {
    expect(deviationBps(9_436_767n, 9_472_078n)).toBe(37n);
    expect(deviationBps(9_436_767n, 9_472_078n) < 300n).toBe(true);
    expect(deviationBps(10_000n, 10_400n)).toBe(400n);
  });
});
