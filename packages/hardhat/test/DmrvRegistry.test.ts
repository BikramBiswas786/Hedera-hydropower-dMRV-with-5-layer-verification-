import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import {
  AUDIT_TOPIC,
  HOUR,
  METER,
  OTHER_VVB,
  PROJECT_ID,
  VVB,
  YEAR,
  deployCore,
  deployReady,
  encodeParams,
  hydroParams,
  periodInput,
  signSubmission,
  submitPeriod,
} from "./helpers/dmrv";
import { LIVE_ATTESTATIONS } from "./fixtures/liveAttestations";

const HTS_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function associate() returns (uint256)",
];
const HTS_NFT_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function associate() returns (uint256)",
];

async function ready() {
  return deployReady();
}

async function attested() {
  const ctx = await deployReady();
  await submitPeriod(ctx.registry, await periodInput(PROJECT_ID));
  return ctx;
}

describe("DmrvRegistry", function () {
  isolateClock();
  describe("deployment and roles", function () {
    it("gives the admin no verifier role and rejects a zero admin", async function () {
      const { registry, admin } = await loadFixture(deployCore);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await registry.hasRole(await registry.VERIFIER_ROLE(), admin.address)).to.equal(false);
      const factory = await ethers.getContractFactory("DmrvRegistry");
      await expect(factory.deploy(ethers.ZeroAddress, 9_000)).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(factory.deploy(admin.address, 10_001)).to.be.revertedWithCustomError(
        registry,
        "InvalidCompleteness",
      );
    });

    it("creates each HTS token once, admin only", async function () {
      const { registry, stranger } = await loadFixture(ready);
      await expect(registry.createCreditToken("X", "X", "")).to.be.revertedWithCustomError(
        registry,
        "TokenAlreadyCreated",
      );
      await expect(registry.connect(stranger).createCertificateToken("X", "X", "")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("publishes the module's identity when it is approved", async function () {
      const { registry, module } = await loadFixture(deployCore);
      await expect(registry.setModuleApproved(await module.getAddress(), true))
        .to.emit(registry, "ModuleApproved")
        .withArgs(
          await module.getAddress(),
          await module.methodologyId(),
          await module.version(),
          await module.schemaHash(),
          true,
        );
    });
  });

  describe("project registration", function () {
    it("stores the module's terms: crediting window, calibration and registration-request date", async function () {
      const { registry, params, operator, module } = await loadFixture(ready);
      const p = await registry.getProject(PROJECT_ID);
      expect(p.operator).to.equal(operator.address);
      expect(p.meter).to.equal(METER.address);
      expect(p.module).to.equal(await module.getAddress());
      expect(p.creditingStart).to.equal(params.creditingStart);
      expect(p.creditingEnd).to.equal(params.creditingEnd);
      expect(p.calibrationValidUntil).to.equal(params.calibrationValidUntil);
      expect(p.registrationRequestedAt).to.equal(params.registrationRequestedAt);
      expect(p.creditingPeriods).to.equal(1);
      expect(await registry.projectOfMeter(METER.address)).to.equal(PROJECT_ID);
      expect(await registry.getProjectIds()).to.deep.equal([PROJECT_ID]);
    });

    it("rejects an unapproved module, duplicates, a reused meter or design, and non-admins", async function () {
      const { registry, module, operator, stranger, params } = await loadFixture(ready);
      const moduleAddress = await module.getAddress();
      const other = ethers.encodeBytes32String("OTHER");
      const otherParams = await hydroParams({ designHash: ethers.id("other design") });
      const unapproved = await ethers.deployContract("HydroVmr0017Module");
      await expect(
        registry.registerProject(
          other,
          "x",
          await unapproved.getAddress(),
          operator.address,
          OTHER_VVB.address,
          otherParams.designHash,
          encodeParams(otherParams),
        ),
      ).to.be.revertedWithCustomError(registry, "ModuleNotApproved");
      await expect(
        registry.registerProject(
          PROJECT_ID,
          "x",
          moduleAddress,
          operator.address,
          OTHER_VVB.address,
          otherParams.designHash,
          encodeParams(otherParams),
        ),
      ).to.be.revertedWithCustomError(registry, "ProjectAlreadyRegistered");
      await expect(
        registry.registerProject(
          other,
          "x",
          moduleAddress,
          operator.address,
          METER.address,
          otherParams.designHash,
          encodeParams(otherParams),
        ),
      ).to.be.revertedWithCustomError(registry, "MeterAlreadyRegistered");
      await expect(
        registry.registerProject(
          other,
          "x",
          moduleAddress,
          operator.address,
          OTHER_VVB.address,
          params.designHash,
          encodeParams(params),
        ),
      ).to.be.revertedWithCustomError(registry, "DesignAlreadyRegistered");
      await expect(
        registry.registerProject(
          other,
          "x",
          moduleAddress,
          operator.address,
          ethers.ZeroAddress,
          otherParams.designHash,
          encodeParams(otherParams),
        ),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(
        registry
          .connect(stranger)
          .registerProject(
            other,
            "x",
            moduleAddress,
            operator.address,
            OTHER_VVB.address,
            otherParams.designHash,
            encodeParams(otherParams),
          ),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("rejects params the module refuses (future registration request, 7 years requested after 2027)", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const other = ethers.encodeBytes32String("OTHER");
      const future = await hydroParams({
        methodology: 1,
        designHash: ethers.id("future"),
        registrationRequestedAt: BigInt(await time.latest()) + 1_000n,
      });
      await expect(
        registry.registerProject(
          other,
          "x",
          await module.getAddress(),
          operator.address,
          OTHER_VVB.address,
          future.designHash,
          encodeParams(future),
        ),
      ).to.be.revertedWithCustomError(module, "RegistrationInTheFuture");

      await time.increaseTo(1_798_761_600n + 86_400n);
      const late = await hydroParams({ methodology: 1, designHash: ethers.id("late") }, 0);
      await expect(
        registry.registerProject(
          other,
          "x",
          await module.getAddress(),
          operator.address,
          OTHER_VVB.address,
          late.designHash,
          encodeParams(late),
        ),
      ).to.be.revertedWithCustomError(module, "InvalidCreditingPeriod");
      const five = {
        ...late,
        creditingEnd: late.creditingStart + 5n * YEAR,
        calibrationValidUntil: late.creditingStart + 5n * YEAR,
      };
      await registry.registerProject(
        other,
        "x",
        await module.getAddress(),
        operator.address,
        OTHER_VVB.address,
        five.designHash,
        encodeParams(five),
      );
      const p = await registry.getProject(other);
      expect(p.creditingEnd - p.creditingStart).to.equal(5n * YEAR);
    });
  });

  describe("two-signature attestation", function () {
    it("mints into the operator's custody when a stranger relays the meter and VVB signatures", async function () {
      const { registry, operator, stranger } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const submission = await signSubmission(registry, input);
      await expect(registry.connect(stranger).submitAttestation(submission))
        .to.emit(registry, "AttestationSubmitted")
        .and.to.emit(registry, "MeterStatementAccepted")
        .withArgs(0, METER.address, input.readingsDigest);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      const a = await registry.getAttestation(0);
      expect(a.verifier).to.equal(VVB.address);
      expect(a.meter).to.equal(METER.address);
      expect(a.reductionG).to.equal(450_000);
      expect(a.unitsMinted).to.equal(450);
      expect(a.completenessBps).to.equal(10_000);
      expect(a.hcsTopicNum).to.equal(AUDIT_TOPIC);
      expect(await registry.totalIssuedUnits()).to.equal(450);
    });

    it("exposes the digests the meter and VVB sign", async function () {
      const { registry } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const s = await signSubmission(registry, input);
      expect(ethers.recoverAddress(await registry.meterStatementDigest(s), s.meterSignature)).to.equal(METER.address);
      expect(ethers.recoverAddress(await registry.approvalDigest(s), s.verifierSignature)).to.equal(VVB.address);
    });

    it("rejects a submission without the meter's signature", async function () {
      const { registry } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID), OTHER_VVB, VVB);
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
    });

    it("rejects an approval from a key without VERIFIER_ROLE", async function () {
      const { registry } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID), METER, OTHER_VVB);
      await expect(registry.submitAttestation(s))
        .to.be.revertedWithCustomError(registry, "UnregisteredVerifier")
        .withArgs(OTHER_VVB.address);
    });

    it("rejects a verifier that is also the project's operator or meter", async function () {
      const { registry, module } = await loadFixture(ready);
      await registry.grantRole(await registry.VERIFIER_ROLE(), OTHER_VVB.address);
      const id = ethers.encodeBytes32String("SELF");
      const params = await hydroParams({ designHash: ethers.id("self") });
      await registry.registerProject(
        id,
        "self",
        await module.getAddress(),
        OTHER_VVB.address,
        ethers.Wallet.createRandom().address,
        params.designHash,
        encodeParams(params),
      );
      await registry.setMeter(id, OTHER_VVB.address);
      const s = await signSubmission(registry, await periodInput(id), OTHER_VVB, OTHER_VVB);
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "VerifierIsParty");
    });

    it("binds the VVB to the meter's figures: tampering with either set breaks a signature", async function () {
      const { registry } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const s = await signSubmission(registry, input);
      const other = await periodInput(PROJECT_ID, {
        metered: { netWh: 460_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n },
      });
      await expect(
        registry.submitAttestation({ ...s, measurement: { ...s.measurement, metered: other.measurement.metered } }),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
      await expect(
        registry.submitAttestation({ ...s, measurement: { ...s.measurement, verified: other.measurement.metered } }),
      ).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
      await expect(
        registry.submitAttestation({ ...s, reportHash: ethers.id("other report") }),
      ).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
    });

    it("lets the VVB lower the meter's figures but never raise them", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const metered = { netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n };
      const raised = await periodInput(PROJECT_ID, { metered, verified: { ...metered, netWh: 450_001n } });
      await expect(registry.submitAttestation(await signSubmission(registry, raised))).to.be.revertedWithCustomError(
        module,
        "NotMetered",
      );
      const lowered = await periodInput(PROJECT_ID, { metered, verified: { ...metered, netWh: 300_000n } });
      await registry.submitAttestation(await signSubmission(registry, lowered));
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(300);
    });

    it("rejects any decision other than approval", async function () {
      const { registry } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID), METER, VVB, 2);
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
    });

    it("rejects signatures made for another registry (EIP-712 domain separation)", async function () {
      const { registry, operator } = await loadFixture(ready);
      const twin = await ethers.deployContract("DmrvRegistry", [operator.address, 9_000]);
      const s = await signSubmission(twin, await periodInput(PROJECT_ID));
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
    });

    it("uses each signature pair once and each period once", async function () {
      const { registry } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID));
      await registry.submitAttestation(s);
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "PeriodOverlapsPrevious");
      await time.increase(HOUR);
      const next = await periodInput(PROJECT_ID, { sequence: 0, hcsSequence: 2n });
      await expect(registry.submitAttestation(await signSubmission(registry, next)))
        .to.be.revertedWithCustomError(registry, "StaleLedger")
        .withArgs(1, 0);
    });

    it("computes completeness on-chain from the meter-signed interval count", async function () {
      const { registry } = await loadFixture(ready);
      const low = await periodInput(PROJECT_ID, { intervals: 53 }); // 53 min of 60 = 8,833 bps
      await expect(registry.submitAttestation(await signSubmission(registry, low)))
        .to.be.revertedWithCustomError(registry, "CompletenessTooLow")
        .withArgs(8_833, 9_000);
      const ok = await periodInput(PROJECT_ID, { intervals: 55 });
      await registry.submitAttestation(await signSubmission(registry, ok));
      expect((await registry.getAttestation(0)).completenessBps).to.equal(9_166);
    });

    it("rejects periods after the meter's calibration lapses until a new certificate is recorded", async function () {
      const { registry } = await loadFixture(ready);
      const lapsed = BigInt(await time.latest()) - 2n * BigInt(HOUR);
      await registry.setCalibrationValidUntil(PROJECT_ID, lapsed, ethers.id("certificate 1"));
      const input = await periodInput(PROJECT_ID);
      await expect(registry.submitAttestation(await signSubmission(registry, input)))
        .to.be.revertedWithCustomError(registry, "CalibrationExpired")
        .withArgs(input.measurement.periodEnd, lapsed);
      await expect(registry.setCalibrationValidUntil(PROJECT_ID, lapsed + 10n * YEAR, ethers.id("certificate 2")))
        .to.emit(registry, "CalibrationUpdated")
        .withArgs(PROJECT_ID, lapsed + 10n * YEAR, ethers.id("certificate 2"));
      await registry.submitAttestation(await signSubmission(registry, input));
    });

    it("rejects periods outside the crediting window, in the future, or inverted", async function () {
      const { registry, params } = await loadFixture(ready);
      const before = await periodInput(PROJECT_ID, {
        periodStart: params.creditingStart - BigInt(HOUR),
        periodEnd: params.creditingStart,
      });
      await expect(registry.submitAttestation(await signSubmission(registry, before))).to.be.revertedWithCustomError(
        registry,
        "OutsideCreditingPeriod",
      );
      const now = BigInt(await time.latest());
      const future = await periodInput(PROJECT_ID, { periodStart: now, periodEnd: now + 10n * BigInt(HOUR) });
      await expect(registry.submitAttestation(await signSubmission(registry, future))).to.be.revertedWithCustomError(
        registry,
        "InvalidPeriod",
      );
    });

    it("requires an HCS anchor on the audit topic and a report hash", async function () {
      const { registry } = await loadFixture(ready);
      for (const o of [{ hcsTopicNum: 1n }, { hcsSequence: 0n }]) {
        const s = await signSubmission(registry, await periodInput(PROJECT_ID, o));
        await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "Unanchored");
      }
      const s = await signSubmission(registry, await periodInput(PROJECT_ID, { reportHash: ethers.ZeroHash }));
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(registry, "EmptyReportHash");
    });

    it("rejects gross generation above the nameplate", async function () {
      const { registry, module } = await loadFixture(ready);
      const e = { netWh: 400_000n, grossWh: 600_000n, fuelG: 0n, leakageG: 0n }; // 500 kW × 1 h = 500 kWh
      const s = await signSubmission(registry, await periodInput(PROJECT_ID, { metered: e }));
      await expect(registry.submitAttestation(s)).to.be.revertedWithCustomError(module, "EnergyExceedsCapacity");
    });

    it("lets one evidence document back one attestation only (evidenceUsed)", async function () {
      const { registry } = await loadFixture(ready);
      const evidenceHash = ethers.id("guardian vc");
      await submitPeriod(registry, await periodInput(PROJECT_ID, { evidenceHash }));
      expect(await registry.evidenceUsed(evidenceHash)).to.equal(true);
      expect((await registry.getAttestation(0)).evidenceHash).to.equal(evidenceHash);
      await time.increase(HOUR);
      const again = await periodInput(PROJECT_ID, { sequence: 1, evidenceHash });
      await expect(registry.submitAttestation(await signSubmission(registry, again)))
        .to.be.revertedWithCustomError(registry, "EvidenceAlreadyUsed")
        .withArgs(evidenceHash);
    });

    it("stops a paused project and a rotated meter", async function () {
      const { registry } = await loadFixture(ready);
      await registry.setProjectActive(PROJECT_ID, false);
      const input = await periodInput(PROJECT_ID);
      await expect(registry.submitAttestation(await signSubmission(registry, input))).to.be.revertedWithCustomError(
        registry,
        "ProjectInactive",
      );
      await registry.setProjectActive(PROJECT_ID, true);
      await registry.setMeter(PROJECT_ID, OTHER_VVB.address);
      expect(await registry.projectOfMeter(METER.address)).to.equal(ethers.ZeroHash);
      await expect(registry.submitAttestation(await signSubmission(registry, input))).to.be.revertedWithCustomError(
        registry,
        "InvalidMeterSignature",
      );
      await registry.submitAttestation(await signSubmission(registry, input, OTHER_VVB, VVB));
    });

    it("previews a period without recording it", async function () {
      const { registry } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const [q, units] = await registry.preview(PROJECT_ID, input.measurement);
      expect(q.reductionG).to.equal(450_000);
      expect(units).to.equal(450);
      expect(await registry.attestationCount()).to.equal(0);
    });

    it("carries the sub-kg remainder in the core ledger", async function () {
      const { registry, operator } = await loadFixture(ready);
      const e = { netWh: 1_500n, grossWh: 1_600n, fuelG: 0n, leakageG: 0n };
      await submitPeriod(registry, await periodInput(PROJECT_ID, { metered: e }));
      expect((await registry.getProject(PROJECT_ID)).balanceG).to.equal(500);
      await time.increase(HOUR);
      await submitPeriod(registry, await periodInput(PROJECT_ID, { sequence: 1, metered: e }));
      expect((await registry.getProject(PROJECT_ID)).balanceG).to.equal(0);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(3);
    });
  });

  describe("greenfield parity with the legacy registry (full flow)", function () {
    for (const live of LIVE_ATTESTATIONS) {
      it(`re-issues ${live.expected.unitsMinted} units for live attestation #${live.id} (${live.plantId})`, async function () {
        const { registry, module, operator } = await loadFixture(deployCore);
        await registry.createCreditToken("HYCC", "HYCC", "", { value: ethers.parseEther("20") });
        await registry.setModuleApproved(await module.getAddress(), true);
        await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
        await registry.setAuditTopic(live.hcsTopicNum);
        if (BigInt(await time.latest()) < live.periodEnd) await time.increaseTo(live.periodEnd + 60n);
        const id = ethers.encodeBytes32String(live.plantId);
        const params = {
          ...live.design,
          baselineWh: 0n,
          baselineEndsAt: 0n,
          registrationRequestedAt: live.design.creditingStart,
          calibrationValidUntil: live.design.creditingEnd,
          meteringHash: ethers.ZeroHash,
        };
        await registry.registerProject(
          id,
          live.name,
          await module.getAddress(),
          operator.address,
          METER.address,
          live.design.designHash,
          encodeParams(params),
        );
        const energy = { netWh: live.netEnergyWh, grossWh: live.grossEnergyWh, fuelG: live.fuelG, leakageG: 0n };
        const input = await periodInput(id, {
          periodStart: live.periodStart,
          periodEnd: live.periodEnd,
          metered: energy,
          intervals: 1_440,
          reportHash: live.reportHash,
          hcsTopicNum: live.hcsTopicNum,
          hcsSequence: live.hcsSequence,
        });
        await registry.submitAttestation(await signSubmission(registry, input));
        const a = await registry.getAttestation(0);
        expect(a.reductionG).to.equal(live.expected.reductionG);
        expect(a.unitsMinted).to.equal(live.expected.unitsMinted);
        expect(a.completenessBps).to.equal(10_000);
        expect((await registry.getProject(id)).balanceG).to.equal(live.expected.balanceG);
        expect(await registry.custodyBalanceOf(operator.address)).to.equal(live.expected.unitsMinted);
      });
    }
  });

  describe("crediting-period renewal", function () {
    it("renews with the same span, resets the module ledger and keeps the ER balance", async function () {
      const { registry, params } = await loadFixture(ready);
      const e = { netWh: 1_500n, grossWh: 1_600n, fuelG: 0n, leakageG: 0n };
      await submitPeriod(registry, await periodInput(PROJECT_ID, { metered: e }));
      await time.increaseTo(params.creditingEnd);
      const next = {
        ...params,
        creditingStart: params.creditingEnd,
        creditingEnd: params.creditingEnd + 7n * YEAR,
        calibrationValidUntil: params.creditingEnd + 7n * YEAR,
        efGridGPerMwh: 900_000,
      };
      await expect(registry.renewCreditingPeriod(PROJECT_ID, encodeParams(next)))
        .to.emit(registry, "CreditingPeriodRenewed")
        .withArgs(PROJECT_ID, next.creditingStart, next.creditingEnd, encodeParams(next));
      const p = await registry.getProject(PROJECT_ID);
      expect(p.creditingPeriods).to.equal(2);
      expect(p.state).to.equal(ethers.ZeroHash);
      expect(p.balanceG).to.equal(500);
      expect(p.creditingStart).to.equal(next.creditingStart);
    });

    it("rejects a longer renewal or a changed design", async function () {
      const { registry, module, params, stranger } = await loadFixture(ready);
      await time.increaseTo(params.creditingEnd);
      const longer = {
        ...params,
        creditingStart: params.creditingEnd,
        creditingEnd: params.creditingEnd + 10n * YEAR,
        calibrationValidUntil: params.creditingEnd + 10n * YEAR,
      };
      await expect(registry.renewCreditingPeriod(PROJECT_ID, encodeParams(longer))).to.be.revertedWithCustomError(
        module,
        "RenewalSpan",
      );
      const redesigned = { ...longer, creditingEnd: params.creditingEnd + 7n * YEAR, designHash: ethers.id("new") };
      await expect(registry.renewCreditingPeriod(PROJECT_ID, encodeParams(redesigned))).to.be.revertedWithCustomError(
        module,
        "ParamsChanged",
      );
      await expect(
        registry.connect(stranger).renewCreditingPeriod(PROJECT_ID, encodeParams(longer)),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("reserved Article 6 fields", function () {
    it("records host-Party authorization metadata and corresponding-adjustment status", async function () {
      const { registry } = await loadFixture(attested);
      const a6 = {
        hostParty: "0x4e50",
        authorizedUse: 1,
        firstTransferDefinition: 1,
        authorizationRef: ethers.id("LoA"),
      };
      await expect(registry.setArticle6(PROJECT_ID, a6)).to.emit(registry, "Article6Set");
      const stored = await registry.article6Of(PROJECT_ID);
      expect(stored.hostParty).to.equal("0x4e50");
      expect(stored.authorizationRef).to.equal(ethers.id("LoA"));
      await registry.setCorrespondingAdjustment(0, 1, ethers.id("BTR 2028"));
      expect(await registry.correspondingAdjustmentOf(0)).to.equal(1);
      await expect(registry.setCorrespondingAdjustment(9, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
        registry,
        "InvalidAttestation",
      );
    });
  });

  describe("custody, retirement and certificates", function () {
    it("requires an HTS association before credits leave the registry", async function () {
      const { registry, operator, mocked } = await loadFixture(attested);
      const token = new ethers.Contract(await registry.creditToken(), HTS_TOKEN_ABI, operator);
      if (mocked) {
        await expect(registry.connect(operator).withdraw(100)).to.be.revertedWithCustomError(registry, "HtsCallFailed");
      }
      await token.associate();
      await expect(registry.connect(operator).withdraw(100))
        .to.emit(registry, "Withdrawn")
        .withArgs(operator.address, 100);
      expect(await token.balanceOf(operator.address)).to.equal(100);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(350);
    });

    it("retires by burning, mints a certificate and delivers it to an associated wallet", async function () {
      const { registry, operator } = await loadFixture(attested);
      const nft = new ethers.Contract(await registry.certificateToken(), HTS_NFT_ABI, operator);
      await nft.associate();
      await expect(registry.connect(operator).retire(50, "Acme FY2026"))
        .to.emit(registry, "Retired")
        .withArgs(0, operator.address, 50, "Acme FY2026")
        .and.to.emit(registry, "CertificateIssued")
        .withArgs(0, 1, true);
      expect(await nft.ownerOf(1)).to.equal(operator.address);
      expect(await nft.tokenURI(1)).to.equal("dmrv:retirement:0");
      expect(await registry.totalRetiredUnits()).to.equal(50);
      expect((await registry.getRetirements(0, 10)).length).to.equal(1);
    });

    it("lets a pending certificate be claimed once by its owner", async function () {
      const { registry, operator, stranger, mocked } = await loadFixture(attested);
      if (!mocked) this.skip();
      await registry.connect(operator).retire(10, "");
      await expect(registry.connect(stranger).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "NotRetirementOwner",
      );
      const nft = new ethers.Contract(await registry.certificateToken(), HTS_NFT_ABI, operator);
      await nft.associate();
      await expect(registry.connect(operator).claimCertificate(0)).to.emit(registry, "CertificateClaimed");
      await expect(registry.connect(operator).claimCertificate(0)).to.be.revertedWithCustomError(
        registry,
        "NoCertificateToClaim",
      );
    });

    it("rejects over-spending, long beneficiaries, and market hooks from non-markets", async function () {
      const { registry, operator, stranger } = await loadFixture(attested);
      await expect(registry.connect(stranger).withdraw(1))
        .to.be.revertedWithCustomError(registry, "InsufficientCustody")
        .withArgs(1, 0);
      await expect(registry.connect(operator).retire(1, "x".repeat(129))).to.be.revertedWithCustomError(
        registry,
        "BeneficiaryTooLong",
      );
      await expect(
        registry.connect(operator).moveCustody(operator.address, stranger.address, 1),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(operator).retireFor(operator.address, 1, "")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
