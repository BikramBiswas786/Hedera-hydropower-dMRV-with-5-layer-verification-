import { parseHederaDid } from "./did";
import {
  type GuardianSources,
  SourceError,
  fetchIpfsJson,
  fetchMessageByTimestamp,
  fetchTopicEntries,
  isConsensusTimestamp,
  remoteDidResolver,
} from "./hedera";
import { buildDocumentLoader, verifyGuardianPresentation } from "./vc";

/**
 * The buyer's question about a Guardian token: is this mint backed by a signed Guardian record, and was it signed by
 * the identity that controls the token? Answered from the public mirror node and IPFS only (no Guardian login, no
 * indexer account), so a wallet, marketplace or agent can ask it before paying:
 *
 *   mint memo / NFT metadata / transfer memo → VP consensus timestamp (Guardian's mint-block writes it there)
 *   → HCS VP-Document message → IPFS VP, bytes checked against the CID → Ed25519 proofs, DIDs resolved from HCS
 *   → the MintToken VC names this token and this amount → the signer's DID document was published by the treasury
 *
 * `evidence.ts` asks the opposite question for the registry (refuse anything Guardian already minted). Read-only.
 */

export type TraceCheck = { id: string; ok: boolean | null; detail: string };
type Check = (id: string, ok: boolean | null, detail: string) => void;

export type GuardianTrace = {
  /** backed: every check passed. not-backed: one failed. incomplete: a source could not be read (e.g. IPFS). */
  verdict: "backed" | "not-backed" | "incomplete";
  ref: string;
  token: {
    id: string;
    name: string;
    symbol: string;
    type: "FUNGIBLE_COMMON" | "NON_FUNGIBLE_UNIQUE";
    decimals: number;
    treasury: string;
    totalSupply: string;
  };
  mint: {
    kind: "mint" | "transfer" | "nft";
    transactionId: string | null;
    consensusTimestamp: string | null;
    /** Base units moved by this transaction (fungible), or NFTs sharing this record (NFT). */
    units: string | null;
    serial: number | null;
  };
  record: {
    timestamp: string;
    topicId: string | null;
    sequence: number | null;
    payer: string | null;
    cid: string | null;
    signer: string | null;
    signature: "verified" | "invalid" | "not-checked";
  };
  mintVc: { tokenId: string; amount: string; date: string | null } | null;
  registry: { did: string; account: string | null; parentTopic: string | null } | null;
  /** The documents the mint rests on, one relationship level at a time (metadata from HCS, not IPFS). */
  sources: {
    timestamp: string;
    depth: number;
    type: string | null;
    status: string | null;
    issuer: string | null;
    payer: string | null;
  }[];
  checks: TraceCheck[];
};

type MirrorToken = {
  token_id: string;
  name: string;
  symbol: string;
  type: "FUNGIBLE_COMMON" | "NON_FUNGIBLE_UNIQUE";
  decimals: string;
  treasury_account_id: string;
  total_supply: string;
};
type MirrorTransaction = {
  transaction_id: string;
  consensus_timestamp: string;
  name: string;
  result: string;
  entity_id?: string | null;
  memo_base64?: string;
  token_transfers?: { token_id: string; account: string; amount: number }[];
  nft_transfers?: { token_id: string; serial_number: number; receiver_account_id: string | null }[];
};

const MINT_TYPE = /^(MintToken|MintNFToken)(&|$)/;
const MAX_SOURCES = 12;
const MAX_NFT_PAGES = 10;

