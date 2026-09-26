import { DEMO_PLANTS, HYDRO_PARAMS_TUPLE, hydroParamsOf } from "../utils/demoPlants";
import { getHydroNetworkConfig, hashscanTx } from "../utils/hydroNetworkConfig";
import { LIVE_NETWORKS, resolveMeterAddresses } from "../utils/meterKeys";
import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

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
 * Idempotent post-deploy setup, in this order (every step checks on-chain state first, so it is safe to re-run):
 *
 *   1. HTS credit token and NFT certificate collection (created by the registry, which is their treasury).
 *   2. Approve `HydroVmr0017Module`; grant `MARKET_ROLE` to `CreditMarket`.
 *   3. Audit topic from HCS_TOPIC_ID.
 *   4. Demo projects, each with its own meter address. On Hedera networks the meters come from METER_ADDRESSES or
 *      `.secrets/meters.<network>.json`; the public demo derivation is refused (the deploy throws).
 *   5. SaucerSwap pool guard on the market (always enforced; `setPoolGuardEnabled(false)` reverts).
 *   6. Key split: VERIFIER_ADDRESS (the VVB's ECDSA signing key) gets VERIFIER_ROLE. ADMIN_ADDRESS (a 2-of-3
 *      Hedera threshold account, 0.0.<num>) gets DEFAULT_ADMIN_ROLE on both contracts and the deployer renounces.
 *      Nobody needs a role to relay attestations: the meter and VVB signatures are the authorisation.
 */
