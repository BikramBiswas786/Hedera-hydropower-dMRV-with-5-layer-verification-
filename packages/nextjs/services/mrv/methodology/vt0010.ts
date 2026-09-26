/**
 * VT0010 v1.1 equation (5), project electricity consumption.
 * PE = EC × EF × (1 + TDL). The default TDL for a project load is 20% (2 000 bps).
 * Result is grams of CO2e, rounded up.
 *
 * The registry does not apply this term. It nets import against export inside EG_facility,
 * which is the same electricity at TDL = 0. `projectElectricityG` is the missing piece,
 * available to a monitoring record; it is not subtracted again in `quantify`.
 */
export function projectElectricityG(ecWh: bigint, efGPerMwh: bigint, tdlBps = 2_000n): bigint {
  if (ecWh < 0n || efGPerMwh < 0n || tdlBps < 0n) {
    throw new Error("VT0010 inputs must be zero or positive");
  }
  const numerator = ecWh * efGPerMwh * (10_000n + tdlBps);
  const denominator = 10_000n * 1_000_000n;
  return (numerator + denominator - 1n) / denominator;
}
