import type { BridgeSigner } from "./bridge";
import { bridgeKeyPair, buildDid, buildDidDocument, buildDidMessage } from "./did";
import { rawCid } from "./ipfs";
import { CREDENTIALS_V1, type DocumentLoader, ed25519VerificationDocumentLoader, issueCredential } from "./vc";
import { Ed25519Signature2018 } from "@digitalbazaar/ed25519-signature-2018";
import { Ed25519VerificationKey2018 } from "@digitalbazaar/ed25519-verification-key-2018";
import * as vcLib from "@digitalbazaar/vc";
import { PrivateKey } from "@hiero-ledger/sdk";

/** Test-only helpers: deterministic keys, a VMR0017 Monitoring Report, and an in-memory mirror node + IPFS. */

export const keyFrom = (byte: string) => PrivateKey.fromStringED25519(byte.repeat(32));

export function signerFor(key: PrivateKey, topic = "0.0.4001"): BridgeSigner {
  const did = buildDid(key, "testnet", topic);
  return { did, key, keyPair: bridgeKeyPair(did, key) };
}

/** Run-of-river 5 MW, 1000 MWh, EF_CM 0.7: BE 700 t, PE 0, LE 21 t, ER 679 t. */
export function monitoringReportSubject(overrides: Record<string, unknown> = {}) {
  return {
    policyId: "66f000000000000000000001",
    field3: 0.8,
    field4: 0.6,
    field5: 0.5,
    field6: 0.5,
    field7: 1000,
    field8: 1,
    field9: 0,
    field11: 5,
    field13: 100,
    field14: 0,
    field30: 1010,
    field44: 21,
    field24: 700,
    field25: 0,
    field26: 21,
    field27: 679,
    "@context": ["ipfs://bafkreimrcontextmrcontextmrcontextmrcontextmrcontextmrcon"],
    id: "urn:uuid:8f0e3c1a-5a7b-4c2d-9e10-0000000000aa",
    type: "e801fa39-07b6-4da0-973a-13c9acdb6b76&1.0.0",
    ...overrides,
  };
}

export function monitoringReportVc(subject = monitoringReportSubject(), issuer = "did:hedera:testnet:Guardian_0.0.1") {
  return {
    id: "urn:uuid:3c3a1b7e-8a0f-4f4e-9d61-00000000beef",
    type: ["VerifiableCredential"],
    issuer,
    issuanceDate: "2026-09-20T00:00:00.000Z",
    "@context": [CREDENTIALS_V1],
    credentialSubject: [subject],
    proof: {
      type: "Ed25519Signature2018",
      created: "2026-09-20T00:00:00Z",
      verificationMethod: `${issuer}#did-root-key`,
      proofPurpose: "assertionMethod",
      jws: "eyJhbGciOiJFZERTQSJ9..placeholder",
    },
  };
}

/** A Guardian-style schema context: one term per field under the schema uuid, @vocab forced like Guardian's loader. */
export function guardianStyleContext(uuid: string, terms: string[]) {
  return {
    "@context": {
      "@version": 1.1,
      "@vocab": "https://w3id.org/traceability/#undefinedTerm",
      id: "@id",
      type: "@type",
      [uuid]: {
        "@id": `schema:${uuid}#${uuid}`,
        "@context": Object.fromEntries(terms.map(t => [t, { "@id": "https://www.schema.org/text" }])),
      },
    },
  };
}

type Stored = { topicId: string; sequence: number; text: string; payer: string };

export type FakeTransfer = { token_id: string; account: string; amount: number };

/**
 * In-memory mirror node and IPFS gateway, served through a `fetch` stand-in. Records every URL it was asked for.
 * Documents are pinned under their real CIDv1 (raw, sha2-256) and served as raw blocks, so reads are hash-checked.
 */
