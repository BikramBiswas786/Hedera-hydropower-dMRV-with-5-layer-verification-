import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { isolateClock } from "./helpers/clock";
import { HOUR, METER, attestationInput, plantDesign } from "./helpers/registry";
import { ensureHts } from "./helpers/hts";
import { FIVE_YEAR_FROM, YEAR, type HydroParams, encodeEnergy, encodeParams } from "./helpers/dmrv";
import { QUANTIFICATION_VECTORS } from "./fixtures/quantificationVectors";
import { LIVE_ATTESTATIONS } from "./fixtures/liveAttestations";

const PLANT_ID = ethers.encodeBytes32String("PLANT-DEMO-01");
const BREAKDOWN = ["uint32", "int256", "int256", "uint256", "uint256", "uint256", "int256", "uint256", "int256"];

function paramsFromDesign(
  design: Omit<HydroParams, "registrationRequestedAt" | "calibrationValidUntil" | "meteringHash">,
  registrationRequestedAt: bigint,
) {
  return encodeParams({
    ...design,
    registrationRequestedAt,
    calibrationValidUntil: design.creditingEnd,
    meteringHash: ethers.ZeroHash,
  });
}

function energy(netWh: bigint, grossWh: bigint, fuelG: bigint, leakageG: bigint) {
  return encodeEnergy({ netWh, grossWh, fuelG, leakageG });
}

function decodeBreakdown(breakdown: string) {
  const [year, projectWh, baselineG, reservoirG, fossilG, leakageG, reductionG, units, balanceG] =
    ethers.AbiCoder.defaultAbiCoder().decode(BREAKDOWN, breakdown);
  return { year, projectWh, baselineG, reservoirG, fossilG, leakageG, reductionG, units, balanceG };
}

