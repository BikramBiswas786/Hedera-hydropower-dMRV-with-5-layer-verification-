import { type GuardianSources, SourceError } from "../guardian/hedera";
import { type TraceCheck, traceGuardianMint } from "../guardian/trace";
import { HYDRO_CHAIN_ID, evmToEntityId } from "../network";
import { formatHbar, quoteToTxValue } from "../pricing";
import { fetchUpstream, isUpstreamTimeout } from "../upstream";
import { ApiError, revertReason } from "./errors";
import { readGuardianSources } from "./guardianBridge";
import { publicClient } from "./registry";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { z } from "zod";

/**
 * `UsdCheckout` sells any HTS fungible token at a USD price through the same settlement as `CreditMarket`. Before a
 * buyer pays for a token that claims a Guardian record, the listing's token is traced (`trace_guardian_mint`): a
 * claim that does not check out stops the purchase here, before any transaction is built. A token with no Guardian
 * record makes no such claim and is sold as what it is.
 */

/** Gated testnet checkout. `CHECKOUT_ADDRESS` overrides. The earlier contract `0x455eFbF0…` has no `buyTraced`. */
const TESTNET_CHECKOUT = "0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75";

const CHECKOUT_ABI = parseAbi([
  "struct Listing { address seller; address token; uint64 available; uint64 priceUsdCentsPerToken; uint8 tokenDecimals; bool active; }",
  "function listingCount() view returns (uint256)",
  "function getListing(uint256 listingId) view returns (Listing)",
  "function quote(uint256 listingId, uint64 amount) view returns (uint256)",
  "function NATIVE_UNITS_PER_HBAR() view returns (uint256)",
  "function buy(uint256 listingId, uint64 amount) payable",
  "function buyTraced(uint256 listingId, uint64 amount, bytes32 recordHash, uint64 validUntil, bytes signature) payable",
  "function traceRequired(address token) view returns (bool)",
  "error TraceRequired(address token)",
  "error InvalidListing(uint256 listingId)",
  "error InsufficientListingAmount(uint64 requested, uint64 available)",
  "error ZeroAmount()",
  "error InvalidPrice(int256 answer)",
  "error StalePrice(uint256 updatedAt, uint32 maxPriceAge)",
  "error InvalidPoolGuard()",
  "error PoolIlliquid(address pool, uint256 liquidity, uint128 minLiquidity)",
  "error PoolPriceDeviation(uint256 poolPrice, uint256 oraclePrice, uint256 deviationBps)",
  "error PriceSourcesDisagree(int256 primary, int256 secondary, uint256 deviationBps)",
]);
const TOKEN_ABI = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);

export function checkoutAddress(): Address | null {
  const configured = process.env.CHECKOUT_ADDRESS;
  if (configured) return getAddress(configured);
  return HYDRO_CHAIN_ID === hederaTestnet.id ? TESTNET_CHECKOUT : null;
}

function requireCheckout(): Address {
  const address = checkoutAddress();
  if (!address) throw new ApiError("No UsdCheckout on this chain. Set CHECKOUT_ADDRESS.", 404);
  return address;
}

/**
 * What the Guardian trace says about a listed token.
 *   backed      a Guardian record backs the token; every check passed
 *   none        no Guardian record: the token makes no Guardian claim
 *   not-backed  a Guardian record is cited but a check failed
 *   incomplete  a source could not be read, so the claim cannot be checked
 */
export type ListingGuardian =
  | { verdict: "backed" | "not-backed" | "incomplete"; ref: string; checks: TraceCheck[]; failed: string[] }
  | { verdict: "none"; detail: string };

async function accountIdOf(sources: GuardianSources, evmAddress: Address): Promise<string | null> {
  const long = evmToEntityId(evmAddress);
  if (long) return long;
  try {
    const response = await fetchUpstream(sources.fetch, `${sources.mirrorNodeUrl}/api/v1/accounts/${evmAddress}`);
    if (!response.ok) return null;
    return ((await response.json()) as { account?: string }).account ?? null;
  } catch (error) {
    if (isUpstreamTimeout(error)) throw new SourceError("Mirror node timed out resolving the seller account");
    throw error;
  }
}

