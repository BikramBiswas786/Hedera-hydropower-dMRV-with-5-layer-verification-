import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { type PoolGuardConfig, getHydroNetworkConfig, hashscanTx } from "./hydroNetworkConfig";

/** Pins `guard` on a `UsdSettlement` contract unless it already names that pool. `setPoolGuard` asks the factory. */
export async function pinPoolGuard(
  hre: HardhatRuntimeEnvironment,
  name: "UsdCheckout" | "CreditMarket",
  address: string,
  guard: PoolGuardConfig,
) {
  const { deployer } = await hre.getNamedAccounts();
  const contract = await hre.ethers.getContractAt(name, address, await hre.ethers.getSigner(deployer));
  if ((await contract.poolGuard()).pool.toLowerCase() === guard.pool.toLowerCase()) return;
  const tx = await contract.setPoolGuard(
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
  console.log(`${name} pool guard ${guard.pool}: ${hashscanTx(getHydroNetworkConfig(hre), tx.hash)}`);
}