async function mirror<T>(sources: GuardianSources, path: string): Promise<T> {
  const response = await sources.fetch(`${sources.mirrorNodeUrl.replace(/\/$/, "")}${path}`, {
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) throw new SourceError(`Mirror node returned ${response.status} for ${path}`);
  return (await response.json()) as T;
}

const memoOf = (tx: { memo_base64?: string }) =>
  Buffer.from(tx.memo_base64 ?? "", "base64")
    .toString("utf8")
    .trim();

/** Guardian writes "<vp timestamp>" or "<vp timestamp> <policy memo>"; the first word is the record. */
const recordOf = (text: string) => {
  const first = text.split(/\s+/)[0] ?? "";
  return isConsensusTimestamp(first) ? first : null;
};

function mirrorTransactionId(id: string): string | null {
  const at = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(id);
  if (at) return `${at[1]}-${at[2]}-${at[3]}`;
  return /^\d+\.\d+\.\d+-\d+-\d+$/.test(id) ? id : null;
}

type Resolved = { tokenId: string; record: string; mint: GuardianTrace["mint"] };

function fromTransaction(tx: MirrorTransaction, tokenHint?: string, holder?: string): Resolved {
  if (tx.result !== "SUCCESS") throw new SourceError(`Transaction ${tx.transaction_id} did not succeed (${tx.result})`);
  const record = recordOf(memoOf(tx));
  if (!record) throw new SourceError(`Transaction ${tx.transaction_id} has no Guardian record in its memo`);
  const tokenId = tokenHint ?? tx.entity_id ?? tx.token_transfers?.[0]?.token_id ?? tx.nft_transfers?.[0]?.token_id;
  if (!tokenId) throw new SourceError(`Transaction ${tx.transaction_id} moves no token`);
  const credited = (tx.token_transfers ?? [])
    .filter(t => t.token_id === tokenId && t.amount > 0 && (!holder || t.account === holder))
    .reduce((sum, t) => sum + BigInt(t.amount), 0n);
  const nfts = (tx.nft_transfers ?? []).filter(
    t => t.token_id === tokenId && (!holder || t.receiver_account_id === holder),
  ).length;
  const kind = tx.name === "TOKENMINT" ? "mint" : "transfer";
  return {
    tokenId,
    record,
    mint: {
      kind,
      transactionId: tx.transaction_id,
      consensusTimestamp: tx.consensus_timestamp,
      units: credited > 0n ? credited.toString() : nfts > 0 ? String(nfts) : null,
      serial: null,
    },
  };
}

/**
 * What the buyer holds, to the Guardian record behind it:
 *   nft:<tokenId>:<serial>      the serial's metadata (Guardian mints every NFT of a VP with the VP's timestamp)
 *   <tx id>                     a mint, or Guardian's treasury → owner transfer (same memo)
 *   ft:<tokenId>:<account>      the latest Guardian transfer of that token to that account
 */
export async function resolveGuardianMint(sources: GuardianSources, ref: string): Promise<Resolved> {
  const nft = /^nft:(\d+\.\d+\.\d+):(\d+)$/.exec(ref);
  if (nft) {
    const [, tokenId, serial] = nft;
    const info = await mirror<{ metadata?: string }>(sources, `/api/v1/tokens/${tokenId}/nfts/${serial}`);
    const record = recordOf(
      Buffer.from(info.metadata ?? "", "base64")
        .toString("utf8")
        .trim(),
    );
    if (!record) throw new SourceError(`NFT ${tokenId}/${serial} metadata is not a Guardian record timestamp`);
    const history = await mirror<{
      transactions: { type: string; transaction_id: string; consensus_timestamp: string }[];
    }>(sources, `/api/v1/tokens/${tokenId}/nfts/${serial}/transactions?limit=100&order=asc`);
    const minted = history.transactions?.find(t => t.type === "TOKENMINT");
    return {
      tokenId,
      record,
      mint: {
        kind: "nft",
        transactionId: minted?.transaction_id ?? null,
        consensusTimestamp: minted?.consensus_timestamp ?? null,
        units: null,
        serial: Number(serial),
      },
    };
  }
  const ft = /^ft:(\d+\.\d+\.\d+):(\d+\.\d+\.\d+)$/.exec(ref);
  if (ft) {
    const [, tokenId, account] = ft;
    let path: string | null = `/api/v1/transactions?account.id=${account}&transactiontype=CRYPTOTRANSFER&limit=100`;
    for (let page = 0; path && page < 5; page++) {
      const body: { transactions: MirrorTransaction[]; links?: { next?: string | null } } = await mirror(sources, path);
      const hit = body.transactions.find(
        tx =>
          tx.result === "SUCCESS" &&
          recordOf(memoOf(tx)) &&
          (tx.token_transfers ?? []).some(t => t.token_id === tokenId && t.account === account && t.amount > 0),
      );
      if (hit) return fromTransaction(hit, tokenId, account);
      const next = body.links?.next ?? null;
      path = next && next.startsWith("/api/v1/transactions") ? next : null;
    }
    throw new SourceError(`No Guardian transfer of ${tokenId} to ${account} in its recent history`);
  }
  const txId = mirrorTransactionId(ref);
  if (txId) {
    const body = await mirror<{ transactions?: MirrorTransaction[] }>(sources, `/api/v1/transactions/${txId}`);
    const tx = body.transactions?.find(t => t.name === "TOKENMINT") ?? body.transactions?.[0];
    if (!tx) throw new SourceError(`Transaction ${ref} not found`);
    return fromTransaction(tx);
  }
  throw new SourceError("Expected nft:<tokenId>:<serial>, ft:<tokenId>:<account> or a transaction id");
}

/** NFTs of the token whose metadata names this record (Guardian mints `amount` of them), up to 1,000 serials. */
async function countSerials(sources: GuardianSources, tokenId: string, record: string) {
  let count = 0;
  let complete = true;
  let path: string | null = `/api/v1/tokens/${tokenId}/nfts?limit=100&order=asc`;
  for (let page = 0; path; page++) {
    if (page === MAX_NFT_PAGES) {
      complete = false;
      break;
    }
    const body: { nfts: { metadata?: string }[]; links?: { next?: string | null } } = await mirror(sources, path);
    count += body.nfts.filter(
      n =>
        Buffer.from(n.metadata ?? "", "base64")
          .toString("utf8")
          .trim() === record,
    ).length;
    const next = body.links?.next ?? null;
    path = next && next.startsWith("/api/v1/tokens/") ? next : null;
  }
  return { count, complete };
}

/** Base units for a MintToken amount ("12.500" with 3 decimals is 12500), exact, or null if it is not a number. */
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) return null;
  return BigInt(match[1] + fraction.slice(0, decimals));
}

