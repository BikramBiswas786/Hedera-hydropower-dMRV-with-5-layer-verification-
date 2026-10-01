/**
 * The engine a first run should see, with no chain, wallet, or VVB key.
 *
 *   yarn verify
 *
 * `yarn demo` uses the same three gates after it deploys. Issuing credits on testnet is still
 * `yarn mrv:record`, then `yarn mrv:verify`, `yarn mrv:approve`, `yarn mrv:submit`.
 */
import { pathToFileURL } from "node:url";
import { prepareAnchors } from "~~/services/mrv/pipeline";
import { PREVIEW_METER_DOMAIN, SCENARIO_NAMES, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";

const END = new Date("2026-09-28T12:00:00Z");

/** What `yarn verify` and `yarn demo` refuse to pass. The other scenarios are printed, not gated. */
export const GATED_DECISIONS = {
  healthy: "APPROVED",
  inflated: "REJECTED",
  tampered: "REJECTED",
} as const;

export type GatedScenario = keyof typeof GATED_DECISIONS;

export type EngineLine = {
  name: ScenarioName;
  plantId: string;
  decision: string;
  reason: string;
  gated: boolean;
  ok: boolean;
};

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

export function demoEngineLines(): EngineLine[] {
  return SCENARIO_NAMES.map(name => {
    const request = generateScenario(name, { end: END, domain: PREVIEW_METER_DOMAIN });
    const { report } = prepareAnchors(request);
    const expected = name in GATED_DECISIONS ? GATED_DECISIONS[name as GatedScenario] : null;
    const reject = report.issues.find(issue => issue.severity === "reject");
    const reason = reject ? `${reject.message} (${reject.clause})` : report.reasoning;
    return {
      name,
      plantId: request.plant.plantId,
      decision: report.decision,
      reason: oneLine(reason),
      gated: expected !== null,
      ok: expected === null || report.decision === expected,
    };
  });
}

export function assertDemoEngines(): void {
  const failed = demoEngineLines().filter(line => line.gated && !line.ok);
  if (failed.length) {
    throw new Error(failed.map(line => `${line.name} was ${line.decision}`).join("; "));
  }
}

function printDemoEngines(): void {
  for (const line of demoEngineLines()) {
    const mark = !line.gated ? "info" : line.ok ? "ok" : "FAIL";
    console.log(
      `${mark.padEnd(4)} ${line.plantId.padEnd(14)} ${line.name.padEnd(20)} ${line.decision.padEnd(9)} ${line.reason}`,
    );
  }
  console.log(
    "No chain and no VVB key. A local market is `yarn demo`. Testnet issuance is yarn mrv:record, then mrv:verify, mrv:approve, mrv:submit.",
  );
  console.log(
    "The contract stores each HCS report's hash and sequence. It cannot read the message. yarn mrv:reproduce refuses a mismatch.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    printDemoEngines();
    assertDemoEngines();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
