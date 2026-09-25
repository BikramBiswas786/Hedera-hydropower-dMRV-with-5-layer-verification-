import { getDeployment } from "../network";
import {
  SAUCERSWAP_MAX_DEVIATION_BPS,
  SAUCERSWAP_PAIR,
  SAUCERSWAP_PAIR_ID,
  SAUCERSWAP_USDC,
  deviationBps,
  hbarUsd8FromReserves,
} from "../saucerswap";
import { ApiError } from "./errors";
import { requireDeployment } from "./registry";
import { createPublicClient, http } from "viem";

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

const mainnet = createPublicClient({
  transport: http("https://mainnet.hashio.io/api", { timeout: 8_000 }),
});

export type DexCheck = {
  venue: "SaucerSwap V1";
  pairId: typeof SAUCERSWAP_PAIR_ID;
  network: "hederaMainnet";
  price: number;
  oraclePrice: number;
  deviationBps: number;
  maxDeviationBps: number;
  accepted: boolean;
};

/** Spot from the WHBAR/USDC reserves, compared with the testnet settlement price. */
export async function readDexCheck(): Promise<DexCheck> {
  let reserve0: bigint;
  let reserve1: bigint;
  let token0: string;
  try {
    [token0, [reserve0, reserve1]] = await Promise.all([
      mainnet.readContract({ address: SAUCERSWAP_PAIR, abi: pairAbi, functionName: "token0" }),
      mainnet.readContract({ address: SAUCERSWAP_PAIR, abi: pairAbi, functionName: "getReserves" }),
    ]);
  } catch {
    throw new ApiError("SaucerSwap WHBAR/USDC did not answer. No purchase transaction was built.", 503);
  }

  const usdcIs0 = token0.toLowerCase() === SAUCERSWAP_USDC;
  const reserveUsdc = usdcIs0 ? reserve0 : reserve1;
  const reserveWhbar = usdcIs0 ? reserve1 : reserve0;
  const dex8 = hbarUsd8FromReserves(reserveUsdc, reserveWhbar);
  if (dex8 === 0n) throw new ApiError("SaucerSwap WHBAR/USDC reserves are empty.", 503);

  const feed = getDeployment("ResilientHbarUsdFeed");
  if (!feed) throw new ApiError("Settlement feed is not deployed.", 503);
  const { client } = requireDeployment();
  let oracle8: bigint;
  try {
    const [answer] = await client.readContract({
      address: feed.address,
      abi: feed.abi,
      functionName: "resolve",
    });
    oracle8 = answer.answer;
  } catch {
    throw new ApiError("Settlement price is paused. No purchase transaction was built.", 409);
  }

  const bps = deviationBps(oracle8, dex8);
  return {
    venue: "SaucerSwap V1",
    pairId: SAUCERSWAP_PAIR_ID,
    network: "hederaMainnet",
    price: Number(dex8) / 1e8,
    oraclePrice: Number(oracle8) / 1e8,
    deviationBps: Number(bps),
    maxDeviationBps: Number(SAUCERSWAP_MAX_DEVIATION_BPS),
    accepted: bps <= SAUCERSWAP_MAX_DEVIATION_BPS,
  };
}
