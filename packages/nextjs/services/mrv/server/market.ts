import { hashscan, isLiveHederaChain } from "../network";
import { formatHbar, quoteToTxValue } from "../pricing";
import { type RetirementView, formatTonnes, toRetirementView } from "../views";
import { type DexCheck, readDexCheck } from "./dex";
import { ApiError, revertReason } from "./errors";
import { requireDeployment } from "./registry";
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
  /** SaucerSwap spot. Present only when it is inside the 3% band; otherwise this function throws. */
  dex: DexCheck;
};

/**
 * Builds an unsigned purchase so an agent (or any wallet) can sign and send it itself. The server never holds the
 * buyer's key. The quote is read at the current oracle price; resubmit if it is minutes old.
 */
export async function preparePurchase(input: z.input<typeof preparePurchaseSchema>): Promise<PreparedPurchase> {
  const { listingId, amountKg, retire, beneficiary } = preparePurchaseSchema.parse(input);
  const { address, abi, client } = requireDeployment();
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
  const dex = await readDexCheck();
  if (!dex.accepted) {
    throw new ApiError(
      `SaucerSwap WHBAR/USDC is ${dex.deviationBps} bps from the settlement price (max ${dex.maxDeviationBps}). No purchase transaction was built.`,
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
  };
}

export type RetirementCertificate = RetirementView & {
  certificateToken: Address | null;
  nftUrl: string | null;
  certificateUrl: string;
};

export async function getRetirementCertificate(retirementId: number): Promise<RetirementCertificate> {
  const { address, abi, client } = requireDeployment();
  const count = await client.readContract({ address, abi, functionName: "retirementCount" });
  if (BigInt(retirementId) >= count) throw new ApiError(`Retirement #${retirementId} does not exist`, 404);

  const [raw, token] = await Promise.all([
    client.readContract({ address, abi, functionName: "getRetirement", args: [BigInt(retirementId)] }),
    client.readContract({ address, abi, functionName: "certificateToken" }),
  ]);
  const retirement = toRetirementView(raw, retirementId);
  const hasNft = token !== zeroAddress && retirement.certificateSerial > 0;
  return {
    ...retirement,
    certificateToken: token === zeroAddress ? null : token,
    nftUrl: hasNft && isLiveHederaChain() ? hashscan.nft(token, retirement.certificateSerial) : null,
    certificateUrl: `/certificate/${retirementId}`,
  };
}
