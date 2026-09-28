import { MethodologyError } from "./errors";
import { CREDITING_YEAR_SECONDS } from "./project";
import { G_PER_UNIT, type MonitoredQuantities, type PlantLedger, ceilDiv, floorDiv } from "./quantify";
import { type Hex, encodeAbiParameters } from "viem";

/**
 * TypeScript twin of `RenewableVmr0017Module.sol`: greenfield grid-connected solar, wind and ocean power under CDM
 * ACM0002 / AMS-I.D or Verra VMR0017 v1.0. Pure integer arithmetic; it must equal the module to the gram, which
 * `packages/hardhat/test/fixtures/renewableVectors.ts` pins for both.
 *
 *   BE_y = EG_PJ,y × EF_grid,CM,y                 ACM0002 eq. 1-2, rounded down (EG_PJ = EG_facility, greenfield)
 *   PE_y = PE_FF,y                                TOOL03, rounded up; no PE_HP or PE_GP for these technologies
 *   LE_y = EG_facility,y × EF_embodied × 10⁻³     VMR0017 §8.3 eq. 19, rounded up, never on net import; CDM: 0
 *   ER_y = BE_y − PE_y − LE_y                     VMR0017 §8.4 eq. 17
 *
 * EF_embodied (VMR0017 §9.1, NREL 2021): solar PV 43, wind 13, ocean energy 8 g CO2e/kWh.
 * Applicability (VMR0017 §4 Table 1, superseding the VCS default eligibility): wind and solar at any capacity in
 * low-, lower-middle- and upper-middle-income countries; wave and tidal globally. Geothermal, BESS, retrofits and
 * capacity additions are not covered by this module.
 */

export const RENEWABLE_METHODOLOGY_ID = "renewable/acm0002+vmr0017";

export const TECHNOLOGY_CODE = {
  "solar-pv": 0,
  "floating-solar": 1,
  "wind-onshore": 2,
  "wind-offshore": 3,
  wave: 4,
  tidal: 5,
} as const;

export const INCOME_GROUP_CODE = { low: 0, "lower-middle": 1, "upper-middle": 2, high: 3 } as const;

const METHODOLOGY = { cdm: 0, vmr0017: 1 } as const;
const MAX_GRID_EF_G_PER_MWH = 2_000_000;
const WH_PER_MWH = 1_000_000n;
const G_PER_TONNE = 1_000_000n;
const VCS_FIVE_YEAR_FROM = 1_798_761_600;

export type RenewableDesign = {
  /** 0 = CDM ACM0002 / AMS-I.D, 1 = VMR0017. */
  methodology: number;
  technology: number;
  incomeGroup: number;
  capacityKw: number;
  efGridGPerMwh: number;
  fuelCoefGPerTonne: number;
  creditingStart: number;
  creditingEnd: number;
  registrationRequestedAt: number;
  calibrationValidUntil: number;
  meteringHash: Hex;
  designHash: Hex;
};

/** EF_embodied in g CO2e/MWh (VMR0017 §9.1); 0 under the CDM. */
export function renewableEmbodiedGPerMwh(methodology: number, technology: number): number {
  if (methodology !== METHODOLOGY.vmr0017) return 0;
  if (technology <= TECHNOLOGY_CODE["floating-solar"]) return 43_000;
  if (technology <= TECHNOLOGY_CODE["wind-offshore"]) return 13_000;
  return 8_000;
}

