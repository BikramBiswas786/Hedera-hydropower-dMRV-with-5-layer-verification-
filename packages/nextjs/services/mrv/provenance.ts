import { READING_KEYS } from "./report";
import type { Reading } from "./schema";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  type Address,
  type Hex,
  bytesToHex,
  hashMessage,
  hexToBytes,
  isAddressEqual,
  numberToHex,
  sha256,
  stringToBytes,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";

/**
 * Meter-level provenance. The plant's data logger holds a secp256k1 key and signs every batch of readings at the
 * source; its address is recorded in the metering record (validated on site, like a calibration certificate).
 * The engine rejects a batch that is unsigned or signed by another key, so readings cannot be edited anywhere
 * between the meter and HCS without the change being detected by anyone who re-runs the verification.
 *
 * The signature is an EIP-191 `personal_sign` over the 32-byte batch digest, so any Ethereum library, hardware
 * wallet or secure element that speaks secp256k1 can act as the signer. Verification is synchronous (no I/O) to
 * keep the engine pure.
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

/** Signs a batch as the meter would (65-byte r‖s‖v signature, v = 27/28). */
export function signReadings(privateKey: Hex, plantId: string, readings: Reading[]): Hex {
  const hash = hashMessage({ raw: readingsDigest(plantId, readings) });
  const signature = secp256k1.sign(hexToBytes(hash), hexToBytes(privateKey));
  return `${bytesToHex(signature.toCompactRawBytes())}${numberToHex(27 + signature.recovery).slice(2)}` as Hex;
}

/** The address that signed this batch, or null when the signature is malformed. */
export function recoverReadingsSigner(plantId: string, readings: Reading[], signature: Hex): Address | null {
  try {
    const bytes = hexToBytes(signature);
    if (bytes.length !== 65) return null;
    const v = bytes[64];
    const recovery = v >= 27 ? v - 27 : v;
    if (recovery !== 0 && recovery !== 1) return null;
    const hash = hashMessage({ raw: readingsDigest(plantId, readings) });
    const point = secp256k1.Signature.fromCompact(bytes.slice(0, 64))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(hash));
    return publicKeyToAddress(bytesToHex(point.toRawBytes(false)));
  } catch {
    return null;
  }
}

export type ProvenanceCheck =
  | { status: "unregistered" }
  | { status: "missing"; device: Address }
  | { status: "invalid"; device: Address; signer: Address | null }
  | { status: "signed"; device: Address };

/** Compares the batch signature with the meter key in the metering record. */
export function checkProvenance(
  plantId: string,
  readings: Reading[],
  device: Address | undefined,
  signature: Hex | undefined,
): ProvenanceCheck {
  if (!device) return { status: "unregistered" };
  if (!signature) return { status: "missing", device };
  const signer = recoverReadingsSigner(plantId, readings, signature);
  return signer && isAddressEqual(signer, device)
    ? { status: "signed", device }
    : { status: "invalid", device, signer };
}
