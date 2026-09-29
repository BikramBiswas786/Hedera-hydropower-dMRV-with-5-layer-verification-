import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { Wallet, ZeroHash, id, keccak256, sha256, toUtf8Bytes } from "ethers";

import {
  DECISION_APPROVED,
  encodeEnergy,
  registryDomain,
  signSubmission,
  signVerification,
} from "../utils/attestation";
import { DEMO_PLANTS } from "../utils/demoPlants";
import { LIVE_NETWORKS, demoMeterAddress } from "../utils/meterKeys";
import { LOCAL_VVB } from "../utils/validation";

/**
 * Local chains only: leaves `yarn deploy --network localhost` with something to buy. It records one hour of the
 * first demo plant's output signed by its public demo meter key, has the PUBLIC local VVB key verify that record,
 * and lists the issued credits on `CreditMarket` at $15/t. Both keys are derived from fixed strings, so this step
 * refuses to run on a Hedera network, and the deploy's key checks refuse demo meters there too.
 */
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
    const domain = registryDomain(chainId, await registry.getAddress());
    const topic = (await registry.auditTopic()) || LOCAL_AUDIT_TOPIC;
    const submission = await signSubmission(
      domain,
      {
        projectId,
        sequence: 0,
        intervals: 60,
        intervalSeconds: 60,
        readingsDigest: id(`local demo readings ${plant.plantId}`),
        reportHash: id(`local demo report ${plant.plantId}`),
        hcsTopicNum: topic,
        hcsSequence: 1n,
        measurement: { periodStart: periodEnd - 3_600n, periodEnd, metered: energy, verified: energy },
      },
      meter,
    );
    // The operator (the deployer here) records the period; nothing is issued until the VVB verifies it.
    await (await registry.recordMonitoring(submission)).wait();
    const head = (await registry.getProject(projectId)).recordsHash;
    const statement = {
      projectId,
      firstRecord: 0,
      lastRecord: 0,
      recordsHash: head,
      deductionG: 0n,
      reportHash: sha256(toUtf8Bytes(`local demo verification report ${plant.plantId}`)),
      hcsTopicNum: topic,
      hcsSequence: 2n,
      evidenceHash: ZeroHash,
      decision: DECISION_APPROVED,
    };
    await (await registry.verifyPeriod(statement, await signVerification(domain, statement, LOCAL_VVB))).wait();
    console.log(`Local demo: issued ${await registry.custodyBalanceOf(project.operator)} kg to ${project.operator}`);
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
