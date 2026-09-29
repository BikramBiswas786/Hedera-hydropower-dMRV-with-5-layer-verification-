import { DEMO_PLANTS } from "../demo";
import type { VerificationReport } from "../engine";
import { prepareAnchors } from "../pipeline";
import { PREVIEW_METER_DOMAIN, generateScenario } from "../scenarios";
import { type VerifyRequest, verifyRequestSchema } from "../schema";
import type { EngineReport, MethodologyEngine } from "./types";

/**
 * The hydropower engine (`engine.ts`) as a plug-in: VMR0017 v1.0 with ACM0002 v22.0, or CDM ACM0002 / AMS-I.D,
 * recomputed on-chain by `HydroVmr0017Module`. The full hydro report (meter statement, HCS messages, equations) stays
 * available from `verifyReadings`; this adds the common engine fields around it.
 */
export type HydroEngineReport = EngineReport & { hydro: VerificationReport };

export function toEngineReport(report: VerificationReport): HydroEngineReport {
  return {
    engine: hydroEngine.id,
    methodology: report.methodology,
    decision: report.decision,
    reasoning: report.reasoning,
    stages: report.stages,
    findings: report.issues,
    reductionG: report.emissions?.reductionG ?? null,
    unitsMinted: report.emissions?.unitsMinted ?? null,
    monitoring: report.monitoring,
    hydro: report,
  };
}

export const hydroEngine: MethodologyEngine<VerifyRequest> = {
  id: "hydro-vmr0017",
  title: "Grid-connected hydropower",
  documents: ["VMR0017 v1.0", "ACM0002 v22.0", "AMS-I.D v18.0", "VT0011 v1.0", "VT0008 v1.0", "TOOL03"],
  scope:
    "Greenfield, retrofit and capacity-addition hydro plants; under VMR0017 only up to 15 MW in least developed countries",
  contract: "HydroVmr0017Module",
  parse: input => verifyRequestSchema.parse(input),
  // The same defaults as POST /api/mrv/verify (demo metering, this app's meter domain).
  verify: request => toEngineReport(prepareAnchors(request).report),
  example: end => generateScenario("healthy", { plant: DEMO_PLANTS[1], end, domain: PREVIEW_METER_DOMAIN }),
};