function subjectsOf(vc: any): any[] {
  const s = vc?.credentialSubject;
  return Array.isArray(s) ? s : s ? [s] : [];
}

export async function traceGuardianMint(sources: GuardianSources, ref: string): Promise<GuardianTrace> {
  const resolved = await resolveGuardianMint(sources, ref);
  const token = await mirror<MirrorToken>(sources, `/api/v1/tokens/${resolved.tokenId}`);
  const decimals = Number(token.decimals) || 0;
  const checks: TraceCheck[] = [];
  const check: Check = (id, ok, detail) => checks.push({ id, ok, detail });

  const trace: GuardianTrace = {
    verdict: "incomplete",
    ref,
    token: {
      id: token.token_id,
      name: token.name,
      symbol: token.symbol,
      type: token.type,
      decimals,
      treasury: token.treasury_account_id,
      totalSupply: token.total_supply,
    },
    mint: resolved.mint,
    record: {
      timestamp: resolved.record,
      topicId: null,
      sequence: null,
      payer: null,
      cid: null,
      signer: null,
      signature: "not-checked",
    },
    mintVc: null,
    registry: null,
    sources: [],
    checks,
  };

  const message = await fetchMessageByTimestamp(sources, resolved.record);
  Object.assign(trace.record, { topicId: message.topicId, sequence: message.sequence, payer: message.payerAccountId });
  let body: any = null;
  try {
    body = JSON.parse(message.text);
  } catch {
    // reported below
  }
  const isVp = body?.type === "VP-Document" && body?.status === "ISSUE" && typeof body?.cid === "string";
  check(
    "record",
    isVp,
    isVp
      ? `HCS ${message.topicId} #${message.sequence} is an issued Guardian VP-Document`
      : `HCS message ${resolved.record} is not an issued Guardian VP-Document`,
  );
  if (!isVp) return finish(trace);
  trace.record.cid = body.cid;

  if (resolved.mint.consensusTimestamp) {
    const before = Number(resolved.record) < Number(resolved.mint.consensusTimestamp);
    check(
      "order",
      before,
      before ? "The record reached consensus before the mint" : "The mint predates the record it cites",
    );
  }
  const payerIsTreasury = message.payerAccountId === token.treasury_account_id;
  check(
    "record-payer",
    payerIsTreasury,
    `The record was submitted by ${message.payerAccountId ?? "an unknown account"}; the token treasury is ${token.treasury_account_id}`,
  );

  await walkSources(sources, trace, body.relationships);

  let vp: any;
  try {
    vp = await fetchIpfsJson(sources, body.cid);
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    check("signature", null, `IPFS document ${body.cid} could not be read: ${error.message}`);
    return finish(trace);
  }
  const signer = typeof vp?.proof?.verificationMethod === "string" ? vp.proof.verificationMethod.split("#")[0] : null;
  trace.record.signer = signer;
  // The VC library turns loader errors into "not verified"; remember them so an unreachable source reads as
  // incomplete rather than as a bad signature.
  let unreadable: string | null = null;
  const remember =
    <T>(load: (iri: string) => Promise<T>) =>
    async (iri: string) => {
      try {
        return await load(iri);
      } catch (error) {
        if (error instanceof SourceError) unreadable ??= error.message;
        throw error;
      }
    };
  const documentLoader = buildDocumentLoader(
    remember(remoteDidResolver(sources)),
    remember(async iri => {
      const match = /^ipfs:\/\/([A-Za-z0-9]+)$/.exec(iri);
      return match ? { documentUrl: iri, document: await fetchIpfsJson(sources, match[1]) } : null;
    }),
  );
  try {
    await verifyGuardianPresentation(vp, documentLoader);
    trace.record.signature = "verified";
    check("signature", true, `VP and every VC in it verify (Ed25519Signature2018, signer ${signer})`);
  } catch (error) {
    if (unreadable) {
      check("signature", null, `A DID document or schema context could not be read: ${unreadable}`);
    } else {
      trace.record.signature = "invalid";
      check("signature", false, `Signature check failed: ${(error as Error).message}`);
    }
  }

  const vcs: any[] = Array.isArray(vp?.verifiableCredential) ? vp.verifiableCredential : [];
  const mintSubject = vcs.flatMap(subjectsOf).find(s => typeof s?.type === "string" && MINT_TYPE.test(s.type));
  if (mintSubject) {
    trace.mintVc = {
      tokenId: String(mintSubject.tokenId),
      amount: String(mintSubject.amount),
      date: typeof mintSubject.date === "string" ? mintSubject.date : null,
    };
  }
  const namesToken = trace.mintVc?.tokenId === token.token_id;
  check(
    "mint-vc",
    namesToken,
    trace.mintVc
      ? `The MintToken VC names token ${trace.mintVc.tokenId}, amount ${trace.mintVc.amount}`
      : "The VP has no MintToken VC",
  );
  if (trace.mintVc && namesToken) await checkAmount(sources, trace, check);
  if (signer) await checkRegistry(sources, trace, signer, check);
  return finish(trace);
}

