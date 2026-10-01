/**
 * One sale through `UsdCheckout` on Hedera mainnet, so the settlement runs against SaucerSwap's public WHBAR/USDC pair
 * 0.0.1462797 and the seller is paid real USDC. The Mainnet checkout workflow runs the steps in order:
 *
 *   yarn mainnet:checkout plan      read-only: the pair against Chainlink, whether a sale would settle now, the HBAR
 *                                   it needs; with SELLER_PRIVATE_KEY also the accounts, balances and associations
 *   yarn mainnet:checkout prepare   create the labelled test token (fixed supply 10, no admin key, "not a carbon
 *                                   credit"), associate the seller with USDC and fund the buyer
 *   (deploy)                        yarn deploy --network hederaMainnet --tags MainnetCheckout
 *   yarn mainnet:checkout buy       list, buy, and prove the swap: a log from the pair and the seller's USDC delta
 *
 * The seller is SELLER_PRIVATE_KEY, an ECDSA account whose EVM address is its alias. The buyer is BUYER_PRIVATE_KEY, or
 * a key derived from the seller's, which the same person then holds: the exhibit proves the settlement path, not an
 * arm's-length trade. HEDERA_NETWORK=testnet rehearses every step on testnet's seeded pair and QUSD.
 *
 * What is sold is a test token, not a carbon credit: the registry refuses demo plants on mainnet.
 */
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  type Address,
  type Hex,
  concat,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { hedera, hederaTestnet } from "viem/chains";
import { deviationBps, hbarUsd8FromReserves } from "~~/services/mrv/saucerswap";
import { fetchUpstream, isUpstreamTimeout } from "~~/services/mrv/upstream";

const NETWORKS = {
  mainnet: {
    chain: hedera,
    rpc: "https://mainnet.hashio.io/api",
    mirror: "https://mainnet.mirrornode.hedera.com/api/v1",
    chainlink: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
    pair: "0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d", // 0.0.1462797
    usd: { id: "0.0.456858", symbol: "USDC" },
    deployment: "hederaMainnet",
  },
  testnet: {
    chain: hederaTestnet,
    rpc: "https://testnet.hashio.io/api",
    mirror: "https://testnet.mirrornode.hedera.com/api/v1",
    chainlink: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
    pair: "0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869", // the seeded exhibit pair
    usd: { id: "0.0.10729568", symbol: "QUSD" },
    deployment: "hederaTestnet",
  },
} as const;

const NETWORK = process.env.HEDERA_NETWORK === "testnet" ? "testnet" : "mainnet";
const NET = NETWORKS[NETWORK];
const MAX_DEVIATION_BPS = 300n;
const TOKEN = {
  name: "Hydro dMRV settlement test (not a carbon credit)",
  symbol: "DMRVTEST",
  memo: "Test of UsdCheckout settlement through SaucerSwap. Not a carbon credit; no value.",
  supply: 10,
};
const PRICE_USD_CENTS = BigInt(process.env.PRICE_USD_CENTS || 100); // per whole token (0 decimals)
const LIST_UNITS = BigInt(process.env.LIST_UNITS || 2);
const BUY_UNITS = BigInt(process.env.BUY_UNITS || 1);
const BUYER_HBAR = Number(process.env.BUYER_HBAR || 20);
/** On Hedera's JSON-RPC relay a transaction's value is in weibar: 1 tinybar = 1e10. */
const WEIBAR_PER_TINYBAR = 10_000_000_000n;
/** Gas limits the steps send. Hedera charges at least 80% of the limit, so the estimate uses that. */
const GAS = { feed: 1_500_000n, checkout: 3_000_000n, guard: 300_000n, approve: 1_000_000n, list: 2_000_000n };
const BUY_GAS = 2_000_000n;
const ASSOCIATE_GAS = 1_000_000n;

const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function getReserves() view returns (uint112, uint112, uint32)",
]);
const FEED_ABI = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);
const TOKEN_ABI = parseAbi([
  "function associate() returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const CHECKOUT_ABI = parseAbi([
  "function settlementPrice() view returns (uint256 answer, uint8 decimals)",
  "function listingCount() view returns (uint256)",
  "function getListings(uint256 start, uint256 count) view returns ((address seller, address token, uint64 available, uint64 priceUsdCentsPerToken, uint8 tokenDecimals, bool active)[])",
  "function createListing(address token, uint64 amount, uint64 priceUsdCentsPerToken) returns (uint256)",
  "function quote(uint256 listingId, uint64 amount) view returns (uint256)",
  "function minUsdOut(uint256 listingId, uint64 amount) view returns (uint256)",
  "function buy(uint256 listingId, uint64 amount) payable",
]);

