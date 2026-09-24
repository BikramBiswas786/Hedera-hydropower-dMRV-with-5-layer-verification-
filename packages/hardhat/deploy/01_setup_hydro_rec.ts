import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getHydroNetworkConfig, hashscanTx } from "../utils/hydroNetworkConfig";

const DEMO_PLANT_ID = "HYDRO-DEMO-01";
const DEMO_PLANT_CAPACITY_KW = 500;

/** HTS tokens have long-zero EVM addresses (0x000…0<num>) that map 1:1 to Hedera entity ids 0.0.<num>. */
function describeToken(address: string): string {
  const isLongZero = /^0x0{24}/i.test(address);
  return isLongZero ? `0.0.${BigInt(address)} (${address})` : address;
}

/**
 * Idempotent post-deploy setup: creates the HTS REC token, grants the verifier role and registers a demo plant.
 * Safe to re-run; every step checks on-chain state first.
 */
const setupHydroRec: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const signer = await hre.ethers.getSigner(deployer);
  const { address } = await hre.deployments.get("HydroREC");
  const registry = await hre.ethers.getContractAt("HydroREC", address, signer);

  if ((await registry.recToken()) === hre.ethers.ZeroAddress) {
    const fee = hre.ethers.parseEther(process.env.REC_TOKEN_CREATE_FEE_HBAR ?? "20");
    const tx = await registry.createRecToken("Hydro REC", "HREC", { value: fee, gasLimit: 1_000_000 });
    await tx.wait();
    const token = await registry.recToken();
    console.log(`Created HTS REC token ${describeToken(token)}: ${hashscanTx(config, tx.hash)}`);
  }

  const verifier = process.env.VERIFIER_ADDRESS;
  const verifierRole = await registry.VERIFIER_ROLE();
  if (verifier && !(await registry.hasRole(verifierRole, verifier))) {
    const tx = await registry.grantRole(verifierRole, verifier, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`Granted VERIFIER_ROLE to ${verifier}: ${hashscanTx(config, tx.hash)}`);
  }

  if ((await registry.getPlantIds()).length === 0) {
    const operator = process.env.PLANT_OPERATOR_ADDRESS ?? deployer;
    const tx = await registry.registerPlant(
      hre.ethers.encodeBytes32String(DEMO_PLANT_ID),
      "Demo run-of-river plant",
      operator,
      DEMO_PLANT_CAPACITY_KW,
      { gasLimit: 300_000 },
    );
    await tx.wait();
    console.log(`Registered plant ${DEMO_PLANT_ID} (operator ${operator}): ${hashscanTx(config, tx.hash)}`);
  }
};

setupHydroRec.tags = ["HydroRECSetup"];
setupHydroRec.dependencies = ["HydroREC"];
export default setupHydroRec;
