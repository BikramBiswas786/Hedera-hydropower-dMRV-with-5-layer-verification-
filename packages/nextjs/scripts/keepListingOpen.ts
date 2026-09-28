/**
 * Keeps one listing open on the testnet market, so a visitor to /market (or an agent calling prepare_purchase) always
 * has something to buy.
 *
 *   yarn market:keep-listing             report open units and the keeper account's registry custody
 *   yarn market:keep-listing --execute   list from that custody with KEEPER_PRIVATE_KEY when open units run low
 *
 * The account must be one that holds credits in `DmrvRegistry` custody (a plant operator, or a buyer who used
 * `buy`) and is associated with the settlement pair's USD token, since each sale pays the seller in it. It reuses
 * the last listing's price. Testnet housekeeping, not part of the product.
 */
import { type Hex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { getDeployment } from "~~/services/mrv/network";

const RPC = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";
/** Relist when fewer than this many kg are for sale. */
const MIN_OPEN_KG = 100n;
/** List up to this many kg at a time, so the custody lasts. */
const LISTING_KG = 1_000n;
/** $15/t when there has never been a listing. */
const DEFAULT_CENTS_PER_TONNE = 1_500n;

/** The live testnet contracts, from deployedContracts.ts (absent after a local-only `yarn deploy`). */
function testnet<Name extends "DmrvRegistry" | "CreditMarket">(name: Name) {
  const deployed = getDeployment(name, 296);
  if (!deployed) throw new Error(`${name} is not in deployedContracts.ts for Hedera testnet (296)`);
  return { address: deployed.address, abi: deployed.abi };
}

const registry = testnet("DmrvRegistry");
const market = testnet("CreditMarket");
const client = createPublicClient({ chain: hederaTestnet, transport: http(RPC) });

async function main() {
  const execute = process.argv.includes("--execute");
  const count = await client.readContract({ ...market, functionName: "listingCount" });
  const listings = await client.readContract({ ...market, functionName: "getListings", args: [0n, count] });
  const openKg = listings.filter(l => l.active).reduce((sum, l) => sum + BigInt(l.unitsAvailable), 0n);
  const lastPrice = listings.length > 0 ? BigInt(listings[listings.length - 1].priceUsdCentsPerTonne) : 0n;
  const cents = lastPrice > 0n ? lastPrice : DEFAULT_CENTS_PER_TONNE;
  console.log(`Market ${market.address}: ${count} listings, ${Number(openKg) / 1000} t open`);

  const key = process.env.KEEPER_PRIVATE_KEY?.trim();
  const account = key ? privateKeyToAccount(`0x${key.replace(/^0x/, "")}` as Hex) : null;
  if (account) {
    const custody = await client.readContract({
      ...registry,
      functionName: "custodyBalanceOf",
      args: [account.address],
    });
    console.log(`Keeper ${account.address} holds ${Number(custody) / 1000} t in registry custody`);
  }

  if (openKg >= MIN_OPEN_KG) {
    console.log(`At least ${Number(MIN_OPEN_KG) / 1000} t is for sale; nothing to do.`);
    return;
  }
  if (!execute || !account) {
    console.log(
      `Would list up to ${Number(LISTING_KG) / 1000} t at $${Number(cents) / 100}/t (needs --execute and KEEPER_PRIVATE_KEY).`,
    );
    return;
  }

  const custody = await client.readContract({ ...registry, functionName: "custodyBalanceOf", args: [account.address] });
  const units = custody < LISTING_KG ? custody : LISTING_KG;
  if (units === 0n) {
    const ids = await client.readContract({ ...registry, functionName: "getProjectIds" });
    const operators = await Promise.all(
      ids.map(
        async id => (await client.readContract({ ...registry, functionName: "getProject", args: [id] })).operator,
      ),
    );
    const holders = await Promise.all(
      [...new Set(operators)].map(
        async operator =>
          `${operator} ${Number(await client.readContract({ ...registry, functionName: "custodyBalanceOf", args: [operator] })) / 1000} t`,
      ),
    );
    throw new Error(`The keeper account holds no custody. Plant operators: ${holders.join(", ")}`);
  }

  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http(RPC) });
  // Hashio rejects EIP-1559 fees under its minimum gas price; send legacy transactions at eth_gasPrice.
  const hash = await wallet.writeContract({
    ...market,
    functionName: "createListing",
    args: [units, cents],
    gas: 1_000_000n,
    gasPrice: await client.getGasPrice(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`createListing reverted: ${hash}`);
  console.log(
    `Listed ${Number(units) / 1000} t at $${Number(cents) / 100}/t: https://hashscan.io/testnet/transaction/${hash}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
