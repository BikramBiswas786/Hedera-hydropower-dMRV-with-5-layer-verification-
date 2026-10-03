export const HBAR_PRICE_CACHE_DURATION_MS = 60 * 1000;
export const HBAR_PRICE_URL = "https://api.coingecko.com/api/v3/coins/hedera-hashgraph";

type HbarPriceCache = {
  price: number;
  timestamp: number;
};

let cache: HbarPriceCache | null = null;

/**
 * The footer calls this from the browser. CoinGecko does not send CORS headers, so the browser
 * reads `/api/hbar-price` and that route reads CoinGecko. Settlement does not use this number.
 */
export async function fetchHbarPrice(): Promise<number> {
  const now = Date.now();
  if (cache && now - cache.timestamp < HBAR_PRICE_CACHE_DURATION_MS) {
    return cache.price;
  }

  const inBrowser = typeof window !== "undefined";
  try {
    const response = await fetch(inBrowser ? "/api/hbar-price" : HBAR_PRICE_URL, {
      signal: AbortSignal.timeout(8_000),
    });
    const data = await response.json();
    const raw = inBrowser ? data?.usd : data?.market_data?.current_price?.usd;
    const price = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    cache = { price, timestamp: now };
    return price;
  } catch (error) {
    // The footer price is decorative, and offline local development is expected; settlement uses the oracle.
    console.warn("HBAR price unavailable:", error);
    return cache?.price ?? 0;
  }
}
