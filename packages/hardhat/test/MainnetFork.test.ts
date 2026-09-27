import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * CreditMarket against the real Hedera mainnet contracts, on a fork: SaucerSwap V1's factory and its public
 * WHBAR/USDC pair (0.0.1462797), and Chainlink's HBAR/USD feed. The testnet pool prices HBAR near $2, so this is
 * where the SaucerSwap check can be shown on a public pool. Hermetic runs skip it; CI runs it with
 *   HEDERA_FORKING=true HEDERA_FORK_NETWORK=mainnet HEDERA_RPC_URL=https://mainnet.hashio.io/api
 */
const FORKED = process.env.HEDERA_FORKING === "true" && process.env.HEDERA_FORK_NETWORK === "mainnet";

const CHAINLINK_HBAR_USD = "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5";
const SAUCER_FACTORY = "0x0000000000000000000000000000000000103780"; // 0.0.1062784
const SAUCER_ROUTER = "0x00000000000000000000000000000000002e7a5d"; // 0.0.3045981
const WHBAR = "0x0000000000000000000000000000000000163B5a"; // 0.0.1456986
const USDC = "0x000000000000000000000000000000000006f89a"; // 0.0.456858
const PAIR = "0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d"; // 0.0.1462797
const MAX_DEVIATION_BPS = 300;
const TWO_DAYS = 2 * 86_400;

const FEED_ABI = [
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
];
const FACTORY_ABI = ["function getPair(address, address) view returns (address)"];

(FORKED ? describe : describe.skip)("Mainnet fork: SaucerSwap and Chainlink settle the sale", function () {
  this.timeout(600_000);

  async function market() {
    const [admin] = await ethers.getSigners();
    const registry = await ethers.deployContract("DmrvRegistry", [admin.address, 9_000]);
    return ethers.deployContract("CreditMarket", [
      admin.address,
      await registry.getAddress(),
      CHAINLINK_HBAR_USD,
      10n ** 18n, // msg.value on the forked EVM is in 18 decimals
      TWO_DAYS,
      SAUCER_FACTORY,
      SAUCER_ROUTER,
    ]);
  }

  it("finds the public WHBAR/USDC pair in SaucerSwap's factory", async function () {
    const factory = await ethers.getContractAt(FACTORY_ABI, SAUCER_FACTORY);
    expect((await factory.getPair(WHBAR, USDC)).toLowerCase()).to.equal(PAIR.toLowerCase());
  });

  it("settles at mainnet Chainlink only while that pair agrees within 3%", async function () {
    const m = await market();
    await expect(m.settlementPrice()).to.be.revertedWithCustomError(m, "InvalidPoolGuard");

    await m.setPoolGuard(PAIR, false, WHBAR, 8, 6, MAX_DEVIATION_BPS, 1_000n * 10n ** 6n, true);
    const feed = await ethers.getContractAt(FEED_ABI, CHAINLINK_HBAR_USD);
    const [, answer] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    const [price, priceDecimals] = await m.settlementPrice();
    expect(price).to.equal(answer);
    expect(priceDecimals).to.equal(decimals);

    const pool = await m.poolHbarUsd(decimals);
    const deviationBps = ((pool > price ? pool - price : price - pool) * 10_000n) / price;
    console.log(
      `      pair ${ethers.formatUnits(pool, decimals)} USD/HBAR, Chainlink ${ethers.formatUnits(price, decimals)}, ${deviationBps} bps`,
    );
    expect(deviationBps).to.be.lte(BigInt(MAX_DEVIATION_BPS));
  });

  it("refuses a pool SaucerSwap's factory did not create, even one priced exactly at Chainlink", async function () {
    const m = await market();
    const [, answer] = await (await ethers.getContractAt(FEED_ABI, CHAINLINK_HBAR_USD)).latestRoundData();
    const impostor = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
    // 1,000,000 HBAR against the USDC Chainlink says it is worth, 8-decimal feed to 6-decimal USDC.
    await impostor.setReserves((answer * 1_000_000n) / 100n, 1_000_000n * 10n ** 8n);
    await impostor.setFactory(SAUCER_FACTORY);
    await expect(
      m.setPoolGuard(await impostor.getAddress(), false, WHBAR, 8, 6, MAX_DEVIATION_BPS, 0, true),
    ).to.be.revertedWithCustomError(m, "InvalidPoolGuard");
  });
});
