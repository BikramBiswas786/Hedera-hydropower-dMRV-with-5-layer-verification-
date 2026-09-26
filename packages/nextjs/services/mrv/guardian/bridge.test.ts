import { NotAVcError, canonicalJson, extractSourceVc, runCrossCheck, sourceVcHash } from "./bridge";
import {
  assertDidMatchesKey,
  base58Encode,
  buildDid,
  buildDidDocument,
  buildDidMessage,
  parseBridgeKey,
  parseHederaDid,
} from "./did";
import {
  FakeLedger,
  guardianStyleContext,
  keyFrom,
  monitoringReportSubject,
  monitoringReportVc,
  signerFor,
} from "./fixtures";
import { remoteDidResolver } from "./hedera";
import { RESULT_FIELDS, buildResultSchemaContext, checkResultSubject } from "./resultSchema";
import { buildDocumentLoader, verifyGuardianCredential } from "./vc";
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

const SCHEMA_UUID = "9a0e6f4c-2b1d-4e3f-8a7b-1c2d3e4f5a6b";
const schema = {
  type: `${SCHEMA_UUID}&1.0.0`,
  contextUrl: "ipfs://bafkreiresultcontextresultcontextresultcontextresultco",
};
const now = new Date("2026-09-26T08:00:00Z");
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

describe("bridge DID (Guardian 3.7.0 format)", () => {
  const key = keyFrom("11");

  it("derives did:hedera:<net>:<base58(sha256(pubkey))>_<topic>", () => {
    const did = buildDid(key, "testnet", "0.0.4001");
    const expected = base58Encode(createHash("sha256").update(key.publicKey.toBytesRaw()).digest());
    expect(did).toBe(`did:hedera:testnet:${expected}_0.0.4001`);
    expect(parseHederaDid(`${did}#did-root-key`)).toEqual({
      did,
      network: "testnet",
      identifier: expected,
      topicId: "0.0.4001",
    });
    expect(parseHederaDid("did:hedera:testnet:abc;hedera:testnet:tid=0.0.1")).toBeNull();
  });

  it("builds the DID document and the DID-Document HCS message Guardian resolves", () => {
    const did = buildDid(key, "testnet", "0.0.4001");
    const doc = buildDidDocument(did, key);
    expect(doc).toEqual({
      "@context": "https://www.w3.org/ns/did/v1",
      id: did,
      verificationMethod: [
        {
          id: `${did}#did-root-key`,
          type: "Ed25519VerificationKey2018",
          controller: did,
          publicKeyBase58: base58Encode(key.publicKey.toBytesRaw()),
        },
      ],
      authentication: [`${did}#did-root-key`],
      assertionMethod: ["#did-root-key"],
    });
    const message = buildDidMessage("id-1", did, "bafycid");
    expect(Object.keys(message)).toEqual(["id", "status", "type", "action", "lang", "did", "cid", "uri"]);
    expect(message).toMatchObject({
      status: "ISSUE",
      type: "DID-Document",
      action: "create-did-document",
      lang: "en-US",
      uri: "ipfs://bafycid",
    });
  });

  it("parses DER and raw hex keys, refuses ECDSA, and refuses a DID from another key", () => {
    expect(parseBridgeKey(key.toStringDer()).publicKey.toStringRaw()).toBe(key.publicKey.toStringRaw());
    expect(parseBridgeKey("0x" + "11".repeat(32)).publicKey.toStringRaw()).toBe(key.publicKey.toStringRaw());
    expect(() => parseBridgeKey(keyFrom("22").toStringDer().replace(/^302e/, "3030"))).toThrow();
    const other = buildDid(keyFrom("22"), "testnet", "0.0.4001");
    expect(() => assertDidMatchesKey(other, key)).toThrow("was not derived");
    expect(() => assertDidMatchesKey("did:example:123", key)).toThrow("is not a did:hedera");
  });
});

