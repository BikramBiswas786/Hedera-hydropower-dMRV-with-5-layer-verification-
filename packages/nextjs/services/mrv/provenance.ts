import { READING_KEYS } from "./report";
import type { Reading } from "./schema";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  type Address,
  type Hex,
  bytesToHex,
  encodeAbiParameters,
  hashMessage,
  hashTypedData,
  hexToBytes,
  isAddressEqual,
  keccak256,
  numberToHex,
  sha256,
  stringToBytes,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";

/**
 * Meter-level provenance. The plant's data logger holds a secp256k1 key; its address is registered on-chain with the
 * plant (`HydroCreditRegistry.getPlant(..).meter`) and repeated in the metering record.
 *
 * For every batch the meter signs a *statement*: the raw totals (gross generation, net export, fuel), the period,
 * the SHA-256 of the readings and the registry it is meant for (chain id and address). The engine checks the
 * signature and that the statement matches the readings, so nothing can change between the meter and HCS unnoticed;
 * the contract checks the same signature and only accepts figures at least as conservative as the statement, so a
 * verifier key on its own cannot mint.
 *
 * `DmrvRegistry` (phase 1) uses EIP-712 typed data: domain `DmrvRegistry` v1 bound to the chain and registry, type
 * `MeterStatement` (below). A registered VVB then signs a `VerifierApproval` that embeds the meter statement's
 * digest (`approval.ts`), and the registry needs both signatures to mint. A domain with a `sequence` selects this
 * scheme. Without one, statements use the legacy `HydroCreditRegistry` (5b7fe3f) EIP-191 hash, so historic HCS
 * data keeps verifying. Data messages published before readings@5 carry the earlier batch signature (over the
 * readings digest alone). Verification is synchronous (no I/O) to keep the engine pure.
 */
export const METER_BATCH_SCHEMA = "hydro-dmrv/meter-batch@1";

/** SHA-256 of the canonical batch: plant id plus readings in the same row encoding as the HCS data message. */
export function readingsDigest(plantId: string, readings: Reading[]): Hex {
  const body = {
    schema: METER_BATCH_SCHEMA,
    plantId,
    fields: READING_KEYS,
    readings: readings.map(reading => READING_KEYS.map(key => reading[key] ?? null)),
  };
  return sha256(stringToBytes(JSON.stringify(body)));
}

/** kWh → Wh, rounded down (net export) or up (generation, fuel), with float noise removed first. */
export const milliFloor = (value: number) => Math.floor(Number((value * 1_000).toFixed(3)));
export const milliCeil = (value: number) => Math.ceil(Number((value * 1_000).toFixed(3)));

export const METER_STATEMENT_SCHEMA = "hydro-dmrv/meter-statement@1";
const METER_STATEMENT_TAG = keccak256(stringToBytes(METER_STATEMENT_SCHEMA));

/**
 * The registry a statement is signed for, so it cannot be replayed on another chain or deployment. `sequence` is
 * the project's attestation count at signing time (DmrvRegistry EIP-712 scheme); absent for the legacy registry.
 */
export type MeterDomain = { chainId: number; registry: Address; sequence?: number };

/** What the meter signs: raw totals before any QA/QC, the period, and the digest of the readings. */
export type MeterStatement = {
  periodStart: number;
  periodEnd: number;
  /** TEG: Σ generation, rounded up. */
  grossWh: number;
  /** Σ (export − import), rounded down. */
  netWh: number;
  /** Σ fuel, rounded up. */
  fuelG: number;
  readingsDigest: Hex;
  /** Readings in the batch and the shortest interval (s); the registry computes completeness from them. */
  intervals: number;
  intervalSeconds: number;
};

/** The batch period in unix seconds: from the start of the earliest interval to the end of the latest. */
export function batchPeriod(readings: Reading[]) {
  const ends = readings.map(r => Date.parse(r.timestamp));
  const starts = readings.map((r, i) => ends[i] - r.intervalMinutes * 60_000);
  return { periodStart: Math.floor(Math.min(...starts) / 1_000), periodEnd: Math.floor(Math.max(...ends) / 1_000) };
}

export function meterStatementOf(plantId: string, readings: Reading[]): MeterStatement {
  const sum = (pick: (r: Reading) => number) => readings.reduce((s, r) => s + pick(r), 0);
  return {
    ...batchPeriod(readings),
    grossWh: milliCeil(sum(r => r.generationKwh)),
    netWh: milliFloor(sum(r => r.exportKwh - (r.importKwh ?? 0))),
    fuelG: milliCeil(sum(r => r.fuelKg ?? 0)),
    readingsDigest: readingsDigest(plantId, readings),
    intervals: readings.length,
    intervalSeconds: Math.min(...readings.map(r => Math.round(r.intervalMinutes * 60))),
  };
}

// ─── DmrvRegistry: EIP-712 ────────────────────────────────────────────────

export const DMRV_EIP712_NAME = "DmrvRegistry";
export const DMRV_EIP712_VERSION = "1";

export const METER_STATEMENT_TYPES = {
  MeterStatement: [
    { name: "projectId", type: "bytes32" },
    { name: "sequence", type: "uint32" },
    { name: "periodStart", type: "uint64" },
    { name: "periodEnd", type: "uint64" },
    { name: "intervals", type: "uint32" },
    { name: "intervalSeconds", type: "uint32" },
    { name: "meteredHash", type: "bytes32" },
    { name: "readingsDigest", type: "bytes32" },
  ],
} as const;

export function dmrvDomain(domain: MeterDomain) {
  return {
    name: DMRV_EIP712_NAME,
    version: DMRV_EIP712_VERSION,
    chainId: BigInt(domain.chainId),
    verifyingContract: domain.registry,
  } as const;
}

