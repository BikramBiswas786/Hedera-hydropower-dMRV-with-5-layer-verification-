import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ensureHts, mockHts } from "./helpers/hts";

const HOUR = 3_600;
const PLANT_ID = ethers.encodeBytes32String("PLANT-DEMO-01");
const CAPACITY_KW = 500;
const MIN_TRUST_BPS = 9_000;
const MAX_PRICE_AGE = HOUR;
const FEED_DECIMALS = 8;
const HBAR_USD = 25_000_000n; // $0.25 with 8 decimals
const NATIVE_PER_HBAR = 10n ** 18n; // local Hardhat EVM uses 18-decimal wei
const REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes('{"v":1,"plant":"PLANT-DEMO-01"}'));

/** What every HTS fungible token exposes at its EVM address: the ERC-20 facade plus HIP-719 `associate()`. */
const HTS_TOKEN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function associate() returns (uint256)",
];

const TRANSFER_SELECTOR = ethers.id("transferToken(address,address,address,int64)").slice(0, 10);
const CREATE_SELECTOR = ethers
  .id(
    "createFungibleToken((string,string,address,string,bool,int64,bool,(uint256,(bool,address,bytes,bytes,address))[],(int64,address,int64)),int64,int32)",
  )
  .slice(0, 10);

async function deployFixture() {
  const { mocked } = await ensureHts();
  const [admin, operator, buyer, stranger] = await ethers.getSigners();

  const feed = await ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, HBAR_USD]);
  const registry = await ethers.deployContract("HydroREC", [
    admin.address,
    await feed.getAddress(),
    NATIVE_PER_HBAR,
    MIN_TRUST_BPS,
    MAX_PRICE_AGE,
  ]);

  return { registry, feed, admin, operator, buyer, stranger, mocked };
}

async function readyFixture() {
  const ctx = await deployFixture();
  await ctx.registry.createRecToken("Hydro REC", "HREC", { value: ethers.parseEther("20") });
  await ctx.registry.registerPlant(PLANT_ID, "Demo run-of-river", ctx.operator.address, CAPACITY_KW);
  const token = new ethers.Contract(await ctx.registry.recToken(), HTS_TOKEN_ABI, ethers.provider);
  return { ...ctx, token };
}

async function attestationInput(overrides: Partial<Record<string, unknown>> = {}) {
  const now = BigInt(await time.latest());
  return {
    plantId: PLANT_ID,
    periodStart: now - BigInt(HOUR),
    periodEnd: now,
    energyWh: 450_000n,
    trustScoreBps: 9_500,
    reportHash: REPORT_HASH,
    hcsTopicNum: 4_242_424n,
    hcsSequence: 7n,
    ...overrides,
  };
}

async function attestedFixture() {
  const ctx = await readyFixture();
  await ctx.registry.submitAttestation(await attestationInput());
  return ctx;
}

async function listedFixture() {
  const ctx = await attestedFixture();
  // 400 kWh at $12.50 / MWh
  await ctx.registry.connect(ctx.operator).createListing(400, 1_250);
  return ctx;
}

/** ERC-721 facade of an HTS NFT collection plus HIP-719 `associate()`. */
const HTS_NFT_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function associate() returns (uint256)",
];

async function certificateFixture() {
  const ctx = await listedFixture();
  await ctx.registry.createCertificateToken("Hydro REC Retirement", "HRET", { value: ethers.parseEther("20") });
  const certificates = new ethers.Contract(await ctx.registry.certificateToken(), HTS_NFT_ABI, ethers.provider);
  return { ...ctx, certificates };
}

