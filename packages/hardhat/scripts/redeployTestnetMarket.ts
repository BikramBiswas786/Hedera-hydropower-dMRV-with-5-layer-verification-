/**
 * Replaces the testnet CreditMarket with one built from the current source, next to the live registry, so the market
 * a judge opens on HashScan is the code in this repository (the factory-pinned pool guard, no leftover proceeds):
 *
 *   __RUNTIME_DEPLOYER_PRIVATE_KEY=0x… yarn hardhat run scripts/redeployTestnetMarket.ts --network hederaTestnet
 *
 * The signer must be admin of the live registry. Steps:
 * 1. Deploy CreditMarket on the live registry, the live feed and SaucerSwap V1, and pin the testnet pool guard
 *    (setPoolGuard asks SaucerSwap's factory for the pair).
 * 2. Grant it MARKET_ROLE on the registry.
 * 3. List LIST_UNITS kg at PRICE_USD_CENTS per tonne and buyAndRetire BUY_UNITS kg, which mints an HYRET certificate.
 *
 * The app reads the market address from deployedContracts.ts, so the old market keeps its listing until that file
 * points at the new one. Afterwards, `RETIRE_OLD=1` (with MARKET_ADDRESS set to the new market) cancels the signer's
 * listings on the old market, which returns the credits to registry custody, and revokes its MARKET_ROLE so exactly one
 * market can move credits. The registry predates the one-market rule (`setMarket`), so its MARKET_ROLE stays grantable
 * and the revoke is what enforces it. Testnet housekeeping and evidence, not part of the product; the Checkout testnet
 * demo workflow runs it (redeploy_market).
 */
import hre from "hardhat";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract, hashscanTx } from "../utils/hydroNetworkConfig";

const LIVE_REGISTRY = process.env.REGISTRY_ADDRESS ?? "0xaf9C76B48B317cee770ED6AE038D516b269E0129";
const OLD_MARKET = process.env.OLD_MARKET_ADDRESS ?? "0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030";
const LIST_UNITS = BigInt(process.env.LIST_UNITS || 1_000);
const BUY_UNITS = BigInt(process.env.BUY_UNITS || 10);
const PRICE_USD_CENTS = BigInt(process.env.PRICE_USD_CENTS || 1_500);
/** On Hedera's JSON-RPC relay, transaction value is in weibar: 1 tinybar = 1e10. */
const WEIBAR_PER_TINYBAR = 10_000_000_000n;

const REGISTRY_ABI = [
  "function MARKET_ROLE() view returns (bytes32)",
  "function hasRole(bytes32, address) view returns (bool)",
  "function grantRole(bytes32, address)",
  "function revokeRole(bytes32, address)",
  "function custodyBalanceOf(address) view returns (uint256)",
];
const OLD_MARKET_ABI = [
  "function HBAR_USD_FEED() view returns (address)",
  "function listingCount() view returns (uint256)",
  "function getListing(uint256) view returns ((address seller, uint64 unitsAvailable, uint64 priceUsdCentsPerTonne, bool active))",
  "function cancelListing(uint256)",
];

type Sent = Promise<{ hash: string; wait: () => Promise<unknown> }>;

async function main() {
  if (hre.network.name !== "hederaTestnet") throw new Error("Run with --network hederaTestnet");
  const config = getHydroNetworkConfig(hre);
  const [signer] = await hre.ethers.getSigners();
  const gasPrice = await getDeployGasPrice(hre);
  const registry = new hre.ethers.Contract(LIVE_REGISTRY, REGISTRY_ABI, signer);
  const oldMarket = new hre.ethers.Contract(OLD_MARKET, OLD_MARKET_ABI, signer);
  const role: string = await registry.MARKET_ROLE();
  const send = async (label: string, pending: Sent) => {
    const tx = await pending;
    await tx.wait();
    console.log(`${label}: ${hashscanTx(config, tx.hash)}`);
  };

  if (process.env.RETIRE_OLD === "1") {
    const replacement = process.env.MARKET_ADDRESS;
    if (!replacement || !(await registry.hasRole(role, replacement))) {
      throw new Error("RETIRE_OLD needs MARKET_ADDRESS set to a market that already holds MARKET_ROLE");
    }
    const count = Number(await oldMarket.listingCount());
    for (let id = 0; id < count; id++) {
      const listing = await oldMarket.getListing(id);
      if (listing.active && listing.seller.toLowerCase() === signer.address.toLowerCase()) {
        await send(`Cancel old listing #${id}`, oldMarket.cancelListing(id, { gasLimit: 1_000_000, gasPrice }));
      }
    }
    if (await registry.hasRole(role, OLD_MARKET)) {
      await send(
        "Revoke the old market's MARKET_ROLE",
        registry.revokeRole(role, OLD_MARKET, { gasLimit: 200_000, gasPrice }),
      );
    }
    return;
  }

  const guard = config.poolGuard!;
  const factory = await hre.ethers.getContractFactory("CreditMarket", signer);
  const deployed = await factory.deploy(
    signer.address,
    LIVE_REGISTRY,
    await oldMarket.HBAR_USD_FEED(),
    config.nativeUnitsPerHbar,
    config.maxPriceAgeSeconds,
    config.saucerFactory!,
    config.saucerRouter!,
    { gasLimit: 3_000_000, gasPrice },
  );
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  const market = await hre.ethers.getContractAt("CreditMarket", address, signer);
  console.log(`CreditMarket deployed: ${hashscanContract(config, address)}`);

  await send(
    "Pool guard (pair checked against SaucerSwap's factory)",
    market.setPoolGuard(
      guard.pool,
      guard.isV2,
      guard.whbar,
      guard.whbarDecimals,
      guard.usdDecimals,
      guard.maxDeviationBps,
      guard.minLiquidity,
      guard.enabled,
      { gasLimit: 400_000, gasPrice },
    ),
  );
  await send("Grant MARKET_ROLE to the new market", registry.grantRole(role, address, { gasLimit: 200_000, gasPrice }));

  const custody = await registry.custodyBalanceOf(signer.address);
  if (custody < LIST_UNITS) throw new Error(`${signer.address} holds ${custody} units in registry custody`);
  const listingId = await market.listingCount();
  await send(
    `List ${LIST_UNITS} kg at $${Number(PRICE_USD_CENTS) / 100} per tonne`,
    market.createListing(LIST_UNITS, PRICE_USD_CENTS, { gasLimit: 1_000_000, gasPrice }),
  );
  const quote = await market.quote(listingId, BUY_UNITS);
  const value = ((quote * 101n) / 100n) * WEIBAR_PER_TINYBAR; // 1% headroom; the contract refunds the excess
  await send(
    `buyAndRetire ${BUY_UNITS} kg for ${Number(quote) / 1e8} HBAR through SaucerSwap`,
    market.buyAndRetire(listingId, BUY_UNITS, "Hydro dMRV demo buyer", { value, gasLimit: 3_000_000, gasPrice }),
  );
  console.log(`MARKET_ADDRESS=${address}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
