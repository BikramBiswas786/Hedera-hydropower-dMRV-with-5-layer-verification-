/**
 * Reserve maths for a V1 pair whose USD token has 6 decimals and whose WHBAR has 8.
 * The purchase builder reads the pair stored on `CreditMarket`, and also this public mainnet pair.
 * Testnet USDC is not a dollar, so the public testnet pair cannot be the mainnet check.
 */
export const SAUCERSWAP_PAIR_ID = "0.0.1462797" as const;
export const SAUCERSWAP_PAIR = "0xdb34c1ef944883f0e5a2fc18b6c1978b088bd31d" as const;
/** Same bound as `ResilientHbarUsdFeed.MAX_DEVIATION_BPS`. */
export const SAUCERSWAP_MAX_DEVIATION_BPS = 300n;

/** HBAR/USD with 8 decimals, the same scale as the Chainlink answer. */
export function hbarUsd8FromReserves(reserveUsdc: bigint, reserveWhbar: bigint): bigint {
  if (reserveWhbar <= 0n || reserveUsdc <= 0n) return 0n;
  return (reserveUsdc * 10_000_000_000n) / reserveWhbar;
}

/** `(high − low) / low`, in basis points. Matches the feed contract. */
export function deviationBps(a: bigint, b: bigint): bigint {
  if (a <= 0n || b <= 0n) return 10_000n;
  const high = a > b ? a : b;
  const low = a > b ? b : a;
  return ((high - low) * 10_000n) / low;
}

/** True when the two 8-decimal prices are within the feed's own band, including the exact bound. */
export function dexAccepted(oracle8: bigint, dex8: bigint, maxBps: bigint = SAUCERSWAP_MAX_DEVIATION_BPS): boolean {
  return deviationBps(oracle8, dex8) <= maxBps;
}

/** Integer square root (floor). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** V1 constant-product output for `amountIn`, after the pair's fee (SaucerSwap V1: 30 bps). */
export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = 30n): bigint {
  const inWithFee = amountIn * (10_000n - feeBps);
  return (inWithFee * reserveOut) / (reserveIn * 10_000n + inWithFee);
}

/** Tinybar the buyer must send to take `amountOut` of the other reserve, after the 30 bps fee. Inverse of `amountOut`. */
export function amountIn(amountOutWanted: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = 30n): bigint {
  if (amountOutWanted <= 0n || reserveIn <= 0n || amountOutWanted >= reserveOut) {
    throw new RangeError("amountIn: insufficient liquidity");
  }
  const numerator = reserveIn * amountOutWanted * 10_000n;
  const denominator = (reserveOut - amountOutWanted) * (10_000n - feeBps);
  return numerator / denominator + 1n;
}

/** Spot tinybar per tonne (1 000 kg) from a WHBAR (8 decimals) / credit (kg) pool. */
export function tinybarPerTonne(reserveWhbar: bigint, reserveCreditKg: bigint): bigint {
  if (reserveCreditKg <= 0n) return 0n;
  return (reserveWhbar * 1_000n) / reserveCreditKg;
}

export type RebalanceTrade =
  | { side: "none"; deviationBps: bigint }
  /** The pair prices HBAR below the oracle: sell `amountIn` USD-token units for HBAR. */
  | { side: "usdIn"; amountIn: bigint; deviationBps: bigint }
  /** The pair prices HBAR above the oracle: sell `amountIn` tinybar for the USD token. */
  | { side: "hbarIn"; amountIn: bigint; deviationBps: bigint };

/**
 * The one swap that brings a V1 WHBAR (8 decimals) / USD-token (6 decimals) pair to `oracle8`, the 8-decimal USD
 * price of one HBAR, holding the constant product and grossing the input up for the fee. None when the pair is
 * already within `withinBps`. Used by the testnet keeper that holds the seeded exhibit pair at the oracle price.
 */
export function rebalanceTrade(
  reserveUsd: bigint,
  reserveWhbar: bigint,
  oracle8: bigint,
  withinBps = 50n,
  feeBps = 30n,
): RebalanceTrade {
  const pool8 = hbarUsd8FromReserves(reserveUsd, reserveWhbar);
  const deviation = deviationBps(oracle8, pool8);
  if (deviation <= withinBps) return { side: "none", deviationBps: deviation };
  const k = reserveUsd * reserveWhbar;
  if (pool8 < oracle8) {
    const targetUsd = isqrt((k * oracle8) / 10_000_000_000n);
    return {
      side: "usdIn",
      amountIn: ((targetUsd - reserveUsd) * 10_000n) / (10_000n - feeBps),
      deviationBps: deviation,
    };
  }
  const targetWhbar = isqrt((k * 10_000_000_000n) / oracle8);
  return {
    side: "hbarIn",
    amountIn: ((targetWhbar - reserveWhbar) * 10_000n) / (10_000n - feeBps),
    deviationBps: deviation,
  };
}
