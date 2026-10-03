/**
 * The developer path that does not need the carbon registry.
 *
 *   yarn checkout:demo
 *
 * Deploys a local HTS stand-in, a two-oracle feed, a SaucerSwap stand-in and UsdCheckout.
 * Lists event tickets at $12.50. Buys one. Then moves the pool 4% off the oracle and shows the revert.
 * No Hedera account. DmrvRegistry is not deployed.
 */
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  FEED_DECIMALS,
  HBAR_USD,
  HOUR,
  NATIVE_PER_HBAR,
  SAUCER_FACTORY,
  ensureSaucerFactory,
} from "../test/helpers/dmrv";
import { ensureHts, mockHts } from "../test/helpers/hts";

const WHBAR = "0x0000000000000000000000000000000000003aD2";
const USDC = "0x0000000000000000000000000000000000001549";
const TOKEN_DECIMALS = 2n;
const PRICE_CENTS = 1_250n;
const LISTED = 5_000n;
const ONE_TICKET = 100n;

function say(step: string, detail: Record<string, unknown>) {
  console.log(JSON.stringify({ step, ...detail }));
}

async function main() {
  await ensureHts();
  const factory = await ensureSaucerFactory();
  const [admin, seller, buyer] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, HBAR_USD]);
  const router = await ethers.deployContract("MockSaucerRouter");
  const checkout = await ethers.deployContract("UsdCheckout", [
    admin.address,
    await feed.getAddress(),
    NATIVE_PER_HBAR,
    HOUR,
    SAUCER_FACTORY,
    await router.getAddress(),
  ]);
  const pair = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
  await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
  await pair.setFactory(SAUCER_FACTORY);
  await factory.setPair(USDC, WHBAR, await pair.getAddress());
  await checkout.setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 10_000n * 10n ** 6n, true);

  const hts = await mockHts();
  const definition = {
    name: "Event ticket",
    symbol: "TIX",
    treasury: seller.address,
    memo: "",
    tokenSupplyType: false,
    maxSupply: 0,
    freezeDefault: false,
    tokenKeys: [],
    expiry: { second: 0, autoRenewAccount: seller.address, autoRenewPeriod: 7_776_000 },
  };
  const [, tokenAddress] = await hts.createFungibleToken.staticCall(definition, 10_000n, TOKEN_DECIMALS);
  await hts.createFungibleToken(definition, 10_000n, TOKEN_DECIMALS);
  const token = new ethers.Contract(
    tokenAddress,
    [
      "function approve(address, uint256) returns (bool)",
      "function associate() returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
    ],
    ethers.provider,
  );

  await token.connect(seller).approve(await checkout.getAddress(), LISTED);
  await checkout.connect(seller).createListing(tokenAddress, LISTED, PRICE_CENTS);
  say("listed", {
    token: "TIX",
    wholeTokens: Number(LISTED / ONE_TICKET),
    priceUsd: "12.50",
    checkout: await checkout.getAddress(),
    registry: "not deployed",
  });

  await token.connect(buyer).associate();
  const cost = await checkout.quote(0, ONE_TICKET);
  await checkout.connect(buyer).buy(0, ONE_TICKET, { value: cost });
  say("bought", {
    tickets: 1,
    hbar: ethers.formatEther(cost),
    sellerUsd: ethers.formatUnits(await router.paidUsd(seller.address), 6),
    buyerTickets: Number((await token.balanceOf(buyer.address)) / ONE_TICKET),
  });

  await pair.setReserves(240_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
  let refused = "";
  try {
    await checkout.quote(0, ONE_TICKET);
  } catch (error) {
    refused = (error as Error).message.includes("PoolPriceDeviation")
      ? "PoolPriceDeviation"
      : (error as Error).message.slice(0, 180);
  }
  if (refused !== "PoolPriceDeviation") throw new Error(`expected PoolPriceDeviation, got ${refused}`);
  say("pool-off", {
    oracleUsd: "0.25",
    poolUsd: "0.24",
    revert: refused,
    ticketsLeft: Number(LISTED / ONE_TICKET) - 1,
  });

  await feed.setUpdatedAt((await time.latest()) - 2 * HOUR);
  await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
  let stale = "";
  try {
    await checkout.quote(0, ONE_TICKET);
  } catch (error) {
    stale = (error as Error).message.includes("StalePrice") ? "StalePrice" : (error as Error).message.slice(0, 180);
  }
  if (stale !== "StalePrice") throw new Error(`expected StalePrice, got ${stale}`);
  say("stale-oracle", { revert: stale });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