async function checkAmount(sources: GuardianSources, trace: GuardianTrace, check: Check) {
  const vcAmount = trace.mintVc!.amount;
  if (trace.token.type === "NON_FUNGIBLE_UNIQUE") {
    const expected = Number(vcAmount);
    const { count, complete } = await countSerials(sources, trace.token.id, trace.record.timestamp);
    trace.mint.units = String(count);
    if (!complete) {
      check(
        "amount",
        count <= expected ? null : false,
        `${count}+ serials cite this record; the VC allows ${expected}`,
      );
    } else {
      check("amount", count === expected, `${count} serials cite this record; the VC minted ${expected}`);
    }
    return;
  }
  const expected = toBaseUnits(vcAmount, trace.token.decimals);
  const moved = trace.mint.units ? BigInt(trace.mint.units) : null;
  if (expected === null || moved === null) {
    check("amount", null, `Cannot compare the VC amount ${vcAmount} with the transaction`);
  } else if (trace.mint.kind === "mint") {
    check("amount", moved === expected, `Minted ${moved} base units; the VC amount ${vcAmount} is ${expected}`);
  } else {
    check("amount", moved <= expected, `Transferred ${moved} base units under a VC for ${expected}`);
  }
}

/**
 * The signer's DID lives on a topic; its DID-Document message was paid for by the Guardian user who owns it. For a
 * Standard Registry that account is also the treasury of every token its policies create, so the two must match.
 */