describe("HydroVmr0017Module", function () {
  isolateClock();
  async function fixture() {
    await ensureHts();
    const [admin, operator] = await ethers.getSigners();
    const feed = await ethers.deployContract("MockV3Aggregator", [8, 25_000_000n]);
    const registry = await ethers.deployContract("HydroCreditRegistry", [
      admin.address,
      await feed.getAddress(),
      10n ** 18n,
      9_000,
      3_600,
    ]);
    const module = await ethers.deployContract("HydroVmr0017Module");
    const design = await plantDesign();
    await registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", { value: ethers.parseEther("20") });
    await registry.registerPlant(PLANT_ID, "Demo", operator.address, METER.address, design);
    await registry.setAuditTopic(4_242_424);
    return { registry, module, design, admin };
  }

  it("recomputes the registry's ER, including the carried ledger", async function () {
    const { registry, module, design } = await loadFixture(fixture);
    const first = await attestationInput(registry, PLANT_ID);
    const params = paramsFromDesign(design, design.creditingStart);
    const energy1 = energy(first.netEnergyWh, first.grossEnergyWh, first.fuelG, first.leakageG);
    const preview = await module.quantify(params, ethers.ZeroHash, {
      periodStart: first.periodStart,
      periodEnd: first.periodEnd,
      metered: energy1,
      verified: energy1,
    });
    const onChain = await registry.quantify(PLANT_ID, first);
    expect(preview.reductionG).to.equal(onChain.reductionG);

    await registry.submitAttestation(first);
    await time.increase(HOUR);
    const second = await attestationInput(registry, PLANT_ID, { plantSequence: 1 });
    const energy2 = energy(second.netEnergyWh, second.grossEnergyWh, second.fuelG, second.leakageG);
    const again = await module.quantify(params, preview.newState, {
      periodStart: second.periodStart,
      periodEnd: second.periodEnd,
      metered: energy2,
      verified: energy2,
    });
    const onChain2 = await registry.quantify(PLANT_ID, second);
    expect(again.reductionG).to.equal(onChain2.reductionG);
    expect(again.breakdown).to.not.equal("0x");
  });

  it("requires a 5-year VMR0017 period when the request is on or after 1 Jan 2027", async function () {
    const { module } = await loadFixture(fixture);
    await time.increaseTo(FIVE_YEAR_FROM + 86_400n);
    const start = FIVE_YEAR_FROM;
    const base = await plantDesign({ methodology: 1, creditingStart: start, creditingEnd: start + 7n * YEAR });
    const seven = paramsFromDesign(base, FIVE_YEAR_FROM);
    await expect(module.validateProject(seven)).to.be.revertedWithCustomError(module, "InvalidCreditingPeriod");

    const fiveDesign = { ...base, creditingEnd: start + 5n * YEAR };
    const terms = await module.validateProject(paramsFromDesign(fiveDesign, FIVE_YEAR_FROM));
    expect(terms.creditingEnd - terms.creditingStart).to.equal(5n * YEAR);
  });

  it("renews only with the same span, and never after a 10-year period", async function () {
    const { module, design } = await loadFixture(fixture);
    const params = paramsFromDesign(design, design.creditingStart);
    const nextStart = design.creditingEnd;
    const longer = paramsFromDesign(
      { ...design, creditingStart: nextStart, creditingEnd: nextStart + 10n * YEAR },
      design.creditingStart,
    );
    await expect(
      module.validateRenewal(params, longer, design.creditingStart, design.creditingEnd, 1),
    ).to.be.revertedWithCustomError(module, "RenewalSpan");

    const ten = paramsFromDesign(
      {
        ...design,
        creditingStart: design.creditingStart,
        creditingEnd: design.creditingStart + 10n * YEAR,
      },
      design.creditingStart,
    );
    await expect(
      module.validateRenewal(ten, ten, design.creditingStart, design.creditingStart + 10n * YEAR, 1),
    ).to.be.revertedWithCustomError(module, "NotRenewable");
  });

  describe("greenfield parity with the legacy registry", function () {
    for (const live of LIVE_ATTESTATIONS) {
      it(`reproduces live attestation #${live.id} (${live.plantId}): ${live.expected.reductionG} g`, async function () {
        const module = await ethers.deployContract("HydroVmr0017Module");
        const params = paramsFromDesign(
          { ...live.design, baselineWh: 0n, baselineEndsAt: 0n },
          live.design.creditingStart,
        );
        const e = energy(live.netEnergyWh, live.grossEnergyWh, live.fuelG, 0n);
        const q = await module.quantify(params, ethers.ZeroHash, {
          periodStart: live.periodStart,
          periodEnd: live.periodEnd,
          metered: e,
          verified: e,
        });
        const b = decodeBreakdown(q.breakdown);
        expect(q.reductionG).to.equal(live.expected.reductionG);
        expect(b.baselineG).to.equal(live.expected.baselineG);
        expect(b.reservoirG).to.equal(live.expected.reservoirG);
        expect(b.fossilG).to.equal(live.expected.fossilFuelG);
        expect(b.leakageG).to.equal(live.expected.leakageG);
        expect(b.units).to.equal(live.expected.unitsMinted);
        expect(b.balanceG).to.equal(live.expected.balanceG);
      });
    }

    for (const vector of QUANTIFICATION_VECTORS) {
      it(`matches the shared vectors: ${vector.name}`, async function () {
        const module = await ethers.deployContract("HydroVmr0017Module");
        const start = 1_700_000_000n;
        const { baselineEndsAtDay, ...integers } = vector.design;
        const params = paramsFromDesign(
          {
            ...integers,
            baselineWh: BigInt(integers.baselineWh),
            baselineEndsAt: baselineEndsAtDay === null ? 0n : start + BigInt(baselineEndsAtDay * 86_400),
            creditingStart: start,
            creditingEnd: start + 7n * YEAR,
            designHash: ethers.id(vector.name),
          },
          start,
        );
        let state = ethers.ZeroHash;
        for (const p of vector.periods) {
          const e = energy(BigInt(p.netWh), BigInt(p.grossWh), BigInt(p.fuelG), BigInt(p.leakageG));
          const q = await module.quantify(params, state, {
            periodStart: start + BigInt(p.startDay * 86_400),
            periodEnd: start + BigInt((p.startDay + 1) * 86_400),
            metered: e,
            verified: e,
          });
          const b = decodeBreakdown(q.breakdown);
          expect(b.projectWh, `day ${p.startDay} EG_PJ`).to.equal(p.expected.egProjectWh);
          expect(b.baselineG, `day ${p.startDay} BE`).to.equal(p.expected.baselineG);
          expect(b.reservoirG, `day ${p.startDay} PE_HP`).to.equal(p.expected.reservoirG);
          expect(b.fossilG, `day ${p.startDay} PE_FF`).to.equal(p.expected.fossilFuelG);
          expect(b.leakageG, `day ${p.startDay} LE`).to.equal(p.expected.leakageG);
          expect(q.reductionG, `day ${p.startDay} ER`).to.equal(p.expected.reductionG);
          expect(b.units, `day ${p.startDay} units`).to.equal(p.expected.unitsMinted);
          expect(b.balanceG, `day ${p.startDay} balance`).to.equal(p.expected.balanceG);
          state = q.newState;
        }
      });
    }
  });

  describe("frozen parity with HydroCreditRegistry.quantify (spec D-4)", function () {
    // The 13 outputs of audits/proto-phase1/parity.ts (26 Sep 2026), where the legacy contract and the module
    // agreed. Frozen here so the check survives deleting the legacy contract; the legacy call runs while it exists.
    const START = 1_767_225_600;
    const DESIGNS = [
      {
        projectType: 0,
        methodology: 1,
        capacityKw: 500,
        baselineCapacityKw: 0,
        reservoirAreaM2: 0,
        efGridGPerMwh: 573_378,
        fuelCoefGPerTonne: 3_238_840,
        baselineWh: 0n,
        baselineEndsAt: 0n,
      },
      {
        projectType: 0,
        methodology: 1,
        capacityKw: 12_000,
        baselineCapacityKw: 0,
        reservoirAreaM2: 2_000_000,
        efGridGPerMwh: 611_000,
        fuelCoefGPerTonne: 0,
        baselineWh: 0n,
        baselineEndsAt: 0n,
      },
      {
        projectType: 1,
        methodology: 0,
        capacityKw: 20_000,
        baselineCapacityKw: 15_000,
        reservoirAreaM2: 0,
        efGridGPerMwh: 700_000,
        fuelCoefGPerTonne: 0,
        baselineWh: 40_000_000_000n,
        baselineEndsAt: BigInt(START) + 8n * YEAR,
      },
      {
        projectType: 2,
        methodology: 1,
        capacityKw: 9_000,
        baselineCapacityKw: 6_000,
        reservoirAreaM2: 0,
        efGridGPerMwh: 650_000,
        fuelCoefGPerTonne: 0,
        baselineWh: 20_000_000_000n,
        baselineEndsAt: BigInt(START) + 8n * YEAR,
      },
    ];
    const INPUTS: [bigint, bigint, bigint, bigint][] = [
      [100_000_000n, 99_000_000n, 0n, 0n],
      [3_000_000_000n, 2_950_123_457n, 5_000_000n, 1_234n],
      [50_000n, -20_000n, 0n, 0n],
      [7_777_777_777n, 7_700_000_001n, 0n, 99n],
    ];
    const FROZEN: (bigint | null)[][] = [
      [54_685_422n, null, -11_468n, null],
      [48_410_000n, 1_440_571_605n, -17_220n, 3_765_222_122n],
      [0n, -1_234n, 0n, -99n],
      [-693_000n, -20_652_099n, 0n, null],
    ];

    it("reproduces all 13 frozen outputs, and the legacy contract agrees", async function () {
      await ensureHts();
      const [admin] = await ethers.getSigners();
      const feed = await ethers.deployContract("MockV3Aggregator", [8, 10_000_000n]);
      const legacy = await ethers.deployContract("HydroCreditRegistry", [
        admin.address,
        await feed.getAddress(),
        10n ** 18n,
        0,
        3_600,
      ]);
      const module = await ethers.deployContract("HydroVmr0017Module");
      const periodStart = BigInt(START + 30 * 86_400);
      const periodEnd = periodStart + 30n * 86_400n;
      let checked = 0;
      for (const [i, d] of DESIGNS.entries()) {
        const design = {
          ...d,
          baselineReservoirAreaM2: 0,
          creditingStart: BigInt(START),
          creditingEnd: BigInt(START) + 7n * YEAR,
          designHash: ethers.id(`d${i}`),
        };
        const id = ethers.encodeBytes32String(`P${i}`);
        await legacy.registerPlant(id, `p${i}`, admin.address, ethers.Wallet.createRandom().address, design);
        const params = paramsFromDesign(design, BigInt(START - 100));
        for (const [j, [gross, net, fuel, leak]] of INPUTS.entries()) {
          const expected = FROZEN[i][j];
          const f = d.fuelCoefGPerTonne === 0 ? 0n : fuel;
          const e = energy(net, gross, f, leak);
          const m = { periodStart, periodEnd, metered: e, verified: e };
          if (expected === null) {
            await expect(module.quantify(params, ethers.ZeroHash, m)).to.be.revertedWithCustomError(
              module,
              "EnergyExceedsCapacity",
            );
            continue;
          }
          const q = await module.quantify(params, ethers.ZeroHash, m);
          expect(q.reductionG, `design ${i} input ${j}`).to.equal(expected);
          const old = await legacy.quantify(id, {
            plantId: id,
            plantSequence: 0,
            periodStart,
            periodEnd,
            netEnergyWh: net,
            grossEnergyWh: gross,
            fuelG: f,
            leakageG: leak,
            completenessBps: 10_000,
            reportHash: ethers.id("r"),
            hcsTopicNum: 1,
            hcsSequence: 1,
            meter: {
              grossEnergyWh: gross,
              netEnergyWh: net,
              fuelG: f,
              readingsDigest: ethers.id("x"),
              signature: "0x",
            },
          });
          expect(old.reductionG, `legacy design ${i} input ${j}`).to.equal(expected);
          checked++;
        }
      }
      expect(checked).to.equal(13);
    });
  });

  describe("metering rules", function () {
    const START = 1_700_000_000n;
    async function setup() {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const design = {
        projectType: 0,
        methodology: 1,
        capacityKw: 500,
        baselineCapacityKw: 0,
        reservoirAreaM2: 0,
        baselineReservoirAreaM2: 0,
        efGridGPerMwh: 573_378,
        fuelCoefGPerTonne: 3_238_840,
        baselineWh: 0n,
        baselineEndsAt: 0n,
        creditingStart: START,
        creditingEnd: START + 7n * YEAR,
        designHash: ethers.id("metering"),
      };
      return { module, design, params: paramsFromDesign(design, START) };
    }
    const hour = (metered: string, verified = metered, periodStart = START, periodEnd = START + 3_600n) => ({
      periodStart,
      periodEnd,
      metered,
      verified,
    });

    it("rejects gross generation above nameplate × period", async function () {
      const { module, params } = await setup();
      const e = energy(400_000n, 500_001n, 0n, 0n); // 500 kW × 1 h = 500,000 Wh
      await expect(module.quantify(params, ethers.ZeroHash, hour(e))).to.be.revertedWithCustomError(
        module,
        "EnergyExceedsCapacity",
      );
    });

    it("rejects net export above gross generation", async function () {
      const { module, params } = await setup();
      const e = energy(460_001n, 460_000n, 0n, 0n);
      await expect(module.quantify(params, ethers.ZeroHash, hour(e))).to.be.revertedWithCustomError(
        module,
        "NetExceedsGross",
      );
    });

    it("lets the verifier lower net export and raise fuel and leakage", async function () {
      const { module, params } = await setup();
      const metered = energy(450_000n, 460_000n, 0n, 0n);
      const lowered = energy(400_000n, 460_000n, 10n, 5n);
      const full = await module.quantify(params, ethers.ZeroHash, hour(metered));
      const q = await module.quantify(params, ethers.ZeroHash, hour(metered, lowered));
      expect(q.reductionG).to.be.lessThan(full.reductionG);
    });

    it("rejects a verifier figure that raises net export or lowers fuel, leakage or gross", async function () {
      const { module, params } = await setup();
      const metered = energy(450_000n, 460_000n, 10n, 5n);
      for (const verified of [
        energy(450_001n, 460_000n, 10n, 5n),
        energy(450_000n, 460_000n, 9n, 5n),
        energy(450_000n, 460_000n, 10n, 4n),
        energy(450_000n, 459_999n, 10n, 5n),
      ]) {
        await expect(module.quantify(params, ethers.ZeroHash, hour(metered, verified))).to.be.revertedWithCustomError(
          module,
          "NotMetered",
        );
      }
    });

    it("rejects fuel on a plant without a registered fuel coefficient", async function () {
      const { module, design } = await setup();
      const params = paramsFromDesign({ ...design, fuelCoefGPerTonne: 0 }, START);
      const e = energy(450_000n, 460_000n, 1n, 0n);
      await expect(module.quantify(params, ethers.ZeroHash, hour(e))).to.be.revertedWithCustomError(
        module,
        "FuelNotRegistered",
      );
    });

    it("rejects a period that spans two crediting years", async function () {
      const { module, params } = await setup();
      const e = energy(1n, 1n, 0n, 0n);
      const boundary = START + YEAR;
      await expect(
        module.quantify(params, ethers.ZeroHash, hour(e, e, boundary - 60n, boundary + 60n)),
      ).to.be.revertedWithCustomError(module, "PeriodCrossesCreditingYear");
    });
  });

  describe("project validation", function () {
    it("accepts a 7-year VMR0017 period requested at 31 Dec 2026 23:59:59 UTC, starting in 2027", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      await time.increaseTo(FIVE_YEAR_FROM + 86_400n);
      const start = FIVE_YEAR_FROM + 30n * 86_400n;
      const design = await plantDesign({ methodology: 1, creditingStart: start, creditingEnd: start + 7n * YEAR });
      const terms = await module.validateProject(paramsFromDesign(design, FIVE_YEAR_FROM - 1n));
      expect(terms.creditingEnd - terms.creditingStart).to.equal(7n * YEAR);
      await expect(module.validateProject(paramsFromDesign(design, FIVE_YEAR_FROM))).to.be.revertedWithCustomError(
        module,
        "InvalidCreditingPeriod",
      );
    });

    it("rejects VMR0017 above 15 MW and a new reservoir at or below 4 W/m²", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const big = await plantDesign({ methodology: 1, capacityKw: 15_001 });
      await expect(module.validateProject(paramsFromDesign(big, big.creditingStart))).to.be.revertedWithCustomError(
        module,
        "MethodologyNotApplicable",
      );
      const flooded = await plantDesign({ methodology: 1, capacityKw: 4_000, reservoirAreaM2: 1_000_000 }); // 4 W/m²
      await expect(
        module.validateProject(paramsFromDesign(flooded, flooded.creditingStart)),
      ).to.be.revertedWithCustomError(module, "PowerDensityTooLow");
    });

    it("applies the reservoir rate for 4 < PD ≤ 10 W/m² and none above 10 W/m²", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const run = async (reservoirAreaM2: number) => {
        const d = await plantDesign({ methodology: 1, capacityKw: 12_000, reservoirAreaM2 });
        const e = energy(1_000_000n, 1_000_000n, 0n, 0n);
        const q = await module.quantify(paramsFromDesign(d, d.creditingStart), ethers.ZeroHash, {
          periodStart: d.creditingStart,
          periodEnd: d.creditingStart + 3_600n,
          metered: e,
          verified: e,
        });
        return decodeBreakdown(q.breakdown).reservoirG;
      };
      expect(await run(1_800_000)).to.equal(100_000n); // 6.67 W/m², 100 kg/MWh × 1 MWh
      expect(await run(1_000_000)).to.equal(0n); // 12 W/m²
    });

    it("renews 5→5 and 7→7 but never 5→7, 5→10, 7→5 or 7→10", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      for (const [from, to, ok] of [
        [5n, 5n, true],
        [7n, 7n, true],
        [5n, 7n, false],
        [5n, 10n, false],
        [7n, 5n, false],
        [7n, 10n, false],
      ] as [bigint, bigint, boolean][]) {
        const d = await plantDesign({ methodology: 1 });
        const first = { ...d, creditingEnd: d.creditingStart + from * YEAR };
        const next = { ...d, creditingStart: first.creditingEnd, creditingEnd: first.creditingEnd + to * YEAR };
        const call = module.validateRenewal(
          paramsFromDesign(first, d.creditingStart),
          paramsFromDesign(next, d.creditingStart),
          first.creditingStart,
          first.creditingEnd,
          1,
        );
        if (ok) await call;
        else await expect(call, `${from}→${to}`).to.be.revertedWithCustomError(module, "RenewalSpan");
      }
    });

    it("requires a registration-request date and a calibration certificate", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const design = await plantDesign({ methodology: 1 });
      await expect(module.validateProject(paramsFromDesign(design, 0n))).to.be.revertedWithCustomError(
        module,
        "MissingRegistrationRequest",
      );
      const noCalibration = encodeParams({
        ...design,
        registrationRequestedAt: design.creditingStart,
        calibrationValidUntil: 0n,
        meteringHash: ethers.ZeroHash,
      });
      await expect(module.validateProject(noCalibration)).to.be.revertedWithCustomError(module, "MissingCalibration");
    });

    it("rejects a registration request dated in the future", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const design = await plantDesign({ methodology: 1 });
      const future = BigInt(await time.latest()) + 86_400n;
      await expect(module.validateProject(paramsFromDesign(design, future))).to.be.revertedWithCustomError(
        module,
        "RegistrationInTheFuture",
      );
    });

    it("keeps 7- and 10-year VMR0017 periods for requests before 1 Jan 2027", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const design = await plantDesign({ methodology: 1 });
      const requested = design.creditingStart;
      expect(requested < FIVE_YEAR_FROM).to.equal(true);
      const terms = await module.validateProject(paramsFromDesign(design, requested));
      expect(terms.creditingEnd - terms.creditingStart).to.equal(7n * YEAR);
      const ten = { ...design, creditingEnd: design.creditingStart + 10n * YEAR };
      const t10 = await module.validateProject(paramsFromDesign(ten, requested));
      expect(t10.creditingEnd - t10.creditingStart).to.equal(10n * YEAR);
    });

    it("renews only the grid factor, the dates and the calibration, at most three periods in total", async function () {
      const module = await ethers.deployContract("HydroVmr0017Module");
      const design = await plantDesign({ methodology: 1 });
      const params = paramsFromDesign(design, design.creditingStart);
      const next = { ...design, creditingStart: design.creditingEnd, creditingEnd: design.creditingEnd + 7n * YEAR };
      const ok = paramsFromDesign({ ...next, efGridGPerMwh: 600_000 }, design.creditingStart);
      await time.increaseTo(design.creditingEnd);
      const terms = await module.validateRenewal(params, ok, design.creditingStart, design.creditingEnd, 1);
      expect(terms.creditingStart).to.equal(design.creditingEnd);

      const bigger = paramsFromDesign({ ...next, capacityKw: 600 }, design.creditingStart);
      await expect(
        module.validateRenewal(params, bigger, design.creditingStart, design.creditingEnd, 1),
      ).to.be.revertedWithCustomError(module, "ParamsChanged");
      const overlap = paramsFromDesign(
        { ...next, creditingStart: design.creditingEnd - 1n, creditingEnd: design.creditingEnd - 1n + 7n * YEAR },
        design.creditingStart,
      );
      await expect(
        module.validateRenewal(params, overlap, design.creditingStart, design.creditingEnd, 1),
      ).to.be.revertedWithCustomError(module, "RenewalOverlap");
      await expect(
        module.validateRenewal(params, ok, design.creditingStart, design.creditingEnd, 3),
      ).to.be.revertedWithCustomError(module, "NotRenewable");
    });
  });
});
