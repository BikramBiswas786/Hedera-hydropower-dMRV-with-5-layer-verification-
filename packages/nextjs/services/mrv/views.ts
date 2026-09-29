import type { RegisteredDesign } from "./methodology/project";
import { type Address, type Hex, decodeAbiParameters, hexToString, stringToHex, zeroAddress, zeroHash } from "viem";

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

// ─── DmrvRegistry ───────────────────────────────────────────────────────────

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
      { name: "hostCountry", type: "bytes2" },
      { name: "capacityKw", type: "uint32" },
      { name: "authorizedCapacityKw", type: "uint32" },
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
    hostCountry: hexToString(p.hostCountry, { size: 2 }).replace(/\0+$/, ""),
    capacityKw: p.capacityKw,
    authorizedCapacityKw: p.authorizedCapacityKw,
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
    hostCountry: p.hostCountry,
    capacityKw: p.capacityKw,
    authorizedCapacityKw: p.authorizedCapacityKw,
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

/** Where a monitoring record stands: awaiting verification, or closed by an approving or rejecting verification. */
export type RecordStatus = "monitored" | "issued" | "rejected";

/**
 * One monitoring record (`DmrvRegistry.Attestation`): a meter-signed period the module quantified. It issues nothing
 * by itself; a VVB's verification of a run of records does (`IssuanceView`).
 */
export type AttestationView = {
  id: number;
  plantId: string;
  /** The record's number within its project (0, 1, …); verifications cover contiguous runs of these. */
  sequence: number;
  periodStart: number;
  periodEnd: number;
  netEnergyWh: number;
  grossEnergyWh: number;
  fuelG: number;
  leakageInputG: number;
  creditingYear: number;
  projectEnergyWh: number;
  baselineG: number;
  reservoirG: number;
  fossilFuelG: number;
  /** LE: monitored leakage plus the embodied-emissions term. */
  leakageG: number;
  reductionG: number;
  /** Σ ER over the project's records up to this one. */
  cumulativeG: number;
  /** Whole tonnes (in kg units) the module's running balance reached with this record; issuance happens later. */
  unitsAtRecord: number;
  completenessBps: number;
  meter: Address;
  reportHash: Hex;
  readingsDigest: Hex;
  /** Head of the project's record hash chain after this record. */
  chainHash: Hex;
  /** Module-encoded figures the record quantified (hydro: `Energy`). */
  verified: Hex;
  hcsTopicId: string | null;
  hcsSequence: number;
  timestamp: number;
  status: RecordStatus;
  /** The verification that closed this record, when one has. */
  issuanceId: number | null;
};

/** DmrvRegistry `Attestation` struct. */
export type RawDmrvAttestation = {
  projectId: Hex;
  sequence: number;
  periodStart: bigint;
  periodEnd: bigint;
  reductionG: bigint;
  cumulativeG: bigint;
  completenessBps: number;
  meter: Address;
  hcsSequence: bigint;
  timestamp: bigint;
  reportHash: Hex;
  readingsDigest: Hex;
  chainHash: Hex;
  verified: Hex;
  breakdown: Hex;
};

/** Which verification (if any) closed each project record, derived from the issuance list. */
export type RecordClosure = (projectId: Hex, sequence: number) => { issuanceId: number; decision: number } | null;

export function closureOf(issuances: IssuanceView[]): RecordClosure {
  return (projectId, sequence) => {
    const plantId = bytes32ToPlantId(projectId);
    const issuance = issuances.find(
      i => i.plantId === plantId && sequence >= i.firstRecord && sequence <= i.lastRecord,
    );
    return issuance ? { issuanceId: issuance.id, decision: issuance.decision } : null;
  };
}

