import { auditAttestation, reproduceAttestation } from "../audit";
import { DEMO_PLANTS, demoMeteringFor, findDemoPlant } from "../demo";
import { ENGINE_VERSION } from "../engine";
import { METHODOLOGY_MARKDOWN } from "../methodology/document";
import { gridEmissionFactorRequestSchema, projectDesignSchema } from "../methodology/schema";
import { HYDRO_CHAIN_ID } from "../network";
import { prepareAnchors } from "../pipeline";
import { SCENARIOS, SCENARIO_NAMES, generateScenario } from "../scenarios";
import { verifyRequestSchema } from "../schema";
import { plantIdToBytes32 } from "../views";
import { listDocuments, prepareDocument, publishDocument, trustChainFor } from "../documents/server";
import { prepareDocumentSchema, publishDocumentSchema, waterRequestSchema } from "../documents/schema";
import { runPublicWork } from "../documents/work";
import { quantifySafeWater } from "../water/vmr0015";
import { attestReadings } from "./attest";
import { ApiError } from "./errors";
import { getPlantDetail, getPortfolio, portfolioQuerySchema } from "./insights";
import { getRetirementCertificate, preparePurchase, preparePurchaseSchema } from "./market";
import { assessDesign, getProject, gridEmissionFactor } from "./methodology";
import { getAttestation, getAttestations, getOpenListings, getPlant, getRegistryOverview } from "./registry";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const INSTRUCTIONS = `Hydro dMRV: carbon-credit MRV for grid-connected hydropower on Hedera, following Verra VMR0017 v1.0 with
ACM0002 v22.0 (demo plants; VT0011 grid factor, VT0008 additionality, embodied-emission leakage) or CDM AMS-I.D /
ACM0002 (TOOL07 grid factor), with TOOL03 for fossil fuel. ER = BE - PE - LE, computed by the engine and recomputed on-chain.
Design: assess_project (applicability, power density, baseline, TOOL07 or VT0011 combined margin, VT0008 additionality) -> registration integers.
Monitoring: generate_sample_telemetry (or real readings) -> verify_telemetry (5 stages: applicability, QA/QC, physics,
quantification, safeguards). Only APPROVED periods can be attested. Raw readings and reports live on HCS;
reproduce_attestation re-runs the engine on the published data and compares every figure with the contract.
Credits are HTS tokens (1 token = 1 t CO2e, 1 unit = 1 kg) priced in USD per tonne and settled in HBAR through
Chainlink HBAR/USD with a Supra fallback. Agents buy with their own wallet: list_open_listings -> prepare_purchase ->
sign and send; retiring mints an HTS NFT certificate. get_plant and get_portfolio summarise a plant's issuance or a
buyer's retirements for reporting. Registry tools read chain ${HYDRO_CHAIN_ID}.`;

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

async function reproduce(attestationId: number) {
  const attestation = await getAttestation(attestationId);
  const plant = await getPlant(plantIdToBytes32(attestation.plantId));
  return reproduceAttestation(attestation, fetch, plant?.design, plant?.meter);
}

