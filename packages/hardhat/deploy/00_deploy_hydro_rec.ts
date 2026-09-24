import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import {
  LOCAL_MOCK_HBAR_USD,
  MIN_TRUST_SCORE_BPS,
  getHydroNetworkConfig,
  hashscanContract,
} from "../utils/hydroNetworkConfig";

const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";

/**
 * On local chains without the Hedera forking plugin there is no HTS at 0x167, so install the mock.
 * `yarn hardhat:chain` (HEDERA_FORKING=true) already provides the real HTS emulation and is left untouched.
 */
async function ensureLocalHts(hre: HardhatRuntimeEnvironment) {
  if ((await hre.ethers.provider.getCode(HTS_ADDRESS)) !== "0x") return;
  const { deployedBytecode } = await hre.artifacts.readArtifact("MockHederaTokenService");
  await hre.network.provider.send("hardhat_setCode", [HTS_ADDRESS, deployedBytecode]);
  console.log("Installed MockHederaTokenService at 0x167 (no HTS on this local chain)");
}

const deployHydroRec: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const config = getHydroNetworkConfig(hre);
  const gasPrice = await getDeployGasPrice(hre);

  let hbarUsdFeed = config.hbarUsdFeed;
  if (!hbarUsdFeed) {
    await ensureLocalHts(hre);
    const mockFeed = await deploy("MockV3Aggregator", {
      from: deployer,
      args: [8, LOCAL_MOCK_HBAR_USD],
      log: true,
      autoMine: true,
    });
    hbarUsdFeed = mockFeed.address;
  }

  const registry = await deploy("HydroREC", {
    from: deployer,
    args: [deployer, hbarUsdFeed, config.nativeUnitsPerHbar, MIN_TRUST_SCORE_BPS, config.maxPriceAgeSeconds],
    log: true,
    autoMine: true,
    gasLimit: 5_000_000,
    gasPrice,
  });

  console.log(`HydroREC: ${hashscanContract(config, registry.address)}`);
};

deployHydroRec.tags = ["HydroREC"];
export default deployHydroRec;
