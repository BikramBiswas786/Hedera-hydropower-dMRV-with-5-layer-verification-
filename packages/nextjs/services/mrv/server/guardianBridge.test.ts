import { POST as crossCheck } from "../../../app/api/guardian/v1/cross-check/route";
import { GET as evidence } from "../../../app/api/guardian/v1/evidence/[timestamp]/route";
import {
  FakeLedger,
  guardianStyleContext,
  keyFrom,
  monitoringReportSubject,
  monitoringReportVc,
  presentAsGuardian,
  signAsGuardian,
  signerFor,
} from "../guardian/fixtures";
import { remoteDidResolver } from "../guardian/hedera";
import { buildResultSchemaContext } from "../guardian/resultSchema";
import { CREDENTIALS_V1, buildDocumentLoader, verifyGuardianCredential } from "../guardian/vc";
import { rateLimit } from "./guardianBridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCHEMA_UUID = "9a0e6f4c-2b1d-4e3f-8a7b-1c2d3e4f5a6b";
const CONTEXT_URL = "ipfs://bafkreiresultcontextresultcontextresultcontextresultco";
const API_KEY = "test-bridge-key-not-a-secret";

const ledger = new FakeLedger();
const bridgeKey = keyFrom("88");
const bridgeDid = ledger.publishDid(bridgeKey, "0.0.4101");

function configure() {
  vi.stubEnv("BRIDGE_ED25519_PRIVATE_KEY", bridgeKey.toStringDer());
  vi.stubEnv("BRIDGE_DID", bridgeDid);
  vi.stubEnv("GUARDIAN_BRIDGE_API_KEY", API_KEY);
  vi.stubEnv(
    "GUARDIAN_BRIDGE_RESULT_SCHEMA",
    JSON.stringify({ type: `${SCHEMA_UUID}&1.0.0`, contextUrl: CONTEXT_URL }),
  );
}