/** One server per request (stateless). `canWrite` is true only for requests carrying the MRV_API_KEY bearer token. */
export function buildMcpServer({ canWrite }: { canWrite: boolean }): McpServer {
  const server = new McpServer({ name: "hydro-dmrv", version: "2.0.0" }, { instructions: INSTRUCTIONS });

  server.registerResource(
    "methodology",
    "hydro-dmrv://methodology",
    { title: `Methodology as implemented (${ENGINE_VERSION})`, mimeType: "text/markdown" },
    async uri => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: METHODOLOGY_MARKDOWN }] }),
  );

  server.registerTool(
    "list_scenarios",
    {
      title: "List sample scenarios",
      description:
        "Sample monitoring scenarios, the demo plant profiles (registered design + hydraulics) and each plant's metering record, including the address of the meter key that signs its readings.",
      annotations: { readOnlyHint: true },
    },
    async () =>
      ok({
        plants: DEMO_PLANTS,
        metering: Object.fromEntries(DEMO_PLANTS.map(plant => [plant.plantId, demoMeteringFor(plant.plantId)])),
        scenarios: SCENARIOS,
      }),
  );

  server.registerTool(
    "generate_sample_telemetry",
    {
      title: "Generate sample telemetry",
      description:
        "Deterministic hourly monitoring data (gross generation, export/import, check meter, flow, head, fuel, water quality) for a demo plant, ending at the last whole hour and signed by the plant's demo meter key. The result is a ready verify_telemetry request; changing any reading invalidates the signature.",
      inputSchema: z.object({
        scenario: z.enum(SCENARIO_NAMES),
        hours: z.number().int().min(1).max(168).default(24),
        plantId: z.string().default(DEMO_PLANTS[0].plantId),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ scenario, hours, plantId }) =>
      run(() => {
        const plant = findDemoPlant(plantId);
        if (!plant) throw new ApiError(`Unknown demo plant ${plantId}`, 404);
        return generateScenario(scenario, { hours, plant });
      }),
  );

  server.registerTool(
    "verify_telemetry",
    {
      title: "Verify and quantify a monitoring period",
      description:
        "Run the 5-stage verification and the AMS-I.D/ACM0002 quantification on interval readings, including the meter signature check when the metering record names a meter key. Returns decision, provenance, stages, issues, monitored quantities, EG_PJ/BE/PE/LE/ER with an equation trace, the exact HCS report message and the hash of the raw-data message it commits to. Pass `ledger` (from get_registry_overview) to quantify against the plant's on-chain state. Writes nothing.",
      inputSchema: verifyRequestSchema,
      annotations: { readOnlyHint: true },
    },
    async request =>
      run(() => {
        const { report, data, preview } = prepareAnchors(request);
        return {
          report,
          hcsMessage: preview.message,
          reportHash: preview.reportHash,
          dataHash: data.dataHash,
          dataChunks: data.chunks,
        };
      }),
  );

  server.registerTool(
    "assess_project",
    {
      title: "Assess a project design",
      description:
        "Check a hydro project design against VMR0017 (with ACM0002) or AMS-I.D / ACM0002: applicability (VMR0017: ≤ 15 MW, LDC host country, VT0008 additionality evidence), reservoir power density and PE_HP rate, baseline (EG_historical + σ for retrofits), combined margin (VT0011 for VMR0017, TOOL07 otherwise), TOOL03 fuel coefficient, leakage and crediting period. Returns the integers registerPlant expects and the design hash.",
      inputSchema: projectDesignSchema,
      annotations: { readOnlyHint: true },
    },
    async design => run(() => assessDesign(design)),
  );

  server.registerTool(
    "calculate_grid_emission_factor",
    {
      title: "Grid emission factor (TOOL07 / VT0011)",
      description:
        'Ex-ante combined margin from per-unit grid data: simple / simple adjusted / average OM (options A1 and A2, 3-year weighted), BM sample group and weights by technology and crediting period. tool: "TOOL07" (default) or "VT0011" (Verra; BM over all units incl. VCS/CDM, TOOL09 efficiency for old BM units, hydro weights 0.4/0.6). IPCC lower bounds apply where plant data is missing.',
      inputSchema: gridEmissionFactorRequestSchema,
      annotations: { readOnlyHint: true },
    },
    async input => run(() => gridEmissionFactor(input)),
  );

  server.registerTool(
    "get_project_design",
    {
      title: "Get a registered project design",
      description:
        "The design document of a demo plant (sha256 of `document` is the on-chain designHash), its assessment and whether the on-chain registration matches.",
      inputSchema: z.object({ plantId: z.string() }),
      annotations: readOnly,
    },
    async ({ plantId }) => run(() => getProject(plantId)),
  );

  server.registerTool(
    "get_registry_overview",
    {
      title: "Registry overview",
      description:
        "On-chain totals (credits issued and retired in kg CO2e), registered plants with their design and ledger, the credit token and both HBAR/USD oracle sources.",
      annotations: readOnly,
    },
    async () => run(getRegistryOverview),
  );

  server.registerTool(
    "get_plant",
    {
      title: "Plant detail",
      description:
        "One registered plant: design (methodology, capacity, reservoir power density, grid factor, crediting period), ledger (crediting year, carried balance), lifetime totals (EG, BE, PE_HP, PE_FF, ER, credits, coverage, credits per MWh) and every attestation with its HCS report link.",
      inputSchema: z.object({ plantId: z.string().min(1).max(31) }),
      annotations: readOnly,
    },
    async ({ plantId }) => run(() => getPlantDetail(plantId)),
  );

  server.registerTool(
    "list_attestations",
    {
      title: "List attestations",
      description: "Paginated on-chain attestations: monitored inputs, EG_PJ, BE, PE, LE, ER, credits and HCS anchors.",
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
        "Fetch the attestation's HCS report from the public mirror node, hash it and check every monitored input and computed emission figure against the on-chain record.",
      inputSchema: z.object({ attestationId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ attestationId }) => run(async () => auditAttestation(await getAttestation(attestationId))),
  );

  server.registerTool(
    "reproduce_attestation",
    {
      title: "Reproduce attestation",
      description:
        "Strongest check available: audit the report, fetch the raw readings it commits to from HCS (reassembling chunks), verify their hash, confirm they were quantified with the registered design, re-run the engine and compare decision, coverage, EG_facility, TEG, fuel, EG_PJ, BE, PE, ER and credits. 'reproduced' means the issuance follows from public data alone.",
      inputSchema: z.object({ attestationId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ attestationId }) => run(() => reproduce(attestationId)),
  );

  server.registerTool(
    "list_open_listings",
    {
      title: "List credit listings",
      description:
        "Open marketplace listings (units in kg CO2e, price in USD cents per tonne) with the current HBAR quote for the full listing, in tinybar.",
      annotations: readOnly,
    },
    async () => run(getOpenListings),
  );

  server.registerTool(
    "prepare_purchase",
    {
      title: "Prepare a credit purchase",
      description:
        "Build an unsigned transaction that buys credits (amountKg) from a listing and by default retires them, minting an HTS NFT certificate to the buyer. Returns chainId, to, data and value (weibar, with a 1% buffer the contract refunds). Sign and send it with your own wallet; this server never holds your key.",
      inputSchema: preparePurchaseSchema,
      annotations: readOnly,
    },
    async request => run(() => preparePurchase(request)),
  );

  server.registerTool(
    "get_retirement_certificate",
    {
      title: "Get retirement certificate",
      description:
        "Retirement record with beneficiary, amount (kg CO2e) and its HTS NFT certificate (serial, whether it reached the wallet, Hashscan link).",
      inputSchema: z.object({ retirementId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ retirementId }) => run(() => getRetirementCertificate(retirementId)),
  );

  server.registerTool(
    "get_portfolio",
    {
      title: "Retirement portfolio",
      description:
        "Credits retired by an account or on behalf of a beneficiary (exact, case-insensitive), newest first, with totals in kg CO2e, NFT certificate serials and links; the account's unlisted custody balance too. Pass both to get a company's full record. The same data as CSV: GET /api/registry/retirements?format=csv.",
      inputSchema: portfolioQuerySchema,
      annotations: readOnly,
    },
    async query => run(() => getPortfolio(query)),
  );

  server.registerTool(
    "list_documents",
    {
      title: "List sealed documents",
      description:
        "VCS-shaped project description, validation, registry decision, monitoring report and verification report for a demo plant. Each later document cites the previous hash. Reading needs no key. These documents do not mint credits.",
      inputSchema: z.object({ subjectId: z.string().optional() }),
      annotations: readOnly,
    },
    async ({ subjectId }) => run(() => listDocuments(subjectId)),
  );

  server.registerTool(
    "get_trust_chain",
    {
      title: "Trust chain for a project",
      description: "Walks the sealed documents in order and reports described, validated, registered, monitoring, issued, or broken.",
      inputSchema: z.object({ subjectId: z.string().min(1) }),
      annotations: readOnly,
    },
    async ({ subjectId }) => run(() => trustChainFor(subjectId)),
  );

  server.registerTool(
    "prepare_document",
    {
      title: "Hash a document for wallet signing",
      description: "Returns the exact message to sign. The caller signs it with their own wallet. Nothing is stored.",
      inputSchema: prepareDocumentSchema,
      annotations: readOnly,
    },
    async input => run(() => prepareDocument(input)),
  );

  server.registerTool(
    "quantify_safe_water",
    {
      title: "Illustrative VMR0015 safe-water quantification",
      description:
        "AMS-III.AV as revised by VMR0015: 5.5 L/person/day cap, 26% TOOL30 discount, 90% water-quality gate. Not a hydro credit and not a Verra issuance.",
      inputSchema: waterRequestSchema,
      annotations: readOnly,
    },
    async input => run(() => quantifySafeWater(input)),
  );

  server.registerTool(
    "run_public_work",
    {
      title: "Public multi-step job",
      description: "The describe, validate, register, monitor and verify playbook for a subject, with the document chain attached.",
      inputSchema: z.object({ subjectId: z.string().min(1).default("HYDRO-DEMO-01") }),
      annotations: readOnly,
    },
    async ({ subjectId }) => run(() => runPublicWork(subjectId)),
  );

  if (canWrite) {
    server.registerTool(
      "submit_attestation",
      {
        title: "Verify, anchor and attest",
        description:
          "Verify readings against the plant's registered design and on-chain ledger; if APPROVED and the contract's own quantify() agrees, publish readings and report to HCS and call HydroCreditRegistry.submitAttestation, minting credits to the plant operator. Returns Hashscan links.",
        inputSchema: verifyRequestSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      async request => run(() => attestReadings(request)),
    );

    server.registerTool(
      "publish_document",
      {
        title: "Store a signed document",
        description:
          "Checks the hash and the wallet signature, then keeps the document for this server process. Requires the operator bearer token. Does not mint hydro credits.",
        inputSchema: publishDocumentSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async input => run(() => publishDocument(input)),
    );
  }

  return server;
}