const client = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) });
const hashscan = (path: string) => `https://hashscan.io/${NETWORK}/${path}`;
const evmOf = (id: string) => getAddress(`0x${BigInt(id.split(".")[2]).toString(16).padStart(40, "0")}`);
const hex32 = (value: string) => `0x${value.trim().replace(/^0x/, "")}` as Hex;

type MirrorAccount = { account: string; evm_address: string; balance: { balance: number } };

async function mirror<T>(path: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetchUpstream(fetch, `${NET.mirror}${path}`);
  } catch (error) {
    if (isUpstreamTimeout(error)) throw new Error(`mirror ${path}: timed out`);
    throw error;
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`mirror ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

const accountOf = (address: Address) => mirror<MirrorAccount>(`/accounts/${address}`);

async function isAssociated(accountId: string, tokenId: string): Promise<boolean> {
  const body = await mirror<{ tokens: unknown[] }>(`/accounts/${accountId}/tokens?token.id=${tokenId}`);
  return Boolean(body?.tokens.length);
}

/** The pair against Chainlink, both as 8-decimal USD per HBAR; the same maths as `UsdSettlement`. */
async function readPool() {
  const [token0, [r0, r1], round] = await Promise.all([
    client.readContract({ address: NET.pair, abi: PAIR_ABI, functionName: "token0" }),
    client.readContract({ address: NET.pair, abi: PAIR_ABI, functionName: "getReserves" }),
    client.readContract({ address: NET.chainlink, abi: FEED_ABI, functionName: "latestRoundData" }),
  ]);
  const usdIsToken0 = getAddress(token0) === evmOf(NET.usd.id);
  const pool8 = hbarUsd8FromReserves(BigInt(usdIsToken0 ? r0 : r1), BigInt(usdIsToken0 ? r1 : r0));
  const oracle8 = round[1];
  const bps = deviationBps(oracle8, pool8);
  return {
    pool8,
    oracle8,
    bps,
    accepted: bps <= MAX_DEVIATION_BPS,
    oracleAgeSeconds: Date.now() / 1000 - Number(round[3]),
  };
}

function sellerAccount(): PrivateKeyAccount | null {
  const key = process.env.SELLER_PRIVATE_KEY?.trim();
  return key ? privateKeyToAccount(hex32(key)) : null;
}

/** BUYER_PRIVATE_KEY, or a key derived from the seller's (so only the seller's secret can recompute it). */
function buyerAccount(seller: Hex): PrivateKeyAccount {
  const explicit = process.env.BUYER_PRIVATE_KEY?.trim();
  if (explicit) return privateKeyToAccount(hex32(explicit));
  return privateKeyToAccount(keccak256(concat([seller, toHex(`hydro-dmrv ${NETWORK} settlement buyer`)])));
}

function checkoutAddress(): Address | null {
  if (process.env.CHECKOUT_ADDRESS) return getAddress(process.env.CHECKOUT_ADDRESS);
  const file = join(__dirname, "..", "..", "hardhat", "deployments", NET.deployment, "UsdCheckout.json");
  return existsSync(file) ? getAddress(JSON.parse(readFileSync(file, "utf8")).address) : null;
}

/** HBAR the whole run costs the seller at today's gas price and HBAR price (fees rounded up). */
function estimateHbar(gasPriceWeibar: bigint, hbarUsd: number) {
  const tinybarPerGas = Number(gasPriceWeibar / WEIBAR_PER_TINYBAR);
  const gasHbar = (gas: bigint) => (Number(gas) * 0.8 * tinybarPerGas) / 1e8;
  const usd = (dollars: number) => dollars / hbarUsd;
  const seller = {
    deploy: gasHbar(GAS.feed) + gasHbar(GAS.checkout) + gasHbar(GAS.guard),
    tokenCreate: usd(1),
    usdAssociate: usd(0.05),
    fundBuyer: BUYER_HBAR + usd(0.05),
    list: gasHbar(GAS.approve) + gasHbar(GAS.list),
  };
  const buyer = gasHbar(ASSOCIATE_GAS) + gasHbar(BUY_GAS) + usd(Number(PRICE_USD_CENTS * BUY_UNITS) / 100) * 1.01;
  const total = Object.values(seller).reduce((a, b) => a + b, 0);
  return { tinybarPerGas, seller, sellerTotal: Math.ceil(total * 1.25), buyer: Math.ceil(buyer * 1.25) };
}

function summary(lines: string[]) {
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n\n`);
}

