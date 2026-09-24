import { z } from "zod";

const safeInt = (min = 0) => z.number().int().min(min).max(Number.MAX_SAFE_INTEGER);

/**
 * One metered interval from the plant's data logger. `timestamp` is the END of the interval.
 * Energy follows the ACM0002 monitoring plan: gross generation at the generator terminals (TEG), and export and
 * import at the grid interconnection from a bidirectional revenue (main) meter, optionally with a check meter.
 */
export const readingSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  intervalMinutes: z.number().int().positive().max(1_440),
  /** Gross generation at the generator terminals (kWh): TEG, for reservoir emissions and physics checks. */
  generationKwh: z.number().nonnegative(),
  /** Main meter: electricity delivered to the grid (kWh). */
  exportKwh: z.number().nonnegative(),
  /** Main meter: electricity drawn from the grid (kWh); EG_facility = export − import. */
  importKwh: z.number().nonnegative().optional(),
  /** Check meter reading of the export (kWh), reconciled against the main meter. */
  checkExportKwh: z.number().nonnegative().optional(),
  /** Turbine flow and net head, for the hydraulic upper bound ρ·g·Q·H·η_max. */
  flowRateM3s: z.number().nonnegative(),
  headM: z.number().nonnegative(),
  /** On-site fossil fuel burnt in the interval (kg), for PE_FF via TOOL03. */
  fuelKg: z.number().nonnegative().optional(),
  /** Environmental safeguard monitoring. Reported, never used to compute emission reductions. */
  ph: z.number().min(0).max(14).optional(),
  turbidityNtu: z.number().nonnegative().optional(),
  temperatureC: z.number().min(-50).max(80).optional(),
});

/** Metering equipment as recorded in the monitoring plan and calibration certificates. */
export const meteringSchema = z.object({
  /** Maximum permissible error of the main meter in % (0.2 for accuracy class 0.2S). */
  mainMeterAccuracyPct: z.number().positive().max(5),
  checkMeterAccuracyPct: z.number().positive().max(5),
  /** End of the main meter's calibration validity; later intervals get the delayed-calibration deduction. */
  calibrationValidUntil: z.iso.datetime({ offset: true }),
  /** Uncertainty of the flow measurement in %, widening the hydraulic upper bound. */
  flowUncertaintyPct: z.number().nonnegative().max(50),
  /**
   * Address of the data logger's secp256k1 key, recorded at validation like a calibration certificate. When set,
   * every batch must carry that key's signature (`provenance.ts`), or the engine rejects it.
   */
  deviceAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte hex address")
    .optional(),
});

/** 65-byte r‖s‖v secp256k1 signature. */
export const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature");

/** The integers `HydroCreditRegistry.registerPlant` stores (see `methodology/project.ts`). */
export const registeredDesignSchema = z.object({
  projectType: z.number().int().min(0).max(2),
  capacityKw: safeInt(1),
  baselineCapacityKw: safeInt(),
  reservoirAreaM2: safeInt(),
  baselineReservoirAreaM2: safeInt(),
  efGridGPerMwh: safeInt().max(2_000_000),
  fuelCoefGPerTonne: safeInt(),
  baselineWh: safeInt(),
  baselineEndsAt: safeInt(),
  creditingStart: safeInt(),
  creditingEnd: safeInt(),
});

/** Everything the monitoring engine needs about a plant: the registered design plus its hydraulic envelope. */
export const plantProfileSchema = z.object({
  plantId: z.string().min(1).max(31),
  name: z.string().max(80),
  methodology: z.enum(["ACM0002", "AMS-I.D"]),
  design: registeredDesignSchema,
  hydraulics: z.object({
    maxFlowM3s: z.number().positive(),
    maxHeadM: z.number().positive(),
    minEfficiency: z.number().gt(0).lte(1),
    maxEfficiency: z.number().gt(0).lte(1),
  }),
});

/** Plant state from the contract before this period; numbers are exact integers (g, Wh). */
export const ledgerSchema = z.object({
  attestations: safeInt(),
  balanceG: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  creditingYear: safeInt(),
  yearNetWh: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
});

export const verifyRequestSchema = z.object({
  readings: z.array(readingSchema).min(1).max(2_000),
  plant: plantProfileSchema.optional(),
  metering: meteringSchema.optional(),
  ledger: ledgerSchema.optional(),
  /** The meter's signature over the batch (`provenance.ts`); required when `metering.deviceAddress` is set. */
  signature: signatureSchema.optional(),
});

export type Reading = z.infer<typeof readingSchema>;
export type Metering = z.infer<typeof meteringSchema>;
export type PlantProfile = z.infer<typeof plantProfileSchema>;
export type LedgerJson = z.infer<typeof ledgerSchema>;
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
