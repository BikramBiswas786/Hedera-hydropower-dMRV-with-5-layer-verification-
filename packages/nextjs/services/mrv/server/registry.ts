import { HYDRO_CHAIN_ID, getDeployment, getHydroRecDeployment } from "../network";
import {
  type AttestationView,
  type ListingView,
  type PlantView,
  toAttestationView,
  toListingView,
  toPlantView,
} from "../views";
import { ApiError } from "./errors";
import { type Address, type Hex, createPublicClient, http, zeroAddress } from "viem";
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
  constructor() {
    const network = HARDHAT_NETWORK_NAME[HYDRO_CHAIN_ID] ?? "<network>";
    super(`HydroREC is not deployed on chain ${HYDRO_CHAIN_ID}. Run \`yarn deploy --network ${network}\` first.`, 503);
  }
}

export function requireDeployment() {
  const deployment = getHydroRecDeployment();
  if (!deployment) throw new RegistryNotDeployedError();
  return { address: deployment.address, abi: deployment.abi, client };
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
  recToken: Address;
  totalCertifiedWh: number;
  totalRetiredKwh: number;
  attestationCount: number;
  listingCount: number;
  retirementCount: number;
  minTrustScoreBps: number;
  oracle: OracleStatus | null;
  plants: PlantView[];
};

export async function getRegistryOverview(): Promise<RegistryOverview> {
  const { address, abi } = requireDeployment();
  const read = { address, abi } as const;

  const [recToken, certified, retired, attestations, listings, retirements, minTrust, plantIds] = await Promise.all([
    client.readContract({ ...read, functionName: "recToken" }),
    client.readContract({ ...read, functionName: "totalCertifiedWh" }),
    client.readContract({ ...read, functionName: "totalRetiredUnits" }),
    client.readContract({ ...read, functionName: "attestationCount" }),
    client.readContract({ ...read, functionName: "listingCount" }),
    client.readContract({ ...read, functionName: "retirementCount" }),
    client.readContract({ ...read, functionName: "minTrustScoreBps" }),
    client.readContract({ ...read, functionName: "getPlantIds" }),
  ]);

  const [plants, oracle] = await Promise.all([
    Promise.all(
      plantIds.map(async id =>
        toPlantView(id, await client.readContract({ ...read, functionName: "getPlant", args: [id] })),
      ),
    ),
    // A broken feed must not hide the rest of the registry.
    getOracleStatus().catch(() => null),
  ]);

  return {
    chainId: HYDRO_CHAIN_ID,
    address,
    recToken,
    totalCertifiedWh: Number(certified),
    totalRetiredKwh: Number(retired),
    attestationCount: Number(attestations),
    listingCount: Number(listings),
    retirementCount: Number(retirements),
    minTrustScoreBps: minTrust,
    oracle,
    plants,
  };
}

export async function getPlant(plantId: Hex): Promise<PlantView | null> {
  const { address, abi } = requireDeployment();
  const plant = toPlantView(
    plantId,
    await client.readContract({ address, abi, functionName: "getPlant", args: [plantId] }),
  );
  return plant.operator === zeroAddress ? null : plant;
}

export async function getAttestations(start: number, count: number): Promise<AttestationView[]> {
  const { address, abi } = requireDeployment();
  const page = await client.readContract({
    address,
    abi,
    functionName: "getAttestations",
    args: [BigInt(start), BigInt(Math.min(count, MAX_PAGE))],
  });
  return page.map((raw, i) => toAttestationView(raw, start + i));
}

export async function getAttestation(id: number): Promise<AttestationView> {
  const { address, abi } = requireDeployment();
  return toAttestationView(
    await client.readContract({ address, abi, functionName: "getAttestation", args: [BigInt(id)] }),
    id,
  );
}

export type ListingQuote = ListingView & { quoteFullListingTinybar: string | null };

export async function getOpenListings(): Promise<ListingQuote[]> {
  const { address, abi } = requireDeployment();
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
