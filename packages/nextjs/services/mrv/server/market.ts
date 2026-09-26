import { hashscan, isLiveHederaChain } from "../network";
import { formatHbar, quoteToTxValue } from "../pricing";
import { type RetirementView, formatTonnes, toRetirementView } from "../views";
import { type DexCheck, readDexCheck } from "./dex";
import { ApiError, revertReason } from "./errors";
import { activeRegistry, legacy, publicClient, requireDeployment, requireMarket } from "./registry";
import { type Address, type Hex, encodeFunctionData, zeroAddress } from "viem";
import { z } from "zod";

export const preparePurchaseSchema = z.object({
  listingId: z.number().int().min(0),
  /** Credits in kg CO2e (token base units; 1 000 = 1 t). */
  amountKg: z.number().int().positive(),
  retire: z.boolean().default(true),
  beneficiary: z.string().max(128).default(""),
});

export type PreparedPurchase = {
  chainId: number;
  to: Address;
  data: Hex;
  /** JSON-RPC `value` in weibar (18 decimals), including a 1% buffer; the contract refunds the excess. */
  value: string;
  valueHbar: string;
  exactCostHbar: string;
  functionName: "buy" | "buyAndRetire";
  summary: string;
  /** The SaucerSwap pair the contract swaps through. Present only when it is inside the band; otherwise this throws. */
  dex: DexCheck;
  /**
   * The on-chain SaucerSwap guard in `CreditMarket.settlementPrice()`. When `enabled`, the contract itself reverts a
   * purchase whose pool price is more than `maxDeviationBps` from the Chainlink/Supra consensus.
   */
  onChainPoolGuard: OnChainPoolGuard;
};

export type OnChainPoolGuard = {
  pool: Address;
  version: "V1" | "V2";
  enabled: boolean;
  maxDeviationBps: number;
};

export async function readOnChainPoolGuard(): Promise<OnChainPoolGuard> {
  const { address, abi, client } = requireMarket();
  const [pool, isV2, , enabled, , , maxDeviationBps] = await client.readContract({
    address,
    abi,
    functionName: "poolGuard",
  });
  return { pool, version: isV2 ? "V2" : "V1", enabled, maxDeviationBps };
}

/**
 * Builds an unsigned purchase so an agent (or any wallet) can sign and send it itself. The server never holds the
 * buyer's key. The quote is read at the current oracle price; resubmit if it is minutes old.
 */
export async function preparePurchase(input: z.input<typeof preparePurchaseSchema>): Promise<PreparedPurchase> {
  const { listingId, amountKg, retire, beneficiary } = preparePurchaseSchema.parse(input);
  const { address, abi, client } = requireMarket();
  const units = BigInt(amountKg);

  let quote: bigint;
  try {
    quote = await client.readContract({ address, abi, functionName: "quote", args: [BigInt(listingId), units] });
  } catch (error) {
    throw new ApiError(`Cannot quote listing ${listingId}: ${revertReason(error)}`, 409);
  }
  const nativeUnitsPerHbar = await client.readContract({ address, abi, functionName: "NATIVE_UNITS_PER_HBAR" });
  const value = quoteToTxValue(quote, nativeUnitsPerHbar);
  const data = retire
    ? encodeFunctionData({ abi, functionName: "buyAndRetire", args: [BigInt(listingId), units, beneficiary] })
    : encodeFunctionData({ abi, functionName: "buy", args: [BigInt(listingId), units] });

  const exactCostHbar = formatHbar(quote, nativeUnitsPerHbar);
  const [dex, onChainPoolGuard] = await Promise.all([readDexCheck(), readOnChainPoolGuard()]);
  if (!dex.accepted) {
    throw new ApiError(
      `SaucerSwap settlement pool is ${dex.deviationBps} bps from the settlement price (max ${dex.maxDeviationBps}). No purchase transaction was built.`,
      409,
    );
  }
  return {
    chainId: client.chain.id,
    to: address,
    data,
    value: value.toString(),
    valueHbar: formatHbar(value, 10n ** 18n),
    exactCostHbar,
    functionName: retire ? "buyAndRetire" : "buy",
    summary: `${retire ? "Buy and retire" : "Buy"} ${formatTonnes(units)} t CO2e from listing #${listingId} for ${exactCostHbar} HBAR`,
    dex,
    onChainPoolGuard,
  };
}

export type RetirementCertificate = RetirementView & {
  certificateToken: Address | null;
  nftUrl: string | null;
  certificateUrl: string;
};

export async function getRetirementCertificate(retirementId: number): Promise<RetirementCertificate> {
  const client = publicClient();
  const read =
    activeRegistry().kind === "legacy"
      ? {
          count: () => client.readContract({ ...legacy, functionName: "retirementCount" }),
          retirement: (id: bigint) => client.readContract({ ...legacy, functionName: "getRetirement", args: [id] }),
          token: () => client.readContract({ ...legacy, functionName: "certificateToken" }),
        }
      : (() => {
          const { address, abi } = requireDeployment();
          return {
            count: () => client.readContract({ address, abi, functionName: "retirementCount" }),
            retirement: (id: bigint) =>
              client.readContract({ address, abi, functionName: "getRetirement", args: [id] }),
            token: () => client.readContract({ address, abi, functionName: "certificateToken" }),
          };
        })();
  const count = await read.count();
  if (BigInt(retirementId) >= count) throw new ApiError(`Retirement #${retirementId} does not exist`, 404);

  const [raw, token] = await Promise.all([read.retirement(BigInt(retirementId)), read.token()]);
  const retirement = toRetirementView(raw, retirementId);
  const hasNft = token !== zeroAddress && retirement.certificateSerial > 0;
  return {
    ...retirement,
    certificateToken: token === zeroAddress ? null : token,
    nftUrl: hasNft && isLiveHederaChain() ? hashscan.nft(token, retirement.certificateSerial) : null,
    certificateUrl: `/certificate/${retirementId}`,
  };
}