async function plan() {
  const [pool, gasPrice] = await Promise.all([readPool(), client.getGasPrice()]);
  const hbarUsd = Number(pool.oracle8) / 1e8;
  const cost = estimateHbar(gasPrice, hbarUsd);
  const lines = [
    `### ${NETWORK} settlement plan`,
    "",
    `- Pair ${NET.pair}: $${(Number(pool.pool8) / 1e8).toFixed(6)} per HBAR; Chainlink $${hbarUsd.toFixed(6)} (${Math.round(pool.oracleAgeSeconds)} s old); ${pool.bps} bps: ${pool.accepted ? "within" : "OUTSIDE"} the 300 bps band, so a sale would ${pool.accepted ? "settle" : "revert"} now`,
    `- Gas price ${cost.tinybarPerGas} tinybar; the seller spends about ${cost.sellerTotal} HBAR (deploy ${cost.seller.deploy.toFixed(2)}, token ${cost.seller.tokenCreate.toFixed(2)}, ${NET.usd.symbol} association ${cost.seller.usdAssociate.toFixed(2)}, buyer funding ${cost.seller.fundBuyer.toFixed(2)}, listing ${cost.seller.list.toFixed(2)}; +25%); the buyer needs about ${cost.buyer} HBAR of the ${BUYER_HBAR} it is sent`,
  ];
  const seller = sellerAccount();
  const checkout = checkoutAddress();
  if (checkout) {
    try {
      const [answer] = await client.readContract({
        address: checkout,
        abi: CHECKOUT_ABI,
        functionName: "settlementPrice",
      });
      lines.push(
        `- UsdCheckout ${checkout}: settlementPrice ${Number(answer) / 1e8} (the contract's own guard passes)`,
      );
    } catch (error) {
      lines.push(`- UsdCheckout ${checkout}: settlementPrice reverts (${(error as Error).message.split("\n")[0]})`);
    }
  }
  let ready = pool.accepted;
  if (seller) {
    const account = await accountOf(seller.address);
    if (!account) {
      lines.push(
        `- Seller ${seller.address}: no Hedera account has this EVM address. Create an ECDSA account with an EVM alias.`,
      );
      ready = false;
    } else {
      const hbar = account.balance.balance / 1e8;
      const buyer = buyerAccount(hex32(process.env.SELLER_PRIVATE_KEY!));
      const buyerAccountInfo = await accountOf(buyer.address);
      lines.push(
        `- Seller ${account.account} (${seller.address}): ${hbar.toFixed(2)} HBAR${hbar < cost.sellerTotal ? `, SHORT of ${cost.sellerTotal}` : ""}; ${NET.usd.symbol} ${(await isAssociated(account.account, NET.usd.id)) ? "associated" : "not yet associated"}`,
        `- Buyer ${buyer.address}: ${buyerAccountInfo ? `${buyerAccountInfo.account}, ${(buyerAccountInfo.balance.balance / 1e8).toFixed(2)} HBAR` : "not created yet (prepare funds it)"}${process.env.BUYER_PRIVATE_KEY ? "" : "; derived from the seller's key"}`,
      );
      ready &&= hbar >= cost.sellerTotal;
    }
  } else {
    lines.push("- No SELLER_PRIVATE_KEY: accounts not checked");
    summary([
      ...lines,
      "",
      pool.accepted
        ? "The pair would settle now; set SELLER_PRIVATE_KEY to check the accounts."
        : "Not ready: the pair is outside the band.",
    ]);
    return false;
  }
  lines.push("", ready ? "Ready." : "Not ready: see above.");
  summary(lines);
  return ready;
}

function sdkClient(seller: PrivateKeyAccount, accountId: string) {
  const key = PrivateKey.fromStringECDSA(process.env.SELLER_PRIVATE_KEY!.trim().replace(/^0x/, ""));
  if (`0x${key.publicKey.toEvmAddress()}`.toLowerCase() !== seller.address.toLowerCase()) {
    throw new Error("SELLER_PRIVATE_KEY is not the ECDSA key of the seller's EVM address");
  }
  const base = NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  return base.setOperator(AccountId.fromString(accountId), key);
}

/** An existing DMRVTEST token this seller is treasury of, so a re-run does not create a second one. */
async function findTestToken(accountId: string): Promise<string | null> {
  const held = await mirror<{ tokens: { token_id: string; symbol: string }[] }>(
    `/tokens?account.id=${accountId}&limit=100`,
  );
  for (const token of held?.tokens ?? []) {
    if (token.symbol !== TOKEN.symbol) continue;
    const info = await mirror<{ treasury_account_id: string }>(`/tokens/${token.token_id}`);
    if (info?.treasury_account_id === accountId) return token.token_id;
  }
  return null;
}

