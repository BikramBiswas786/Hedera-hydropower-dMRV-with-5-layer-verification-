import { creditPoolUsd8, prepareDexRetire, readCreditPool } from "./creditPool";
import { ApiError } from "./errors";
import { getAddress, zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readContract = vi.fn();
const getOracleStatus = vi.fn();
const readSellerReadiness = vi.fn();
const isLiveHederaChain = vi.fn();
const readDexCheck = vi.fn();

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

vi.mock("./dex", () => ({
  readDexCheck: (...args: unknown[]) => readDexCheck(...args),
}));

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
  readDexCheck.mockResolvedValue({
    deviationBps: 0,
    maxDeviationBps: 300,
    accepted: true,
    publicMainnet: { deviationBps: 15, maxDeviationBps: 300, accepted: true },
  });
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
    // 2 t of credits against ~0.1818 HBAR: $0.01/t at the $0.11 oracle, inside 3% of a 1-cent listing.
    if (functionName === "getReserves") return [2_000n, 18_181_818n, 0];
    if (functionName === "listingCount") return 1n;
    if (functionName === "getListing") return ["0x0000000000000000000000000000000000000003", 1_000n, 1n, true];
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

  it("refuses a stale oracle", async () => {
    getOracleStatus.mockResolvedValue({ price: null, activeSource: null, pausedReason: "no fresh oracle price" });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/no fresh oracle price/);
  });

  it("refuses when Chainlink and Supra disagree", async () => {
    getOracleStatus.mockResolvedValue({ price: null, activeSource: null, pausedReason: "oracle sources disagree" });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/oracle sources disagree/);
  });

  it("refuses when the settlement pool is outside its band", async () => {
    readDexCheck.mockResolvedValue({
      deviationBps: 301,
      maxDeviationBps: 300,
      accepted: false,
      publicMainnet: { deviationBps: 15, maxDeviationBps: 300, accepted: true },
    });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/max 300/);
  });

  it("refuses a settlement pool that is not an enabled V1 WHBAR pair", async () => {
    readDexCheck.mockRejectedValue(new ApiError("The settlement pool is V2. This builder prices a V1 pair.", 409));
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/V2/);
  });

  it("refuses a credit pool more than 3% from the cheapest open listing", async () => {
    readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address?: string }) => {
      if (functionName === "SAUCER_FACTORY") return FACTORY;
      if (functionName === "ROUTER") return ROUTER;
      if (functionName === "poolGuard") return [SETTLEMENT, false, false, true, 8, 6, 300, 0n];
      if (functionName === "creditToken") return CREDIT;
      if (functionName === "token0") return address?.toLowerCase() === SETTLEMENT.toLowerCase() ? WHBAR : CREDIT;
      if (functionName === "token1") return WHBAR;
      if (functionName === "getPair") return PAIR;
      if (functionName === "getReserves") return [2_000n, 181_818_180n, 0];
      if (functionName === "listingCount") return 1n;
      if (functionName === "getListing") return ["0x0000000000000000000000000000000000000003", 1_000n, 1n, true];
      throw new Error(functionName);
    });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/cheapest open listing/);
  });

  it("refuses when there is no open listing to price the pool against", async () => {
    readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address?: string }) => {
      if (functionName === "SAUCER_FACTORY") return FACTORY;
      if (functionName === "ROUTER") return ROUTER;
      if (functionName === "poolGuard") return [SETTLEMENT, false, false, true, 8, 6, 300, 0n];
      if (functionName === "creditToken") return CREDIT;
      if (functionName === "token0") return address?.toLowerCase() === SETTLEMENT.toLowerCase() ? WHBAR : CREDIT;
      if (functionName === "token1") return WHBAR;
      if (functionName === "getPair") return PAIR;
      if (functionName === "getReserves") return [2_000n, 18_181_818n, 0];
      if (functionName === "listingCount") return 0n;
      throw new Error(functionName);
    });
    await expect(prepareDexRetire({ amountKg: 10, buyer: BUYER })).rejects.toThrow(/No open credit listing/);
  });
});

describe("creditPoolUsd8", () => {
  it("prices the fixture pool at just under 1 US cent per tonne", () => {
    expect(creditPoolUsd8(18_181_818n, 2_000n, 11_000_000n)).toBe(999_999n);
  });
});
