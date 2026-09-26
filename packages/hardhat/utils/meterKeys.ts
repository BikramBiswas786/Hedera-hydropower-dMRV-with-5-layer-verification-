import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { computeAddress, getAddress, keccak256, toUtf8Bytes } from "ethers";

/** Networks where a demo-derived (public) meter key must never be registered. */
export const LIVE_NETWORKS = new Set(["hederaTestnet", "hederaMainnet"]);

export const SECRETS_DIR = join(__dirname, "..", ".secrets");

/** Address of the PUBLIC demo meter key `keccak256("hydro-dmrv demo meter " + plantId)`. Local chains only. */
export function demoMeterAddress(plantId: string): string {
  return computeAddress(keccak256(toUtf8Bytes(`hydro-dmrv demo meter ${plantId}`)));
}

export function meterFileFor(network: string): string {
  return join(SECRETS_DIR, `meters.${network}.json`);
}

type MeterFile = Record<string, { address: string; privateKey?: string }>;

/**
 * Meter addresses for `plantIds`, from (in order) the METER_ADDRESSES env (JSON `{plantId: address}`), the
 * gitignored `.secrets/meters.<network>.json` written by `yarn hardhat:meter-keys`, or, on local chains only,
 * the public demo derivation. On a live network it throws when a plant has no meter or when any meter equals the
 * public demo derivation, so credits can never be minted on Hedera against a key anyone can compute.
 */
export function resolveMeterAddresses(
  network: string,
  plantIds: string[],
  env: NodeJS.ProcessEnv = process.env,
  file: string = meterFileFor(network),
): Record<string, string> {
  const live = LIVE_NETWORKS.has(network);
  let source: Record<string, string> = {};
  if (env.METER_ADDRESSES?.trim()) {
    source = JSON.parse(env.METER_ADDRESSES) as Record<string, string>;
  } else if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as MeterFile;
    source = Object.fromEntries(Object.entries(parsed).map(([id, entry]) => [id, entry.address]));
  }
  const resolved: Record<string, string> = {};
  for (const plantId of plantIds) {
    const configured = source[plantId];
    if (!configured) {
      if (live) {
        throw new Error(
          `No meter address for ${plantId} on ${network}. Run \`yarn hardhat:meter-keys --network ${network}\` or set METER_ADDRESSES.`,
        );
      }
      resolved[plantId] = demoMeterAddress(plantId);
      continue;
    }
    const address = getAddress(configured);
    if (live && address === demoMeterAddress(plantId)) {
      throw new Error(
        `Refusing the public demo meter ${address} for ${plantId} on ${network}: its private key is derivable from the plant id.`,
      );
    }
    resolved[plantId] = address;
  }
  return resolved;
}
