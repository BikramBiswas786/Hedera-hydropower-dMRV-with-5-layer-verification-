import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { METER_STATEMENT_VECTOR } from "./fixtures/meterStatementVector";
import { QUANTIFICATION_VECTORS } from "./fixtures/quantificationVectors";
import { ensureHts, mockHts } from "./helpers/hts";
import {
  CREDITING_YEAR,
  DAY,
  HOUR,
  REPORT_HASH,
  type DesignInput,
  METER,
  attestationInput,
  plantDesign,
} from "./helpers/registry";

const PLANT_ID = ethers.encodeBytes32String("PLANT-DEMO-01");
const MIN_COMPLETENESS_BPS = 9_000;
const MAX_PRICE_AGE = HOUR;
const FEED_DECIMALS = 8;
const HBAR_USD = 25_000_000n; // $0.25 with 8 decimals
const NATIVE_PER_HBAR = 10n ** 18n; // local Hardhat EVM uses 18-decimal wei
const PROJECT = { Greenfield: 0, Retrofit: 1, CapacityAddition: 2 };
const METHODOLOGY = { Cdm: 0, Vmr0017: 1 };

/** What every HTS fungible token exposes at its EVM address: the ERC-20 facade plus HIP-719 `associate()`. */
const HTS_TOKEN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function associate() returns (uint256)",
];

/** ERC-721 facade of an HTS NFT collection plus HIP-719 `associate()`. */
const HTS_NFT_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function totalSupply() view returns (uint256)",
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
  const registry = await ethers.deployContract("HydroCreditRegistry", [
    admin.address,
    await feed.getAddress(),
    NATIVE_PER_HBAR,
    MIN_COMPLETENESS_BPS,
    MAX_PRICE_AGE,
  ]);

  return { registry, feed, admin, operator, buyer, stranger, mocked };
}

async function readyFixture() {
  const ctx = await deployFixture();
  await ctx.registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", { value: ethers.parseEther("20") });
  await ctx.registry.registerPlant(
    PLANT_ID,
    "Demo run-of-river",
    ctx.operator.address,
    METER.address,
    await plantDesign(),
  );
  const token = new ethers.Contract(await ctx.registry.creditToken(), HTS_TOKEN_ABI, ethers.provider);
  return { ...ctx, token };
}

async function attestedFixture() {
  const ctx = await readyFixture();
  // 450 kWh net at 1 t CO2/MWh = 450 kg CO2e = 450 base units
  await ctx.registry.submitAttestation(await attestationInput(ctx.registry, PLANT_ID));
  return ctx;
}

async function listedFixture() {
  const ctx = await attestedFixture();
  // 400 kg at $12.50 / t
  await ctx.registry.connect(ctx.operator).createListing(400, 1_250);
  return ctx;
}

async function certificateFixture() {
  const ctx = await listedFixture();
  await ctx.registry.createCertificateToken("Hydro dMRV Retirement", "HYRET", { value: ethers.parseEther("20") });
  const certificates = new ethers.Contract(await ctx.registry.certificateToken(), HTS_NFT_ABI, ethers.provider);
  return { ...ctx, certificates };
}

