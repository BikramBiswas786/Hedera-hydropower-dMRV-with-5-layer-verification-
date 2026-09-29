import { findDemoPlant } from "../demo";
import {
  HYDRO_CHAIN_ID,
  getDeployment,
  getMarketDeployment,
  getModuleDeployment,
  getRegistryDeployment,
} from "../network";
import {
  type AttestationView,
  type IssuanceView,
  type ListingView,
  type PlantView,
  bytes32ToPlantId,
  closureOf,
  toDmrvAttestationView,
  toIssuanceView,
  toListingView,
  toProjectView,
} from "../views";
import { ApiError } from "./errors";
import { type Abi, type Address, type Hex, createPublicClient, http, zeroAddress } from "viem";
import scaffoldConfig from "~~/scaffold.config";

const MAX_PAGE = 100;

export function hydroChain() {
  const chain = scaffoldConfig.targetNetworks.find(c => c.id === HYDRO_CHAIN_ID);
  if (!chain) throw new Error(`Chain ${HYDRO_CHAIN_ID} is not in scaffold.config targetNetworks`);
  return chain;
}

export function hydroTransport() {
  const overrides: Partial<Record<number, string>> = scaffoldConfig.rpcOverrides;
  return http(overrides[HYDRO_CHAIN_ID]);
}

const client = createPublicClient({ chain: hydroChain(), transport: hydroTransport() });

const HARDHAT_NETWORK_NAME: Partial<Record<number, string>> = {
  296: "hederaTestnet",
  295: "hederaMainnet",
  31337: "localhost",
};

export class RegistryNotDeployedError extends ApiError {
  constructor(name = "DmrvRegistry") {
    const network = HARDHAT_NETWORK_NAME[HYDRO_CHAIN_ID] ?? "<network>";
    super(`${name} is not deployed on chain ${HYDRO_CHAIN_ID}. Run \`yarn deploy --network ${network}\` first.`, 503);
  }
}

/** DmrvRegistry on this chain, for writes and new reads. Its module's errors are merged in for revert decoding. */
export function requireDeployment() {
  const deployment = getRegistryDeployment();
  if (!deployment) throw new RegistryNotDeployedError();
  const moduleErrors = (getModuleDeployment()?.abi ?? []).filter(item => item.type === "error");
  const errorAbi = [...deployment.abi, ...moduleErrors] as Abi;
  return { address: deployment.address, abi: deployment.abi, errorAbi, client };
}

export function requireMarket() {
  const deployment = getMarketDeployment();
  if (!deployment) throw new RegistryNotDeployedError("CreditMarket");
  return { address: deployment.address, abi: deployment.abi, client };
}

export function publicClient() {
  return client;
}

type SourceStatus = { price: number | null; updatedAt: number; fresh: boolean };

export type OracleStatus = {
  /** Settlement price, or null when purchases are paused (sources disagree or none is fresh). */
  price: number | null;
  activeSource: "chainlink" | "supra" | null;
  pausedReason: string | null;
  chainlink: SourceStatus;
  supra: SourceStatus;
};

const toSourceStatus = ({ answer, updatedAt, fresh }: { answer: bigint; updatedAt: bigint; fresh: boolean }) => ({
  price: answer > 0n ? Number(answer) / 1e8 : null,
  updatedAt: Number(updatedAt),
  fresh,
});

/** Reads both oracle sources behind the settlement feed; null when the feed is not part of this deployment. */
export async function getOracleStatus(): Promise<OracleStatus | null> {
  const feed = getDeployment("ResilientHbarUsdFeed");
  if (!feed) return null;
  const read = { address: feed.address, abi: feed.abi } as const;
  const [primary, fallback] = await client.readContract({ ...read, functionName: "readSources" });
  const base = { chainlink: toSourceStatus(primary), supra: toSourceStatus(fallback) };
  try {
    const [answer, source] = await client.readContract({ ...read, functionName: "resolve" });
    const activeSource = source === 1 ? "chainlink" : "supra";
    return { ...base, price: Number(answer.answer) / 1e8, activeSource, pausedReason: null };
  } catch (error) {
    const reason = String(error).includes("PriceSourcesDisagree") ? "oracle sources disagree" : "no fresh oracle price";
    return { ...base, price: null, activeSource: null, pausedReason: reason };
  }
}

export type RegistryOverview = {
  chainId: number;
  address: Address;
  market: Address | null;
  creditToken: Address;
  /** HCS topic every monitoring and verification report must cite. */
  auditTopic: string | null;
  /** Credits issued and retired, in kg CO2e (1 token = 1 t). */
  totalIssuedKg: number;
  totalRetiredKg: number;
  /** Monitoring records, verifications (issuances), listings and retirements so far. */
  attestationCount: number;
  issuanceCount: number;
  listingCount: number;
  retirementCount: number;
  minCompletenessBps: number;
  oracle: OracleStatus | null;
  plants: PlantView[];
};

