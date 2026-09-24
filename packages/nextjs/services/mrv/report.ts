import type { VerificationReport } from "./engine";
import type { Reading } from "./schema";
import { type Hex, sha256, stringToBytes } from "viem";

export const REPORT_SCHEMA = "hydro-dmrv/report@1";

/** HCS messages up to 1024 bytes fit in a single chunk, which keeps one sequence number per report. */
export const HCS_MAX_MESSAGE_BYTES = 1_024;

const READING_KEYS = [
  "timestamp",
  "intervalMinutes",
  "flowRateM3s",
  "headM",
  "energyKwh",
  "efficiency",
  "ph",
  "turbidityNtu",
  "temperatureC",
] as const satisfies readonly (keyof Reading)[];

/** Serialises readings with a fixed key order so the data hash is reproducible from the raw telemetry. */
export function canonicalReadings(readings: Reading[]): string {
  return JSON.stringify(readings.map(r => READING_KEYS.map(key => r[key] ?? null)));
}

export function readingsHash(readings: Reading[]): Hex {
  return sha256(stringToBytes(canonicalReadings(readings)));
}

export type HcsReportMessage = {
  schema: typeof REPORT_SCHEMA;
  engine: string;
  plantId: string;
  periodStart: number;
  periodEnd: number;
  readings: number;
  energyWh: number;
  trustScoreBps: number;
  decision: VerificationReport["decision"];
  layersBps: Record<string, number>;
  issues: number;
  emissionReductionTco2: number;
  dataHash: Hex;
};

export type AnchoredReport = { message: string; reportHash: Hex; body: HcsReportMessage };

/**
 * Builds the message published to HCS. The raw readings stay off-ledger; `dataHash` commits to them so the
 * operator can later disclose the telemetry and anyone can re-run the engine and match both hashes.
 */
export function buildHcsMessage(report: VerificationReport, readings: Reading[]): AnchoredReport {
  const body: HcsReportMessage = {
    schema: REPORT_SCHEMA,
    engine: report.engine,
    plantId: report.plantId,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    readings: report.readingCount,
    energyWh: report.energyWh,
    trustScoreBps: report.trustScoreBps,
    decision: report.decision,
    layersBps: Object.fromEntries(report.layers.map(l => [l.layer, Math.round(l.score * 10_000)])),
    issues: report.issues.length,
    emissionReductionTco2: report.carbon.emissionReductionTco2,
    dataHash: readingsHash(readings),
  };
  const message = JSON.stringify(body);
  const bytes = stringToBytes(message);
  if (bytes.length > HCS_MAX_MESSAGE_BYTES) {
    throw new Error(`HCS report is ${bytes.length} bytes; the limit for a single chunk is ${HCS_MAX_MESSAGE_BYTES}`);
  }
  return { message, reportHash: sha256(bytes), body };
}

/** Hash of an HCS message exactly as stored by the mirror node (base64-encoded bytes). */
export function hashBase64Message(base64: string): { text: string; hash: Hex } {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return { text: new TextDecoder().decode(bytes), hash: sha256(bytes) };
}