async function prepare() {
  if (!(await plan())) throw new Error("The plan is not ready; nothing was sent");
  const seller = sellerAccount()!;
  const { account: sellerId } = (await accountOf(seller.address))!;
  const sdk = sdkClient(seller, sellerId);
  const lines = [`### ${NETWORK} prepare`, ""];
  try {
    if (!(await isAssociated(sellerId, NET.usd.id))) {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(sellerId)
        .setTokenIds([TokenId.fromString(NET.usd.id)])
        .setMaxTransactionFee(new Hbar(5))
        .execute(sdk);
      await tx.getReceipt(sdk);
      lines.push(`- Seller associated with ${NET.usd.symbol}: ${hashscan(`transaction/${tx.transactionId}`)}`);
    }

    let tokenId = process.env.TOKEN_ID || (await findTestToken(sellerId));
    if (!tokenId) {
      const tx = await new TokenCreateTransaction()
        .setTokenName(TOKEN.name)
        .setTokenSymbol(TOKEN.symbol)
        .setTokenMemo(TOKEN.memo)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(0)
        .setInitialSupply(TOKEN.supply)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(TOKEN.supply)
        .setTreasuryAccountId(sellerId)
        // An HTS token create costs about $1; the SDK's default ceiling (2 HBAR) is below that.
        .setMaxTransactionFee(new Hbar(40))
        .execute(sdk);
      tokenId = (await tx.getReceipt(sdk)).tokenId!.toString();
      lines.push(
        `- Created ${TOKEN.symbol} ${tokenId} (supply ${TOKEN.supply}, no admin or supply key): ${hashscan(`transaction/${tx.transactionId}`)}`,
      );
    } else {
      lines.push(`- Reusing ${TOKEN.symbol} ${tokenId}`);
    }

    const buyer = buyerAccount(hex32(process.env.SELLER_PRIVATE_KEY!));
    const existing = await accountOf(buyer.address);
    const short = BUYER_HBAR - (existing ? existing.balance.balance / 1e8 : 0);
    if (short > 1) {
      // A transfer to an EVM address creates a hollow account; its first signed transaction completes it (HIP-583).
      const tinybar = BigInt(Math.round(short * 1e8));
      const tx = await new TransferTransaction()
        .addHbarTransfer(sellerId, Hbar.fromTinybars((-tinybar).toString()))
        .addHbarTransfer(AccountId.fromEvmAddress(0, 0, buyer.address), Hbar.fromTinybars(tinybar.toString()))
        .setMaxTransactionFee(new Hbar(5))
        .execute(sdk);
      await tx.getReceipt(sdk);
      lines.push(
        `- Funded the buyer ${buyer.address} with ${short.toFixed(2)} HBAR: ${hashscan(`transaction/${tx.transactionId}`)}`,
      );
    }
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `TOKEN_ID=${tokenId}\n`);
    summary(lines);
  } finally {
    sdk.close();
  }
}

const walletOf = (account: PrivateKeyAccount) =>
  createWalletClient({ account, chain: NET.chain, transport: http(NET.rpc) });

