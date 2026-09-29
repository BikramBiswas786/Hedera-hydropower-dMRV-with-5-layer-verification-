import type { GuardianTrace } from "../guardian/trace";
import { prepareCheckoutPurchase } from "./checkout";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The purchase builder itself, with the chain and the trace stubbed: it must ask the trace about the listed token and
 * build nothing unless a Guardian claim is backed. Removing the trace call from `prepareCheckoutPurchase` fails this.
 */

const CHECKOUT = "0x455eFbF07B2b5d5137AEc3601c43549593741898";
const TOKEN = "0x0000000000000000000000000000000000A430a7"; // 0.0.10760359, the Guardian demo credit
const SELLER = "0xd7d4789b59ff215403519ba08da384f89c95da41"; // 0.0.10721162

const { readContract, traceGuardianMint } = vi.hoisted(() => ({
  readContract: vi.fn(),
  traceGuardianMint: vi.fn(),
}));

vi.mock("./registry", () => ({ publicClient: () => ({ chain: { id: 296 }, readContract }) }));
vi.mock("./guardianBridge", () => ({
  readGuardianSources: () => ({
    mirrorNodeUrl: "https://mirror.test",
    ipfsGateway: "https://ipfs.test/ipfs/{cid}",
    fetch: async () => Response.json({ account: "0.0.10721162" }),
  }),
}));
vi.mock("../guardian/trace", () => ({ traceGuardianMint }));

const trace = (verdict: GuardianTrace["verdict"], ok: boolean) =>
  ({
    verdict,
    checks: [{ id: "mint-vc", ok, detail: ok ? "names 0.0.10760359, 12.500" : "names another token" }],
  }) as unknown as GuardianTrace;

beforeEach(() => {
  process.env.CHECKOUT_ADDRESS = CHECKOUT;
  readContract.mockReset();
  traceGuardianMint.mockReset();
  readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "getListing":
        return {
          seller: SELLER,
          token: TOKEN,
          available: 12_500n,
          priceUsdCentsPerToken: 500n,
          tokenDecimals: 3,
          active: true,
        };
      case "name":
        return "Hydro dMRV Guardian demo credit";
      case "symbol":
        return "HGDC";
      case "quote":
        return 100_000_000n;
      case "NATIVE_UNITS_PER_HBAR":
        return 100_000_000n;
    }
    throw new Error(`unexpected call ${functionName}`);
  });
});

const quoted = () => readContract.mock.calls.some(([call]) => call.functionName === "quote");

describe("prepareCheckoutPurchase fails closed on the Guardian trace", () => {
  it("traces the seller's transfer of the listed token before it builds anything", async () => {
    traceGuardianMint.mockResolvedValue(trace("backed", true));
    const prepared = await prepareCheckoutPurchase({ listingId: 0, amount: 1_000 });
    expect(traceGuardianMint).toHaveBeenCalledWith(expect.anything(), "ft:0.0.10760359:0.0.10721162");
    expect(prepared.summary).toContain("Guardian record ft:0.0.10760359:0.0.10721162 is backed");
    expect(prepared.to).toBe(CHECKOUT);
  });

  for (const verdict of ["not-backed", "incomplete"] as const) {
    it(`builds no transaction when the trace is ${verdict}`, async () => {
      traceGuardianMint.mockResolvedValue(trace(verdict, false));
      await expect(prepareCheckoutPurchase({ listingId: 0, amount: 1_000 })).rejects.toMatchObject({
        httpStatus: 409,
        message: expect.stringContaining(`Guardian record that is ${verdict}`),
      });
      expect(traceGuardianMint).toHaveBeenCalledOnce();
      expect(quoted()).toBe(false);
    });
  }
});
