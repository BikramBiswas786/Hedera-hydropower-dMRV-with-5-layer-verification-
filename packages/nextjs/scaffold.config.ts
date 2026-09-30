import * as chains from "viem/chains";
import deployedContracts from "~~/contracts/withLocal";
import type { GenericContractsDeclaration } from "~~/utils/scaffold-hbar/contract";

export type ScaffoldConfig = {
  targetNetworks: readonly [chains.Chain, ...chains.Chain[]];
  pollingInterval: number;
  rpcOverrides?: Record<number, string>;
  enableBurnerWallet: boolean;
  walletConnectProjectId: string;
};

/** Shared scaffold-eth id. HashPack's WalletConnect verify marks every site that reuses it as a malicious dapp. */
export const SHARED_WALLET_CONNECT_PROJECT_ID = "3a8170812b534d0ff9d794f19a901d64";

const configuredWalletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID?.trim() ?? "";

/** True only when the deployment sets its own WalletConnect project id. */
export const walletConnectEnabled =
  configuredWalletConnectProjectId.length > 0 && configuredWalletConnectProjectId !== SHARED_WALLET_CONNECT_PROJECT_ID;

const hederaLocalFork = {
  ...chains.hardhat,
  name: "Hedera Local Fork",
  nativeCurrency: {
    name: "HBAR",
    symbol: "HBAR",
    // Note: HBAR has 8 protocol decimals (tinybar),
    // but JSON-RPC msg.value & gasPrice use 18 decimals for EVM compatibility.
    // We keep 18 here so tx.value formatting matches what viem/hardhat return.
    decimals: 18,
  },
} as const satisfies chains.Chain;

// The first network is the default wallet network and the one server routes and MCP tools read the registry from.
const hederaFirst = [chains.hederaTestnet, chains.hedera, hederaLocalFork] as const satisfies readonly [
  chains.Chain,
  ...chains.Chain[],
];

// `yarn deploy --network localhost` writes chain 31337 to the gitignored deployedContracts.local.ts.
// `yarn start` merges it and targets it. Tests and production builds do not. NEXT_PUBLIC_TARGET_NETWORK
// overrides that.
const requested = process.env.NEXT_PUBLIC_TARGET_NETWORK;
const hasLocalDeploy = (deployedContracts as GenericContractsDeclaration)[hederaLocalFork.id] !== undefined;
const localFirst = requested ? requested === "local" : process.env.NODE_ENV !== "production" && hasLocalDeploy;

// Contract types are keyed on the Hedera-first order, so the local order keeps that type.
const targetNetworks = (
  localFirst ? [hederaLocalFork, chains.hederaTestnet, chains.hedera] : hederaFirst
) as typeof hederaFirst;

const scaffoldConfig = {
  targetNetworks,

  pollingInterval: 10000,

  enableBurnerWallet: true,

  rpcOverrides: {
    [chains.hedera.id]: process.env.NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL || "https://mainnet.hashio.io/api",
    [chains.hederaTestnet.id]: process.env.NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
  },

  walletConnectProjectId: walletConnectEnabled ? configuredWalletConnectProjectId : SHARED_WALLET_CONNECT_PROJECT_ID,
} as const satisfies ScaffoldConfig;

// The `as typeof hederaFirst` cast above hides the local chain from the type, so compare through number.
export const localChainIsDefault = (targetNetworks[0].id as number) === hederaLocalFork.id;

export default scaffoldConfig;
