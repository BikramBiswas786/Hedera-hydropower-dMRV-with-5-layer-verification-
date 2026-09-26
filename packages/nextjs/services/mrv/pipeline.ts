import { DEMO_PLANT, demoMeteringFor, findDemoPlant } from "./demo";
import { DEFAULT_METERING, toLedgerJson, verifyReadings } from "./engine";
import { EMPTY_LEDGER } from "./methodology/quantify";
import { defaultMeterDomain } from "./network";
import { buildDataMessage, buildHcsMessage } from "./report";
import type { VerifyRequest } from "./schema";

/**
 * Verifies readings and builds both HCS messages exactly as they would be published. The report's data sequence is
 * `null` here because it is only known once the data message reaches consensus. Pass the plant's on-chain ledger
 * when attesting; previews default to an empty one. Without metering data, demo plants use their demo meters (whose
 * key must have signed the batch) and any other plant gets the conservative `DEFAULT_METERING`.
 */
export function prepareAnchors({
  readings,
  plant = DEMO_PLANT,
  metering = findDemoPlant(plant.plantId) ? demoMeteringFor(plant.plantId) : DEFAULT_METERING,
  ledger = toLedgerJson(EMPTY_LEDGER),
  signature,
  domain = defaultMeterDomain(ledger.attestations),
}: VerifyRequest) {
  const report = verifyReadings(readings, plant, metering, ledger, signature, domain);
  const data = buildDataMessage(readings, plant, metering, ledger, report.engine, signature ?? null, domain);
  const preview = buildHcsMessage(report, { hash: data.dataHash, sequence: null });
  return { plant, metering, ledger, domain, report, data, preview };
}

export type PreparedAnchors = ReturnType<typeof prepareAnchors>;
