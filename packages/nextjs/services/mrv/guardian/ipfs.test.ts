import { base58Encode } from "./did";
import { CODEC_DAG_PB, CODEC_RAW, CidError, base58Decode, parseCid, rawCid, readVerifiedFile } from "./ipfs";
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: Uint8Array) => Buffer.from(value).toString("utf8");

/** `ipfs add` of "hello\n": PBNode { Data: UnixFS { Type: File, Data: "hello\n", filesize: 6 } }. */
const HELLO_BLOCK = bytes(0x0a, 0x0c, 0x08, 0x02, 0x12, 0x06, ...Buffer.from("hello\n"), 0x18, 0x06);
const HELLO_CID = "QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN";

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
