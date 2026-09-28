import { base58Encode } from "./did";
import { fetchIpfsJson } from "./hedera";
import { CODEC_DAG_PB, CODEC_RAW, CidError, base58Decode, parseCid, rawCid, readVerifiedFile } from "./ipfs";
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: Uint8Array) => Buffer.from(value).toString("utf8");

/** `ipfs add` of "hello\n": PBNode { Data: UnixFS { Type: File, Data: "hello\n", filesize: 6 } }. */
const HELLO_BLOCK = bytes(0x0a, 0x0c, 0x08, 0x02, 0x12, 0x06, ...Buffer.from("hello\n"), 0x18, 0x06);
const HELLO_CID = "QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN";

/**
 * A real block from Managed Guardian's gateway (ipfs.guardianservice.app, `?format=raw`): the DID document of a
 * Standard Registry on testnet, as Guardian's IPFS client pinned it (CIDv0, dag-pb + UnixFS).
 */
const MGS_DID_CID = "QmfEm4V2pXK6rpyzu1mgdbBDrLuuCVJ5Z83SURDnLBzbw4";
const MGS_DID_BLOCK = Buffer.from(
  [
    "Ct8HCAIS1wd7ImlkIjoiZGlkOmhlZGVyYTp0ZXN0bmV0OkFUWnNGVFl5THI4YnFUQmZYMlN0U2hMS2tQVHlncTRVcVUyZGpKUXk4",
    "a1lMXzAuMC4xMDIzODE3OSIsIkBjb250ZXh0IjoiaHR0cHM6Ly93d3cudzMub3JnL25zL2RpZC92MSIsInZlcmlmaWNhdGlvbk1l",
    "dGhvZCI6W3siaWQiOiJkaWQ6aGVkZXJhOnRlc3RuZXQ6QVRac0ZUWXlMcjhicVRCZlgyU3RTaExLa1BUeWdxNFVxVTJkakpReThr",
    "WUxfMC4wLjEwMjM4MTc5I2RpZC1yb290LWtleSIsInR5cGUiOiJFZDI1NTE5VmVyaWZpY2F0aW9uS2V5MjAxOCIsImNvbnRyb2xs",
    "ZXIiOiJkaWQ6aGVkZXJhOnRlc3RuZXQ6QVRac0ZUWXlMcjhicVRCZlgyU3RTaExLa1BUeWdxNFVxVTJkakpReThrWUxfMC4wLjEw",
    "MjM4MTc5IiwicHVibGljS2V5QmFzZTU4IjoiQTdianBCdUJUQVN6MjhIY0dZcEY1WTRrcDRhWlpSd3VUN3h4d2h4Ym1KTWcifSx7",
    "ImlkIjoiZGlkOmhlZGVyYTp0ZXN0bmV0OkFUWnNGVFl5THI4YnFUQmZYMlN0U2hMS2tQVHlncTRVcVUyZGpKUXk4a1lMXzAuMC4x",
    "MDIzODE3OSNkaWQtcm9vdC1rZXktYmJzIiwidHlwZSI6IkJsczEyMzgxRzJLZXkyMDIwIiwiY29udHJvbGxlciI6ImRpZDpoZWRl",
    "cmE6dGVzdG5ldDpBVFpzRlRZeUxyOGJxVEJmWDJTdFNoTEtrUFR5Z3E0VXFVMmRqSlF5OGtZTF8wLjAuMTAyMzgxNzkiLCJwdWJs",
    "aWNLZXlCYXNlNTgiOiJ4VzZ3UzhCVGFGWTZVeU0yaHJDa2NYTnNnNFZ2TlFIOWdBS1A4TnRLUGQ2d3c1M3BWU3NBQVkzcG5kNFV3",
    "YmpjUXFFYjV1eVZvN3hvakZmcFNHdFFFZXNUUnc5aWVDV0hEZ2hkUGdxNHRRZldOaG1OVWFDeTJRTlE4U3l3NHZaV1hxWCJ9XSwi",
    "YXV0aGVudGljYXRpb24iOlsiZGlkOmhlZGVyYTp0ZXN0bmV0OkFUWnNGVFl5THI4YnFUQmZYMlN0U2hMS2tQVHlncTRVcVUyZGpK",
    "UXk4a1lMXzAuMC4xMDIzODE3OSNkaWQtcm9vdC1rZXkiXSwiYXNzZXJ0aW9uTWV0aG9kIjpbIiNkaWQtcm9vdC1rZXkiLCIjZGlk",
    "LXJvb3Qta2V5LWJicyJdfRjXBw==",
  ].join(""),
  "base64",
);

const serve = (blocks: Record<string, Uint8Array>) => async (cid: string) => {
  if (!blocks[cid]) throw new Error(`no block ${cid}`);
  return blocks[cid];
};

