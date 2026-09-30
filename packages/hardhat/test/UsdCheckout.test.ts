import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import { FEED_DECIMALS, HBAR_USD, HOUR, NATIVE_PER_HBAR, SAUCER_FACTORY, ensureSaucerFactory } from "./helpers/dmrv";
import { ensureHts, mockHts } from "./helpers/hts";

const WHBAR = "0x0000000000000000000000000000000000003aD2"; // testnet WHBAR 0.0.15058 (8 decimals)
const USDC = "0x0000000000000000000000000000000000001549"; // SaucerSwap testnet USDC 0.0.5449 (6 decimals)
const TOKEN_DECIMALS = 2n; // a ticket with two decimals: 100 base units = 1 ticket
const PRICE_CENTS = 1_250n; // $12.50 per ticket
const LISTED = 5_000n; // 50 tickets
const TOKEN_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function associate() returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const HTS_TRANSFER_TOKEN = ethers.id("transferToken(address,address,address,int64)").slice(0, 10);
const HTS_TRANSFER_FROM = ethers.id("transferFrom(address,address,address,uint256)").slice(0, 10);

/** Native units for `usdCents / per` cents at `answer` (8 decimals), rounded up, as the contract computes it. */
function nativeFor(usdCents: bigint, per: bigint, answer = HBAR_USD) {
  const numerator = usdCents * 10n ** BigInt(FEED_DECIMALS) * NATIVE_PER_HBAR;
  const denominator = 100n * per * answer;
  return (numerator + denominator - 1n) / denominator;
}

async function createToken(treasury: string, supply: bigint, decimals: bigint) {
  const hts = await mockHts();
  const definition = {
    name: "Event ticket",
    symbol: "TIX",
    treasury,
    memo: "",
    tokenSupplyType: false,
    maxSupply: 0,
    freezeDefault: false,
    tokenKeys: [],
    expiry: { second: 0, autoRenewAccount: treasury, autoRenewPeriod: 7_776_000 },
  };
  const [, address] = await hts.createFungibleToken.staticCall(definition, supply, decimals);
  await hts.createFungibleToken(definition, supply, decimals);
  return address as string;
}

async function deployed() {
  await ensureHts();
  const factory = await ensureSaucerFactory();
  const [admin, seller, buyer, stranger] = await ethers.getSigners();
  const feed = await ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, HBAR_USD]);
  const router = await ethers.deployContract("MockSaucerRouter");
  const checkout = await ethers.deployContract("UsdCheckout", [
    admin.address,
    await feed.getAddress(),
    NATIVE_PER_HBAR,
    HOUR,
    SAUCER_FACTORY,
    await router.getAddress(),
  ]);
  const pair = await ethers.deployContract("MockSaucerSwapV1Pair", [USDC, WHBAR]);
  // 250,000 USDC against 1,000,000 WHBAR: $0.25/HBAR, equal to the oracle.
  await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
  await pair.setFactory(SAUCER_FACTORY);
  await factory.setPair(USDC, WHBAR, await pair.getAddress());
  await checkout.setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 10_000n * 10n ** 6n, true);

  const tokenAddress = await createToken(seller.address, 10_000n, TOKEN_DECIMALS);
  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, ethers.provider);
  return { checkout, feed, router, pair, token, tokenAddress, admin, seller, buyer, stranger };
}

async function listed() {
  const ctx = await deployed();
  const { checkout, token, tokenAddress, seller, buyer } = ctx;
  await (token.connect(seller) as typeof token).approve(await checkout.getAddress(), LISTED);
  await checkout.connect(seller).createListing(tokenAddress, LISTED, PRICE_CENTS);
  await (token.connect(buyer) as typeof token).associate();
  return ctx;
}

/** The escrow invariant: the contract holds exactly what its active listings offer. */
async function expectEscrowMatchesListings(checkout: Awaited<ReturnType<typeof deployed>>["checkout"], token: any) {
  const listings = await checkout.getListings(0, await checkout.listingCount());
  const open = listings.filter(l => l.active && l.token === token.target).reduce((sum, l) => sum + l.available, 0n);
  expect(await token.balanceOf(await checkout.getAddress())).to.equal(open);
}

