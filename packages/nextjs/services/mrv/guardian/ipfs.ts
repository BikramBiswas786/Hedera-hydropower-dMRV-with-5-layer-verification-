import { createHash } from "crypto";

/**
 * Trustless IPFS reads: a CID is a hash, so a gateway can be wrong but cannot lie undetected. We ask for the raw
 * block (the trustless gateway spec: `?format=raw`, `Accept: application/vnd.ipld.raw`), check its sha2-256 against
 * the CID, and unpack UnixFS ourselves. Guardian pins documents as CIDv0 (`Qm…`, dag-pb) through its IPFS client;
 * CIDv1 raw leaves (`bafkrei…`) are accepted too. Only sha2-256 multihashes are supported, which is what both use.
 */

export class CidError extends Error {}

export const CODEC_RAW = 0x55;
export const CODEC_DAG_PB = 0x70;
const SHA2_256 = 0x12;
const MAX_BLOCKS = 64;

export type ParsedCid = { version: 0 | 1; codec: number; digest: Uint8Array };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B32 = "abcdefghijklmnopqrstuvwxyz234567";

export function base58Decode(text: string): Uint8Array {
  let value = 0n;
  for (const char of text) {
    const digit = B58.indexOf(char);
    if (digit < 0) throw new CidError(`Invalid base58 character ${char}`);
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of text) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base32Decode(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const digit = B32.indexOf(char);
    if (digit < 0) throw new CidError(`Invalid base32 character ${char}`);
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (let i = offset; i < bytes.length && shift < 49; i++) {
    value += (bytes[i] & 0x7f) * 2 ** shift;
    if ((bytes[i] & 0x80) === 0) return [value, i + 1];
    shift += 7;
  }
  throw new CidError("Truncated varint");
}

function multihashDigest(bytes: Uint8Array, offset: number): Uint8Array {
  const [code, afterCode] = readVarint(bytes, offset);
  const [length, start] = readVarint(bytes, afterCode);
  if (code !== SHA2_256 || length !== 32) throw new CidError(`Unsupported multihash 0x${code.toString(16)}`);
  if (bytes.length !== start + 32) throw new CidError("Multihash length does not match its digest");
  return bytes.slice(start);
}

export function parseCid(cid: string): ParsedCid {
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    return { version: 0, codec: CODEC_DAG_PB, digest: multihashDigest(base58Decode(cid), 0) };
  }
  if (/^b[a-z2-7]+$/.test(cid)) {
    const bytes = base32Decode(cid.slice(1));
    const [version, afterVersion] = readVarint(bytes, 0);
    if (version !== 1) throw new CidError(`Unsupported CID version ${version}`);
    const [codec, afterCodec] = readVarint(bytes, afterVersion);
    if (codec !== CODEC_RAW && codec !== CODEC_DAG_PB) throw new CidError(`Unsupported codec 0x${codec.toString(16)}`);
    return { version: 1, codec, digest: multihashDigest(bytes, afterCodec) };
  }
  throw new CidError(`Not a CIDv0 or base32 CIDv1: ${cid}`);
}

/** CIDv1 of raw bytes (`bafkrei…`), what `ipfs add --cid-version=1 --raw-leaves` gives a single-block file. */
export function rawCid(bytes: Uint8Array): string {
  const digest = createHash("sha256").update(bytes).digest();
  return `b${base32Encode(Uint8Array.from([0x01, CODEC_RAW, SHA2_256, 32, ...digest]))}`;
}

/** Protobuf fields of one message: [field number, wire type, value] with length-delimited values as bytes. */
function protoFields(bytes: Uint8Array): [number, number, number | Uint8Array][] {
  const fields: [number, number, number | Uint8Array][] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, offset);
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) {
      const [value, next] = readVarint(bytes, afterTag);
      fields.push([field, wire, value]);
      offset = next;
    } else if (wire === 2) {
      const [length, start] = readVarint(bytes, afterTag);
      if (start + length > bytes.length) throw new CidError("Truncated protobuf field");
      fields.push([field, wire, bytes.slice(start, start + length)]);
      offset = start + length;
    } else {
      throw new CidError(`Unsupported protobuf wire type ${wire}`);
    }
  }
  return fields;
}

