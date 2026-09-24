import { DEMO_METERING, DEMO_PLANT, findDemoPlant } from "./demo";
import { DEFAULT_METERING, toLedgerJson, verifyReadings } from "./engine";
import { EMPTY_LEDGER } from "./methodology/quantify";
import { buildDataMessage, buildHcsMessage } from "./report";
import type { VerifyRequest } from "./schema";

/**
 * Verifies readings and builds both HCS messages exactly as they would be published. The report's data sequence is
 * `null` here because it is only known once the data message reaches consensus. Pass the plant's on-chain ledger
 * when attesting; previews default to an empty one. Without metering data, demo plants use their demo meters and
 * any other plant gets the conservative `DEFAULT_METERING`.
 */
export function prepareAnchors({
  readings,
  plant = DEMO_PLANT,
  metering = findDemoPlant(plant.plantId) ? DEMO_METERING : DEFAULT_METERING,
  ledger = toLedgerJson(EMPTY_LEDGER),
}: VerifyRequest) {
  const report = verifyReadings(readings, plant, metering, ledger);
  const data = buildDataMessage(readings, plant, metering, ledger, report.engine);
  const preview = buildHcsMessage(report, { hash: data.dataHash, sequence: null });
  return { plant, metering, ledger, report, data, preview };
}

export type PreparedAnchors = ReturnType<typeof prepareAnchors>;
