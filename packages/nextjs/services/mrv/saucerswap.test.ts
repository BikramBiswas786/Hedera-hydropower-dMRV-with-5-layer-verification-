import {
  amountIn,
  amountOut,
  deviationBps,
  dexAccepted,
  hbarUsd8FromReserves,
  isqrt,
  rebalanceTrade,
  tinybarPerTonne,
} from "./saucerswap";
import { describe, expect, it } from "vitest";

describe("SaucerSwap WHBAR/USDC spot", () => {
  it("prices the mainnet reserves at 8 decimals", () => {
    // Reserves read from pair 0.0.1462797. USDC is token0.
    expect(hbarUsd8FromReserves(269_466_084_778n, 284_484_651_742_462n)).toBe(9_472_078n);
    expect(deviationBps(9_436_767n, 9_472_078n)).toBe(37n);
  });

  it("accepts the exact 3% bound and refuses one basis point past it", () => {
    expect(dexAccepted(10_000n, 10_300n)).toBe(true);
    expect(dexAccepted(10_000n, 10_301n)).toBe(false);
  });
});

describe("keeping a seeded pair at the oracle price", () => {
  // The testnet exhibit pair on 28 Sep 2026: $0.09105 against Chainlink $0.09479, 411 bps apart.
  const whbar = 2_000_000_000n; // 20 HBAR
  const usd = (whbar * 9_105_000n) / 10_000_000_000n; // priced at $0.09105

  it("leaves a pair inside the band alone", () => {
    expect(rebalanceTrade(usd, whbar, 9_110_000n)).toEqual({ side: "none", deviationBps: 5n });
  });

  it("sells the USD token when the pair prices HBAR below the oracle, and lands within a few bps", () => {
    const trade = rebalanceTrade(usd, whbar, 9_479_000n);
    expect(trade.side).toBe("usdIn");
    if (trade.side !== "usdIn") return;
    const out = amountOut(trade.amountIn, usd, whbar);
    const after = hbarUsd8FromReserves(usd + trade.amountIn, whbar - out);
    expect(deviationBps(9_479_000n, after)).toBeLessThanOrEqual(3n);
  });

  it("sells HBAR when the pair prices HBAR above the oracle, and lands within a few bps", () => {
    const trade = rebalanceTrade(usd, whbar, 8_700_000n);
    expect(trade.side).toBe("hbarIn");
    if (trade.side !== "hbarIn") return;
    const out = amountOut(trade.amountIn, whbar, usd);
    const after = hbarUsd8FromReserves(usd - out, whbar + trade.amountIn);
    expect(deviationBps(8_700_000n, after)).toBeLessThanOrEqual(3n);
  });

  it("takes exact integer square roots", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(10n ** 30n)).toBe(10n ** 15n);
  });
});

describe("credit-pool amountIn", () => {
  it("is the inverse of amountOut, plus the +1 rounding", () => {
    const reserveIn = 27_000_000n;
    const reserveOut = 2_000n;
    const want = 10n;
    const pay = amountIn(want, reserveIn, reserveOut);
    expect(amountOut(pay, reserveIn, reserveOut)).toBeGreaterThanOrEqual(want);
    expect(amountOut(pay - 1n, reserveIn, reserveOut)).toBeLessThan(want);
  });

  it("prices a tonne from WHBAR/kg reserves", () => {
    expect(tinybarPerTonne(27_016_595_21n, 200n)).toBe((27_016_595_21n * 1_000n) / 200n);
    expect(tinybarPerTonne(1n, 0n)).toBe(0n);
  });
});