describe("HydroREC", function () {
  describe("REC token", function () {
    it("creates an HTS token with 3 decimals and no initial supply", async function () {
      const { registry, token } = await loadFixture(readyFixture);

      expect(await token.symbol()).to.equal("HREC");
      expect(await token.decimals()).to.equal(3);
      expect(await token.totalSupply()).to.equal(0);
      expect(await registry.recToken()).to.not.equal(ethers.ZeroAddress);
    });

    it("cannot be created twice or by a non-admin", async function () {
      const { registry, stranger } = await loadFixture(readyFixture);

      await expect(registry.createRecToken("X", "X")).to.be.revertedWithCustomError(registry, "TokenAlreadyCreated");
      await expect(registry.connect(stranger).createRecToken("X", "X")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("surfaces HTS response codes as reverts", async function () {
      const { registry, mocked } = await loadFixture(deployFixture);
      if (!mocked) this.skip();

      await (await mockHts()).setForcedResponseCode(168); // INVALID_TOKEN_SYMBOL-style failure
      await expect(registry.createRecToken("Hydro REC", "HREC"))
        .to.be.revertedWithCustomError(registry, "HtsCallFailed")
        .withArgs(CREATE_SELECTOR, 168);
      await (await mockHts()).setForcedResponseCode(0);
    });
  });

  describe("plants", function () {
    it("registers a plant and lists its id", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      const plant = await registry.getPlant(PLANT_ID);
      expect(plant.operator).to.equal(operator.address);
      expect(plant.capacityKw).to.equal(CAPACITY_KW);
      expect(plant.active).to.equal(true);
      expect(await registry.getPlantIds()).to.deep.equal([PLANT_ID]);
    });

    it("rejects duplicates and invalid plants", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      await expect(registry.registerPlant(PLANT_ID, "dup", operator.address, 1)).to.be.revertedWithCustomError(
        registry,
        "PlantAlreadyRegistered",
      );
      const other = ethers.encodeBytes32String("OTHER");
      await expect(registry.registerPlant(other, "zero capacity", operator.address, 0)).to.be.revertedWithCustomError(
        registry,
        "InvalidPlant",
      );
      await expect(registry.registerPlant(other, "no operator", ethers.ZeroAddress, 10)).to.be.revertedWithCustomError(
        registry,
        "InvalidPlant",
      );
    });
  });

  describe("attestations", function () {
    it("mints 1 kWh units into the operator's custody and records the HCS anchor", async function () {
      const { registry, token, operator } = await loadFixture(readyFixture);
      const input = await attestationInput();

      await expect(registry.submitAttestation(input))
        .to.emit(registry, "AttestationSubmitted")
        .withArgs(0, PLANT_ID, 450_000, 450, 9_500, REPORT_HASH, 4_242_424, 7);

      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      expect(await token.totalSupply()).to.equal(450);
      expect(await token.balanceOf(await registry.getAddress())).to.equal(450);

      const stored = await registry.getAttestation(0);
      expect(stored.reportHash).to.equal(REPORT_HASH);
      expect(stored.hcsSequence).to.equal(7);
      expect((await registry.getPlant(PLANT_ID)).lastPeriodEnd).to.equal(input.periodEnd);
      expect(await registry.totalCertifiedWh()).to.equal(450_000);
    });

    it("carries sub-kWh remainders into the next attestation", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      await registry.submitAttestation(await attestationInput({ energyWh: 1_600n }));
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(1);
      expect((await registry.getPlant(PLANT_ID)).carryWh).to.equal(600);

      await time.increase(HOUR);
      await registry.submitAttestation(await attestationInput({ energyWh: 1_400n }));
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(3);
      expect((await registry.getPlant(PLANT_ID)).carryWh).to.equal(0);
    });

    it("enforces the nameplate capacity ceiling on-chain", async function () {
      const { registry } = await loadFixture(readyFixture);
      const maxWh = CAPACITY_KW * 1_000; // one hour at full capacity

      await expect(registry.submitAttestation(await attestationInput({ energyWh: BigInt(maxWh + 1) })))
        .to.be.revertedWithCustomError(registry, "EnergyExceedsCapacity")
        .withArgs(maxWh + 1, maxWh);
    });

    it("prevents double counting of overlapping periods", async function () {
      const { registry } = await loadFixture(attestedFixture);

      await expect(registry.submitAttestation(await attestationInput())).to.be.revertedWithCustomError(
        registry,
        "PeriodOverlapsPrevious",
      );
    });

    it("rejects low trust scores, future periods, empty hashes and inactive plants", async function () {
      const { registry } = await loadFixture(readyFixture);
      const now = BigInt(await time.latest());

      await expect(registry.submitAttestation(await attestationInput({ trustScoreBps: 8_999 })))
        .to.be.revertedWithCustomError(registry, "TrustScoreTooLow")
        .withArgs(8_999, MIN_TRUST_BPS);
      await expect(
        registry.submitAttestation(await attestationInput({ periodEnd: now + 1_000n })),
      ).to.be.revertedWithCustomError(registry, "InvalidPeriod");
      await expect(
        registry.submitAttestation(await attestationInput({ reportHash: ethers.ZeroHash })),
      ).to.be.revertedWithCustomError(registry, "EmptyReportHash");

      await registry.setPlantActive(PLANT_ID, false);
      await expect(registry.submitAttestation(await attestationInput())).to.be.revertedWithCustomError(
        registry,
        "PlantInactive",
      );
    });

    it("only accepts attestations from verifiers once the token exists", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      await expect(registry.submitAttestation(await attestationInput())).to.be.revertedWithCustomError(
        registry,
        "TokenNotCreated",
      );

      const { registry: ready } = await loadFixture(readyFixture);
      await expect(ready.connect(stranger).submitAttestation(await attestationInput())).to.be.revertedWithCustomError(
        ready,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("pages through attestations", async function () {
      const { registry } = await loadFixture(attestedFixture);

      expect(await registry.attestationCount()).to.equal(1);
      expect(await registry.getAttestations(0, 10)).to.have.length(1);
      expect(await registry.getAttestations(5, 10)).to.have.length(0);
    });
  });

  describe("oracle-priced marketplace", function () {
    it("quotes USD listings in native HBAR units using the Chainlink answer", async function () {
      const { registry } = await loadFixture(listedFixture);

      // 400 kWh * $12.50/MWh = $5.00 ; $5.00 / $0.25 = 20 HBAR
      expect(await registry.quote(0, 400)).to.equal(20n * NATIVE_PER_HBAR);
    });

    it("tracks the oracle: a higher HBAR price means fewer HBAR per REC", async function () {
      const { registry, feed } = await loadFixture(listedFixture);

      await feed.updateAnswer(50_000_000n); // $0.50
      expect(await registry.quote(0, 400)).to.equal(10n * NATIVE_PER_HBAR);
    });

    it("refuses to settle on stale or invalid prices", async function () {
      const { registry, feed } = await loadFixture(listedFixture);

      await time.increase(MAX_PRICE_AGE + 1);
      await expect(registry.quote(0, 400)).to.be.revertedWithCustomError(registry, "StalePrice");

      await feed.updateAnswer(0);
      await expect(registry.quote(0, 400)).to.be.revertedWithCustomError(registry, "InvalidPrice");
    });

    it("moves RECs to the buyer's custody, escrows proceeds and refunds overpayment", async function () {
      const { registry, operator, buyer } = await loadFixture(listedFixture);
      const cost = await registry.quote(0, 100);
      const overpay = cost + ethers.parseEther("3");

      const purchase = registry.connect(buyer).buy(0, 100, { value: overpay });
      await expect(purchase).to.emit(registry, "Purchased").withArgs(0, buyer.address, 100, cost);
      await expect(purchase).to.changeEtherBalances([buyer, registry], [-cost, cost]);

      expect(await registry.custodyBalanceOf(buyer.address)).to.equal(100);
      expect(await registry.proceedsOf(operator.address)).to.equal(cost);
      expect((await registry.getListings(0, 1))[0].unitsAvailable).to.equal(300);

      await expect(registry.connect(operator).withdrawProceeds()).to.changeEtherBalances(
        [operator, registry],
        [cost, -cost],
      );
    });

    it("rejects underpayment and oversized purchases", async function () {
      const { registry, buyer } = await loadFixture(listedFixture);
      const cost = await registry.quote(0, 100);

      await expect(registry.connect(buyer).buy(0, 100, { value: cost - 1n }))
        .to.be.revertedWithCustomError(registry, "InsufficientPayment")
        .withArgs(cost, cost - 1n);
      await expect(registry.connect(buyer).buy(0, 401, { value: cost * 10n })).to.be.revertedWithCustomError(
        registry,
        "InsufficientListingUnits",
      );
    });

    it("buys and retires in one transaction by burning on HTS", async function () {
      const { registry, token, buyer } = await loadFixture(listedFixture);
      const cost = await registry.quote(0, 400);

      await expect(registry.connect(buyer).buyAndRetire(0, 400, "Acme Corp FY2026 scope 2", { value: cost }))
        .to.emit(registry, "Retired")
        .withArgs(0, buyer.address, 400, "Acme Corp FY2026 scope 2");

      expect(await token.totalSupply()).to.equal(50);
      expect(await registry.totalRetiredUnits()).to.equal(400);
      expect(await registry.custodyBalanceOf(buyer.address)).to.equal(0);
      expect((await registry.getListings(0, 1))[0].active).to.equal(false);

      const [retirement] = await registry.getRetirements(0, 1);
      expect(retirement.account).to.equal(buyer.address);
      expect(retirement.beneficiary).to.equal("Acme Corp FY2026 scope 2");
    });

    it("lets only the seller cancel, returning unsold units to custody", async function () {
      const { registry, operator, stranger } = await loadFixture(listedFixture);

      await expect(registry.connect(stranger).cancelListing(0)).to.be.revertedWithCustomError(registry, "NotSeller");
      await expect(registry.connect(operator).cancelListing(0)).to.emit(registry, "ListingCancelled").withArgs(0, 400);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      await expect(registry.quote(0, 1)).to.be.revertedWithCustomError(registry, "InvalidListing");
    });

    it("keeps the treasury balance equal to custody plus listed units", async function () {
      const { registry, token, operator, buyer } = await loadFixture(listedFixture);
      await registry.connect(buyer).buy(0, 150, { value: await registry.quote(0, 150) });
      await registry.connect(buyer).retire(50, "");

      const listed = (await registry.getListings(0, 1))[0].unitsAvailable;
      const custody =
        (await registry.custodyBalanceOf(operator.address)) + (await registry.custodyBalanceOf(buyer.address));
      expect(await token.balanceOf(await registry.getAddress())).to.equal(custody + listed);
    });

    it("sweeps surplus HBAR but never what is owed to sellers", async function () {
      const { registry, buyer, stranger } = await loadFixture(listedFixture);
      const cost = await registry.quote(0, 100);
      await registry.connect(buyer).buy(0, 100, { value: cost });

      const surplus = ethers.parseEther("5");
      const registryAddress = await registry.getAddress();
      await ethers.provider.send("hardhat_setBalance", [registryAddress, ethers.toQuantity(cost + surplus)]);

      await expect(registry.sweepHbar(stranger.address)).to.changeEtherBalance(stranger, surplus);
      expect(await ethers.provider.getBalance(registryAddress)).to.equal(cost);
    });
  });

  describe("custody withdrawal", function () {
    it("requires an HTS association before RECs can leave the registry", async function () {
      const { registry, token, operator, mocked } = await loadFixture(attestedFixture);

      // TOKEN_NOT_ASSOCIATED_TO_ACCOUNT; asserted against the mock, whose association rules are pinned here.
      if (mocked) {
        await expect(registry.connect(operator).withdraw(100))
          .to.be.revertedWithCustomError(registry, "HtsCallFailed")
          .withArgs(TRANSFER_SELECTOR, 184);
      }

      await (token.connect(operator) as typeof token).associate();
      await expect(registry.connect(operator).withdraw(100))
        .to.emit(registry, "Withdrawn")
        .withArgs(operator.address, 100);
      expect(await token.balanceOf(operator.address)).to.equal(100);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(350);
    });

    it("cannot withdraw or retire more than the custody balance", async function () {
      const { registry, buyer } = await loadFixture(attestedFixture);

      await expect(registry.connect(buyer).withdraw(1))
        .to.be.revertedWithCustomError(registry, "InsufficientCustody")
        .withArgs(1, 0);
      await expect(registry.connect(buyer).retire(1, "x")).to.be.revertedWithCustomError(
        registry,
        "InsufficientCustody",
      );
    });
  });

  describe("retirement certificates (HTS NFT)", function () {
    it("mints a certificate NFT per retirement and delivers it to an associated wallet", async function () {
      const { registry, certificates, buyer } = await loadFixture(certificateFixture);
      await (certificates.connect(buyer) as typeof certificates).associate();
      const cost = await registry.quote(0, 250);

      await expect(registry.connect(buyer).buyAndRetire(0, 250, "Acme FY2026", { value: cost }))
        .to.emit(registry, "CertificateIssued")
        .withArgs(0, 1, true);

      expect(await certificates.ownerOf(1)).to.equal(buyer.address);
      expect(await certificates.tokenURI(1)).to.equal("hydro-dmrv:retirement:0");
      const retirement = await registry.getRetirement(0);
      expect(retirement.certificateSerial).to.equal(1);
      expect(retirement.certificateDelivered).to.equal(true);
    });

    it("never fails a retirement because the wallet cannot hold the NFT yet", async function () {
      const { registry, certificates, operator, mocked } = await loadFixture(certificateFixture);
      if (!mocked) this.skip();

      await expect(registry.connect(operator).retire(10, "self-consumption"))
        .to.emit(registry, "CertificateIssued")
        .withArgs(0, 1, false);
      expect(await certificates.ownerOf(1)).to.equal(await registry.getAddress());
      expect((await registry.getRetirement(0)).certificateDelivered).to.equal(false);
    });

    it("lets only the retiring account claim a pending certificate, once, after associating", async function () {
      const { registry, certificates, operator, stranger, mocked } = await loadFixture(certificateFixture);
      if (!mocked) this.skip();
      await registry.connect(operator).retire(10, "");

      await expect(registry.connect(stranger).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "NotRetirementOwner",
      );
      await expect(registry.connect(operator).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "HtsCallFailed",
      );

      await (certificates.connect(operator) as typeof certificates).associate();
      await expect(registry.connect(operator).claimCertificate(0))
        .to.emit(registry, "CertificateClaimed")
        .withArgs(0, operator.address, 1);
      expect(await certificates.ownerOf(1)).to.equal(operator.address);
      await expect(registry.connect(operator).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "NoCertificateToClaim",
      );
    });

    it("numbers certificates sequentially with metadata that points at each retirement", async function () {
      const { registry, certificates, operator } = await loadFixture(certificateFixture);
      await registry.connect(operator).retire(5, "a");
      await registry.connect(operator).retire(5, "b");

      expect(await certificates.totalSupply()).to.equal(2);
      expect(await certificates.tokenURI(2)).to.equal("hydro-dmrv:retirement:1");
    });

    it("issues no certificate when the collection was never created", async function () {
      const { registry, operator } = await loadFixture(listedFixture);

      await expect(registry.connect(operator).retire(10, "")).to.not.emit(registry, "CertificateIssued");
      expect((await registry.getRetirement(0)).certificateSerial).to.equal(0);
      await expect(registry.connect(operator).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "NoCertificateToClaim",
      );
    });

    it("creates the collection once, admin only", async function () {
      const { registry, stranger } = await loadFixture(certificateFixture);

      await expect(registry.createCertificateToken("X", "X")).to.be.revertedWithCustomError(
        registry,
        "TokenAlreadyCreated",
      );
      await expect(registry.connect(stranger).createCertificateToken("X", "X")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
