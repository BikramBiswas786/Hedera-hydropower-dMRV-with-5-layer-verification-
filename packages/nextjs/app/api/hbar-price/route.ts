import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COINGECKO = "https://api.coingecko.com/api/v3/coins/hedera-hashgraph";

/** Footer price. The browser must not call CoinGecko itself: that origin sends no CORS header. */
export async function GET() {
  try {
    const response = await fetch(COINGECKO, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return NextResponse.json({ usd: 0 }, { status: 502 });
    const data = (await response.json()) as { market_data?: { current_price?: { usd?: unknown } } };
    const raw = data.market_data?.current_price?.usd;
    const usd = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    return NextResponse.json({ usd }, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ usd: 0 }, { status: 502 });
  }
}
