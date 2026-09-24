import type { VerificationReport } from "./engine";
import type { ProjectDesign } from "./methodology/project";
import {
  type LedgerJson,
  type Metering,
  type PlantProfile,
  type Reading,
  ledgerSchema,
  meteringSchema,
  plantProfileSchema,
  readingSchema,
  signatureSchema,
} from "./schema";
import { type Hex, sha256, stringToBytes } from "viem";
import { z } from "zod";

export const REPORT_SCHEMA = "hydro-dmrv/report@3";
export const DATA_SCHEMA = "hydro-dmrv/readings@3";
/** Published before meter signatures; still parsed so earlier attestations stay reproducible. */
export const LEGACY_DATA_SCHEMAS = ["hydro-dmrv/readings@2"] as const;
export const PROJECT_SCHEMA = "hydro-dmrv/project@1";

/** HCS splits messages into 1024-byte chunks and accepts at most 20 per message. */
export const HCS_CHUNK_BYTES = 1_024;
export const HCS_MAX_CHUNKS = 20;
export const HCS_MAX_DATA_BYTES = HCS_CHUNK_BYTES * HCS_MAX_CHUNKS;

export const READING_KEYS = [
  "timestamp",
  "intervalMinutes",
  "generationKwh",
  "exportKwh",
  "importKwh",
  "checkExportKwh",
  "flowRateM3s",
  "headM",
  "fuelKg",
  "ph",
  "turbidityNtu",
  "temperatureC",
] as const satisfies readonly (keyof Reading)[];

const encode = (body: unknown) => {
  const message = JSON.stringify(body);
  const bytes = stringToBytes(message);
  return { message, bytes, hash: sha256(bytes) };
};

// ─── Project message: the validated design a plant is registered with ────────

export type ProjectMessage = { schema: typeof PROJECT_SCHEMA; design: ProjectDesign };

/** `designHash` stored on-chain is the SHA-256 of exactly these bytes. */
export function buildProjectMessage(design: ProjectDesign) {
  const body: ProjectMessage = { schema: PROJECT_SCHEMA, design };
  const { message, hash } = encode(body);
  return { message, designHash: hash, body };
}

// ─── Data message: everything needed to re-run the engine ────────────────────

/** Published to HCS as a (possibly chunked) message before the report, so the inputs are public too. */
export type HcsDataMessage = {
  schema: typeof DATA_SCHEMA;
  engine: string;
  plant: PlantProfile;
  metering: Metering;
  /** The plant's on-chain ledger the period was quantified against. */
  ledger: LedgerJson;
  fields: typeof READING_KEYS;
  /** One row per reading, values in `fields` order; absent optional values are `null`. */
  readings: (string | number | null)[][];
  /** The meter's signature over the batch (`provenance.ts`), or null when the plant has no meter key. */
  signature: string | null;
};

export type AnchoredData = { message: string; dataHash: Hex; body: HcsDataMessage; chunks: number };

export function buildDataMessage(
  readings: Reading[],
  plant: PlantProfile,
  metering: Metering,
  ledger: LedgerJson,
  engine: string,
  signature: string | null = null,
): AnchoredData {
  const body: HcsDataMessage = {
    schema: DATA_SCHEMA,
    engine,
    plant,
    metering,
    ledger,
    fields: READING_KEYS,
    readings: readings.map(reading => READING_KEYS.map(key => reading[key] ?? null)),
    signature,
  };
  const { message, bytes, hash } = encode(body);
  if (bytes.length > HCS_MAX_DATA_BYTES) {
    throw new Error(
      `Readings serialise to ${bytes.length} bytes; HCS allows ${HCS_MAX_DATA_BYTES} (${HCS_MAX_CHUNKS} chunks). Attest shorter periods.`,
    );
  }
  return { message, dataHash: hash, body, chunks: Math.ceil(bytes.length / HCS_CHUNK_BYTES) };
}

const dataMessageSchema = z.object({
  schema: z.enum([DATA_SCHEMA, ...LEGACY_DATA_SCHEMAS]),
  engine: z.string(),
  plant: plantProfileSchema,
  metering: meteringSchema,
  ledger: ledgerSchema,
  fields: z.array(z.string()),
  readings: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  signature: signatureSchema.nullish(),
});

