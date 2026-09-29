import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { MAX_ORACLE_DEVIATION_BPS, getHydroNetworkConfig, hashscanContract } from "../utils/hydroNetworkConfig";
import { pinPoolGuard } from "../utils/poolGuard";

/**
 * The settlement alone on Hedera mainnet: `ResilientHbarUsdFeed` on mainnet Chainlink (Supra fallback) and
 * `UsdCheckout` guarded by SaucerSwap's public WHBAR/USDC pair 0.0.1462797. No registry, market or credit token: the
 * registry refuses demo plants on mainnet, and no real plant is registered.
 *
 *   __RUNTIME_DEPLOYER_PRIVATE_KEY=0x… yarn deploy --network hederaMainnet --tags MainnetCheckout
 *
 * The Mainnet checkout workflow runs it, then `yarn mainnet:checkout buy` lists a labelled test token and buys it, so
 * the buyer's HBAR is swapped through that pair and the seller is paid USDC. A plain Hardhat fork of mainnet
 * (HEDERA_FORK_NETWORK=mainnet) rehearses the same deploy; every other network skips it.
 */
const deployMainnetCheckout: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const config = getHydroNetworkConfig(hre);
  const gasPrice = await getDeployGasPrice(hre);
  const { oracles, saucerFactory, saucerRouter, poolGuard } = config;
  if (!oracles || !saucerFactory || !saucerRouter || !poolGuard) throw new Error("No mainnet settlement config");

  const feed = await deploy("ResilientHbarUsdFeed", {
    from: deployer,
    args: [oracles.chainlink, oracles.supra, oracles.supraPairId, config.maxPriceAgeSeconds, MAX_ORACLE_DEVIATION_BPS],
    log: true,
    autoMine: true,
    gasLimit: 1_500_000,
    gasPrice,
  });
  const checkout = await deploy("UsdCheckout", {
    from: deployer,
    args: [deployer, feed.address, config.nativeUnitsPerHbar, config.maxPriceAgeSeconds, saucerFactory, saucerRouter],
    log: true,
    autoMine: true,
    gasLimit: 3_000_000,
    gasPrice,
  });
  await pinPoolGuard(hre, "UsdCheckout", checkout.address, poolGuard);

  console.log(`ResilientHbarUsdFeed: ${hashscanContract(config, feed.address)}`);
  console.log(`UsdCheckout:          ${hashscanContract(config, checkout.address)}`);
};

deployMainnetCheckout.tags = ["MainnetCheckout"];
deployMainnetCheckout.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.name !== "hederaMainnet" &&
  !(hre.network.name === "hardhat" && process.env.HEDERA_FORK_NETWORK === "mainnet");
export default deployMainnetCheckout;
