import { auditAttestation } from "../audit";
import { DEMO_PLANTS, demoMeteringFor, findDemoPlant } from "../demo";
import { ENGINE_VERSION } from "../engine";
import { compareGuardianReport, compareReportSchema } from "../guardian/compare";
import { METHODOLOGY_MARKDOWN } from "../methodology/document";
import { gridEmissionFactorRequestSchema, projectDesignSchema } from "../methodology/schema";
import { HYDRO_CHAIN_ID } from "../network";
import { prepareAnchors } from "../pipeline";
import { PREVIEW_METER_DOMAIN, SCENARIOS, SCENARIO_NAMES, generateScenario } from "../scenarios";
import {
  prepareVerificationSchema,
  recordRequestSchema,
  submitVerificationSchema,
  verifyRequestSchema,
} from "../schema";
import { listCheckoutListings, prepareCheckoutPurchase, prepareCheckoutPurchaseSchema } from "./checkout";
import { prepareDexRetire, prepareDexRetireSchema, readCreditPool } from "./creditPool";
import { readDexCheck } from "./dex";
import { getEngine, listEngines, runEngine, verifyWithEngineSchema } from "./engines";
import { ApiError } from "./errors";
import { traceMint, verifyEvidence } from "./guardianBridge";
import { getPlantDetail, getPortfolio, portfolioQuerySchema } from "./insights";
import { getRetirementCertificate, preparePurchase, preparePurchaseSchema } from "./market";
import { assessDesign, getProject, gridEmissionFactor } from "./methodology";
import { recordReadings } from "./monitoring";
import { getAttestation, getAttestations, getIssuances, getOpenListings, getRegistryOverview } from "./registry";
import { getPendingVerification, prepareVerification, reproduceRecord, submitVerification } from "./verification";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const INSTRUCTIONS = `Hydro dMRV: carbon-credit MRV for grid-connected hydropower on Hedera, following Verra VMR0017 v1.0 with
ACM0002 v22.0 (VT0011 grid factor, VT0008 additionality, embodied-emission leakage) or CDM AMS-I.D / ACM0002 (TOOL07
grid factor), with TOOL03 for fossil fuel. ER = BE - PE - LE, computed by the engine and recomputed on-chain by the
project's methodology module. DmrvRegistry runs the VCS order:
1. Validation: a VVB signs a ValidationApproval over the design and params before the admin registers the project.
2. Monitoring: each period's raw totals are signed by the plant's meter (EIP-712 MeterStatement) and recorded
   (record_monitoring); the module quantifies ER; the record joins a hash chain. Nothing is issued.
3. Verification: a VVB verifies a contiguous run of records. get_pending_verification reproduces each from HCS;
   prepare_verification publishes the verification report and returns the VerificationStatement typed data, which the
   VVB signs with its own key (this server never holds one); submit_verification relays it. Only an approval issues
   HTS credits (1 token = 1 t CO2e, 1 unit = 1 kg) into the operator's custody.
Design: assess_project (applicability, power density, baseline, TOOL07 or VT0011 combined margin, VT0008 additionality).
Monitoring input: generate_sample_telemetry (or real readings) -> verify_telemetry (5 stages). Raw readings and
reports live on HCS; reproduce_attestation re-runs the engine on the published data, checks the registered design,
meter and hash-chain link, and compares every figure with the contract.
Credits are priced in USD per tonne and settled in HBAR through Chainlink HBAR/USD with a Supra fallback;
prepare_purchase returns no transaction if the SaucerSwap pair stored on CreditMarket is more than 3% from the oracle.
Agents buy with their own wallet: get_dex_price -> list_open_listings -> prepare_purchase -> sign and send; retiring
mints an HTS NFT certificate. Credits that have left custody trade in a SaucerSwap WHBAR/credit pool:
get_credit_pool -> prepare_dex_retire { amountKg, buyer, beneficiary } -> sign each step (swap, approve, deposit, retire).
prepare_dex_retire returns no steps when the settlement oracle is paused, the settlement pair is disabled or not a V1 WHBAR pair, that pair or the public mainnet WHBAR/USDC pair is more than 3% from its oracle, or the credit pool is more than 3% from the cheapest open listing.
get_plant and get_portfolio summarise a plant's issuance or a buyer's retirements.
Registry tools read chain ${HYDRO_CHAIN_ID}.`;

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: (error as Error).message }],
  };
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
  const server = new McpServer({ name: "hydro-dmrv", version: "2.0.0" }, { instructions: INSTRUCTIONS });

  server.registerResource(
    "methodology",
    "hydro-dmrv://methodology",
    {
      title: `Methodology as implemented (${ENGINE_VERSION})`,
      mimeType: "text/markdown",
    },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: METHODOLOGY_MARKDOWN,
        },
      ],
    }),
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
        "Deterministic hourly monitoring data for a demo plant, signed by the public demo meter for a preview domain. It verifies in verify_telemetry. The live registry will not accept it. The demo key is not a production meter.",
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
        return {
          ...generateScenario(scenario, {
            hours,
            plant,
            domain: PREVIEW_METER_DOMAIN,
          }),
          demoMeterKeyPublic: true,
          acceptedByLiveRegistry: false,
        };
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
      title: "List monitoring records",
      description:
        "Paginated on-chain monitoring records (attestations): monitored inputs, EG_PJ, BE, PE, LE, ER, the record hash chain, HCS anchors, and status: monitored (awaiting a VVB), issued or rejected.",
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
        "Fetch a monitoring record's HCS report from the public mirror node, hash it and check every monitored input and computed emission figure against the on-chain record.",
      inputSchema: z.object({ attestationId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ attestationId }) => run(async () => auditAttestation(await getAttestation(attestationId))),
  );

  server.registerTool(
    "compare_guardian_report",
    {
      title: "Compare a Guardian figure",
      description:
        "Recompute a Guardian VMR0017 monitoring report (field3–7 grid and generation, field24–27 their BE, PE, LE and ER, in tonnes). Returns MATCH, MISMATCH or NOT_COMPARABLE and the tonne difference. Does not mint and does not sign. Use this before treating a Guardian number as the credit.",
      inputSchema: compareReportSchema,
      annotations: readOnly,
    },
    async input => run(() => compareGuardianReport(input)),
  );

  server.registerTool(
    "verify_guardian_evidence",
    {
      title: "Verify Guardian evidence",
      description:
        "Verify a Hedera Guardian trust chain from the public mirror node and IPFS: pass a VP consensus timestamp, a mint transaction id (0.0.x@secs.nanos, followed through its memo) or nft:<tokenId>:<serial>, plus the policy topic ids. Checks topic, status and every Ed25519 signature, and refuses chains that contain a MintToken VC or a Monitoring Report without a MATCH cross-check.",
      inputSchema: z.object({
        ref: z.string().min(1).max(200),
        topicIds: z
          .array(z.string().regex(/^\d+\.\d+\.\d+$/))
          .max(10)
          .optional(),
      }),
      annotations: readOnly,
    },
    async ({ ref, topicIds }) => run(() => verifyEvidence(ref, topicIds ?? null)),
  );

  server.registerTool(
    "trace_guardian_mint",
    {
      title: "Trace a Guardian mint",
      description:
        "Before buying a token Hedera Guardian minted: is it backed? Pass nft:<tokenId>:<serial>, ft:<tokenId>:<holder account> or a mint transaction id. Follows the memo or NFT metadata to the VP on HCS, reads it from IPFS with every block checked against its CID, verifies the Ed25519 proofs, and checks that the MintToken VC names this token and amount and that the signer's DID was published by the token treasury. verdict: backed, not-backed or incomplete (a source could not be read). Uses only the public mirror node and IPFS.",
      inputSchema: z.object({ ref: z.string().min(1).max(120) }),
      annotations: readOnly,
    },
    async ({ ref }) => run(() => traceMint(ref)),
  );

  server.registerTool(
    "reproduce_attestation",
    {
      title: "Reproduce a monitoring record",
      description:
        "Strongest check available: audit the report, fetch the raw readings it commits to from HCS (reassembling chunks), verify their hash, confirm they were quantified with the registered design and meter, re-run the engine, compare decision, coverage, EG_facility, TEG, fuel, EG_PJ, BE, PE, LE and ER, and recompute the record's hash-chain link from the readings. 'reproduced' means the record follows from public data alone.",
      inputSchema: z.object({ attestationId: z.number().int().min(0) }),
      annotations: readOnly,
    },
    async ({ attestationId }) => run(() => reproduceRecord(attestationId)),
  );

  server.registerTool(
    "list_issuances",
    {
      title: "List verifications and issuances",
      description:
        "Every VVB verification on the registry: the run of records it covered, approve or reject, monitored ER, the VVB's deduction, units issued, the verifier and its HCS verification report.",
      annotations: readOnly,
    },
    async () => run(getIssuances),
  );

  server.registerTool(
    "get_pending_verification",
    {
      title: "Records awaiting verification",
      description:
        "The run of a plant's monitoring records a VVB verifies next (from the first unverified record), each reproduced from HCS with the registered design, meter and hash chain, plus the chain head the statement must sign, the monitored ER and what an approval would issue. Read-only.",
      inputSchema: z.object({
        plantId: z.string().min(1).max(31),
        lastRecord: z.number().int().min(0).optional(),
      }),
      annotations: readOnly,
    },
    async ({ plantId, lastRecord }) => run(() => getPendingVerification(plantId, lastRecord)),
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
    "get_dex_price",
    {
      title: "SaucerSwap HBAR price",
      description:
        "Spot HBAR/USD from the SaucerSwap pair stored on CreditMarket, and from the public mainnet WHBAR/USDC pair 0.0.1462797 against mainnet Chainlink. accepted is false above 3% on either. Reading needs no key.",
      annotations: readOnly,
    },
    async () => run(readDexCheck),
  );

  server.registerTool(
    "get_credit_pool",
    {
      title: "SaucerSwap credit pool",
      description:
        "The SaucerSwap V1 WHBAR/credit pair for this registry, if one exists: reserves in kg and HBAR, spot HBAR and USD per tonne. Reading needs no key. exists is false until the operator seeds the pool.",
      annotations: readOnly,
    },
    async () => run(readCreditPool),
  );

  server.registerTool(
    "prepare_dex_retire",
    {
      title: "Prepare a SaucerSwap buy-and-retire",
      description:
        "Build unsigned transactions that swap HBAR for exactly amountKg of credits on SaucerSwap, deposit them into registry custody and retire them, minting an HTS NFT certificate. Refuses when the settlement oracle is paused, the settlement pair is disabled or not a V1 WHBAR pair, that pair or the public mainnet WHBAR/USDC pair (0.0.1462797) is more than 3% from its oracle, or the credit pool is more than 3% from the cheapest open listing. Returns steps (to, data, value, gas) to sign in order with your own wallet. The server never holds your key.",
      inputSchema: prepareDexRetireSchema,
      annotations: readOnly,
    },
    async request => run(() => prepareDexRetire(request)),
  );

  server.registerTool(
    "prepare_purchase",
    {
      title: "Prepare a credit purchase",
      description:
        "Build an unsigned transaction that buys credits (amountKg) from a listing and by default retires them, minting an HTS NFT certificate to the buyer. Refuses if the settlement pair or the public mainnet WHBAR/USDC pair (0.0.1462797) is more than 3% from its oracle. The contract swaps the HBAR through the SaucerSwap router. Returns chainId, to, data and value (weibar, with a 1% buffer the contract refunds). Sign and send it with your own wallet; this server never holds your key.",
      inputSchema: preparePurchaseSchema,
      annotations: readOnly,
    },
    async request => run(() => preparePurchase(request)),
  );

  server.registerTool(
    "list_methodology_engines",
    {
      title: "List methodology engines",
      description:
        "The methodology engines this deployment runs (hydropower; solar, wind and ocean), each with the methodology and tool versions it implements and the IMethodology contract that recomputes its quantities on-chain. A new methodology is a new engine plus a new module; the registry, market and audit trail are shared.",
      annotations: readOnly,
    },
    async () => run(listEngines),
  );

  server.registerTool(
    "get_methodology_engine",
    {
      title: "Get a methodology engine and an example input",
      description:
        "One engine's documents, scope and on-chain module, with a ready-to-verify example monitoring period for verify_with_engine.",
      inputSchema: z.object({ engine: z.string().min(1) }),
      annotations: readOnly,
    },
    async ({ engine }) => run(() => getEngine(engine)),
  );

  server.registerTool(
    "verify_with_engine",
    {
      title: "Verify a monitoring period with a methodology engine",
      description:
        "Runs one engine on a monitoring period and returns APPROVED / FLAGGED / REJECTED, each finding with the clause it enforces (e.g. VMR0017 §9.2), and the methodology's data and parameters table: every parameter's value, unit, source, QA/QC applied, equation and clause, plus the terms that do not apply to this project. Writes nothing.",
      inputSchema: verifyWithEngineSchema,
      annotations: readOnly,
    },
    async ({ engine, input }) => run(() => runEngine(engine, input)),
  );

  server.registerTool(
    "list_checkout_listings",
    {
      title: "List checkout listings (any HTS token)",
      description:
        "Open UsdCheckout listings: any HTS fungible token at a USD price per whole token, settled like the credit market. Each listing carries its token's Guardian trace verdict: backed (a signed Guardian record backs it), none (the token makes no Guardian claim), not-backed or incomplete.",
      annotations: readOnly,
    },
    async () => run(() => listCheckoutListings()),
  );

  server.registerTool(
    "prepare_checkout_purchase",
    {
      title: "Prepare a checkout purchase",
      description:
        "Build an unsigned UsdCheckout.buy for amount base units of a listing. The listed token is traced first: if it cites a Guardian record that is not backed (a failed signature, token or amount, or an unreadable source), no transaction is built. Returns chainId, to, data and value (weibar, 1% buffer refunded). The buyer must be associated with the token. Sign with your own wallet.",
      inputSchema: prepareCheckoutPurchaseSchema,
      annotations: readOnly,
    },
    async request => run(() => prepareCheckoutPurchase(request)),
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

  if (canWrite) {
    const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

    server.registerTool(
      "record_monitoring",
      {
        title: "Record a monitoring period",
        description:
          "Verify readings against the registered design and the module ledger, check the project's methodology module computes the same ER, dry-run recordMonitoring, then publish readings and report to HCS and record the period. Needs the plant's meter signature (or its server-held key) and a server key that is the plant's operator or reporter. Issues nothing: returns the record's sequence and chain hash for a VVB to verify.",
        inputSchema: recordRequestSchema,
        annotations: write,
      },
      async request => run(() => recordReadings(request)),
    );

    server.registerTool(
      "prepare_verification",
      {
        title: "Publish a VVB verification report",
        description:
          "For a VVB: reproduce the plant's pending records from HCS, publish the verification report (decision, deduction, findings) on HCS and return the EIP-712 VerificationStatement to sign with the VVB's own secp256k1 key. An approval is refused unless every record reproduces. Nothing is issued until submit_verification.",
        inputSchema: prepareVerificationSchema,
        annotations: write,
      },
      async request => run(() => prepareVerification(request)),
    );

    server.registerTool(
      "submit_verification",
      {
        title: "Relay a signed verification",
        description:
          "Relay a VVB's signed VerificationStatement to DmrvRegistry.verifyPeriod. Checks the signer holds VERIFIER_ROLE and is not a party, and that the statement matches the report published at its HCS anchor. An approval issues credits into the operator's custody; a rejection closes the run unissued.",
        inputSchema: submitVerificationSchema,
        annotations: write,
      },
      async request => run(() => submitVerification(request)),
    );
  }

  return server;
}