/** Parses a data message back into typed inputs. Throws with a readable reason on malformed input. */
export function parseDataMessage(text: string) {
  const body = dataMessageSchema.parse(JSON.parse(text));
  const readings = body.readings.map(row =>
    readingSchema.parse(
      Object.fromEntries(body.fields.map((field, i) => [field, row[i]]).filter(([, value]) => value !== null)),
    ),
  );
  return {
    readings,
    plant: body.plant,
    metering: body.metering,
    ledger: body.ledger,
    engine: body.engine,
    signature: body.signature ?? undefined,
  };
}

// ─── Report message: the verdict and the numbers the contract recomputes ─────

export type HcsReportMessage = {
  schema: typeof REPORT_SCHEMA;
  engine: string;
  methodology: string;
  plantId: string;
  /** The plant's attestation count this report was computed against (`plantSequence` on-chain). */
  plantSequence: number;
  periodStart: number;
  periodEnd: number;
  decision: VerificationReport["decision"];
  completenessBps: number;
  readings: number;
  excluded: number;
  /** EG_facility, TEG, FC and LE: the monitored inputs `submitAttestation` receives. */
  monitored: { netWh: number; grossWh: number; fuelG: number; leakageG: number };
  /** EG_PJ, BE, PE_HP, PE_FF, ER and credits: what the contract must compute from them. */
  emissions: {
    egProjectWh: number;
    baselineG: number;
    reservoirG: number;
    fossilFuelG: number;
    reductionG: number;
    unitsMinted: number;
  } | null;
  parameters: { efGridGPerMwh: number; reservoirGPerMwh: number; fuelCoefGPerTonne: number };
  issues: { review: number; info: number };
  /** Commits to the data message: its SHA-256 and HCS sequence number (null before publishing or off-ledger). */
  data: { hash: Hex; sequence: number | null };
};

export type AnchoredReport = { message: string; reportHash: Hex; body: HcsReportMessage };

/** HCS messages up to 1024 bytes fit in one chunk, which keeps exactly one sequence number per report. */
export function buildHcsMessage(report: VerificationReport, data: HcsReportMessage["data"]): AnchoredReport {
  const { emissions, monitored, parameters } = report;
  const body: HcsReportMessage = {
    schema: REPORT_SCHEMA,
    engine: report.engine,
    methodology: report.methodology,
    plantId: report.plantId,
    plantSequence: report.ledger.before.attestations,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    decision: report.decision,
    completenessBps: report.completenessBps,
    readings: report.readingCount,
    excluded: report.excludedIntervals.length,
    monitored: {
      netWh: monitored.netWh,
      grossWh: monitored.grossWh,
      fuelG: monitored.fuelG,
      leakageG: monitored.leakageG,
    },
    emissions: emissions && {
      egProjectWh: emissions.egProjectWh,
      baselineG: emissions.baselineG,
      reservoirG: emissions.reservoirG,
      fossilFuelG: emissions.fossilFuelG,
      reductionG: emissions.reductionG,
      unitsMinted: emissions.unitsMinted,
    },
    parameters: {
      efGridGPerMwh: parameters.efGridGPerMwh,
      reservoirGPerMwh: parameters.reservoirGPerMwh,
      fuelCoefGPerTonne: parameters.fuelCoefGPerTonne,
    },
    issues: {
      review: report.issues.filter(i => i.severity === "review").length,
      info: report.issues.filter(i => i.severity === "info").length,
    },
    data,
  };
  const { message, bytes, hash } = encode(body);
  if (bytes.length > HCS_CHUNK_BYTES) {
    throw new Error(`HCS report is ${bytes.length} bytes; the limit for a single chunk is ${HCS_CHUNK_BYTES}`);
  }
  return { message, reportHash: hash, body };
}

// ─── Mirror-node payloads ────────────────────────────────────────────────────

export function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/** Text and SHA-256 of message bytes exactly as the mirror node stores them. */
export function decodeMessage(bytes: Uint8Array): { text: string; hash: Hex } {
  return { text: new TextDecoder().decode(bytes), hash: sha256(bytes) };
}
