import { getDeployment } from "../network";
import { deviationBps, dexAccepted, hbarUsd8FromReserves } from "../saucerswap";
import { ApiError } from "./errors";
import { requireMarket } from "./registry";
import { zeroAddress } from "viem";

const WHBAR = "0x0000000000000000000000000000000000003ad2";

const pairAbi = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
] as const;

export type DexCheck = {
  venue: "SaucerSwap V1";
  /** The pair `CreditMarket` swaps through. */
  pair: `0x${string}`;
  network: "deployment";
  price: number;
  oraclePrice: number;
  deviationBps: number;
  maxDeviationBps: number;
  accepted: boolean;
};

/**
 * Spot of the pool stored on `CreditMarket`, compared with the settlement oracle.
 * `quote` already reverts when this pool is outside the band. The page reads the same pool.
 */
export async function readDexCheck(): Promise<DexCheck> {
  const market = requireMarket();
  const [pool, isV2, whbarIsToken0, enabled, , , maxDeviationBps] = await market.client.readContract({
    address: market.address,
    abi: market.abi,
    functionName: "poolGuard",
  });
  if (!enabled || pool === zeroAddress) {
    throw new ApiError("CreditMarket has no SaucerSwap pool. No purchase transaction was built.", 409);
  }
  if (isV2) throw new ApiError("The settlement pool is V2. This builder prices a V1 pair.", 409);

  let reserve0: bigint;
  let reserve1: bigint;
  let token0: string;
  try {
    [token0, [reserve0, reserve1]] = await Promise.all([
      market.client.readContract({ address: pool, abi: pairAbi, functionName: "token0" }),
      market.client.readContract({ address: pool, abi: pairAbi, functionName: "getReserves" }),
    ]);
  } catch {
    throw new ApiError("The settlement pair did not answer. No purchase transaction was built.", 503);
  }

  if ((token0.toLowerCase() === WHBAR) !== whbarIsToken0) {
    throw new ApiError("The settlement pair token order does not match the market.", 409);
  }
  const reserveWhbar = whbarIsToken0 ? reserve0 : reserve1;
  const reserveUsd = whbarIsToken0 ? reserve1 : reserve0;
  const dex8 = hbarUsd8FromReserves(reserveUsd, reserveWhbar);
  if (dex8 === 0n) throw new ApiError("The settlement pair reserves are empty.", 503);

  const feed = getDeployment("ResilientHbarUsdFeed");
  if (!feed) throw new ApiError("Settlement feed is not deployed.", 503);
  let oracle8: bigint;
  try {
    const [answer] = await market.client.readContract({
      address: feed.address,
      abi: feed.abi,
      functionName: "resolve",
    });
    oracle8 = answer.answer;
  } catch {
    throw new ApiError("Settlement price is paused. No purchase transaction was built.", 409);
  }

  const maxBps = BigInt(maxDeviationBps);
  const bps = deviationBps(oracle8, dex8);
  return {
    venue: "SaucerSwap V1",
    pair: pool as `0x${string}`,
    network: "deployment",
    price: Number(dex8) / 1e8,
    oraclePrice: Number(oracle8) / 1e8,
    deviationBps: Number(bps),
    maxDeviationBps: Number(maxBps),
    accepted: dexAccepted(oracle8, dex8, maxBps),
  };
}
