import { longZeroToEntityId, readSellerReadiness, sellerReadiness } from "./association";
import { describe, expect, it } from "vitest";

const QUSD = "0x0000000000000000000000000000000000a3b8c0"; // 0.0.10729664
const SELLER = "0x620b69e63699edf397146d1306e38fc9f289f981";

describe("seller readiness", () => {
  it("maps long-zero token addresses to entity ids and nothing else", () => {
    expect(longZeroToEntityId(QUSD)).toBe("0.0.10729664");
    expect(longZeroToEntityId(SELLER)).toBeNull();
  });

  it("is ready when associated or with auto-association, and not otherwise", () => {
    expect(sellerReadiness("0.0.5", {}, { tokens: [{ token_id: "0.0.5" }] })).toEqual({
      status: "ready",
      reason: "associated",
    });
    expect(sellerReadiness("0.0.5", { max_automatic_token_associations: -1 }, { tokens: [] }).status).toBe("ready");
    expect(sellerReadiness("0.0.5", { max_automatic_token_associations: 0 }, { tokens: [] })).toEqual({
      status: "not-associated",
      tokenId: "0.0.5",
    });
  });

  it("reports unknown instead of blocking when the mirror node fails", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect((await readSellerReadiness(SELLER, QUSD, down)).status).toBe("unknown");
  });

  it("reads both mirror answers", async () => {
    const mirror = (async (url: string | URL | Request) =>
      Response.json(
        String(url).includes("/tokens?") ? { tokens: [] } : { max_automatic_token_associations: 0 },
      )) as unknown as typeof fetch;
    expect(await readSellerReadiness(SELLER, QUSD, mirror)).toEqual({
      status: "not-associated",
      tokenId: "0.0.10729664",
    });
  });
});
