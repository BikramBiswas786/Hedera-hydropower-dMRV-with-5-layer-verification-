/**
 * Reserve maths for a V1 pair whose USD token has 6 decimals and whose WHBAR has 8.
 * The purchase builder reads the pair stored on `CreditMarket`, not the mainnet WHBAR/USDC pair.
 * These constants are the mainnet pair, kept so the reserve formula stays pinned to a published snapshot.
 */
export const SAUCERSWAP_PAIR_ID = "0.0.1462797";
export const SAUCERSWAP_PAIR = "0xdb34c1ef944883f0e5a2fc18b6c1978b088bd31d" as const;
export const SAUCERSWAP_USDC = "0x000000000000000000000000000000000006f89a";
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
