import { DEFAULT_GRID_EMISSION_FACTOR, verifyReadings } from "./engine";
import { buildDataMessage, buildHcsMessage } from "./report";
import { DEMO_PLANT } from "./scenarios";
import type { VerifyRequest } from "./schema";

/**
 * Verifies readings and builds both HCS messages exactly as they would be published. The report's data sequence is
 * `null` here because it is only known once the data message reaches consensus.
 */
export function prepareAnchors({ readings, plant = DEMO_PLANT, gridEmissionFactor }: VerifyRequest) {
  const emissionFactor = gridEmissionFactor ?? DEFAULT_GRID_EMISSION_FACTOR;
  const report = verifyReadings(readings, plant, emissionFactor);
  const data = buildDataMessage(readings, plant, emissionFactor, report.engine);
  const preview = buildHcsMessage(report, { hash: data.dataHash, sequence: null });
  return { plant, report, data, preview };
}

export type PreparedAnchors = ReturnType<typeof prepareAnchors>;
