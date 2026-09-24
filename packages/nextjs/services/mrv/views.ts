import { type Address, type Hex, hexToString, stringToHex } from "viem";

/** Plant ids are short ASCII labels stored as bytes32 on-chain. */
export const plantIdToBytes32 = (label: string): Hex => stringToHex(label, { size: 32 });
export const bytes32ToPlantId = (id: Hex): string => hexToString(id, { size: 32 }).replace(/\0+$/, "");

export const topicIdFromNum = (num: bigint): string | null => (num === 0n ? null : `0.0.${num}`);

/** RECs use 3 decimals: 1 unit = 1 kWh, 1 token = 1 MWh. */
export const formatMwh = (kwhUnits: bigint | number) =>
  (Number(kwhUnits) / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const formatUsdCents = (cents: bigint | number) =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export type AttestationView = {
  id: number;
  plantId: string;
  periodStart: number;
  periodEnd: number;
  energyWh: number;
  unitsMinted: number;
  trustScoreBps: number;
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
  energyWh: bigint;
  unitsMinted: bigint;
  trustScoreBps: number;
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
    energyWh: Number(raw.energyWh),
    unitsMinted: Number(raw.unitsMinted),
    trustScoreBps: raw.trustScoreBps,
    reportHash: raw.reportHash,
    hcsTopicId: topicIdFromNum(raw.hcsTopicNum),
    hcsSequence: Number(raw.hcsSequence),
    verifier: raw.verifier,
    timestamp: Number(raw.timestamp),
  };
}

export type PlantView = {
  plantId: string;
  name: string;
  operator: Address;
  capacityKw: number;
  active: boolean;
  lastPeriodEnd: number;
  certifiedWh: number;
};

type RawPlant = {
  name: string;
  operator: Address;
  capacityKw: number;
  active: boolean;
  lastPeriodEnd: bigint;
  certifiedWh: bigint;
};

export function toPlantView(id: Hex, raw: RawPlant): PlantView {
  return {
    plantId: bytes32ToPlantId(id),
    name: raw.name,
    operator: raw.operator,
    capacityKw: raw.capacityKw,
    active: raw.active,
    lastPeriodEnd: Number(raw.lastPeriodEnd),
    certifiedWh: Number(raw.certifiedWh),
  };
}

export type ListingView = {
  id: number;
  seller: Address;
  unitsAvailable: number;
  priceUsdCentsPerMwh: number;
  active: boolean;
};

export type RawListing = { seller: Address; unitsAvailable: bigint; priceUsdCentsPerMwh: bigint; active: boolean };

export function toListingView(raw: RawListing, id: number): ListingView {
  return {
    id,
    seller: raw.seller,
    unitsAvailable: Number(raw.unitsAvailable),
    priceUsdCentsPerMwh: Number(raw.priceUsdCentsPerMwh),
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
