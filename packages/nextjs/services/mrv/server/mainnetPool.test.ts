import { publicMainnetPoolFromCalls } from "./mainnetPool";
import { describe, expect, it } from "vitest";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const encode = (...words: bigint[]) => `0x${words.map(word).join("")}`;

describe("public mainnet SaucerSwap pair", () => {
  it("prices the 27 Sep 2026 reserves 15 bps from that day's Chainlink answer", () => {
    // getReserves and latestRoundData from mainnet pair 0.0.1462797 and Chainlink HBAR/USD.
    const reserves = encode(269_760_716_132n, 284_260_073_883_323n, 0n);
    const round = encode(1n, 9_504_451n, 0n, 1_790_499_804n, 1n);
    const pool = publicMainnetPoolFromCalls(reserves, round);
    expect(pool.pair).toBe("0.0.1462797");
    expect(pool.price).toBeCloseTo(0.09489926, 8);
    expect(pool.oraclePrice).toBeCloseTo(0.09504451, 8);
    expect(pool.deviationBps).toBe(15);
    expect(pool.accepted).toBe(true);
  });

  it("refuses a pair more than 3% from Chainlink", () => {
    const reserves = encode(1_000_000n, 100_000_000n, 0n); // $1.00 at 8 decimals
    const round = encode(1n, 103_010_000n, 0n, 0n, 1n); // 301 bps above $1
    const pool = publicMainnetPoolFromCalls(reserves, round);
    expect(pool.deviationBps).toBe(301);
    expect(pool.accepted).toBe(false);
  });
});
