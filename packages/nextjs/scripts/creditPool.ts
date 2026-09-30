/**
 * Credits on SaucerSwap, from the command line.
 *
 *   yarn market:credit-pool                        show the pool, or that there is none
 *   yarn market:credit-pool seed 200 [--usd 15] [--execute]
 *        the operator (KEEPER_PRIVATE_KEY, which holds registry custody) withdraws 200 kg, creates the SaucerSwap V1
 *        WHBAR/credit pair if it does not exist, and seeds it at $15 per tonne at the oracle's HBAR price.
 *   yarn market:credit-pool buy 10 [beneficiary]
 *        a buyer (BUYER_PRIVATE_KEY) runs prepare_dex_retire and signs each step.
 *        Refused when the oracle is paused, the settlement pair is disabled or not V1, a 3% check fails,
 *        or the credit pool is more than 3% from the cheapest open listing.
 *
 * Seeding uses two calls, not the router's one-call new-pool path: the pair creation fee is priced in tinycents
 * at consensus, and whatever the one-call path overpays would land in the pool and skew its opening price.
 */
import { type Address, type Hex, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hydroChain, publicClient, requireDeployment, requireMarket } from "~~/services/mrv/server/registry";

const RPC = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";
const MIRROR = process.env.MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com";
const WEIBAR_PER_TINYBAR = 10n ** 10n;
/** Gas limits measured on testnet; the relay's estimates fall short for calls that reach HTS. */
const GAS = { createPair: 8_000_000n, addLiquidity: 2_000_000n, approve: 1_000_000n, withdraw: 1_000_000n };
const FEE_BUFFER_BPS = 1_000n;

const FACTORY_ABI = parseAbi([
  "function pairCreateFee() view returns (uint256)",
  "function createPair(address, address) payable returns (address)",
]);
const ROUTER_ABI = parseAbi([
  "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256, uint256, uint256)",
]);
const TOKEN_ABI = parseAbi(["function approve(address, uint256) returns (bool)"]);

type Rate = { cent_equivalent: number; hbar_equivalent: number };

async function pairCreateFeeTinybar(factory: Address): Promise<bigint> {
  const client = publicClient();
  const tinycents = await client.readContract({ address: factory, abi: FACTORY_ABI, functionName: "pairCreateFee" });
  const rates = (await (await fetch(`${MIRROR}/api/v1/network/exchangerate`)).json()) as {
    current_rate: Rate;
    next_rate?: Rate;
  };
  const toTinybar = (rate: Rate) => (tinycents * BigInt(rate.hbar_equivalent)) / BigInt(rate.cent_equivalent);
  const fees = [rates.current_rate, rates.next_rate].filter((r): r is Rate => Boolean(r)).map(toTinybar);
  const fee = fees.reduce((a, b) => (a > b ? a : b));
  return fee + (fee * FEE_BUFFER_BPS) / 10_000n;
}

function walletFor(envName: string) {
  const key = process.env[envName]?.trim();
  if (!key) throw new Error(`Set ${envName}`);
  const account = privateKeyToAccount(`0x${key.replace(/^0x/, "")}` as Hex);
  return { account, wallet: createWalletClient({ account, chain: hydroChain(), transport: http(RPC) }) };
}

async function send(label: string, hash: Promise<Hex>) {
  const client = publicClient();
  const tx = await hash;
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error(`${label} reverted: https://hashscan.io/testnet/transaction/${tx}`);
  console.log(`${label}: https://hashscan.io/testnet/transaction/${tx}`);
}

async function show() {
  const { readCreditPool } = await import("~~/services/mrv/server/creditPool");
  console.log(JSON.stringify(await readCreditPool(), null, 2));
}

