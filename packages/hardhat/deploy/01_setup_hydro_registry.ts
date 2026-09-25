import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { DEMO_PLANTS } from "../utils/demoPlants";
import { getHydroNetworkConfig, hashscanTx } from "../utils/hydroNetworkConfig";

/** HTS tokens have long-zero EVM addresses (0x000…0<num>) that map 1:1 to Hedera entity ids 0.0.<num>. */
function describeToken(address: string): string {
  const isLongZero = /^0x0{24}/i.test(address);
  return isLongZero ? `0.0.${BigInt(address)} (${address})` : address;
}

/** Accepts an EVM address or a Hedera account id (0.0.<num>), which maps to its long-zero EVM address. */
function evmAddress(value: string): string {
  const account = /^0\.0\.(\d+)$/.exec(value.trim());
  return account ? `0x${BigInt(account[1]).toString(16).padStart(40, "0")}` : value.trim();
}

/**
 * Idempotent post-deploy setup: creates the HTS credit token and NFT certificate collection, registers the demo
 * plants with their validated designs and meters, then splits the keys:
 *
 *   VERIFIER_ADDRESS  gets VERIFIER_ROLE and the deployer loses it, so the attesting server key cannot administer.
 *   ADMIN_ADDRESS     gets DEFAULT_ADMIN_ROLE and the deployer renounces it. Use a Hedera account with a threshold
 *                     key (e.g. 2 of 3), given as 0.0.<num>, so no single key can register plants or swap meters.
 *
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

  const registered = new Set(await registry.getPlantIds());
  const operator = process.env.PLANT_OPERATOR_ADDRESS ?? deployer;
  for (const plant of DEMO_PLANTS) {
    const plantId = hre.ethers.encodeBytes32String(plant.plantId);
    if (registered.has(plantId)) continue;
    const tx = await registry.registerPlant(plantId, plant.name, operator, plant.meter, plant.design, {
      gasLimit: 600_000,
    });
    await tx.wait();
    const methodology = plant.design.methodology === 1 ? "VMR0017 v1.0 + ACM0002 v22.0" : "CDM ACM0002 / AMS-I.D";
    console.log(
      `Registered plant ${plant.plantId} under ${methodology} (operator ${operator}, meter ${plant.meter}): ${hashscanTx(config, tx.hash)}`,
    );
  }

  // Key split last, so every admin step above has already run with the deployer.
  const verifierRole = await registry.VERIFIER_ROLE();
  const adminRole = await registry.DEFAULT_ADMIN_ROLE();
  const isAdmin = await registry.hasRole(adminRole, deployer);
  if (process.env.VERIFIER_ADDRESS && isAdmin) {
    const verifier = evmAddress(process.env.VERIFIER_ADDRESS);
    if (!(await registry.hasRole(verifierRole, verifier))) {
      const tx = await registry.grantRole(verifierRole, verifier, { gasLimit: 200_000 });
      await tx.wait();
      console.log(`Granted VERIFIER_ROLE to ${verifier}: ${hashscanTx(config, tx.hash)}`);
    }
    if (verifier.toLowerCase() !== deployer.toLowerCase() && (await registry.hasRole(verifierRole, deployer))) {
      const tx = await registry.revokeRole(verifierRole, deployer, { gasLimit: 200_000 });
      await tx.wait();
      console.log(`Revoked the deployer's VERIFIER_ROLE: ${hashscanTx(config, tx.hash)}`);
    }
  }
  if (process.env.ADMIN_ADDRESS && isAdmin) {
    const admin = evmAddress(process.env.ADMIN_ADDRESS);
    if (admin.toLowerCase() !== deployer.toLowerCase()) {
      if (!(await registry.hasRole(adminRole, admin))) {
        const tx = await registry.grantRole(adminRole, admin, { gasLimit: 200_000 });
        await tx.wait();
        console.log(
          `Granted DEFAULT_ADMIN_ROLE to ${process.env.ADMIN_ADDRESS} (${admin}): ${hashscanTx(config, tx.hash)}`,
        );
      }
      const tx = await registry.renounceRole(adminRole, deployer, { gasLimit: 200_000 });
      await tx.wait();
      console.log(`The deployer renounced DEFAULT_ADMIN_ROLE: ${hashscanTx(config, tx.hash)}`);
    }
  }
};

setupHydroRegistry.tags = ["HydroCreditRegistrySetup"];
setupHydroRegistry.dependencies = ["HydroCreditRegistry"];
export default setupHydroRegistry;
