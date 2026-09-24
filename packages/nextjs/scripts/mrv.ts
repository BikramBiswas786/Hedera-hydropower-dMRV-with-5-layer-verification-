/**
 * Command-line access to the same pipeline the app, REST API and MCP tools use.
 *
 *   yarn mrv:create-topic          create the HCS audit topic (prints HCS_TOPIC_ID)
 *   yarn mrv:attest [scenario]     verify sample telemetry, anchor it on HCS and attest on-chain
 */
import { existsSync } from "fs";
import {
  DEMO_PLANT,
  SCENARIO_NAMES,
  type ScenarioName,
  generateScenario,
  lastWholeHour,
} from "~~/services/mrv/scenarios";

// Server modules read env at import time, so load .env.local first and import them dynamically below.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const HOUR_S = 3_600;
const MAX_HOURS = 24;

async function createTopic() {
  const { readOperatorConfig } = await import("~~/services/mrv/server/config");
  const { createAuditTopic } = await import("~~/services/mrv/server/hcs");
  const operator = readOperatorConfig();
  if (!operator) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env.local");
  const topicId = await createAuditTopic(operator);
  console.log(`Created HCS topic ${topicId}\nAdd this to packages/nextjs/.env.local:\n\nHCS_TOPIC_ID=${topicId}`);
}

/** Starts where the last attestation ended so repeated runs never overlap on-chain. */
async function attest(scenario: ScenarioName) {
  const { attestReadings } = await import("~~/services/mrv/server/attest");
  const { getPlant } = await import("~~/services/mrv/server/registry");
  const { plantIdToBytes32 } = await import("~~/services/mrv/views");

  const plant = await getPlant(plantIdToBytes32(DEMO_PLANT.plantId));
  if (!plant) throw new Error(`${DEMO_PLANT.plantId} is not registered. Run \`yarn deploy\` first.`);

  const end = lastWholeHour();
  const available = Math.floor((end.getTime() / 1_000 - plant.lastPeriodEnd) / HOUR_S);
  // With no unattested hours left an APPROVED batch will be refused as overlapping; other decisions still print.
  const hours = available >= 1 ? Math.min(MAX_HOURS, available) : MAX_HOURS;

  const readings = generateScenario(scenario, { end, hours });
  const outcome = await attestReadings({ readings });
  console.log(`Decision: ${outcome.report.decision} (trust ${outcome.report.trustScoreBps / 100}%)`);
  console.log(outcome.report.reasoning);
  if (outcome.status !== "attested") return;

  console.log(`Attestation #${outcome.attestationId} minted ${outcome.unitsMinted} kWh of RECs`);
  console.log(`Contract call: ${outcome.transaction.url ?? outcome.transaction.hash}`);
  if (outcome.hcs) {
    console.log(`HCS readings:  ${outcome.hcs.dataUrl}`);
    console.log(`HCS report:    ${outcome.hcs.url}`);
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "create-topic") return createTopic();
  if (command === "attest") {
    const scenario = (arg ?? "healthy") as ScenarioName;
    if (!SCENARIO_NAMES.includes(scenario))
      throw new Error(`Unknown scenario. Use one of: ${SCENARIO_NAMES.join(", ")}`);
    return attest(scenario);
  }
  console.log("Usage: mrv.ts create-topic | attest [scenario]");
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