function post(body: unknown, { auth = `Bearer ${API_KEY}`, raw }: { auth?: string | null; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers.authorization = auth;
  return crossCheck(
    new Request("http://localhost/api/guardian/v1/cross-check?policyId=policy-1", {
      method: "POST",
      headers,
      body: raw ?? JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  for (const name of [
    "BRIDGE_ED25519_PRIVATE_KEY",
    "BRIDGE_DID",
    "GUARDIAN_BRIDGE_API_KEY",
    "GUARDIAN_BRIDGE_RESULT_SCHEMA",
    "GUARDIAN_EVIDENCE_TOPIC_IDS",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/guardian/v1/cross-check", () => {
  it("answers 503 with a clear message while the bridge key and DID are missing", async () => {
    const response = await post(monitoringReportVc());
    expect(response.status).toBe(503);
    const { error } = await response.json();
    expect(error).toContain("set BRIDGE_ED25519_PRIVATE_KEY and BRIDGE_DID");
    expect(error).toContain("guardian:publish-did");
  });

  it("answers 503 when the DID does not belong to the key, or the result schema or API key is unset", async () => {
    configure();
    vi.stubEnv("BRIDGE_DID", ledger.publishDid(keyFrom("99"), "0.0.4102"));
    expect((await (await post(monitoringReportVc())).json()).error).toContain("was not derived");
    configure();
    vi.stubEnv("GUARDIAN_BRIDGE_RESULT_SCHEMA", "");
    expect((await post(monitoringReportVc())).status).toBe(503);
    configure();
    vi.stubEnv("GUARDIAN_BRIDGE_API_KEY", "");
    const response = await post(monitoringReportVc());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("GUARDIAN_BRIDGE_API_KEY");
  });

  it("requires the bearer token", async () => {
    configure();
    expect((await post(monitoringReportVc(), { auth: null })).status).toBe(401);
    expect((await post(monitoringReportVc(), { auth: "Bearer wrong" })).status).toBe(401);
  });

  it("rejects bodies over 1 MB, non-JSON, non-VC and unmappable reports", async () => {
    configure();
    expect((await post(null, { raw: "x".repeat(1024 * 1024 + 1) })).status).toBe(413);
    expect((await post(null, { raw: "{not json" })).status).toBe(400);
    expect((await post({ hello: "world" })).status).toBe(400);
    const missing = monitoringReportVc(monitoringReportSubject({ field7: undefined }));
    const response = await post(missing);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("field7");
  });

  it("returns a signed result VC that verifies with the DID resolved from HCS, and logs only the hash", async () => {
    configure();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await post(monitoringReportVc());
    expect(response.status).toBe(200);
    const vc = await response.json();
    expect(vc.issuer).toBe(bridgeDid);
    expect(vc.credentialSubject[0]).toMatchObject({ decision: "MATCH", policyId: "policy-1", issuerOfRecord: "DMRV" });
    expect(Date.parse(vc.issuanceDate)).toBeLessThan(Date.now() - 60_000);
    const loader = buildDocumentLoader(remoteDidResolver(ledger.sources), async iri =>
      iri === CONTEXT_URL ? { documentUrl: iri, document: buildResultSchemaContext(SCHEMA_UUID) } : null,
    );
    await expect(verifyGuardianCredential(vc, loader)).resolves.toBe(true);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain(vc.credentialSubject[0].sourceVcHash);
    expect(logged).not.toContain("field24");
  });

  it("is idempotent for the same source VC", async () => {
    configure();
    const body = monitoringReportVc(
      monitoringReportSubject({ field7: 1000.5, field24: 700.35, field26: 21.0105, field27: 679.3395 }),
    );
    const first = await (await post(body)).json();
    const second = await (await post(body)).json();
    expect(second).toEqual(first);
  });
});

describe("rate limit", () => {
  it("allows 60 requests per minute per bucket, then answers 429", () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) rateLimit("test-bucket", t + i);
    expect(() => rateLimit("test-bucket", t + 61)).toThrow(expect.objectContaining({ httpStatus: 429 }));
    expect(() => rateLimit("test-bucket", t + 60_100)).not.toThrow();
  });
});

describe("GET /api/guardian/v1/evidence/{timestamp}", () => {
  const get = (ref: string, query = "") =>
    evidence(new Request(`http://localhost/api/guardian/v1/evidence/${encodeURIComponent(ref)}${query}`), {
      params: Promise.resolve({ timestamp: encodeURIComponent(ref) }),
    });

  it("needs a topic id from the query or the environment", async () => {
    const response = await get("1758000000.000000001");
    expect(response.status).toBe(400);
    expect((await get("1758000000.000000001", "?topicIds=../x")).status).toBe(400);
  });

  it("verifies a chain through the mirror node and IPFS and refuses a MintToken VC", async () => {
    vi.stubEnv("GUARDIAN_MIRROR_NODE_URL", ledger.mirrorNodeUrl);
    vi.stubEnv("GUARDIAN_IPFS_GATEWAY", ledger.ipfsGateway);
    vi.stubGlobal("fetch", ledger.fetch);
    const registryKey = keyFrom("aa");
    const registry = { ...signerFor(registryKey, "0.0.5101"), did: ledger.publishDid(registryKey, "0.0.5101") };
    const mintContext = `ipfs://${ledger.pin("mintctx2", guardianStyleContext("MintToken", ["tokenId", "amount"]))}`;
    const loader = buildDocumentLoader(remoteDidResolver(ledger.sources), async iri =>
      iri === mintContext
        ? { documentUrl: iri, document: guardianStyleContext("MintToken", ["tokenId", "amount"]) }
        : null,
    );
    const mint = await signAsGuardian(
      {
        id: "urn:uuid:mint",
        type: ["VerifiableCredential"],
        issuer: registry.did,
        issuanceDate: "2026-09-20T00:00:00.000Z",
        "@context": [CREDENTIALS_V1],
        credentialSubject: [
          { tokenId: "0.0.7001", amount: "10", "@context": [mintContext], id: "urn:uuid:s", type: "MintToken" },
        ],
      },
      registry,
      loader,
    );
    const vp = await presentAsGuardian([mint], registry, loader, "urn:uuid:vp");
    const cid = ledger.pin("routevp", vp);
    const ts = ledger.submit("0.0.6101", { id: "m", status: "ISSUE", type: "VP-Document", cid });
    ledger.addMint("0.0.1234-1758009999-000000001", ts);

    const response = await get("0.0.1234@1758009999.000000001", "?topicIds=0.0.6101");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.accepted).toBe(false);
    expect(result.chain[0].signature).toBe("verified");
    expect(result.refusals.join(" ")).toContain("double issuance");
  });
});
