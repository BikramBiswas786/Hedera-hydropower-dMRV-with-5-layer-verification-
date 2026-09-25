import type { MeterDomain } from "./provenance";
import { zeroAddress } from "viem";
import { hedera, hederaTestnet } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";
import type { GenericContractsDeclaration } from "~~/utils/scaffold-hbar/contract";

/** The chain the registry lives on for server routes, MCP tools and the default wallet network. */
export const HYDRO_CHAIN_ID: number = scaffoldConfig.targetNetworks[0].id;

export const HEDERA_NETWORK: "mainnet" | "testnet" = HYDRO_CHAIN_ID === hedera.id ? "mainnet" : "testnet";

export const MIRROR_NODE_URL =
  process.env.NEXT_PUBLIC_MIRROR_NODE_URL ?? `https://${HEDERA_NETWORK}.mirrornode.hedera.com`;

const HASHSCAN = `https://hashscan.io/${HEDERA_NETWORK}`;

export const hashscan = {
  transaction: (id: string) => `${HASHSCAN}/transaction/${id}`,
  contract: (address: string) => `${HASHSCAN}/contract/${address}`,
  token: (address: string) => `${HASHSCAN}/token/${evmToEntityId(address) ?? address}`,
  nft: (address: string, serial: number) => `${HASHSCAN}/token/${evmToEntityId(address) ?? address}/${serial}`,
  topic: (topicId: string) => `${HASHSCAN}/topic/${topicId}`,
  topicMessage: (topicId: string, sequence: number | string) => `${HASHSCAN}/topic/${topicId}/message/${sequence}`,
};

/** HTS tokens and other Hedera entities use long-zero EVM addresses: 0x000…0<entity num>. */
export function evmToEntityId(address: string): string | null {
  return /^0x0{24}[0-9a-f]{16}$/i.test(address) ? `0.0.${BigInt(address)}` : null;
}

type Deployed = typeof deployedContracts;
type DeployedName = "HydroCreditRegistry" | "ResilientHbarUsdFeed";
type EntryOf<Name extends DeployedName> = {
  [Id in keyof Deployed]: Deployed[Id] extends Record<Name, infer C> ? C : never;
}[keyof Deployed];
/** ABI of whichever chain has the contract deployed, independent of which network is configured first. */
export type DeployedAbi<Name extends DeployedName> = EntryOf<Name> extends { abi: infer A } ? A : never;
export type RegistryAbi = DeployedAbi<"HydroCreditRegistry">;

export function getDeployment<Name extends DeployedName>(name: Name, chainId: number = HYDRO_CHAIN_ID) {
  const contract = (deployedContracts as GenericContractsDeclaration)[chainId]?.[name];
  return contract ? { address: contract.address, abi: contract.abi as DeployedAbi<Name>, chainId } : undefined;
}

export function getRegistryDeployment(chainId: number = HYDRO_CHAIN_ID) {
  return getDeployment("HydroCreditRegistry", chainId);
}

/** The registry meter statements are signed for: this app's registry, or the zero address before it is deployed. */
export function defaultMeterDomain(): MeterDomain {
  return { chainId: HYDRO_CHAIN_ID, registry: getRegistryDeployment()?.address ?? zeroAddress };
}

export function isLiveHederaChain(chainId: number = HYDRO_CHAIN_ID): boolean {
  return chainId === hedera.id || chainId === hederaTestnet.id;
}
