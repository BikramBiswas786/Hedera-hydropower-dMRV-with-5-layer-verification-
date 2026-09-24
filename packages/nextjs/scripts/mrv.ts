/**
 * Command-line access to the same pipeline the app, REST API and MCP tools use.
 *
 *   yarn mrv:create-topic          create the HCS audit topic (prints HCS_TOPIC_ID)
 *   yarn mrv:attest [scenario] [plantId]
 *                                  verify sample monitoring data, anchor it on HCS and attest on-chain
 */
import { existsSync } from "fs";
import { DEMO_PLANTS, findDemoPlant } from "~~/services/mrv/demo";
import { SCENARIO_NAMES, type ScenarioName, generateScenario, lastWholeHour } from "~~/services/mrv/scenarios";

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
async function attest(scenario: ScenarioName, plantId: string) {
  const { attestReadings } = await import("~~/services/mrv/server/attest");
  const { getPlant } = await import("~~/services/mrv/server/registry");
  const { plantIdToBytes32 } = await import("~~/services/mrv/views");

  const profile = findDemoPlant(plantId);
  if (!profile) throw new Error(`Unknown plant. Use one of: ${DEMO_PLANTS.map(p => p.plantId).join(", ")}`);
  const plant = await getPlant(plantIdToBytes32(plantId));
  if (!plant) throw new Error(`${plantId} is not registered. Run \`yarn deploy\` first.`);

  const end = lastWholeHour();
  const available = Math.floor((end.getTime() / 1_000 - plant.lastPeriodEnd) / HOUR_S);
  // With no unattested hours left an APPROVED batch will be refused as overlapping; other decisions still print.
  const hours = available >= 1 ? Math.min(MAX_HOURS, available) : MAX_HOURS;

  const outcome = await attestReadings(generateScenario(scenario, { end, hours, plant: profile }));
  const { report } = outcome;
  console.log(`Decision: ${report.decision} (${report.methodology}, ${report.completenessBps / 100}% coverage)`);
  console.log(report.reasoning);
  for (const step of report.equations) console.log(`  ${step.symbol.padEnd(12)} ${step.value} ${step.unit}`);
  if (outcome.status !== "attested") return;

  console.log(`Attestation #${outcome.attestationId} minted ${outcome.unitsMinted / 1_000} t CO2e of credits`);
  console.log(`Contract call: ${outcome.transaction.url ?? outcome.transaction.hash}`);
  if (outcome.hcs) {
    console.log(`HCS readings:  ${outcome.hcs.dataUrl}`);
    console.log(`HCS report:    ${outcome.hcs.url}`);
  }
}

async function main() {
  const [command, arg, plantArg] = process.argv.slice(2);
  if (command === "create-topic") return createTopic();
  if (command === "attest") {
    const scenario = (arg ?? "healthy") as ScenarioName;
    if (!SCENARIO_NAMES.includes(scenario))
      throw new Error(`Unknown scenario. Use one of: ${SCENARIO_NAMES.join(", ")}`);
    return attest(scenario, plantArg ?? DEMO_PLANTS[0].plantId);
  }
  console.log("Usage: mrv.ts create-topic | attest [scenario] [plantId]");
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
