import { FakeLedger, guardianStyleContext, keyFrom, presentAsGuardian, signAsGuardian, signerFor } from "./fixtures";
import { fetchIpfsJson, localDidResolver, remoteDidResolver } from "./hedera";
import { toBaseUnits, traceGuardianMint } from "./trace";
import {
  CREDENTIALS_V1,
  GUARDIAN_SYSTEM_TYPE,
  buildDocumentLoader,
  verifyGuardianPresentation,
  withoutSystemTypeDefinitions,
} from "./vc";
import realMint from "./vectors/mgs-mint-2026-09-28.json";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.900";
const TOKEN = "0.0.7001";
const NFT = "0.0.7002";
const INSTANCE_TOPIC = "0.0.6101";

/**
 * A Guardian Standard Registry on a fake ledger: its DID published by the treasury account, a MintToken schema
 * context on IPFS, and helpers that write a VP + mint the way Guardian's mint-block does (memo = VP timestamp).
 */
async function registry(options: { didPayer?: string } = {}) {
  const ledger = new FakeLedger();
  const key = keyFrom("ab");
  const signer = {
    ...signerFor(key, "0.0.5101"),
    did: ledger.publishDid(key, "0.0.5101", options.didPayer ?? TREASURY),
  };
  ledger.submit("0.0.5101", { type: "Topic", messageType: "USER_TOPIC", parentId: "0.0.1960" }, TREASURY);
  const mintContext = `ipfs://${ledger.pin("mintctx", guardianStyleContext("MintToken", ["tokenId", "amount", "date"]))}`;
  const loader = buildDocumentLoader(remoteDidResolver(ledger.sources), async iri =>
    iri.startsWith("ipfs://")
      ? { documentUrl: iri, document: await fetchIpfsJson(ledger.sources, iri.slice(7)) }
      : null,
  );
  ledger.addToken(TOKEN, { decimals: 3, treasury: TREASURY });
  ledger.addToken(NFT, { type: "NON_FUNGIBLE_UNIQUE", treasury: TREASURY });

  const source = ledger.submit(
    INSTANCE_TOPIC,
    { type: "VC-Document", status: "ISSUE", option: { status: "Approved" }, issuer: signer.did },
    TREASURY,
  );

  async function publishMint(tokenId: string, amount: string, tamper?: (vp: any) => void) {
    const mint = await signAsGuardian(
      {
        id: "urn:uuid:mint",
        type: ["VerifiableCredential"],
        issuer: signer.did,
        issuanceDate: "2026-09-20T00:00:00.000Z",
        "@context": [CREDENTIALS_V1],
        credentialSubject: [
          { tokenId, amount, date: "2026-09-20", "@context": [mintContext], id: "urn:uuid:s", type: "MintToken" },
        ],
      },
      signer,
      loader,
    );
    const vp = await presentAsGuardian([mint], signer, loader, "urn:uuid:vp");
    tamper?.(vp);
    const cid = ledger.pin("vp", vp);
    return ledger.submit(
      INSTANCE_TOPIC,
      { type: "VP-Document", status: "ISSUE", action: "create-vp-document", relationships: [source], cid },
      TREASURY,
    );
  }

  function mintFungible(record: string, baseUnits: number, txId = "0.0.900-1758009999-000000001") {
    ledger.addMint(txId, record, "TOKENMINT", {
      entity_id: TOKEN,
      token_transfers: [{ token_id: TOKEN, account: TREASURY, amount: baseUnits }],
    });
    return txId;
  }

  return { ledger, signer, publishMint, mintFungible };
}

const byId = (checks: { id: string; ok: boolean | null }[]) => Object.fromEntries(checks.map(c => [c.id, c.ok]));

describe("toBaseUnits", () => {
  it("scales Guardian's fixed-decimal amounts exactly", () => {
    expect(toBaseUnits("12.500", 3)).toBe(12_500n);
    expect(toBaseUnits("12.5", 3)).toBe(12_500n);
    expect(toBaseUnits("7", 0)).toBe(7n);
    expect(toBaseUnits("1.2345", 3)).toBeNull();
    expect(toBaseUnits("-1", 0)).toBeNull();
  });
});