/** Traces the token through the seller's latest Guardian transfer of it. */
export async function guardianStatusOf(
  tokenAddress: Address,
  seller: Address,
  sources: GuardianSources = readGuardianSources(),
): Promise<ListingGuardian> {
  const tokenId = evmToEntityId(tokenAddress);
  let ref = `ft:${tokenId ?? tokenAddress}:${seller}`;
  try {
    const account = await accountIdOf(sources, seller);
    if (!tokenId || !account) return { verdict: "none", detail: "The token or seller has no Hedera account id" };
    ref = `ft:${tokenId}:${account}`;
    const trace = await traceGuardianMint(sources, ref);
    const failed = trace.checks.filter(c => c.ok !== true).map(c => `${c.id}: ${c.detail}`);
    return { verdict: trace.verdict, ref, checks: trace.checks, failed };
  } catch (error) {
    if (error instanceof SourceError && /^No Guardian transfer/.test(error.message)) {
      return {
        verdict: "none",
        detail: `${tokenId} reached the seller by no Guardian mint transfer`,
      };
    }
    if (error instanceof SourceError) return { verdict: "incomplete", ref, checks: [], failed: [error.message] };
    throw error;
  }
}

export type CheckoutListing = {
  id: number;
  seller: Address;
  token: { address: Address; id: string | null; name: string; symbol: string; decimals: number };
  available: string;
  priceUsdCentsPerToken: number;
  guardian: ListingGuardian;
};

async function readListing(address: Address, listingId: number) {
  const client = publicClient();
  try {
    return await client.readContract({
      address,
      abi: CHECKOUT_ABI,
      functionName: "getListing",
      args: [BigInt(listingId)],
    });
  } catch (error) {
    throw new ApiError(`Listing ${listingId}: ${revertReason(error)}`, 404);
  }
}

async function describe(address: Address, listingId: number, sources: GuardianSources): Promise<CheckoutListing> {
  const client = publicClient();
  const listing = await readListing(address, listingId);
  const [name, symbol, guardian] = await Promise.all([
    client.readContract({ address: listing.token, abi: TOKEN_ABI, functionName: "name" }).catch(() => ""),
    client.readContract({ address: listing.token, abi: TOKEN_ABI, functionName: "symbol" }).catch(() => ""),
    guardianStatusOf(listing.token, listing.seller, sources),
  ]);
  return {
    id: listingId,
    seller: listing.seller,
    token: {
      address: listing.token,
      id: evmToEntityId(listing.token),
      name,
      symbol,
      decimals: listing.tokenDecimals,
    },
    available: listing.available.toString(),
    priceUsdCentsPerToken: Number(listing.priceUsdCentsPerToken),
    guardian,
  };
}

/** Open `UsdCheckout` listings, newest first, each with its token's Guardian verdict. */
export async function listCheckoutListings(limit = 10): Promise<{ checkout: Address; listings: CheckoutListing[] }> {
  const address = requireCheckout();
  const count = Number(await publicClient().readContract({ address, abi: CHECKOUT_ABI, functionName: "listingCount" }));
  const sources = readGuardianSources();
  const ids: number[] = [];
  for (let id = count - 1; id >= 0 && ids.length < limit; id--) {
    const listing = await readListing(address, id);
    if (listing.active && listing.available > 0n) ids.push(id);
  }
  return { checkout: address, listings: await Promise.all(ids.map(id => describe(address, id, sources))) };
}

export const prepareCheckoutPurchaseSchema = z.object({
  listingId: z.number().int().min(0),
  /** Base units of the listed token. */
  amount: z.number().int().positive(),
});

export type PreparedCheckoutPurchase = {
  chainId: number;
  to: Address;
  data: Hex;
  /** JSON-RPC `value` in weibar, including a 1% buffer; the contract refunds the excess. */
  value: string;
  exactCostHbar: string;
  summary: string;
  listing: CheckoutListing;
};

/**
 * An unsigned `UsdCheckout.buy` for the caller's own wallet. Refuses before building anything when the listed token
 * claims a Guardian record that is not backed, or when the contract will not quote (price feed or SaucerSwap pool out
 * of band). The buyer must be associated with the token.
 */