describe("HydroCreditRegistry", function () {
  describe("credit token", function () {
    it("creates an HTS token with 3 decimals (1 unit = 1 kg CO2e) and no initial supply", async function () {
      const { registry, token } = await loadFixture(readyFixture);

      expect(await token.symbol()).to.equal("HYCC");
      expect(await token.decimals()).to.equal(3);
      expect(await token.totalSupply()).to.equal(0);
      expect(await registry.creditToken()).to.not.equal(ethers.ZeroAddress);
    });

    it("cannot be created twice or by a non-admin", async function () {
      const { registry, stranger } = await loadFixture(readyFixture);

      await expect(registry.createCreditToken("X", "X")).to.be.revertedWithCustomError(registry, "TokenAlreadyCreated");
      await expect(registry.connect(stranger).createCreditToken("X", "X")).to.be.revertedWithCustomError(
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("surfaces HTS response codes as reverts", async function () {
      const { registry, mocked } = await loadFixture(deployFixture);
      if (!mocked) this.skip();

      await (await mockHts()).setForcedResponseCode(168); // INVALID_TOKEN_SYMBOL-style failure
      await expect(registry.createCreditToken("Hydro", "HYCC"))
        .to.be.revertedWithCustomError(registry, "HtsCallFailed")
        .withArgs(CREATE_SELECTOR, 168);
      await (await mockHts()).setForcedResponseCode(0);
    });
  });

  describe("plant registration (applicability)", function () {
    const other = ethers.encodeBytes32String("OTHER");

    it("stores the validated design and lists the plant", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      const plant = await registry.getPlant(PLANT_ID);
      expect(plant.operator).to.equal(operator.address);
      expect(plant.design.capacityKw).to.equal(500);
      expect(plant.design.efGridGPerMwh).to.equal(1_000_000);
      expect(plant.reservoirGPerMwh).to.equal(0);
      expect(plant.active).to.equal(true);
      expect(await registry.getPlantIds()).to.deep.equal([PLANT_ID]);
    });

    it("applies the power density rule: PE_HP for 4 < PD ≤ 10 W/m², none above", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const register = async (label: string, reservoirAreaM2: number) => {
        const id = ethers.encodeBytes32String(label);
        await registry.registerPlant(
          id,
          label,
          operator.address,
          METER.address,
          await plantDesign({ capacityKw: 12_000, reservoirAreaM2 }),
        );
        return (await registry.getPlant(id)).reservoirGPerMwh;
      };

      expect(await register("PD-6.67", 1_800_000)).to.equal(90_000);
      expect(await register("PD-10", 1_200_000)).to.equal(90_000);
      expect(await register("PD-12", 1_000_000)).to.equal(0);
    });

    it("applies VMR0017's EF_Res (100 kg/MWh) and embodied factor (21 g/kWh), and the 15 MW hydro limit", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const vmr = { methodology: METHODOLOGY.Vmr0017, capacityKw: 12_000, reservoirAreaM2: 1_800_000 };
      const id = ethers.encodeBytes32String("VMR0017");
      await registry.registerPlant(id, "vmr", operator.address, METER.address, await plantDesign(vmr));
      const plant = await registry.getPlant(id);
      expect(plant.design.methodology).to.equal(METHODOLOGY.Vmr0017);
      expect(plant.reservoirGPerMwh).to.equal(100_000);
      expect(plant.embodiedGPerMwh).to.equal(21_000);
      expect((await registry.getPlant(PLANT_ID)).embodiedGPerMwh).to.equal(0);

      await expect(
        registry.registerPlant(
          other,
          "x",
          operator.address,
          METER.address,
          await plantDesign({ ...vmr, capacityKw: 15_001 }),
        ),
      )
        .to.be.revertedWithCustomError(registry, "MethodologyNotApplicable")
        .withArgs(METHODOLOGY.Vmr0017, 15_001);
      // The CDM path (ACM0002) has no such limit.
      await registry.registerPlant(
        other,
        "x",
        operator.address,
        METER.address,
        await plantDesign({ capacityKw: 15_001 }),
      );
    });

    it("refuses reservoirs with PD ≤ 4 W/m² or smaller than the baseline", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      await expect(
        registry.registerPlant(
          other,
          "x",
          operator.address,
          METER.address,
          await plantDesign({ capacityKw: 12_000, reservoirAreaM2: 3_000_000 }),
        ),
      )
        .to.be.revertedWithCustomError(registry, "PowerDensityTooLow")
        .withArgs(12_000_000, 3_000_000);
      await expect(
        registry.registerPlant(
          other,
          "x",
          operator.address,
          METER.address,
          await plantDesign({ reservoirAreaM2: 10, baselineReservoirAreaM2: 20 }),
        ),
      ).to.be.revertedWithCustomError(registry, "ReservoirBelowBaseline");
    });

    it("requires a baseline for retrofits and none for greenfield plants", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const retrofit = { projectType: PROJECT.Retrofit, baselineCapacityKw: 400, baselineWh: 10n ** 9n };

      await expect(
        registry.registerPlant(other, "x", operator.address, METER.address, await plantDesign({ ...retrofit })),
      ).to.be.revertedWithCustomError(registry, "InvalidBaseline"); // DATE_BaselineRetrofit missing
      await expect(
        registry.registerPlant(other, "x", operator.address, METER.address, await plantDesign({ baselineWh: 1n })),
      ).to.be.revertedWithCustomError(registry, "InvalidBaseline");
      await expect(
        registry.registerPlant(
          other,
          "x",
          operator.address,
          METER.address,
          await plantDesign({
            projectType: PROJECT.CapacityAddition,
            baselineCapacityKw: 500,
            baselineWh: 1n,
            baselineEndsAt: 1n,
          }),
        ),
      ).to.be.revertedWithCustomError(registry, "InvalidBaseline"); // an addition must add capacity
      await registry.registerPlant(
        other,
        "x",
        operator.address,
        METER.address,
        await plantDesign({ ...retrofit, baselineEndsAt: 1n }),
      );
    });

    it("bounds the grid emission factor and the crediting period", async function () {
      const { registry, operator } = await loadFixture(readyFixture);

      await expect(
        registry.registerPlant(
          other,
          "x",
          operator.address,
          METER.address,
          await plantDesign({ efGridGPerMwh: 2_000_001 }),
        ),
      ).to.be.revertedWithCustomError(registry, "GridEmissionFactorOutOfRange");
      await expect(
        registry.registerPlant(other, "x", operator.address, METER.address, await plantDesign({ efGridGPerMwh: 0 })),
      ).to.be.revertedWithCustomError(registry, "GridEmissionFactorOutOfRange");
      const design = await plantDesign();
      await expect(
        registry.registerPlant(other, "x", operator.address, METER.address, {
          ...design,
          creditingEnd: design.creditingStart + BigInt(10 * CREDITING_YEAR + 1),
        }),
      ).to.be.revertedWithCustomError(registry, "InvalidCreditingPeriod");
    });

    it("rejects duplicates, empty ids and missing operators", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const design = await plantDesign();

      await expect(
        registry.registerPlant(PLANT_ID, "dup", operator.address, METER.address, design),
      ).to.be.revertedWithCustomError(registry, "PlantAlreadyRegistered");
      await expect(
        registry.registerPlant(ethers.ZeroHash, "x", operator.address, METER.address, design),
      ).to.be.revertedWithCustomError(registry, "InvalidPlant");
      await expect(
        registry.registerPlant(other, "x", ethers.ZeroAddress, METER.address, design),
      ).to.be.revertedWithCustomError(registry, "InvalidPlant");
    });

    it("renews the crediting period with a new EF and restarts the crediting-year count", async function () {
      const { registry } = await loadFixture(attestedFixture);
      const { design } = await registry.getPlant(PLANT_ID);
      const start = design.creditingEnd;
      const end = start + BigInt(7 * CREDITING_YEAR);

      await expect(
        registry.renewCreditingPeriod(PLANT_ID, 540_000, start - 1n, end, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(registry, "InvalidCreditingPeriod");
      await expect(registry.renewCreditingPeriod(PLANT_ID, 540_000, start, end, ethers.id("renewal")))
        .to.emit(registry, "CreditingPeriodRenewed")
        .withArgs(PLANT_ID, 540_000, start, end, ethers.id("renewal"));
      const renewed = await registry.getPlant(PLANT_ID);
      expect(renewed.design.efGridGPerMwh).to.equal(540_000);
      expect(renewed.yearNetWh).to.equal(0);
    });
  });

  describe("attestations (on-chain ER = BE − PE − LE)", function () {
    it("mints credits for the computed emission reductions and records the HCS anchor", async function () {
      const { registry, token, operator } = await loadFixture(readyFixture);
      const input = await attestationInput(registry, PLANT_ID);

      await expect(registry.submitAttestation(input))
        .to.emit(registry, "AttestationSubmitted")
        .withArgs(0, PLANT_ID, 450_000, 450_000, 450, REPORT_HASH, 4_242_424, 7);

      expect(await registry.custodyBalanceOf(operator.address)).to.equal(450);
      expect(await token.totalSupply()).to.equal(450);
      expect(await token.balanceOf(await registry.getAddress())).to.equal(450);

      const stored = await registry.getAttestation(0);
      expect(stored.baselineG).to.equal(450_000);
      expect(stored.reductionG).to.equal(450_000);
      expect(stored.reportHash).to.equal(REPORT_HASH);
      expect(stored.hcsSequence).to.equal(7);
      const plant = await registry.getPlant(PLANT_ID);
      expect(plant.lastPeriodEnd).to.equal(input.periodEnd);
      expect(plant.attestations).to.equal(1);
      expect(await registry.totalIssuedUnits()).to.equal(450);
    });

    it("subtracts TOOL03 fuel emissions and leakage, and carries sub-kg remainders", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      // BE 450 000 g − PE_FF ⌈75 000 g × 3.23884⌉ = 242 913 g − LE 87 g = 207 000 g
      await registry.submitAttestation(await attestationInput(registry, PLANT_ID, { fuelG: 75_000n, leakageG: 87n }));
      const stored = await registry.getAttestation(0);
      expect(stored.fossilFuelG).to.equal(242_913);
      expect(stored.reductionG).to.equal(207_000);
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(207);

      await time.increase(HOUR);
      await registry.submitAttestation(
        await attestationInput(registry, PLANT_ID, { plantSequence: 1, netEnergyWh: 1_600n, grossEnergyWh: 1_700n }),
      );
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(208);
      expect((await registry.getPlant(PLANT_ID)).balanceG).to.equal(600);
    });

    it("carries a deficit forward instead of ignoring it", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      // An hour of import only: EG_facility = −10 kWh → ER = −10 000 g
      await registry.submitAttestation(
        await attestationInput(registry, PLANT_ID, { netEnergyWh: -10_000n, grossEnergyWh: 0n }),
      );
      expect((await registry.getPlant(PLANT_ID)).balanceG).to.equal(-10_000);

      await time.increase(HOUR);
      await registry.submitAttestation(await attestationInput(registry, PLANT_ID, { plantSequence: 1 }));
      expect(await registry.custodyBalanceOf(operator.address)).to.equal(440);
    });

    for (const vector of QUANTIFICATION_VECTORS) {
      it(`matches the TypeScript engine: ${vector.name}`, async function () {
        const { registry, operator } = await loadFixture(readyFixture);
        const lastDay = Math.max(...vector.periods.map(p => p.startDay)) + 2;
        const start = BigInt(await time.latest()) - BigInt(lastDay * DAY);
        const { baselineEndsAtDay, ...integers } = vector.design;
        const plantId = ethers.encodeBytes32String("VECTOR");
        const design: DesignInput = {
          ...integers,
          baselineWh: BigInt(integers.baselineWh),
          baselineEndsAt: baselineEndsAtDay === null ? 0n : start + BigInt(baselineEndsAtDay * DAY),
          creditingStart: start,
          creditingEnd: start + BigInt(7 * CREDITING_YEAR),
          designHash: ethers.id(vector.name),
        };
        await registry.registerPlant(plantId, vector.name, operator.address, METER.address, design);

        for (const [sequence, p] of vector.periods.entries()) {
          const input = await attestationInput(registry, plantId, {
            plantSequence: sequence,
            periodStart: start + BigInt(p.startDay * DAY),
            periodEnd: start + BigInt((p.startDay + 1) * DAY),
            netEnergyWh: BigInt(p.netWh),
            grossEnergyWh: BigInt(p.grossWh),
            fuelG: BigInt(p.fuelG),
            leakageG: BigInt(p.leakageG),
          });
          const preview = await registry.quantify(plantId, input);
          await registry.submitAttestation(input);
          const stored = await registry.getAttestation(Number(await registry.attestationCount()) - 1);
          const actual = {
            egProjectWh: Number(stored.projectEnergyWh),
            baselineG: Number(stored.baselineG),
            reservoirG: Number(stored.reservoirG),
            fossilFuelG: Number(stored.fossilFuelG),
            leakageG: Number(stored.leakageG),
            reductionG: Number(stored.reductionG),
            unitsMinted: Number(stored.unitsMinted),
            balanceG: Number((await registry.getPlant(plantId)).balanceG),
          };
          expect(actual, `day ${p.startDay}`).to.deep.equal(p.expected);
          expect(preview.reductionG).to.equal(p.expected.reductionG);
          expect(preview.leakageG).to.equal(p.expected.leakageG);
        }
      });
    }

    it("enforces the nameplate ceiling on gross generation and net ≤ gross", async function () {
      const { registry } = await loadFixture(readyFixture);
      const maxWh = 500 * 1_000; // one hour at full capacity

      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { grossEnergyWh: BigInt(maxWh + 1) })),
      )
        .to.be.revertedWithCustomError(registry, "EnergyExceedsCapacity")
        .withArgs(maxWh + 1, maxWh);
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { netEnergyWh: 460_001n })),
      ).to.be.revertedWithCustomError(registry, "NetExceedsGross");
    });

    it("keeps periods inside the crediting period and within one crediting year", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const late = ethers.encodeBytes32String("LATE");
      await registry.registerPlant(late, "late", operator.address, METER.address, await plantDesign({}, -1)); // starts tomorrow
      await expect(registry.submitAttestation(await attestationInput(registry, late))).to.be.revertedWithCustomError(
        registry,
        "OutsideCreditingPeriod",
      );

      const now = BigInt(await time.latest());
      const year = ethers.encodeBytes32String("YEAR");
      const design = await plantDesign({ creditingStart: now - BigInt(CREDITING_YEAR) - 1_800n });
      await registry.registerPlant(year, "year", operator.address, METER.address, {
        ...design,
        creditingEnd: design.creditingStart + BigInt(7 * CREDITING_YEAR),
      });
      await expect(registry.submitAttestation(await attestationInput(registry, year))).to.be.revertedWithCustomError(
        registry,
        "PeriodCrossesCreditingYear",
      );
    });

    it("refuses a report computed against a stale ledger", async function () {
      const { registry } = await loadFixture(attestedFixture);
      await time.increase(HOUR);

      await expect(registry.submitAttestation(await attestationInput(registry, PLANT_ID, { plantSequence: 0 })))
        .to.be.revertedWithCustomError(registry, "StaleLedger")
        .withArgs(1, 0);
    });

    it("prevents double counting of overlapping periods", async function () {
      const { registry } = await loadFixture(attestedFixture);

      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { plantSequence: 1 })),
      ).to.be.revertedWithCustomError(registry, "PeriodOverlapsPrevious");
    });

    it("rejects incomplete data, future periods, empty hashes, unregistered fuel and inactive plants", async function () {
      const { registry, operator } = await loadFixture(readyFixture);
      const now = BigInt(await time.latest());

      await expect(registry.submitAttestation(await attestationInput(registry, PLANT_ID, { completenessBps: 8_999 })))
        .to.be.revertedWithCustomError(registry, "CompletenessTooLow")
        .withArgs(8_999, MIN_COMPLETENESS_BPS);
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { periodEnd: now + 1_000n })),
      ).to.be.revertedWithCustomError(registry, "InvalidPeriod");
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { reportHash: ethers.ZeroHash })),
      ).to.be.revertedWithCustomError(registry, "EmptyReportHash");

      const noFuel = ethers.encodeBytes32String("NOFUEL");
      await registry.registerPlant(
        noFuel,
        "no fuel",
        operator.address,
        METER.address,
        await plantDesign({ fuelCoefGPerTonne: 0 }),
      );
      await expect(
        registry.submitAttestation(await attestationInput(registry, noFuel, { fuelG: 1n })),
      ).to.be.revertedWithCustomError(registry, "FuelNotRegistered");

      await registry.setPlantActive(PLANT_ID, false);
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID)),
      ).to.be.revertedWithCustomError(registry, "PlantInactive");
    });

    it("only accepts attestations from verifiers once the token exists", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID)),
      ).to.be.revertedWithCustomError(registry, "TokenNotCreated");

      const { registry: ready } = await loadFixture(readyFixture);
      await expect(
        ready.connect(stranger).submitAttestation(await attestationInput(ready, PLANT_ID)),
      ).to.be.revertedWithCustomError(ready, "AccessControlUnauthorizedAccount");
    });

    it("pages through attestations", async function () {
      const { registry } = await loadFixture(attestedFixture);

      expect(await registry.attestationCount()).to.equal(1);
      expect(await registry.getAttestations(0, 10)).to.have.length(1);
      expect(await registry.getAttestations(5, 10)).to.have.length(0);
    });
  });

  describe("meter statements (the verifier cannot out-report the meter)", function () {
    it("hashes the statement with the chain id and the registry address", async function () {
      const { registry } = await loadFixture(readyFixture);
      const input = await attestationInput(registry, PLANT_ID, { fuelG: 12n }, { netEnergyWh: 451_000n });
      const { chainId } = await ethers.provider.getNetwork();
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint256", "address", "bytes32", "uint64", "uint64", "uint64", "int64", "uint64", "bytes32"],
          [
            ethers.id("hydro-dmrv/meter-statement@1"),
            chainId,
            await registry.getAddress(),
            PLANT_ID,
            input.periodStart,
            input.periodEnd,
            input.meter.grossEnergyWh,
            input.meter.netEnergyWh,
            input.meter.fuelG,
            input.meter.readingsDigest,
          ],
        ),
      );
      expect(await registry.meterStatementHash(PLANT_ID, input)).to.equal(expected);
    });

    it("matches the shared statement vector the TypeScript engine signs", async function () {
      const { domain, plantId, statement, hash } = METER_STATEMENT_VECTOR;
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "address", "bytes32", "uint64", "uint64", "uint64", "int64", "uint64", "bytes32"],
        [
          await (await loadFixture(deployFixture)).registry.METER_STATEMENT_TAG(),
          domain.chainId,
          domain.registry,
          ethers.encodeBytes32String(plantId),
          statement.periodStart,
          statement.periodEnd,
          statement.grossWh,
          statement.netWh,
          statement.fuelG,
          statement.readingsDigest,
        ],
      );
      expect(ethers.keccak256(encoded)).to.equal(hash);
    });

    it("accepts the registered meter's statement and records its readings digest", async function () {
      const { registry } = await loadFixture(readyFixture);
      const input = await attestationInput(registry, PLANT_ID);
      await expect(registry.submitAttestation(input))
        .to.emit(registry, "MeterStatementAccepted")
        .withArgs(0, METER.address, input.meter.readingsDigest);
      expect((await registry.getPlant(PLANT_ID)).meter).to.equal(METER.address);
    });

    it("rejects a statement signed by any other key, or edited after signing", async function () {
      const { registry } = await loadFixture(readyFixture);
      const impostor = new ethers.Wallet(ethers.id("not the meter"));
      await expect(registry.submitAttestation(await attestationInput(registry, PLANT_ID, {}, {}, impostor)))
        .to.be.revertedWithCustomError(registry, "InvalidMeterSignature")
        .withArgs(impostor.address, METER.address);

      const signed = await attestationInput(registry, PLANT_ID);
      const edited = { ...signed, meter: { ...signed.meter, netEnergyWh: signed.meter.netEnergyWh + 1_000n } };
      await expect(
        registry.submitAttestation({ ...edited, netEnergyWh: edited.meter.netEnergyWh }),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
      await expect(
        registry.submitAttestation({ ...signed, periodStart: signed.periodStart - 60n }),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
    });

    it("does not accept a statement signed for another registry", async function () {
      const { registry, feed, admin } = await loadFixture(readyFixture);
      const other = await ethers.deployContract("HydroCreditRegistry", [
        admin.address,
        await feed.getAddress(),
        NATIVE_PER_HBAR,
        MIN_COMPLETENESS_BPS,
        MAX_PRICE_AGE,
      ]);
      await other.registerPlant(PLANT_ID, "twin", admin.address, METER.address, await plantDesign());
      const forOther = await attestationInput(other, PLANT_ID);
      await expect(registry.submitAttestation(forOther)).to.be.revertedWithCustomError(
        registry,
        "InvalidMeterSignature",
      );
    });

    it("lets QA/QC lower net export and raise fuel, never the reverse", async function () {
      const { registry } = await loadFixture(readyFixture);
      const up = (overrides: Parameters<typeof attestationInput>[2], metered: Parameters<typeof attestationInput>[3]) =>
        attestationInput(registry, PLANT_ID, overrides, metered);

      await expect(
        registry.submitAttestation(await up({ netEnergyWh: 450_001n }, { netEnergyWh: 450_000n })),
      ).to.be.revertedWithCustomError(registry, "NotMetered");
      await expect(
        registry.submitAttestation(await up({ fuelG: 999n }, { fuelG: 1_000n })),
      ).to.be.revertedWithCustomError(registry, "NotMetered");
      await expect(
        registry.submitAttestation(await up({ grossEnergyWh: 459_000n }, { grossEnergyWh: 460_000n })),
      ).to.be.revertedWithCustomError(registry, "NotMetered"); // PE_HP basis cannot be understated

      await registry.submitAttestation(await up({ netEnergyWh: 440_000n, fuelG: 1_200n }, { fuelG: 1_000n }));
      const [attestation] = await registry.getAttestations(0, 1);
      expect(attestation.netEnergyWh).to.equal(440_000n);
      expect(attestation.fuelG).to.equal(1_200n);
    });

    it("caps metered gross generation at what the nameplate can produce in the period", async function () {
      const { registry } = await loadFixture(readyFixture);
      const cap = (500n * BigInt(HOUR) * 1_000n) / 3_600n; // 500 kW for one hour
      await expect(
        registry.submitAttestation(
          await attestationInput(registry, PLANT_ID, { grossEnergyWh: cap - 1n }, { grossEnergyWh: cap + 50_000n }),
        ),
      ).to.be.revertedWithCustomError(registry, "NotMetered");
      await registry.submitAttestation(
        await attestationInput(registry, PLANT_ID, { grossEnergyWh: cap }, { grossEnergyWh: cap + 50_000n }),
      );
    });

    it("requires a meter at registration and lets only the admin replace it", async function () {
      const { registry, operator, stranger } = await loadFixture(attestedFixture);
      await expect(
        registry.registerPlant(
          ethers.encodeBytes32String("NOMETER"),
          "x",
          operator.address,
          ethers.ZeroAddress,
          await plantDesign(),
        ),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");

      const replacement = new ethers.Wallet(ethers.id("replacement meter"));
      await expect(
        registry.connect(stranger).setPlantMeter(PLANT_ID, replacement.address),
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.setPlantMeter(PLANT_ID, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        "ZeroAddress",
      );
      await expect(registry.setPlantMeter(PLANT_ID, replacement.address))
        .to.emit(registry, "PlantMeterChanged")
        .withArgs(PLANT_ID, replacement.address);

      await time.increase(HOUR);
      await expect(
        registry.submitAttestation(await attestationInput(registry, PLANT_ID, { plantSequence: 1 })),
      ).to.be.revertedWithCustomError(registry, "InvalidMeterSignature");
      await registry.submitAttestation(
        await attestationInput(registry, PLANT_ID, { plantSequence: 1 }, {}, replacement),
      );
    });
  });

  describe("oracle-priced marketplace", function () {
    it("quotes USD-per-tonne listings in native HBAR units using the oracle answer", async function () {
      const { registry } = await loadFixture(listedFixture);

      // 400 kg * $12.50/t = $5.00 ; $5.00 / $0.25 = 20 HBAR
      expect(await registry.quote(0, 400)).to.equal(20n * NATIVE_PER_HBAR);
    });

    it("tracks the oracle: a higher HBAR price means fewer HBAR per credit", async function () {
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

    it("moves credits to the buyer's custody, escrows proceeds and refunds overpayment", async function () {
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

      await expect(registry.connect(buyer).buyAndRetire(0, 400, "Acme Corp FY2026 offset", { value: cost }))
        .to.emit(registry, "Retired")
        .withArgs(0, buyer.address, 400, "Acme Corp FY2026 offset");

      expect(await token.totalSupply()).to.equal(50);
      expect(await registry.totalRetiredUnits()).to.equal(400);
      expect(await registry.custodyBalanceOf(buyer.address)).to.equal(0);
      expect((await registry.getListings(0, 1))[0].active).to.equal(false);

      const [retirement] = await registry.getRetirements(0, 1);
      expect(retirement.account).to.equal(buyer.address);
      expect(retirement.beneficiary).to.equal("Acme Corp FY2026 offset");
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
    it("requires an HTS association before credits can leave the registry", async function () {
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

      await expect(registry.connect(operator).retire(10, "self-offset"))
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