describe("cross-check VC", () => {
  const ledger = new FakeLedger();
  const key = keyFrom("33");
  const did = ledger.publishDid(key, "0.0.4001");
  const signer = { ...signerFor(key, "0.0.4001"), did };
  const context = buildResultSchemaContext(SCHEMA_UUID);
  /** What Guardian's worker does: remote DID loader (mirror node + IPFS) and the schema context from its DB. */
  const guardianLoader = (ctx: object = context) =>
    buildDocumentLoader(remoteDidResolver(ledger.sources), async iri =>
      iri === schema.contextUrl ? { documentUrl: iri, document: ctx } : null,
    );

  it("signs a VC that Guardian's VCJS.verify port accepts, resolving the DID from HCS and IPFS", async () => {
    const { vc, decision } = await runCrossCheck({
      body: monitoringReportVc(),
      policyId: "p1",
      schema,
      signer,
      uuid,
      now,
    });
    expect(decision).toBe("MATCH");
    expect(vc.proof).toMatchObject({
      type: "Ed25519Signature2018",
      proofPurpose: "assertionMethod",
      verificationMethod: `${did}#did-root-key`,
    });
    expect(vc.proof.jws).toMatch(/^eyJ[\w-]+\.\.[\w-]+$/);
    await expect(verifyGuardianCredential(vc, guardianLoader())).resolves.toBe(true);
    expect(ledger.requests.some(u => u.includes("/api/v1/topics/0.0.4001/messages"))).toBe(true);
  });

  it("has Guardian's VC shape and passes the schema's own checks", async () => {
    const { vc } = await runCrossCheck({ body: [monitoringReportVc()], policyId: "p1", schema, signer, uuid, now });
    expect(vc["@context"]).toEqual(["https://www.w3.org/2018/credentials/v1"]);
    expect(vc.issuer).toBe(did);
    expect(vc.issuanceDate).toBe("2026-09-26T08:00:00.000Z");
    const [subject] = vc.credentialSubject;
    expect(subject["@context"]).toEqual([schema.contextUrl]);
    expect(subject.type).toBe(schema.type);
    expect(subject.policyId).toBe("p1");
    expect(subject.issuerOfRecord).toBe("DMRV");
    expect(subject.sourceVcHash).toBe(sourceVcHash(monitoringReportVc()));
    expect(Object.keys(subject).slice(-3)).toEqual(["@context", "id", "type"]);
    expect(checkResultSubject(subject)).toEqual([]);
  });

  it("verifies under the context Guardian itself would generate (terms per field, same @vocab)", async () => {
    const { vc } = await runCrossCheck({ body: monitoringReportVc(), schema, signer, uuid, now });
    const guardianContext = guardianStyleContext(SCHEMA_UUID, [
      ...RESULT_FIELDS.map(f => f.key),
      "policyId",
      "ref",
      "guardianVersion",
    ]);
    await expect(verifyGuardianCredential(vc, guardianLoader(guardianContext))).resolves.toBe(true);
  });

  it("fails verification when any signed value is tampered with", async () => {
    const { vc } = await runCrossCheck({ body: monitoringReportVc(), schema, signer, uuid, now });
    const tampered = structuredClone(vc);
    tampered.credentialSubject[0].oursERt = 1_000_000;
    await expect(verifyGuardianCredential(tampered, guardianLoader())).rejects.toThrow("Invalid signature");
    const reissued = structuredClone(vc);
    reissued.issuanceDate = "2026-09-25T00:00:00.000Z";
    await expect(verifyGuardianCredential(reissued, guardianLoader())).rejects.toThrow("Invalid signature");
  });

  it("fails when the proof claims the published DID but was signed with another key", async () => {
    const impostorKey = keyFrom("44");
    const base = signerFor(impostorKey, "0.0.4001");
    const impostor = {
      did,
      key: impostorKey,
      keyPair: { ...base.keyPair, id: `${did}#did-root-key`, controller: did },
    };
    const { vc } = await runCrossCheck({ body: monitoringReportVc(), schema, signer: impostor, uuid, now });
    await expect(verifyGuardianCredential(vc, guardianLoader())).rejects.toThrow("Invalid signature");
  });

  it("is rejected by Guardian's verifier if issued in the verifier's future (clock skew)", async () => {
    const { vc } = await runCrossCheck({
      body: monitoringReportVc(),
      schema,
      signer,
      uuid,
      now: new Date(Date.now() + 3_600_000),
    });
    await expect(verifyGuardianCredential(vc, guardianLoader())).rejects.toThrow('is before the "issuanceDate"');
  });

  it("fails for a DID that was never published", async () => {
    const unpublished = signerFor(keyFrom("55"), "0.0.4999");
    const { vc } = await runCrossCheck({ body: monitoringReportVc(), schema, signer: unpublished, uuid, now });
    await expect(verifyGuardianCredential(vc, guardianLoader())).rejects.toThrow();
  });

  it("carries the recomputation and the report's own figures", async () => {
    const body = monitoringReportVc(monitoringReportSubject({ field24: 710, field27: 689 }));
    const { vc, decision } = await runCrossCheck({ body, schema, signer, uuid, now });
    expect(decision).toBe("MISMATCH");
    expect(vc.credentialSubject[0]).toMatchObject({
      oursBEt: 700,
      oursLEt: 21,
      oursERt: 679,
      theirsBEt: 710,
      theirsERt: 689,
      deltaERg: -10_000_000,
      methodologyId: "hydro/acm0002+vmr0017",
    });
    expect(vc.credentialSubject[0].policyId).toBe("66f000000000000000000001");
  });

  it("refuses bodies that are not one Guardian VC", () => {
    expect(() => extractSourceVc({ hello: 1 })).toThrow(NotAVcError);
    expect(() => extractSourceVc([monitoringReportVc(), monitoringReportVc()])).toThrow(NotAVcError);
    expect(() => extractSourceVc("x")).toThrow(NotAVcError);
    expect(() => extractSourceVc({ ...monitoringReportVc(), credentialSubject: [] })).toThrow("no credentialSubject");
  });

  it("hashes canonically, independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(sourceVcHash({ a: 1, b: 2 })).toBe(sourceVcHash({ b: 2, a: 1 }));
  });
});
