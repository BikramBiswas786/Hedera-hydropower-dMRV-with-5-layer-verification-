import { PROJECT_TYPES, powerDensity, registeredMethodologyLabel, reservoirEfGPerMwh } from "../methodology/project";
import { hashscan, isLiveHederaChain } from "../network";
import {
  type AttestationView,
  type PlantView,
  type RetirementView,
  plantIdToBytes32,
  toAttestationView,
  toRetirementView,
} from "../views";
import { ApiError } from "./errors";
import { getPlant, requireDeployment } from "./registry";
import { type Address, getAddress, isAddress, zeroAddress } from "viem";
import { z } from "zod";

/** Contract pages are capped so a single eth_call stays small on the JSON-RPC relay. */
const PAGE = 100n;

async function readPaged<T>(count: bigint, page: (start: bigint, size: bigint) => Promise<readonly T[]>) {
  const out: T[] = [];
  for (let start = 0n; start < count; start += PAGE) {
    out.push(...(await page(start, count - start < PAGE ? count - start : PAGE)));
  }
  return out;
}

export async function getAllAttestations(): Promise<AttestationView[]> {
  const { address, abi, client } = requireDeployment();
  const count = await client.readContract({ address, abi, functionName: "attestationCount" });
  const raw = await readPaged(count, (start, size) =>
    client.readContract({ address, abi, functionName: "getAttestations", args: [start, size] }),
  );
  return raw.map((attestation, i) => toAttestationView(attestation, i));
}

export async function getAllRetirements(): Promise<RetirementView[]> {
  const { address, abi, client } = requireDeployment();
  const count = await client.readContract({ address, abi, functionName: "retirementCount" });
  const raw = await readPaged(count, (start, size) =>
    client.readContract({ address, abi, functionName: "getRetirements", args: [start, size] }),
  );
  return raw.map((retirement, i) => toRetirementView(retirement, i));
}

// ─── Plants ──────────────────────────────────────────────────────────────────

export type PlantTotals = {
  attestations: number;
  netWh: number;
  grossWh: number;
  baselineG: number;
  reservoirG: number;
  fossilFuelG: number;
  reductionG: number;
  unitsMinted: number;
  /** Coverage of the attested periods, weighted by period length (basis points). */
  completenessBps: number | null;
  firstPeriodStart: number | null;
  lastPeriodEnd: number | null;
  /** Credits per MWh exported: the plant's realised emission-reduction intensity. */
  creditsPerMwh: number | null;
};

export type PlantAttestation = AttestationView & { reportUrl: string | null; auditUrl: string };

export type PlantDetail = {
  plant: PlantView;
  methodology: string;
  projectType: string;
  powerDensity: { wPerM2: number | null; basis: string };
  totals: PlantTotals;
  attestations: PlantAttestation[];
  links: { designDocument: string; registry: string | null };
};

export function plantTotals(attestations: AttestationView[]): PlantTotals {
  const sum = (pick: (a: AttestationView) => number) => attestations.reduce((s, a) => s + pick(a), 0);
  const seconds = sum(a => a.periodEnd - a.periodStart);
  const netWh = sum(a => a.netEnergyWh);
  const unitsMinted = sum(a => a.unitsMinted);
  return {
    attestations: attestations.length,
    netWh,
    grossWh: sum(a => a.grossEnergyWh),
    baselineG: sum(a => a.baselineG),
    reservoirG: sum(a => a.reservoirG),
    fossilFuelG: sum(a => a.fossilFuelG),
    reductionG: sum(a => a.reductionG),
    unitsMinted,
    completenessBps:
      seconds > 0 ? Math.floor(sum(a => a.completenessBps * (a.periodEnd - a.periodStart)) / seconds) : null,
    firstPeriodStart: attestations.length ? Math.min(...attestations.map(a => a.periodStart)) : null,
    lastPeriodEnd: attestations.length ? Math.max(...attestations.map(a => a.periodEnd)) : null,
    creditsPerMwh: netWh > 0 ? unitsMinted / 1_000 / (netWh / 1e6) : null,
  };
}

export async function listPlants(): Promise<PlantView[]> {
  const { address, abi, client } = requireDeployment();
  const ids = await client.readContract({ address, abi, functionName: "getPlantIds" });
  const plants = await Promise.all(ids.map(id => getPlant(id)));
  return plants.filter((plant): plant is PlantView => plant !== null);
}

