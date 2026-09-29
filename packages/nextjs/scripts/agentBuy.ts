/**
 * The agent purchase flow the MCP tools describe, from a script: get_dex_price → list_open_listings →
 * prepare_purchase → sign and send with the buyer's own key. The server-side builder refuses when the SaucerSwap pair
 * is outside the band; the contract swaps the HBAR through SaucerSwap and, with retire, mints an HTS NFT certificate.
 *
 *   BUYER_PRIVATE_KEY=0x… yarn market:agent-buy [amountKg] [beneficiary]
 */
import { type Hex, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hydroChain, hydroTransport, publicClient } from "~~/services/mrv/server/registry";

const RPC = process.env.HEDERA_RPC_URL;

async function main() {
  const { readDexCheck } = await import("~~/services/mrv/server/dex");
  const { getOpenListings } = await import("~~/services/mrv/server/registry");
  const { preparePurchase } = await import("~~/services/mrv/server/market");
  const key = process.env.BUYER_PRIVATE_KEY?.trim();
  if (!key) throw new Error("Set BUYER_PRIVATE_KEY (the buyer's own ECDSA key)");
  const account = privateKeyToAccount(`0x${key.replace(/^0x/, "")}` as Hex);
  const amountKg = Number(process.argv[2] ?? 10);
  const beneficiary = process.argv[3] ?? "Hydro dMRV demo buyer";

  const dex = await readDexCheck();
  console.log(
    `get_dex_price: pair $${dex.price.toFixed(5)}, oracle $${dex.oraclePrice.toFixed(5)}, ${dex.deviationBps} bps`,
  );
  const listing = (await getOpenListings()).find(l => l.unitsAvailable >= amountKg);
  if (!listing) throw new Error(`No open listing with ${amountKg} kg`);
  console.log(
    `list_open_listings: #${listing.id}, ${listing.unitsAvailable} kg at ${listing.priceUsdCentsPerTonne} ¢/t`,
  );
  const prepared = await preparePurchase({ listingId: listing.id, amountKg, retire: true, beneficiary });
  console.log(`prepare_purchase: ${prepared.summary} (sending ${prepared.valueHbar} HBAR, 1% refunded)`);

  const client = publicClient();
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: RPC ? http(RPC) : hydroTransport() });
  // Hashio wants a legacy gas price; the HTS burn and NFT mint are under-estimated by eth_estimateGas.
  const hash = await wallet.sendTransaction({
    to: prepared.to,
    data: prepared.data,
    value: BigInt(prepared.value),
    gas: 3_000_000n,
    gasPrice: await client.getGasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`buyAndRetire reverted: ${hash}`);
  console.log(`buyAndRetire by ${account.address}: https://hashscan.io/testnet/transaction/${hash}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
