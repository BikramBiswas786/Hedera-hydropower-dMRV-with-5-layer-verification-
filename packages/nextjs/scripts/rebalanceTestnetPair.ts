/**
 * Keeps the testnet exhibit pair at the oracle price, so the live market can settle.
 *
 *   yarn pair:rebalance             read the market's pair and oracle and print the swap it would make
 *   yarn pair:rebalance --execute   make that swap with REBALANCER_PRIVATE_KEY (an ECDSA testnet account that holds
 *                                   HBAR and the pair's USD token)
 *
 * The public testnet WHBAR/USDC pair prices HBAR near $2 because testnet USDC is not a dollar, so the market swaps
 * through a small pair seeded at the Chainlink price. Trades drift it; `CreditMarket.settlementPrice` then refuses
 * every sale beyond 3%. This script reads the pair, router and oracle from the deployed market and makes the one
 * SaucerSwap swap that brings the pair back to the oracle. It is testnet housekeeping, not part of the product.
 */
import { type Address, type Hex, createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { getDeployment } from "~~/services/mrv/network";
import { amountOut, deviationBps, hbarUsd8FromReserves, rebalanceTrade } from "~~/services/mrv/saucerswap";

const RPC = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";
/** Act only beyond this; the market allows 300. */
const TRIGGER_BPS = 100n;
/** On Hedera's JSON-RPC relay, transaction value is in weibar: 1 tinybar = 1e10. */
const WEIBAR_PER_TINYBAR = 10_000_000_000n;
const SLIPPAGE_BPS = 100n;

const MARKET_ABI = parseAbi([
  "function ROUTER() view returns (address)",
  "function HBAR_USD_FEED() view returns (address)",
  "function poolGuard() view returns (address pool, bool isV2, bool whbarIsToken0, bool enabled, uint8 whbarDecimals, uint8 usdDecimals, uint16 maxDeviationBps, uint128 minLiquidity)",
]);
const FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);
const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
const ROUTER_ABI = parseAbi([
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[])",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
]);

const client = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });

async function readState(market: Address) {
  const [router, feed, guard] = await Promise.all([
    client.readContract({ address: market, abi: MARKET_ABI, functionName: "ROUTER" }),
    client.readContract({ address: market, abi: MARKET_ABI, functionName: "HBAR_USD_FEED" }),
    client.readContract({ address: market, abi: MARKET_ABI, functionName: "poolGuard" }),
  ]);
  const [pool, , whbarIsToken0] = guard;
  const [[, answer], decimals, token0, token1, [r0, r1]] = await Promise.all([
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "latestRoundData" }),
    client.readContract({ address: feed, abi: FEED_ABI, functionName: "decimals" }),
    client.readContract({ address: pool, abi: PAIR_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: PAIR_ABI, functionName: "token1" }),
    client.readContract({ address: pool, abi: PAIR_ABI, functionName: "getReserves" }),
  ]);
  const oracle8 = decimals >= 8 ? answer / 10n ** BigInt(decimals - 8) : answer * 10n ** BigInt(8 - decimals);
  return {
    router,
    pool,
    whbar: whbarIsToken0 ? token0 : token1,
    usd: whbarIsToken0 ? token1 : token0,
    reserveWhbar: BigInt(whbarIsToken0 ? r0 : r1),
    reserveUsd: BigInt(whbarIsToken0 ? r1 : r0),
    oracle8,
  };
}

const usd8 = (price8: bigint) => `$${(Number(price8) / 1e8).toFixed(5)}`;

async function main() {
  const execute = process.argv.includes("--execute");
  const market = getDeployment("CreditMarket", 296)?.address;
  if (!market) throw new Error("CreditMarket is not in deployedContracts.ts for Hedera testnet (296)");
  const s = await readState(market);
  const pool8 = hbarUsd8FromReserves(s.reserveUsd, s.reserveWhbar);
  console.log(`Market ${market} pair ${s.pool}`);
  console.log(`Pair ${usd8(pool8)}/HBAR, oracle ${usd8(s.oracle8)}, ${deviationBps(s.oracle8, pool8)} bps`);

  const trade = rebalanceTrade(s.reserveUsd, s.reserveWhbar, s.oracle8, TRIGGER_BPS);
  if (trade.side === "none") {
    console.log(`Within ${TRIGGER_BPS} bps; nothing to do.`);
    return;
  }
  const hbarIn = trade.side === "hbarIn";
  const expected = hbarIn
    ? amountOut(trade.amountIn, s.reserveWhbar, s.reserveUsd)
    : amountOut(trade.amountIn, s.reserveUsd, s.reserveWhbar);
  const minOut = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  console.log(
    hbarIn
      ? `Plan: sell ${Number(trade.amountIn) / 1e8} HBAR for ≥ ${Number(minOut) / 1e6} USD token`
      : `Plan: sell ${Number(trade.amountIn) / 1e6} USD token for ≥ ${Number(minOut) / 1e8} HBAR`,
  );
  if (!execute) return;

  const key = process.env.REBALANCER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("Set REBALANCER_PRIVATE_KEY to trade");
  const account = privateKeyToAccount(`0x${key.replace(/^0x/, "")}` as Hex);
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(RPC) });
  // Hashio rejects EIP-1559 fees under its minimum gas price; send legacy transactions at eth_gasPrice.
  const gasPrice = await client.getGasPrice();
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 600);
  const send = async (hash: Hex, label: string) => {
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`${label}: https://hashscan.io/testnet/transaction/${hash}`);
  };

  if (hbarIn) {
    const balance = (await client.getBalance({ address: account.address })) / WEIBAR_PER_TINYBAR;
    if (balance < trade.amountIn + 5n * 10n ** 8n) throw new Error(`${account.address} holds too little HBAR`);
    await send(
      await wallet.writeContract({
        address: s.router,
        abi: ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [minOut, [s.whbar, s.usd], account.address, deadline],
        value: trade.amountIn * WEIBAR_PER_TINYBAR,
        gas: 1_500_000n,
        gasPrice,
      }),
      "Swap HBAR → USD token",
    );
  } else {
    const balance = await client.readContract({
      address: s.usd,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance < trade.amountIn)
      throw new Error(`${account.address} holds ${balance} of the USD token, needs ${trade.amountIn}`);
    const allowance = await client.readContract({
      address: s.usd,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, s.router],
    });
    if (allowance < trade.amountIn) {
      await send(
        await wallet.writeContract({
          address: s.usd,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [s.router, trade.amountIn],
          gas: 1_000_000n,
          gasPrice,
        }),
        "Approve router",
      );
    }
    await send(
      await wallet.writeContract({
        address: s.router,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForETH",
        args: [trade.amountIn, minOut, [s.usd, s.whbar], account.address, deadline],
        gas: 1_500_000n,
        gasPrice,
      }),
      "Swap USD token → HBAR",
    );
  }

  const after = await readState(market);
  const afterBps = deviationBps(after.oracle8, hbarUsd8FromReserves(after.reserveUsd, after.reserveWhbar));
  console.log(`After: ${afterBps} bps from the oracle`);
  if (afterBps > 300n) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
