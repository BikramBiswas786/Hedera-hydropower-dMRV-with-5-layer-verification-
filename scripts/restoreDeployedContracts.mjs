/**
 * Restores packages/nextjs/contracts/deployedContracts.ts to the committed revision when a local
 * (`yarn deploy --network localhost`) run has injected chain 31337. Without this, the Next app
 * defaults to the local chain in development and some tests that expect the committed testnet
 * addresses fail.
 *
 * Safe no-op outside a git checkout or when the file is already clean.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "packages/nextjs/contracts/deployedContracts.ts");

function hasLocalChain(source) {
  return /\b31337\s*:/.test(source);
}

function main() {
  if (!existsSync(TARGET)) {
    console.log("restoreDeployedContracts: no deployedContracts.ts, skipping");
    return;
  }
  const source = readFileSync(TARGET, "utf8");
  if (!hasLocalChain(source)) {
    console.log("restoreDeployedContracts: no local chain 31337 in deployedContracts.ts");
    return;
  }
  if (!existsSync(join(ROOT, ".git"))) {
    console.warn(
      "restoreDeployedContracts: chain 31337 present but this is not a git checkout; run yarn reset:local after cloning if tests fail",
    );
    return;
  }
  try {
    execFileSync("git", ["checkout", "--", "packages/nextjs/contracts/deployedContracts.ts"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    console.log("restoreDeployedContracts: restored committed deployedContracts.ts (removed local 31337)");
  } catch (error) {
    console.warn(
      `restoreDeployedContracts: git checkout failed (${error instanceof Error ? error.message : error}); tests may target the local chain`,
    );
  }
}

main();
