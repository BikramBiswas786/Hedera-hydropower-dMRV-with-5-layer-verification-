import { prepareDexRetire, readCreditPool } from "./creditPool";
import { ApiError } from "./errors";
import { getAddress, zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();
const getOracleStatus = vi.fn();
const readSellerReadiness = vi.fn();
const isLiveHederaChain = vi.fn();

const FACTORY = "0x00000000000000000000000000000000000026e7";
const ROUTER = "0x0000000000000000000000000000000000001670";
const WHBAR = "0x0000000000000000000000000000000000003ad2";
const CREDIT = "0x0000000000000000000000000000000000a45b49";
const PAIR = "0x0000000000000000000000000000000000abcdef";
const SETTLEMENT = "0x914B98992d7eD602D1f5d9084ECe8160Fc0e741a";
const REGISTRY = "0x0000000000000000000000000000000000000002";
const BUYER = "0x620b69e63699edf397146d1306e38fc9f289f981";

const marketAbi = [
  { type: "function", name: "SAUCER_FACTORY", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "ROUTER", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "poolGuard",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "address" },
      { type: "bool" },
      { type: "bool" },
      { type: "bool" },
      { type: "uint8" },
      { type: "uint8" },
      { type: "uint16" },
      { type: "uint128" },
    ],
  },
] as const;

const registryAbi = [
  { type: "function", name: "creditToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "retire",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint64" }, { type: "string" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

vi.mock("./association", async () => {
  const actual = await vi.importActual<typeof import("./association")>("./association");
  return {
    ...actual,
    readSellerReadiness: (...args: unknown[]) => readSellerReadiness(...args),
  };
});

vi.mock("../network", async () => {
  const actual = await vi.importActual<typeof import("../network")>("../network");
  return {
    ...actual,
    isLiveHederaChain: (...args: unknown[]) => isLiveHederaChain(...args),
  };
});

vi.mock("./registry", () => ({
  requireMarket: () => ({
    address: "0x0000000000000000000000000000000000000001",
    abi: marketAbi,
    client: { readContract, chain: { id: 296 } },
  }),
  requireDeployment: () => ({
    address: REGISTRY,
    abi: registryAbi,
    client: { readContract, chain: { id: 296 } },
  }),
  getOracleStatus: (...args: unknown[]) => getOracleStatus(...args),
}));

beforeEach(() => {
  readContract.mockReset();
  getOracleStatus.mockReset();
  readSellerReadiness.mockReset();
  isLiveHederaChain.mockReset();
  isLiveHederaChain.mockReturnValue(true);
  getOracleStatus.mockResolvedValue({ price: 0.11, activeSource: "chainlink", pausedReason: null });
  readSellerReadiness.mockResolvedValue({ status: "ready", reason: "associated" });
  readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address?: string }) => {
    if (functionName === "SAUCER_FACTORY") return FACTORY;
    if (functionName === "ROUTER") return ROUTER;
    if (functionName === "poolGuard") return [SETTLEMENT, false, false, true, 8, 6, 300, 0n];
    if (functionName === "creditToken") return CREDIT;
    if (functionName === "token0") {
      if (address?.toLowerCase() === SETTLEMENT.toLowerCase()) return WHBAR;
      return CREDIT;
    }
    if (functionName === "token1") return WHBAR;
    if (functionName === "getPair") return PAIR;
    if (functionName === "getReserves") return [2_000n, 27_000_000n, 0]; // 2 t credits, 0.27 HBAR
    throw new Error(functionName);
  });
});

describe("readCreditPool", () => {
  it("reports that no pair exists yet", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "SAUCER_FACTORY") return FACTORY;
      if (functionName === "ROUTER") return ROUTER;
      if (functionName === "poolGuard") return [SETTLEMENT, false, false, true, 8, 6, 300, 0n];
      if (functionName === "creditToken") return CREDIT;
      if (functionName === "token0") return WHBAR;
      if (functionName === "token1") return WHBAR;
      if (functionName === "getPair") return zeroAddress;
      throw new Error(functionName);
    });
    const pool = await readCreditPool();
    expect(pool.exists).toBe(false);
    if (pool.exists) return;
    expect(pool.reason).toMatch(/no SaucerSwap pool/);
  });

  it("reads reserves when the pair exists", async () => {
    const pool = await readCreditPool();
    expect(pool.exists).toBe(true);
    if (!pool.exists) return;
    expect(pool.reserveKg).toBe("2000");
    expect(pool.pairId).toBe("0.0.11259375");
  });
});

describe("prepare_dex_retire", () => {
  it("refuses when the pool cannot fill the order", async () => {
    await expect(prepareDexRetire({ amountKg: 2000, buyer: BUYER, beneficiary: "Acme" })).rejects.toMatchObject({
      httpStatus: 409,
    });
  });

  it("prepends associate when the buyer has not associated the credit token", async () => {
    readSellerReadiness.mockResolvedValue({ status: "not-associated", tokenId: "0.0.10771273" });
    const prepared = await prepareDexRetire({ amountKg: 10, buyer: BUYER, beneficiary: "Acme" });
    expect(prepared.steps[0]?.label).toMatch(/Associate/);
    expect(prepared.steps.map(s => s.label).join(" → ")).toMatch(/Swap.*Approve.*Deposit.*Retire/);
    expect(prepared.steps.every(s => s.gas)).toBe(true);
    expect(BigInt(prepared.steps.find(s => s.label.startsWith("Swap"))!.value)).toBeGreaterThan(0n);
    expect(readSellerReadiness).toHaveBeenCalledWith(getAddress(BUYER), CREDIT);
  });

  it("skips associate when the buyer is already ready", async () => {
    const prepared = await prepareDexRetire({ amountKg: 10, buyer: BUYER });
    expect(prepared.steps[0]?.label).toMatch(/Swap/);
    expect(prepared.steps).toHaveLength(4);
  });

  it("throws ApiError when there is no pool", async () => {
    readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "SAUCER_FACTORY") return FACTORY;
      if (functionName === "ROUTER") return ROUTER;
      if (functionName === "poolGuard") return [SETTLEMENT, false, false, true, 8, 6, 300, 0n];
      if (functionName === "creditToken") return CREDIT;
      if (functionName === "token0") return WHBAR;
      if (functionName === "token1") return WHBAR;
      if (functionName === "getPair") return zeroAddress;
      throw new Error(functionName);
    });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toBeInstanceOf(ApiError);
  });
});
