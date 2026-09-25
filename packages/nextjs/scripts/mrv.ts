/**
 * Command-line access to the same pipeline the app, REST API and MCP tools use.
 *
 *   yarn mrv:create-topic          create the HCS audit topic (prints HCS_TOPIC_ID)
 *   yarn mrv:attest [scenario] [plantId]
 *                                  verify sample monitoring data, anchor it on HCS and attest on-chain
 *   yarn mrv:meter-key             generate a key for a plant's data logger (its address is registered with the plant)
 *   yarn mrv:sign <request.json>   sign the batch's meter statement with METER_PRIVATE_KEY, as the meter would, for
 *                                  this app's registry (or the request's `domain`)
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { DEMO_PLANTS, findDemoPlant } from "~~/services/mrv/demo";
import { defaultMeterDomain } from "~~/services/mrv/network";
import { signMeterStatement } from "~~/services/mrv/provenance";
import { SCENARIO_NAMES, type ScenarioName, generateScenario, lastWholeHour } from "~~/services/mrv/scenarios";
import { verifyRequestSchema } from "~~/services/mrv/schema";

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

function meterKey() {
  const key = generatePrivateKey();
  console.log(
    `Meter address (register it with the plant and put it in the metering record as deviceAddress): ${privateKeyToAddress(key)}`,
  );
  console.log(`Private key (keep it on the data logger only, never in this repository):\n${key}`);
}

/** Signs in place, so a data logger (or its gateway) can run exactly this step before uploading a batch. */
function sign(file: string | undefined) {
  if (!file) throw new Error("Usage: yarn mrv:sign <request.json>");
  const key = process.env.METER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("Set METER_PRIVATE_KEY to the data logger's key (yarn mrv:meter-key creates one)");
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const request = verifyRequestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const plantId = request.plant?.plantId ?? DEMO_PLANTS[0].plantId;
  const domain = request.domain ?? defaultMeterDomain();
  const signature = signMeterStatement(key, domain, plantId, request.readings);
  writeFileSync(path, `${JSON.stringify({ ...request, domain, signature }, null, 2)}\n`);
  console.log(
    `Signed the statement for ${request.readings.length} readings of ${plantId} as ${privateKeyToAddress(key)}, for registry ${domain.registry} on chain ${domain.chainId}`,
  );
}

async function main() {
  const [command, arg, plantArg] = process.argv.slice(2);
  if (command === "create-topic") return createTopic();
  if (command === "meter-key") return meterKey();
  if (command === "sign") return sign(arg);
  if (command === "attest") {
    const scenario = (arg ?? "healthy") as ScenarioName;
    if (!SCENARIO_NAMES.includes(scenario))
      throw new Error(`Unknown scenario. Use one of: ${SCENARIO_NAMES.join(", ")}`);
    return attest(scenario, plantArg ?? DEMO_PLANTS[0].plantId);
  }
  console.log("Usage: mrv.ts create-topic | attest [scenario] [plantId] | meter-key | sign <request.json>");
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
