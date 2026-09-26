import { ApiError } from "./errors";
import { preparePurchase } from "./market";
import { encodeFunctionData } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readDexCheck = vi.fn();
const readContract = vi.fn();

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

const refused = {
  venue: "SaucerSwap V1" as const,
  pairId: "0.0.1462797" as const,
  network: "hederaMainnet" as const,
  price: 0.1,
  oraclePrice: 0.1031,
  deviationBps: 301,
  maxDeviationBps: 300,
  accepted: false,
};

beforeEach(() => {
  readDexCheck.mockReset();
  readContract.mockReset();
  readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "quote") return 1_000_000n;
    if (functionName === "NATIVE_UNITS_PER_HBAR") return 100_000_000n;
    if (functionName === "poolGuard")
      return ["0x914b98992D7ed602D1F5D9084ECE8160Fc0E741A", true, false, false, 8, 6, 300, 0n];
    throw new Error(functionName);
  });
});

describe("prepare_purchase", () => {
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

  it("returns an unsigned buyAndRetire when the spot is inside the band", async () => {
    readDexCheck.mockResolvedValue({ ...refused, deviationBps: 300, accepted: true });
    const prepared = await preparePurchase({ listingId: 4, amountKg: 1000, beneficiary: "Acme" });
    expect(prepared.functionName).toBe("buyAndRetire");
    expect(prepared.dex.accepted).toBe(true);
    expect(prepared.onChainPoolGuard).toEqual({
      pool: "0x914b98992D7ed602D1F5D9084ECE8160Fc0E741A",
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