/** Hydro module encoding of energy figures: `abi.encode(int64 netWh, uint64 grossWh, uint64 fuelG, uint64 leakageG)`. */
export function encodeEnergy(e: {
  netWh: number | bigint;
  grossWh: number | bigint;
  fuelG: number | bigint;
  leakageG: number | bigint;
}): Hex {
  return encodeAbiParameters(
    [{ type: "int64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
    [BigInt(e.netWh), BigInt(e.grossWh), BigInt(e.fuelG), BigInt(e.leakageG)],
  );
}

/** What the meter signs as `metered`: its raw totals, with no leakage (the VVB adds that). */
export const meteredEnergyOf = (statement: MeterStatement): Hex =>
  encodeEnergy({ netWh: statement.netWh, grossWh: statement.grossWh, fuelG: statement.fuelG, leakageG: 0 });

export function meterTypedData(domain: MeterDomain, plantId: string, statement: MeterStatement) {
  return {
    domain: dmrvDomain(domain),
    types: METER_STATEMENT_TYPES,
    primaryType: "MeterStatement" as const,
    message: {
      projectId: plantIdHex(plantId),
      sequence: domain.sequence ?? 0,
      periodStart: BigInt(statement.periodStart),
      periodEnd: BigInt(statement.periodEnd),
      intervals: statement.intervals,
      intervalSeconds: statement.intervalSeconds,
      meteredHash: keccak256(meteredEnergyOf(statement)),
      readingsDigest: statement.readingsDigest,
    },
  };
}

/** Byte-for-byte `DmrvRegistry.meterStatementDigest`. */
export function meterStatementDigest(domain: MeterDomain, plantId: string, statement: MeterStatement): Hex {
  return hashTypedData(meterTypedData(domain, plantId, statement));
}

/** The hash a meter signs for `domain`: EIP-712 for DmrvRegistry, the legacy EIP-191 hash otherwise. */
function statementSigningHash(domain: MeterDomain, plantId: string, statement: MeterStatement): Hex {
  return domain.sequence === undefined
    ? hashMessage({ raw: meterStatementHash(domain, plantId, statement) })
    : meterStatementDigest(domain, plantId, statement);
}

/** Byte-for-byte legacy `HydroCreditRegistry.meterStatementHash` (5b7fe3f), signed with EIP-191. */
export function meterStatementHash(domain: MeterDomain, plantId: string, statement: MeterStatement): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "int64" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [
        METER_STATEMENT_TAG,
        BigInt(domain.chainId),
        domain.registry,
        plantIdHex(plantId),
        BigInt(statement.periodStart),
        BigInt(statement.periodEnd),
        BigInt(statement.grossWh),
        BigInt(statement.netWh),
        BigInt(statement.fuelG),
        statement.readingsDigest,
      ],
    ),
  );
}

/** The registry's bytes32 plant id: the ASCII id, right-padded with zeros (as `encodeBytes32String`). */
export function plantIdHex(plantId: string): Hex {
  const bytes = stringToBytes(plantId);
  if (bytes.length > 31) throw new Error(`Plant id ${plantId} is longer than 31 bytes`);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return bytesToHex(padded);
}

/** Signs a final 32-byte digest (65-byte r‖s‖v, v = 27/28). Synchronous, so the engine stays pure. */
export function signDigest(privateKey: Hex, digest: Hex): Hex {
  const signature = secp256k1.sign(hexToBytes(digest), hexToBytes(privateKey));
  return `${bytesToHex(signature.toCompactRawBytes())}${numberToHex(27 + signature.recovery).slice(2)}` as Hex;
}

/** Recovers the signer of a final 32-byte digest, or null for a malformed signature. */
export function recoverDigest(digest: Hex, signature: Hex): Address | null {
  try {
    const bytes = hexToBytes(signature);
    if (bytes.length !== 65) return null;
    const v = bytes[64];
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery !== 0 && recovery !== 1) return null;
    const point = secp256k1.Signature.fromCompact(bytes.slice(0, 64))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(digest));
    return publicKeyToAddress(bytesToHex(point.toRawBytes(false)));
  } catch {
    return null;
  }
}

/** Signs a batch's statement as the meter would, for the registry in `domain`. */
export function signMeterStatement(privateKey: Hex, domain: MeterDomain, plantId: string, readings: Reading[]): Hex {
  return signDigest(privateKey, statementSigningHash(domain, plantId, meterStatementOf(plantId, readings)));
}

/** Legacy (readings@2–@4): the signature covered the readings digest only. */
export function signReadings(privateKey: Hex, plantId: string, readings: Reading[]): Hex {
  return signDigest(privateKey, hashMessage({ raw: readingsDigest(plantId, readings) }));
}

export type ProvenanceCheck =
  | { status: "unregistered" }
  | { status: "missing"; device: Address }
  | { status: "invalid"; device: Address; signer: Address | null }
  | { status: "signed"; device: Address };

/**
 * Compares the batch signature with the meter key in the metering record. With a `domain` the signature must cover
 * the meter statement for that registry; `null` checks the legacy batch signature of data messages before readings@5.
 */
export function checkProvenance(
  plantId: string,
  readings: Reading[],
  device: Address | undefined,
  signature: Hex | undefined,
  domain: MeterDomain | null,
): ProvenanceCheck {
  if (!device) return { status: "unregistered" };
  if (!signature) return { status: "missing", device };
  const digest = domain
    ? statementSigningHash(domain, plantId, meterStatementOf(plantId, readings))
    : hashMessage({ raw: readingsDigest(plantId, readings) });
  const signer = recoverDigest(digest, signature);
  return signer && isAddressEqual(signer, device)
    ? { status: "signed", device }
    : { status: "invalid", device, signer };
}