export class FakeLedger {
  readonly mirrorNodeUrl = "https://mirror.test";
  readonly ipfsGateway = "https://ipfs.test/ipfs/{cid}";
  readonly requests: string[] = [];
  private messages = new Map<string, Stored>();
  private ipfs = new Map<string, Uint8Array>();
  private transactions = new Map<string, Record<string, unknown>>();
  private nfts = new Map<string, { metadata: string; mintTx: string; mintTs: string }>();
  private tokens = new Map<string, unknown>();
  private clock = 1_758_000_000;

  /** Pins a JSON document; `tag` is kept for call sites that name what they pin. */
  pin(_tag: string, document: unknown): string {
    const bytes = Buffer.from(JSON.stringify(document));
    const cid = rawCid(bytes);
    this.ipfs.set(cid, bytes);
    return cid;
  }

  /** Stores bytes under a CID the caller chose, for gateways that return the wrong bytes. */
  pinBytes(cid: string, bytes: Uint8Array) {
    this.ipfs.set(cid, bytes);
  }

  private tick() {
    return `${this.clock++}.000000001`;
  }

  submit(topicId: string, body: unknown, payer = "0.0.2"): string {
    const timestamp = this.tick();
    const sequence = [...this.messages.values()].filter(m => m.topicId === topicId).length + 1;
    this.messages.set(timestamp, {
      topicId,
      sequence,
      text: typeof body === "string" ? body : JSON.stringify(body),
      payer,
    });
    return timestamp;
  }

  addToken(tokenId: string, fields: { type?: string; decimals?: number; treasury: string; totalSupply?: string }) {
    this.tokens.set(tokenId, {
      token_id: tokenId,
      name: `Token ${tokenId}`,
      symbol: "GT",
      type: fields.type ?? "FUNGIBLE_COMMON",
      decimals: String(fields.decimals ?? 0),
      treasury_account_id: fields.treasury,
      total_supply: fields.totalSupply ?? "0",
    });
  }

  addMint(
    txId: string,
    memo: string,
    name = "TOKENMINT",
    extra: { entity_id?: string; token_transfers?: FakeTransfer[]; nft_transfers?: unknown[] } = {},
  ) {
    this.transactions.set(txId, {
      transaction_id: txId,
      consensus_timestamp: this.tick(),
      name,
      result: "SUCCESS",
      memo_base64: Buffer.from(memo).toString("base64"),
      ...extra,
    });
  }

  addNft(tokenId: string, serial: number, metadata: string, mintTx = `0.0.2-${this.clock}-000000001`) {
    this.nfts.set(`${tokenId}/${serial}`, {
      metadata: Buffer.from(metadata).toString("base64"),
      mintTx,
      mintTs: this.tick(),
    });
  }

  /** Publishes a DID the way scripts/publish-bridge-did.ts does, paid for by `payer` (Guardian's user account). */
  publishDid(key: PrivateKey, topicId: string, payer = "0.0.2"): string {
    const did = buildDid(key, "testnet", topicId);
    const cid = this.pin(`did${topicId.replace(/\./g, "")}`, buildDidDocument(did, key));
    this.submit(topicId, buildDidMessage("00000000-0000-4000-8000-000000000001", did, cid), payer);
    return did;
  }

  get sources() {
    return { mirrorNodeUrl: this.mirrorNodeUrl, ipfsGateway: this.ipfsGateway, fetch: this.fetch };
  }

