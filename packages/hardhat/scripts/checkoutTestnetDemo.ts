/**
 * One testnet sale through `UsdCheckout`, next to the live registry and market, with no redeploy of either:
 *
 *   __RUNTIME_DEPLOYER_PRIVATE_KEY=0x… yarn hardhat run scripts/checkoutTestnetDemo.ts --network hederaTestnet
 *
 * 1. Deploys `UsdCheckout` on the live `ResilientHbarUsdFeed` and SaucerSwap V1 (skipped when CHECKOUT_ADDRESS is set)
 *    and pins the same pool guard as the market.
 * 2. The signer, which must hold `DmrvRegistry` custody, associates with the HTS credit token and withdraws a little
 *    to its wallet. Any HTS fungible token works: set TOKEN_ID (e.g. the Guardian-minted 0.0.10760359) to list a
 *    token the signer already holds instead. LIST_UNITS, BUY_UNITS and PRICE_USD_CENTS override the amounts.
 * 3. Approves the checkout, lists the tokens at a USD price per whole token and buys a slice back at the oracle
 *    price. The HBAR goes through SaucerSwap, so the seller is paid the pair's USD token.
 *
 * Testnet housekeeping and evidence, not part of the product. The Checkout testnet demo workflow runs it.
 */
import hre from "hardhat";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract, hashscanTx } from "../utils/hydroNetworkConfig";

/** The live testnet contracts, as in packages/nextjs/contracts/deployedContracts.ts (chain 296). */
const LIVE_REGISTRY = process.env.REGISTRY_ADDRESS ?? "0xaf9C76B48B317cee770ED6AE038D516b269E0129";
const LIVE_MARKET = process.env.MARKET_ADDRESS ?? "0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030";
const LIST_UNITS = BigInt(process.env.LIST_UNITS || 50); // 0.050 t of a 3-decimal token
const BUY_UNITS = BigInt(process.env.BUY_UNITS || 10);
const PRICE_USD_CENTS_PER_TOKEN = BigInt(process.env.PRICE_USD_CENTS || 1_500); // $15 per whole token
/** A Hedera token id such as 0.0.10760359, listed as is. Unset: the registry's credit token. */
const TOKEN_ID = process.env.TOKEN_ID;
const evmAddressOf = (id: string) => `0x${BigInt(id.split(".")[2]).toString(16).padStart(40, "0")}`;
/** On Hedera's JSON-RPC relay, transaction value is in weibar: 1 tinybar = 1e10. */
const WEIBAR_PER_TINYBAR = 10_000_000_000n;
const TOKEN_ABI = [
  "function associate() returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  if (hre.network.name !== "hederaTestnet") throw new Error("Run with --network hederaTestnet");
  const config = getHydroNetworkConfig(hre);
  const guard = config.poolGuard!;
  const [signer] = await hre.ethers.getSigners();
  const gasPrice = await getDeployGasPrice(hre);
  const registry = await hre.ethers.getContractAt("DmrvRegistry", LIVE_REGISTRY, signer);
  const market = new hre.ethers.Contract(LIVE_MARKET, ["function HBAR_USD_FEED() view returns (address)"], signer);
  const link = (hash: string) => hashscanTx(config, hash);
  const send = async (label: string, pending: Promise<{ hash: string; wait: () => Promise<unknown> }>) => {
    const tx = await pending;
    await tx.wait();
    console.log(`${label}: ${link(tx.hash)}`);
  };

  let checkoutAddress = process.env.CHECKOUT_ADDRESS;
  if (!checkoutAddress) {
    const feed = await market.HBAR_USD_FEED();
    const factory = await hre.ethers.getContractFactory("UsdCheckout", signer);
    const contract = await factory.deploy(
      signer.address,
      feed,
      config.nativeUnitsPerHbar,
      config.maxPriceAgeSeconds,
      config.saucerFactory!,
      config.saucerRouter!,
      { gasLimit: 3_000_000, gasPrice },
    );
    await contract.waitForDeployment();
    checkoutAddress = await contract.getAddress();
    console.log(`UsdCheckout deployed: ${hashscanContract(config, checkoutAddress)} (feed ${feed})`);
  }
  const checkout = await hre.ethers.getContractAt("UsdCheckout", checkoutAddress, signer);
  if ((await checkout.poolGuard()).pool.toLowerCase() !== guard.pool.toLowerCase()) {
    await send(
      "Pool guard",
      checkout.setPoolGuard(
        guard.pool,
        guard.isV2,
        guard.whbar,
        guard.whbarDecimals,
        guard.usdDecimals,
        guard.maxDeviationBps,
        guard.minLiquidity,
        guard.enabled,
        { gasLimit: 300_000, gasPrice },
      ),
    );
  }

  const tokenAddress = TOKEN_ID ? evmAddressOf(TOKEN_ID) : await registry.creditToken();
  const token = new hre.ethers.Contract(tokenAddress, TOKEN_ABI, signer);
  if (TOKEN_ID) {
    const balance = await token.balanceOf(signer.address);
    if (balance < LIST_UNITS) throw new Error(`${signer.address} holds ${balance} units of ${TOKEN_ID}`);
  } else if ((await token.balanceOf(signer.address)) < LIST_UNITS) {
    // HIP-719: an EOA associates by calling the token. A second call returns 194 and changes nothing.
    await send("Associate with the credit token", token.associate({ gasLimit: 1_000_000, gasPrice }));
    const custody = await registry.custodyBalanceOf(signer.address);
    if (custody < LIST_UNITS) throw new Error(`${signer.address} holds ${custody} units in registry custody`);
    await send("Withdraw from registry custody", registry.withdraw(LIST_UNITS, { gasLimit: 1_000_000, gasPrice }));
  }

  await send("Approve the checkout", token.approve(checkoutAddress, LIST_UNITS, { gasLimit: 1_000_000, gasPrice }));
  const listingId = await checkout.listingCount();
  await send(
    `List ${LIST_UNITS} units at $${Number(PRICE_USD_CENTS_PER_TOKEN) / 100} per token`,
    checkout.createListing(tokenAddress, LIST_UNITS, PRICE_USD_CENTS_PER_TOKEN, { gasLimit: 2_000_000, gasPrice }),
  );

  const quote = await checkout.quote(listingId, BUY_UNITS);
  const value = ((quote * 101n) / 100n) * WEIBAR_PER_TINYBAR; // 1% headroom; the contract refunds the excess
  await send(
    `Buy ${BUY_UNITS} units for ${Number(quote) / 1e8} HBAR (seller paid in the pair's USD token)`,
    checkout.buy(listingId, BUY_UNITS, { value, gasLimit: 2_000_000, gasPrice }),
  );
  console.log(`Listing ${listingId}: ${(await checkout.getListing(listingId)).available} units left`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