export async function prepareCheckoutPurchase(
  input: z.input<typeof prepareCheckoutPurchaseSchema>,
): Promise<PreparedCheckoutPurchase> {
  const { listingId, amount } = prepareCheckoutPurchaseSchema.parse(input);
  const address = requireCheckout();
  const client = publicClient();
  const listing = await describe(address, listingId, readGuardianSources());
  const { guardian } = listing;
  if (guardian.verdict === "not-backed" || guardian.verdict === "incomplete") {
    throw new ApiError(
      `Listing ${listingId} sells ${listing.token.id}, which cites a Guardian record that is ${guardian.verdict} (${guardian.failed.join("; ")}). No purchase transaction was built.`,
      409,
    );
  }
  let quote: bigint;
  try {
    quote = await client.readContract({
      address,
      abi: CHECKOUT_ABI,
      functionName: "quote",
      args: [BigInt(listingId), BigInt(amount)],
    });
  } catch (error) {
    throw new ApiError(`Cannot quote listing ${listingId}: ${revertReason(error)}`, 409);
  }
  const nativeUnitsPerHbar = await client.readContract({
    address,
    abi: CHECKOUT_ABI,
    functionName: "NATIVE_UNITS_PER_HBAR",
  });
  const exactCostHbar = formatHbar(quote, nativeUnitsPerHbar);
  const units = `${amount} base units of ${listing.token.symbol || listing.token.id}`;
  const required = await readTraceRequired(address, listing.token.address);
  if (required && guardian.verdict !== "backed") {
    throw new ApiError(
      `Listing ${listingId} sells ${listing.token.id}, which the checkout will not sell without a backed Guardian trace (it is ${guardian.verdict}). No purchase transaction was built.`,
      409,
    );
  }
  const data = required
    ? await tracedBuyData(address, listingId, listing, amount, guardian.verdict === "backed" ? guardian.ref : "")
    : encodeFunctionData({ abi: CHECKOUT_ABI, functionName: "buy", args: [BigInt(listingId), BigInt(amount)] });
  return {
    chainId: client.chain.id,
    to: address,
    data,
    value: quoteToTxValue(quote, nativeUnitsPerHbar).toString(),
    exactCostHbar,
    summary:
      `Buy ${units} from checkout listing #${listingId} for ${exactCostHbar} HBAR` +
      (guardian.verdict === "backed" ? `; Guardian record ${guardian.ref} is backed` : "; not a Guardian token") +
      (required ? "; the checkout requires the trace signature" : ""),
    listing,
  };
}

/** A checkout deployed before `traceRequired` reverts the call. Those tokens still sell through `buy`. */
async function readTraceRequired(checkout: Address, token: Address): Promise<boolean> {
  try {
    return await publicClient().readContract({
      address: checkout,
      abi: CHECKOUT_ABI,
      functionName: "traceRequired",
      args: [token],
    });
  } catch {
    return false;
  }
}

const TRACE_TYPES = parseAbiParameters(
  "uint256 chainId, address checkout, uint256 listingId, address token, address seller, uint64 amount, bytes32 recordHash, uint64 validUntil",
);

/** Ten minutes. The contract rejects a purchase after this, so a signed quote cannot be reused later. */
const TRACE_TTL_SECONDS = 600n;

async function tracedBuyData(
  checkout: Address,
  listingId: number,
  listing: CheckoutListing,
  amount: number,
  ref: string,
): Promise<Hex> {
  const key = process.env.TRACE_SIGNER_KEY;
  if (!key) {
    throw new ApiError("This token needs a Guardian trace signature, and TRACE_SIGNER_KEY is not set.", 503);
  }
  const recordHash = keccak256(toBytes(ref));
  const validUntil = BigInt(Math.floor(Date.now() / 1000)) + TRACE_TTL_SECONDS;
  const inner = keccak256(
    encodeAbiParameters(TRACE_TYPES, [
      BigInt(publicClient().chain.id),
      checkout,
      BigInt(listingId),
      listing.token.address,
      listing.seller,
      BigInt(amount),
      recordHash,
      validUntil,
    ]),
  );
  const signature = await privateKeyToAccount(key as Hex).signMessage({ message: { raw: inner } });
  return encodeFunctionData({
    abi: CHECKOUT_ABI,
    functionName: "buyTraced",
    args: [BigInt(listingId), BigInt(amount), recordHash, validUntil, signature],
  });
}
