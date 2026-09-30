import { readDexCheck } from "./dex";
import { zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();

const FEED = "0x00000000000000000000000000000000000000f1";
const POOL = "0x914B98992d7eD602D1f5d9084ECe8160Fc0e741a";
const WHBAR = "0x0000000000000000000000000000000000003ad2";
const OTHER = "0x00000000000000000000000000000000000000aa";

vi.mock("./registry", () => ({
  requireMarket: () => ({
    address: "0x0000000000000000000000000000000000000001",
    abi: [],
    client: { readContract },
  }),
}));

vi.mock("../network", async () => {
  const actual = await vi.importActual<typeof import("../network")>("../network");
  return {
    ...actual,
    isLiveHederaChain: () => false,
    getDeployment: (name: string) =>
      name === "ResilientHbarUsdFeed"
        ? {
            address: FEED,
            chainId: 296,
            abi: [
              {
                type: "function",
                name: "resolve",
                stateMutability: "view",
                inputs: [],
                outputs: [{ type: "tuple", components: [{ name: "answer", type: "int256" }] }],
              },
            ],
          }
        : undefined,
  };
});

/** pool, isV2, whbarIsToken0, enabled, dec0, dec1, maxDeviationBps, minLiquidity */
const guard = (
  over: {
    pool?: string;
    isV2?: boolean;
    whbarIsToken0?: boolean;
    enabled?: boolean;
    max?: number;
  } = {},
) => [
  over.pool ?? POOL,
  over.isV2 ?? false,
  over.whbarIsToken0 ?? true,
  over.enabled ?? true,
  8,
  6,
  over.max ?? 300,
  0n,
];

beforeEach(() => {
  readContract.mockReset();
  readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address?: string }) => {
    if (functionName === "poolGuard") return guard();
    if (functionName === "token0") return WHBAR;
    // 10 HBAR (tinybar) against 1.1 USDC (6 decimals) is $0.11, matching the oracle.
    if (functionName === "getReserves") return [1_000_000_000n, 1_100_000n, 0];
    if (functionName === "resolve" && address?.toLowerCase() === FEED) return [{ answer: 11_000_000n }];
    throw new Error(functionName);
  });
});

describe("readDexCheck", () => {
  it("accepts a V1 WHBAR pair inside the band", async () => {
    const dex = await readDexCheck();
    expect(dex.accepted).toBe(true);
    expect(dex.deviationBps).toBe(0);
    expect(dex.venue).toBe("SaucerSwap V1");
    expect(dex.publicMainnet).toBeNull();
  });

  it("refuses a disabled pool guard", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard({ enabled: false });
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toThrow(/no SaucerSwap pool/);
  });

  it("refuses a zero pool address", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard({ pool: zeroAddress });
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toThrow(/no SaucerSwap pool/);
  });

  it("refuses a V2 pool", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard({ isV2: true });
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toThrow(/V2/);
  });

  it("refuses a pair whose token order is not the market's WHBAR flag", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard({ whbarIsToken0: true });
      if (functionName === "token0") return OTHER;
      if (functionName === "getReserves") return [1_000_000_000n, 1_100_000n, 0];
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toThrow(/token order/);
  });

  it("refuses empty reserves", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard();
      if (functionName === "token0") return WHBAR;
      if (functionName === "getReserves") return [0n, 0n, 0];
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toMatchObject({ message: expect.stringMatching(/empty/), httpStatus: 503 });
  });

  it("does not accept a manipulated reserve that prices HBAR far from the oracle", async () => {
    readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address?: string }) => {
      if (functionName === "poolGuard") return guard();
      if (functionName === "token0") return WHBAR;
      // 10 HBAR against 20 USDC is $2, against a $0.11 oracle.
      if (functionName === "getReserves") return [1_000_000_000n, 20_000_000n, 0];
      if (functionName === "resolve" && address?.toLowerCase() === FEED) return [{ answer: 11_000_000n }];
      throw new Error(functionName);
    });
    const dex = await readDexCheck();
    expect(dex.accepted).toBe(false);
    expect(dex.deviationBps).toBeGreaterThan(300);
  });

  it("refuses when the oracle resolve call fails", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "poolGuard") return guard();
      if (functionName === "token0") return WHBAR;
      if (functionName === "getReserves") return [1_000_000_000n, 1_100_000n, 0];
      if (functionName === "resolve") throw new Error("PriceSourcesDisagree");
      throw new Error(functionName);
    });
    await expect(readDexCheck()).rejects.toThrow(/paused/);
  });
});
