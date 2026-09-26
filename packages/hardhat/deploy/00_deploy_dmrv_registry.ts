import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import {
  LOCAL_MOCK_HBAR_USD,
  LOCAL_SUPRA_PAIR_ID,
  MAX_ORACLE_DEVIATION_BPS,
  MIN_COMPLETENESS_BPS,
  type OracleSources,
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

/** Local chains get settable stand-ins for both oracles, priced at $0.25 (Chainlink) and $0.2505 (Supra). */
async function deployLocalOracles(hre: HardhatRuntimeEnvironment, deployer: string): Promise<OracleSources> {
  await ensureLocalHts(hre);
  const { deploy } = hre.deployments;
  const chainlink = await deploy("MockV3Aggregator", {
    from: deployer,
    args: [8, LOCAL_MOCK_HBAR_USD],
    log: true,
    autoMine: true,
  });
  const supra = await deploy("MockSupraSValueFeed", { from: deployer, log: true, autoMine: true });

  const now = (await hre.ethers.provider.getBlock("latest"))?.timestamp ?? Math.floor(Date.now() / 1_000);
  const supraFeed = await hre.ethers.getContractAt(
    "MockSupraSValueFeed",
    supra.address,
    await hre.ethers.getSigner(deployer),
  );
  await (await supraFeed.setPrice(LOCAL_SUPRA_PAIR_ID, 2_505n * 10n ** 14n, 18, BigInt(now) * 1_000n)).wait();

  return { chainlink: chainlink.address, supra: supra.address, supraPairId: LOCAL_SUPRA_PAIR_ID };
}

/**
 * Deploys the phase-1 contracts: the HBAR/USD feed, the hydro methodology module, `DmrvRegistry` (core, the only
 * contract that touches HTS) and `CreditMarket` (listings and oracle settlement). Wiring and roles are set up by
 * `01_setup_dmrv_registry.ts`.
 */
const deployDmrv: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const config = getHydroNetworkConfig(hre);
  const gasPrice = await getDeployGasPrice(hre);

  const oracles = config.oracles ?? (await deployLocalOracles(hre, deployer));

  const feed = await deploy("ResilientHbarUsdFeed", {
    from: deployer,
    args: [oracles.chainlink, oracles.supra, oracles.supraPairId, config.maxPriceAgeSeconds, MAX_ORACLE_DEVIATION_BPS],
    log: true,
    autoMine: true,
    gasLimit: 1_500_000,
    gasPrice,
  });

  const module = await deploy("HydroVmr0017Module", {
    from: deployer,
    log: true,
    autoMine: true,
    gasLimit: 2_500_000,
    gasPrice,
  });

  const registry = await deploy("DmrvRegistry", {
    from: deployer,
    args: [deployer, MIN_COMPLETENESS_BPS],
    log: true,
    autoMine: true,
    gasLimit: 6_000_000,
    gasPrice,
  });

  const market = await deploy("CreditMarket", {
    from: deployer,
    args: [
      deployer,
      registry.address,
      feed.address,
      config.nativeUnitsPerHbar,
      config.maxPriceAgeSeconds,
      config.saucerFactory ?? deployer,
    ],
    log: true,
    autoMine: true,
    gasLimit: 3_000_000,
    gasPrice,
  });

  console.log(`ResilientHbarUsdFeed: ${hashscanContract(config, feed.address)}`);
  console.log(`HydroVmr0017Module:   ${hashscanContract(config, module.address)}`);
  console.log(`DmrvRegistry:         ${hashscanContract(config, registry.address)}`);
  console.log(`CreditMarket:         ${hashscanContract(config, market.address)}`);
};

deployDmrv.tags = ["DmrvRegistry"];
export default deployDmrv;
