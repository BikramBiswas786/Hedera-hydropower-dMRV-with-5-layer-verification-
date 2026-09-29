import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const HOUR = 3_600;
const MAX_AGE = 2 * HOUR;
const MAX_DEVIATION_BPS = 300;
const SUPRA_HBAR_USDT = 75;
const PRIMARY = 1n;
const FALLBACK = 2n;

async function feedFixture() {
  const chainlink = await ethers.deployContract("MockV3Aggregator", [8, 25_000_000n]); // $0.25, 8 decimals
  const supra = await ethers.deployContract("MockSupraSValueFeed");
  const now = BigInt(await time.latest());
  // Supra on Hedera reports 18 decimals and millisecond timestamps.
  await supra.setPrice(SUPRA_HBAR_USDT, 251n * 10n ** 15n, 18, now * 1_000n);

  const feed = await ethers.deployContract("ResilientHbarUsdFeed", [
    await chainlink.getAddress(),
    await supra.getAddress(),
    SUPRA_HBAR_USDT,
    MAX_AGE,
    MAX_DEVIATION_BPS,
  ]);
  return { chainlink, supra, feed, supraUpdatedAt: now };
}

describe("ResilientHbarUsdFeed", function () {
  it("uses Chainlink when both sources are fresh and agree", async function () {
    const { feed } = await loadFixture(feedFixture);

    const [, answer] = await feed.latestRoundData();
    expect(answer).to.equal(25_000_000n);
    expect((await feed.resolve()).source).to.equal(PRIMARY);
  });

  it("normalises Supra's 18 decimals and millisecond timestamps", async function () {
    const { feed, supraUpdatedAt } = await loadFixture(feedFixture);

    const [, fallback] = await feed.readSources();
    expect(fallback.answer).to.equal(25_100_000n);
    expect(fallback.updatedAt).to.equal(supraUpdatedAt);
    expect(fallback.fresh).to.equal(true);
  });

  it("falls back to Supra when Chainlink is stale", async function () {
    const { chainlink, feed } = await loadFixture(feedFixture);
    await chainlink.setUpdatedAt(BigInt(await time.latest()) - BigInt(MAX_AGE) - 1n);

    const [, answer] = await feed.latestRoundData();
    expect(answer).to.equal(25_100_000n);
    expect((await feed.resolve()).source).to.equal(FALLBACK);
  });

  it("falls back to Supra when Chainlink reports a non-positive answer", async function () {
    const { chainlink, feed } = await loadFixture(feedFixture);
    await chainlink.updateAnswer(0);

    expect((await feed.resolve()).source).to.equal(FALLBACK);
  });

  it("keeps pricing from Chainlink when Supra is unavailable or stale", async function () {
    const { supra, feed } = await loadFixture(feedFixture);

    await supra.setBroken(true);
    expect((await feed.resolve()).source).to.equal(PRIMARY);

    await supra.setBroken(false);
    await supra.setPrice(SUPRA_HBAR_USDT, 251n * 10n ** 15n, 18, 1_000);
    expect((await feed.resolve()).source).to.equal(PRIMARY);
  });

  it("refuses to answer when fresh sources disagree beyond the bound", async function () {
    const { chainlink, feed } = await loadFixture(feedFixture);
    await chainlink.updateAnswer(30_000_000n); // $0.30 vs Supra $0.251 → ~19.5%

    await expect(feed.latestRoundData())
      .to.be.revertedWithCustomError(feed, "PriceSourcesDisagree")
      .withArgs(30_000_000n, 25_100_000n, 1_952);
  });

  it("reverts when neither source is fresh", async function () {
    const { feed } = await loadFixture(feedFixture);
    await time.increase(MAX_AGE + 1);

    await expect(feed.latestRoundData()).to.be.revertedWithCustomError(feed, "NoFreshPrice");
    const [primary, fallback] = await feed.readSources();
    expect(primary.fresh || fallback.fresh).to.equal(false);
  });

  it("settles a credit purchase through the fallback during a Chainlink outage", async function () {
    const { chainlink, supra, feed } = await loadFixture(feedFixture);
    const [admin, operator, buyer] = await ethers.getSigners();
    const helpers = await import("./helpers/dmrv");
    const { ensureHts } = await import("./helpers/hts");
    await ensureHts();
    await helpers.ensureSaucerFactory();

    const registry = await ethers.deployContract("DmrvRegistry", [admin.address, 9_000]);
    const module = await ethers.deployContract("HydroVmr0017Module");
    const router = await ethers.deployContract("MockSaucerRouter");
    const market = await ethers.deployContract("CreditMarket", [
      admin.address,
      await registry.getAddress(),
      await feed.getAddress(),
      10n ** 18n,
      HOUR,
      helpers.SAUCER_FACTORY,
      await router.getAddress(),
    ]);
    await registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", "", { value: ethers.parseEther("20") });
    await registry.setModuleApproved(await module.getAddress(), true);
    await registry.setMarket(await market.getAddress());
    await registry.grantRole(await registry.VERIFIER_ROLE(), helpers.VVB.address);
    await registry.setAuditTopic(helpers.AUDIT_TOPIC);
    const params = await helpers.hydroParams();
    await helpers.registerValidated(
      registry,
      await module.getAddress(),
      helpers.encodeParams(params),
      params.designHash,
      { operator: operator.address },
    );
    const metered = { netWh: 400_000n, grossWh: 410_000n, fuelG: 0n, leakageG: 0n };
    await helpers.submitPeriod(registry, await helpers.periodInput(helpers.PROJECT_ID, { metered }), operator);
    await market.connect(operator).createListing(400, 1_250);
    const WHBAR = "0x0000000000000000000000000000000000003aD2";
    const USDC = "0x0000000000000000000000000000000000001549";
    const pair = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
    await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
    await pair.setFactory(helpers.SAUCER_FACTORY);
    await (await helpers.ensureSaucerFactory()).setPair(USDC, WHBAR, await pair.getAddress());
    await market.setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 10_000n * 10n ** 6n, true);

    await chainlink.setUpdatedAt(0);
    await supra.setPrice(SUPRA_HBAR_USDT, 25n * 10n ** 16n, 18, BigInt(await time.latest()) * 1_000n);

    const cost = await market.quote(0, 400);
    expect(cost).to.equal(20n * 10n ** 18n); // 400 kg at $12.50/t = $5.00 at the Supra price of $0.25
    await expect(market.connect(buyer).buyAndRetire(0, 400, "outage-proof", { value: cost })).to.emit(
      registry,
      "Retired",
    );
  });

  it("rejects an invalid configuration", async function () {
    const { chainlink, supra } = await loadFixture(feedFixture);
    const factory = await ethers.getContractFactory("ResilientHbarUsdFeed");

    await expect(
      factory.deploy(await chainlink.getAddress(), await supra.getAddress(), SUPRA_HBAR_USDT, MAX_AGE, 0),
    ).to.be.revertedWithCustomError(factory, "InvalidConfig");
    await expect(
      factory.deploy(ethers.ZeroAddress, await supra.getAddress(), SUPRA_HBAR_USDT, MAX_AGE, 300),
    ).to.be.revertedWithCustomError(factory, "InvalidConfig");
  });
});