  readonly fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    this.requests.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    let m;
    if ((m = /^https:\/\/ipfs\.test\/ipfs\/(\w+)\?format=raw$/.exec(url))) {
      const bytes = this.ipfs.get(m[1]);
      return bytes ? new Response(Buffer.from(bytes)) : json({ error: "not found" }, 404);
    }
    if ((m = /\/api\/v1\/topics\/messages\/([\d.]+)$/.exec(url))) {
      const stored = this.messages.get(m[1]);
      if (!stored) return json({ _status: { messages: [{ message: "Not found" }] } }, 404);
      return json({
        consensus_timestamp: m[1],
        topic_id: stored.topicId,
        sequence_number: stored.sequence,
        payer_account_id: stored.payer,
        message: Buffer.from(stored.text).toString("base64"),
        chunk_info: null,
      });
    }
    if ((m = /\/api\/v1\/topics\/([\d.]+)\/messages\?/.exec(url))) {
      const messages = [...this.messages.entries()]
        .filter(([, s]) => s.topicId === m![1])
        .map(([ts, s]) => ({
          consensus_timestamp: ts,
          topic_id: s.topicId,
          sequence_number: s.sequence,
          payer_account_id: s.payer,
          message: Buffer.from(s.text).toString("base64"),
        }));
      return json({ messages, links: { next: null } });
    }
    if ((m = /\/api\/v1\/transactions\/([\d.-]+)$/.exec(url))) {
      const tx = this.transactions.get(m[1]);
      return tx ? json({ transactions: [tx] }) : json({}, 404);
    }
    if ((m = /\/api\/v1\/transactions\?account\.id=([\d.]+)&transactiontype=CRYPTOTRANSFER/.exec(url))) {
      const account = m[1];
      const transactions = [...this.transactions.values()]
        .filter(
          tx =>
            tx.name === "CRYPTOTRANSFER" &&
            ((tx.token_transfers as FakeTransfer[] | undefined) ?? []).some(t => t.account === account),
        )
        .reverse();
      return json({ transactions, links: { next: null } });
    }
    if ((m = /\/api\/v1\/tokens\/([\d.]+)\/nfts\/(\d+)\/transactions/.exec(url))) {
      const nft = this.nfts.get(`${m[1]}/${m[2]}`);
      if (!nft) return json({}, 404);
      return json({
        transactions: [{ type: "TOKENMINT", transaction_id: nft.mintTx, consensus_timestamp: nft.mintTs }],
        links: { next: null },
      });
    }
    if ((m = /\/api\/v1\/tokens\/([\d.]+)\/nfts\/(\d+)$/.exec(url))) {
      const nft = this.nfts.get(`${m[1]}/${m[2]}`);
      return nft ? json({ metadata: nft.metadata }) : json({}, 404);
    }
    if ((m = /\/api\/v1\/tokens\/([\d.]+)\/nfts\?/.exec(url))) {
      const nfts = [...this.nfts.entries()]
        .filter(([key]) => key.startsWith(`${m![1]}/`))
        .map(([key, nft]) => ({ serial_number: Number(key.split("/")[1]), metadata: nft.metadata }));
      return json({ nfts, links: { next: null } });
    }
    if ((m = /\/api\/v1\/tokens\/([\d.]+)$/.exec(url))) {
      return this.tokens.has(m[1]) ? json(this.tokens.get(m[1])) : json({}, 404);
    }
    return json({ error: `unexpected ${url}` }, 500);
  }) as typeof fetch;
}

/** Signs a VC as a Guardian Standard Registry would (same suite). */
export async function signAsGuardian(credential: object, signer: BridgeSigner, loader: DocumentLoader) {
  return issueCredential(credential, signer.keyPair, loader, new Date("2026-09-20T00:00:00Z"));
}

/** Guardian's VCJS.issuePresentation: authentication proof with challenge "123". */
export async function presentAsGuardian(vcs: object[], signer: BridgeSigner, loader: DocumentLoader, id: string) {
  const presentation = vcLib.createPresentation({ verifiableCredential: vcs, id });
  const key = await Ed25519VerificationKey2018.from(signer.keyPair);
  const suite = new Ed25519Signature2018({ key, date: new Date("2026-09-20T00:00:00Z") });
  // The suite adds its own context to a VP (Guardian VPs carry ".../suites/ed25519-2018/v1"), served like VCJS does.
  return vcLib.signPresentation({
    presentation,
    suite,
    documentLoader: ed25519VerificationDocumentLoader(loader),
    challenge: "123",
  });
}
