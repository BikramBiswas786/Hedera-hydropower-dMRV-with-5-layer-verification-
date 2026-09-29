import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";
import { getHydroNetworkConfig, hashscanContract, hashscanTx } from "../utils/hydroNetworkConfig";

/**
 * The second methodology, `RenewableVmr0017Module` (greenfield solar, wind and ocean power; CDM ACM0002
 * or VMR0017 v1.0), next to the hydro module on the same registry. Nothing else changes: projects registered under
 * it use the same meter and VVB signatures, HCS anchoring, market and retirement certificates.
 *
 * Approval needs DEFAULT_ADMIN_ROLE. When the deployer no longer holds it (a 2-of-3 threshold admin), this prints
 * the call for `yarn admin:exec` instead. `yarn deploy --network <net> --tags RenewableModule` runs only this step.
 */
const deployRenewableModule: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const module = await hre.deployments.deploy("RenewableVmr0017Module", {
    from: deployer,
    log: true,
    autoMine: true,
    gasLimit: 2_500_000,
    gasPrice: await getDeployGasPrice(hre),
  });
  console.log(`RenewableVmr0017Module: ${hashscanContract(config, module.address)}`);

  const registry = await hre.ethers.getContractAt(
    "DmrvRegistry",
    (await hre.deployments.get("DmrvRegistry")).address,
    await hre.ethers.getSigner(deployer),
  );
  if (await registry.approvedModule(module.address)) return;
  if (!(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), deployer))) {
    console.log(
      `The deployer is not the registry admin. Approve with:\n  yarn admin:exec plan DmrvRegistry "setModuleApproved(address,bool)" ${module.address} true`,
    );
    return;
  }
  const tx = await registry.setModuleApproved(module.address, true, { gasLimit: 200_000 });
  await tx.wait();
  console.log(`Approved RenewableVmr0017Module ${module.address}: ${hashscanTx(config, tx.hash)}`);
};

deployRenewableModule.tags = ["RenewableModule"];
deployRenewableModule.dependencies = ["DmrvRegistry"];
export default deployRenewableModule;