export function toDmrvAttestationView(
  raw: RawDmrvAttestation,
  id: number,
  auditTopic: bigint,
  closure: RecordClosure = () => null,
): AttestationView {
  const energy = decodeEnergy(raw.verified);
  const b = decodeBreakdown(raw.breakdown);
  const closed = closure(raw.projectId, raw.sequence);
  return {
    id,
    plantId: bytes32ToPlantId(raw.projectId),
    sequence: raw.sequence,
    periodStart: Number(raw.periodStart),
    periodEnd: Number(raw.periodEnd),
    netEnergyWh: energy.netWh,
    grossEnergyWh: energy.grossWh,
    fuelG: energy.fuelG,
    leakageInputG: energy.leakageG,
    creditingYear: Number(b.creditingYear),
    projectEnergyWh: b.projectWh,
    baselineG: b.baselineG,
    reservoirG: b.reservoirG,
    fossilFuelG: b.fossilG,
    leakageG: b.leakageG,
    reductionG: Number(raw.reductionG),
    cumulativeG: Number(raw.cumulativeG),
    unitsAtRecord: b.units,
    completenessBps: raw.completenessBps,
    meter: raw.meter,
    reportHash: raw.reportHash,
    readingsDigest: raw.readingsDigest,
    chainHash: raw.chainHash,
    verified: raw.verified,
    hcsTopicId: topicIdFromNum(auditTopic),
    hcsSequence: Number(raw.hcsSequence),
    timestamp: Number(raw.timestamp),
    status: !closed ? "monitored" : closed.decision === 1 ? "issued" : "rejected",
    issuanceId: closed?.issuanceId ?? null,
  };
}

/** A VVB's verification of records `firstRecord..lastRecord` and what it issued. */
export type IssuanceView = {
  id: number;
  plantId: string;
  firstRecord: number;
  lastRecord: number;
  /** 1 = approved (issued), 2 = rejected (closed unissued). */
  decision: number;
  monitoredG: number;
  deductionG: number;
  unitsIssued: number;
  verifier: Address;
  timestamp: number;
  reportHash: Hex;
  hcsTopicId: string | null;
  hcsSequence: number;
  evidenceHash: Hex | null;
};

export type RawIssuance = {
  projectId: Hex;
  firstRecord: number;
  lastRecord: number;
  decision: number;
  monitoredG: bigint;
  deductionG: bigint;
  unitsIssued: bigint;
  verifier: Address;
  timestamp: bigint;
  hcsSequence: bigint;
  reportHash: Hex;
  evidenceHash: Hex;
};

export function toIssuanceView(raw: RawIssuance, id: number, auditTopic: bigint): IssuanceView {
  return {
    id,
    plantId: bytes32ToPlantId(raw.projectId),
    firstRecord: raw.firstRecord,
    lastRecord: raw.lastRecord,
    decision: raw.decision,
    monitoredG: Number(raw.monitoredG),
    deductionG: Number(raw.deductionG),
    unitsIssued: Number(raw.unitsIssued),
    verifier: raw.verifier,
    timestamp: Number(raw.timestamp),
    reportHash: raw.reportHash,
    hcsTopicId: topicIdFromNum(auditTopic),
    hcsSequence: Number(raw.hcsSequence),
    evidenceHash: raw.evidenceHash === zeroHash ? null : raw.evidenceHash,
  };
}

/** DmrvRegistry `Project` struct. */
export type RawProject = {
  operator: Address;
  meter: Address;
  reporter: Address;
  validator: Address;
  module: Address;
  active: boolean;
  creditingPeriods: number;
  attestations: number;
  verifiedRecords: number;
  creditingStart: bigint;
  creditingEnd: bigint;
  lastPeriodEnd: bigint;
  calibrationValidUntil: bigint;
  registrationRequestedAt: bigint;
  balanceG: bigint;
  issuedUnits: bigint;
  state: Hex;
  recordsHash: Hex;
  designHash: Hex;
  validationReportHash: Hex;
  externalId: Hex;
  params: Hex;
};

/**
 * The hydro module's ledger word: crediting year (32 bits) | year net Wh (int112) | balance g (int112). The balance
 * is the module's running remainder at record time; issuance keeps its own (`PlantView.unissuedBalanceG`).
 */
