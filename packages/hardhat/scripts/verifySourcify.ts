/**
 * Verifies every hardhat-deploy deployment of a network on Sourcify through its v2 API, using the exact compiler input
 * hardhat-deploy stored for each deployment (`deployments/<network>/solcInputs/<hash>.json`). The v1 endpoints that
 * `hardhat verify` (hardhat-verify 2.x) calls were retired, so `yarn hardhat:verify:testnet` fails with HH306/HTML.
 *
 *   yarn workspace @sh/hardhat verify:sourcify hederaTestnet
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const SOURCIFY = process.env.SOURCIFY_SERVER_URL ?? "https://sourcify.dev/server";
const CHAIN_IDS: Record<string, number> = { hederaTestnet: 296, hederaMainnet: 295 };

type Deployment = { address: string; solcInputHash: string; metadata: string };
type Match = { match: string | null };

async function verify(network: string, name: string, deployment: Deployment, chainId: number) {
  const dir = join(__dirname, "..", "deployments", network);
  const current = (await (await fetch(`${SOURCIFY}/v2/contract/${chainId}/${deployment.address}`)).json()) as Match;
  if (current.match === "exact_match") return `${name} ${deployment.address}: already exact_match`;
  const metadata = JSON.parse(deployment.metadata);
  const [source, contract] = Object.entries(metadata.settings.compilationTarget as Record<string, string>)[0];
  const response = await fetch(`${SOURCIFY}/v2/verify/${chainId}/${deployment.address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: JSON.parse(readFileSync(join(dir, "solcInputs", `${deployment.solcInputHash}.json`), "utf8")),
      compilerVersion: `v${String(metadata.compiler.version).replace(/^v/, "")}`,
      contractIdentifier: `${source}:${contract}`,
    }),
  });
  const { verificationId } = (await response.json()) as { verificationId?: string };
  if (!verificationId) return `${name} ${deployment.address}: submission failed (HTTP ${response.status})`;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5_000));
    const job = (await (await fetch(`${SOURCIFY}/v2/verify/${verificationId}`)).json()) as {
      isJobCompleted: boolean;
      contract: Match;
      error?: { customCode: string; message: string };
    };
    if (job.isJobCompleted) {
      return job.contract.match
        ? `${name} ${deployment.address}: ${job.contract.match}`
        : `${name} ${deployment.address}: ${job.error?.customCode ?? "failed"} (${job.error?.message ?? ""})`;
    }
  }
  return `${name} ${deployment.address}: still pending (job ${verificationId})`;
}

async function main() {
  const network = process.argv[2] ?? "hederaTestnet";
  const chainId = CHAIN_IDS[network];
  if (!chainId) throw new Error(`Unknown network ${network}. Use one of: ${Object.keys(CHAIN_IDS).join(", ")}`);
  const dir = join(__dirname, "..", "deployments", network);
  if (!existsSync(dir))
    throw new Error(`No deployments for ${network}. Run \`yarn deploy --network ${network}\` first.`);
  const explorer = network === "hederaMainnet" ? "mainnet" : "testnet";
  for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const name = file.replace(/\.json$/, "");
    const deployment = JSON.parse(readFileSync(join(dir, file), "utf8")) as Deployment;
    console.log(await verify(network, name, deployment, chainId));
    console.log(`  https://hashscan.io/${explorer}/contract/${deployment.address}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
