import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { DEMO_PLANTS } from "../utils/demoPlants";
import { getHydroNetworkConfig, hashscanTx } from "../utils/hydroNetworkConfig";

/** HTS tokens have long-zero EVM addresses (0x000…0<num>) that map 1:1 to Hedera entity ids 0.0.<num>. */
function describeToken(address: string): string {
  const isLongZero = /^0x0{24}/i.test(address);
  return isLongZero ? `0.0.${BigInt(address)} (${address})` : address;
}

/**
 * Idempotent post-deploy setup: creates the HTS credit token and NFT certificate collection, grants the verifier
 * role and registers the demo plants with their validated designs.
 * Safe to re-run; every step checks on-chain state first.
 */
const setupHydroRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const signer = await hre.ethers.getSigner(deployer);
  const { address } = await hre.deployments.get("HydroCreditRegistry");
  const registry = await hre.ethers.getContractAt("HydroCreditRegistry", address, signer);

  if ((await registry.creditToken()) === hre.ethers.ZeroAddress) {
    const fee = hre.ethers.parseEther(process.env.CREDIT_TOKEN_CREATE_FEE_HBAR ?? "20");
    const tx = await registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", {
      value: fee,
      gasLimit: 1_000_000,
    });
    await tx.wait();
    const token = await registry.creditToken();
    console.log(`Created HTS credit token ${describeToken(token)}: ${hashscanTx(config, tx.hash)}`);
  }

  if ((await registry.certificateToken()) === hre.ethers.ZeroAddress) {
    const fee = hre.ethers.parseEther(process.env.CERTIFICATE_TOKEN_CREATE_FEE_HBAR ?? "20");
    const tx = await registry.createCertificateToken("Hydro dMRV Retirement", "HYRET", {
      value: fee,
      gasLimit: 1_000_000,
    });
    await tx.wait();
    const token = await registry.certificateToken();
    console.log(`Created HTS NFT certificate collection ${describeToken(token)}: ${hashscanTx(config, tx.hash)}`);
  }

  const verifier = process.env.VERIFIER_ADDRESS;
  const verifierRole = await registry.VERIFIER_ROLE();
  if (verifier && !(await registry.hasRole(verifierRole, verifier))) {
    const tx = await registry.grantRole(verifierRole, verifier, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`Granted VERIFIER_ROLE to ${verifier}: ${hashscanTx(config, tx.hash)}`);
  }

  const registered = new Set(await registry.getPlantIds());
  const operator = process.env.PLANT_OPERATOR_ADDRESS ?? deployer;
  for (const plant of DEMO_PLANTS) {
    const plantId = hre.ethers.encodeBytes32String(plant.plantId);
    if (registered.has(plantId)) continue;
    const tx = await registry.registerPlant(plantId, plant.name, operator, plant.design, { gasLimit: 600_000 });
    await tx.wait();
    const methodology = plant.design.methodology === 1 ? "VMR0017 v1.0 + ACM0002 v22.0" : "CDM ACM0002 / AMS-I.D";
    console.log(
      `Registered plant ${plant.plantId} under ${methodology} (operator ${operator}): ${hashscanTx(config, tx.hash)}`,
    );
  }
};

setupHydroRegistry.tags = ["HydroCreditRegistrySetup"];
setupHydroRegistry.dependencies = ["HydroCreditRegistry"];
export default setupHydroRegistry;
