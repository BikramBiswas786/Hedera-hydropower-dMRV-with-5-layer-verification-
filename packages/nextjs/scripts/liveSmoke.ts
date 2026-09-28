/**
 * Clicks through the live deployment the way a judge or an agent would, without a wallet:
 *
 *   yarn live:smoke                       checks https://hydro-dmrv.vercel.app
 *   LIVE_URL=http://localhost:3000 yarn live:smoke
 *
 * It reads the registry and market, checks the SaucerSwap pair against the oracle, builds (but never signs) a
 * purchase for an open listing, re-derives every testnet issuance from HCS, runs the verify scenarios, and lists the
 * MCP tools. It fails when any of those would fail for a visitor. The Live smoke workflow runs it on a schedule and
 * writes the table to the job summary.
 */
import { appendFileSync } from "node:fs";
import { getDeployment } from "~~/services/mrv/network";

const BASE = (process.env.LIVE_URL ?? "https://hydro-dmrv.vercel.app").replace(/\/$/, "");
const MARKET = getDeployment("CreditMarket", 296)?.address.toLowerCase();
const REGISTRY = getDeployment("DmrvRegistry", 296)?.address.toLowerCase();

type Row = { check: string; ok: boolean; detail: string };
const rows: Row[] = [];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    const error = typeof body === "object" && body && "error" in body ? String(body.error) : text.slice(0, 200);
    throw new Error(`${path} → ${response.status}: ${error}`);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ check: name, ok: true, detail: await run() });
  } catch (error) {
    rows.push({ check: name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Overview = {
  registry: string;
  address: string;
  market: string | null;
  attestationCount: number;
  totalIssuedKg: number;
  totalRetiredKg: number;
  retirementCount: number;
  oracle: { paused?: boolean } | null;
};
type Dex = {
  pair: string;
  price: number;
  oraclePrice: number;
  deviationBps: number;
  maxDeviationBps: number;
  accepted: boolean;
  publicMainnet?: { price: number; oraclePrice: number; deviationBps: number; accepted: boolean };
};
type Listing = {
  id: number;
  seller: string;
  unitsAvailable: number;
  priceUsdCentsPerTonne: number;
  quoteFullListingTinybar: string | null;
};
type Prepared = { chainId: number; to: string; data: string; value: string };
type Attestation = { id: number; plantId: string; creditedKg?: number };
type Reproduction = { status: string; engineMatches?: boolean };
type Verify = { report: { decision: string } };

/** Streamable-HTTP MCP answers either JSON or one SSE event; take the JSON-RPC message from whichever it is. */
async function mcp(method: string, params: unknown, session?: string) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP ${method} → ${response.status}: ${text.slice(0, 200)}`);
  const json = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim())
        .find(line => line.startsWith("{"));
  assert(json, `MCP ${method} returned no JSON-RPC message`);
  const message = JSON.parse(json) as { result?: unknown; error?: { message: string } };
  if (message.error) throw new Error(`MCP ${method}: ${message.error.message}`);
  return { result: message.result, session: response.headers.get("mcp-session-id") ?? session };
}

async function main() {
  if (!MARKET || !REGISTRY) throw new Error("deployedContracts.ts has no Hedera testnet (296) registry and market");
  let listings: Listing[] = [];

  await check("Registry overview", async () => {
    const o = await call<Overview>("/api/registry");
    assert(o.registry !== "legacy", `the app reads the legacy registry ${o.address}`);
    assert(o.address.toLowerCase() === REGISTRY, `registry ${o.address} is not deployedContracts' ${REGISTRY}`);
    assert(o.market?.toLowerCase() === MARKET, `market ${o.market} is not deployedContracts' ${MARKET}`);
    assert(o.attestationCount > 0, "no attestations");
    return `${o.attestationCount} attestations, ${o.totalIssuedKg / 1000} t issued, ${o.retirementCount} retirements`;
  });

  await check("SaucerSwap pair vs oracle", async () => {
    const d = await call<Dex>("/api/market/dex");
    const line = `pair $${d.price.toFixed(5)}, oracle $${d.oraclePrice.toFixed(5)}, ${d.deviationBps} bps (max ${d.maxDeviationBps})`;
    assert(d.accepted, `outside the band: ${line}`);
    return line;
  });

  await check("Public mainnet WHBAR/USDC vs mainnet Chainlink", async () => {
    const m = (await call<Dex>("/api/market/dex")).publicMainnet;
    assert(m, "no publicMainnet reading");
    const line = `pair $${m.price.toFixed(5)}, Chainlink $${m.oraclePrice.toFixed(5)}, ${m.deviationBps} bps`;
    assert(m.accepted, `outside the band: ${line}`);
    return line;
  });

  await check("Open listings with a live quote", async () => {
    listings = (await call<{ listings: Listing[] }>("/api/registry/listings")).listings;
    const buyable = listings.filter(l => l.unitsAvailable > 0 && l.quoteFullListingTinybar !== null);
    assert(buyable.length > 0, `${listings.length} open listings, none buyable now`);
    const kg = buyable.reduce((sum, l) => sum + l.unitsAvailable, 0);
    return `${buyable.length} listing(s), ${kg / 1000} t for sale`;
  });

  await check("prepare_purchase builds an unsigned buyAndRetire", async () => {
    const listing = listings.find(l => l.unitsAvailable > 0);
    assert(listing, "no open listing to prepare");
    const p = await post<Prepared>("/api/market/prepare-purchase", {
      listingId: listing.id,
      amountKg: Math.min(10, listing.unitsAvailable),
      retire: true,
      beneficiary: "live smoke check",
    });
    assert(p.chainId === 296, `chain ${p.chainId}`);
    assert(p.to.toLowerCase() === MARKET, `to ${p.to} is not the market`);
    assert(/^0x[0-9a-f]{8}/i.test(p.data) && BigInt(p.value) > 0n, "empty calldata or value");
    return `listing #${listing.id}, ${Math.min(10, listing.unitsAvailable)} kg, value ${(Number(BigInt(p.value) / 10n ** 10n) / 1e8).toFixed(6)} HBAR (not sent)`;
  });

  await check("Every issuance reproduces from HCS", async () => {
    const { attestations } = await call<{ attestations: Attestation[] }>("/api/registry/attestations?count=100");
    assert(attestations.length > 0, "no attestations");
    const results = await Promise.all(
      attestations.map(async a => {
        const r = await call<Reproduction>(`/api/registry/attestations/${a.id}/reproduce`);
        return { id: a.id, ok: r.status === "reproduced" && r.engineMatches !== false, status: r.status };
      }),
    );
    const bad = results.filter(r => !r.ok);
    assert(bad.length === 0, bad.map(r => `#${r.id} ${r.status}`).join(", "));
    return `${results.length}/${results.length} reproduced (engine re-run on HCS readings matches report and chain)`;
  });

  for (const [scenario, expected] of [
    ["healthy", "APPROVED"],
    ["inflated", "REJECTED"],
    ["tampered", "REJECTED"],
  ] as const) {
    await check(`Verify scenario '${scenario}'`, async () => {
      const body = await call<unknown>(`/api/mrv/scenarios/${scenario}`);
      const { report } = await post<Verify>("/api/mrv/verify", body);
      assert(report.decision === expected, `decision ${report.decision}, expected ${expected}`);
      return report.decision;
    });
  }

  await check("MCP server lists its tools", async () => {
    const init = await mcp("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "hydro-dmrv-live-smoke", version: "1" },
    });
    const { result } = await mcp("tools/list", {}, init.session ?? undefined);
    const names = ((result as { tools?: { name: string }[] }).tools ?? []).map(t => t.name);
    for (const tool of ["get_dex_price", "list_open_listings", "prepare_purchase", "reproduce_attestation"]) {
      assert(names.includes(tool), `missing ${tool}`);
    }
    assert(!names.includes("submit_attestation"), "submit_attestation is listed without a key");
    return `${names.length} public tools`;
  });

  await check("Agent discovery files", async () => {
    await call<unknown>("/api/openapi.json");
    const llms = await call<string>("/llms.txt");
    assert(
      typeof llms === "string" && llms.includes("prepare_purchase"),
      "llms.txt does not describe prepare_purchase",
    );
    return "/api/openapi.json and /llms.txt";
  });

  const failed = rows.filter(r => !r.ok);
  const table = [
    `### Live smoke: ${BASE}`,
    "",
    "| | Check | Result |",
    "| --- | --- | --- |",
    ...rows.map(r => `| ${r.ok ? "✅" : "❌"} | ${r.check} | ${r.detail.replace(/\|/g, "\\|")} |`),
    "",
    `${rows.length - failed.length}/${rows.length} passed at ${new Date().toISOString()}.`,
  ].join("\n");
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
