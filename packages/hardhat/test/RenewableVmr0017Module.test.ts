import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import {
  AUDIT_TOPIC,
  DAY,
  FIVE_YEAR_FROM,
  HOUR,
  METER,
  VVB,
  YEAR,
  deployCore,
  encodeEnergy,
  periodInput,
  submitPeriod,
} from "./helpers/dmrv";
import { RENEWABLE_VECTORS } from "./fixtures/renewableVectors";

const PARAMS_TYPE =
  "tuple(uint8 methodology,uint8 technology,uint8 incomeGroup,bool battery,uint32 capacityKw,uint32 efGridGPerMwh,uint32 fuelCoefGPerTonne,uint64 creditingStart,uint64 creditingEnd,uint64 registrationRequestedAt,uint64 calibrationValidUntil,bytes32 meteringHash,bytes32 designHash)";
const BREAKDOWN = ["uint32", "int256", "int256", "uint256", "uint256", "uint256", "int256", "uint256", "int256"];
const SOLAR_PV = 0;
const FLOATING_SOLAR = 1;
const WIND_ONSHORE = 2;
const WIND_OFFSHORE = 3;
const WAVE = 4;
const TIDAL = 5;
const HIGH_INCOME = 3;

type RenewableParams = {
  methodology: number;
  technology: number;
  incomeGroup: number;
  battery: boolean;
  capacityKw: number;
  efGridGPerMwh: number;
  fuelCoefGPerTonne: number;
  creditingStart: bigint;
  creditingEnd: bigint;
  registrationRequestedAt: bigint;
  calibrationValidUntil: bigint;
  meteringHash: string;
  designHash: string;
};

const coder = ethers.AbiCoder.defaultAbiCoder();
const encode = (p: RenewableParams) => coder.encode([PARAMS_TYPE], [p]);

async function renewableParams(overrides: Partial<RenewableParams> = {}, startedDaysAgo = 30) {
  const creditingStart = BigInt((await time.latest()) - startedDaysAgo * DAY);
  const creditingEnd = creditingStart + 7n * YEAR;
  return {
    methodology: 1,
    technology: SOLAR_PV,
    incomeGroup: 1,
    battery: false,
    capacityKw: 5_000,
    efGridGPerMwh: 1_000_000,
    fuelCoefGPerTonne: 3_238_840,
    creditingStart,
    creditingEnd,
    registrationRequestedAt: creditingStart,
    calibrationValidUntil: creditingEnd,
    meteringHash: ethers.id("solar metering plan"),
    designHash: ethers.id("solar design"),
    ...overrides,
  };
}

const energy = (netWh: number | bigint, grossWh: number | bigint, fuelG = 0, leakageG = 0) =>
  encodeEnergy({ netWh: BigInt(netWh), grossWh: BigInt(grossWh), fuelG: BigInt(fuelG), leakageG: BigInt(leakageG) });

