import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import {
  AUDIT_TOPIC,
  DECISION_REJECTED,
  HOUR,
  METER,
  OTHER_VVB,
  PROJECT_ID,
  VALIDATION_REPORT_HASH,
  VERIFICATION_REPORT_HASH,
  VVB,
  YEAR,
  deployCore,
  deployReady,
  domainOf,
  encodeEnergy,
  encodeParams,
  hydroParams,
  periodInput,
  recordPeriod,
  registerValidated,
  signSubmission,
  signValidation,
  signVerification,
  submitPeriod,
  verificationOf,
  verifyRecords,
} from "./helpers/dmrv";
import { LIVE_ATTESTATIONS } from "./fixtures/liveAttestations";
import { meterDigestOf, nextRecordsHash, validationApprovalOf } from "../utils/attestation";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const HTS_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function associate() returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const HTS_NFT_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function associate() returns (uint256)",
];

async function ready() {
  return deployReady();
}

async function issued() {
  const ctx = await deployReady();
  await submitPeriod(ctx.registry, await periodInput(PROJECT_ID), ctx.operator);
  return ctx;
}

describe("DmrvRegistry", function () {
  isolateClock();
  describe("deployment and roles", function () {
    it("gives the admin no verifier role, fixes the completeness floor, and rejects a zero admin", async function () {
      const { registry, admin } = await loadFixture(deployCore);
      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await registry.hasRole(await registry.VERIFIER_ROLE(), admin.address)).to.equal(false);
      expect(await registry.minCompletenessBps()).to.equal(9_000);
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

  describe("validation and registration", function () {
    it("stores the module's terms, the validating VVB and its report", async function () {
      const { registry, params, operator, module } = await loadFixture(ready);
      const p = await registry.getProject(PROJECT_ID);
      expect(p.operator).to.equal(operator.address);
      expect(p.meter).to.equal(METER.address);
      expect(p.validator).to.equal(VVB.address);
      expect(p.validationReportHash).to.equal(VALIDATION_REPORT_HASH);
      expect(p.module).to.equal(await module.getAddress());
      expect(p.creditingStart).to.equal(params.creditingStart);
      expect(p.creditingEnd).to.equal(params.creditingEnd);
      expect(p.calibrationValidUntil).to.equal(params.calibrationValidUntil);
      expect(p.registrationRequestedAt).to.equal(params.registrationRequestedAt);
      expect(p.creditingPeriods).to.equal(1);
      expect(await registry.projectOfMeter(METER.address)).to.equal(PROJECT_ID);
      expect(await registry.getProjectIds()).to.deep.equal([PROJECT_ID]);
    });

    it("emits the validation with the VVB, the period and the report", async function () {
      const { registry, module, operator } = await loadFixture(deployCore);
      await registry.setModuleApproved(await module.getAddress(), true);
      await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
      const params = await hydroParams();
      const externalId = ethers.id("VCS-9999");
      await expect(
        registerValidated(registry, await module.getAddress(), encodeParams(params), params.designHash, {
          operator: operator.address,
          externalId,
        }),
      )
        .to.emit(registry, "ProjectValidated")
        .withArgs(PROJECT_ID, VVB.address, 1, VALIDATION_REPORT_HASH, externalId);
      expect(await registry.projectOfExternalId(externalId)).to.equal(PROJECT_ID);
    });

    it("refuses a registration no VVB validated, or validated for other terms", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const other = ethers.encodeBytes32String("OTHER");
      const params = await hydroParams({ designHash: ethers.id("other design") });
      const r = {
        projectId: other,
        module: await module.getAddress(),
        operator: operator.address,
        meter: OTHER_VVB.address,
        designHash: params.designHash,
        validationReportHash: VALIDATION_REPORT_HASH,
        externalId: ethers.ZeroHash,
        params: encodeParams(params),
      };
      const approval = { ...r, reportHash: r.validationReportHash, creditingPeriod: 1 };
      const domain = await domainOf(registry);
      // Signed by a key without VERIFIER_ROLE.
      const stranger = new ethers.Wallet(ethers.Wallet.createRandom().privateKey);
      await expect(registry.registerProject(r, await signValidation(domain, approval, stranger)))
        .to.be.revertedWithCustomError(registry, "UnregisteredVerifier")
        .withArgs(stranger.address);
      // Validated with other params: the recovered signer is someone else.
      const tampered = { ...r, params: encodeParams({ ...params, efGridGPerMwh: 999_999 }) };
      await expect(
        registry.registerProject(tampered, await signValidation(domain, approval, VVB)),
      ).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
      // No validation report.
      const unreported = { ...r, validationReportHash: ethers.ZeroHash };
      await expect(
        registry.registerProject(
          unreported,
          await signValidation(domain, { ...approval, reportHash: ethers.ZeroHash }, VVB),
        ),
      ).to.be.revertedWithCustomError(registry, "EmptyReportHash");
      // A renewal approval (period 2) cannot register.
      await expect(
        registry.registerProject(r, await signValidation(domain, { ...approval, creditingPeriod: 2 }, VVB)),
      ).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
      await registry.registerProject(r, await signValidation(domain, approval, VVB));
    });

    it("refuses a validator that is the project's operator or meter", async function () {
      const { registry, module } = await loadFixture(ready);
      await registry.grantRole(await registry.VERIFIER_ROLE(), OTHER_VVB.address);
      const params = await hydroParams({ designHash: ethers.id("self") });
      await expect(
        registerValidated(registry, await module.getAddress(), encodeParams(params), params.designHash, {
          projectId: ethers.encodeBytes32String("SELF"),
          operator: OTHER_VVB.address,
          meter: ethers.Wallet.createRandom().address,
          validator: OTHER_VVB,
        }),
      ).to.be.revertedWithCustomError(registry, "VerifierIsParty");
    });

    it("rejects an unapproved module, duplicates, a reused meter, design or external id, and non-admins", async function () {
      const { registry, module, operator, stranger, params } = await loadFixture(ready);
      const moduleAddress = await module.getAddress();
      const other = ethers.encodeBytes32String("OTHER");
      const otherParams = await hydroParams({ designHash: ethers.id("other design") });
      const unapproved = await ethers.deployContract("HydroVmr0017Module");
      const register = (o: {
        projectId?: string;
        module?: string;
        meter?: string;
        params?: typeof otherParams;
        externalId?: string;
      }) =>
        registerValidated(
          registry,
          o.module ?? moduleAddress,
          encodeParams(o.params ?? otherParams),
          (o.params ?? otherParams).designHash,
          {
            projectId: o.projectId ?? other,
            operator: operator.address,
            meter: o.meter ?? OTHER_VVB.address,
            externalId: o.externalId,
          },
        );
      await expect(register({ module: await unapproved.getAddress() })).to.be.revertedWithCustomError(
        registry,
        "ModuleNotApproved",
      );
      await expect(register({ projectId: PROJECT_ID })).to.be.revertedWithCustomError(
        registry,
        "ProjectAlreadyRegistered",
      );
      await expect(register({ meter: METER.address })).to.be.revertedWithCustomError(
        registry,
        "MeterAlreadyRegistered",
      );
      await expect(register({ params })).to.be.revertedWithCustomError(registry, "DesignAlreadyRegistered");
      await expect(register({ meter: ethers.ZeroAddress })).to.be.revertedWithCustomError(registry, "ZeroAddress");
      const r = {
        projectId: other,
        module: moduleAddress,
        operator: operator.address,
        meter: OTHER_VVB.address,
        designHash: otherParams.designHash,
        validationReportHash: VALIDATION_REPORT_HASH,
        externalId: ethers.ZeroHash,
        params: encodeParams(otherParams),
      };
      await expect(registry.connect(stranger).registerProject(r, "0x")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
      // One external program id, one project: no double issuance of the same Verra project.
      const vcs = ethers.id("VCS-1234");
      await register({ externalId: vcs });
      const third = await hydroParams({ designHash: ethers.id("third design") });
      await expect(
        register({
          projectId: ethers.encodeBytes32String("THIRD"),
          params: third,
          meter: ethers.Wallet.createRandom().address,
          externalId: vcs,
        }),
      )
        .to.be.revertedWithCustomError(registry, "ExternalIdAlreadyRegistered")
        .withArgs(vcs);
    });

    it("rejects params the module refuses (not an LDC, above 15 MW, 7 years requested after 2027)", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const register = async (p: Awaited<ReturnType<typeof hydroParams>>, id = "OTHER") =>
        registerValidated(registry, await module.getAddress(), encodeParams(p), p.designHash, {
          projectId: ethers.encodeBytes32String(id),
          operator: operator.address,
          meter: ethers.Wallet.createRandom().address,
        });
      const india = await hydroParams({ methodology: 1, hostCountry: "0x494e", designHash: ethers.id("in") });
      await expect(register(india)).to.be.revertedWithCustomError(module, "NotLeastDevelopedCountry");
      const authorized = await hydroParams({
        methodology: 1,
        capacityKw: 14_000,
        authorizedCapacityKw: 16_000,
        designHash: ethers.id("authorized"),
      });
      await expect(register(authorized))
        .to.be.revertedWithCustomError(module, "MethodologyNotApplicable")
        .withArgs(16_000);
      const future = await hydroParams({
        methodology: 1,
        designHash: ethers.id("future"),
        registrationRequestedAt: BigInt(await time.latest()) + 1_000n,
      });
      await expect(register(future)).to.be.revertedWithCustomError(module, "RegistrationInTheFuture");

      await time.increaseTo(1_798_761_600n + 86_400n);
      const late = await hydroParams({ methodology: 1, designHash: ethers.id("late") }, 0);
      await expect(register(late)).to.be.revertedWithCustomError(module, "InvalidCreditingPeriod");
      const five = {
        ...late,
        creditingEnd: late.creditingStart + 5n * YEAR,
        calibrationValidUntil: late.creditingStart + 5n * YEAR,
      };
      await register(five);
      const p = await registry.getProject(ethers.encodeBytes32String("OTHER"));
      expect(p.creditingEnd - p.creditingStart).to.equal(5n * YEAR);
    });
  });

  describe("monitoring records", function () {
    it("records a meter-signed period as monitored ER and issues nothing", async function () {
      const { registry, operator } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const s = await signSubmission(registry, input);
      const expectedHead = nextRecordsHash(ethers.ZeroHash, await domainOf(registry), input, 450_000n);
      await expect(registry.connect(operator).recordMonitoring(s))
        .to.emit(registry, "MonitoringRecorded")
        .withArgs(0, PROJECT_ID, 0, 450_000, input.reportHash, AUDIT_TOPIC, input.hcsSequence, expectedHead, anyBytes);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(0);
      expect(await registry.totalIssuedUnits()).to.equal(0);
      const [a] = await registry.getAttestations(0, 1);
      expect(a.meter).to.equal(METER.address);
      expect(a.sequence).to.equal(0);
      expect(a.reductionG).to.equal(450_000);
      expect(a.cumulativeG).to.equal(450_000);
      expect(a.completenessBps).to.equal(10_000);
      expect(a.chainHash).to.equal(expectedHead);
      const p = await registry.getProject(PROJECT_ID);
      expect(p.attestations).to.equal(1);
      expect(p.verifiedRecords).to.equal(0);
      expect(p.recordsHash).to.equal(expectedHead);
    });

    it("accepts records from the operator or its named reporter only", async function () {
      const { registry, operator, stranger } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID));
      await expect(registry.connect(stranger).recordMonitoring(s))
        .to.be.revertedWithCustomError(registry, "NotReporter")
        .withArgs(stranger.address);
      await expect(registry.connect(stranger).setReporter(PROJECT_ID, stranger.address))
        .to.be.revertedWithCustomError(registry, "NotReporter")
        .withArgs(stranger.address);
      await expect(registry.connect(operator).setReporter(PROJECT_ID, stranger.address))
        .to.emit(registry, "ReporterChanged")
        .withArgs(PROJECT_ID, stranger.address);
      await registry.connect(stranger).recordMonitoring(s);
    });

    it("rejects a record without the meter's signature, or signed for another registry", async function () {
      const { registry, operator } = await loadFixture(ready);
      const input = await periodInput(PROJECT_ID);
      const forged = await signSubmission(registry, input, OTHER_VVB);
      await expect(registry.connect(operator).recordMonitoring(forged)).to.be.revertedWithCustomError(
        registry,
        "InvalidMeterSignature",
      );
      const twin = await ethers.deployContract("DmrvRegistry", [operator.address, 9_000]);
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(twin, input)),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
      const other = await periodInput(PROJECT_ID, {
        metered: { netWh: 460_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n },
      });
      const s = await signSubmission(registry, input);
      await expect(
        registry
          .connect(operator)
          .recordMonitoring({ ...s, measurement: { ...s.measurement, metered: other.measurement.metered } }),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
    });

    it("lets QA/QC lower the meter's figures but never raise them", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const metered = { netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n };
      const raised = await periodInput(PROJECT_ID, { metered, verified: { ...metered, netWh: 450_001n } });
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(registry, raised)),
      ).to.be.revertedWithCustomError(module, "NotMetered");
      const lowered = await periodInput(PROJECT_ID, { metered, verified: { ...metered, netWh: 300_000n } });
      await submitPeriod(registry, lowered, operator);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(300);
    });

    it("uses each meter signature once and each period once", async function () {
      const { registry, operator } = await loadFixture(ready);
      const s = await signSubmission(registry, await periodInput(PROJECT_ID));
      await registry.connect(operator).recordMonitoring(s);
      await expect(registry.connect(operator).recordMonitoring(s)).to.be.revertedWithCustomError(
        registry,
        "PeriodOverlapsPrevious",
      );
      await time.increase(HOUR);
      const next = await periodInput(PROJECT_ID, { sequence: 0, hcsSequence: 2n });
      await expect(registry.connect(operator).recordMonitoring(await signSubmission(registry, next)))
        .to.be.revertedWithCustomError(registry, "StaleLedger")
        .withArgs(1, 0);
    });

    it("computes completeness on-chain from the meter-signed interval count", async function () {
      const { registry, operator } = await loadFixture(ready);
      const low = await periodInput(PROJECT_ID, { intervals: 53 }); // 53 min of 60 = 8,833 bps
      await expect(registry.connect(operator).recordMonitoring(await signSubmission(registry, low)))
        .to.be.revertedWithCustomError(registry, "CompletenessTooLow")
        .withArgs(8_833, 9_000);
      await recordPeriod(registry, await periodInput(PROJECT_ID, { intervals: 55 }), operator);
      expect((await registry.getAttestations(0, 1))[0].completenessBps).to.equal(9_166);
    });

    it("rejects periods after the meter's calibration lapses until a new certificate is recorded", async function () {
      const { registry, operator } = await loadFixture(ready);
      const lapsed = BigInt(await time.latest()) - 2n * BigInt(HOUR);
      await registry.setCalibrationValidUntil(PROJECT_ID, lapsed, ethers.id("certificate 1"));
      const input = await periodInput(PROJECT_ID);
      await expect(registry.connect(operator).recordMonitoring(await signSubmission(registry, input)))
        .to.be.revertedWithCustomError(registry, "CalibrationExpired")
        .withArgs(input.measurement.periodEnd, lapsed);
      await expect(registry.setCalibrationValidUntil(PROJECT_ID, lapsed + 10n * YEAR, ethers.id("certificate 2")))
        .to.emit(registry, "CalibrationUpdated")
        .withArgs(PROJECT_ID, lapsed + 10n * YEAR, ethers.id("certificate 2"));
      await recordPeriod(registry, input, operator);
    });

    it("rejects periods outside the crediting window, in the future, or inverted", async function () {
      const { registry, params, operator } = await loadFixture(ready);
      const before = await periodInput(PROJECT_ID, {
        periodStart: params.creditingStart - BigInt(HOUR),
        periodEnd: params.creditingStart,
      });
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(registry, before)),
      ).to.be.revertedWithCustomError(registry, "OutsideCreditingPeriod");
      const now = BigInt(await time.latest());
      const future = await periodInput(PROJECT_ID, { periodStart: now, periodEnd: now + 10n * BigInt(HOUR) });
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(registry, future)),
      ).to.be.revertedWithCustomError(registry, "InvalidPeriod");
    });

    it("requires an HCS anchor on the audit topic and a report hash", async function () {
      const { registry, operator } = await loadFixture(ready);
      for (const o of [{ hcsTopicNum: 1n }, { hcsSequence: 0n }]) {
        const s = await signSubmission(registry, await periodInput(PROJECT_ID, o));
        await expect(registry.connect(operator).recordMonitoring(s)).to.be.revertedWithCustomError(
          registry,
          "Unanchored",
        );
      }
      const s = await signSubmission(registry, await periodInput(PROJECT_ID, { reportHash: ethers.ZeroHash }));
      await expect(registry.connect(operator).recordMonitoring(s)).to.be.revertedWithCustomError(
        registry,
        "EmptyReportHash",
      );
    });

    it("rejects gross generation above the nameplate", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      const e = { netWh: 400_000n, grossWh: 600_000n, fuelG: 0n, leakageG: 0n }; // 500 kW × 1 h = 500 kWh
      const s = await signSubmission(registry, await periodInput(PROJECT_ID, { metered: e }));
      await expect(registry.connect(operator).recordMonitoring(s)).to.be.revertedWithCustomError(
        module,
        "EnergyExceedsCapacity",
      );
    });

    it("stops a paused project and a rotated meter", async function () {
      const { registry, operator } = await loadFixture(ready);
      await registry.setProjectActive(PROJECT_ID, false);
      const input = await periodInput(PROJECT_ID);
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(registry, input)),
      ).to.be.revertedWithCustomError(registry, "ProjectInactive");
      await registry.setProjectActive(PROJECT_ID, true);
      await registry.setMeter(PROJECT_ID, OTHER_VVB.address);
      expect(await registry.projectOfMeter(METER.address)).to.equal(ethers.ZeroHash);
      await expect(
        registry.connect(operator).recordMonitoring(await signSubmission(registry, input)),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
      await registry.connect(operator).recordMonitoring(await signSubmission(registry, input, OTHER_VVB));
    });
  });

  describe("verification and issuance", function () {
    async function threeRecords() {
      const ctx = await deployReady();
      for (let i = 0; i < 3; i++) {
        if (i) await time.increase(HOUR);
        await recordPeriod(ctx.registry, await periodInput(PROJECT_ID, { sequence: i }), ctx.operator);
      }
      return ctx;
    }

    it("issues the verified run's ER into the operator's custody, relayed by anyone", async function () {
      const { registry, operator, stranger } = await loadFixture(threeRecords);
      const statement = await verificationOf(registry, PROJECT_ID);
      expect([statement.firstRecord, statement.lastRecord]).to.deep.equal([0, 2]);
      const signature = await signVerification(await domainOf(registry), statement, VVB);
      await expect(registry.connect(stranger).verifyPeriod(statement, signature))
        .to.emit(registry, "PeriodVerified")
        .withArgs(0, PROJECT_ID, VVB.address, 0, 2, 1, 1_350_000, 0, 1_350, VERIFICATION_REPORT_HASH, ethers.ZeroHash);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(1_350);
      expect(await registry.totalIssuedUnits()).to.equal(1_350);
      const i = await registry.getIssuance(0);
      expect(i.verifier).to.equal(VVB.address);
      expect(i.monitoredG).to.equal(1_350_000);
      expect(i.unitsIssued).to.equal(1_350);
      expect(i.hcsSequence).to.equal(statement.hcsSequence);
      expect((await registry.getProject(PROJECT_ID)).verifiedRecords).to.equal(3);
    });

    it("verifies in contiguous runs: a partial run first, then the rest", async function () {
      const { registry, operator } = await loadFixture(threeRecords);
      await verifyRecords(registry, PROJECT_ID, { lastRecord: 0 });
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      await expect(verifyRecords(registry, PROJECT_ID, { firstRecord: 0, lastRecord: 2 }))
        .to.be.revertedWithCustomError(registry, "InvalidRecordRange")
        .withArgs(0, 2);
      await expect(verifyRecords(registry, PROJECT_ID, { lastRecord: 3 })).to.be.revertedWithCustomError(
        registry,
        "InvalidRecordRange",
      );
      await verifyRecords(registry, PROJECT_ID, { lastRecord: 2 });
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(1_350);
      expect((await registry.getIssuance(1)).monitoredG).to.equal(900_000);
    });

    it("binds the verification to the exact records: a different chain head is refused", async function () {
      const { registry } = await loadFixture(threeRecords);
      const [first] = await registry.getAttestations(0, 1);
      await expect(
        verifyRecords(registry, PROJECT_ID, { lastRecord: 2, recordsHash: first.chainHash }),
      ).to.be.revertedWithCustomError(registry, "RecordsHashMismatch");
    });

    it("applies the VVB's deduction and carries the remainder", async function () {
      const { registry, operator } = await loadFixture(threeRecords);
      await verifyRecords(registry, PROJECT_ID, { deductionG: 100_500n });
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(1_249);
      expect((await registry.getProject(PROJECT_ID)).balanceG).to.equal(500);
      expect((await registry.getIssuance(0)).deductionG).to.equal(100_500);
    });

    it("closes a rejected run without issuing and without keeping its ER", async function () {
      const { registry, operator } = await loadFixture(threeRecords);
      await verifyRecords(registry, PROJECT_ID, { lastRecord: 1, decision: DECISION_REJECTED });
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(0);
      expect((await registry.getIssuance(0)).unitsIssued).to.equal(0);
      expect((await registry.getProject(PROJECT_ID)).verifiedRecords).to.equal(2);
      await verifyRecords(registry, PROJECT_ID);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
    });

    it("rejects a verification from a key without VERIFIER_ROLE, a party to the project, or an unknown decision", async function () {
      const { registry, operator } = await loadFixture(threeRecords);
      await expect(verifyRecords(registry, PROJECT_ID, { vvb: OTHER_VVB }))
        .to.be.revertedWithCustomError(registry, "UnregisteredVerifier")
        .withArgs(OTHER_VVB.address);
      const reporter = new ethers.Wallet(ethers.Wallet.createRandom().privateKey);
      await registry.grantRole(await registry.VERIFIER_ROLE(), reporter.address);
      await registry.connect(operator).setReporter(PROJECT_ID, reporter.address);
      await expect(verifyRecords(registry, PROJECT_ID, { vvb: reporter })).to.be.revertedWithCustomError(
        registry,
        "VerifierIsParty",
      );
      await expect(verifyRecords(registry, PROJECT_ID, { decision: 3 }))
        .to.be.revertedWithCustomError(registry, "InvalidDecision")
        .withArgs(3);
    });

    it("rejects a verification signed before the VVB's role was revoked", async function () {
      const { registry } = await loadFixture(threeRecords);
      const statement = await verificationOf(registry, PROJECT_ID);
      const signature = await signVerification(await domainOf(registry), statement, VVB);
      await registry.revokeRole(await registry.VERIFIER_ROLE(), VVB.address);
      await expect(registry.verifyPeriod(statement, signature))
        .to.be.revertedWithCustomError(registry, "UnregisteredVerifier")
        .withArgs(VVB.address);
    });

    it("requires a verification report anchored on the audit topic", async function () {
      const { registry } = await loadFixture(threeRecords);
      await expect(verifyRecords(registry, PROJECT_ID, { reportHash: ethers.ZeroHash })).to.be.revertedWithCustomError(
        registry,
        "EmptyReportHash",
      );
      await expect(verifyRecords(registry, PROJECT_ID, { hcsSequence: 0n })).to.be.revertedWithCustomError(
        registry,
        "Unanchored",
      );
    });

    it("lets one evidence document back one issuance only", async function () {
      const { registry } = await loadFixture(threeRecords);
      const evidenceHash = ethers.id("guardian vc");
      await verifyRecords(registry, PROJECT_ID, { lastRecord: 0, evidenceHash });
      expect(await registry.evidenceUsed(evidenceHash)).to.equal(true);
      expect((await registry.getIssuance(0)).evidenceHash).to.equal(evidenceHash);
      await expect(verifyRecords(registry, PROJECT_ID, { evidenceHash }))
        .to.be.revertedWithCustomError(registry, "EvidenceAlreadyUsed")
        .withArgs(evidenceHash);
    });

    it("carries the sub-kg remainder in the core ledger", async function () {
      const { registry, operator } = await loadFixture(ready);
      const e = { netWh: 1_500n, grossWh: 1_600n, fuelG: 0n, leakageG: 0n };
      await submitPeriod(registry, await periodInput(PROJECT_ID, { metered: e }), operator);
      expect((await registry.getProject(PROJECT_ID)).balanceG).to.equal(500);
      await time.increase(HOUR);
      await submitPeriod(registry, await periodInput(PROJECT_ID, { sequence: 1, metered: e }), operator);
      expect((await registry.getProject(PROJECT_ID)).balanceG).to.equal(0);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(3);
    });

    it("keeps quantifying a registered project after its module is withdrawn for new registrations", async function () {
      const { registry, module, operator } = await loadFixture(ready);
      await registry.setModuleApproved(await module.getAddress(), false);
      await submitPeriod(registry, await periodInput(PROJECT_ID), operator);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      const params = await hydroParams({ designHash: ethers.id("new") });
      await expect(
        registerValidated(registry, await module.getAddress(), encodeParams(params), params.designHash, {
          projectId: ethers.encodeBytes32String("NEW"),
          operator: operator.address,
          meter: OTHER_VVB.address,
        }),
      ).to.be.revertedWithCustomError(registry, "ModuleNotApproved");
    });

    it("restricts meter, calibration and status changes to the admin", async function () {
      const { registry, stranger } = await loadFixture(ready);
      const r = registry.connect(stranger);
      for (const call of [
        () => r.setMeter(PROJECT_ID, OTHER_VVB.address),
        () => r.setCalibrationValidUntil(PROJECT_ID, 1n, ethers.id("c")),
        () => r.setProjectActive(PROJECT_ID, false),
        () => r.setAuditTopic(1n),
        () => r.setModuleApproved(OTHER_VVB.address, true),
        () => r.renewCreditingPeriod(PROJECT_ID, "0x", VALIDATION_REPORT_HASH, "0x"),
      ]) {
        await expect(call()).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      }
    });
  });

  describe("EIP-712 fixture shared with the TypeScript client", function () {
    it("matches services/mrv/fixtures/eip712.json (UPDATE_EIP712_FIXTURE=1 rewrites it)", async function () {
      const { admin, module } = await loadFixture(deployCore);
      // A fixed deployer at nonce 0 gives the registry a fixed address, so the digests are reproducible.
      const deployer = new ethers.Wallet(ethers.id("dmrv eip712 fixture deployer"), ethers.provider);
      if ((await ethers.provider.getTransactionCount(deployer.address)) !== 0) this.skip();
      await admin.sendTransaction({ to: deployer.address, value: ethers.parseEther("50") });
      const factory = await ethers.getContractFactory("DmrvRegistry", deployer);
      const registry = await factory.deploy(deployer.address, 9_000);
      const domain = await domainOf(registry);
      await registry.createCreditToken("HYCC", "HYCC", "", { value: ethers.parseEther("20") });
      await registry.setModuleApproved(await module.getAddress(), true);
      await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
      await registry.setAuditTopic(AUDIT_TOPIC);

      // Fixed dates (June 2026), so the params and every digest are the same on any run.
      const start = 1_780_000_000n;
      const params = {
        ...(await hydroParams({ designHash: ethers.sha256(ethers.toUtf8Bytes("design")) })),
        creditingStart: start,
        creditingEnd: start + 7n * YEAR,
        registrationRequestedAt: start,
        calibrationValidUntil: start + 7n * YEAR,
      };
      const validation = {
        projectId: PROJECT_ID,
        module: await module.getAddress(),
        operator: deployer.address,
        meter: METER.address,
        designHash: params.designHash,
        params: encodeParams(params),
        reportHash: ethers.sha256(ethers.toUtf8Bytes("validation report")),
        externalId: ethers.id("VCS-0000"),
        creditingPeriod: 1,
      };
      const validationSignature = await signValidation(domain, validation, VVB);
      await registry.registerProject(
        { ...validation, validationReportHash: validation.reportHash },
        validationSignature,
      );

      const energy = { netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n };
      const input = {
        projectId: PROJECT_ID,
        sequence: 0,
        intervals: 60,
        intervalSeconds: 60,
        readingsDigest: ethers.sha256(ethers.toUtf8Bytes("readings")),
        reportHash: ethers.sha256(ethers.toUtf8Bytes("report")),
        hcsTopicNum: AUDIT_TOPIC,
        hcsSequence: 1n,
        measurement: {
          periodStart: params.creditingStart + 86_400n,
          periodEnd: params.creditingStart + 86_400n + 3_600n,
          metered: encodeEnergy(energy),
          verified: encodeEnergy({ ...energy, netWh: 440_000n }),
        },
      };
      const s = await signSubmission(registry, input);
      await registry.recordMonitoring(s);
      const [record] = await registry.getAttestations(0, 1);
      const statement = await verificationOf(registry, PROJECT_ID, { evidenceHash: ethers.id("guardian vc") });
      const verificationSignature = await signVerification(domain, statement, VVB);
      await registry.verifyPeriod(statement, verificationSignature);
      expect((await registry.getIssuance(0)).unitsIssued).to.equal(440);
      expect(record.chainHash).to.equal(nextRecordsHash(ethers.ZeroHash, domain, input, 440_000n));

      const str = (o: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
      const fixture = {
        note: "Generated by packages/hardhat/test/DmrvRegistry.test.ts from DmrvRegistry on the Hardhat chain. Test keys only.",
        domain: {
          name: "DmrvRegistry",
          version: "2",
          chainId: Number((await ethers.provider.getNetwork()).chainId),
          verifyingContract: await registry.getAddress(),
        },
        meterAddress: METER.address,
        verifierAddress: VVB.address,
        validation: {
          ...str(validationApprovalOf(validation)),
          signature: validationSignature,
          digest: ethers.TypedDataEncoder.hash(
            domain,
            { ValidationApproval: VALIDATION_TYPES },
            validationApprovalOf(validation),
          ),
        },
        submission: {
          ...input,
          hcsTopicNum: input.hcsTopicNum.toString(),
          hcsSequence: input.hcsSequence.toString(),
          measurement: {
            ...input.measurement,
            periodStart: input.measurement.periodStart.toString(),
            periodEnd: input.measurement.periodEnd.toString(),
          },
          meterSignature: s.meterSignature,
        },
        meterStatementDigest: meterDigestOf(domain, input),
        reductionG: "440000",
        recordsHash: record.chainHash,
        verification: {
          ...str(statement),
          signature: verificationSignature,
        },
      };
      const path = join(__dirname, "../../nextjs/services/mrv/fixtures/eip712.json");
      const json = JSON.stringify(fixture, null, 2) + "\n";
      if (process.env.UPDATE_EIP712_FIXTURE === "1") writeFileSync(path, json);
      expect(readFileSync(path, "utf8")).to.equal(json);
    });
  });

  describe("greenfield parity with the phase-0 testnet mints (full flow)", function () {
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
        await registerValidated(registry, await module.getAddress(), encodeParams(params), live.design.designHash, {
          projectId: id,
          operator: operator.address,
        });
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
        await recordPeriod(registry, input, operator);
        const [a] = await registry.getAttestations(0, 1);
        expect(a.reductionG).to.equal(live.expected.reductionG);
        expect(a.completenessBps).to.equal(10_000);
        const statement = await verificationOf(registry, id);
        await registry.verifyPeriod(
          { ...statement, hcsTopicNum: live.hcsTopicNum },
          await signVerification(await domainOf(registry), { ...statement, hcsTopicNum: live.hcsTopicNum }, VVB),
        );
        expect((await registry.getIssuance(0)).unitsIssued).to.equal(live.expected.unitsMinted);
        expect((await registry.getProject(id)).balanceG).to.equal(live.expected.balanceG);
        expect(await registry.custodyBalanceOf(operator.address)).to.equal(live.expected.unitsMinted);
      });
    }
  });

  describe("crediting-period renewal", function () {
    async function renewalOf(
      registry: Awaited<ReturnType<typeof deployReady>>["registry"],
      params: Awaited<ReturnType<typeof hydroParams>>,
      operator: string,
      module: string,
      creditingPeriod = 2,
      validator = VVB,
    ) {
      const newParams = encodeParams(params);
      const signature = await signValidation(
        await domainOf(registry),
        {
          projectId: PROJECT_ID,
          module,
          operator,
          meter: METER.address,
          designHash: params.designHash,
          params: newParams,
          reportHash: VALIDATION_REPORT_HASH,
          externalId: ethers.ZeroHash,
          creditingPeriod,
        },
        validator,
      );
      return { newParams, signature };
    }

    it("renews after a VVB validates it, resets the module ledger and keeps the ER balance", async function () {
      const { registry, params, operator, module } = await loadFixture(ready);
      const e = { netWh: 1_500n, grossWh: 1_600n, fuelG: 0n, leakageG: 0n };
      await submitPeriod(registry, await periodInput(PROJECT_ID, { metered: e }), operator);
      await time.increaseTo(params.creditingEnd);
      const next = {
        ...params,
        creditingStart: params.creditingEnd,
        creditingEnd: params.creditingEnd + 7n * YEAR,
        calibrationValidUntil: params.creditingEnd + 7n * YEAR,
        efGridGPerMwh: 900_000,
      };
      const { newParams, signature } = await renewalOf(registry, next, operator.address, await module.getAddress());
      await expect(registry.renewCreditingPeriod(PROJECT_ID, newParams, VALIDATION_REPORT_HASH, signature))
        .to.emit(registry, "CreditingPeriodRenewed")
        .withArgs(PROJECT_ID, next.creditingStart, next.creditingEnd, newParams)
        .and.to.emit(registry, "ProjectValidated")
        .withArgs(PROJECT_ID, VVB.address, 2, VALIDATION_REPORT_HASH, ethers.ZeroHash);
      const p = await registry.getProject(PROJECT_ID);
      expect(p.creditingPeriods).to.equal(2);
      expect(p.state).to.equal(ethers.ZeroHash);
      expect(p.balanceG).to.equal(500);
      expect(p.creditingStart).to.equal(next.creditingStart);
    });

    it("re-measures Cap_PJ and A_PJ at renewal, and re-checks the power density", async function () {
      const { registry, params, operator, module } = await loadFixture(ready);
      await time.increaseTo(params.creditingEnd);
      const base = {
        ...params,
        creditingStart: params.creditingEnd,
        creditingEnd: params.creditingEnd + 7n * YEAR,
        calibrationValidUntil: params.creditingEnd + 7n * YEAR,
      };
      const flooded = { ...base, reservoirAreaM2: 1_000_000 }; // 500 kW over 1 km² = 0.5 W/m²
      const bad = await renewalOf(registry, flooded, operator.address, await module.getAddress());
      await expect(
        registry.renewCreditingPeriod(PROJECT_ID, bad.newParams, VALIDATION_REPORT_HASH, bad.signature),
      ).to.be.revertedWithCustomError(module, "PowerDensityTooLow");
      const uprated = { ...base, capacityKw: 600 };
      const ok = await renewalOf(registry, uprated, operator.address, await module.getAddress());
      await registry.renewCreditingPeriod(PROJECT_ID, ok.newParams, VALIDATION_REPORT_HASH, ok.signature);
    });

    it("refuses a renewal without the VVB's validation, with unverified records, longer, or redesigned", async function () {
      const { registry, module, params, operator, stranger } = await loadFixture(ready);
      const moduleAddress = await module.getAddress();
      await recordPeriod(registry, await periodInput(PROJECT_ID), operator);
      await time.increaseTo(params.creditingEnd);
      const same = {
        ...params,
        creditingStart: params.creditingEnd,
        creditingEnd: params.creditingEnd + 7n * YEAR,
        calibrationValidUntil: params.creditingEnd + 7n * YEAR,
      };
      const r = await renewalOf(registry, same, operator.address, moduleAddress);
      await expect(
        registry.renewCreditingPeriod(PROJECT_ID, r.newParams, VALIDATION_REPORT_HASH, r.signature),
      ).to.be.revertedWithCustomError(registry, "InvalidRecordRange");
      await verifyRecords(registry, PROJECT_ID);
      const stale = await renewalOf(registry, same, operator.address, moduleAddress, 1);
      await expect(
        registry.renewCreditingPeriod(PROJECT_ID, stale.newParams, VALIDATION_REPORT_HASH, stale.signature),
      ).to.be.revertedWithCustomError(registry, "UnregisteredVerifier");
      const longer = { ...same, creditingEnd: params.creditingEnd + 10n * YEAR };
      const l = await renewalOf(registry, longer, operator.address, moduleAddress);
      await expect(
        registry.renewCreditingPeriod(PROJECT_ID, l.newParams, VALIDATION_REPORT_HASH, l.signature),
      ).to.be.revertedWithCustomError(module, "RenewalSpan");
      const redesigned = { ...same, designHash: ethers.id("new") };
      const d = await renewalOf(registry, redesigned, operator.address, moduleAddress);
      await expect(
        registry.renewCreditingPeriod(PROJECT_ID, d.newParams, VALIDATION_REPORT_HASH, d.signature),
      ).to.be.revertedWithCustomError(module, "ParamsChanged");
      await expect(
        registry.connect(stranger).renewCreditingPeriod(PROJECT_ID, r.newParams, VALIDATION_REPORT_HASH, r.signature),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await registry.renewCreditingPeriod(PROJECT_ID, r.newParams, VALIDATION_REPORT_HASH, r.signature);
    });
  });

  describe("annotations kept outside the registry", function () {
    it("records Article 6, corresponding adjustments, VCU references and VVB accreditation, admin only", async function () {
      const { registry, admin, stranger } = await loadFixture(issued);
      const notes = await ethers.deployContract("DmrvAnnotations", [admin.address, await registry.getAddress()]);
      const a6 = {
        hostParty: "0x5547",
        authorizedUse: 1,
        firstTransferDefinition: 1,
        authorizationRef: ethers.id("LoA"),
      };
      await expect(notes.setArticle6(PROJECT_ID, a6)).to.emit(notes, "Article6Set");
      expect((await notes.article6Of(PROJECT_ID)).authorizationRef).to.equal(ethers.id("LoA"));
      await expect(notes.setArticle6(ethers.id("nope"), a6)).to.be.revertedWithCustomError(notes, "UnknownProject");
      await notes.setCorrespondingAdjustment(0, 1, ethers.id("BTR 2028"));
      expect(await notes.correspondingAdjustmentOf(0)).to.equal(1);
      await expect(notes.setCorrespondingAdjustment(0, 3, ethers.ZeroHash)).to.be.revertedWithCustomError(
        notes,
        "InvalidStatus",
      );
      await expect(notes.setVcuReference(9, ethers.id("x"))).to.be.revertedWithCustomError(notes, "UnknownIssuance");
      await expect(notes.setVcuReference(0, ethers.id("VCS-1234-2026-001-450")))
        .to.emit(notes, "VcuReferenceSet")
        .withArgs(0, ethers.id("VCS-1234-2026-001-450"));
      await notes.setVerifierProfile(VVB.address, ethers.id("accreditation"));
      expect(await notes.verifierProfileOf(VVB.address)).to.equal(ethers.id("accreditation"));
      await expect(notes.connect(stranger).setVcuReference(0, ethers.ZeroHash)).to.be.revertedWithCustomError(
        notes,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("custody, deposit, retirement and certificates", function () {
    it("requires an HTS association before credits leave the registry", async function () {
      const { registry, operator, mocked } = await loadFixture(issued);
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

    it("takes withdrawn credits back into custody so they can still be retired", async function () {
      const { registry, operator } = await loadFixture(issued);
      const token = new ethers.Contract(await registry.creditToken(), HTS_TOKEN_ABI, operator);
      await token.associate();
      await registry.connect(operator).withdraw(100);
      await expect(registry.connect(operator).deposit(0)).to.be.revertedWithCustomError(registry, "ZeroAmount");
      await expect(registry.connect(operator).deposit(40)).to.be.revertedWithCustomError(registry, "HtsCallFailed");
      await token.approve(await registry.getAddress(), 40);
      await expect(registry.connect(operator).deposit(40))
        .to.emit(registry, "Deposited")
        .withArgs(operator.address, 40);
      expect(await token.balanceOf(operator.address)).to.equal(60);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(390);
      expect(await token.balanceOf(await registry.getAddress())).to.equal(390);
      await registry.connect(operator).retire(390, "after a round trip");
      expect(await registry.totalRetiredUnits()).to.equal(390);
    });

    it("retires by burning, mints a certificate and delivers it to an associated wallet", async function () {
      const { registry, operator } = await loadFixture(issued);
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
      expect((await registry.getRetirement(0)).units).to.equal(50);
    });

    it("lets a pending certificate be claimed once by its owner", async function () {
      const { registry, operator, stranger, mocked } = await loadFixture(issued);
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
      const { registry, operator, stranger } = await loadFixture(issued);
      await expect(registry.connect(stranger).withdraw(1))
        .to.be.revertedWithCustomError(registry, "InsufficientCustody")
        .withArgs(1, 0);
      await expect(registry.connect(operator).retire(1, "x".repeat(129))).to.be.revertedWithCustomError(
        registry,
        "BeneficiaryTooLong",
      );
      await expect(registry.connect(operator).moveCustody(operator.address, stranger.address, 1))
        .to.be.revertedWithCustomError(registry, "NotMarket")
        .withArgs(operator.address);
      await expect(registry.connect(operator).retireFor(operator.address, 1, ""))
        .to.be.revertedWithCustomError(registry, "NotMarket")
        .withArgs(operator.address);
    });

    it("names its market once, so no role grant gives the admin a path to anyone's credits", async function () {
      const { registry, market, admin, operator, stranger } = await loadFixture(issued);
      expect(await registry.market()).to.equal(await market.getAddress());
      await expect(registry.setMarket(await market.getAddress()))
        .to.be.revertedWithCustomError(registry, "MarketAlreadySet")
        .withArgs(await market.getAddress());
      await registry.grantRole(ethers.id("MARKET_ROLE"), admin.address);
      await expect(
        registry.connect(admin).moveCustody(operator.address, stranger.address, 1),
      ).to.be.revertedWithCustomError(registry, "NotMarket");
    });

    it("refuses an externally owned account as its market", async function () {
      const { registry, stranger } = await loadFixture(deployCore);
      await expect(registry.setMarket(stranger.address)).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });
});

const VALIDATION_TYPES = [
  { name: "projectId", type: "bytes32" },
  { name: "module", type: "address" },
  { name: "operator", type: "address" },
  { name: "meter", type: "address" },
  { name: "designHash", type: "bytes32" },
  { name: "paramsHash", type: "bytes32" },
  { name: "reportHash", type: "bytes32" },
  { name: "externalId", type: "bytes32" },
  { name: "creditingPeriod", type: "uint8" },
];

/** Matches any `bytes` event argument (the module's breakdown). */
function anyBytes(value: unknown) {
  return typeof value === "string" && value.startsWith("0x");
}
