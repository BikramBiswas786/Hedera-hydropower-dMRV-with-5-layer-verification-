import committed from "./deployedContracts";
import local from "./deployedContracts.local";

/**
 * Chain 31337 is written to a gitignored file. Tests and production builds must keep reading the
 * committed testnet addresses, or a local deploy makes `yarn test` fail on the next run.
 */
export function contractsForRuntime<C extends Record<PropertyKey, unknown>, L extends Record<PropertyKey, unknown>>(
  committedContracts: C,
  localContracts: L,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): C | (C & L) {
  if (nodeEnv === "development") return { ...committedContracts, ...localContracts };
  return committedContracts;
}

const deployedContracts = contractsForRuntime(committed, local) as typeof committed;

export default deployedContracts;
