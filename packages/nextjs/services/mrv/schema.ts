import { z } from "zod";

/** One metered interval from a plant's SCADA / data logger. `timestamp` is the end of the interval. */
export const readingSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  intervalMinutes: z.number().int().positive().max(1_440),
  flowRateM3s: z.number().nonnegative(),
  headM: z.number().nonnegative(),
  energyKwh: z.number().nonnegative(),
  efficiency: z.number().gt(0).lte(1).optional(),
  ph: z.number().min(0).max(14).optional(),
  turbidityNtu: z.number().nonnegative().optional(),
  temperatureC: z.number().min(-50).max(80).optional(),
});

/** Static plant parameters the verifier checks readings against. Mirrors what is registered on-chain. */
export const plantProfileSchema = z.object({
  plantId: z.string().min(1).max(31),
  capacityKw: z.number().positive(),
  maxFlowM3s: z.number().positive(),
  maxHeadM: z.number().positive(),
  efficiency: z.number().gt(0).lte(1),
  minEfficiency: z.number().gt(0).lte(1),
  maxEfficiency: z.number().gt(0).lte(1),
});

export const verifyRequestSchema = z.object({
  readings: z.array(readingSchema).min(1).max(2_000),
  plant: plantProfileSchema.optional(),
  gridEmissionFactor: z.number().nonnegative().max(2).optional(),
});

export type Reading = z.infer<typeof readingSchema>;
export type PlantProfile = z.infer<typeof plantProfileSchema>;
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;
