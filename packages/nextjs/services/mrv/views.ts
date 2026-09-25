import type { RegisteredDesign } from "./methodology/project";
import { type Address, type Hex, hexToString, stringToHex } from "viem";

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
};

/** Attestation struct as returned by `getAttestation(s)`. */
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
