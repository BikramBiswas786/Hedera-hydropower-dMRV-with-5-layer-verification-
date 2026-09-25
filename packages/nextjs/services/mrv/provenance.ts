import { READING_KEYS } from "./report";
import type { Reading } from "./schema";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  type Address,
  type Hex,
  bytesToHex,
  encodeAbiParameters,
  hashMessage,
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
 * Signatures are EIP-191 `personal_sign` over a 32-byte hash, so any Ethereum library, hardware wallet or secure
 * element that speaks secp256k1 can act as the signer. Verification is synchronous (no I/O) to keep the engine pure.
 * Data messages published before readings@5 carry the earlier batch signature (over the readings digest alone).
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

/** The registry a statement is signed for, so it cannot be replayed on another chain or deployment. */
export type MeterDomain = { chainId: number; registry: Address };

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
  };
}

/** Byte-for-byte `HydroCreditRegistry.meterStatementHash`. */
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
function plantIdHex(plantId: string): Hex {
  const bytes = stringToBytes(plantId);
  if (bytes.length > 31) throw new Error(`Plant id ${plantId} is longer than 31 bytes`);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return bytesToHex(padded);
}

function sign(privateKey: Hex, hash32: Hex): Hex {
  const signature = secp256k1.sign(hexToBytes(hashMessage({ raw: hash32 })), hexToBytes(privateKey));
  return `${bytesToHex(signature.toCompactRawBytes())}${numberToHex(27 + signature.recovery).slice(2)}` as Hex;
}

function recover(hash32: Hex, signature: Hex): Address | null {
  try {
    const bytes = hexToBytes(signature);
    if (bytes.length !== 65) return null;
    const v = bytes[64];
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery !== 0 && recovery !== 1) return null;
    const point = secp256k1.Signature.fromCompact(bytes.slice(0, 64))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(hashMessage({ raw: hash32 })));
    return publicKeyToAddress(bytesToHex(point.toRawBytes(false)));
  } catch {
    return null;
  }
}

/** Signs a batch's statement as the meter would (65-byte r‖s‖v signature, v = 27/28). */
export function signMeterStatement(privateKey: Hex, domain: MeterDomain, plantId: string, readings: Reading[]): Hex {
  return sign(privateKey, meterStatementHash(domain, plantId, meterStatementOf(plantId, readings)));
}

/** Legacy (readings@2–@4): the signature covered the readings digest only. */
export function signReadings(privateKey: Hex, plantId: string, readings: Reading[]): Hex {
  return sign(privateKey, readingsDigest(plantId, readings));
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
  const hash = domain
    ? meterStatementHash(domain, plantId, meterStatementOf(plantId, readings))
    : readingsDigest(plantId, readings);
  const signer = recover(hash, signature);
  return signer && isAddressEqual(signer, device)
    ? { status: "signed", device }
    : { status: "invalid", device, signer };
}