export function decodeHydroState(state: Hex) {
  const word = BigInt(state);
  const mask = (1n << 112n) - 1n;
  const signed = (v: bigint) => (v >= 1n << 111n ? v - (1n << 112n) : v);
  return {
    creditingYear: Number(word >> 224n),
    yearNetWh: Number(signed((word >> 112n) & mask)),
    balanceG: Number(signed(word & mask)),
  };
}

/** PE_HP rate the module applies (VMR0017 or CDM), mirrored for display only. */
function reservoirRateOf(p: HydroParams): number {
  const addedArea = p.reservoirAreaM2 - p.baselineReservoirAreaM2;
  if (addedArea <= 0) return 0;
  const addedW = Math.max(0, p.capacityKw - p.baselineCapacityKw) * 1_000;
  if (addedW > 10 * addedArea || addedW <= 4 * addedArea) return 0;
  return p.methodology === 1 ? 100_000 : 90_000;
}

export type PlantView = {
  plantId: string;
  name: string;
  operator: Address;
  /** The data logger whose EIP-712 statement every monitoring record must carry. */
  meter: Address;
  /** An account the operator lets record monitoring for it (its server); null for none. */
  reporter: Address | null;
  /** The VVB whose ValidationApproval registered (or last renewed) the project. */
  validator: Address;
  module: Address;
  active: boolean;
  design: RegisteredDesign;
  designHash: Hex;
  validationReportHash: Hex;
  /** Id of the same project in an external program (e.g. keccak256 of a Verra id); null when none. */
  externalId: Hex | null;
  reservoirGPerMwh: number;
  /** The module ledger the next monitoring period is quantified against (the engine's `ledger`). */
  ledger: { attestations: number; balanceG: number; creditingYear: number; yearNetWh: number };
  /** Records a verification has closed; records from here to `ledger.attestations − 1` await one. */
  verifiedRecords: number;
  /** Head of the record hash chain a verification of all pending records must sign. */
  recordsHash: Hex;
  /** ER (g) verified but not yet a whole tonne, or a deficit carried forward. */
  unissuedBalanceG: number;
  lastPeriodEnd: number;
  issuedUnits: number;
  creditingPeriods: number;
  calibrationValidUntil: number;
  registrationRequestedAt: number;
  meteringHash: Hex;
  /** The module's raw params and ledger word, as `quantify` takes them. */
  params: Hex;
  state: Hex;
};

export function toProjectView(id: Hex, raw: RawProject, name = bytes32ToPlantId(id)): PlantView {
  const params = decodeHydroParams(raw.params);
  const state = decodeHydroState(raw.state);
  return {
    plantId: bytes32ToPlantId(id),
    name,
    operator: raw.operator,
    meter: raw.meter,
    reporter: raw.reporter === zeroAddress ? null : raw.reporter,
    validator: raw.validator,
    module: raw.module,
    active: raw.active,
    design: registeredDesignOf(params),
    designHash: raw.designHash,
    validationReportHash: raw.validationReportHash,
    externalId: raw.externalId === zeroHash ? null : raw.externalId,
    reservoirGPerMwh: reservoirRateOf(params),
    ledger: {
      attestations: raw.attestations,
      balanceG: state.balanceG,
      creditingYear: state.creditingYear,
      yearNetWh: state.yearNetWh,
    },
    verifiedRecords: raw.verifiedRecords,
    recordsHash: raw.recordsHash,
    unissuedBalanceG: Number(raw.balanceG),
    lastPeriodEnd: Number(raw.lastPeriodEnd),
    issuedUnits: Number(raw.issuedUnits),
    creditingPeriods: raw.creditingPeriods,
    calibrationValidUntil: Number(raw.calibrationValidUntil),
    registrationRequestedAt: Number(raw.registrationRequestedAt),
    meteringHash: params.meteringHash,
    params: raw.params,
    state: raw.state,
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