/** dag-pb file node whose links point at `children` (binary CIDs) and that carries no data of its own. */
function parentNode(children: Uint8Array[]) {
  const unixfs = bytes(0x08, 0x02);
  const links = children.flatMap(hash => [0x12, hash.length + 2, 0x0a, hash.length, ...hash]);
  return bytes(...links, 0x0a, unixfs.length, ...unixfs);
}

describe("CIDs", () => {
  it("round-trips base58 with the DID encoder", () => {
    const digest = createHash("sha256").update("x").digest();
    expect(base58Decode(base58Encode(digest))).toEqual(Uint8Array.from(digest));
    expect(base58Decode("11")).toEqual(bytes(0, 0));
  });

  it("parses CIDv0 and CIDv1 raw", () => {
    expect(parseCid(HELLO_CID)).toMatchObject({ version: 0, codec: CODEC_DAG_PB });
    const cid = rawCid(Buffer.from("hello world"));
    expect(cid).toBe("bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e");
    expect(parseCid(cid)).toMatchObject({ version: 1, codec: CODEC_RAW });
    expect(() => parseCid("bafy")).toThrow(CidError);
    expect(() => parseCid("not-a-cid")).toThrow(CidError);
  });
});

describe("readVerifiedFile", () => {
  it("unpacks the real `ipfs add` block for hello", async () => {
    const file = await readVerifiedFile(HELLO_CID, serve({ [HELLO_CID]: HELLO_BLOCK }), 1024);
    expect(text(file)).toBe("hello\n");
  });

  it("unpacks a real Guardian document pinned by Managed Guardian", async () => {
    const file = await readVerifiedFile(MGS_DID_CID, serve({ [MGS_DID_CID]: MGS_DID_BLOCK }), 64 * 1024);
    const did = JSON.parse(text(file));
    expect(did.id).toBe("did:hedera:testnet:ATZsFTYyLr8bqTBfX2StShLKkPTygq4UqU2djJQy8kYL_0.0.10238179");
    expect(did.verificationMethod[0].type).toBe("Ed25519VerificationKey2018");
  });

  it("returns raw leaves as they are", async () => {
    const data = Buffer.from('{"a":1}');
    const cid = rawCid(data);
    expect(text(await readVerifiedFile(cid, serve({ [cid]: data }), 1024))).toBe('{"a":1}');
  });

  it("refuses bytes that do not hash to the CID, whatever the gateway says", async () => {
    const lie = Buffer.from("hellO\n");
    await expect(readVerifiedFile(HELLO_CID, serve({ [HELLO_CID]: lie }), 1024)).rejects.toThrow(
      /do not hash to QmZULk/,
    );
  });

  it("reassembles a multi-block file in link order and checks every block", async () => {
    const a = Buffer.from('{"part":');
    const b = Buffer.from('"two"}');
    const [cidA, cidB] = [rawCid(a), rawCid(b)];
    const binary = (cid: string) => {
      const digest = parseCid(cid).digest;
      return bytes(0x01, CODEC_RAW, 0x12, 0x20, ...digest);
    };
    const root = parentNode([binary(cidA), binary(cidB)]);
    const rootCid = base58Encode(bytes(0x12, 0x20, ...createHash("sha256").update(root).digest()));
    const blocks = { [rootCid]: root, [cidA]: a, [cidB]: b };
    expect(text(await readVerifiedFile(rootCid, serve(blocks), 1024))).toBe('{"part":"two"}');
    await expect(readVerifiedFile(rootCid, serve({ ...blocks, [cidB]: Buffer.from('"TWO"}') }), 1024)).rejects.toThrow(
      CidError,
    );
    await expect(readVerifiedFile(rootCid, serve(blocks), 10)).rejects.toThrow(/larger than 10 bytes/);
  });
});

describe("fetchIpfsJson over several gateways", () => {
  it("gives up on a gateway that hangs and reads the block from the next one", async () => {
    const doc = Buffer.from('{"ok":true}');
    const cid = rawCid(doc);
    const hosts: string[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      const host = new URL(url).host;
      hosts.push(host);
      if (host === "slow.test") {
        // A gateway with no provider: it answers nothing until the caller gives up.
        return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
      }
      return new Response(doc);
    }) as unknown as typeof globalThis.fetch;
    const sources = {
      mirrorNodeUrl: "https://mirror.test",
      ipfsGateway: "https://slow.test/ipfs/{cid},https://fast.test/ipfs/{cid}",
      fetch,
      ipfsTimeoutMs: 50,
    };
    expect(await fetchIpfsJson(sources, cid)).toEqual({ ok: true });
    expect(hosts).toEqual(["slow.test", "fast.test"]);

    const onlySlow = { ...sources, ipfsGateway: "https://slow.test/ipfs/{cid}" };
    await expect(fetchIpfsJson(onlySlow, cid)).rejects.toThrow(/slow.test timed out/);
  });
});
