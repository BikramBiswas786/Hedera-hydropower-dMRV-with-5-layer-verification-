import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import { HBAR_USD, HOUR, PROJECT_ID, SAUCER_FACTORY, deployReady, periodInput, submitPeriod } from "./helpers/dmrv";

const HTS_NFT_ABI = ["function ownerOf(uint256) view returns (address)", "function associate() returns (uint256)"];
const PRICE_CENTS_PER_TONNE = 1_500n; // $15/t
const WHBAR = "0x0000000000000000000000000000000000003aD2"; // testnet WHBAR 0.0.15058 (8 decimals)
const USDC = "0x0000000000000000000000000000000000001549"; // SaucerSwap testnet USDC 0.0.5449 (6 decimals)
const Q96 = 1n << 96n;

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** sqrtPriceX96 for a raw token1/token0 price of num/den. */
function sqrtPriceX96(num: bigint, den: bigint): bigint {
  return isqrt((num * Q96 * Q96) / den);
}

/** Raw base-unit price for an HBAR price in 1e8 USD: USDC (6 dp) per WHBAR (8 dp). */
function usdcPerWhbar(priceE8: bigint): [bigint, bigint] {
  return [priceE8 * 10n ** 6n, 10n ** 8n * 10n ** 8n];
}

async function listed() {
  const ctx = await deployReady();
  await submitPeriod(ctx.registry, await periodInput(PROJECT_ID)); // 450 units to the operator
  await ctx.market.connect(ctx.operator).createListing(400, PRICE_CENTS_PER_TONNE);
  const pair = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
  // 250,000 USDC against 1,000,000 WHBAR: $0.25/HBAR, equal to the oracle.
  await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
  await pair.setFactory(SAUCER_FACTORY);
  await ctx.market.setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 10_000n * 10n ** 6n, true);
  return { ...ctx, pair };
}

async function withV1Pool() {
  return listed();
}

