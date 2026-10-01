import { API_LIMIT_PER_MINUTE, API_WINDOW_MS, clientKey, takeApiSlot } from "./apiLimit";
import { describe, expect, it } from "vitest";

describe("api rate limit", () => {
  it("allows the window, then refuses until the oldest call ages out", () => {
    const key = "limit-window";
    const start = 1_700_000_000_000;
    for (let i = 0; i < API_LIMIT_PER_MINUTE; i++) expect(takeApiSlot(key, start + i).ok).toBe(true);
    const refused = takeApiSlot(key, start + API_LIMIT_PER_MINUTE);
    expect(refused).toEqual({ ok: false, retryAfterSec: expect.any(Number) });
    if (!refused.ok) expect(refused.retryAfterSec).toBeGreaterThan(0);
    expect(takeApiSlot(key, start + API_WINDOW_MS).ok).toBe(true);
  });

  it("keeps clients apart and ignores a spoofed extra hop", () => {
    expect(clientKey("203.0.113.5, 10.0.0.1", null)).toBe("203.0.113.5");
    expect(clientKey(null, "198.51.100.8")).toBe("198.51.100.8");
    expect(clientKey(null, null)).toBe("local");
    expect(clientKey("a".repeat(200), null)).toHaveLength(80);
    expect(takeApiSlot("client-a", 10).ok).toBe(true);
    expect(takeApiSlot("client-b", 10).ok).toBe(true);
  });
});