const setupDmrv: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const config = getHydroNetworkConfig(hre);
  const network = hre.network.name;
  const live = LIVE_NETWORKS.has(network);
  const signer = await hre.ethers.getSigner(deployer);
  const registry = await hre.ethers.getContractAt(
    "DmrvRegistry",
    (await hre.deployments.get("DmrvRegistry")).address,
    signer,
  );
  const market = await hre.ethers.getContractAt(
    "CreditMarket",
    (await hre.deployments.get("CreditMarket")).address,
    signer,
  );
  const moduleAddress = (await hre.deployments.get("HydroVmr0017Module")).address;
  const adminRole = await registry.DEFAULT_ADMIN_ROLE();

  if (live && (!process.env.VERIFIER_ADDRESS || !process.env.ADMIN_ADDRESS)) {
    const message =
      "Set VERIFIER_ADDRESS (the VVB's ECDSA key) and ADMIN_ADDRESS (the 2-of-3 threshold account, 0.0.<num>).";
    if (network === "hederaMainnet") throw new Error(message);
    console.warn(`${message} Continuing on testnet with the deployer as admin and no VVB.`);
  }
  if (network === "hederaMainnet" && process.env.REGISTER_DEMO_PLANTS === "true") {
    throw new Error("Refusing demo plants on hederaMainnet.");
  }
  const registerDemo = network !== "hederaMainnet";
  // Resolve (and on live networks validate) the meters before any transaction is sent.
  const meters = registerDemo
    ? resolveMeterAddresses(
        network,
        DEMO_PLANTS.map(p => p.plantId),
      )
    : {};

  if (!(await registry.hasRole(adminRole, deployer))) {
    console.log("The deployer is no longer admin; setup was completed earlier.");
    return;
  }

  if ((await registry.creditToken()) === hre.ethers.ZeroAddress) {
    const fee = hre.ethers.parseEther(process.env.CREDIT_TOKEN_CREATE_FEE_HBAR ?? "20");
    const tx = await registry.createCreditToken(
      "dMRV Carbon Credit",
      "HYCC",
      "dMRV registry credit: 1 unit = 1 kg CO2e, minted only against meter + VVB signed attestations",
      { value: fee, gasLimit: 1_000_000 },
    );
    await tx.wait();
    console.log(
      `Created HTS credit token ${describeToken(await registry.creditToken())}: ${hashscanTx(config, tx.hash)}`,
    );
  }
  if ((await registry.certificateToken()) === hre.ethers.ZeroAddress) {
    const fee = hre.ethers.parseEther(process.env.CERTIFICATE_TOKEN_CREATE_FEE_HBAR ?? "20");
    const tx = await registry.createCertificateToken(
      "dMRV Retirement Certificate",
      "HYRET",
      "dMRV retirement certificate; metadata dmrv:retirement:<id>",
      { value: fee, gasLimit: 1_000_000 },
    );
    await tx.wait();
    console.log(
      `Created HTS NFT certificate collection ${describeToken(await registry.certificateToken())}: ${hashscanTx(config, tx.hash)}`,
    );
  }

  if (!(await registry.approvedModule(moduleAddress))) {
    const tx = await registry.setModuleApproved(moduleAddress, true, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`Approved HydroVmr0017Module ${moduleAddress}: ${hashscanTx(config, tx.hash)}`);
  }
  const marketRole = await registry.MARKET_ROLE();
  const marketAddress = await market.getAddress();
  if (!(await registry.hasRole(marketRole, marketAddress))) {
    const tx = await registry.grantRole(marketRole, marketAddress, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`Granted MARKET_ROLE to CreditMarket ${marketAddress}: ${hashscanTx(config, tx.hash)}`);
  }

  const topicEnv = process.env.HCS_TOPIC_ID?.trim();
  const topicNum = topicEnv ? BigInt(topicEnv.replace(/^0\.0\./, "")) : 0n;
  if (topicNum > 0n && (await registry.auditTopic()) !== topicNum) {
    const tx = await registry.setAuditTopic(topicNum, { gasLimit: 200_000 });
    await tx.wait();
    console.log(`Set audit topic ${topicNum}: ${hashscanTx(config, tx.hash)}`);
  } else if (live && topicNum === 0n) {
    console.warn("HCS_TOPIC_ID is unset. The registry rejects attestations until setAuditTopic.");
  }

  const registered = new Set(await registry.getProjectIds());
  const operator = process.env.PLANT_OPERATOR_ADDRESS ?? deployer;
  const coder = hre.ethers.AbiCoder.defaultAbiCoder();
  for (const plant of registerDemo ? DEMO_PLANTS : []) {
    const projectId = hre.ethers.encodeBytes32String(plant.plantId);
    if (registered.has(projectId)) continue;
    const params = coder.encode([HYDRO_PARAMS_TUPLE], [hydroParamsOf(plant)]);
    const meter = meters[plant.plantId];
    const tx = await registry.registerProject(
      projectId,
      plant.name,
      moduleAddress,
      operator,
      meter,
      plant.design.designHash,
      params,
      { gasLimit: 800_000 },
    );
    await tx.wait();
    console.log(`Registered ${plant.plantId} (operator ${operator}, meter ${meter}): ${hashscanTx(config, tx.hash)}`);
  }

  const guard = config.poolGuard;
  if (guard) {
    const current = await market.poolGuard();
    if (current.pool.toLowerCase() !== guard.pool.toLowerCase() || current.enabled !== guard.enabled) {
      const tx = await market.setPoolGuard(
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
      console.log(
        `SaucerSwap pool guard ${guard.pool} (${guard.enabled ? "enforced" : "stored, not enforced"}; ${guard.note}): ${hashscanTx(config, tx.hash)}`,
      );
    }
  }

  // Key split last, so every admin step above has already run with the deployer.
  const verifierRole = await registry.VERIFIER_ROLE();
  if (process.env.VERIFIER_ADDRESS) {
    const verifier = evmAddress(process.env.VERIFIER_ADDRESS);
    if (verifier.toLowerCase() === operator.toLowerCase()) {
      throw new Error("VERIFIER_ADDRESS must not be the plant operator: the registry rejects its approvals.");
    }
    if (!(await registry.hasRole(verifierRole, verifier))) {
      const tx = await registry.grantRole(verifierRole, verifier, { gasLimit: 200_000 });
      await tx.wait();
      console.log(`Granted VERIFIER_ROLE to the VVB key ${verifier}: ${hashscanTx(config, tx.hash)}`);
    }
  } else if (!live) {
    console.log("Local chain: no VERIFIER_ADDRESS, so nothing can be attested until a VVB key is granted.");
  }
  if (process.env.ADMIN_ADDRESS) {
    const admin = evmAddress(process.env.ADMIN_ADDRESS);
    if (admin.toLowerCase() !== deployer.toLowerCase()) {
      for (const contract of [registry, market] as const) {
        const name = contract === registry ? "DmrvRegistry" : "CreditMarket";
        if (!(await contract.hasRole(adminRole, admin))) {
          const tx = await contract.grantRole(adminRole, admin, { gasLimit: 200_000 });
          await tx.wait();
          console.log(
            `Granted ${name} DEFAULT_ADMIN_ROLE to ${process.env.ADMIN_ADDRESS}: ${hashscanTx(config, tx.hash)}`,
          );
        }
        const tx = await contract.renounceRole(adminRole, deployer, { gasLimit: 200_000 });
        await tx.wait();
        console.log(`The deployer renounced ${name} DEFAULT_ADMIN_ROLE: ${hashscanTx(config, tx.hash)}`);
      }
    }
  }
};

setupDmrv.tags = ["DmrvRegistrySetup"];
setupDmrv.dependencies = ["DmrvRegistry"];
export default setupDmrv;
