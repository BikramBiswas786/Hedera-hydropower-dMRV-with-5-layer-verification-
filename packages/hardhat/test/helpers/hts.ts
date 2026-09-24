import { artifacts, network, ethers } from "hardhat";

export const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";

/**
 * Installs MockHederaTokenService at 0x167 unless something already lives there.
 * With `HEDERA_FORKING=true` the @hashgraph/system-contracts-forking plugin provides the real HTS emulation,
 * so the same tests run against it unchanged.
 */
export async function ensureHts(): Promise<{ mocked: boolean }> {
  const { deployedBytecode } = await artifacts.readArtifact("MockHederaTokenService");
  const existing = await ethers.provider.getCode(HTS_ADDRESS);
  if (existing === "0x") {
    await network.provider.send("hardhat_setCode", [HTS_ADDRESS, deployedBytecode]);
    return { mocked: true };
  }
  return { mocked: existing === deployedBytecode };
}

export async function mockHts() {
  return ethers.getContractAt("MockHederaTokenService", HTS_ADDRESS);
}
