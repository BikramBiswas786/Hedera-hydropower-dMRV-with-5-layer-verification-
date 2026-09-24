import { MethodologyError } from "./errors";
import { CREDITING_YEAR_SECONDS, PROJECT_TYPE_CODE, type RegisteredDesign, powerDensity } from "./project";

/**
 * Emission reductions for one monitoring period, in integers, exactly as `HydroCreditRegistry.submitAttestation`
 * computes them. The report anchored on HCS and the on-chain record therefore agree to the gram.
 *
 *   EG_PJ,y = EG_facility,y                                                   greenfield
 *   EG_PJ,y = EG_facility,y − (EG_historical + σ_historical)                  retrofit / capacity addition,
 *             until DATE_BaselineRetrofit, then 0                             applied cumulatively per crediting year
 *   BE_y    = EG_PJ,y × EF_grid,CM,y                                          rounded down
 *   PE_y    = PE_FF,y + PE_HP,y                                               rounded up
 *             PE_FF,y = FC_y × COEF (TOOL03)      PE_HP,y = EF_Res × TEG_y when 4 < PD ≤ 10
 *   LE_y    = 0                                                               (ACM0002; AMS-I.D without transfer)
 *   ER_y    = BE_y − PE_y − LE_y
 *
 * Units: energy in Wh, emissions in g CO2e, EF in g CO2/MWh, fuel in g, COEF in g CO2/t fuel.
 * 1 credit = 1 t CO2e; the HTS token has 3 decimals, so 1 base unit = 1 kg CO2e = 1 000 g.
 */

export const G_PER_UNIT = 1_000n;
const WH_PER_MWH = 1_000_000n;
const G_PER_TONNE = 1_000_000n;

/** Per-plant state carried between monitoring periods, mirrored from the contract. */
export type PlantLedger = {
  /** Attestations already recorded for the plant; a report is only valid against this exact count. */
  attestations: number;
  /** Unissued emission reductions (g): a sub-kg remainder, or a deficit carried forward when negative. */
  balanceG: bigint;
  creditingYear: number;
  /** EG_facility,y accumulated in the current crediting year (Wh). */
  yearNetWh: bigint;
};

export const EMPTY_LEDGER: PlantLedger = { attestations: 0, balanceG: 0n, creditingYear: 0, yearNetWh: 0n };

export type MonitoredQuantities = {
  periodStart: number;
  periodEnd: number;
  /** EG_facility: net electricity supplied to the grid (export − import) after QA/QC. May be negative. */
  netWh: bigint;
  /** TEG: total generation at the generator terminals, for reservoir emissions. */
  grossWh: bigint;
  /** FC: on-site fossil fuel burnt. */
  fuelG: bigint;
  /** LE: leakage, zero under ACM0002 and under AMS-I.D without transferred equipment. */
  leakageG: bigint;
};

export type Quantification = {
  creditingYear: number;
  egProjectWh: bigint;
  baselineG: bigint;
  reservoirG: bigint;
  fossilFuelG: bigint;
  leakageG: bigint;
  reductionG: bigint;
  unitsMinted: bigint;
  ledger: PlantLedger;
};

/** Integer division rounding toward −∞ (Solidity and BigInt both truncate toward zero). */
export const floorDiv = (a: bigint, b: bigint) => (a < 0n && a % b !== 0n ? a / b - 1n : a / b);
export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const max0 = (a: bigint) => (a > 0n ? a : 0n);

/** Returns why a period cannot be credited, or null. The contract reverts with the same conditions. */
export function creditingPeriodViolation(design: RegisteredDesign, periodStart: number, periodEnd: number) {
  if (periodEnd <= periodStart) return "The monitoring period is empty";
  if (periodStart < design.creditingStart || periodEnd > design.creditingEnd) {
    return "The monitoring period is outside the registered crediting period";
  }
  const first = Math.floor((periodStart - design.creditingStart) / CREDITING_YEAR_SECONDS);
  const last = Math.floor((periodEnd - 1 - design.creditingStart) / CREDITING_YEAR_SECONDS);
  if (first !== last) return `The monitoring period crosses from crediting year ${first + 1} into ${last + 1}`;
  return null;
}

export function reservoirRateGPerMwh(design: RegisteredDesign): bigint {
  return BigInt(powerDensity(design).peHpGPerMwh);
}

export function quantifyPeriod(
  design: RegisteredDesign,
  ledger: PlantLedger,
  monitored: MonitoredQuantities,
): Quantification {
  const violation = creditingPeriodViolation(design, monitored.periodStart, monitored.periodEnd);
  if (violation) throw new MethodologyError(violation);
  if (monitored.fuelG > 0n && design.fuelCoefGPerTonne === 0) {
    throw new MethodologyError("Fossil fuel was burnt but the registered design has no fuel coefficient (TOOL03)");
  }

  const creditingYear = Math.floor((monitored.periodStart - design.creditingStart) / CREDITING_YEAR_SECONDS);
  const yearBefore = creditingYear === ledger.creditingYear ? ledger.yearNetWh : 0n;
  const yearAfter = yearBefore + monitored.netWh;

  let egProjectWh: bigint;
  if (design.projectType === PROJECT_TYPE_CODE.greenfield) {
    egProjectWh = monitored.netWh;
  } else if (design.baselineEndsAt !== 0 && monitored.periodEnd > design.baselineEndsAt) {
    egProjectWh = 0n;
  } else {
    // The annual equation max(EG_facility,y − EG_BL, 0) applied as the year accumulates: nothing is credited
    // until the year's generation passes the historical level, and never more than the annual excess.
    const baseline = BigInt(design.baselineWh);
    egProjectWh = max0(yearAfter - baseline) - max0(yearBefore - baseline);
  }

  const baselineG = floorDiv(egProjectWh * BigInt(design.efGridGPerMwh), WH_PER_MWH);
  const reservoirG = ceilDiv(monitored.grossWh * reservoirRateGPerMwh(design), WH_PER_MWH);
  const fossilFuelG = ceilDiv(monitored.fuelG * BigInt(design.fuelCoefGPerTonne), G_PER_TONNE);
  const reductionG = baselineG - reservoirG - fossilFuelG - monitored.leakageG;

  const balance = ledger.balanceG + reductionG;
  const unitsMinted = balance > 0n ? balance / G_PER_UNIT : 0n;

  return {
    creditingYear,
    egProjectWh,
    baselineG,
    reservoirG,
    fossilFuelG,
    leakageG: monitored.leakageG,
    reductionG,
    unitsMinted,
    ledger: {
      attestations: ledger.attestations + 1,
      balanceG: balance - unitsMinted * G_PER_UNIT,
      creditingYear,
      yearNetWh: yearAfter,
    },
  };
}