describe("traceGuardianMint", () => {
  it("backs a fungible mint whose VP names this token and amount, signed by the treasury's DID", async () => {
    const { ledger, signer, publishMint, mintFungible } = await registry();
    const record = await publishMint(TOKEN, "12.500");
    const tx = mintFungible(record, 12_500);

    const trace = await traceGuardianMint(ledger.sources, tx);
    expect(trace.verdict).toBe("backed");
    expect(byId(trace.checks)).toEqual({
      record: true,
      order: true,
      "record-payer": true,
      signature: true,
      "mint-vc": true,
      amount: true,
      registry: true,
    });
    expect(trace.record).toMatchObject({ topicId: INSTANCE_TOPIC, payer: TREASURY, signer: signer.did });
    expect(trace.mintVc).toMatchObject({ tokenId: TOKEN, amount: "12.500" });
    expect(trace.registry).toEqual({ did: signer.did, account: TREASURY, parentTopic: "0.0.1960" });
    expect(trace.sources).toEqual([
      expect.objectContaining({ depth: 1, type: "VC-Document", status: "Approved", payer: TREASURY }),
    ]);
  });

  it("accepts the mint as `0.0.x@secs.nanos` too", async () => {
    const { ledger, publishMint, mintFungible } = await registry();
    mintFungible(await publishMint(TOKEN, "1.000"), 1_000);
    expect((await traceGuardianMint(ledger.sources, "0.0.900@1758009999.000000001")).verdict).toBe("backed");
  });

  it("refuses a mint larger than its VC", async () => {
    const { ledger, publishMint, mintFungible } = await registry();
    const tx = mintFungible(await publishMint(TOKEN, "12.500"), 13_000);
    const trace = await traceGuardianMint(ledger.sources, tx);
    expect(trace.verdict).toBe("not-backed");
    expect(trace.checks.find(c => c.id === "amount")).toMatchObject({ ok: false });
  });

  it("refuses a mint that cites another token's VP", async () => {
    const { ledger, publishMint, mintFungible } = await registry();
    const tx = mintFungible(await publishMint("0.0.7999", "12.500"), 12_500);
    const trace = await traceGuardianMint(ledger.sources, tx);
    expect(trace.verdict).toBe("not-backed");
    expect(byId(trace.checks)["mint-vc"]).toBe(false);
  });

  it("refuses a VP signed by an identity the treasury did not publish", async () => {
    const { ledger, publishMint, mintFungible } = await registry({ didPayer: "0.0.901" });
    const trace = await traceGuardianMint(ledger.sources, mintFungible(await publishMint(TOKEN, "1.000"), 1_000));
    expect(trace.verdict).toBe("not-backed");
    expect(trace.checks.find(c => c.id === "registry")?.detail).toContain("published by 0.0.901");
  });

  it("refuses a VP edited after signing", async () => {
    const { ledger, publishMint, mintFungible } = await registry();
    const record = await publishMint(TOKEN, "1.000", vp => {
      vp.verifiableCredential[0].credentialSubject[0].amount = "2.000";
    });
    const trace = await traceGuardianMint(ledger.sources, mintFungible(record, 2_000));
    expect(trace.verdict).toBe("not-backed");
    expect(trace.record.signature).toBe("invalid");
  });

  it("is incomplete, not backed, when the gateway serves bytes that do not match the CID", async () => {
    const { ledger, publishMint, mintFungible } = await registry();
    const record = await publishMint(TOKEN, "1.000");
    mintFungible(record, 1_000);
    const cid = JSON.parse(
      Buffer.from(
        (await (await ledger.fetch(`https://mirror.test/api/v1/topics/messages/${record}`)).json()).message,
        "base64",
      ).toString(),
    ).cid;
    ledger.pinBytes(cid, Buffer.from('{"forged":true}'));
    const trace = await traceGuardianMint(ledger.sources, "0.0.900-1758009999-000000001");
    expect(trace.verdict).toBe("incomplete");
    expect(trace.checks.find(c => c.id === "signature")?.detail).toContain("do not hash to");
  });

  it("refuses a memo that points at something other than a VP", async () => {
    const { ledger, mintFungible } = await registry();
    const record = ledger.submit(INSTANCE_TOPIC, { type: "VC-Document", status: "ISSUE", cid: "x" }, TREASURY);
    const trace = await traceGuardianMint(ledger.sources, mintFungible(record, 1_000));
    expect(trace.verdict).toBe("not-backed");
    expect(byId(trace.checks).record).toBe(false);
  });

  it("finds the Guardian transfer to a holder with ft:<token>:<account>", async () => {
    const { ledger, publishMint } = await registry();
    const record = await publishMint(TOKEN, "12.500");
    ledger.addMint("0.0.900-1758010000-000000001", record, "CRYPTOTRANSFER", {
      token_transfers: [
        { token_id: TOKEN, account: TREASURY, amount: -12_500 },
        { token_id: TOKEN, account: "0.0.1234", amount: 12_500 },
      ],
    });
    const trace = await traceGuardianMint(ledger.sources, `ft:${TOKEN}:0.0.1234`);
    expect(trace.verdict).toBe("backed");
    expect(trace.mint).toMatchObject({ kind: "transfer", units: "12500" });
  });

  it("counts the NFTs that cite a VP against the VC amount", async () => {
    const { ledger, publishMint } = await registry();
    const record = await publishMint(NFT, "2");
    ledger.addNft(NFT, 1, record);
    ledger.addNft(NFT, 2, record);
    const trace = await traceGuardianMint(ledger.sources, `nft:${NFT}:2`);
    expect(trace.verdict).toBe("backed");
    expect(trace.mint).toMatchObject({ kind: "nft", serial: 2, units: "2" });

    ledger.addNft(NFT, 3, record);
    const over = await traceGuardianMint(ledger.sources, `nft:${NFT}:3`);
    expect(over.verdict).toBe("not-backed");
    expect(over.checks.find(c => c.id === "amount")?.detail).toBe("3 serials cite this record; the VC minted 2");
  });

  it("rejects references it cannot read", async () => {
    const { ledger } = await registry();
    await expect(traceGuardianMint(ledger.sources, "hello")).rejects.toThrow(/Expected nft:/);
  });
});

