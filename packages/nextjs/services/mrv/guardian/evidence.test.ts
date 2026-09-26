import { evidenceHash, resolveEvidenceTimestamp, verifyGuardianEvidence } from "./evidence";
import {
  FakeLedger,
  guardianStyleContext,
  keyFrom,
  monitoringReportSubject,
  presentAsGuardian,
  signAsGuardian,
  signerFor,
} from "./fixtures";
import { remoteDidResolver } from "./hedera";
import { CREDENTIALS_V1, buildDocumentLoader } from "./vc";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * A Guardian trust chain on a fake mirror node + IPFS: the Standard Registry's DID on its own topic, the Monitoring
 * Report VC and the VP on the policy topic, schema contexts on IPFS, the mint memo pointing at the VP.
 */
const POLICY_TOPIC = "0.0.6001";
const MR_UUID = "e801fa39-07b6-4da0-973a-13c9acdb6b76";
const MR_FIELDS = Object.keys(monitoringReportSubject()).filter(k => !["@context", "id", "type"].includes(k));

let ledger: FakeLedger;
let registry: ReturnType<typeof signerFor>;
let loader: ReturnType<typeof buildDocumentLoader>;
let mrContextUrl: string;
let mintContextUrl: string;

function vcBody(subject: object, id: string) {
  return {
    id,
    type: ["VerifiableCredential"],
    issuer: registry.did,
    issuanceDate: "2026-09-20T00:00:00.000Z",
    "@context": [CREDENTIALS_V1],
    credentialSubject: [subject],
  };
}

async function monitoringReport(overrides: Record<string, unknown> = {}) {
  const subject = { ...monitoringReportSubject(overrides), "@context": [mrContextUrl], type: `${MR_UUID}&1.0.0` };
  return signAsGuardian(vcBody(subject, "urn:uuid:mr-1"), registry, loader);
}

async function mintVc() {
  const subject = {
    date: "2026-09-21",
    tokenId: "0.0.7001",
    amount: "679",
    "@context": [mintContextUrl],
    id: "urn:uuid:m",
    type: "MintToken&1.0.0",
  };
  return signAsGuardian(vcBody(subject, "urn:uuid:mint-1"), registry, loader);
}

async function publishVp(vcs: object[], extra: Record<string, unknown> = {}, topic = POLICY_TOPIC) {
  const vp = await presentAsGuardian(vcs, registry, loader, "urn:uuid:vp-1");
  const cid = ledger.pin(`vp${Math.random().toString(36).slice(2, 10)}`, vp);
  return ledger.submit(topic, {
    id: "m1",
    status: "ISSUE",
    type: "VP-Document",
    action: "create-vp-document",
    lang: "en-US",
    cid,
    uri: `ipfs://${cid}`,
    relationships: [],
    ...extra,
  });
}

beforeEach(() => {
  ledger = new FakeLedger();
  const key = keyFrom("66");
  const did = ledger.publishDid(key, "0.0.5001");
  registry = { ...signerFor(key, "0.0.5001"), did };
  mrContextUrl = `ipfs://${ledger.pin("mrcontext", guardianStyleContext(MR_UUID, MR_FIELDS))}`;
  mintContextUrl = `ipfs://${ledger.pin("mintcontext", guardianStyleContext("MintToken", ["date", "tokenId", "amount"]))}`;
  const contexts: Record<string, object> = {
    [mrContextUrl]: guardianStyleContext(MR_UUID, MR_FIELDS),
    [mintContextUrl]: guardianStyleContext("MintToken", ["date", "tokenId", "amount"]),
  };
  loader = buildDocumentLoader(remoteDidResolver(ledger.sources), async iri =>
    contexts[iri] ? { documentUrl: iri, document: contexts[iri] } : null,
  );
});

const verify = (ref: string, topics = [POLICY_TOPIC]) =>
  verifyGuardianEvidence(ledger.sources, ref, { expectedTopicIds: topics });

