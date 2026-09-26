import generateTsAbis from "./scripts/generateTsAbis";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import { HardhatUserConfig, task } from "hardhat/config";
import "solidity-coverage";

dotenv.config();

// Only load the Hedera forking plugin when starting the local node (yarn hardhat:chain / yarn hardhat:fork).
// Deploying to an already-running node doesn't need it and would fail with EADDRINUSE.
if (process.env.HEDERA_FORKING === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional plugin load
  require("@hashgraph/system-contracts-forking/plugin");
}

// Hedera JSON-RPC URL (testnet default). Set HEDERA_RPC_URL in .env for mainnet.
const hederaRpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";

// Deployer key: run `yarn account:generate` or `yarn account:import`, or set __RUNTIME_DEPLOYER_PRIVATE_KEY at runtime.
// Live networks have no account unless a key is supplied. The well-known Hardhat key is not a fallback.
const deployerPrivateKey = process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          // The IR pipeline keeps DmrvRegistry under the 24 KB code limit (checked by `yarn hardhat:size`).
          viaIR: true,
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: hederaRpcUrl,
        enabled: process.env.HEDERA_FORKING === "true",
        // @ts-expect-error - custom property for hedera-forking plugin
        chainId: 296,
        workerPort: 10001,
      },
    },
    hederaTestnet: {
      url: "https://testnet.hashio.io/api",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      chainId: 296,
    },
    hederaMainnet: {
      url: "https://mainnet.hashio.io/api",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      chainId: 295,
    },
  },
  // Hedera is now supported on the main Sourcify instance (sourcify.dev).
  // No custom verifier URL required — standard tooling works out of the box.
  // See: https://hedera.com/blog/smart-contract-verification-sourcify-dev-now-supported
  sourcify: {
    enabled: true,
  },
  // Disable Etherscan verification (Hedera uses Sourcify only)
  etherscan: {
    enabled: false,
    apiKey: {},
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

// Extend the deploy task to also generate TypeScript ABIs after deployment.
task("deploy").setAction(async (args, hre, runSuper) => {
  await runSuper(args);
  await generateTsAbis(hre);
});

// Extend the verify task to show HashScan link after Sourcify verification.
task("verify").setAction(async (args, hre, runSuper) => {
  await runSuper(args);

  const address = args.address;
  const chainId = hre.network.config.chainId;

  if (address && (chainId === 295 || chainId === 296)) {
    const network = chainId === 295 ? "mainnet" : "testnet";
    console.log(`\nHashScan: https://hashscan.io/${network}/contract/${address}`);
  }
});

export default config;
