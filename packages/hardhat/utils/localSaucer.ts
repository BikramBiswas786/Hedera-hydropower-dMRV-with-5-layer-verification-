import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { PoolGuardConfig } from "./hydroNetworkConfig";

/**
 * Local chains have no SaucerSwap, so the deploy installs stand-ins with the same interfaces: a factory that knows
 * one WHBAR/USD pair, the pair priced at the mock oracle's $0.25, and a router that accepts the swap and records the
 * seller's USD payout without moving a token. That lets `yarn deploy --network localhost` end with a market a
 * browser can actually buy from. Hedera networks use the real SaucerSwap addresses in `hydroNetworkConfig.ts`.
 */
// The testnet WHBAR address, which is also what the app's DEX check (`services/mrv/server/dex.ts`) expects.
export const LOCAL_WHBAR = "0x0000000000000000000000000000000000003aD2";
export const LOCAL_USD = "0x0000000000000000000000000000000000001549";
const USD_RESERVE = 250_000n * 10n ** 6n; // 250,000 USD (6 decimals) …
const WHBAR_RESERVE = 1_000_000n * 10n ** 8n; // … against 1,000,000 WHBAR (8 decimals): $0.25, the mock oracle

export async function deployLocalSaucer(hre: HardhatRuntimeEnvironment, deployer: string) {
  const { deploy } = hre.deployments;
  const signer = await hre.ethers.getSigner(deployer);
  const factory = await deploy("MockSaucerFactory", { from: deployer, log: true, autoMine: true });
  const router = await deploy("MockSaucerRouter", { from: deployer, log: true, autoMine: true });
  const pair = await deploy("MockSaucerSwapV1Pair", {
    from: deployer,
    args: [LOCAL_USD, LOCAL_WHBAR],
    log: true,
    autoMine: true,
  });
  if (pair.newlyDeployed) {
    const pool = await hre.ethers.getContractAt("MockSaucerSwapV1Pair", pair.address, signer);
    await (await pool.setReserves(USD_RESERVE, WHBAR_RESERVE)).wait();
    await (await pool.setFactory(factory.address)).wait();
    const registry = await hre.ethers.getContractAt("MockSaucerFactory", factory.address, signer);
    await (await registry.setPair(LOCAL_USD, LOCAL_WHBAR, pair.address)).wait();
  }
  return { saucerFactory: factory.address, saucerRouter: router.address };
}

/** The pool guard for the local stand-in pair, or undefined when none was deployed (Hedera networks). */
export async function localPoolGuard(hre: HardhatRuntimeEnvironment): Promise<PoolGuardConfig | undefined> {
  const pair = await hre.deployments.getOrNull("MockSaucerSwapV1Pair");
  if (!pair) return undefined;
  return {
    pool: pair.address,
    isV2: false,
    whbar: LOCAL_WHBAR,
    whbarDecimals: 8,
    usdDecimals: 6,
    maxDeviationBps: 300,
    minLiquidity: 10_000n * 10n ** 6n,
    enabled: true,
    note: "local stand-in pair at the mock oracle price",
  };
}
