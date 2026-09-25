import { ENGINE_VERSION } from "../engine";
import { gridEmissionFactorRequestSchema, projectDesignSchema } from "../methodology/schema";
import { HYDRO_CHAIN_ID } from "../network";
import { SCENARIO_NAMES } from "../scenarios";
import { verifyRequestSchema } from "../schema";
import { prepareDocumentSchema, publishDocumentSchema, waterRequestSchema } from "../documents/schema";
import { portfolioQuerySchema } from "./insights";
import { preparePurchaseSchema } from "./market";
import { z } from "zod";

/** Request bodies come from the zod schemas that validate them, so the spec cannot drift from the handlers. */
function jsonSchema(schema: z.ZodType) {
  const converted = z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" });
  delete converted.$schema;
  return converted;
}

const json = (schema: object = { type: "object" }) => ({ "application/json": { schema } });
const body = (schema: z.ZodType) => ({ required: true, content: json(jsonSchema(schema)) });
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "503": { $ref: "#/components/responses/Error" },
};
const ok = (description: string) => ({ "200": { description, content: json() }, ...errors });
const path = (name: string, description: string, schema: object = { type: "string" }) => ({
  name,
  in: "path",
  required: true,
  description,
  schema,
});
const query = (name: string, description: string, schema: object = { type: "string" }) => ({
  name,
  in: "query",
  required: false,
  description,
  schema,
});

type Operation = {
  /** The MCP tool with the same behaviour, when there is one, so agents can move between the two surfaces. */
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  requestBody?: { required: boolean; content: Record<string, { schema: object }> };
  [key: string]: unknown;
};

const get = (op: Operation) => ({ get: op });
const post = (op: Operation) => ({ post: op });

const portfolioParams = jsonSchema(portfolioQuerySchema) as { properties: Record<string, object> };

