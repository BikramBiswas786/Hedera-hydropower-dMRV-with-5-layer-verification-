import { ENGINE_VERSION } from "../engine";
import { describeEngines } from "../engines";
import { compareReportSchema } from "../guardian/compare";
import { gridEmissionFactorRequestSchema, projectDesignSchema } from "../methodology/schema";
import { HYDRO_CHAIN_ID } from "../network";
import { SCENARIO_NAMES } from "../scenarios";
import {
  prepareVerificationSchema,
  recordRequestSchema,
  submitVerificationSchema,
  verifyRequestSchema,
} from "../schema";
import { prepareCheckoutPurchaseSchema } from "./checkout";
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
    // Reads and unsigned purchases are public; recording and verification writes override this with the server key.
    security: [],
    externalDocs: { description: "Guide for AI agents", url: `${origin}/llms.txt` },
    tags: [
      { name: "methodology", description: "Project design, TOOL07 / VT0011 grid factor, design documents" },
      { name: "monitoring", description: "Sample telemetry, verification, monitoring records" },
      { name: "verification", description: "VVB verification of monitoring records; only an approval issues credits" },
      { name: "registry", description: `On-chain state on chain ${HYDRO_CHAIN_ID}` },
      { name: "evidence", description: "Audit and reproduction from HCS through the public mirror node" },
      { name: "market", description: "Listings, unsigned purchases, retirements and certificates" },
      {
        name: "guardian",
        description: "Hedera Guardian bridge: signed cross-check VCs and evidence verification (docs/GUARDIAN.md)",
      },
    ],
    paths: {
      "/api/methodology/compare": post({
        operationId: "compare_guardian_report",
        tags: ["guardian"],
        summary: "Recompute a Guardian monitoring figure",
        description:
          "Runs a Guardian VMR0017 monitoring report through the same integers the registry uses. Returns MATCH, MISMATCH, or NOT_COMPARABLE, plus the tonne difference. Does not mint and does not sign. No API key.",
        requestBody: body(compareReportSchema),
        responses: {
          ...ok("decision, oursT, theirsT, deltaTonnes, notes"),
          "422": { $ref: "#/components/responses/Error" },
        },
      }),
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
      "/api/mrv/engines": get({
        operationId: "list_methodology_engines",
        tags: ["monitoring"],
        summary: "Methodology engines: documents implemented and the on-chain IMethodology module of each",
        responses: ok("{ engines: [{ id, title, documents, scope, contract }] }"),
      }),
      "/api/mrv/engines/{id}": get({
        operationId: "get_methodology_engine",
        tags: ["monitoring"],
        summary: "One engine and a ready-to-verify example monitoring period",
        parameters: [path("id", "Engine id", { type: "string", enum: describeEngines().map(e => e.id) })],
        responses: ok("{ id, title, documents, scope, contract, example }"),
      }),
      "/api/mrv/engines/{id}/verify": post({
        operationId: "verify_with_engine",
        tags: ["monitoring"],
        summary: "Verify with one engine: decision, findings with clauses, the methodology's data and parameters table",
        parameters: [path("id", "Engine id", { type: "string", enum: describeEngines().map(e => e.id) })],
        requestBody: { required: true, content: json() },
        responses: ok(
          "{ engine, methodology, decision, reasoning, stages[], findings[], reductionG, unitsMinted, monitoring }",
        ),
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
      "/api/mrv/record": post({
        operationId: "record_monitoring",
        tags: ["monitoring"],
        summary: "Record a monitoring period on DmrvRegistry (issues nothing)",
        description:
          "Only for the plant operator's server: requires the MRV_API_KEY bearer token, and the server key must be the plant's operator or the reporter it named. Verifies the readings against the registered design and module ledger, checks the project's module computes the same ER, dry-runs recordMonitoring, then publishes readings and report to HCS and records the period with the meter's EIP-712 signature. Returns the record's sequence and hash-chain head.",
        security: [{ mrvApiKey: [] }],
        requestBody: body(recordRequestSchema),
        responses: {
          ...ok("not-eligible (report) or recorded (attestationId, sequence, reductionG, chainHash, HCS links)"),
          "401": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      }),
      "/api/mrv/verification": {
        get: {
          operationId: "get_pending_verification",
          tags: ["verification"],
          summary: "The run of records a VVB verifies next, each reproduced from HCS",
          parameters: [
            query("plantId", "Plant id, e.g. HYDRO-DEMO-01", { type: "string" }),
            query("lastRecord", "Last record of the run (default: the latest)", { type: "integer", minimum: 0 }),
          ],
          responses: ok(
            "{ pending: { firstRecord, lastRecord, records, recordsHash, monitoredG, unitsIfApproved } | null }",
          ),
        },
        post: {
          operationId: "prepare_verification",
          tags: ["verification"],
          summary: "Publish the VVB's verification report and return the statement to sign",
          description:
            "Reproduces the pending records from HCS, publishes the verification report (decision, deduction, findings) and returns the EIP-712 VerificationStatement. The VVB signs it with its own secp256k1 key (eth_signTypedData_v4 or `yarn mrv:approve`). An approval is refused unless every record reproduces. Requires the MRV_API_KEY bearer token because it publishes.",
          security: [{ mrvApiKey: [] }],
          requestBody: body(prepareVerificationSchema),
          responses: {
            ...ok("{ status: awaiting-signature, report, reportHash, hcs, statement, typedData }"),
            "401": { $ref: "#/components/responses/Error" },
            "409": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/mrv/verification/submit": post({
        operationId: "submit_verification",
        tags: ["verification"],
        summary: "Relay a VVB-signed VerificationStatement to verifyPeriod",
        description:
          "Checks the signer holds VERIFIER_ROLE and is not the operator, meter or reporter, and that the statement matches the report at its HCS anchor, then relays verifyPeriod. An approval issues credits into the operator's custody; a rejection closes the run unissued. Anyone can send the same call from their own wallet; this endpoint uses the server's gas and so needs the bearer token.",
        security: [{ mrvApiKey: [] }],
        requestBody: body(submitVerificationSchema),
        responses: {
          ...ok("{ status: issued | rejected, issuanceId, unitsIssued, verifier, transaction }"),
          "401": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
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
        summary: "One plant: design, ledger, totals, monitoring records and verifications",
        parameters: [path("plantId", "Plant id, e.g. HYDRO-DEMO-02")],
        responses: ok("Plant detail"),
      }),
      "/api/registry/attestations": get({
        operationId: "list_attestations",
        tags: ["registry"],
        summary: "Monitoring records: monitored inputs, EG_PJ, BE, PE, LE, ER, hash chain, HCS anchors, status",
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
        summary: "Re-derive a monitoring record from the readings published to HCS",
        description:
          "Audits the report, reassembles the data message, checks its hash, the registered design and meter and the meter signature, re-runs the engine, compares every figure, and recomputes the record's hash-chain link.",
        parameters: [path("id", "Attestation id", { type: "integer", minimum: 0 })],
        responses: ok("reproduced | diverged | no-data | not-auditable, with per-field checks"),
      }),
      "/api/registry/issuances": get({
        operationId: "list_issuances",
        tags: ["registry"],
        summary: "Every VVB verification: records covered, decision, deduction, units issued, report",
        responses: ok("{ issuances }"),
      }),
      "/api/registry/listings": get({
        operationId: "list_open_listings",
        tags: ["market"],
        summary: "Open listings with an HBAR quote for the full listing",
        responses: ok("Listings (units in kg, price in US cents per tonne, quote in tinybar)"),
      }),
      "/api/market/dex": get({
        operationId: "get_dex_price",
        tags: ["market"],
        summary: "Settlement pair and the public mainnet WHBAR/USDC pair versus their oracles",
        responses: ok("Price, deviation in basis points, and whether a purchase may be built"),
      }),
      "/api/market/prepare-purchase": post({
        operationId: "prepare_purchase",
        tags: ["market"],
        summary: "Unsigned buy / buyAndRetire transaction for your own wallet",
        requestBody: body(preparePurchaseSchema),
        responses: ok("{ chainId, to, data, value (weibar, 1% refundable buffer), summary }"),
      }),
      "/api/checkout/listings": get({
        operationId: "list_checkout_listings",
        tags: ["market"],
        summary: "Open UsdCheckout listings of any HTS token, each with its Guardian trace verdict",
        responses: ok("{ checkout, listings[] } with guardian.verdict backed | none | not-backed | incomplete"),
      }),
      "/api/checkout/prepare-purchase": post({
        operationId: "prepare_checkout_purchase",
        tags: ["market"],
        summary: "Unsigned UsdCheckout.buy; refused (409) when the token cites a Guardian record that is not backed",
        requestBody: body(prepareCheckoutPurchaseSchema),
        responses: ok("{ chainId, to, data, value (weibar, 1% refundable buffer), summary, listing }"),
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
      "/api/guardian/v1/cross-check": post({
        operationId: "guardian_cross_check",
        tags: ["guardian"],
        summary: "Cross-check a Guardian Monitoring Report VC and return a signed result VC",
        description:
          'Called by a Guardian policy\'s httpRequestBlock with the Monitoring Report VC (or a one-element array). Runs the dMRV engine on the mapped fields and answers with a "DMRV Cross-Check Result" VC signed with Ed25519Signature2018 by the bridge did:hedera key. Requires the GUARDIAN_BRIDGE_API_KEY bearer; 503 until BRIDGE_ED25519_PRIVATE_KEY, BRIDGE_DID and GUARDIAN_BRIDGE_RESULT_SCHEMA are set. Max body 1 MB, idempotent on the source VC hash. Not an MCP tool.',
        security: [{ guardianBridgeKey: [] }],
        parameters: [query("policyId", "Guardian policy id, selects the result schema and is echoed in the result")],
        requestBody: { required: true, content: json({ type: "object", description: "Guardian VC document" }) },
        responses: {
          ...ok("W3C Verifiable Credential (DMRV Cross-Check Result)"),
          "401": { $ref: "#/components/responses/Error" },
          "413": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
        },
      }),
      "/api/guardian/v1/trace": get({
        operationId: "trace_guardian_mint",
        tags: ["guardian"],
        summary: "Is this Guardian-minted token backed? (buyer's check)",
        description:
          "Follows a Guardian mint to its signed record using only the public mirror node and IPFS: the mint memo or NFT metadata names the VP's consensus timestamp; the VP is read from IPFS with every block checked against its CID; its Ed25519 proofs are verified with DIDs resolved from HCS; the MintToken VC must name this token and amount (NFTs: the serials citing the VP must equal it); the signer's DID-Document message must have been paid for by the token treasury. verdict is backed, not-backed or incomplete.",
        parameters: [query("ref", "nft:<tokenId>:<serial>, ft:<tokenId>:<holder account>, or a mint transaction id")],
        responses: {
          ...ok("{ verdict, token, mint, record, mintVc, registry, sources, checks }"),
          "400": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
        },
      }),
      "/api/guardian/v1/evidence/{timestamp}": get({
        operationId: "verify_guardian_evidence",
        tags: ["guardian"],
        summary: "Verify Guardian evidence from the mirror node and IPFS",
        description:
          "Accepts a VP consensus timestamp, a mint transaction id (0.0.x@secs.nanos, followed through its memo) or nft:<tokenId>:<serial>. Checks the HCS message topic and status, fetches the VP from IPFS, verifies every signature and walks the related documents. Refuses any chain that contains a MintToken VC (the credit was already issued by Guardian) and any Monitoring Report without a MATCH cross-check.",
        parameters: [
          path("timestamp", "Consensus timestamp, mint transaction id or nft:<tokenId>:<serial>"),
          query("topicIds", "Comma-separated Guardian policy topic ids; defaults to GUARDIAN_EVIDENCE_TOPIC_IDS"),
        ],
        responses: {
          ...ok("{ accepted, refusals, notes, chain, crossChecks, evidenceHash }"),
          "422": { $ref: "#/components/responses/Error" },
        },
      }),
    },
    components: {
      securitySchemes: {
        mrvApiKey: { type: "http", scheme: "bearer", description: "MRV_API_KEY, held by the plant operator" },
        guardianBridgeKey: {
          type: "http",
          scheme: "bearer",
          description: "GUARDIAN_BRIDGE_API_KEY, configured in the Guardian policy's httpRequestBlock headers",
        },
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
