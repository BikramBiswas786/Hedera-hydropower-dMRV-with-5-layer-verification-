import type { Wallet } from "ethers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HydroCreditRegistry } from "../../typechain-types";

export const DAY = 86_400;
export const HOUR = 3_600;
export const CREDITING_YEAR = 365 * DAY;
export const REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes('{"schema":"hydro-dmrv/report@4"}'));

export type DesignInput = {
  projectType: number;
  /** 0 = CDM (ACM0002 / AMS-I.D), 1 = VMR0017 v1.0. */
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
};

/**
 * A greenfield run-of-river plant whose 7-year crediting period started `startedDaysAgo` days before the latest
 * block. EF 1 t CO2/MWh keeps the market tests readable: 1 Wh of EG_PJ is 1 g of baseline emissions.
 */
export async function plantDesign(overrides: Partial<DesignInput> = {}, startedDaysAgo = 30): Promise<DesignInput> {
  const creditingStart = BigInt((await time.latest()) - startedDaysAgo * DAY);
  return {
    projectType: 0,
    methodology: 0,
    capacityKw: 500,
    baselineCapacityKw: 0,
    reservoirAreaM2: 0,
    baselineReservoirAreaM2: 0,
    efGridGPerMwh: 1_000_000,
    fuelCoefGPerTonne: 3_238_840,
    baselineWh: 0n,
    baselineEndsAt: 0n,
    creditingStart,
    creditingEnd: creditingStart + BigInt(7 * CREDITING_YEAR),
    designHash: ethers.id("design"),
    ...overrides,
  };
}

/** The plant data logger used by the tests; its address is registered as every test plant's meter. */
export const METER = new ethers.Wallet(ethers.id("hydro-dmrv test meter"));

export type MeterFields = {
  grossEnergyWh: bigint;
  netEnergyWh: bigint;
  fuelG: bigint;
  readingsDigest: string;
  signature: string;
};

export type AttestationFields = {
  plantId: string;
  plantSequence: number;
  periodStart: bigint;
  periodEnd: bigint;
  netEnergyWh: bigint;
  grossEnergyWh: bigint;
  fuelG: bigint;
  leakageG: bigint;
  completenessBps: number;
  reportHash: string;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  meter: MeterFields;
};

/**
 * The last hour before the latest block, 450 kWh net of 460 kWh gross. The meter statement repeats the verifier's
 * figures (or `metered` overrides) and is signed by `signer`, the registered test meter by default.
 */
export async function attestationInput(
  registry: HydroCreditRegistry,
  plantId: string,
  overrides: Partial<Omit<AttestationFields, "meter">> = {},
  metered: Partial<Omit<MeterFields, "signature">> = {},
  signer: Wallet = METER,
): Promise<AttestationFields> {
  const now = BigInt(await time.latest());
  const fields = {
    plantId,
    plantSequence: 0,
    periodStart: now - BigInt(HOUR),
    periodEnd: now,
    netEnergyWh: 450_000n,
    grossEnergyWh: 460_000n,
    fuelG: 0n,
    leakageG: 0n,
    completenessBps: 10_000,
    reportHash: REPORT_HASH,
    hcsTopicNum: 4_242_424n,
    hcsSequence: 7n,
    ...overrides,
  };
  const meter = {
    grossEnergyWh: fields.grossEnergyWh,
    netEnergyWh: fields.netEnergyWh,
    fuelG: fields.fuelG,
    readingsDigest: ethers.id("readings"),
    ...metered,
    signature: "0x",
  };
  const hash = await registry.meterStatementHash(plantId, { ...fields, meter });
  return { ...fields, meter: { ...meter, signature: await signer.signMessage(ethers.getBytes(hash)) } };
}
