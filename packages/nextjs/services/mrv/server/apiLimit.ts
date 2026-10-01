/**
 * Per-instance cap for `/api/*`. Serverless isolates do not share this map, so it stops a tight loop against one
 * instance and does not replace a firewall in front of the deployment. Guardian routes keep their own 60/minute cap.
 */
export const API_LIMIT_PER_MINUTE = 300;
export const API_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export type ApiSlot = { ok: true } | { ok: false; retryAfterSec: number };

export function clientKey(forwardedFor: string | null, realIp: string | null): string {
  const raw = (forwardedFor ?? realIp ?? "local").split(",")[0]?.trim() || "local";
  return raw.slice(0, 80);
}

export function takeApiSlot(key: string, now = Date.now()): ApiSlot {
  const recent = (hits.get(key) ?? []).filter(t => now - t < API_WINDOW_MS);
  if (recent.length >= API_LIMIT_PER_MINUTE) {
    hits.set(key, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + API_WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  if (hits.size > 4096) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) hits.delete(oldest);
  }
  hits.set(key, recent);
  return { ok: true };
}
