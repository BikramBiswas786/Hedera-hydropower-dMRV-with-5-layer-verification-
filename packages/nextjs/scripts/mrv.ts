/**
 * Command-line access to the same pipeline the app, REST API and MCP tools use.
 *
 *   yarn mrv:create-topic          create the HCS audit topic (prints HCS_TOPIC_ID)
 *   yarn mrv:record [scenario] [plantId]
 *                                  monitoring: verify sample data, publish readings and report to HCS and record the
 *                                  period on DmrvRegistry with the meter's signature. Issues nothing.
 *   yarn mrv:verify <plantId> [approve|reject] [deductionTonnes] [findings]
 *                                  verification, step 1: reproduce the plant's pending records from HCS, publish the
 *                                  verification report and write verification-<plant>-<first>-<last>.json for the VVB
 *   yarn mrv:approve <verification.json>
 *                                  the VVB signs the EIP-712 VerificationStatement with VVB_PRIVATE_KEY (secp256k1
 *                                  only), on its own machine, after reviewing the summary
 *   yarn mrv:submit <verification.json>
 *                                  step 2: relay the signed statement to DmrvRegistry.verifyPeriod; an approval issues
 *                                  credits into the operator's custody
 *   yarn mrv:meter-key             generate a key for a plant's data logger (its address is registered with the plant)
 *   yarn mrv:sign <request.json>   sign the batch's EIP-712 meter statement with METER_PRIVATE_KEY, as the meter
 *                                  would, for this app's registry at the request ledger's sequence (or `domain`)
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { type Hex, hashTypedData } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { DEMO_PLANTS, findDemoPlant } from "~~/services/mrv/demo";
import { defaultMeterDomain } from "~~/services/mrv/network";
import { signDigest, signMeterStatement } from "~~/services/mrv/provenance";
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
  await registerAuditTopic(topicId);
}

/** Points a registry compiled with setAuditTopic at this topic. Older deployments ignore the call. */
async function registerAuditTopic(topicId: string) {
  const { readRelayerKey } = await import("~~/services/mrv/server/config");
  const { hydroChain, hydroTransport, requireDeployment } = await import("~~/services/mrv/server/registry");
  const { createPublicClient, createWalletClient } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const key = readRelayerKey();
  if (!key) return;
  const abi = [
    { type: "function", name: "auditTopic", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
    {
      type: "function",
      name: "setAuditTopic",
      stateMutability: "nonpayable",
      inputs: [{ name: "topic", type: "uint64" }],
      outputs: [],
    },
  ] as const;
  const client = createPublicClient({ chain: hydroChain(), transport: hydroTransport() });
  const topic = BigInt(topicId.replace(/^0\.0\./, ""));
  try {
    const deployment = requireDeployment();
    const current = await client.readContract({ address: deployment.address, abi, functionName: "auditTopic" });
    if (current === topic) return;
    if (current !== 0n) {
      console.warn(`The registry already cites topic ${current}. Leaving it.`);
      return;
    }
    const wallet = createWalletClient({
      account: privateKeyToAccount(key),
      chain: hydroChain(),
      transport: hydroTransport(),
    });
    const hash = await wallet.writeContract({
      address: deployment.address,
      abi,
      functionName: "setAuditTopic",
      args: [topic],
    });
    console.log(`Registered audit topic ${topic} on the registry: ${hash}`);
  } catch {
    console.warn("This registry has no setAuditTopic. Put the topic id in .env.local anyway.");
  }
}

type VerificationFile = {
  plantId: string;
  summary: string;
  statement: import("~~/services/mrv/server/verification").StatementJson;
  typedData: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
    types: Record<string, { name: string; type: string }[]>;
    primaryType: "VerificationStatement";
    message: Record<string, string | number>;
  };
  signature?: Hex;
};

