import type { GuardianSources } from "../guardian/hedera";
import { guardianStatusOf } from "./checkout";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN = "0x0000000000000000000000000000000000A430a7"; // 0.0.10760359
const SELLER = "0xd7d4789b59ff215403519ba08da384f89c95da41"; // 0.0.10721162

/** A mirror node that knows the seller's account and answers the transfer history with `history`. */
function mirror(history: () => Response): GuardianSources & { paths: string[] } {
  const paths: string[] = [];
  const fetch = (async (url: string) => {
    const path = url.replace("https://mirror.test", "");
    paths.push(path);
    if (path.startsWith("/api/v1/accounts/")) return Response.json({ account: "0.0.10721162" });
    if (path.startsWith("/api/v1/transactions?account.id=0.0.10721162")) return history();
    return new Response("not found", { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { mirrorNodeUrl: "https://mirror.test", ipfsGateway: "https://ipfs.test/ipfs/{cid}", fetch, paths };
}

describe("the Guardian gate in front of a checkout purchase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("looks for the seller's Guardian transfer of the token, and a token with none makes no claim", async () => {
    const sources = mirror(() => Response.json({ transactions: [], links: { next: null } }));
    expect(await guardianStatusOf(TOKEN, SELLER, sources)).toMatchObject({ verdict: "none" });
    expect(sources.paths).toContain(
      "/api/v1/transactions?account.id=0.0.10721162&transactiontype=CRYPTOTRANSFER&limit=100",
    );
  });

  it("treats an unreadable mirror node as incomplete, never as no claim", async () => {
    const sources = mirror(() => new Response("unavailable", { status: 503 }));
    const status = await guardianStatusOf(TOKEN, SELLER, sources);
    expect(status).toMatchObject({ verdict: "incomplete", ref: "ft:0.0.10760359:0.0.10721162" });
  });

  it("treats a mirror that never answers as incomplete, not as no claim", async () => {
    vi.stubEnv("UPSTREAM_TIMEOUT_MS", "20");
    const fetch = (async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const fail = () => reject(signal.reason ?? Object.assign(new Error("aborted"), { name: "TimeoutError" }));
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
      })) as unknown as typeof globalThis.fetch;
    const status = await guardianStatusOf(TOKEN, SELLER, {
      mirrorNodeUrl: "https://mirror.test",
      ipfsGateway: "https://ipfs.test/ipfs/{cid}",
      fetch,
    });
    expect(status).toMatchObject({ verdict: "incomplete" });
  });

  it("follows a transfer that cites a Guardian record, and an unreadable record is incomplete", async () => {
    const transfer = {
      transaction_id: "0.0.10238177-1790602426-400520522",
      consensus_timestamp: "1790602430.973429104",
      result: "SUCCESS",
      name: "CRYPTOTRANSFER",
      memo_base64: Buffer.from("1790602428.518529884").toString("base64"),
      token_transfers: [{ token_id: "0.0.10760359", account: "0.0.10721162", amount: 12_500 }],
    };
    const sources = mirror(() => Response.json({ transactions: [transfer], links: { next: null } }));
    const status = await guardianStatusOf(TOKEN, SELLER, sources);
    expect(status.verdict).toBe("incomplete");
  });
});