export async function getPlantDetail(plantId: string): Promise<PlantDetail> {
  if (!/^[\x20-\x7e]{1,31}$/.test(plantId)) throw new ApiError("Plant ids are 1–31 printable ASCII characters", 400);
  const [plant, all] = await Promise.all([getPlant(plantIdToBytes32(plantId)), getAllAttestations()]);
  if (!plant) throw new ApiError(`Plant ${plantId} is not registered`, 404);

  const { address } = requireDeployment();
  const attestations = all
    .filter(a => a.plantId === plantId)
    .map(a => ({
      ...a,
      reportUrl: a.hcsTopicId && isLiveHederaChain() ? hashscan.topicMessage(a.hcsTopicId, a.hcsSequence) : null,
      auditUrl: `/api/registry/attestations/${a.id}/reproduce`,
    }));
  const pd = powerDensity(plant.design, reservoirEfGPerMwh(plant.design.methodology));
  return {
    plant,
    methodology: registeredMethodologyLabel(plant.design),
    projectType: PROJECT_TYPES[plant.design.projectType] ?? "unknown",
    powerDensity: { wPerM2: pd.wPerM2, basis: pd.basis },
    totals: plantTotals(attestations),
    attestations,
    links: {
      designDocument: `/api/methodology/projects/${encodeURIComponent(plantId)}?raw=1`,
      registry: isLiveHederaChain() ? hashscan.contract(address) : null,
    },
  };
}

// ─── Portfolios: retirements for ESG reporting ──────────────────────────────

export const portfolioQuerySchema = z
  .object({
    account: z
      .string()
      .refine(value => isAddress(value), "Expected an EVM address")
      .optional(),
    beneficiary: z.string().min(1).max(128).optional(),
  })
  .refine(query => query.account || query.beneficiary, "Pass an account address, a beneficiary name, or both");

export type PortfolioRetirement = RetirementView & { certificateUrl: string; nftUrl: string | null };

export type Portfolio = {
  account: Address | null;
  beneficiary: string | null;
  totals: { retiredKg: number; retirements: number; certificates: number; custodyKg: number | null };
  retirements: PortfolioRetirement[];
};

const normalise = (text: string) => text.trim().toLowerCase();

/**
 * Retirements made by the account or on behalf of the beneficiary (case-insensitive exact match), newest first: what
 * a company reports is everything it retired itself plus everything others retired in its name.
 */
export async function getPortfolio(input: z.input<typeof portfolioQuerySchema>): Promise<Portfolio> {
  const query = portfolioQuerySchema.parse(input);
  const account = query.account ? getAddress(query.account) : null;
  const { address, abi, client } = requireDeployment();
  const [all, token, custody] = await Promise.all([
    getAllRetirements(),
    client.readContract({ address, abi, functionName: "certificateToken" }),
    account ? client.readContract({ address, abi, functionName: "custodyBalanceOf", args: [account] }) : null,
  ]);

  const retirements = all
    .filter(
      r =>
        (account !== null && r.account === account) ||
        (query.beneficiary !== undefined && normalise(r.beneficiary) === normalise(query.beneficiary)),
    )
    .reverse()
    .map(r => ({
      ...r,
      certificateUrl: `/certificate/${r.id}`,
      nftUrl:
        token !== zeroAddress && r.certificateSerial > 0 && isLiveHederaChain()
          ? hashscan.nft(token, r.certificateSerial)
          : null,
    }));

  return {
    account,
    beneficiary: query.beneficiary ?? null,
    totals: {
      retiredKg: retirements.reduce((s, r) => s + r.units, 0),
      retirements: retirements.length,
      certificates: retirements.filter(r => r.certificateSerial > 0).length,
      custodyKg: custody === null ? null : Number(custody),
    },
    retirements,
  };
}

const CSV_COLUMNS = [
  "retirement_id",
  "retired_at_utc",
  "tonnes_co2e",
  "beneficiary",
  "account",
  "certificate_serial",
  "certificate_delivered",
  "certificate_url",
] as const;

/**
 * RFC 4180 quoting. Beneficiary names are free text written on-chain by anyone, so a leading = + - @ is neutralised
 * to stop spreadsheets from evaluating it as a formula.
 */
const csvCell = (value: string | number | boolean) => {
  const raw = String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One row per retirement, in tonnes, ready for an ESG or GHG-inventory workbook. */
export function portfolioCsv(portfolio: Portfolio, origin: string): string {
  const rows = portfolio.retirements.map(r =>
    [
      r.id,
      new Date(r.timestamp * 1_000).toISOString(),
      (r.units / 1_000).toFixed(3),
      r.beneficiary,
      r.account,
      r.certificateSerial,
      r.certificateDelivered,
      `${origin}${r.certificateUrl}`,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