describe("Guardian evidence verifier", () => {
  it("accepts a signed VP on the policy topic whose Monitoring Report cross-checks as MATCH", async () => {
    const ts = await publishVp([await monitoringReport()]);
    const result = await verify(ts);
    expect(result.refusals).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.chain[0]).toMatchObject({
      topicId: POLICY_TOPIC,
      type: "VP-Document",
      signature: "verified",
      issuers: [registry.did],
    });
    expect(result.crossChecks).toEqual([{ vcId: "urn:uuid:mr-1", decision: "MATCH", deltaERg: "0", notes: [] }]);
    expect(result.evidenceHash).toBe(evidenceHash(ts, result.cid!));
  });

  it("follows relationships to parent VC documents and verifies them", async () => {
    const mr = await monitoringReport();
    const mrCid = ledger.pin("mrdoc", mr);
    const parent = ledger.submit(POLICY_TOPIC, {
      id: "m0",
      status: "ISSUE",
      type: "VC-Document",
      action: "create-vc-document",
      cid: mrCid,
      uri: `ipfs://${mrCid}`,
    });
    const ts = await publishVp([mr], { relationships: [parent] });
    const result = await verify(ts);
    expect(result.accepted).toBe(true);
    expect(result.chain.map(e => [e.depth, e.type, e.signature])).toEqual([
      [0, "VP-Document", "verified"],
      [1, "VC-Document", "verified"],
    ]);
  });

  it("refuses a chain that contains a MintToken VC (double issuance, §5.7)", async () => {
    const ts = await publishVp([await monitoringReport(), await mintVc()]);
    const result = await verify(ts);
    expect(result.accepted).toBe(false);
    expect(result.refusals.join(" ")).toContain("MintToken VC (token 0.0.7001, amount 679)");
    expect(result.chain[0].mintToken).toEqual({ tokenId: "0.0.7001", amount: "679" });
  });

  it("refuses a MintToken VC found further up the relationships", async () => {
    const mint = await mintVc();
    const mintCid = ledger.pin("mintdoc", mint);
    const parent = ledger.submit(POLICY_TOPIC, {
      id: "m0",
      status: "ISSUE",
      type: "VC-Document",
      action: "create-vc-document",
      cid: mintCid,
    });
    const ts = await publishVp([await monitoringReport()], { relationships: [parent] });
    expect((await verify(ts)).refusals.join(" ")).toContain("MintToken");
  });

  it("refuses evidence from a topic that is not the expected policy topic", async () => {
    const ts = await publishVp([await monitoringReport()], {}, "0.0.9999");
    const result = await verify(ts);
    expect(result.accepted).toBe(false);
    expect(result.refusals).toEqual([`Message ${ts} is on topic 0.0.9999, not an expected policy topic`]);
  });

  it("refuses when the IPFS document was altered after signing", async () => {
    const vp = await presentAsGuardian([await monitoringReport()], registry, loader, "urn:uuid:vp-1");
    vp.verifiableCredential[0].credentialSubject[0].field27 = 5000;
    vp.verifiableCredential[0].credentialSubject[0].field24 = 5021;
    const cid = ledger.pin("tampered", vp);
    const ts = ledger.submit(POLICY_TOPIC, { id: "m1", status: "ISSUE", type: "VP-Document", cid });
    const result = await verify(ts);
    expect(result.accepted).toBe(false);
    expect(result.chain[0].signature).toBe("invalid");
    expect(result.refusals.join(" ")).toMatch(/Signature check failed/);
  });

  it("refuses documents signed by a DID that is not published on HCS", async () => {
    const stranger = signerFor(keyFrom("77"), "0.0.5002");
    const vc = await signAsGuardian(
      { ...vcBody({ ...monitoringReportSubject(), "@context": [mrContextUrl] }, "urn:uuid:x"), issuer: stranger.did },
      stranger,
      buildDocumentLoader(
        async iri =>
          iri.startsWith(stranger.did)
            ? { documentUrl: iri, document: (await import("./did")).buildDidDocument(stranger.did, stranger.key) }
            : null,
        async iri =>
          iri === mrContextUrl ? { documentUrl: iri, document: guardianStyleContext(MR_UUID, MR_FIELDS) } : null,
      ),
    );
    const cid = ledger.pin("stranger", vc);
    const ts = ledger.submit(POLICY_TOPIC, { id: "m1", status: "ISSUE", type: "VC-Document", cid });
    const result = await verify(ts);
    expect(result.accepted).toBe(false);
    expect(result.chain[0].signature).toBe("invalid");
  });

  it("refuses revoked documents and non-document messages", async () => {
    const ts = await publishVp([await monitoringReport()], { status: "REVOKE" });
    expect((await verify(ts)).refusals.join(" ")).toContain("status REVOKE, not ISSUE");
    const did = ledger.submit(POLICY_TOPIC, { id: "d", status: "ISSUE", type: "DID-Document", cid: "x" });
    expect((await verify(did)).refusals.join(" ")).toContain("is a DID-Document, not a VC or VP document");
    const junk = ledger.submit(POLICY_TOPIC, "not json");
    expect((await verify(junk)).refusals.join(" ")).toContain("not a Guardian JSON message");
  });

  it("refuses a Monitoring Report whose figures do not cross-check", async () => {
    const ts = await publishVp([await monitoringReport({ field24: 800, field27: 779 })]);
    const result = await verify(ts);
    expect(result.accepted).toBe(false);
    expect(result.refusals.join(" ")).toContain("cross-check: MISMATCH (ΔER -100000000 g)");
  });

  it("requires an expected topic", async () => {
    await expect(verifyGuardianEvidence(ledger.sources, "1.1", { expectedTopicIds: [] })).rejects.toThrow(
      "topic id is required",
    );
  });
});

describe("evidence reference resolution", () => {
  it("reads the VP timestamp from a fungible mint's memo", async () => {
    const ts = await publishVp([await monitoringReport()]);
    ledger.addMint("0.0.1234-1758000000-000000001", ts);
    expect(await resolveEvidenceTimestamp(ledger.sources, "0.0.1234@1758000000.000000001")).toBe(ts);
    const result = await verify("0.0.1234@1758000000.000000001");
    expect(result.accepted).toBe(true);
    expect(result.timestamp).toBe(ts);
  });

  it("reads the VP timestamp from an NFT's metadata", async () => {
    ledger.addNft("0.0.7002", 3, "1758000123.000000001");
    expect(await resolveEvidenceTimestamp(ledger.sources, "nft:0.0.7002:3")).toBe("1758000123.000000001");
  });

  it("refuses transactions that are not successful mints with a timestamp memo", async () => {
    ledger.addMint("0.0.1-1-1", "1758000000.000000001", "CRYPTOTRANSFER");
    await expect(resolveEvidenceTimestamp(ledger.sources, "0.0.1-1-1")).rejects.toThrow("is not a token mint");
    ledger.addMint("0.0.1-1-2", "hello");
    await expect(resolveEvidenceTimestamp(ledger.sources, "0.0.1-1-2")).rejects.toThrow(
      "Mint memo is not a Guardian message timestamp",
    );
    await expect(resolveEvidenceTimestamp(ledger.sources, "0.0.1-1-3")).rejects.toThrow("Mirror node returned 404");
    await expect(resolveEvidenceTimestamp(ledger.sources, "../etc/passwd")).rejects.toThrow(
      "Expected a consensus timestamp",
    );
  });
});