describe("CreditMarket", function () {
  isolateClock();
  describe("listings", function () {
    it("escrows listed credits in registry custody under the market", async function () {
      const { registry, market, operator } = await loadFixture(listed);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(50);
      expect(await registry.custodyBalanceOf(await market.getAddress())).to.equal(400);
      const l = await market.getListing(0);
      expect(l.seller).to.equal(operator.address);
      expect(l.unitsAvailable).to.equal(400);
      expect(await market.listingCount()).to.equal(1);
      expect((await market.getListings(0, 10)).length).to.equal(1);
    });

    it("lets only the seller cancel, returning the remainder", async function () {
      const { registry, market, operator, stranger } = await loadFixture(listed);
      await expect(market.connect(stranger).cancelListing(0)).to.be.revertedWithCustomError(market, "NotSeller");
      await expect(market.connect(operator).cancelListing(0)).to.emit(market, "ListingCancelled").withArgs(0, 400);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "InvalidListing");
    });

    it("cannot list more than the seller holds or at a zero price", async function () {
      const { registry, market, operator } = await loadFixture(listed);
      await expect(market.connect(operator).createListing(51, 100)).to.be.revertedWithCustomError(
        registry,
        "InsufficientCustody",
      );
      await expect(market.connect(operator).createListing(1, 0)).to.be.revertedWithCustomError(market, "ZeroAmount");
    });
  });

  describe("oracle-priced settlement", function () {
    it("quotes USD per tonne in native units at the oracle price, rounding up", async function () {
      const { market } = await loadFixture(listed);
      // 250 kg × $15/t = $3.75 → 15 HBAR at $0.25.
      expect(await market.quote(0, 250)).to.equal(ethers.parseEther("15"));
    });

    it("pays the seller by swapping on the router, and refunds overpayment", async function () {
      const { registry, market, router, buyer, operator } = await loadFixture(listed);
      const cost = await market.quote(0, 250);
      const minOut = await market.minUsdOut(0, 250);
      const tx = market.connect(buyer).buy(0, 250, { value: cost + ethers.parseEther("1") });
      await expect(tx).to.changeEtherBalance(buyer, -cost);
      await expect(tx).to.emit(market, "Purchased").withArgs(0, buyer.address, 250, cost);
      expect(await registry.custodyBalanceOf(buyer.address)).to.equal(250);
      expect(await router.paidUsd(operator.address)).to.equal(minOut);
      expect(await router.lastValue()).to.equal(cost);
      expect(await market.proceedsOf(operator.address)).to.equal(0);
    });

    it("reverts the purchase when the router refuses the swap", async function () {
      const { market, router, buyer } = await loadFixture(listed);
      await router.setRevertNext(true);
      const cost = await market.quote(0, 100);
      await expect(market.connect(buyer).buy(0, 100, { value: cost })).to.be.revertedWithCustomError(
        market,
        "SwapFailed",
      );
    });

    it("buys and retires in one transaction, issuing the certificate to the buyer", async function () {
      const { registry, market, buyer } = await loadFixture(listed);
      const nft = new ethers.Contract(await registry.certificateToken(), HTS_NFT_ABI, buyer);
      await nft.associate();
      const cost = await market.quote(0, 100);
      await expect(market.connect(buyer).buyAndRetire(0, 100, "Acme FY2026", { value: cost }))
        .to.emit(market, "PurchasedAndRetired")
        .withArgs(0, buyer.address, 0)
        .and.to.emit(registry, "Retired")
        .withArgs(0, buyer.address, 100, "Acme FY2026");
      expect(await nft.ownerOf(1)).to.equal(buyer.address);
      expect(await registry.custodyBalanceOf(buyer.address)).to.equal(0);
      expect(await registry.totalRetiredUnits()).to.equal(100);
    });

    it("rejects underpayment and over-buying", async function () {
      const { market, buyer } = await loadFixture(listed);
      const cost = await market.quote(0, 250);
      await expect(market.connect(buyer).buy(0, 250, { value: cost - 1n })).to.be.revertedWithCustomError(
        market,
        "InsufficientPayment",
      );
      await expect(market.connect(buyer).buy(0, 401, { value: cost * 2n })).to.be.revertedWithCustomError(
        market,
        "InsufficientListingUnits",
      );
      await expect(market.connect(buyer).buy(7, 1, { value: cost })).to.be.revertedWithCustomError(
        market,
        "InvalidListing",
      );
    });

    it("refuses a stale or non-positive oracle price", async function () {
      const { market, feed } = await loadFixture(listed);
      await time.increase(HOUR + 1);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "StalePrice");
      await feed.updateAnswer(0);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "InvalidPrice");
    });

    it("bounds the staleness window and keeps no HBAR after a swap", async function () {
      const { market, router, buyer, admin, stranger } = await loadFixture(listed);
      await expect(market.setMaxPriceAge(0)).to.be.revertedWithCustomError(market, "PriceAgeOutOfRange");
      await expect(market.setMaxPriceAge(2 * 86_400 + 1)).to.be.revertedWithCustomError(market, "PriceAgeOutOfRange");
      await expect(market.connect(stranger).setMaxPriceAge(60)).to.be.revertedWithCustomError(
        market,
        "AccessControlUnauthorizedAccount",
      );
      const cost = await market.quote(0, 100);
      await market.connect(buyer).buy(0, 100, { value: cost });
      expect(await router.lastValue()).to.equal(cost);
      expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(0);
      await expect(market.sweepHbar(admin.address)).to.changeEtherBalance(admin, 0);
    });
  });

  describe("SaucerSwap pool price guard", function () {
    it("reads the V1 pair's HBAR price in feed decimals", async function () {
      const { market } = await loadFixture(withV1Pool);
      expect(await market.poolHbarUsd(8)).to.equal(HBAR_USD);
    });

    it("settles when the pool is within 3% of the oracle", async function () {
      const { market, pair, buyer } = await loadFixture(withV1Pool);
      await pair.setReserves(257_000n * 10n ** 6n, 1_000_000n * 10n ** 8n); // +2.8%
      const cost = await market.quote(0, 100);
      await market.connect(buyer).buy(0, 100, { value: cost });
    });

    it("blocks settlement when the pool is more than 3% away, in either direction", async function () {
      const { market, pair, buyer } = await loadFixture(withV1Pool);
      await pair.setReserves(258_000n * 10n ** 6n, 1_000_000n * 10n ** 8n); // +3.2%
      await expect(market.quote(0, 100))
        .to.be.revertedWithCustomError(market, "PoolPriceDeviation")
        .withArgs(25_800_000n, HBAR_USD, 320);
      await pair.setReserves(240_000n * 10n ** 6n, 1_000_000n * 10n ** 8n); // −4%
      await expect(market.connect(buyer).buy(0, 100, { value: ethers.parseEther("10") })).to.be.revertedWithCustomError(
        market,
        "PoolPriceDeviation",
      );
    });

    it("blocks settlement on an illiquid pool", async function () {
      const { market, pair } = await loadFixture(withV1Pool);
      await pair.setReserves(2_500n * 10n ** 6n, 10_000n * 10n ** 8n); // right price, $2.5k deep
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "PoolIlliquid");
      await pair.setReserves(250_000n * 10n ** 6n, 0);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "PoolIlliquid");
    });

    it("cannot be switched off, even when the pool is far from the oracle", async function () {
      const { market, pair, stranger } = await loadFixture(withV1Pool);
      await pair.setReserves(2_280_000n * 10n ** 6n, 1_000_000n * 10n ** 8n); // testnet-like $2.28
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "PoolPriceDeviation");
      await expect(market.connect(stranger).setPoolGuardEnabled(false)).to.be.revertedWithCustomError(
        market,
        "AccessControlUnauthorizedAccount",
      );
      await expect(market.setPoolGuardEnabled(false)).to.be.revertedWithCustomError(market, "InvalidPoolGuard");
      await expect(
        market.setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 0, false),
      ).to.be.revertedWithCustomError(market, "InvalidPoolGuard");
    });

    it("reads a V2 pool's slot0 with WHBAR as token1 (the testnet and mainnet order)", async function () {
      const { market } = await loadFixture(listed);
      const pool = await ethers.deployContract("MockSaucerSwapV2Pool", [USDC, WHBAR]);
      const [num, den] = usdcPerWhbar(HBAR_USD);
      await pool.setState(sqrtPriceX96(den, num), 10n ** 12n); // token1/token0 = WHBAR per USDC
      await pool.setFactory(SAUCER_FACTORY);
      await market.setPoolGuard(await pool.getAddress(), true, WHBAR, 8, 6, 300, 10n ** 9n, true);
      const price = await market.poolHbarUsd(8);
      expect(price).to.be.closeTo(HBAR_USD, 2n);
      await market.quote(0, 1);
      const [n2, d2] = usdcPerWhbar(26_000_000n); // $0.26, +4%
      await pool.setState(sqrtPriceX96(d2, n2), 10n ** 12n);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "PoolPriceDeviation");
      await pool.setState(sqrtPriceX96(den, num), 1n);
      await expect(market.quote(0, 1)).to.be.revertedWithCustomError(market, "PoolIlliquid");
    });

    it("reads a V2 pool's slot0 with WHBAR as token0", async function () {
      const { market } = await loadFixture(listed);
      const pool = await ethers.deployContract("MockSaucerSwapV2Pool", [WHBAR, USDC]);
      const [num, den] = usdcPerWhbar(HBAR_USD);
      await pool.setState(sqrtPriceX96(num, den), 10n ** 12n);
      await pool.setFactory(SAUCER_FACTORY);
      await market.setPoolGuard(await pool.getAddress(), true, WHBAR, 8, 6, 300, 0, true);
      expect(await market.poolHbarUsd(8)).to.be.closeTo(HBAR_USD, 2n);
      const g = await market.poolGuard();
      expect(g.whbarIsToken0).to.equal(true);
      expect(g.isV2).to.equal(true);
    });

    it("validates the configuration", async function () {
      const { market, pair, stranger } = await loadFixture(withV1Pool);
      const pairAddress = await pair.getAddress();
      const other = "0x000000000000000000000000000000000000dEaD";
      await expect(market.setPoolGuard(pairAddress, false, other, 8, 6, 300, 0, true)).to.be.revertedWithCustomError(
        market,
        "InvalidPoolGuard",
      );
      await expect(market.setPoolGuard(pairAddress, false, WHBAR, 8, 6, 2_001, 0, true)).to.be.revertedWithCustomError(
        market,
        "InvalidPoolGuard",
      );
      await expect(market.setPoolGuard(pairAddress, false, WHBAR, 8, 6, 0, 0, true)).to.be.revertedWithCustomError(
        market,
        "InvalidPoolGuard",
      );
      await expect(
        market.setPoolGuard(ethers.ZeroAddress, false, WHBAR, 8, 6, 300, 0, true),
      ).to.be.revertedWithCustomError(market, "ZeroAddress");
      await expect(
        market.connect(stranger).setPoolGuard(pairAddress, false, WHBAR, 8, 6, 300, 0, true),
      ).to.be.revertedWithCustomError(market, "AccessControlUnauthorizedAccount");
    });

    it("refuses a pool SaucerSwap did not create", async function () {
      const { market, pair } = await loadFixture(withV1Pool);
      const pairAddress = await pair.getAddress();
      await pair.setFactory(ethers.ZeroAddress);
      await expect(market.setPoolGuard(pairAddress, false, WHBAR, 8, 6, 300, 0, true)).to.be.revertedWithCustomError(
        market,
        "InvalidPoolGuard",
      );
    });

    it("refuses a quote until a SaucerSwap pool is set", async function () {
      const ctx = await deployReady();
      await submitPeriod(ctx.registry, await periodInput(PROJECT_ID));
      await ctx.market.connect(ctx.operator).createListing(400, PRICE_CENTS_PER_TONNE);
      await expect(ctx.market.quote(0, 1)).to.be.revertedWithCustomError(ctx.market, "InvalidPoolGuard");
      await expect(ctx.market.setPoolGuardEnabled(true)).to.be.revertedWithCustomError(ctx.market, "InvalidPoolGuard");
      await expect(ctx.market.poolHbarUsd(8)).to.be.revertedWithCustomError(ctx.market, "InvalidPoolGuard");
    });
  });
});
