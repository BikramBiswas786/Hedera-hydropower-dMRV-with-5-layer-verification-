import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract, hashscanTx } from "../utils/hydroNetworkConfig";

/**
 * Deploys `UsdCheckout`: the same oracle + SaucerSwap settlement as `CreditMarket`, for any HTS fungible token.
 * It reuses the `ResilientHbarUsdFeed` deployed by 00 and the network's SaucerSwap factory, router and pool.
 *
 *   yarn deploy --network localhost --tags UsdCheckout
 *
 * Local chains have no SaucerSwap pool, so a local checkout lists but cannot price until a pool guard is set.
 */
const deployCheckout: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const gasPrice = await getDeployGasPrice(hre);
  const feed = await hre.deployments.get("ResilientHbarUsdFeed");

  const deployed = await hre.deployments.deploy("UsdCheckout", {
    from: deployer,
    args: [
      deployer,
      feed.address,
      config.nativeUnitsPerHbar,
      config.maxPriceAgeSeconds,
      config.saucerFactory ?? deployer,
      config.saucerRouter ?? deployer,
    ],
    log: true,
    autoMine: true,
    gasLimit: 3_000_000,
    gasPrice,
  });

  const guard = config.poolGuard;
  if (guard) {
    const checkout = await hre.ethers.getContractAt(
      "UsdCheckout",
      deployed.address,
      await hre.ethers.getSigner(deployer),
    );
    if ((await checkout.poolGuard()).pool.toLowerCase() !== guard.pool.toLowerCase()) {
      const tx = await checkout.setPoolGuard(
        guard.pool,
        guard.isV2,
        guard.whbar,
        guard.whbarDecimals,
        guard.usdDecimals,
        guard.maxDeviationBps,
        guard.minLiquidity,
        guard.enabled,
        { gasLimit: 300_000 },
      );
      await tx.wait();
      console.log(`UsdCheckout pool guard ${guard.pool}: ${hashscanTx(config, tx.hash)}`);
    }
  }
  console.log(`UsdCheckout:          ${hashscanContract(config, deployed.address)}`);
};

deployCheckout.tags = ["UsdCheckout"];
deployCheckout.dependencies = ["DmrvRegistry"];
export default deployCheckout;