/** Sends one EVM transaction at the relay's legacy gas price (Hashio wants one) and requires success. */
async function send(label: string, write: (gasPrice: bigint) => Promise<Hex>) {
  const hash = await write(await client.getGasPrice());
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hashscan(`transaction/${hash}`)}`);
  console.log(`${label}: ${hashscan(`transaction/${hash}`)}`);
  return receipt;
}

async function buy() {
  const seller = sellerAccount();
  if (!seller) throw new Error("Set SELLER_PRIVATE_KEY");
  const tokenId = process.env.TOKEN_ID;
  if (!tokenId) throw new Error("Set TOKEN_ID (prepare writes it)");
  const checkout = checkoutAddress();
  if (!checkout) throw new Error(`Set CHECKOUT_ADDRESS or deploy UsdCheckout to ${NET.deployment}`);
  const token = evmOf(tokenId);
  const usd = evmOf(NET.usd.id);
  const buyer = buyerAccount(hex32(process.env.SELLER_PRIVATE_KEY!));
  // The contract's own guard, before anything is sent.
  const [price] = await client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "settlementPrice" });

  const count = await client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "listingCount" });
  const listings = await client.readContract({
    address: checkout,
    abi: CHECKOUT_ABI,
    functionName: "getListings",
    args: [0n, count],
  });
  let listingId = listings.findIndex(
    l =>
      l.active && getAddress(l.seller) === seller.address && getAddress(l.token) === token && l.available >= BUY_UNITS,
  );
  if (listingId < 0) {
    await send(`Approve the checkout for ${LIST_UNITS} ${TOKEN.symbol}`, gasPrice =>
      walletOf(seller).writeContract({
        address: token,
        abi: TOKEN_ABI,
        functionName: "approve",
        args: [checkout, LIST_UNITS],
        gas: GAS.approve,
        gasPrice,
      }),
    );
    await send(`List ${LIST_UNITS} ${TOKEN.symbol} at $${Number(PRICE_USD_CENTS) / 100} each`, gasPrice =>
      walletOf(seller).writeContract({
        address: checkout,
        abi: CHECKOUT_ABI,
        functionName: "createListing",
        args: [token, LIST_UNITS, PRICE_USD_CENTS],
        gas: GAS.list,
        gasPrice,
      }),
    );
    listingId = Number(count);
  }

  const buyerInfo = await accountOf(buyer.address);
  if (!buyerInfo) throw new Error(`The buyer ${buyer.address} has no account; run prepare`);
  if (!(await isAssociated(buyerInfo.account, tokenId))) {
    // HIP-719: an EOA associates by calling the token. A second call returns 194 and changes nothing.
    await send(`Buyer associates with ${TOKEN.symbol}`, gasPrice =>
      walletOf(buyer).writeContract({
        address: token,
        abi: TOKEN_ABI,
        functionName: "associate",
        gas: ASSOCIATE_GAS,
        gasPrice,
      }),
    );
  }

  const id = BigInt(listingId);
  const [quote, minOut, usdBefore, tokensBefore] = await Promise.all([
    client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "quote", args: [id, BUY_UNITS] }),
    client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "minUsdOut", args: [id, BUY_UNITS] }),
    client.readContract({ address: usd, abi: TOKEN_ABI, functionName: "balanceOf", args: [seller.address] }),
    client.readContract({ address: token, abi: TOKEN_ABI, functionName: "balanceOf", args: [buyer.address] }),
  ]);
  const receipt = await send(`Buy ${BUY_UNITS} ${TOKEN.symbol} for ${Number(quote) / 1e8} HBAR`, gasPrice =>
    walletOf(buyer).writeContract({
      address: checkout,
      abi: CHECKOUT_ABI,
      functionName: "buy",
      args: [id, BUY_UNITS],
      value: ((quote * 101n) / 100n) * WEIBAR_PER_TINYBAR, // 1% headroom; the contract refunds the excess
      gas: BUY_GAS,
      gasPrice,
    }),
  );

  const [usdAfter, tokensAfter] = await Promise.all([
    client.readContract({ address: usd, abi: TOKEN_ABI, functionName: "balanceOf", args: [seller.address] }),
    client.readContract({ address: token, abi: TOKEN_ABI, functionName: "balanceOf", args: [buyer.address] }),
  ]);
  const pairLogs = receipt.logs.filter(l => getAddress(l.address) === getAddress(NET.pair)).length;
  const usdPaid = usdAfter - usdBefore;
  const evidence = {
    network: NETWORK,
    transaction: hashscan(`transaction/${receipt.transactionHash}`),
    checkout,
    pair: NET.pair,
    oracleUsdPerHbar: Number(price) / 1e8,
    quoteTinybar: quote.toString(),
    sellerUsdReceived: usdPaid.toString(),
    sellerUsdMinimum: minOut.toString(),
    buyerTokensReceived: (tokensAfter - tokensBefore).toString(),
    pairLogs,
  };
  writeFileSync(process.env.EVIDENCE_FILE || `${NETWORK}-checkout.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  summary([
    `### ${NETWORK} sale`,
    "",
    `- ${evidence.transaction}`,
    `- The buyer paid ${Number(quote) / 1e8} HBAR at $${evidence.oracleUsdPerHbar} per HBAR; the pair emitted ${pairLogs} log(s); the seller received ${Number(usdPaid) / 1e6} ${NET.usd.symbol} (at least ${Number(minOut) / 1e6} required); the buyer received ${evidence.buyerTokensReceived} ${TOKEN.symbol}`,
  ]);
  if (pairLogs === 0 || usdPaid < minOut || tokensAfter - tokensBefore !== BUY_UNITS) {
    throw new Error("The sale succeeded but the swap evidence is not what the settlement promises");
  }
}

const command = process.argv[2] ?? "plan";
const run = { plan: async () => void (await plan()), prepare, buy }[command];
if (!run) {
  console.error("Usage: yarn mainnet:checkout plan | prepare | buy");
  process.exit(1);
}
run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
