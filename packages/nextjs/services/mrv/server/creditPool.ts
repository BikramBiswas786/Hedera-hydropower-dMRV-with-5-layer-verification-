import { hashscan, isLiveHederaChain } from "../network";
import { formatHbar } from "../pricing";
import { amountIn, tinybarPerTonne } from "../saucerswap";
import { formatTonnes } from "../views";
import { type SellerReadiness, longZeroToEntityId, readSellerReadiness } from "./association";
import { ApiError } from "./errors";
import { getOracleStatus, requireDeployment, requireMarket } from "./registry";
import { type Address, type Hex, encodeFunctionData, getAddress, parseAbi, zeroAddress } from "viem";
import { z } from "zod";

/**
 * Credits on SaucerSwap. Verified credits leave registry custody (`withdraw`), trade in a SaucerSwap V1 WHBAR/credit
 * pool, and come back (`deposit`) to be retired against a certificate NFT. The registry is the only place a credit
 * can be issued or retired; SaucerSwap is where it changes hands between the two. The pool is found through the
 * factory the market already pins (`CreditMarket.SAUCER_FACTORY`), paired with the WHBAR token of the market's own
 * settlement pool, so nothing here is a separately configured address.
 */
const FACTORY_ABI = parseAbi(["function getPair(address, address) view returns (address)"]);
const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
]);
const ROUTER_ABI = parseAbi([
  "function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) payable returns (uint256[])",
]);
const TOKEN_ABI = parseAbi([
  "function associate() returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
/** Seconds the router accepts a prepared swap; resubmit after that. */
const SWAP_DEADLINE_SECONDS = 600n;
const WEIBAR_PER_TINYBAR = 10n ** 10n;

export type CreditPool =
  | { exists: false; factory: Address; creditToken: Address; whbar: Address; reason: string }
  | {
      exists: true;
      factory: Address;
      router: Address;
      pair: Address;
      pairId: string | null;
      pairUrl: string | null;
      creditToken: Address;
      whbar: Address;
      /** Credits in the pool, in kg (token base units). */
      reserveKg: string;
      reserveHbar: string;
      /** The pool's spot price. */
      hbarPerTonne: string;
      /** The same at the settlement oracle's HBAR price; null while the oracle is paused. */
      usdPerTonne: number | null;
    };

async function poolAddresses() {
  const market = requireMarket();
  const registry = requireDeployment();
  const [factory, router, guard, creditToken] = await Promise.all([
    market.client.readContract({ address: market.address, abi: market.abi, functionName: "SAUCER_FACTORY" }),
    market.client.readContract({ address: market.address, abi: market.abi, functionName: "ROUTER" }),
    market.client.readContract({ address: market.address, abi: market.abi, functionName: "poolGuard" }),
    registry.client.readContract({ address: registry.address, abi: registry.abi, functionName: "creditToken" }),
  ]);
  const [settlementPool, , whbarIsToken0] = guard;
  if (settlementPool === zeroAddress) throw new ApiError("The market has no SaucerSwap pool configured", 409);
  // The router's WHBAR() is the wrapper contract; pairs hold the WHBAR token, which the settlement pool already names.
  const whbar = await market.client.readContract({
    address: settlementPool,
    abi: PAIR_ABI,
    functionName: whbarIsToken0 ? "token0" : "token1",
  });
  return { client: market.client, factory, router, whbar, creditToken, registry: registry.address };
}

/** The SaucerSwap V1 pool that trades this registry's credits against HBAR, if one has been created. */
export async function readCreditPool(): Promise<CreditPool> {
  const { client, factory, router, whbar, creditToken } = await poolAddresses();
  if (creditToken === zeroAddress) {
    return { exists: false, factory, creditToken, whbar, reason: "the registry has not created its credit token" };
  }
  const pair = await client.readContract({
    address: factory,
    abi: FACTORY_ABI,
    functionName: "getPair",
    args: [creditToken, whbar],
  });
  if (pair === zeroAddress) {
    return { exists: false, factory, creditToken, whbar, reason: "no SaucerSwap pool for the credit token yet" };
  }
  const [token0, [r0, r1], oracle] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: "token0" }),
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: "getReserves" }),
    getOracleStatus(),
  ]);
  const creditIs0 = getAddress(token0) === getAddress(creditToken);
  const reserveCredit = BigInt(creditIs0 ? r0 : r1);
  const reserveWhbar = BigInt(creditIs0 ? r1 : r0);
  const perTonne = tinybarPerTonne(reserveWhbar, reserveCredit);
  const pairId = longZeroToEntityId(pair);
  return {
    exists: true,
    factory,
    router,
    pair,
    pairId,
    pairUrl: isLiveHederaChain() ? hashscan.contract(pair) : null,
    creditToken,
    whbar,
    reserveKg: reserveCredit.toString(),
    reserveHbar: formatHbar(reserveWhbar, 10n ** 8n),
    hbarPerTonne: formatHbar(perTonne, 10n ** 8n),
    usdPerTonne: oracle?.price ? Math.round((Number(perTonne) / 1e8) * oracle.price * 100) / 100 : null,
  };
}

