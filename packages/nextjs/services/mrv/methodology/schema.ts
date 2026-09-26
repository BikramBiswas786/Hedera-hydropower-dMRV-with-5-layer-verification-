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
        /** Other fuels in the same unit. VT0011 uses the one with the lowest CO2 factor. */
        fuels: z.array(z.enum(FUEL_TYPES)).max(6).optional(),
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
          z.object({
            mwh: z.number().nonnegative(),
            fuelT: z.number().nonnegative().optional(),
            /** Purpose-built wheeling. Left out of the grid factor (VT0011, VT0010). */
            pbwaMwh: z.number().nonnegative().optional(),
          }),
        ),
        lambda: z.number().min(0).max(1).optional(),
        /** Net imports from a connected system. Counted at 0 t CO2/MWh for a project that supplies the grid. */
        importsMwh: z.number().nonnegative().optional(),
        /** Imports from a system in an Annex I country. Always 0 t CO2/MWh. Do not also include them in importsMwh. */
        annexIImportsMwh: z.number().nonnegative().optional(),
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
      regulatorySurplusBasis: z.string().min(8).max(500),
      investment: z.object({
        analysis: z.literal("benchmark"),
        irr: z.enum(["project", "equity"]),
        irrWithoutCreditsPct: z.number(),
        irrWithCreditsPct: z.number(),
        benchmarkPct: z.number(),
        sensitivityConfirms: z.boolean(),
        decisiveIncrease: z.boolean(),
        sensitivity: z
          .array(
            z.object({
              parameter: z.string().min(1).max(80),
              variationPct: z.number().min(-100).max(100),
              irrPct: z.number(),
            }),
          )
          .min(2)
          .max(40),
        sensitivityProbability: z.string().max(500).optional(),
      }),
      commonPractice: z.object({
        nAll: z.number().int().min(0),
        nDiff: z.number().int().min(0),
        basis: z.string().min(1).max(500),
        geographicArea: z.string().min(1).max(200),
        capacityBandPct: z.number().min(50).max(200),
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
  historicalYears: z
    .array(z.object({ year: z.number().int().min(1950).max(2100), mwh: z.number().nonnegative() }))
    .max(50)
    .optional(),
  baselineRetrofitDate: z.iso.datetime({ offset: true }).optional(),
  historical: z
    .object({
      commissionedAt: z.iso.datetime({ offset: true }),
      referenceStart: z.iso.datetime({ offset: true }),
      noChange: z.boolean(),
      remainingLifetimeBasis: z.string().min(1).max(500),
    })
    .optional(),
  equipmentTransferred: z.boolean(),
  endOfLifeRefurbishment: z.boolean().optional(),
  baselineAlternatives: z
    .object({
      p1: z.boolean(),
      p2: z.boolean(),
      p3: z.boolean(),
      outcome: z.enum(["P1", "P2", "P3"]),
    })
    .optional(),
  onSiteFuel: z
    .object({
      fuel: z.enum(FUEL_TYPES),
      ncvGjPerT: z.number().positive().optional(),
      co2KgPerTj: z.number().positive().optional(),
    })
    .nullable(),
  crediting: z.object({
    start: z.iso.datetime({ offset: true }),
    years: z.union([z.literal(5), z.literal(7), z.literal(10)]),
    period,
  }),
  renewal: z
    .object({
      baselineValidity: z.string().min(1).max(300),
      regulatorySurplus: z.string().min(1).max(300),
    })
    .optional(),
  /** When the registration request is filed. VCS Table 8 keys the 5-year rule off this date. */
  registrationRequest: z.iso.datetime({ offset: true }).optional(),
  grid: z.discriminatedUnion("source", [
    z.object({ source: z.literal("tool07"), input: tool07InputSchema }),
    z.object({
      source: z.literal("published"),
      efTPerMwh: z.number().positive().max(2),
      reference: z.string().min(1).max(200),
      validFrom: z.iso.datetime({ offset: true }).optional(),
      validTo: z.iso.datetime({ offset: true }).optional(),
    }),
  ]),
  hydraulics: z.object({
    maxFlowM3s: z.number().positive(),
    maxHeadM: z.number().positive(),
    minEfficiency: z.number().gt(0).lte(1),
    maxEfficiency: z.number().gt(0).lte(1),
  }),
});