describe("RenewableVmr0017Module", function () {
  isolateClock();

  async function moduleOnly() {
    return ethers.deployContract("RenewableVmr0017Module");
  }

  describe("identity", function () {
    it("publishes its methodology id, version and schema hash", async function () {
      const module = await loadFixture(moduleOnly);
      expect(await module.methodologyId()).to.equal(ethers.id("renewable/acm0002+vmr0017"));
      expect(await module.version()).to.equal(2);
      expect(await module.schemaHash()).to.equal(
        ethers.id(
          "RenewableParams(uint8,uint8,uint8,bool,uint32,uint32,uint32,uint64,uint64,uint64,uint64,bytes32,bytes32)Energy(int64,uint64,uint64,uint64)",
        ),
      );
      expect(await module.describe(encode(await renewableParams()))).to.equal(
        '{"id":"renewable/acm0002+vmr0017","version":2,"methodology":"VMR0017","technology":0,"capacityKw":5000,"efGridGPerMwh":1000000}',
      );
    });
  });

  describe("validateProject", function () {
    it("returns the crediting window and a nameplate bound rounded up", async function () {
      const module = await loadFixture(moduleOnly);
      const p = await renewableParams({ capacityKw: 1 });
      const terms = await module.validateProject(encode(p));
      expect(terms.creditingStart).to.equal(p.creditingStart);
      expect(terms.creditingEnd).to.equal(p.creditingEnd);
      expect(terms.maxQuantityPerSecond).to.equal(1n); // 1 kW = 0.28 Wh/s, rounded up
      expect(terms.registrationRequestedAt).to.equal(p.registrationRequestedAt);
    });

    it("refuses VMR0017 terrestrial solar and wind in a high-income country (Table 1)", async function () {
      const module = await loadFixture(moduleOnly);
      for (const technology of [SOLAR_PV, WIND_ONSHORE, WIND_OFFSHORE]) {
        await expect(module.validateProject(encode(await renewableParams({ technology, incomeGroup: HIGH_INCOME }))))
          .to.be.revertedWithCustomError(module, "NotApplicableInHighIncomeCountry")
          .withArgs(technology);
      }
    });

    it("accepts floating solar, wave and tidal in a high-income country, and CDM solar anywhere", async function () {
      const module = await loadFixture(moduleOnly);
      // Table 1 lists floating solar, wave and tidal without a geographic restriction.
      for (const technology of [FLOATING_SOLAR, WAVE, TIDAL]) {
        await module.validateProject(encode(await renewableParams({ technology, incomeGroup: HIGH_INCOME })));
      }
      await module.validateProject(encode(await renewableParams({ methodology: 0, incomeGroup: HIGH_INCOME })));
    });

    it("refuses a design with battery storage until PE_BESS and PE_FSS are implemented", async function () {
      const module = await loadFixture(moduleOnly);
      await expect(
        module.validateProject(encode(await renewableParams({ battery: true }))),
      ).to.be.revertedWithCustomError(module, "BatteryStorageNotSupported");
    });

    it("refuses unknown codes, zero capacity and an out-of-range grid factor", async function () {
      const module = await loadFixture(moduleOnly);
      for (const bad of [{ methodology: 2 }, { technology: 6 }, { incomeGroup: 4 }, { capacityKw: 0 }]) {
        await expect(module.validateProject(encode(await renewableParams(bad)))).to.be.revertedWithCustomError(
          module,
          "InvalidParams",
        );
      }
      for (const ef of [0, 2_000_001]) {
        await expect(module.validateProject(encode(await renewableParams({ efGridGPerMwh: ef }))))
          .to.be.revertedWithCustomError(module, "GridEmissionFactorOutOfRange")
          .withArgs(ef);
      }
    });

    it("needs a registration request in the past, calibration after the start, and a legal span", async function () {
      const module = await loadFixture(moduleOnly);
      await expect(
        module.validateProject(encode(await renewableParams({ registrationRequestedAt: 0n }))),
      ).to.be.revertedWithCustomError(module, "MissingRegistrationRequest");
      const future = BigInt(await time.latest()) + 1_000n;
      await expect(module.validateProject(encode(await renewableParams({ registrationRequestedAt: future }))))
        .to.be.revertedWithCustomError(module, "RegistrationInTheFuture")
        .withArgs(future);
      const p = await renewableParams();
      await expect(
        module.validateProject(encode({ ...p, calibrationValidUntil: p.creditingStart })),
      ).to.be.revertedWithCustomError(module, "MissingCalibration");
      await expect(
        module.validateProject(encode({ ...p, creditingEnd: p.creditingStart + 6n * YEAR })),
      ).to.be.revertedWithCustomError(module, "InvalidCreditingPeriod");
    });

    it("gives VMR0017 registrations requested from 1 Jan 2027 exactly five years", async function () {
      const module = await loadFixture(moduleOnly);
      await time.increaseTo(FIVE_YEAR_FROM + 10n);
      const seven = await renewableParams({ registrationRequestedAt: FIVE_YEAR_FROM });
      await expect(module.validateProject(encode(seven))).to.be.revertedWithCustomError(
        module,
        "InvalidCreditingPeriod",
      );
      await module.validateProject(encode({ ...seven, creditingEnd: seven.creditingStart + 5n * YEAR }));
      await module.validateProject(encode({ ...seven, methodology: 0 })); // CDM keeps 7 years
    });
  });

  describe("validateRenewal", function () {
    it("repeats the previous span, allows a new grid factor, and refuses other changes", async function () {
      const module = await loadFixture(moduleOnly);
      const old = await renewableParams({}, 7 * 365 + 10);
      const next = {
        ...old,
        creditingStart: old.creditingEnd,
        creditingEnd: old.creditingEnd + 7n * YEAR,
        calibrationValidUntil: old.creditingEnd + 7n * YEAR,
        efGridGPerMwh: 700_000,
      };
      await module.validateRenewal(encode(old), encode(next), old.creditingStart, old.creditingEnd, 1);
      await expect(
        module.validateRenewal(
          encode(old),
          encode({ ...next, technology: WIND_ONSHORE }),
          old.creditingStart,
          old.creditingEnd,
          1,
        ),
      ).to.be.revertedWithCustomError(module, "ParamsChanged");
      await expect(
        module.validateRenewal(
          encode(old),
          encode({ ...next, creditingEnd: next.creditingStart + 5n * YEAR }),
          old.creditingStart,
          old.creditingEnd,
          1,
        ),
      ).to.be.revertedWithCustomError(module, "RenewalSpan");
      await expect(
        module.validateRenewal(encode(old), encode(next), old.creditingStart, old.creditingEnd, 3),
      ).to.be.revertedWithCustomError(module, "NotRenewable");
    });

    it("renews a VMR0017 project for 5 years from 1 Jan 2027 (VCS v5), a CDM project for its original span", async function () {
      const module = await loadFixture(moduleOnly);
      if (BigInt(await time.latest()) < FIVE_YEAR_FROM) await time.increaseTo(FIVE_YEAR_FROM);
      for (const [methodology, to, ok] of [
        [1, 5n, true],
        [1, 7n, false],
        [0, 7n, true],
      ] as [number, bigint, boolean][]) {
        const old = await renewableParams({ methodology }, 7 * 365);
        const next = {
          ...old,
          creditingStart: old.creditingEnd,
          creditingEnd: old.creditingEnd + to * YEAR,
          calibrationValidUntil: old.creditingEnd + to * YEAR,
        };
        const call = module.validateRenewal(encode(old), encode(next), old.creditingStart, old.creditingEnd, 1);
        if (ok) await call;
        else await expect(call).to.be.revertedWithCustomError(module, "RenewalSpan");
      }
    });
  });

  describe("quantify", function () {
    for (const vector of RENEWABLE_VECTORS) {
      it(`matches the shared vector: ${vector.name}`, async function () {
        const module = await loadFixture(moduleOnly);
        const p = await renewableParams(vector.design);
        let state = ethers.ZeroHash;
        for (const period of vector.periods) {
          const periodStart = p.creditingStart + BigInt(period.startDay * DAY);
          const e = energy(period.netWh, period.grossWh, period.fuelG, period.leakageG);
          const r = await module.quantify(encode(p), state, {
            periodStart,
            periodEnd: periodStart + BigInt(DAY),
            metered: e,
            verified: e,
          });
          const [, , baselineG, reservoirG, fossilG, leakageG, reductionG, units, balanceG] = coder.decode(
            BREAKDOWN,
            r.breakdown,
          );
          expect({
            baselineG: Number(baselineG),
            fossilFuelG: Number(fossilG),
            leakageG: Number(leakageG),
            reductionG: Number(reductionG),
            unitsMinted: Number(units),
            balanceG: Number(balanceG),
          }).to.deep.equal(period.expected);
          expect(reservoirG).to.equal(0n);
          expect(r.reductionG).to.equal(BigInt(period.expected.reductionG));
          state = r.newState;
        }
      });
    }

    it("lets the VVB only make figures more conservative", async function () {
      const module = await loadFixture(moduleOnly);
      const p = await renewableParams();
      const periodStart = p.creditingStart;
      const m = { periodStart, periodEnd: periodStart + BigInt(DAY) };
      const metered = energy(1_000_000, 1_050_000);
      await module.quantify(encode(p), ethers.ZeroHash, { ...m, metered, verified: energy(900_000, 1_050_000) });
      await expect(
        module.quantify(encode(p), ethers.ZeroHash, { ...m, metered, verified: energy(1_000_001, 1_050_000) }),
      ).to.be.revertedWithCustomError(module, "NotMetered");
      await expect(
        module.quantify(encode(p), ethers.ZeroHash, { ...m, metered, verified: energy(1_000_000, 1_000_000) }),
      ).to.be.revertedWithCustomError(module, "NotMetered");
    });

    it("refuses generation above the nameplate, net above gross, and unregistered fuel", async function () {
      const module = await loadFixture(moduleOnly);
      const p = await renewableParams({ capacityKw: 1, fuelCoefGPerTonne: 0 });
      const m = { periodStart: p.creditingStart, periodEnd: p.creditingStart + BigInt(HOUR) };
      const over = energy(1_000, 1_001);
      await expect(module.quantify(encode(p), ethers.ZeroHash, { ...m, metered: over, verified: over }))
        .to.be.revertedWithCustomError(module, "EnergyExceedsCapacity")
        .withArgs(1_001, 1_000);
      const netHigh = energy(900, 800);
      await expect(
        module.quantify(encode(p), ethers.ZeroHash, { ...m, metered: netHigh, verified: netHigh }),
      ).to.be.revertedWithCustomError(module, "NetExceedsGross");
      const fuel = energy(500, 600, 1);
      await expect(
        module.quantify(encode(p), ethers.ZeroHash, { ...m, metered: fuel, verified: fuel }),
      ).to.be.revertedWithCustomError(module, "FuelNotRegistered");
    });
  });

  describe("through DmrvRegistry", function () {
    async function solarProject() {
      const ctx = await deployCore();
      const { registry, operator } = ctx;
      const solar = await ethers.deployContract("RenewableVmr0017Module");
      await registry.createCreditToken("dMRV Carbon Credit", "DMCC", "dmrv credit", { value: ethers.parseEther("20") });
      await registry.setModuleApproved(await solar.getAddress(), true);
      await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
      await registry.setAuditTopic(AUDIT_TOPIC);
      const params = await renewableParams();
      const projectId = ethers.encodeBytes32String("SOLAR-DEMO-01");
      await registry.registerProject(
        projectId,
        "Demo solar PV",
        await solar.getAddress(),
        operator.address,
        METER.address,
        params.designHash,
        encode(params),
      );
      return { ...ctx, solar, projectId };
    }

    it("mints solar credits with the same meter and VVB signatures, relayed by anyone", async function () {
      const { registry, solar, projectId, operator, stranger } = await loadFixture(solarProject);
      const input = await periodInput(projectId, {
        metered: { netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n },
      });
      // EF 1 t/MWh: BE 450 000 g; VMR0017 solar LE 450 000 × 0.043 = 19 350 g; ER 430 650 g → 430 units.
      const preview = await solar.quantify(encode(await renewableParams()), ethers.ZeroHash, input.measurement);
      expect(preview.reductionG).to.equal(430_650n);
      const id = await submitPeriod(registry.connect(stranger), input);
      const attestation = await registry.getAttestation(id);
      expect(attestation.reductionG).to.equal(430_650n);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(430n);
      expect((await registry.getProject(projectId)).module).to.equal(await solar.getAddress());
    });
  });
});