export type DagPbFile = { data: Uint8Array; links: Uint8Array[] };

/** dag-pb PBNode (Links = 2, Data = 1) wrapping UnixFS Data (Type = 1, Data = 2). Only files and raw nodes. */
export function decodeDagPbFile(block: Uint8Array): DagPbFile {
  const links: Uint8Array[] = [];
  let unixfs: Uint8Array | null = null;
  for (const [field, wire, value] of protoFields(block)) {
    if (field === 2 && wire === 2) {
      const hash = protoFields(value as Uint8Array).find(([f, w]) => f === 1 && w === 2);
      if (!hash) throw new CidError("dag-pb link without a hash");
      links.push(hash[2] as Uint8Array);
    } else if (field === 1 && wire === 2) {
      unixfs = value as Uint8Array;
    }
  }
  if (!unixfs) throw new CidError("dag-pb node without UnixFS data");
  let type = -1;
  let data: Uint8Array = new Uint8Array();
  for (const [field, , value] of protoFields(unixfs)) {
    if (field === 1) type = value as number;
    if (field === 2) data = value as Uint8Array;
  }
  if (type !== 0 && type !== 2) throw new CidError(`UnixFS node type ${type} is not a file`);
  return { data, links };
}

/** A link's hash is a binary CID: CIDv0 is a bare multihash, CIDv1 starts with its version byte. */
function parseBinaryCid(bytes: Uint8Array): ParsedCid {
  if (bytes[0] === SHA2_256) return { version: 0, codec: CODEC_DAG_PB, digest: multihashDigest(bytes, 0) };
  const [version, afterVersion] = readVarint(bytes, 0);
  if (version !== 1) throw new CidError(`Unsupported CID version ${version}`);
  const [codec, afterCodec] = readVarint(bytes, afterVersion);
  return { version: 1, codec, digest: multihashDigest(bytes, afterCodec) };
}

function toText(cid: ParsedCid): string {
  if (cid.version === 0) {
    const bytes = Uint8Array.from([SHA2_256, 32, ...cid.digest]);
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    let out = "";
    while (value > 0n) {
      out = B58[Number(value % 58n)] + out;
      value /= 58n;
    }
    return out;
  }
  return `b${base32Encode(Uint8Array.from([0x01, cid.codec, SHA2_256, 32, ...cid.digest]))}`;
}

export type BlockFetcher = (cid: string) => Promise<Uint8Array>;

/**
 * The file a CID names, with every block checked against its hash. `fetchBlock` returns raw block bytes; whatever
 * it returns, a wrong byte fails the digest. Multi-block files are reassembled in link order.
 */
export async function readVerifiedFile(cid: string, fetchBlock: BlockFetcher, maxBytes: number): Promise<Uint8Array> {
  let blocks = 0;
  const read = async (parsed: ParsedCid, label: string): Promise<Uint8Array> => {
    if (++blocks > MAX_BLOCKS) throw new CidError(`File ${cid} has more than ${MAX_BLOCKS} blocks`);
    const block = await fetchBlock(label);
    const digest = createHash("sha256").update(block).digest();
    if (!digest.equals(Buffer.from(parsed.digest))) {
      throw new CidError(`Gateway returned bytes that do not hash to ${label}`);
    }
    if (parsed.codec === CODEC_RAW) return block;
    const node = decodeDagPbFile(block);
    const parts = [node.data];
    for (const link of node.links) {
      const child = parseBinaryCid(link);
      parts.push(await read(child, toText(child)));
    }
    const size = parts.reduce((n, p) => n + p.length, 0);
    if (size > maxBytes) throw new CidError(`File ${cid} is larger than ${maxBytes} bytes`);
    return Buffer.concat(parts);
  };
  return read(parseCid(cid), cid);
}