async function checkRegistry(sources: GuardianSources, trace: GuardianTrace, did: string, check: Check) {
  const parsed = parseHederaDid(did);
  if (!parsed) {
    check("registry", false, `Signer ${did} is not a Hedera DID`);
    return;
  }
  const entries = await fetchTopicEntries(sources, parsed.topicId);
  const parse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const didEntry = entries.find(e => {
    const m = parse(e.text);
    return m?.type === "DID-Document" && m.did === parsed.did;
  });
  const userTopic = entries.map(e => parse(e.text)).find(m => m?.type === "Topic" && m.messageType === "USER_TOPIC");
  trace.registry = {
    did: parsed.did,
    account: didEntry?.payerAccountId ?? null,
    parentTopic: typeof userTopic?.parentId === "string" ? userTopic.parentId : null,
  };
  const ok = !!didEntry && didEntry.payerAccountId === trace.token.treasury;
  check(
    "registry",
    ok,
    didEntry
      ? `The signer's DID was published by ${didEntry.payerAccountId}; the token treasury is ${trace.token.treasury}`
      : `No DID-Document for ${parsed.did} on topic ${parsed.topicId}`,
  );
}

async function walkSources(sources: GuardianSources, trace: GuardianTrace, relationships: unknown) {
  const queue: { ts: string; depth: number }[] = (Array.isArray(relationships) ? relationships : [])
    .filter((r): r is string => typeof r === "string" && isConsensusTimestamp(r))
    .map(ts => ({ ts, depth: 1 }));
  const seen = new Set<string>();
  while (queue.length && trace.sources.length < MAX_SOURCES) {
    const { ts, depth } = queue.shift()!;
    if (seen.has(ts)) continue;
    seen.add(ts);
    const message = await fetchMessageByTimestamp(sources, ts);
    let body: any = null;
    try {
      body = JSON.parse(message.text);
    } catch {
      // a non-Guardian message is listed with nulls
    }
    trace.sources.push({
      timestamp: ts,
      depth,
      type: typeof body?.type === "string" ? body.type : null,
      status: typeof body?.option?.status === "string" ? body.option.status : (body?.documentStatus ?? null),
      issuer: typeof body?.issuer === "string" ? body.issuer : null,
      payer: message.payerAccountId,
    });
    if (depth < 2 && Array.isArray(body?.relationships)) {
      for (const r of body.relationships)
        if (typeof r === "string" && isConsensusTimestamp(r)) queue.push({ ts: r, depth: depth + 1 });
    }
  }
}

function finish(trace: GuardianTrace): GuardianTrace {
  trace.verdict = trace.checks.some(c => c.ok === false)
    ? "not-backed"
    : trace.checks.some(c => c.ok === null)
      ? "incomplete"
      : "backed";
  return trace;
}