export function buildOpenApi(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Hydro dMRV API",
      version: ENGINE_VERSION,
      summary:
        "Digital MRV for grid-connected hydropower on Hedera (Verra VMR0017 with ACM0002, CDM AMS-I.D / ACM0002, VT0011 / TOOL07, TOOL03)",
      description:
        "Verify and quantify monitoring periods, read the on-chain registry, reproduce any issuance from HCS data, and prepare unsigned purchases for your own wallet. The same capabilities are MCP tools at /api/mcp; where a tool does what an endpoint does, the operationId is the tool's name. Units: energy in Wh, emissions in g CO2e, credits in kg (1 token = 1 t CO2e). Methodology: /methodology and the MCP resource hydro-dmrv://methodology.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: origin }],
    // Reads and unsigned purchases are public; only /api/mrv/attest overrides this with the operator's key.
    security: [],
    externalDocs: { description: "Guide for AI agents", url: `${origin}/llms.txt` },
    tags: [
      { name: "methodology", description: "Project design, TOOL07 / VT0011 grid factor, design documents" },
      { name: "monitoring", description: "Sample telemetry, verification, attestation" },
      { name: "registry", description: `On-chain state on chain ${HYDRO_CHAIN_ID}` },
      { name: "evidence", description: "Audit and reproduction from HCS through the public mirror node" },
      { name: "market", description: "Listings, unsigned purchases, retirements and certificates" },
      { name: "documents", description: "Signed VCS-shaped documents and the safe-water equation. Not a second credit mint." },
    ],
    paths: {
      "/api/methodology/assess": post({
        operationId: "assess_project",
        tags: ["methodology"],
        summary: "Assess a hydro project design",
        description:
          "Applicability, reservoir power density and PE_HP rate, baseline, TOOL07 or VT0011 combined margin, VT0008 additionality, TOOL03 fuel coefficient, leakage and crediting period. Returns the integers registerPlant expects and the designHash.",
        requestBody: body(projectDesignSchema),
        responses: ok("Assessment, registration integers and designHash"),
      }),
      "/api/methodology/grid-emission-factor": post({
        operationId: "calculate_grid_emission_factor",
        tags: ["methodology"],
        summary: "TOOL07 or VT0011 combined margin from per-unit grid data",
        requestBody: body(gridEmissionFactorRequestSchema),
        responses: ok("Operating margin, build-margin sample group, weights and combined margin"),
      }),
      "/api/methodology/projects": get({
        operationId: "list_project_designs",
        tags: ["methodology"],
        summary: "Demo design documents with the on-chain designHash check",
        responses: ok("Design documents"),
      }),
      "/api/methodology/projects/{plantId}": get({
        operationId: "get_project_design",
        tags: ["methodology"],
        summary: "One design document",
        description: "`?raw=1` returns the exact bytes whose SHA-256 is the plant's on-chain designHash.",
        parameters: [path("plantId", "Plant id, e.g. HYDRO-DEMO-01"), query("raw", "1 for the hashed bytes")],
        responses: ok("Design document and assessment"),
      }),
      "/api/mrv/scenarios": get({
        operationId: "list_scenarios",
        tags: ["monitoring"],
        summary: "Sample scenarios, demo plants and their metering records",
        responses: ok("Scenarios, plants, metering including meter addresses"),
      }),
      "/api/mrv/scenarios/{name}": get({
        operationId: "generate_sample_telemetry",
        tags: ["monitoring"],
        summary: "Signed sample monitoring data: a ready /api/mrv/verify body",
        parameters: [
          path("name", "Scenario", { type: "string", enum: SCENARIO_NAMES }),
          query("hours", "Hours of hourly data (1–168)", { type: "integer", minimum: 1, maximum: 168, default: 24 }),
          query("plant", "Demo plant id", { type: "string", default: "HYDRO-DEMO-01" }),
        ],
        responses: ok("{ plant, metering, readings, signature }"),
      }),
      "/api/mrv/verify": post({
        operationId: "verify_telemetry",
        tags: ["monitoring"],
        summary: "Verify and quantify a monitoring period (writes nothing)",
        description:
          "Five stages (applicability, QA/QC including the meter signature, physics, quantification, safeguards) and ER = BE − PE − LE in exact integers. Returns the report, the HCS report message, reportHash and the hash of the data message it commits to.",
        requestBody: body(verifyRequestSchema),
        responses: ok("Verification report and HCS anchors"),
      }),
      "/api/mrv/attest": post({
        operationId: "submit_attestation",
        tags: ["monitoring"],
        summary: "Verify, anchor on HCS and attest on-chain",
        description:
          "Only for the plant operator's server: requires the MRV_API_KEY bearer token. Refuses anything but APPROVED periods and anything the contract's quantify() disagrees with.",
        security: [{ mrvApiKey: [] }],
        requestBody: body(verifyRequestSchema),
        responses: {
          ...ok("Attestation id, credits minted, Hashscan links"),
          "401": { $ref: "#/components/responses/Error" },
        },
      }),
      "/api/registry": get({
        operationId: "get_registry_overview",
        tags: ["registry"],
        summary: "Totals, plants, credit token and both oracle sources",
        responses: ok("Registry overview"),
      }),
      "/api/registry/plants": get({
        operationId: "list_plants",
        tags: ["registry"],
        summary: "Registered plants with design and ledger",
        responses: ok("{ plants }"),
      }),
      "/api/registry/plants/{plantId}": get({
        operationId: "get_plant",
        tags: ["registry"],
        summary: "One plant: design, ledger, lifetime totals and attestations",
        parameters: [path("plantId", "Plant id, e.g. HYDRO-DEMO-02")],
        responses: ok("Plant detail"),
      }),
      "/api/registry/attestations": get({
        operationId: "list_attestations",
        tags: ["registry"],
        summary: "Attestations: monitored inputs, EG_PJ, BE, PE, LE, ER, credits, HCS anchors",
        parameters: [
          query("start", "First attestation id", { type: "integer", minimum: 0, default: 0 }),
          query("count", "Page size", { type: "integer", minimum: 1, maximum: 100, default: 20 }),
        ],
        responses: ok("{ start, attestations }"),
      }),
      "/api/registry/attestations/{id}/audit": get({
        operationId: "audit_attestation",
        tags: ["evidence"],
        summary: "HCS report vs on-chain record",
        parameters: [path("id", "Attestation id", { type: "integer", minimum: 0 })],
        responses: ok("verified | mismatch | no-anchor | unavailable, with per-field checks"),
      }),
      "/api/registry/attestations/{id}/reproduce": get({
        operationId: "reproduce_attestation",
        tags: ["evidence"],
        summary: "Re-derive the issuance from the readings published to HCS",
        description:
          "Audits the report, reassembles the data message, checks its hash, the registered design and the meter signature, re-runs the engine and compares every figure.",
        parameters: [path("id", "Attestation id", { type: "integer", minimum: 0 })],
        responses: ok("reproduced | diverged | no-data | not-auditable, with per-field checks"),
      }),
      "/api/registry/listings": get({
        operationId: "list_open_listings",
        tags: ["market"],
        summary: "Open listings with an HBAR quote for the full listing",
        responses: ok("Listings (units in kg, price in US cents per tonne, quote in tinybar)"),
      }),
      "/api/market/prepare-purchase": post({
        operationId: "prepare_purchase",
        tags: ["market"],
        summary: "Unsigned buy / buyAndRetire transaction for your own wallet",
        requestBody: body(preparePurchaseSchema),
        responses: ok("{ chainId, to, data, value (weibar, 1% refundable buffer), summary }"),
      }),
      "/api/registry/retirements": get({
        operationId: "get_portfolio",
        tags: ["market"],
        summary: "Retirements by an account or on behalf of a beneficiary",
        parameters: [
          query("account", "Retiring EVM address", portfolioParams.properties.account),
          query("beneficiary", "Beneficiary name (exact, case-insensitive)", portfolioParams.properties.beneficiary),
          query("format", "json or csv", { type: "string", enum: ["json", "csv"], default: "json" }),
        ],
        responses: {
          "200": {
            description: "Portfolio with totals, or RFC 4180 CSV for ESG reporting",
            content: { ...json(), "text/csv": { schema: { type: "string" } } },
          },
          ...errors,
        },
      }),
      "/api/registry/retirements/{id}": get({
        operationId: "get_retirement_certificate",
        tags: ["market"],
        summary: "Retirement record and its HTS NFT certificate",
        parameters: [path("id", "Retirement id", { type: "integer", minimum: 0 })],
        responses: ok("Retirement and certificate"),
      }),
      "/api/documents": {
        ...get({
          operationId: "list_documents",
          tags: ["documents"],
          summary: "Sealed demo documents, optionally for one subject",
          parameters: [query("subjectId", "Plant or water project id")],
          responses: ok("Documents"),
        }),
        ...post({
          operationId: "publish_document",
          tags: ["documents"],
          summary: "Store a wallet-signed document",
          requestBody: body(publishDocumentSchema),
          responses: ok("Stored"),
          security: [{ mrvApiKey: [] }],
        }),
      },
      "/api/documents/{subjectId}": get({
        operationId: "get_trust_chain",
        tags: ["documents"],
        summary: "Trust chain for one subject",
        parameters: [path("subjectId", "Plant or water project id")],
        responses: ok("Chain status"),
      }),
      "/api/documents/prepare": post({
        operationId: "prepare_document",
        tags: ["documents"],
        summary: "Hash to sign; writes nothing",
        requestBody: body(prepareDocumentSchema),
        responses: ok("Hash and message"),
      }),
      "/api/work": get({
        operationId: "run_public_work",
        tags: ["documents"],
        summary: "Public describe-to-verify playbook",
        parameters: [query("subjectId", "Defaults to HYDRO-DEMO-01")],
        responses: ok("Steps and chain"),
      }),
      "/api/water/quantify": post({
        operationId: "quantify_safe_water",
        tags: ["documents"],
        summary: "Illustrative VMR0015 quantification",
        requestBody: body(waterRequestSchema),
        responses: ok("Tonnes, not hydro credits"),
      }),
    },
    components: {
      securitySchemes: {
        mrvApiKey: { type: "http", scheme: "bearer", description: "MRV_API_KEY, held by the plant operator" },
      },
      responses: {
        Error: {
          description: "Caller mistake or unavailable dependency",
          content: json({ type: "object", properties: { error: { type: "string" } }, required: ["error"] }),
        },
      },
    },
    "x-mcp": { url: `${origin}/api/mcp`, transport: "streamable-http" },
  };
}
