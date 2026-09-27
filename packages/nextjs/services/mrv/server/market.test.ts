import { ApiError } from "./errors";
import { preparePurchase } from "./market";
import { encodeFunctionData } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readDexCheck = vi.fn();
const readContract = vi.fn();
const readSellerReadiness = vi.fn();

vi.mock("./association", () => ({
  readSellerReadiness: (...args: unknown[]) => readSellerReadiness(...args),
}));

vi.mock("./dex", () => ({
  readDexCheck: (...args: unknown[]) => readDexCheck(...args),
}));

const abi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "units", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "NATIVE_UNITS_PER_HBAR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyAndRetire",
    stateMutability: "payable",
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "units", type: "uint256" },
      { name: "beneficiary", type: "string" },
    ],
    outputs: [],
  },
] as const;

vi.mock("./registry", () => ({
  requireMarket: () => ({
    address: "0x0000000000000000000000000000000000000001",
    abi,
    client: { readContract, chain: { id: 296 } },
  }),
}));

const mainnetOk = {
  pair: "0.0.1462797" as const,
  pairAddress: "0xdb34c1ef944883f0e5a2fc18b6c1978b088bd31d" as const,
  chainlink: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5" as const,
  price: 0.0949,
  oraclePrice: 0.09504,
  deviationBps: 15,
  maxDeviationBps: 300,
  accepted: true,
};

const refused = {
  venue: "SaucerSwap V1" as const,
  pairId: "0.0.1462797" as const,
  network: "hederaMainnet" as const,
  price: 0.1,
  oraclePrice: 0.1031,
  deviationBps: 301,
  maxDeviationBps: 300,
  accepted: false,
  publicMainnet: mainnetOk,
};

beforeEach(() => {
  readDexCheck.mockReset();
  readContract.mockReset();
  readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "quote") return 1_000_000n;
    if (functionName === "NATIVE_UNITS_PER_HBAR") return 100_000_000n;
    if (functionName === "poolGuard")
      return ["0x914B98992d7eD602D1f5d9084ECe8160Fc0e741a", true, false, false, 8, 6, 300, 0n];
    if (functionName === "getListing") return { seller: SELLER, unitsAvailable: 400n, active: true };
    if (functionName === "token0") return QUSD;
    if (functionName === "token1") return "0x0000000000000000000000000000000000003aD2";
    throw new Error(functionName);
  });
  readSellerReadiness.mockReset();
  readSellerReadiness.mockResolvedValue({ status: "ready", reason: "associated" });
});

const SELLER = "0x620b69e63699edf397146d1306e38fc9f289f981";
const QUSD = "0x0000000000000000000000000000000000a3b8c0";

describe("prepare_purchase", () => {
  it("refuses when the seller cannot receive the pool's USD token, so the swap would revert", async () => {
    readDexCheck.mockResolvedValue({ ...refused, accepted: true, deviationBps: 15, publicMainnet: mainnetOk });
    readSellerReadiness.mockResolvedValue({ status: "not-associated", tokenId: "0.0.10729664" });
    await expect(preparePurchase({ listingId: 0, amountKg: 1000, beneficiary: "Acme" })).rejects.toThrow(
      /has not associated 0\.0\.10729664/,
    );
    expect(readSellerReadiness).toHaveBeenCalledWith(SELLER, QUSD);
  });

  it("refuses a SaucerSwap spot more than 3% from settlement and returns no transaction", async () => {
    readDexCheck.mockResolvedValue(refused);
    try {
      await preparePurchase({ listingId: 0, amountKg: 1000, beneficiary: "Acme" });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).httpStatus).toBe(409);
      expect((error as ApiError).message).toContain("301 bps");
      expect((error as ApiError).message).toContain("max 300");
      expect((error as ApiError).message).toContain("No purchase transaction was built");
      expect(error).not.toHaveProperty("data");
    }
  });

  it("refuses when the public mainnet pair is outside 3% of mainnet Chainlink", async () => {
    readDexCheck.mockResolvedValue({
      ...refused,
      accepted: true,
      deviationBps: 15,
      publicMainnet: { ...mainnetOk, deviationBps: 301, accepted: false },
    });
    try {
      await preparePurchase({ listingId: 0, amountKg: 1000, beneficiary: "Acme" });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).httpStatus).toBe(409);
      expect((error as ApiError).message).toContain("0.0.1462797");
      expect((error as ApiError).message).toContain("301 bps");
    }
  });

  it("returns an unsigned buyAndRetire when the spot is inside the band", async () => {
    readDexCheck.mockResolvedValue({ ...refused, deviationBps: 300, accepted: true, publicMainnet: mainnetOk });
    const prepared = await preparePurchase({ listingId: 4, amountKg: 1000, beneficiary: "Acme" });
    expect(prepared.functionName).toBe("buyAndRetire");
    expect(prepared.dex.accepted).toBe(true);
    expect(prepared.onChainPoolGuard).toEqual({
      pool: "0x914B98992d7eD602D1f5d9084ECe8160Fc0e741a",
      version: "V2",
      enabled: false,
      maxDeviationBps: 300,
    });
    expect(prepared.data).toBe(
      encodeFunctionData({
        abi,
        functionName: "buyAndRetire",
        args: [4n, 1000n, "Acme"],
      }),
    );
  });
});
