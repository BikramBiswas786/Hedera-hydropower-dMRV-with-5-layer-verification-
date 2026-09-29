import {
  SAUCERSWAP_MAX_DEVIATION_BPS,
  SAUCERSWAP_PAIR,
  SAUCERSWAP_PAIR_ID,
  deviationBps,
  dexAccepted,
  hbarUsd8FromReserves,
} from "../saucerswap";

const MIRROR = "https://mainnet.mirrornode.hedera.com/api/v1/contracts/call";
/** Chainlink HBAR/USD on Hedera mainnet. */
const CHAINLINK = "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5";
const GET_RESERVES = "0x0902f1ac";
const LATEST_ROUND = "0xfeaf968c";

export type PublicMainnetPool = {
  pair: typeof SAUCERSWAP_PAIR_ID;
  pairAddress: typeof SAUCERSWAP_PAIR;
  chainlink: typeof CHAINLINK;
  price: number;
  oraclePrice: number;
  deviationBps: number;
  maxDeviationBps: number;
  accepted: boolean;
};

/** ABI word `index` from a mirror-node `eth_call` result. */
export function abiWord(hex: string, index: number): bigint {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  const word = raw.slice(index * 64, (index + 1) * 64);
  if (word.length !== 64) throw new Error("short abi word");
  return BigInt(`0x${word}`);
}

/**
 * USDC is token0 on pair 0.0.1462797. `latestRoundData` word 1 is the Chainlink answer.
 * Both are the inputs `hbarUsd8FromReserves` and `deviationBps` already use.
 */
export function publicMainnetPoolFromCalls(reservesHex: string, roundHex: string): PublicMainnetPool {
  const dex8 = hbarUsd8FromReserves(abiWord(reservesHex, 0), abiWord(reservesHex, 1));
  const oracle8 = abiWord(roundHex, 1);
  const bps = deviationBps(oracle8, dex8);
  return {
    pair: SAUCERSWAP_PAIR_ID,
    pairAddress: SAUCERSWAP_PAIR,
    chainlink: CHAINLINK,
    price: Number(dex8) / 1e8,
    oraclePrice: Number(oracle8) / 1e8,
    deviationBps: Number(bps),
    maxDeviationBps: Number(SAUCERSWAP_MAX_DEVIATION_BPS),
    accepted: dex8 > 0n && oracle8 > 0n && dexAccepted(oracle8, dex8),
  };
}

async function mirrorCall(to: string, data: string): Promise<string> {
  const response = await fetch(MIRROR, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, data, estimate: false }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`mirror ${response.status}`);
  const body = (await response.json()) as { result?: string };
  if (!body.result || body.result === "0x") throw new Error("empty result");
  return body.result;
}

/** Live read of the public mainnet WHBAR/USDC pair against mainnet Chainlink. */
export async function readPublicMainnetPool(): Promise<PublicMainnetPool> {
  const [reserves, round] = await Promise.all([
    mirrorCall(SAUCERSWAP_PAIR, GET_RESERVES),
    mirrorCall(CHAINLINK, LATEST_ROUND),
  ]);
  return publicMainnetPoolFromCalls(reserves, round);
}
