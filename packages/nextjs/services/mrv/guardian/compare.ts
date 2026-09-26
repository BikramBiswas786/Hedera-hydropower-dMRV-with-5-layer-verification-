import { ApiError } from "../server/errors";
import { MappingError, crossCheckMonitoringReport, tonnes } from "./crossCheck";
import { z } from "zod";

const num = z.union([z.number(), z.string()]);

/** Guardian VMR0017 monitoring fields. Extra keys are kept so reservoir and fuel terms still reach the engine. */
export const compareReportSchema = z.looseObject({
  field3: num,
  field4: num,
  field5: num,
  field6: num,
  field7: num,
  field24: num,
  field25: num,
  field26: num,
  field27: num,
});

export type CompareReport = z.infer<typeof compareReportSchema>;

/** Recompute a Guardian figure. Does not mint and does not sign. */
export function compareGuardianReport(input: CompareReport) {
  try {
    const out = crossCheckMonitoringReport(input);
    return {
      decision: out.decision,
      oursT: {
        be: tonnes(out.oursG.be),
        pe: tonnes(out.oursG.pe),
        le: tonnes(out.oursG.le),
        er: tonnes(out.oursG.er),
      },
      theirsT: out.theirsT,
      deltaTonnes: tonnes(out.deltaERg),
      notes: out.notes,
    };
  } catch (error) {
    if (error instanceof MappingError) throw new ApiError(error.message, 422);
    throw error;
  }
}
