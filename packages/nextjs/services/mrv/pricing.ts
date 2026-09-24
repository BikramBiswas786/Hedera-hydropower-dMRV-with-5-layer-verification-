const WEIBAR_PER_HBAR = 10n ** 18n;
const SLIPPAGE_BPS = 100n;

/** Parses a user-entered MWh amount into REC base units (kWh). Returns null for invalid or non-positive input. */
export function mwhToUnits(input: string): bigint | null {
  if (!/^\d+(\.\d{1,3})?$/.test(input.trim())) return null;
  const [whole, fraction = ""] = input.trim().split(".");
  const units = BigInt(whole) * 1_000n + BigInt(fraction.padEnd(3, "0"));
  return units > 0n ? units : null;
}

/** Parses a USD price per MWh into cents. */
export function usdToCents(input: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, fraction = ""] = input.trim().split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents > 0n ? cents : null;
}

/**
 * The contract quotes in the units `msg.value` has inside the EVM: tinybar (1e8/HBAR) on Hedera, wei on a local
 * chain. JSON-RPC `value` is always 18-decimal, so scale up, then add a 1% buffer for price moves between quote
 * and execution. The contract refunds anything above the exact cost.
 */
export function quoteToTxValue(quote: bigint, nativeUnitsPerHbar: bigint): bigint {
  const weibar = (quote * WEIBAR_PER_HBAR) / nativeUnitsPerHbar;
  return weibar + (weibar * SLIPPAGE_BPS) / 10_000n;
}

export function formatHbar(nativeAmount: bigint, nativeUnitsPerHbar: bigint): string {
  return (Number(nativeAmount) / Number(nativeUnitsPerHbar)).toLocaleString("en-US", { maximumFractionDigits: 4 });
}