/** Monitoring. Starts where the last record ended so repeated runs never overlap on-chain. */
async function record(scenario: ScenarioName, plantId: string) {
  const { recordReadings, readMeterKey } = await import("~~/services/mrv/server/monitoring");
  const { getProject, requireDeployment } = await import("~~/services/mrv/server/registry");
  const { plantIdToBytes32 } = await import("~~/services/mrv/views");
  const { HYDRO_CHAIN_ID, isLiveHederaChain } = await import("~~/services/mrv/network");

  const profile = findDemoPlant(plantId);
  if (!profile) throw new Error(`Unknown plant. Use one of: ${DEMO_PLANTS.map(p => p.plantId).join(", ")}`);
  const plant = await getProject(plantIdToBytes32(plantId));
  if (!plant) throw new Error(`${plantId} is not registered. Run \`yarn deploy\` first.`);
  const { address } = requireDeployment();

  const end = lastWholeHour();
  const available = Math.floor((end.getTime() / 1_000 - plant.lastPeriodEnd) / HOUR_S);
  // With no unrecorded hours left an APPROVED batch will be refused as overlapping; other decisions still print.
  const hours = available >= 1 ? Math.min(MAX_HOURS, available) : MAX_HOURS;
  const domain = { chainId: HYDRO_CHAIN_ID, registry: address, sequence: plant.ledger.attestations };
  const generated = generateScenario(scenario, { end, hours, plant: profile, domain });
  // On Hedera the public demo meter key is never registered: the server signs with METER_PRIVATE_KEYS instead, so
  // the metering record must name that key's address (the plant's registered meter), not the demo derivation.
  const meterKey = readMeterKey(plantId);
  if (isLiveHederaChain() && !meterKey) throw new Error(`Set METER_PRIVATE_KEYS with a key for ${plantId}`);
  const request = meterKey
    ? {
        ...generated,
        metering: { ...generated.metering, deviceAddress: privateKeyToAddress(meterKey) },
        signature: undefined,
      }
    : generated;

  const outcome = await recordReadings(request);
  const { report } = outcome;
  console.log(`Decision: ${report.decision} (${report.methodology}, ${report.completenessBps / 100}% coverage)`);
  console.log(report.reasoning);
  for (const step of report.equations) console.log(`  ${step.symbol.padEnd(12)} ${step.value} ${step.unit}`);
  if (outcome.status !== "recorded") return;
  if (outcome.hcs) {
    console.log(`HCS readings:  ${outcome.hcs.dataUrl}`);
    console.log(`HCS report:    ${outcome.hcs.url}`);
  }
  console.log(
    `Recorded ${plantId} record ${outcome.sequence} (#${outcome.attestationId}), ER ${outcome.reductionG} g, chain head ${outcome.chainHash}`,
  );
  console.log(`Contract call: ${outcome.transaction.url ?? outcome.transaction.hash}`);
  console.log(`Nothing is issued yet. A VVB verifies it: \`yarn mrv:verify ${plantId}\`.`);
}

/** Verification step 1: the operator's server publishes the VVB's report and writes the statement to sign. */
async function verify(plantId: string | undefined, decision = "approve", deductionT = "0", findings = "") {
  if (!plantId) throw new Error("Usage: yarn mrv:verify <plantId> [approve|reject] [deductionTonnes] [findings]");
  if (decision !== "approve" && decision !== "reject") throw new Error("The decision is approve or reject");
  const { prepareVerification } = await import("~~/services/mrv/server/verification");
  const prepared = await prepareVerification({
    plantId,
    decision,
    deductionG: Math.round(Number(deductionT) * 1e6),
    findings,
  });
  const { pending, report } = prepared;
  for (const r of pending.records) {
    console.log(
      `  record ${r.sequence}: ER ${r.reductionG} g, ${r.reproduction}${r.failedChecks.length ? ` (${r.failedChecks.join(", ")})` : ""}`,
    );
  }
  if (prepared.hcs) console.log(`Verification report on HCS: ${prepared.hcs.url}`);
  const file = `verification-${plantId}-${report.records.first}-${report.records.last}.json`;
  const content: VerificationFile = {
    plantId,
    summary: `${plantId} records ${report.records.first}-${report.records.last}: ${report.decision}, monitored ${report.monitoredG} g, deduction ${report.deductionG} g, issues ${report.unitsToIssue} kg; report ${prepared.reportHash}`,
    statement: prepared.statement,
    typedData: prepared.typedData as unknown as VerificationFile["typedData"],
  };
  writeFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), `${JSON.stringify(content, null, 2)}\n`);
  console.log(`\n${content.summary}`);
  console.log(`Send ${file} to the VVB, who runs \`yarn mrv:approve ${file}\`; then \`yarn mrv:submit ${file}\`.`);
}

