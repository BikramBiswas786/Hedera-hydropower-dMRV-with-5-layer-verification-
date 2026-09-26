import type { RegisteredDesign } from "./methodology/project";
import { type Address, type Hex, decodeAbiParameters, hexToString, stringToHex, zeroHash } from "viem";

/** Plant ids are short ASCII labels stored as bytes32 on-chain. */
export const plantIdToBytes32 = (label: string): Hex => stringToHex(label, { size: 32 });
export const bytes32ToPlantId = (id: Hex): string => hexToString(id, { size: 32 }).replace(/\0+$/, "");

export const topicIdFromNum = (num: bigint): string | null => (num === 0n ? null : `0.0.${num}`);

/** Credits use 3 decimals: 1 unit = 1 kg CO2e, 1 token = 1 t CO2e. */
export const formatTonnes = (kgUnits: bigint | number) =>
  (Number(kgUnits) / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 });
/** Grams → tonnes, for emission quantities stored in g CO2e. */
export const formatGramsAsTonnes = (grams: bigint | number) =>
  (Number(grams) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const formatWhAsMwh = (wh: bigint | number) =>
  (Number(wh) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 });
/** Hashes are shortened for display; other audit values are shown as they are. */
export const shortHashOr = (value: string | number | null | undefined) =>
  typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)
    ? `${value.slice(0, 10)}…${value.slice(-6)}`
    : String(value ?? "—");
export const formatUsdCents = (cents: bigint | number) =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export type AttestationView = {
  id: number;
  plantId: string;
  periodStart: number;
  periodEnd: number;
  netEnergyWh: number;
  grossEnergyWh: number;
  fuelG: number;
  projectEnergyWh: number;
  baselineG: number;
  reservoirG: number;
  fossilFuelG: number;
  leakageG: number;
  reductionG: number;
  unitsMinted: number;
  completenessBps: number;
  reportHash: Hex;
  hcsTopicId: string | null;
  hcsSequence: number;
  verifier: Address;
  timestamp: number;
  /** DmrvRegistry only: the meter that signed, and external evidence the VVB relied on (null when none). */
  meter?: Address | null;
  evidenceHash?: Hex | null;
  /** Which contract recorded it. */
  registry?: "dmrv" | "legacy";
};

/** Legacy HydroCreditRegistry (5b7fe3f) attestation struct, as returned by `getAttestation(s)`. */
export type RawAttestation = {
  plantId: Hex;
  periodStart: bigint;
  periodEnd: bigint;
  netEnergyWh: bigint;
  grossEnergyWh: bigint;
  fuelG: bigint;
  projectEnergyWh: bigint;
  baselineG: bigint;
  reservoirG: bigint;
  fossilFuelG: bigint;
  leakageG: bigint;
  reductionG: bigint;
  unitsMinted: bigint;
  completenessBps: number;
  reportHash: Hex;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  verifier: Address;
  timestamp: bigint;
};

export function toAttestationView(raw: RawAttestation, id: number): AttestationView {
  return {
    id,
    plantId: bytes32ToPlantId(raw.plantId),
    periodStart: Number(raw.periodStart),
    periodEnd: Number(raw.periodEnd),
    netEnergyWh: Number(raw.netEnergyWh),
    grossEnergyWh: Number(raw.grossEnergyWh),
    fuelG: Number(raw.fuelG),
    projectEnergyWh: Number(raw.projectEnergyWh),
    baselineG: Number(raw.baselineG),
    reservoirG: Number(raw.reservoirG),
    fossilFuelG: Number(raw.fossilFuelG),
    leakageG: Number(raw.leakageG),
    reductionG: Number(raw.reductionG),
    unitsMinted: Number(raw.unitsMinted),
    completenessBps: raw.completenessBps,
    reportHash: raw.reportHash,
    hcsTopicId: topicIdFromNum(raw.hcsTopicNum),
    hcsSequence: Number(raw.hcsSequence),
    verifier: raw.verifier,
    timestamp: Number(raw.timestamp),
    registry: "legacy",
  };
}

// ─── DmrvRegistry (phase 1) ────────────────────────────────────────────────

