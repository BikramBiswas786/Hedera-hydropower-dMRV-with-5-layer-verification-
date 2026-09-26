import { takeSnapshot, type SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Restores the chain (and its clock) after the enclosing `describe`, so suites that jump years ahead (crediting
 * renewals, the 2027 five-year rule) cannot leave later suites registering projects in the future.
 */
export function isolateClock() {
  let snapshot: SnapshotRestorer;
  before(async () => {
    snapshot = await takeSnapshot();
  });
  after(async () => {
    await snapshot.restore();
  });
}