/** ED25519 Hedera keys cannot produce an `ecrecover`-able signature. */
function readVvbKey(): Hex {
  const raw = process.env.VVB_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("Set VVB_PRIVATE_KEY to the VVB's secp256k1 (ECDSA) key");
  const hex = raw.replace(/^0x/, "");
  if (/^302e020100300506032b6570/i.test(hex)) {
    throw new Error(
      "VVB_PRIVATE_KEY is a DER ED25519 key; DmrvRegistry verifies statements with ecrecover (secp256k1)",
    );
  }
  const der = hex.match(/^3030020100300706052b8104000a04220420([0-9a-f]{64})$/i);
  if (der) return `0x${der[1]}`;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("VVB_PRIVATE_KEY must be a 32-byte secp256k1 key (hex or DER)");
  return `0x${hex}`;
}

/** On the VVB's machine: review and sign. Nothing is sent anywhere. */
function approve(file: string | undefined) {
  if (!file) throw new Error("Usage: yarn mrv:approve <verification.json>");
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const content = JSON.parse(readFileSync(path, "utf8")) as VerificationFile;
  const { domain, types, primaryType, message } = content.typedData;
  const key = readVvbKey();
  const digest = hashTypedData({
    domain: { ...domain, chainId: BigInt(domain.chainId) },
    types,
    primaryType,
    message: {
      ...message,
      deductionG: BigInt(message.deductionG),
      hcsTopicNum: BigInt(message.hcsTopicNum),
      hcsSequence: BigInt(message.hcsSequence),
    },
  });
  const signature = signDigest(key, digest);
  writeFileSync(path, `${JSON.stringify({ ...content, signature }, null, 2)}\n`);
  console.log(`Reviewed: ${content.summary}`);
  console.log(
    `Signed VerificationStatement ${digest} as VVB ${privateKeyToAddress(key)} for registry ${domain.verifyingContract} on chain ${domain.chainId}`,
  );
}

/** Verification step 2: relay the signed statement. The relayer needs no role. */
async function submit(file: string | undefined) {
  if (!file) throw new Error("Usage: yarn mrv:submit <verification.json>");
  const { submitVerification } = await import("~~/services/mrv/server/verification");
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const content = JSON.parse(readFileSync(path, "utf8")) as VerificationFile;
  if (!content.signature) throw new Error(`${file} has no signature yet: run \`yarn mrv:approve ${file}\``);
  const outcome = await submitVerification({
    plantId: content.plantId,
    statement: content.statement,
    signature: content.signature,
  });
  console.log(
    outcome.status === "issued"
      ? outcome.unitsIssued > 0
        ? `Verification #${outcome.issuanceId} issued ${outcome.unitsIssued / 1_000} t CO2e (VVB ${outcome.verifier})`
        : `Verification #${outcome.issuanceId} approved records ${outcome.records.first}-${outcome.records.last}; nothing to issue, the ER deficit or sub-tonne remainder carries forward (VVB ${outcome.verifier})`
      : `Verification #${outcome.issuanceId} rejected records ${outcome.records.first}-${outcome.records.last} (VVB ${outcome.verifier})`,
  );
  console.log(`Contract call: ${outcome.transaction.url ?? outcome.transaction.hash}`);
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
  const domain = request.domain ?? defaultMeterDomain(request.ledger?.attestations ?? 0);
  const signature = signMeterStatement(key, domain, plantId, request.readings);
  writeFileSync(path, `${JSON.stringify({ ...request, domain, signature }, null, 2)}\n`);
  console.log(
    `Signed the statement for ${request.readings.length} readings of ${plantId} as ${privateKeyToAddress(key)}, for registry ${domain.registry} on chain ${domain.chainId}, sequence ${domain.sequence ?? "legacy"}`,
  );
}

async function main() {
  const [command, arg, plantArg, ...rest] = process.argv.slice(2);
  if (command === "create-topic") return createTopic();
  if (command === "meter-key") return meterKey();
  if (command === "sign") return sign(arg);
  if (command === "approve") return approve(arg);
  if (command === "submit") return submit(arg);
  if (command === "verify") return verify(arg, plantArg, rest[0], rest[1]);
  if (command === "record") {
    const scenario = (arg ?? "healthy") as ScenarioName;
    if (!SCENARIO_NAMES.includes(scenario))
      throw new Error(`Unknown scenario. Use one of: ${SCENARIO_NAMES.join(", ")}`);
    return record(scenario, plantArg ?? DEMO_PLANTS[0].plantId);
  }
  console.log(
    "Usage: mrv.ts create-topic | record [scenario] [plantId] | verify <plantId> [approve|reject] [deductionTonnes] [findings] | approve <verification.json> | submit <verification.json> | meter-key | sign <request.json>",
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
