import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  AUDIT_TOPIC,
  METER,
  PROJECT_ID,
  VVB,
  encodeParams,
  hydroParams,
  periodInput,
  submitPeriod,
} from "./helpers/dmrv";

/**
 * CreditMarket against the real Hedera mainnet contracts, on a fork: SaucerSwap V1's factory, router and public
 * WHBAR/USDC pair (0.0.1462797), and Chainlink's HBAR/USD feed. The testnet pool prices HBAR near $2, so this is
 * where the SaucerSwap check and swap can be shown on a public pool. Hermetic runs skip it; CI runs it with
 *   HEDERA_FORKING=true HEDERA_FORK_NETWORK=mainnet HEDERA_RPC_URL=https://mainnet.hashio.io/api HEDERA_FORK_BLOCK=<n>
 */
const FORKED = process.env.HEDERA_FORKING === "true" && process.env.HEDERA_FORK_NETWORK === "mainnet";
const RPC = process.env.HEDERA_RPC_URL ?? "https://mainnet.hashio.io/api";

const CHAINLINK_HBAR_USD = "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5";
const SAUCER_FACTORY = "0x0000000000000000000000000000000000103780"; // 0.0.1062784
const SAUCER_ROUTER = "0x00000000000000000000000000000000002e7a5d"; // 0.0.3045981
const WHBAR = "0x0000000000000000000000000000000000163B5a"; // 0.0.1456986
const USDC = "0x000000000000000000000000000000000006f89a"; // 0.0.456858
const PAIR = "0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d"; // 0.0.1462797
const MAX_DEVIATION_BPS = 300;
const TWO_DAYS = 2 * 86_400;
const TINYBAR_PER_HBAR = 10n ** 8n; // what msg.value means on Hedera, and what the WHBAR helper mints from
const PRICE_CENTS_PER_TONNE = 1_500n; // $15/t

const FEED_ABI = [
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
];
const FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
const ROUTER_ABI = ["function WHBAR() view returns (address)"];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await response.json()) as { result: string }).result;
}

/**
 * The forking plugin answers `eth_getCode` for a long-zero address (0x000…<entity num>) only when it is an HTS
 * token, and returns empty code for a contract such as SaucerSwap's factory or router. Load their real bytecode
 * from the relay at the forked block; their storage still comes from the fork as usual.
 */
async function loadContractCode(address: string) {
  const block = process.env.HEDERA_FORK_BLOCK;
  const code = await rpc("eth_getCode", [address, block ? `0x${Number(block).toString(16)}` : "latest"]);
  expect(code.length, `no code on mainnet at ${address}`).to.be.greaterThan(2);
  await network.provider.send("hardhat_setCode", [address, code]);
}

