import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract } from "../utils/hydroNetworkConfig";
import { localPoolGuard } from "../utils/localSaucer";
import { pinPoolGuard } from "../utils/poolGuard";

/**
 * Deploys `UsdCheckout`: the same oracle + SaucerSwap settlement as `CreditMarket`, for any HTS fungible token.
 * It reuses the `ResilientHbarUsdFeed` deployed by 00 and the network's SaucerSwap factory, router and pool.
 *
 *   yarn deploy --network localhost --tags UsdCheckout
 *
 * Local chains use the stand-in factory, pair and router from `utils/localSaucer.ts`.
 */
const deployCheckout: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const gasPrice = await getDeployGasPrice(hre);
  const feed = await hre.deployments.get("ResilientHbarUsdFeed");
  const factory = config.saucerFactory ?? (await hre.deployments.get("MockSaucerFactory")).address;
  const router = config.saucerRouter ?? (await hre.deployments.get("MockSaucerRouter")).address;

  const deployed = await hre.deployments.deploy("UsdCheckout", {
    from: deployer,
    args: [deployer, feed.address, config.nativeUnitsPerHbar, config.maxPriceAgeSeconds, factory, router],
    log: true,
    autoMine: true,
    gasLimit: 3_000_000,
    gasPrice,
  });

  const guard = config.poolGuard ?? (await localPoolGuard(hre));
  if (guard) await pinPoolGuard(hre, "UsdCheckout", deployed.address, guard);
  console.log(`UsdCheckout:          ${hashscanContract(config, deployed.address)}`);
};

deployCheckout.tags = ["UsdCheckout"];
deployCheckout.dependencies = ["DmrvRegistry"];
export default deployCheckout;