async function seed(kg: bigint, usdPerTonne: number, execute: boolean) {
  const { readCreditPool } = await import("~~/services/mrv/server/creditPool");
  const { getOracleStatus } = await import("~~/services/mrv/server/registry");
  const client = publicClient();
  const registry = requireDeployment();
  const market = requireMarket();
  const [pool, oracle, router] = await Promise.all([
    readCreditPool(),
    getOracleStatus(),
    client.readContract({ address: market.address, abi: market.abi, functionName: "ROUTER" }),
  ]);
  if (pool.exists && BigInt(pool.reserveKg) > 0n) {
    console.log(
      `The pool ${pool.pairId ?? pool.pair} already holds ${pool.reserveKg} kg at ${pool.hbarPerTonne} HBAR/t.`,
    );
    return;
  }
  if (!oracle?.price)
    throw new Error(`No oracle price (${oracle?.pausedReason ?? "no feed"}); the opening price needs one`);
  const tinybar = BigInt(Math.round(((Number(kg) / 1_000) * usdPerTonne * 1e8) / oracle.price));
  const fee = pool.exists ? 0n : await pairCreateFeeTinybar(pool.factory);
  console.log(
    `Seed ${kg} kg with ${Number(tinybar) / 1e8} HBAR ($${usdPerTonne}/t at $${oracle.price}/HBAR)` +
      (pool.exists ? " into the existing empty pair" : `, creating the pair for ${Number(fee) / 1e8} HBAR`),
  );
  if (!execute) return console.log("Dry run: add --execute and KEEPER_PRIVATE_KEY to send it.");
  const { account, wallet } = walletFor("KEEPER_PRIVATE_KEY");
  const gasPrice = await client.getGasPrice();
  const custody = await client.readContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "custodyBalanceOf",
    args: [account.address],
  });
  if (custody < kg) throw new Error(`${account.address} holds ${custody} kg in registry custody, needs ${kg}`);
  await send(
    `Withdraw ${kg} kg from registry custody`,
    wallet.writeContract({
      address: registry.address,
      abi: registry.abi,
      functionName: "withdraw",
      args: [kg],
      gas: GAS.withdraw,
      gasPrice,
    }),
  );
  if (!pool.exists) {
    await send(
      "Create the SaucerSwap V1 WHBAR/credit pair",
      wallet.writeContract({
        address: pool.factory,
        abi: FACTORY_ABI,
        functionName: "createPair",
        args: [pool.creditToken, pool.whbar],
        value: fee * WEIBAR_PER_TINYBAR,
        gas: GAS.createPair,
        gasPrice,
      }),
    );
  }
  await send(
    "Approve the router for the credits",
    wallet.writeContract({
      address: pool.creditToken,
      abi: TOKEN_ABI,
      functionName: "approve",
      args: [router, kg],
      gas: GAS.approve,
      gasPrice,
    }),
  );
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  await send(
    `Add ${kg} kg and ${Number(tinybar) / 1e8} HBAR of liquidity`,
    wallet.writeContract({
      address: router,
      abi: ROUTER_ABI,
      functionName: "addLiquidityETH",
      args: [pool.creditToken, kg, kg, (tinybar * 99n) / 100n, getAddress(account.address), deadline],
      value: tinybar * WEIBAR_PER_TINYBAR,
      gas: GAS.addLiquidity,
      gasPrice,
    }),
  );
  await show();
}

async function buy(kg: number, beneficiary: string) {
  const { prepareDexRetire } = await import("~~/services/mrv/server/creditPool");
  const { account, wallet } = walletFor("BUYER_PRIVATE_KEY");
  const prepared = await prepareDexRetire({ amountKg: kg, beneficiary, buyer: account.address });
  console.log(`prepare_dex_retire: ${prepared.summary}`);
  const gasPrice = await publicClient().getGasPrice();
  for (const step of prepared.steps) {
    await send(
      step.label,
      wallet.sendTransaction({
        to: step.to,
        data: step.data,
        value: BigInt(step.value),
        gas: BigInt(step.gas),
        gasPrice,
      }),
    );
  }
}

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const run =
  command === "seed"
    ? () => seed(BigInt(args[0] ?? 200), Number(flag("--usd") ?? 15), args.includes("--execute"))
    : command === "buy"
      ? () => buy(Number(args[0] ?? 10), args[1] ?? "Hydro dMRV DEX buyer")
      : show;
run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
