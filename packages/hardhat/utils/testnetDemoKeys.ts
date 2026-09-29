import { Wallet, concat, getBytes, keccak256, toUtf8Bytes } from "ethers";

/**
 * The testnet demo's meter and VVB keys, derived from the deployer's private key so they stay secret (only the
 * deployer secret can recompute them) yet reproducible in CI. They are labelled demo keys: one person holds them all,
 * which is exactly what a real deployment must not do (separate data loggers, an accredited VVB). Local chains use
 * the public derivations in `meterKeys.ts` and `validation.ts` instead.
 */
function derive(deployerKey: string, label: string): Wallet {
  const key = deployerKey.startsWith("0x") ? deployerKey : `0x${deployerKey}`;
  return new Wallet(keccak256(concat([getBytes(key), toUtf8Bytes(`hydro-dmrv testnet ${label}`)])));
}

export const testnetMeter = (deployerKey: string, plantId: string) => derive(deployerKey, `meter ${plantId}`);
export const testnetVvb = (deployerKey: string) => derive(deployerKey, "demo vvb");
/** A separate buyer, so the testnet purchase is not the seller buying from itself. */
export const testnetBuyer = (deployerKey: string) => derive(deployerKey, "demo buyer");
