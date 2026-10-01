import { fetchTopicMessage } from "./mirror";
import { fetchUpstream, isUpstreamTimeout } from "./upstream";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

const hung = (async (_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    const fail = () => reject(signal.reason ?? Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  })) as unknown as typeof fetch;

describe("upstream reads", () => {
  it("returns a mirror answer that arrived, and does not replace a caller's signal", async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen.push(init ?? {});
      return Response.json({ ok: true });
    }) as unknown as typeof fetch;
    const own = AbortSignal.timeout(5_000);
    const response = await fetchUpstream(fetchImpl, "https://mirror.test/api", { signal: own }, 1);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen[0]?.signal).toBe(own);
  });

  it("fails a silent mirror instead of waiting", async () => {
    await expect(fetchUpstream(hung, "https://mirror.test/slow", undefined, 20)).rejects.toMatchObject({
      name: "UpstreamTimeout",
    });
  });

  it("makes a hung HCS read throw MirrorError within the override", async () => {
    vi.stubEnv("UPSTREAM_TIMEOUT_MS", "30");
    await expect(fetchTopicMessage("0.0.1", 1, hung)).rejects.toThrow(/Mirror node timed out/);
    expect(isUpstreamTimeout(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
  });
});
