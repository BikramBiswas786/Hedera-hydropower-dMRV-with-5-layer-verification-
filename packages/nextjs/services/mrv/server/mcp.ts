import { auditAttestation } from "../audit";
import { DECISION_THRESHOLDS, ENGINE_VERSION, LAYER_WEIGHTS, verifyReadings } from "../engine";
import { HYDRO_CHAIN_ID } from "../network";
import { buildHcsMessage } from "../report";
import { DEMO_PLANT, SCENARIOS, SCENARIO_NAMES, generateScenario } from "../scenarios";
import { verifyRequestSchema } from "../schema";
import { attestReadings } from "./attest";
import { getAttestation, getAttestations, getOpenListings, getRegistryOverview } from "./registry";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const INSTRUCTIONS = `Hydro dMRV: digital measurement, reporting and verification for run-of-river hydropower on Hedera.
Typical flow: generate_sample_telemetry (or bring real readings) -> verify_telemetry -> inspect the 5 layer scores.
Only APPROVED batches can be attested. Attested reports live on HCS; audit_attestation proves an on-chain
attestation matches its HCS report. RECs are HTS tokens (1 token = 1 MWh, 1 unit = 1 kWh) priced in USD and
settled in HBAR through a Chainlink HBAR/USD feed. Registry tools read chain ${HYDRO_CHAIN_ID}.`;

const METHODOLOGY = `# Hydro dMRV verification methodology (${ENGINE_VERSION})

Each batch of interval readings is scored by five layers (0-1), combined with fixed weights:

${Object.entries(LAYER_WEIGHTS)
  .map(([layer, weight]) => `- **${layer}** (${weight * 100}%)`)
  .join("\n")}

1. physics: metered energy vs hydraulic energy E = rho*g*Q*H*eta*t.
2. temporal: contiguous timestamps, no replays or gaps, no implausible jumps.
3. environmental: pH, turbidity and temperature within river-plausible bands.
4. statistical: modified z-score outliers on each interval's metered / hydraulic energy ratio.
5. device: readings within the registered capacity, flow, head and efficiency envelope.

Decision: APPROVED when trust >= ${DECISION_THRESHOLDS.approve} and no interval failed; FLAGGED when trust >= ${DECISION_THRESHOLDS.review};
otherwise REJECTED. Replayed timestamps, energy above nameplate capacity, or >20% of intervals failing physics are
integrity failures and always REJECTED. The contract independently enforces the capacity ceiling, non-overlapping
periods and a minimum trust score.`;

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: (error as Error).message }] };
}

async function run(action: () => unknown) {
  try {
    return ok(await action());
  } catch (error) {
    return fail(error);
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

/** One server per request (stateless). `canWrite` is true only for requests carrying the MRV_API_KEY bearer token. */
export function buildMcpServer({ canWrite }: { canWrite: boolean }): McpServer {
  const server = new McpServer({ name: "hydro-dmrv", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerResource(
    "methodology",
    "hydro-dmrv://methodology",
    { title: "Verification methodology", mimeType: "text/markdown" },
    async uri => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: METHODOLOGY }] }),
  );

  server.registerTool(
    "list_scenarios",
    {
      title: "List sample scenarios",
      description: "Sample telemetry scenarios and the demo plant profile.",
      annotations: { readOnlyHint: true },
    },
    async () => ok({ plant: DEMO_PLANT, scenarios: SCENARIOS }),
  );

  server.registerTool(
    "generate_sample_telemetry",
    {
      title: "Generate sample telemetry",
      description: "Deterministic hourly readings for the demo plant, ending at the last whole hour.",
      inputSchema: z.object({
        scenario: z.enum(SCENARIO_NAMES),
        hours: z.number().int().min(1).max(168).default(24),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ scenario, hours }) => ok({ plant: DEMO_PLANT, readings: generateScenario(scenario, { hours }) }),
  );

  server.registerTool(
    "verify_telemetry",
    {
      title: "Verify telemetry",
      description:
        "Run the 5-layer verification on interval readings. Returns trust score, decision, per-layer results, issues and the exact HCS message that would be anchored. Writes nothing.",
      inputSchema: verifyRequestSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ readings, plant, gridEmissionFactor }) =>
      run(() => {
        const report = verifyReadings(readings, plant ?? DEMO_PLANT, gridEmissionFactor);
        const { message, reportHash } = buildHcsMessage(report, readings);
        return { report, hcsMessage: message, reportHash };
      }),
  );

  server.registerTool(
    "get_registry_overview",
    {
      title: "Registry overview",
      description: "On-chain totals, registered plants, REC token address and the Chainlink HBAR/USD price.",
      annotations: readOnly,
    },
    async () => run(getRegistryOverview),
  );

  server.registerTool(
    "list_attestations",
    {
      title: "List attestations",
      description: "Paginated on-chain attestations with their HCS anchors.",
      inputSchema: z.object({
        start: z.number().int().min(0).default(0),
        count: z.number().int().min(1).max(100).default(20),
      }),
      annotations: readOnly,
    },
    async ({ start, count }) => run(() => getAttestations(start, count)),
  );

  server.registerTool(
    "audit_attestation",
    {
      title: "Audit attestation",
      description:
        "Fetch the attestation's HCS message from the public mirror node, hash it and check hash, plant, period, energy and trust score against the on-chain record.",
      inputSchema: z.object({ attestationId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ attestationId }) => run(async () => auditAttestation(await getAttestation(attestationId))),
  );

  server.registerTool(
    "list_open_listings",
    {
      title: "List REC listings",
      description:
        "Open marketplace listings (USD cents per MWh) with the current HBAR quote for the full listing, in tinybar.",
      annotations: readOnly,
    },
    async () => run(getOpenListings),
  );

  if (canWrite) {
    server.registerTool(
      "submit_attestation",
      {
        title: "Verify, anchor and attest",
        description:
          "Verify readings; if APPROVED, publish the report to HCS and call HydroREC.submitAttestation, minting RECs to the plant operator. Returns Hashscan links.",
        inputSchema: verifyRequestSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async request => run(() => attestReadings(request)),
    );
  }

  return server;
}