export const prepareDexRetireSchema = z.object({
  /** Credits to buy on SaucerSwap and retire, in kg CO2e (token base units; 1 000 = 1 t). */
  amountKg: z.number().int().positive(),
  beneficiary: z.string().max(128).default(""),
  /** The buyer's EVM address: it receives the credits from the swap and signs every step. */
  buyer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Extra HBAR sent with the swap in case the pool moves before it executes; the router refunds what it does not use. */
  slippageBps: z.number().int().min(0).max(1_000).default(100),
});

/** `gas` is a limit to send with the step: the relay's estimate falls short for calls that reach HTS. */
export type PreparedStep = { label: string; to: Address; data: Hex; value: string; gas: string };

export type PreparedDexRetire = {
  chainId: number;
  summary: string;
  /** Exact tinybar the pool needs for `amountKg`, before slippage. */
  swapCostHbar: string;
  /** Sign and send in order, each after the previous one succeeds. */
  steps: PreparedStep[];
  buyer: SellerReadiness;
  pool: Extract<CreditPool, { exists: true }>;
};

/**
 * Builds the unsigned transactions that buy `amountKg` of credits on SaucerSwap and retire them in the registry. The
 * server never holds the buyer's key. The retirement mints a certificate NFT, as a `CreditMarket` purchase does; the
 * difference is where the credits were bought.
 */
export async function prepareDexRetire(input: z.input<typeof prepareDexRetireSchema>): Promise<PreparedDexRetire> {
  const { amountKg, beneficiary, buyer: buyerInput, slippageBps } = prepareDexRetireSchema.parse(input);
  const pool = await readCreditPool();
  if (!pool.exists) throw new ApiError(`No SaucerSwap pool trades these credits: ${pool.reason}`, 409);
  const buyer = getAddress(buyerInput);
  const units = BigInt(amountKg);
  const reserveCredit = BigInt(pool.reserveKg);
  if (units >= reserveCredit) {
    throw new ApiError(`The pool holds ${formatTonnes(reserveCredit)} t; it cannot sell ${formatTonnes(units)} t`, 409);
  }
  const { client } = await poolAddresses();
  const [token0, [r0, r1]] = await Promise.all([
    client.readContract({ address: pool.pair, abi: PAIR_ABI, functionName: "token0" }),
    client.readContract({ address: pool.pair, abi: PAIR_ABI, functionName: "getReserves" }),
  ]);
  const creditIs0 = getAddress(token0) === getAddress(pool.creditToken);
  // WHBAR has 8 decimals, so the pool quotes tinybar; the router's msg.value is tinybar, JSON-RPC `value` weibar.
  const exactTinybar = amountIn(units, BigInt(creditIs0 ? r1 : r0), BigInt(creditIs0 ? r0 : r1));
  const withSlippage = (exactTinybar * (10_000n + BigInt(slippageBps))) / 10_000n;

  const readiness = isLiveHederaChain()
    ? await readSellerReadiness(buyer, pool.creditToken)
    : ({ status: "unknown", reason: "local chain" } as const);
  const registry = requireDeployment();
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + SWAP_DEADLINE_SECONDS;
  const steps: PreparedStep[] = [];
  if (readiness.status === "not-associated") {
    steps.push({
      label: "Associate with the credit token (HIP-719)",
      to: pool.creditToken,
      data: encodeFunctionData({ abi: TOKEN_ABI, functionName: "associate" }),
      value: "0",
      gas: "1000000",
    });
  }
  steps.push(
    {
      label: `Swap HBAR for exactly ${formatTonnes(units)} t on SaucerSwap`,
      to: pool.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "swapETHForExactTokens",
        args: [units, [pool.whbar, pool.creditToken], buyer, deadline],
      }),
      value: (withSlippage * WEIBAR_PER_TINYBAR).toString(),
      gas: "2000000",
    },
    {
      label: "Approve the registry for the credits",
      to: pool.creditToken,
      data: encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve", args: [registry.address, units] }),
      value: "0",
      gas: "1000000",
    },
    {
      label: "Deposit them into registry custody",
      to: registry.address,
      data: encodeFunctionData({ abi: registry.abi, functionName: "deposit", args: [units] }),
      value: "0",
      gas: "1000000",
    },
    {
      label: "Retire them, which mints the certificate NFT",
      to: registry.address,
      data: encodeFunctionData({ abi: registry.abi, functionName: "retire", args: [units, beneficiary] }),
      value: "0",
      gas: "3000000",
    },
  );
  const swapCostHbar = formatHbar(exactTinybar, 10n ** 8n);
  return {
    chainId: client.chain.id,
    summary: `Buy ${formatTonnes(units)} t CO2e on SaucerSwap for ${swapCostHbar} HBAR (plus up to ${slippageBps} bps, refunded if unused) and retire it`,
    swapCostHbar,
    steps,
    buyer: readiness,
    pool,
  };
}
