// Verifies deployed Hedera contracts on Sourcify from the Hardhat build-info of the commit they were deployed from.
//
//   node sourcify-verify.mjs <hardhat-dir> <chainId> Name@0xaddress [Name@0xaddress …]
//
// Sourcify reads constructor arguments from the creation transaction, so only the exact standard-JSON input is
// needed. HashScan then shows the contract as verified. No key is involved.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [hardhatDir, chainId, ...targets] = process.argv.slice(2);
const API = "https://sourcify.dev/server";
const buildInfoDir = join(hardhatDir, "artifacts", "build-info");
const buildInfos = readdirSync(buildInfoDir).map(f => JSON.parse(readFileSync(join(buildInfoDir, f), "utf8")));

async function json(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

let failed = 0;
for (const target of targets) {
  const [name, address] = target.split("@");
  const existing = await json(`${API}/v2/contract/${chainId}/${address}`);
  if (existing.status === 200 && existing.body?.match) {
    console.log(`${name} ${address}: already verified (${existing.body.match})`);
    continue;
  }
  const info = buildInfos.find(b =>
    Object.entries(b.output.contracts ?? {}).some(([, contracts]) => name in contracts),
  );
  if (!info) {
    console.log(`${name}: not in this commit's build`);
    failed++;
    continue;
  }
  const source = Object.keys(info.output.contracts).find(s => name in info.output.contracts[s]);
  const submitted = await json(`${API}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: info.input,
      compilerVersion: info.solcLongVersion,
      contractIdentifier: `${source}:${name}`,
    }),
  });
  if (!submitted.body?.verificationId) {
    console.log(`${name} ${address}: refused ${submitted.status} ${JSON.stringify(submitted.body).slice(0, 300)}`);
    failed++;
    continue;
  }
  let job;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3_000));
    job = (await json(`${API}/v2/verify/${submitted.body.verificationId}`)).body;
    if (job?.isJobCompleted) break;
  }
  const match = job?.contract?.match ?? null;
  console.log(
    match
      ? `${name} ${address}: ${match} — https://hashscan.io/${chainId === "295" ? "mainnet" : "testnet"}/contract/${address}`
      : `${name} ${address}: not verified ${JSON.stringify(job?.error ?? job).slice(0, 400)}`,
  );
  if (!match) failed++;
}
process.exitCode = failed ? 1 : 0;