export async function getRegistryOverview(): Promise<RegistryOverview> {
  const { address, abi } = requireDeployment();
  const read = { address, abi } as const;
  const oracle = getOracleStatus().catch(() => null);
  const market = getMarketDeployment();
  const [
    creditToken,
    topic,
    issued,
    retired,
    attestations,
    issuances,
    retirements,
    minCompleteness,
    projectIds,
    listings,
  ] = await Promise.all([
    client.readContract({ ...read, functionName: "creditToken" }),
    client.readContract({ ...read, functionName: "auditTopic" }),
    client.readContract({ ...read, functionName: "totalIssuedUnits" }),
    client.readContract({ ...read, functionName: "totalRetiredUnits" }),
    client.readContract({ ...read, functionName: "attestationCount" }),
    client.readContract({ ...read, functionName: "issuanceCount" }),
    client.readContract({ ...read, functionName: "retirementCount" }),
    client.readContract({ ...read, functionName: "minCompletenessBps" }),
    client.readContract({ ...read, functionName: "getProjectIds" }),
    market
      ? client.readContract({ address: market.address, abi: market.abi, functionName: "listingCount" })
      : Promise.resolve(0n),
  ]);
  const plants = await Promise.all(projectIds.map(id => readProject(id)));
  return {
    chainId: HYDRO_CHAIN_ID,
    address,
    market: market?.address ?? null,
    creditToken,
    auditTopic: topic === 0n ? null : `0.0.${topic}`,
    totalIssuedKg: Number(issued),
    totalRetiredKg: Number(retired),
    attestationCount: Number(attestations),
    issuanceCount: Number(issuances),
    listingCount: Number(listings),
    retirementCount: Number(retirements),
    minCompletenessBps: minCompleteness,
    oracle: await oracle,
    plants,
  };
}

async function readProject(id: Hex) {
  const { address, abi } = requireDeployment();
  const raw = await client.readContract({ address, abi, functionName: "getProject", args: [id] });
  return toProjectView(id, raw, findDemoPlant(bytes32ToPlantId(id))?.name);
}

/** A project on the registry, or null when it is not registered. */
export async function getPlant(plantId: Hex): Promise<PlantView | null> {
  const project = await readProject(plantId);
  return project.operator === zeroAddress ? null : project;
}

export const getProject = getPlant;

export async function getAuditTopic(): Promise<bigint> {
  const { address, abi } = requireDeployment();
  return client.readContract({ address, abi, functionName: "auditTopic" });
}

/** Every verification so far, oldest first. */
export async function getIssuances(): Promise<IssuanceView[]> {
  const { address, abi } = requireDeployment();
  const [count, topic] = await Promise.all([
    client.readContract({ address, abi, functionName: "issuanceCount" }),
    getAuditTopic(),
  ]);
  return Promise.all(
    Array.from({ length: Number(count) }, async (_, i) =>
      toIssuanceView(
        await client.readContract({ address, abi, functionName: "getIssuance", args: [BigInt(i)] }),
        i,
        topic,
      ),
    ),
  );
}

export async function getIssuance(id: number): Promise<IssuanceView> {
  const { address, abi } = requireDeployment();
  const count = await client.readContract({ address, abi, functionName: "issuanceCount" });
  if (id >= Number(count)) throw new ApiError(`Issuance ${id} does not exist`, 404);
  const [raw, topic] = await Promise.all([
    client.readContract({ address, abi, functionName: "getIssuance", args: [BigInt(id)] }),
    getAuditTopic(),
  ]);
  return toIssuanceView(raw, id, topic);
}

export async function getAttestations(start: number, count: number): Promise<AttestationView[]> {
  const { address, abi } = requireDeployment();
  const args = [BigInt(start), BigInt(Math.min(count, MAX_PAGE))] as const;
  const [page, topic, issuances] = await Promise.all([
    client.readContract({ address, abi, functionName: "getAttestations", args }),
    getAuditTopic(),
    getIssuances(),
  ]);
  const closure = closureOf(issuances);
  return page.map((raw, i) => toDmrvAttestationView(raw, start + i, topic, closure));
}

export async function getAttestation(id: number): Promise<AttestationView> {
  const [attestation] = await getAttestations(id, 1);
  if (!attestation) throw new ApiError(`Attestation ${id} does not exist`, 404);
  return attestation;
}

export type ListingQuote = ListingView & { quoteFullListingTinybar: string | null };

export async function getOpenListings(): Promise<ListingQuote[]> {
  const { address, abi } = requireMarket();
  const count = await client.readContract({ address, abi, functionName: "listingCount" });
  const listings = await client.readContract({ address, abi, functionName: "getListings", args: [0n, count] });

  const open = listings.map(toListingView).filter(listing => listing.active);
  return Promise.all(
    open.map(async listing => ({
      ...listing,
      quoteFullListingTinybar: await client
        .readContract({
          address,
          abi,
          functionName: "quote",
          args: [BigInt(listing.id), BigInt(listing.unitsAvailable)],
        })
        .then(String)
        // Stale oracle answers revert `quote`; surface the listing without a price rather than failing.
        .catch(() => null),
    })),
  );
}
