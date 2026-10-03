/**
 * Testnet proof that Hedera, not the buyer, settles a checkout.
 *
 *   __RUNTIME_DEPLOYER_PRIVATE_KEY=0x… BUYER_KEY=0x… \
 *     yarn hardhat run scripts/schedulePurchaseTestnet.ts --network hederaTestnet
 *
 * The operator deploys a fresh UsdCheckout, lists a few credit units, and the buyer locks the quoted HBAR.
 * schedulePurchase asks 0x16b to call settleScheduled as the buyer at executeAt. This script then signs that
 * schedule with the buyer's key. Hedera fires it. The receipt is the Hashscan schedule link.
 *
 * The band on this proof checkout is the same 3% as the live market. The schedule fires 60 seconds after
 * `executeAt`, because a call at the exact expiry second can still see an earlier EVM timestamp.
 */
import hre from "hardhat";
import { Wallet } from "ethers";
import { writeFileSync } from "fs";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract, hashscanTx } from "../utils/hydroNetworkConfig";

const LIVE_REGISTRY = process.env.REGISTRY_ADDRESS ?? "0x4EB517694CBac7b59a26B188eFEBa35aAb5Fd48e";
const LIVE_MARKET = process.env.MARKET_ADDRESS ?? "0x48F5056EdaD0B16c97a54085512b48417bC40F04";
const LIST_UNITS = BigInt(process.env.LIST_UNITS || 20);
const BUY_UNITS = BigInt(process.env.BUY_UNITS || 10);
const PRICE_USD_CENTS_PER_TOKEN = BigInt(process.env.PRICE_USD_CENTS || 1_500);
const BAND_BPS = Number(process.env.BAND_BPS || 300);
const EXECUTE_IN_SECONDS = Number(process.env.EXECUTE_IN_SECONDS || 240);
const WEIBAR_PER_TINYBAR = 10_000_000_000n;
const TOKEN_ABI = [
  "function associate() returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  if (hre.network.name !== "hederaTestnet") throw new Error("Run with --network hederaTestnet");
  const buyerKey = process.env.BUYER_KEY;
  if (!buyerKey) throw new Error("Set BUYER_KEY");
  const config = getHydroNetworkConfig(hre);
  const guard = config.poolGuard!;
  const gasPrice = await getDeployGasPrice(hre);
  const overrides = { type: 0, gasPrice, gasLimit: 4_000_000 };
  const [operator] = await hre.ethers.getSigners();
  const buyer = new Wallet(buyerKey, hre.ethers.provider);
  const link = (hash: string) => hashscanTx(config, hash);
  const send = async (
    label: string,
    pending: Promise<{
      hash: string;
      wait: () => Promise<{ logs: ReadonlyArray<{ topics: ReadonlyArray<string>; data: string }> } | null>;
    }>,
  ) => {
    const tx = await pending;
    const receipt = await tx.wait();
    console.log(`${label}: ${link(tx.hash)}`);
    return receipt;
  };

  console.log(`operator ${operator.address}`);
  console.log(`buyer    ${buyer.address}`);

  const market = new hre.ethers.Contract(LIVE_MARKET, ["function HBAR_USD_FEED() view returns (address)"], operator);
  const feed = await market.HBAR_USD_FEED();
  const factory = await hre.ethers.getContractFactory("UsdCheckout", operator);
  const deployed = await factory.deploy(
    operator.address,
    feed,
    config.nativeUnitsPerHbar,
    config.maxPriceAgeSeconds,
    config.saucerFactory!,
    config.saucerRouter!,
    { type: 0, gasLimit: 6_000_000, gasPrice },
  );
  await deployed.waitForDeployment();
  const checkoutAddress = await deployed.getAddress();
  console.log(`UsdCheckout ${hashscanContract(config, checkoutAddress)}`);
  const checkout = await hre.ethers.getContractAt("UsdCheckout", checkoutAddress, operator);
  await send(
    "Pool guard",
    checkout.setPoolGuard(
      guard.pool,
      guard.isV2,
      guard.whbar,
      guard.whbarDecimals,
      guard.usdDecimals,
      BAND_BPS,
      guard.minLiquidity,
      true,
      { type: 0, gasLimit: 400_000, gasPrice },
    ),
  );

  const registry = await hre.ethers.getContractAt("DmrvRegistry", LIVE_REGISTRY, operator);
  const tokenAddress = await registry.creditToken();
  const token = new hre.ethers.Contract(tokenAddress, TOKEN_ABI, operator);
  if ((await token.balanceOf(operator.address)) < LIST_UNITS) {
    await send("Associate operator", token.associate({ type: 0, gasLimit: 1_000_000, gasPrice }));
    const custody = await registry.custodyBalanceOf(operator.address);
    if (custody < LIST_UNITS) throw new Error(`operator custody ${custody} < ${LIST_UNITS}`);
    await send("Withdraw", registry.withdraw(LIST_UNITS, { type: 0, gasLimit: 1_500_000, gasPrice }));
  }
  await send("Approve", token.approve(checkoutAddress, LIST_UNITS, { type: 0, gasLimit: 1_000_000, gasPrice }));
  const listingId = await checkout.listingCount();
  await send(
    "List",
    checkout.createListing(tokenAddress, LIST_UNITS, PRICE_USD_CENTS_PER_TOKEN, {
      type: 0,
      gasLimit: 2_000_000,
      gasPrice,
    }),
  );

  const buyerToken = token.connect(buyer);
  await send("Associate buyer", buyerToken.getFunction("associate")({ type: 0, gasLimit: 1_000_000, gasPrice }));

  const asBuyer = checkout.connect(buyer);
  const quote = await asBuyer.quote(listingId, BUY_UNITS);
  const executeAt = BigInt(Math.floor(Date.now() / 1000) + EXECUTE_IN_SECONDS);
  const value = quote * WEIBAR_PER_TINYBAR;
  console.log(`quoteTinybar ${quote} executeAt ${executeAt} bandBps ${BAND_BPS}`);
  const receipt = await send(
    "schedulePurchase",
    asBuyer.schedulePurchase(listingId, BUY_UNITS, executeAt, { ...overrides, value }),
  );
  const parsed = receipt?.logs
    .map(log => {
      try {
        return checkout.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find(entry => entry?.name === "PurchaseScheduled");
  if (!parsed) throw new Error("PurchaseScheduled was not emitted");
  const scheduleAddress = parsed.args.schedule as string;
  const scheduleNum = BigInt(scheduleAddress);
  console.log(`schedule 0.0.${scheduleNum}`);
  console.log(`https://hashscan.io/testnet/schedule/0.0.${scheduleNum}`);
  console.log(`SIGN_BEFORE ${executeAt}`);
  writeFileSync("/tmp/hydro-schedule.txt", `0.0.${scheduleNum}\n${executeAt}\n${checkoutAddress}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