describe("UsdCheckout", function () {
  isolateClock();

  describe("listing", function () {
    it("escrows the seller's tokens and records the price per whole token", async function () {
      const { checkout, token, tokenAddress, seller } = await loadFixture(listed);
      expect(await token.balanceOf(await checkout.getAddress())).to.equal(LISTED);
      expect(await token.balanceOf(seller.address)).to.equal(10_000n - LISTED);
      const l = await checkout.getListing(0);
      expect([l.seller, l.token, l.available, l.priceUsdCentsPerToken, l.tokenDecimals, l.active]).to.deep.equal([
        seller.address,
        tokenAddress,
        LISTED,
        PRICE_CENTS,
        TOKEN_DECIMALS,
        true,
      ]);
    });

    it("emits ListingCreated and lists the same token twice (association already held)", async function () {
      const { checkout, token, tokenAddress, seller } = await loadFixture(listed);
      await (token.connect(seller) as typeof token).approve(await checkout.getAddress(), 100n);
      await expect(checkout.connect(seller).createListing(tokenAddress, 100n, 999n))
        .to.emit(checkout, "ListingCreated")
        .withArgs(1, seller.address, tokenAddress, 100n, 999n);
      expect(await checkout.listingCount()).to.equal(2);
      await expectEscrowMatchesListings(checkout, token);
    });

    it("needs the seller's approval: HTS refuses the pull and nothing is listed", async function () {
      const { checkout, tokenAddress, seller } = await loadFixture(deployed);
      await expect(checkout.connect(seller).createListing(tokenAddress, 100n, PRICE_CENTS))
        .to.be.revertedWithCustomError(checkout, "HtsCallFailed")
        .withArgs(HTS_TRANSFER_FROM, 292);
      expect(await checkout.listingCount()).to.equal(0);
    });

    it("refuses a zero token, amount or price", async function () {
      const { checkout, tokenAddress, seller } = await loadFixture(deployed);
      await expect(
        checkout.connect(seller).createListing(ethers.ZeroAddress, 1n, PRICE_CENTS),
      ).to.be.revertedWithCustomError(checkout, "ZeroAddress");
      await expect(checkout.connect(seller).createListing(tokenAddress, 0n, PRICE_CENTS)).to.be.revertedWithCustomError(
        checkout,
        "ZeroAmount",
      );
      await expect(checkout.connect(seller).createListing(tokenAddress, 1n, 0n)).to.be.revertedWithCustomError(
        checkout,
        "ZeroAmount",
      );
    });

    it("lets only the seller cancel, returning the remainder", async function () {
      const { checkout, token, seller, stranger } = await loadFixture(listed);
      await expect(checkout.connect(stranger).cancelListing(0)).to.be.revertedWithCustomError(checkout, "NotSeller");
      await expect(checkout.connect(seller).cancelListing(0)).to.emit(checkout, "ListingCancelled").withArgs(0, LISTED);
      expect(await token.balanceOf(seller.address)).to.equal(10_000n);
      await expect(checkout.quote(0, 1n)).to.be.revertedWithCustomError(checkout, "InvalidListing");
      await expectEscrowMatchesListings(checkout, token);
    });
  });

  describe("pricing", function () {
    it("quotes the oracle HBAR for the dollars: one $12.50 ticket at $0.25/HBAR is 50 HBAR", async function () {
      const { checkout } = await loadFixture(listed);
      expect(await checkout.quote(0, 100n)).to.equal(50n * NATIVE_PER_HBAR);
    });

    it("rounds a quote up, so the buyer never underpays", async function () {
      const { checkout, feed, pair } = await loadFixture(listed);
      const answer = 33_333_333n; // $0.33333333
      await feed.updateAnswer(answer);
      await pair.setReserves(333_333n * 10n ** 6n, 1_000_000n * 10n ** 8n);
      const quoted = await checkout.quote(0, 7n);
      expect(quoted).to.equal(nativeFor(PRICE_CENTS * 7n, 10n ** TOKEN_DECIMALS, answer));
      // 7 base units = 0.07 tickets = 87.5 cents; the exact HBAR amount has a remainder, so the quote is the ceiling.
      const numerator = PRICE_CENTS * 7n * 10n ** BigInt(FEED_DECIMALS) * NATIVE_PER_HBAR;
      const denominator = 100n * 10n ** TOKEN_DECIMALS * answer;
      expect(numerator % denominator).to.not.equal(0n);
      expect(quoted).to.equal(numerator / denominator + 1n);
    });

    it("pays the seller at least the listing's dollars less the 3% swap band", async function () {
      const { checkout } = await loadFixture(listed);
      // 1 ticket = $12.50 = 12,500,000 USDC base units; 97% of that.
      expect(await checkout.minUsdOut(0, 100n)).to.equal(12_125_000n);
    });

    it("refuses to price when the oracle is stale, or the pool disagrees by more than 3%", async function () {
      const { checkout, feed, pair } = await loadFixture(listed);
      await pair.setReserves(240_000n * 10n ** 6n, 1_000_000n * 10n ** 8n); // $0.24: 4% off
      await expect(checkout.quote(0, 100n)).to.be.revertedWithCustomError(checkout, "PoolPriceDeviation");
      await pair.setReserves(250_000n * 10n ** 6n, 1_000_000n * 10n ** 8n);
      await feed.setUpdatedAt((await time.latest()) - 2 * HOUR);
      await expect(checkout.quote(0, 100n)).to.be.revertedWithCustomError(checkout, "StalePrice");
    });

    it("refuses more than is listed", async function () {
      const { checkout } = await loadFixture(listed);
      await expect(checkout.quote(0, LISTED + 1n))
        .to.be.revertedWithCustomError(checkout, "InsufficientListingAmount")
        .withArgs(LISTED + 1n, LISTED);
    });
  });

  describe("buying", function () {
    it("swaps the HBAR to USD for the seller, sends the tokens and refunds the excess", async function () {
      const { checkout, router, token, seller, buyer } = await loadFixture(listed);
      const cost = await checkout.quote(0, 100n);
      const minOut = await checkout.minUsdOut(0, 100n);
      const tx = checkout.connect(buyer).buy(0, 100n, { value: cost + 7n * NATIVE_PER_HBAR });
      await expect(tx).to.changeEtherBalances([buyer, router], [-cost, cost]);
      await expect(tx).to.emit(checkout, "Purchased").withArgs(0, buyer.address, 100n, cost);
      expect(await router.lastValue()).to.equal(cost);
      expect(await router.paidUsd(seller.address)).to.equal(minOut);
      expect(await token.balanceOf(buyer.address)).to.equal(100n);
      expect((await checkout.getListing(0)).available).to.equal(LISTED - 100n);
      expect(await ethers.provider.getBalance(await checkout.getAddress())).to.equal(0n);
      await expectEscrowMatchesListings(checkout, token);
    });

    it("closes a listing that sells out", async function () {
      const { checkout, buyer } = await loadFixture(listed);
      await checkout.connect(buyer).buy(0, LISTED, { value: await checkout.quote(0, LISTED) });
      expect((await checkout.getListing(0)).active).to.equal(false);
      await expect(checkout.quote(0, 1n)).to.be.revertedWithCustomError(checkout, "InvalidListing");
    });

    it("refuses an underpayment", async function () {
      const { checkout, buyer } = await loadFixture(listed);
      const cost = await checkout.quote(0, 100n);
      await expect(checkout.connect(buyer).buy(0, 100n, { value: cost - 1n }))
        .to.be.revertedWithCustomError(checkout, "InsufficientPayment")
        .withArgs(cost, cost - 1n);
    });

    it("reverts the whole purchase when the buyer is not associated with the token", async function () {
      const { checkout, stranger } = await loadFixture(listed);
      await expect(checkout.connect(stranger).buy(0, 100n, { value: await checkout.quote(0, 100n) }))
        .to.be.revertedWithCustomError(checkout, "HtsCallFailed")
        .withArgs(HTS_TRANSFER_TOKEN, 184);
      expect((await checkout.getListing(0)).available).to.equal(LISTED);
    });

    it("reverts when SaucerSwap cannot fill the seller's minimum", async function () {
      const { checkout, router, token, buyer } = await loadFixture(listed);
      await router.setRevertNext(true);
      await expect(
        checkout.connect(buyer).buy(0, 100n, { value: await checkout.quote(0, 100n) }),
      ).to.be.revertedWithCustomError(checkout, "SwapFailed");
      expect(await token.balanceOf(buyer.address)).to.equal(0n);
    });
  });

  describe("guardian trace gate", function () {
    async function marked() {
      const ctx = await loadFixture(listed);
      await ctx.checkout.connect(ctx.admin).setTraceSigner(ctx.admin.address);
      await ctx.checkout.connect(ctx.admin).setTraceRequired(ctx.tokenAddress, true);
      return ctx;
    }

    async function signatureFor(
      checkout: Awaited<ReturnType<typeof listed>>["checkout"],
      signer: Awaited<ReturnType<typeof listed>>["admin"],
      token: string,
      seller: string,
      amount: bigint,
      recordHash: string,
      validUntil: bigint,
    ) {
      const inner = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "address", "uint256", "address", "address", "uint64", "bytes32", "uint64"],
          [
            (await ethers.provider.getNetwork()).chainId,
            await checkout.getAddress(),
            0,
            token,
            seller,
            amount,
            recordHash,
            validUntil,
          ],
        ),
      );
      return signer.signMessage(ethers.getBytes(inner));
    }

    it("refuses buy() for a marked token, and refuses to mark one before a signer is set", async function () {
      const { checkout, buyer, tokenAddress, stranger } = await loadFixture(listed);
      await expect(checkout.setTraceRequired(tokenAddress, true)).to.be.revertedWithCustomError(
        checkout,
        "ZeroAddress",
      );
      await expect(checkout.connect(stranger).setTraceSigner(stranger.address)).to.be.revertedWithCustomError(
        checkout,
        "AccessControlUnauthorizedAccount",
      );
      const { checkout: gated } = await loadFixture(marked);
      const cost = await gated.quote(0, 100n);
      await expect(gated.connect(buyer).buy(0, 100n, { value: cost })).to.be.revertedWithCustomError(
        gated,
        "TraceRequired",
      );
    });

    it("sells when the trace signer signs this listing, amount and record", async function () {
      const { checkout, admin, buyer, tokenAddress, seller, token } = await loadFixture(marked);
      const amount = 100n;
      const recordHash = ethers.id("guardian-record");
      const validUntil = BigInt(await time.latest()) + 600n;
      const signature = await signatureFor(
        checkout,
        admin,
        tokenAddress,
        seller.address,
        amount,
        recordHash,
        validUntil,
      );
      const cost = await checkout.quote(0, amount);
      await expect(
        checkout.connect(buyer).buyTraced(0, amount, recordHash, validUntil, signature, { value: cost }),
      ).to.emit(checkout, "Purchased");
      expect(await token.balanceOf(buyer.address)).to.equal(amount);
    });

    it("refuses another signer's signature, an expired one, and buyTraced on an unmarked token", async function () {
      const { checkout, stranger, buyer, tokenAddress, seller } = await loadFixture(marked);
      const amount = 100n;
      const recordHash = ethers.id("guardian-record");
      const cost = await checkout.quote(0, amount);
      const expired = BigInt(await time.latest()) - 1n;
      const stale = await signatureFor(checkout, stranger, tokenAddress, seller.address, amount, recordHash, expired);
      await expect(
        checkout.connect(buyer).buyTraced(0, amount, recordHash, expired, stale, { value: cost }),
      ).to.be.revertedWithCustomError(checkout, "TraceExpired");
      const validUntil = BigInt(await time.latest()) + 600n;
      const wrong = await signatureFor(
        checkout,
        stranger,
        tokenAddress,
        seller.address,
        amount,
        recordHash,
        validUntil,
      );
      await expect(
        checkout.connect(buyer).buyTraced(0, amount, recordHash, validUntil, wrong, { value: cost }),
      ).to.be.revertedWithCustomError(checkout, "BadTrace");

      const open = await loadFixture(listed);
      const ok = await signatureFor(
        open.checkout,
        open.admin,
        open.tokenAddress,
        open.seller.address,
        amount,
        recordHash,
        validUntil,
      );
      await expect(
        open.checkout.connect(open.buyer).buyTraced(0, amount, recordHash, validUntil, ok, { value: cost }),
      ).to.be.revertedWithCustomError(open.checkout, "TraceNotRequired");
    });
  });

  describe("admin", function () {
    it("cannot turn the pool check off or configure it without the admin role", async function () {
      const { checkout, pair, stranger } = await loadFixture(listed);
      await expect(checkout.setPoolGuardEnabled(false)).to.be.revertedWithCustomError(checkout, "InvalidPoolGuard");
      await expect(
        checkout.connect(stranger).setPoolGuard(await pair.getAddress(), false, WHBAR, 8, 6, 300, 0, true),
      ).to.be.revertedWithCustomError(checkout, "AccessControlUnauthorizedAccount");
    });
  });
});
