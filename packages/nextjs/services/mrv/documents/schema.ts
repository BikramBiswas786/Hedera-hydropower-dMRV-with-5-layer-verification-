import { DOCUMENT_TYPES } from "./envelope";
import { z } from "zod";

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const prepareDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  subjectId: z.string().min(1).max(80),
  role: z.enum(["proponent", "auditor", "registry", "verifier"]),
  sections: z.record(z.string(), z.string()).refine(value => Object.keys(value).length > 0, "At least one section"),
  previousHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .nullable(),
  issuer: hexAddress,
});

export const publishDocumentSchema = prepareDocumentSchema.extend({
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const waterRequestSchema = z.object({
  projectId: z.string().min(1).max(80).default("WATER-DEMO-01"),
  population: z.number().int().min(0).max(10_000_000),
  litresPerPersonDay: z.number().min(0).max(100),
  qpwMethod: z.enum(["direct", "capacity", "population"]).default("population"),
  xBoil: z.number().min(0).max(1).default(1),
  stoveEfficiency: z.number().positive().max(1),
  baselineFuelShare: z.number().min(0).max(1).default(1),
  efCo2TonnesPerTj: z.number().min(0),
  efNonCo2TonnesPerTj: z.number().min(0).default(0),
  adjLe: z.number().min(0).max(1).default(1),
  fnrbPathway: z.enum(["TOOL33", "TOOL30"]),
  fnrbDefault: z.number().min(0).max(1).optional(),
  tool30Nrb: z.number().min(0).optional(),
  tool30Rb: z.number().min(0).optional(),
  appliancesPassed: z.number().int().min(0),
  appliancesTested: z.number().int().min(0),
  monitoringDays: z.number().int().min(1).max(3660).default(365),
  residualFuelKgPerDay: z.number().min(0).default(0),
  residualFuelCoef: z.number().min(0).default(0),
  gridKwhPerDay: z.number().min(0).default(0),
  gridEfTonnesPerMwh: z.number().min(0).default(0),
  tdl: z.number().min(0).default(0),
  publicNetworkInstalled: z.boolean().default(false),
  publicNetworkShare: z.number().min(0).max(1).default(0),
  reddCleared: z.boolean().default(true),
});
