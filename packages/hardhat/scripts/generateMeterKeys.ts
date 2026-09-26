/**
 * Generates one secp256k1 meter key per plant and writes them to the gitignored
 * `packages/hardhat/.secrets/meters.<network>.json` (mode 0600). Prints addresses only.
 *
 *   yarn hardhat:meter-keys --network hederaTestnet [PLANT-ID ...]
 *
 * The deploy registers these addresses. The private keys belong on the plants' data loggers (or, for the hosted
 * demo, in the server's encrypted METER_PRIVATE_KEYS env). A server-held key is still not a hardware meter.
 * Existing keys are kept; delete the file to rotate (then call `setMeter` on the registry).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Wallet } from "ethers";
import { DEMO_PLANTS } from "../utils/demoPlants";
import { SECRETS_DIR, meterFileFor } from "../utils/meterKeys";

function main() {
  const args = process.argv.slice(2);
  const networkIndex = args.indexOf("--network");
  const network = networkIndex >= 0 ? args[networkIndex + 1] : (process.env.HARDHAT_NETWORK ?? "hederaTestnet");
  const plantIds = args.filter((a, i) => !a.startsWith("--") && (networkIndex < 0 || i !== networkIndex + 1));
  const ids = plantIds.length ? plantIds : DEMO_PLANTS.map(p => p.plantId);

  mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const file = meterFileFor(network);
  const existing = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, { address: string; privateKey: string }>)
    : {};
  for (const id of ids) {
    if (existing[id]) continue;
    const wallet = Wallet.createRandom();
    existing[id] = { address: wallet.address, privateKey: wallet.privateKey };
  }
  writeFileSync(file, JSON.stringify(existing, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`Meter keys for ${network} in ${file} (keep it private; it is gitignored):`);
  for (const id of ids) console.log(`  ${id}: ${existing[id].address}`);
  console.log(
    "\nFor the hosted demo, set METER_PRIVATE_KEYS on the server (encrypted env) to a JSON map {plantId: privateKey}.",
  );
}

main();
