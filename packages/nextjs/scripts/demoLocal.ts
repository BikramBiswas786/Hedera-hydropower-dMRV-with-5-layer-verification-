/**
 * One local pass: chain (if it is down), deploy, three engine decisions, one buy-and-retire.
 *
 *   yarn demo
 *   yarn start          # started below. Polling, so it does not need a higher inotify limit.
 *
 * Chain 31337 is written to the gitignored local file. The committed testnet addresses stay.
 */
import { assertDemoEngines } from "./engineCheck";
import { spawn } from "node:child_process";
import fs, { openSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, createPublicClient, createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RPC = "http://127.0.0.1:8545";

function yarnCommand(): string {
  return process.platform === "win32" ? "yarn.cmd" : "yarn";
}

function portOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Nothing accepted connections on 127.0.0.1:${port} within ${timeoutMs / 1000}s`);
}

function startChain(): void {
  const logPath = path.join(os.tmpdir(), "hydro-dmrv-chain.log");
  const log = openSync(logPath, "a");
  const child = spawn(yarnCommand(), ["chain:offline"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
    shell: process.platform === "win32",
  });
  child.unref();
  console.log(`Started yarn chain:offline (log: ${logPath})`);
}

function yarnSync(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(yarnCommand(), args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`yarn ${args.join(" ")} exited ${code}`));
    });
  });
}

const marketAbi = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "units", type: "uint64" },
    ],
    outputs: [{ name: "nativeCost", type: "uint256" }],
  },
  {
    type: "function",
    name: "buyAndRetire",
    stateMutability: "payable",
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "units", type: "uint64" },
      { name: "beneficiary", type: "string" },
    ],
    outputs: [{ name: "retirementId", type: "uint256" }],
  },
] as const;

const registryAbi = [
  {
    type: "function",
    name: "retirementCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function buyTenKg(): Promise<void> {
  const deployments = path.join(root, "packages/hardhat/deployments/localhost");
  const marketAddress = (
    JSON.parse(fs.readFileSync(path.join(deployments, "CreditMarket.json"), "utf8")) as { address: Address }
  ).address;
  const registryAddress = (
    JSON.parse(fs.readFileSync(path.join(deployments, "DmrvRegistry.json"), "utf8")) as { address: Address }
  ).address;
  const transport = http(RPC);
  const publicClient = createPublicClient({ chain: hardhat, transport });
  const wallet = createWalletClient({ chain: hardhat, transport });
  const accounts = await wallet.getAddresses();
  const buyer = accounts[2];
  if (!buyer) throw new Error("The local node did not expose a buyer account");
  const quote = await publicClient.readContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "quote",
    args: [0n, 10n],
  });
  const hash = await wallet.writeContract({
    account: buyer,
    address: marketAddress,
    abi: marketAbi,
    functionName: "buyAndRetire",
    args: [0n, 10n, "local demo"],
    value: quote,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const retirements = await publicClient.readContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: "retirementCount",
  });
  console.log(`buyAndRetire ${hash} status ${receipt.status} retirements ${retirements}`);
  if (receipt.status !== "success") throw new Error("buyAndRetire reverted");
}

async function main(): Promise<void> {
  if (!(await portOpen(8545))) {
    startChain();
    await waitForPort(8545, 90_000);
  } else {
    console.log("Local chain already listening on 8545");
  }

  await yarnSync(["deploy", "--network", "localhost"]);
  assertDemoEngines();
  console.log("healthy APPROVED, inflated REJECTED, tampered REJECTED (yarn verify prints the reasons)");
  await buyTenKg();
  console.log(
    "The contract stores each HCS report's hash and sequence. It cannot read the message. yarn mrv:reproduce refuses a mismatch.",
  );

  if (process.env.DEMO_SKIP_APP === "1") {
    console.log("Next: yarn start, then http://localhost:3000/market");
    return;
  }

  if (!(await portOpen(3000))) {
    const logPath = path.join(os.tmpdir(), "hydro-dmrv-next.log");
    const log = openSync(logPath, "a");
    const child = spawn(yarnCommand(), ["start"], {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
      shell: process.platform === "win32",
      env: {
        ...process.env,
        WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? "1000",
        CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? "1",
      },
    });
    child.unref();
    console.log(`Started yarn start (log: ${logPath})`);
  }
  await waitForPort(3000, 180_000);
  const home = await fetch("http://127.0.0.1:3000/market");
  console.log(`http://localhost:3000/market ${home.status}`);
  if (!home.ok) throw new Error(`The market page returned ${home.status}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