(FORKED ? describe : describe.skip)("Mainnet fork: SaucerSwap and Chainlink settle the sale", function () {
  this.timeout(600_000);

  before(async function () {
    await loadContractCode(SAUCER_FACTORY);
    await loadContractCode(SAUCER_ROUTER);
    const whbarHelper = await (await ethers.getContractAt(ROUTER_ABI, SAUCER_ROUTER)).WHBAR();
    if (/^0x0{24}/i.test(whbarHelper) && whbarHelper.toLowerCase() !== WHBAR.toLowerCase()) {
      await loadContractCode(whbarHelper);
    }
  });

  async function deploy(nativeUnitsPerHbar = 10n ** 18n) {
    const [admin, operator, buyer] = await ethers.getSigners();
    const registry = await ethers.deployContract("DmrvRegistry", [admin.address, 9_000]);
    const market = await ethers.deployContract("CreditMarket", [
      admin.address,
      await registry.getAddress(),
      CHAINLINK_HBAR_USD,
      nativeUnitsPerHbar,
      TWO_DAYS,
      SAUCER_FACTORY,
      SAUCER_ROUTER,
    ]);
    return { registry, market, admin, operator, buyer };
  }

  it("finds the public WHBAR/USDC pair in SaucerSwap's factory", async function () {
    const factory = await ethers.getContractAt(FACTORY_ABI, SAUCER_FACTORY);
    expect((await factory.getPair(WHBAR, USDC)).toLowerCase()).to.equal(PAIR.toLowerCase());
  });

  it("settles at mainnet Chainlink only while that pair agrees within 3%", async function () {
    const { market } = await deploy();
    await expect(market.settlementPrice()).to.be.revertedWithCustomError(market, "InvalidPoolGuard");

    await market.setPoolGuard(PAIR, false, WHBAR, 8, 6, MAX_DEVIATION_BPS, 1_000n * 10n ** 6n, true);
    const feed = await ethers.getContractAt(FEED_ABI, CHAINLINK_HBAR_USD);
    const [, answer] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    const [price, priceDecimals] = await market.settlementPrice();
    expect(price).to.equal(answer);
    expect(priceDecimals).to.equal(decimals);

    const pool = await market.poolHbarUsd(decimals);
    const deviationBps = ((pool > price ? pool - price : price - pool) * 10_000n) / price;
    console.log(
      `      pair ${ethers.formatUnits(pool, decimals)} USD/HBAR, Chainlink ${ethers.formatUnits(price, decimals)}, ${deviationBps} bps`,
    );
    expect(deviationBps).to.be.lte(BigInt(MAX_DEVIATION_BPS));
  });

  it("refuses a pool SaucerSwap's factory did not create, even one priced exactly at Chainlink", async function () {
    const { market } = await deploy();
    const [, answer] = await (await ethers.getContractAt(FEED_ABI, CHAINLINK_HBAR_USD)).latestRoundData();
    const impostor = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
    // 1,000,000 HBAR against the USDC Chainlink says it is worth, 8-decimal feed to 6-decimal USDC.
    await impostor.setReserves((answer * 1_000_000n) / 100n, 1_000_000n * 10n ** 8n);
    await impostor.setFactory(SAUCER_FACTORY);
    await expect(
      market.setPoolGuard(await impostor.getAddress(), false, WHBAR, 8, 6, MAX_DEVIATION_BPS, 0, true),
    ).to.be.revertedWithCustomError(market, "InvalidPoolGuard");
  });

  it("buys and retires credits by swapping the buyer's HBAR into USDC for the seller through SaucerSwap", async function () {
    const { registry, market, operator, buyer } = await deploy(TINYBAR_PER_HBAR);
    const module = await ethers.deployContract("HydroVmr0017Module");
    await registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", "fork credit", {
      value: ethers.parseEther("20"),
    });
    await registry.createCertificateToken("Hydro dMRV Retirement", "HYRET", "fork retirement", {
      value: ethers.parseEther("20"),
    });
    await registry.setModuleApproved(await module.getAddress(), true);
    await registry.setMarket(await market.getAddress());
    await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
    await registry.setAuditTopic(AUDIT_TOPIC);
    const params = await hydroParams();
    await registry.registerProject(
      PROJECT_ID,
      "Fork run-of-river",
      await module.getAddress(),
      operator.address,
      METER.address,
      params.designHash,
      encodeParams(params),
    );
    await submitPeriod(registry, await periodInput(PROJECT_ID)); // meter + VVB signed: 450 kg to the operator
    await market.connect(operator).createListing(400, PRICE_CENTS_PER_TONNE);
    await market.setPoolGuard(PAIR, false, WHBAR, 8, 6, MAX_DEVIATION_BPS, 1_000n * 10n ** 6n, true);

    const units = 100n; // 0.1 t for $1.50
    const cost = await market.quote(0, units);
    const minOut = await market.minUsdOut(0, units);
    const usdc = await ethers.getContractAt(ERC20_ABI, USDC);
    const before = await usdc.balanceOf(operator.address);

    await expect(market.connect(buyer).buyAndRetire(0, units, "Mainnet fork", { value: cost })).to.emit(
      market,
      "PurchasedAndRetired",
    );
    const received = (await usdc.balanceOf(operator.address)) - before;
    console.log(
      `      paid ${ethers.formatUnits(cost, 8)} HBAR, seller received ${ethers.formatUnits(received, 6)} USDC (min ${ethers.formatUnits(minOut, 6)})`,
    );
    expect(received).to.be.gte(minOut);
    expect(await registry.totalRetiredUnits()).to.equal(units);
  });
});