/** Every reason `validateProject` would revert, in words. Empty means the module accepts the design. */
export function renewableDesignErrors(d: RenewableDesign, now: number): string[] {
  const errors: string[] = [];
  if (d.methodology > 1 || d.technology > 5 || d.incomeGroup > 3 || d.capacityKw <= 0) {
    errors.push("Unknown methodology, technology or income group, or zero capacity");
  }
  if (d.efGridGPerMwh <= 0 || d.efGridGPerMwh > MAX_GRID_EF_G_PER_MWH) {
    errors.push(`Grid emission factor ${d.efGridGPerMwh} g/MWh is outside (0, 2 t/MWh]`);
  }
  if (
    d.methodology === METHODOLOGY.vmr0017 &&
    d.technology <= TECHNOLOGY_CODE["wind-offshore"] &&
    d.incomeGroup === INCOME_GROUP_CODE.high
  ) {
    errors.push("VMR0017 Table 1: wind and solar are applicable in low- and middle-income countries only");
  }
  if (d.registrationRequestedAt === 0) errors.push("The registration request date is required");
  else if (d.registrationRequestedAt > now) errors.push("The registration request is in the future");
  if (d.calibrationValidUntil <= d.creditingStart)
    errors.push("Meter calibration must be valid after the crediting start");
  const span = d.creditingEnd - d.creditingStart;
  const years = span / CREDITING_YEAR_SECONDS;
  if (![5, 7, 10].includes(years)) errors.push("The crediting period must be 5, 7 or 10 crediting years");
  else if (d.methodology === METHODOLOGY.vmr0017 && d.registrationRequestedAt >= VCS_FIVE_YEAR_FROM && years !== 5) {
    errors.push("VCS v5: a registration requested on or after 1 January 2027 gets a 5-year crediting period");
  }
  return errors;
}

export type RenewableQuantification = {
  creditingYear: number;
  egProjectWh: bigint;
  baselineG: bigint;
  fossilFuelG: bigint;
  /** LE_y: the monitored leakage plus the embodied emissions. */
  leakageG: bigint;
  reductionG: bigint;
  unitsMinted: bigint;
  ledger: PlantLedger;
};

export function quantifyRenewablePeriod(
  design: RenewableDesign,
  ledger: PlantLedger,
  monitored: MonitoredQuantities,
): RenewableQuantification {
  const { periodStart, periodEnd } = monitored;
  if (periodEnd <= periodStart || periodStart < design.creditingStart) {
    throw new MethodologyError("The monitoring period is empty or starts before the crediting period");
  }
  const creditingYear = Math.floor((periodStart - design.creditingStart) / CREDITING_YEAR_SECONDS);
  if (creditingYear !== Math.floor((periodEnd - 1 - design.creditingStart) / CREDITING_YEAR_SECONDS)) {
    throw new MethodologyError("The monitoring period crosses a crediting year");
  }
  if (monitored.fuelG > 0n && design.fuelCoefGPerTonne === 0) {
    throw new MethodologyError("Fossil fuel was burnt but the registered design has no fuel coefficient (TOOL03)");
  }

  const yearBefore = creditingYear === ledger.creditingYear ? ledger.yearNetWh : 0n;
  const egProjectWh = monitored.netWh;
  const baselineG = floorDiv(egProjectWh * BigInt(design.efGridGPerMwh), WH_PER_MWH);
  const fossilFuelG = ceilDiv(monitored.fuelG * BigInt(design.fuelCoefGPerTonne), G_PER_TONNE);
  const embodiedBasis = egProjectWh > 0n ? egProjectWh : 0n;
  const embodiedG = ceilDiv(
    embodiedBasis * BigInt(renewableEmbodiedGPerMwh(design.methodology, design.technology)),
    WH_PER_MWH,
  );
  const leakageG = monitored.leakageG + embodiedG;
  const reductionG = baselineG - fossilFuelG - leakageG;

  const balance = ledger.balanceG + reductionG;
  const unitsMinted = balance > 0n ? balance / G_PER_UNIT : 0n;
  return {
    creditingYear,
    egProjectWh,
    baselineG,
    fossilFuelG,
    leakageG,
    reductionG,
    unitsMinted,
    ledger: {
      attestations: ledger.attestations + 1,
      balanceG: balance - unitsMinted * G_PER_UNIT,
      creditingYear,
      yearNetWh: yearBefore + monitored.netWh,
    },
  };
}

const PARAMS_TUPLE = [
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
] as const;

/** The `params` bytes `DmrvRegistry.registerProject` passes to the module. */
export function encodeRenewableParams(d: RenewableDesign): Hex {
  return encodeAbiParameters(PARAMS_TUPLE, [
    {
      ...d,
      creditingStart: BigInt(d.creditingStart),
      creditingEnd: BigInt(d.creditingEnd),
      registrationRequestedAt: BigInt(d.registrationRequestedAt),
      calibrationValidUntil: BigInt(d.calibrationValidUntil),
    },
  ]);
}
