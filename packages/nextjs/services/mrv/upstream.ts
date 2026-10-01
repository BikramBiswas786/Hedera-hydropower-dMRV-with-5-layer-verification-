/**
 * Mirror nodes and IPFS gateways sometimes never answer. A read that uses `fetch` directly will sit until the
 * process is killed, which is what a first `yarn mrv:reproduce` or Check evidence used to do.
 * `UPSTREAM_TIMEOUT_MS` overrides the wait (1 ms to 120 s). IPFS still prefers `ipfsTimeoutMs` on the source.
 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 12_000;

export function upstreamTimeoutMs(): number {
  const raw = Number(process.env.UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1 && raw <= 120_000 ? raw : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

export function isUpstreamTimeout(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError" || name === "UpstreamTimeout";
}

/**
 * One upstream call that cannot hang. A signal the caller already set (the IPFS gateway loop) is left alone.
 * Silence is rethrown as `UpstreamTimeout` so each reader can map it onto its own error type.
 */
export async function fetchUpstream(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
  timeoutMs = upstreamTimeoutMs(),
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (!isUpstreamTimeout(error)) throw error;
    const timed = new Error(`Upstream timed out: ${url}`);
    timed.name = "UpstreamTimeout";
    throw timed;
  }
}
