import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { Wallet, ZeroHash, id, keccak256, toUtf8Bytes } from "ethers";

import { encodeEnergy, registryDomain, signAttestation } from "../utils/attestation";
import { DEMO_PLANTS } from "../utils/demoPlants";
import { LIVE_NETWORKS, demoMeterAddress } from "../utils/meterKeys";

/**
 * Local chains only: leaves `yarn deploy --network localhost` with something to buy. It grants VERIFIER_ROLE to a
 * PUBLIC local VVB key, submits one hour of the first demo plant's output signed by its public demo meter key and
 * that VVB, and lists the minted credits on `CreditMarket` at $15/t. Both keys are derived from fixed strings, so
 * this step refuses to run on a Hedera network, and the deploy's key checks refuse demo meters there too.
 */
export const LOCAL_VVB = new Wallet(keccak256(toUtf8Bytes("hydro-dmrv demo vvb local")));
const LOCAL_AUDIT_TOPIC = 1n; // no HCS on a local chain; any non-zero topic number satisfies the registry
const PRICE_USD_CENTS_PER_TONNE = 1_500n;

const seedLocalDemo: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (LIVE_NETWORKS.has(hre.network.name)) return;
  const { deployer } = await hre.getNamedAccounts();
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

  const plant = DEMO_PLANTS[0];
  const projectId = hre.ethers.encodeBytes32String(plant.plantId);
  const project = await registry.getProject(projectId);
  const meter = new Wallet(keccak256(toUtf8Bytes(`hydro-dmrv demo meter ${plant.plantId}`)));
  if (project.meter.toLowerCase() !== demoMeterAddress(plant.plantId).toLowerCase()) {
    console.log(`Local demo: ${plant.plantId} is registered with a non-demo meter; not minting.`);
    return;
  }

  if (project.attestations === 0n) {
    const verifierRole = await registry.VERIFIER_ROLE();
    if (!(await registry.hasRole(verifierRole, LOCAL_VVB.address))) {
      await (await registry.grantRole(verifierRole, LOCAL_VVB.address)).wait();
    }
    if ((await registry.auditTopic()) === 0n) await (await registry.setAuditTopic(LOCAL_AUDIT_TOPIC)).wait();

    // The last hour before the latest block: 450 kWh net of 460 kWh gross, one reading a minute.
    const periodEnd = BigInt((await hre.ethers.provider.getBlock("latest"))!.timestamp);
    const energy = encodeEnergy({ netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n });
    const { chainId } = await hre.ethers.provider.getNetwork();
    const submission = await signAttestation(
      registryDomain(chainId, await registry.getAddress()),
      {
        projectId,
        sequence: 0,
        intervals: 60,
        intervalSeconds: 60,
        readingsDigest: id(`local demo readings ${plant.plantId}`),
        reportHash: id(`local demo report ${plant.plantId}`),
        hcsTopicNum: (await registry.auditTopic()) || LOCAL_AUDIT_TOPIC,
        hcsSequence: 1n,
        evidenceHash: ZeroHash,
        measurement: { periodStart: periodEnd - 3_600n, periodEnd, metered: energy, verified: energy },
      },
      meter,
      LOCAL_VVB,
    );
    await (await registry.submitAttestation(submission)).wait();
    console.log(`Local demo: minted ${await registry.custodyBalanceOf(project.operator)} kg to ${project.operator}`);
  }

  const listings = await market.getListings(0, await market.listingCount());
  const custody = await registry.custodyBalanceOf(deployer);
  if (!listings.some(l => l.active) && custody > 0n && project.operator.toLowerCase() === deployer.toLowerCase()) {
    await (await market.createListing(custody, PRICE_USD_CENTS_PER_TONNE)).wait();
    console.log(`Local demo: listed ${custody} kg at $${Number(PRICE_USD_CENTS_PER_TONNE) / 100}/t on CreditMarket`);
  }
};

seedLocalDemo.tags = ["LocalDemo"];
seedLocalDemo.dependencies = ["DmrvRegistry"];
export default seedLocalDemo;
