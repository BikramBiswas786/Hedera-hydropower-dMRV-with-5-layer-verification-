import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { HOUR, METER, attestationInput, plantDesign } from "./helpers/registry";
import { ensureHts } from "./helpers/hts";

const PLANT_ID = ethers.encodeBytes32String("PLANT-DEMO-01");
const PARAMS =
  "tuple(uint8 projectType,uint8 methodology,uint32 capacityKw,uint32 baselineCapacityKw,uint64 reservoirAreaM2,uint64 baselineReservoirAreaM2,uint32 efGridGPerMwh,uint32 fuelCoefGPerTonne,uint64 baselineWh,uint64 baselineEndsAt,uint64 creditingStart,uint64 creditingEnd,uint64 registrationRequestedAt,uint64 calibrationValidUntil,bytes32 meteringHash,bytes32 designHash)";
const FIVE_YEAR_FROM = 1_798_761_600n;
const YEAR = 365n * 86_400n;

function encodeParams(
  design: {
    projectType: number;
    methodology: number;
    capacityKw: number;
    baselineCapacityKw: number;
    reservoirAreaM2: number;
    baselineReservoirAreaM2: number;
    efGridGPerMwh: number;
    fuelCoefGPerTonne: number;
    baselineWh: bigint;
    baselineEndsAt: bigint;
    creditingStart: bigint;
    creditingEnd: bigint;
    designHash: string;
  },
  registrationRequestedAt: bigint,
) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [PARAMS],
    [
      [
        design.projectType,
        design.methodology,
        design.capacityKw,
        design.baselineCapacityKw,
        design.reservoirAreaM2,
        design.baselineReservoirAreaM2,
        design.efGridGPerMwh,
        design.fuelCoefGPerTonne,
        design.baselineWh,
        design.baselineEndsAt,
        design.creditingStart,
        design.creditingEnd,
        registrationRequestedAt,
        design.creditingEnd,
        ethers.ZeroHash,
        design.designHash,
      ],
    ],
  );
}

function encodeEnergy(netWh: bigint, grossWh: bigint, fuelG: bigint, leakageG: bigint) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["int64", "uint64", "uint64", "uint64"],
    [netWh, grossWh, fuelG, leakageG],
  );
}

describe("HydroVmr0017Module", function () {
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
    const params = encodeParams(design, design.creditingStart);
    const energy = encodeEnergy(first.netEnergyWh, first.grossEnergyWh, first.fuelG, first.leakageG);
    const preview = await module.quantify(params, ethers.ZeroHash, {
      periodStart: first.periodStart,
      periodEnd: first.periodEnd,
      metered: energy,
      verified: energy,
    });
    const onChain = await registry.quantify(PLANT_ID, first);
    expect(preview.reductionG).to.equal(onChain.reductionG);

    await registry.submitAttestation(first);
    await time.increase(HOUR);
    const second = await attestationInput(registry, PLANT_ID, { plantSequence: 1 });
    const energy2 = encodeEnergy(second.netEnergyWh, second.grossEnergyWh, second.fuelG, second.leakageG);
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
    const seven = encodeParams(base, FIVE_YEAR_FROM);
    await expect(module.validateProject(seven)).to.be.revertedWithCustomError(module, "InvalidCreditingPeriod");

    const fiveDesign = { ...base, creditingEnd: start + 5n * YEAR };
    const terms = await module.validateProject(encodeParams(fiveDesign, FIVE_YEAR_FROM));
    expect(terms.creditingEnd - terms.creditingStart).to.equal(5n * YEAR);
  });

  it("renews only with the same span, and never after a 10-year period", async function () {
    const { module, design } = await loadFixture(fixture);
    const params = encodeParams(design, design.creditingStart);
    const nextStart = design.creditingEnd;
    const longer = encodeParams(
      { ...design, creditingStart: nextStart, creditingEnd: nextStart + 10n * YEAR },
      design.creditingStart,
    );
    await expect(
      module.validateRenewal(params, longer, design.creditingStart, design.creditingEnd, 1),
    ).to.be.revertedWithCustomError(module, "RenewalSpan");

    const ten = encodeParams(
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
});