describe("a real Managed Guardian mint (vectors/mgs-mint-2026-09-28.json)", () => {
  // Token 0.0.10760359, VP QmVoqJLAvPzEQPzkbekWgBiYxWuMCSumheX5oS3bRvwMbv on topic 0.0.10760360, with the documents it
  // cites: the Standard Registry's DID document and the two schema contexts, as read from HCS and IPFS.
  const loaderFor = (documents: Record<string, unknown>) =>
    buildDocumentLoader(localDidResolver(documents), async iri =>
      iri in documents ? { documentUrl: iri, document: documents[iri] } : null,
    );

  it("fails the strict check and verifies in Guardian's signed form, which still binds token and amount", async () => {
    const { vp, documents } = structuredClone(realMint);
    const loader = loaderFor(documents);
    await expect(verifyGuardianPresentation(vp, loader)).rejects.toThrow(/Invalid signature/);
    await expect(verifyGuardianPresentation(vp, withoutSystemTypeDefinitions(loader))).resolves.toBe(true);

    for (const edit of [{ amount: "125.000" }, { tokenId: "0.0.10760320" }]) {
      const forged = structuredClone(realMint.vp);
      Object.assign(forged.verifiableCredential[1].credentialSubject[0], edit);
      await expect(verifyGuardianPresentation(forged, withoutSystemTypeDefinitions(loader))).rejects.toThrow();
    }
  });

  it("leaves the policy's own schema terms alone", async () => {
    const loader = withoutSystemTypeDefinitions(loaderFor(realMint.documents));
    const issuanceContext = (await loader("ipfs://QmTfoaJ1nQrDdwgZWswcbUvWp8HhicWrxz1LMYwYoET3rM")).document as any;
    expect(Object.keys(issuanceContext["@context"]).some(term => term.includes("&"))).toBe(true);
    const mintContext = (await loader("ipfs://QmRVK4hNarbwohZBFehUpvYBt3WsmmV6P1nGrnVszPMvPM")).document as any;
    expect(Object.keys(mintContext["@context"]).some(term => GUARDIAN_SYSTEM_TYPE.test(term))).toBe(false);
    expect(mintContext["@context"]["Policy&1.0.0"]).toBeDefined();
  });
});
