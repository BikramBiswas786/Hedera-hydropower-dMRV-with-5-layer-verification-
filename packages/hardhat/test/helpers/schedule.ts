import { artifacts, ethers, network } from "hardhat";

export const HSS_ADDRESS = "0x000000000000000000000000000000000000016b";

/** Installs MockHederaScheduleService at 0x16b unless something already lives there. */
export async function ensureSchedule(): Promise<void> {
  const { deployedBytecode } = await artifacts.readArtifact("MockHederaScheduleService");
  const existing = await ethers.provider.getCode(HSS_ADDRESS);
  if (existing === "0x") {
    await network.provider.send("hardhat_setCode", [HSS_ADDRESS, deployedBytecode]);
  }
}

export async function mockSchedule() {
  return ethers.getContractAt("MockHederaScheduleService", HSS_ADDRESS);
}

/** Sends the last recorded schedule bytes as the payer. That is the call Hedera makes after the payer signs. */
export async function fireLastSchedule(checkout: string) {
  const hss = await mockSchedule();
  const index = (await hss.callCount()) - 1n;
  const data = await hss.scheduledData(index);
  const payer = await hss.scheduledPayer(index);
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [payer] });
  const signer = await ethers.getSigner(payer);
  return signer.sendTransaction({ to: checkout, data });
}