const ENERGY_TYPES = [{ type: "int64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }] as const;
const BREAKDOWN_TYPES = [
  { type: "uint32" },
  { type: "int256" },
  { type: "int256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "int256" },
  { type: "uint256" },
  { type: "int256" },
] as const;

export const HYDRO_PARAMS_TYPES = [
  {
    type: "tuple",
    components: [
      { name: "projectType", type: "uint8" },
      { name: "methodology", type: "uint8" },
      { name: "capacityKw", type: "uint32" },
      { name: "baselineCapacityKw", type: "uint32" },
      { name: "reservoirAreaM2", type: "uint64" },
      { name: "baselineReservoirAreaM2", type: "uint64" },
      { name: "efGridGPerMwh", type: "uint32" },
      { name: "fuelCoefGPerTonne", type: "uint32" },
      { name: "baselineWh", type: "uint64" },
      { name: "baselineEndsAt", type: "uint64" },
      { name: "creditingStart", type: "uint64" },
      { name: "creditingEnd", type: "uint64" },
      { name: "registrationRequestedAt", type: "uint64" },
      { name: "calibrationValidUntil", type: "uint64" },
      { name: "meteringHash", type: "bytes32" },
      { name: "designHash", type: "bytes32" },
    ],
  },
] as const;

export function decodeEnergy(bytes: Hex) {
  const [netWh, grossWh, fuelG, leakageG] = decodeAbiParameters(ENERGY_TYPES, bytes);
  return { netWh: Number(netWh), grossWh: Number(grossWh), fuelG: Number(fuelG), leakageG: Number(leakageG) };
}

/** `HydroVmr0017Module.quantify` breakdown: crediting year, EG_PJ, BE, PE_HP, PE_FF, LE, ER, units, balance after. */
export function decodeBreakdown(bytes: Hex) {
  const [creditingYear, projectWh, baselineG, reservoirG, fossilG, leakageG, reductionG, units, balanceG] =
    decodeAbiParameters(BREAKDOWN_TYPES, bytes);
  return {
    creditingYear,
    projectWh: Number(projectWh),
    baselineG: Number(baselineG),
    reservoirG: Number(reservoirG),
    fossilG: Number(fossilG),
    leakageG: Number(leakageG),
    reductionG: Number(reductionG),
    units: Number(units),
    balanceG: Number(balanceG),
  };
}

export type HydroParams = RegisteredDesign & {
  registrationRequestedAt: number;
  calibrationValidUntil: number;
  meteringHash: Hex;
  designHash: Hex;
};

export function decodeHydroParams(params: Hex): HydroParams {
  const [p] = decodeAbiParameters(HYDRO_PARAMS_TYPES, params);
  return {
    projectType: p.projectType,
    methodology: p.methodology,
    capacityKw: p.capacityKw,
    baselineCapacityKw: p.baselineCapacityKw,
    reservoirAreaM2: Number(p.reservoirAreaM2),
    baselineReservoirAreaM2: Number(p.baselineReservoirAreaM2),
    efGridGPerMwh: p.efGridGPerMwh,
    fuelCoefGPerTonne: p.fuelCoefGPerTonne,
    baselineWh: Number(p.baselineWh),
    baselineEndsAt: Number(p.baselineEndsAt),
    creditingStart: Number(p.creditingStart),
    creditingEnd: Number(p.creditingEnd),
    registrationRequestedAt: Number(p.registrationRequestedAt),
    calibrationValidUntil: Number(p.calibrationValidUntil),
    meteringHash: p.meteringHash,
    designHash: p.designHash,
  };
}

/** The design integers the engine compares with a plant profile (the hydro params minus metering fields). */
export function registeredDesignOf(p: HydroParams): RegisteredDesign {
  return {
    projectType: p.projectType,
    methodology: p.methodology,
    capacityKw: p.capacityKw,
    baselineCapacityKw: p.baselineCapacityKw,
    reservoirAreaM2: p.reservoirAreaM2,
    baselineReservoirAreaM2: p.baselineReservoirAreaM2,
    efGridGPerMwh: p.efGridGPerMwh,
    fuelCoefGPerTonne: p.fuelCoefGPerTonne,
    baselineWh: p.baselineWh,
    baselineEndsAt: p.baselineEndsAt,
    creditingStart: p.creditingStart,
    creditingEnd: p.creditingEnd,
    registrationRequestedAt: p.registrationRequestedAt,
  };
}

/** DmrvRegistry `Attestation` struct. */
export type RawDmrvAttestation = {
  projectId: Hex;
  periodStart: bigint;
  periodEnd: bigint;
  reductionG: bigint;
  unitsMinted: bigint;
  completenessBps: number;
  verifier: Address;
  meter: Address;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  timestamp: bigint;
  reportHash: Hex;
  readingsDigest: Hex;
  evidenceHash: Hex;
  verified: Hex;
  breakdown: Hex;
};

export function toDmrvAttestationView(raw: RawDmrvAttestation, id: number): AttestationView {
  const energy = decodeEnergy(raw.verified);
  const b = decodeBreakdown(raw.breakdown);
  return {
    id,
    plantId: bytes32ToPlantId(raw.projectId),
    periodStart: Number(raw.periodStart),
    periodEnd: Number(raw.periodEnd),
    netEnergyWh: energy.netWh,
    grossEnergyWh: energy.grossWh,
    fuelG: energy.fuelG,
    projectEnergyWh: b.projectWh,
    baselineG: b.baselineG,
    reservoirG: b.reservoirG,
    fossilFuelG: b.fossilG,
    leakageG: b.leakageG,
    reductionG: Number(raw.reductionG),
    unitsMinted: Number(raw.unitsMinted),
    completenessBps: raw.completenessBps,
    reportHash: raw.reportHash,
    hcsTopicId: topicIdFromNum(raw.hcsTopicNum),
    hcsSequence: Number(raw.hcsSequence),
    verifier: raw.verifier,
    timestamp: Number(raw.timestamp),
    meter: raw.meter,
    evidenceHash: raw.evidenceHash === zeroHash ? null : raw.evidenceHash,
    registry: "dmrv",
  };
}

/** DmrvRegistry `Project` struct. */
export type RawProject = {
  operator: Address;
  meter: Address;
  module: Address;
  active: boolean;
  creditingPeriods: number;
  attestations: number;
  creditingStart: bigint;
  creditingEnd: bigint;
  lastPeriodEnd: bigint;
  calibrationValidUntil: bigint;
  registrationRequestedAt: bigint;
  balanceG: bigint;
  issuedUnits: bigint;
  state: Hex;
  designHash: Hex;
  params: Hex;
};

/** The hydro module's ledger word: crediting year (32 bits) | year net Wh (int112) | balance g (int112). */
export function decodeHydroState(state: Hex) {
  const word = BigInt(state);
  const mask = (1n << 112n) - 1n;
  const signed = (v: bigint) => (v >= 1n << 111n ? v - (1n << 112n) : v);
  return { creditingYear: Number(word >> 224n), yearNetWh: Number(signed((word >> 112n) & mask)) };
}

/** PE_HP rate the module applies (VMR0017 or CDM), mirrored for display only. */
function reservoirRateOf(p: HydroParams): number {
  const addedArea = p.reservoirAreaM2 - p.baselineReservoirAreaM2;
  if (addedArea <= 0) return 0;
  const addedW = Math.max(0, p.capacityKw - p.baselineCapacityKw) * 1_000;
  if (addedW > 10 * addedArea || addedW <= 4 * addedArea) return 0;
  return p.methodology === 1 ? 100_000 : 90_000;
}

export function toProjectView(
  id: Hex,
  raw: RawProject,
  name = bytes32ToPlantId(id),
): PlantView & {
  module: Address;
  creditingPeriods: number;
  calibrationValidUntil: number;
  registrationRequestedAt: number;
  meteringHash: Hex;
} {
  const params = decodeHydroParams(raw.params);
  const state = decodeHydroState(raw.state);
  return {
    plantId: bytes32ToPlantId(id),
    name,
    operator: raw.operator,
    meter: raw.meter,
    active: raw.active,
    design: registeredDesignOf(params),
    designHash: raw.designHash,
    reservoirGPerMwh: reservoirRateOf(params),
    ledger: {
      attestations: raw.attestations,
      balanceG: Number(raw.balanceG),
      creditingYear: state.creditingYear,
      yearNetWh: state.yearNetWh,
    },
    lastPeriodEnd: Number(raw.lastPeriodEnd),
    totalNetWh: 0,
    issuedUnits: Number(raw.issuedUnits),
    module: raw.module,
    creditingPeriods: raw.creditingPeriods,
    calibrationValidUntil: Number(raw.calibrationValidUntil),
    registrationRequestedAt: Number(raw.registrationRequestedAt),
    meteringHash: params.meteringHash,
  };
}

type RawDesign = {
  projectType: number;
  /** Absent on registries deployed before VMR0017, which only knew the CDM rules. */
  methodology?: number;
  capacityKw: number;
  baselineCapacityKw: number;
  reservoirAreaM2: bigint;
  baselineReservoirAreaM2: bigint;
  efGridGPerMwh: number;
  fuelCoefGPerTonne: number;
  baselineWh: bigint;
  baselineEndsAt: bigint;
  creditingStart: bigint;
  creditingEnd: bigint;
  designHash: Hex;
};

/** Plant struct as returned by `getPlant`. */
export type RawPlant = {
  name: string;
  operator: Address;
  /** Absent on registries deployed before meter statements were checked on-chain. */
  meter?: Address;
  active: boolean;
  design: RawDesign;
  reservoirGPerMwh: number;
  attestations: number;
  creditingYear: number;
  yearNetWh: bigint;
  balanceG: bigint;
  lastPeriodEnd: bigint;
  totalNetWh: bigint;
  issuedUnits: bigint;
};

export type PlantView = {
  plantId: string;
  name: string;
  operator: Address;
  /** The data logger whose signature every attestation must carry; null on registries that predate it. */
  meter: Address | null;
  active: boolean;
  design: RegisteredDesign;
  designHash: Hex;
  reservoirGPerMwh: number;
  ledger: { attestations: number; balanceG: number; creditingYear: number; yearNetWh: number };
  lastPeriodEnd: number;
  totalNetWh: number;
  issuedUnits: number;
};

export function toPlantView(id: Hex, raw: RawPlant): PlantView {
  const d = raw.design;
  return {
    plantId: bytes32ToPlantId(id),
    name: raw.name,
    operator: raw.operator,
    meter: raw.meter ?? null,
    active: raw.active,
    design: {
      projectType: d.projectType,
      methodology: d.methodology ?? 0,
      capacityKw: d.capacityKw,
      baselineCapacityKw: d.baselineCapacityKw,
      reservoirAreaM2: Number(d.reservoirAreaM2),
      baselineReservoirAreaM2: Number(d.baselineReservoirAreaM2),
      efGridGPerMwh: d.efGridGPerMwh,
      fuelCoefGPerTonne: d.fuelCoefGPerTonne,
      baselineWh: Number(d.baselineWh),
      baselineEndsAt: Number(d.baselineEndsAt),
      creditingStart: Number(d.creditingStart),
      creditingEnd: Number(d.creditingEnd),
    },
    designHash: d.designHash,
    reservoirGPerMwh: raw.reservoirGPerMwh,
    ledger: {
      attestations: raw.attestations,
      balanceG: Number(raw.balanceG),
      creditingYear: raw.creditingYear,
      yearNetWh: Number(raw.yearNetWh),
    },
    lastPeriodEnd: Number(raw.lastPeriodEnd),
    totalNetWh: Number(raw.totalNetWh),
    issuedUnits: Number(raw.issuedUnits),
  };
}

export type ListingView = {
  id: number;
  seller: Address;
  unitsAvailable: number;
  priceUsdCentsPerTonne: number;
  active: boolean;
};

export type RawListing = { seller: Address; unitsAvailable: bigint; priceUsdCentsPerTonne: bigint; active: boolean };

export function toListingView(raw: RawListing, id: number): ListingView {
  return {
    id,
    seller: raw.seller,
    unitsAvailable: Number(raw.unitsAvailable),
    priceUsdCentsPerTonne: Number(raw.priceUsdCentsPerTonne),
    active: raw.active,
  };
}

export type RawRetirement = {
  account: Address;
  units: bigint;
  timestamp: bigint;
  beneficiary: string;
  certificateSerial: bigint;
  certificateDelivered: boolean;
};

export type RetirementView = {
  id: number;
  account: Address;
  units: number;
  timestamp: number;
  beneficiary: string;
  /** 0 when the registry had no certificate collection at retirement time. */
  certificateSerial: number;
  certificateDelivered: boolean;
};

export function toRetirementView(raw: RawRetirement, id: number): RetirementView {
  return {
    id,
    account: raw.account,
    units: Number(raw.units),
    timestamp: Number(raw.timestamp),
    beneficiary: raw.beneficiary,
    certificateSerial: Number(raw.certificateSerial),
    certificateDelivered: raw.certificateDelivered,
  };
}
