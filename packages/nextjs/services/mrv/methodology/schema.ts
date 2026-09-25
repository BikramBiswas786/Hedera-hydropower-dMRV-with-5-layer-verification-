import { FUEL_TYPES } from "./fuels";
import { PROJECT_TYPES } from "./project";
import { LOW_COST_MUST_RUN } from "./tool07";
import { z } from "zod";

const period = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const tool07InputSchema = z.object({
  system: z.string().min(1).max(120),
  units: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        source: z.enum([...FUEL_TYPES, ...LOW_COST_MUST_RUN]),
        commissioned: z.number().int().min(1900).max(2100),
        cdm: z.boolean().optional(),
        efficiency: z.number().gt(0).lte(1).optional(),
        tool09Efficiency: z.number().gt(0).lte(1).optional(),
      }),
    )
    .min(1)
    .max(500),
  years: z
    .array(
      z.object({
        year: z.number().int().min(1990).max(2100),
        units: z.record(
          z.string(),
          z.object({ mwh: z.number().nonnegative(), fuelT: z.number().nonnegative().optional() }),
        ),
        lambda: z.number().min(0).max(1).optional(),
      }),
    )
    .length(3),
  lowCostMustRunShare: z.array(z.number().min(0).max(1)).length(5),
  operatingMargin: z.enum(["simple", "simple-adjusted", "average"]),
});

export const gridEmissionFactorRequestSchema = tool07InputSchema.extend({
  projectKind: z.enum(["hydro", "wind-solar"]).default("hydro"),
  creditingPeriod: period.default(1),
  tool: z.enum(["TOOL07", "VT0011"]).default("TOOL07"),
});

const wholeNumber = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const projectDesignSchema = z.object({
  plantId: z.string().min(1).max(31),
  name: z.string().min(1).max(80),
  methodology: z.enum(["ACM0002", "AMS-I.D", "VMR0017"]).optional(),
  hostCountry: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "ISO 3166-1 alpha-2 country code")
    .optional(),
  authorizedCapacityKw: wholeNumber.optional(),
  additionality: z
    .object({
      tool: z.literal("VT0008"),
      regulatorySurplus: z.boolean(),
      investment: z.object({
        analysis: z.literal("benchmark"),
        irr: z.enum(["project", "equity"]),
        irrWithoutCreditsPct: z.number(),
        irrWithCreditsPct: z.number(),
        benchmarkPct: z.number(),
        sensitivityConfirms: z.boolean(),
        decisiveIncrease: z.boolean(),
      }),
      commonPractice: z.object({
        nAll: z.number().int().min(0),
        nDiff: z.number().int().min(0),
        basis: z.string().min(1).max(500),
      }),
      assessedBy: z.string().max(120).optional(),
      reportUri: z.string().max(300).optional(),
    })
    .optional(),
  projectType: z.enum(PROJECT_TYPES),
  capacityKw: wholeNumber.min(1),
  baselineCapacityKw: wholeNumber,
  reservoirAreaM2: wholeNumber,
  baselineReservoirAreaM2: wholeNumber,
  historicalGenerationMwh: z.array(z.number().nonnegative()).max(50).optional(),
  baselineRetrofitDate: z.iso.datetime({ offset: true }).optional(),
  equipmentTransferred: z.boolean(),
  onSiteFuel: z
    .object({
      fuel: z.enum(FUEL_TYPES),
      ncvGjPerT: z.number().positive().optional(),
      co2KgPerTj: z.number().positive().optional(),
    })
    .nullable(),
  crediting: z.object({
    start: z.iso.datetime({ offset: true }),
    years: z.union([z.literal(7), z.literal(10)]),
    period,
  }),
  grid: z.discriminatedUnion("source", [
    z.object({ source: z.literal("tool07"), input: tool07InputSchema }),
    z.object({
      source: z.literal("published"),
      efTPerMwh: z.number().positive().max(2),
      reference: z.string().min(1).max(200),
    }),
  ]),
  hydraulics: z.object({
    maxFlowM3s: z.number().positive(),
    maxHeadM: z.number().positive(),
    minEfficiency: z.number().gt(0).lte(1),
    maxEfficiency: z.number().gt(0).lte(1),
  }),
});
