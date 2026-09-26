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
  type ListingView,
  type PlantView,
  bytes32ToPlantId,
  toAttestationView,
  toDmrvAttestationView,
  toListingView,
  toPlantView,
  toProjectView,
} from "../views";
import { ApiError } from "./errors";
import { type Abi, type Address, type Hex, createPublicClient, http, isAddressEqual, zeroAddress } from "viem";
import { LEGACY_REGISTRY } from "~~/contracts/legacy/hydroCreditRegistry5b7fe3f";
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

/**
 * Which registry read routes serve: DmrvRegistry once deployed, otherwise (before the phase-1 redeploy) the legacy
 * HydroCreditRegistry on Hedera testnet, read-only.
 */
export type ActiveRegistry = { kind: "dmrv"; address: Address } | { kind: "legacy"; address: Address };

export function activeRegistry(): ActiveRegistry {
  const dmrv = getRegistryDeployment();
  if (dmrv) return { kind: "dmrv", address: dmrv.address };
  if (HYDRO_CHAIN_ID === LEGACY_REGISTRY.chainId) return { kind: "legacy", address: LEGACY_REGISTRY.address };
  throw new RegistryNotDeployedError();
}

/** Selects the registry by address (historic evidence links), defaulting to the active one. */
export function registryAt(address?: string | null): ActiveRegistry {
  if (address && isAddressEqual(address as Address, LEGACY_REGISTRY.address)) {
    return { kind: "legacy", address: LEGACY_REGISTRY.address };
  }
  const active = activeRegistry();
  if (address && !isAddressEqual(address as Address, active.address)) {
    throw new ApiError(`Unknown registry ${address}. Known: ${active.address}, ${LEGACY_REGISTRY.address}`, 404);
  }
  return active;
}

/** The phase-0 HydroCreditRegistry, read-only. */
export const legacy = { address: LEGACY_REGISTRY.address, abi: LEGACY_REGISTRY.abi } as const;

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
  /** "legacy" until the phase-1 redeploy: read-only HydroCreditRegistry. */
  registry: ActiveRegistry["kind"];
  market: Address | null;
  creditToken: Address;
  /** Credits minted and retired, in kg CO2e (1 token = 1 t). */
  totalIssuedKg: number;
  totalRetiredKg: number;
  attestationCount: number;
  listingCount: number;
  retirementCount: number;
  minCompletenessBps: number;
  oracle: OracleStatus | null;
  plants: PlantView[];
};

export async function getRegistryOverview(): Promise<RegistryOverview> {
  const active = activeRegistry();
  const oracle = getOracleStatus().catch(() => null);
  if (active.kind === "legacy") {
    const [creditToken, issued, retired, attestations, listings, retirements, minCompleteness, plantIds] =
      await Promise.all([
        client.readContract({ ...legacy, functionName: "creditToken" }),
        client.readContract({ ...legacy, functionName: "totalIssuedUnits" }),
        client.readContract({ ...legacy, functionName: "totalRetiredUnits" }),
        client.readContract({ ...legacy, functionName: "attestationCount" }),
        client.readContract({ ...legacy, functionName: "listingCount" }),
        client.readContract({ ...legacy, functionName: "retirementCount" }),
        client.readContract({ ...legacy, functionName: "minCompletenessBps" }),
        client.readContract({ ...legacy, functionName: "getPlantIds" }),
      ]);
    const plants = await Promise.all(
      plantIds.map(async id =>
        toPlantView(id, await client.readContract({ ...legacy, functionName: "getPlant", args: [id] })),
      ),
    );
    return {
      chainId: HYDRO_CHAIN_ID,
      address: active.address,
      registry: "legacy",
      market: null,
      creditToken,
      totalIssuedKg: Number(issued),
      totalRetiredKg: Number(retired),
      attestationCount: Number(attestations),
      listingCount: Number(listings),
      retirementCount: Number(retirements),
      minCompletenessBps: minCompleteness,
      oracle: await oracle,
      plants,
    };
  }

  const { address, abi } = requireDeployment();
  const read = { address, abi } as const;
  const market = getMarketDeployment();
  const [creditToken, issued, retired, attestations, retirements, minCompleteness, projectIds, listings] =
    await Promise.all([
      client.readContract({ ...read, functionName: "creditToken" }),
      client.readContract({ ...read, functionName: "totalIssuedUnits" }),
      client.readContract({ ...read, functionName: "totalRetiredUnits" }),
      client.readContract({ ...read, functionName: "attestationCount" }),
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
    registry: "dmrv",
    market: market?.address ?? null,
    creditToken,
    totalIssuedKg: Number(issued),
    totalRetiredKg: Number(retired),
    attestationCount: Number(attestations),
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

/** A project on the active registry (or the given one), or null when it is not registered. */
export async function getPlant(plantId: Hex, registry: ActiveRegistry = activeRegistry()): Promise<PlantView | null> {
  if (registry.kind === "legacy") {
    const plant = toPlantView(
      plantId,
      await client.readContract({ ...legacy, functionName: "getPlant", args: [plantId] }),
    );
    return plant.operator === zeroAddress ? null : plant;
  }
  const project = await readProject(plantId);
  return project.operator === zeroAddress ? null : project;
}

/** DmrvRegistry project with its phase-1 fields (module, calibration, registration request). */
export async function getProject(plantId: Hex) {
  const project = await readProject(plantId);
  return project.operator === zeroAddress ? null : project;
}

export async function getAttestations(
  start: number,
  count: number,
  registry: ActiveRegistry = activeRegistry(),
): Promise<AttestationView[]> {
  const args = [BigInt(start), BigInt(Math.min(count, MAX_PAGE))] as const;
  if (registry.kind === "legacy") {
    const page = await client.readContract({ ...legacy, functionName: "getAttestations", args });
    return page.map((raw, i) => toAttestationView(raw, start + i));
  }
  const { address, abi } = requireDeployment();
  const page = await client.readContract({ address, abi, functionName: "getAttestations", args });
  return page.map((raw, i) => toDmrvAttestationView(raw, start + i));
}

export async function getAttestation(
  id: number,
  registry: ActiveRegistry = activeRegistry(),
): Promise<AttestationView> {
  if (registry.kind === "legacy") {
    return toAttestationView(
      await client.readContract({ ...legacy, functionName: "getAttestation", args: [BigInt(id)] }),
      id,
    );
  }
  const { address, abi } = requireDeployment();
  return toDmrvAttestationView(
    await client.readContract({ address, abi, functionName: "getAttestation", args: [BigInt(id)] }),
    id,
  );
}

export type ListingQuote = ListingView & { quoteFullListingTinybar: string | null };

export async function getOpenListings(): Promise<ListingQuote[]> {
  if (activeRegistry().kind === "legacy") {
    const count = await client.readContract({ ...legacy, functionName: "listingCount" });
    const listings = await client.readContract({ ...legacy, functionName: "getListings", args: [0n, count] });
    return listings
      .map(toListingView)
      .filter(listing => listing.active)
      .map(listing => ({ ...listing, quoteFullListingTinybar: null }));
  }
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
