/**
 * Contract-size guard. Fails when any deployable contract's runtime bytecode exceeds SIZE_FAIL_BYTES (default
 * 24,064 B, 512 B under the EIP-170 limit of 24,576 B so a small fix cannot push a contract over the edge on
 * redeploy) and warns above SIZE_WARN_BYTES (default 21,504 B). Within SIZE_MARGIN_BYTES of the fail limit
 * (default 256 B) the line is `tight`: it prints and does not fail. Mocks, the legacy registry and libraries from
 * node_modules are skipped.
 *
 *   yarn hardhat:size            (from the repo root; compiles first)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const FAIL = Number(process.env.SIZE_FAIL_BYTES ?? 24_064);
const WARN = Number(process.env.SIZE_WARN_BYTES ?? 21_504);
const MARGIN = Number(process.env.SIZE_MARGIN_BYTES ?? 256);
const ROOT = join(__dirname, "..", "artifacts", "contracts");
const SKIP = [/^mocks\//, /^legacy\//, /^interfaces\//];

export type SizeStatus = "FAIL" | "tight" | "warn" | "ok";

/** `tight` is under the fail limit but inside the soft margin. Equal to the limit is tight, not a failure. */
export function sizeStatus(bytes: number, fail = FAIL, warn = WARN, margin = MARGIN): SizeStatus {
  if (bytes > fail) return "FAIL";
  if (fail - bytes < margin) return "tight";
  if (bytes > warn) return "warn";
  return "ok";
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return name.endsWith(".json") && !name.endsWith(".dbg.json") ? [path] : [];
  });
}

export function contractSizes(): { name: string; source: string; bytes: number }[] {
  if (!existsSync(ROOT)) throw new Error("No artifacts: run `yarn hardhat:compile` first.");
  return walk(ROOT)
    .map(path => {
      const artifact = JSON.parse(readFileSync(path, "utf8"));
      const hex: string = artifact.deployedBytecode ?? "0x";
      return {
        name: artifact.contractName as string,
        source: artifact.sourceName as string,
        bytes: (hex.length - 2) / 2,
      };
    })
    .filter(({ source, bytes }) => bytes > 0 && !SKIP.some(re => re.test(relative("contracts", source))));
}

if (require.main === module) {
  const sizes = contractSizes().sort((a, b) => b.bytes - a.bytes);
  let failed = false;
  let tight = false;
  for (const { name, bytes } of sizes) {
    const status = sizeStatus(bytes);
    const headroom = FAIL - bytes;
    if (status === "FAIL") failed = true;
    if (status === "tight") tight = true;
    const note =
      status === "tight"
        ? `  (${headroom.toLocaleString("en-US")} B left)`
        : status === "FAIL"
          ? `  (${(bytes - FAIL).toLocaleString("en-US")} B over)`
          : "";
    console.log(`${status.padEnd(5)} ${name.padEnd(28)} ${bytes.toLocaleString("en-US").padStart(7)} B${note}`);
  }
  console.log(
    `limit ${FAIL.toLocaleString("en-US")} B (EIP-170 is 24,576 B); warn above ${WARN.toLocaleString("en-US")} B; tight when under ${MARGIN} B of the limit`,
  );
  if (tight && !failed) {
    console.warn("Headroom is under the soft margin. Shrink that contract before adding to it. This is not a failure.");
  }
  if (failed) {
    console.error("Contract size guard failed.");
    process.exit(1);
  }
}
