import type { VerificationReport } from "./engine";
import { type PlantProfile, type Reading, plantProfileSchema, readingSchema } from "./schema";
import { type Hex, sha256, stringToBytes } from "viem";
import { z } from "zod";

export const REPORT_SCHEMA = "hydro-dmrv/report@2";
export const DATA_SCHEMA = "hydro-dmrv/readings@1";

/** HCS splits messages into 1024-byte chunks and accepts at most 20 per message. */
export const HCS_CHUNK_BYTES = 1_024;
export const HCS_MAX_CHUNKS = 20;
export const HCS_MAX_DATA_BYTES = HCS_CHUNK_BYTES * HCS_MAX_CHUNKS;

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

// ─── Data message: everything needed to re-run the engine ────────────────────

/** Published to HCS as a (possibly chunked) message before the report, so the inputs are public too. */
export type HcsDataMessage = {
  schema: typeof DATA_SCHEMA;
  engine: string;
  plant: PlantProfile;
  gridEmissionFactor: number;
  fields: typeof READING_KEYS;
  /** One row per reading, values in `fields` order; absent optional values are `null`. */
  readings: (string | number | null)[][];
};

export type AnchoredData = { message: string; dataHash: Hex; body: HcsDataMessage; chunks: number };

export function buildDataMessage(
  readings: Reading[],
  plant: PlantProfile,
  gridEmissionFactor: number,
  engine: string,
): AnchoredData {
  const body: HcsDataMessage = {
    schema: DATA_SCHEMA,
    engine,
    plant,
    gridEmissionFactor,
    fields: READING_KEYS,
    readings: readings.map(reading => READING_KEYS.map(key => reading[key] ?? null)),
  };
  const message = JSON.stringify(body);
  const bytes = stringToBytes(message);
  if (bytes.length > HCS_MAX_DATA_BYTES) {
    throw new Error(
      `Readings serialise to ${bytes.length} bytes; HCS allows ${HCS_MAX_DATA_BYTES} (${HCS_MAX_CHUNKS} chunks). Attest shorter periods.`,
    );
  }
  return { message, dataHash: sha256(bytes), body, chunks: Math.ceil(bytes.length / HCS_CHUNK_BYTES) };
}

const dataMessageSchema = z.object({
  schema: z.literal(DATA_SCHEMA),
  engine: z.string(),
  plant: plantProfileSchema,
  gridEmissionFactor: z.number(),
  fields: z.array(z.string()),
  readings: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
});

/** Parses a data message back into typed readings. Throws with a readable reason on malformed input. */
export function parseDataMessage(text: string): {
  readings: Reading[];
  plant: PlantProfile;
  gridEmissionFactor: number;
  engine: string;
} {
  const body = dataMessageSchema.parse(JSON.parse(text));
  const readings = body.readings.map(row =>
    readingSchema.parse(
      Object.fromEntries(body.fields.map((field, i) => [field, row[i]]).filter(([, value]) => value !== null)),
    ),
  );
  return { readings, plant: body.plant, gridEmissionFactor: body.gridEmissionFactor, engine: body.engine };
}

// ─── Report message: the verdict the contract records ────────────────────────

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
  /** Commits to the data message: its SHA-256 and HCS sequence number (null before publishing or off-ledger). */
  data: { hash: Hex; sequence: number | null };
};

export type AnchoredReport = { message: string; reportHash: Hex; body: HcsReportMessage };

/** HCS messages up to 1024 bytes fit in one chunk, which keeps exactly one sequence number per report. */
export function buildHcsMessage(report: VerificationReport, data: HcsReportMessage["data"]): AnchoredReport {
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
    layersBps: layersInBps(report),
    issues: report.issues.length,
    emissionReductionTco2: report.carbon.emissionReductionTco2,
    data,
  };
  const message = JSON.stringify(body);
  const bytes = stringToBytes(message);
  if (bytes.length > HCS_CHUNK_BYTES) {
    throw new Error(`HCS report is ${bytes.length} bytes; the limit for a single chunk is ${HCS_CHUNK_BYTES}`);
  }
  return { message, reportHash: sha256(bytes), body };
}

export function layersInBps(report: VerificationReport): Record<string, number> {
  return Object.fromEntries(report.layers.map(layer => [layer.layer, Math.round(layer.score * 10_000)]));
}

// ─── Mirror-node payloads ────────────────────────────────────────────────────

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/** Text and SHA-256 of message bytes exactly as the mirror node stores them. */
export function decodeMessage(bytes: Uint8Array): { text: string; hash: Hex } {
  return { text: new TextDecoder().decode(bytes), hash: sha256(bytes) };
}
