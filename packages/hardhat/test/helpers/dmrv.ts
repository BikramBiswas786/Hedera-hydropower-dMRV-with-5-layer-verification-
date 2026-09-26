import { TypedDataEncoder, type Wallet } from "ethers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { CreditMarket, DmrvRegistry, HydroVmr0017Module, MockSaucerRouter } from "../../typechain-types";
import { ensureHts } from "./hts";

export const DAY = 86_400;
export const HOUR = 3_600;
export const CREDITING_YEAR = 365 * DAY;
export const YEAR = BigInt(CREDITING_YEAR);
export const FIVE_YEAR_FROM = 1_798_761_600n; // 2027-01-01T00:00:00Z
export const AUDIT_TOPIC = 4_242_424n;
export const REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes('{"schema":"hydro-dmrv/report@5"}'));
export const FEED_DECIMALS = 8;
export const HBAR_USD = 25_000_000n; // $0.25
export const NATIVE_PER_HBAR = 10n ** 18n; // local Hardhat EVM
export const MIN_COMPLETENESS_BPS = 9_000;
/** SaucerSwap V1 factory on testnet (0.0.9959). Tests point mock pools at this. */
export const SAUCER_FACTORY = "0x00000000000000000000000000000000000026e7";

/** Test keys. The meter and VVB are separate secp256k1 keys, as on a real deployment. */
export const METER = new ethers.Wallet(ethers.id("dmrv test meter"));
export const VVB = new ethers.Wallet(ethers.id("dmrv test vvb"));
export const OTHER_VVB = new ethers.Wallet(ethers.id("dmrv test vvb 2"));

export const HYDRO_PARAMS_TYPE =
  "tuple(uint8 projectType,uint8 methodology,uint32 capacityKw,uint32 baselineCapacityKw,uint64 reservoirAreaM2,uint64 baselineReservoirAreaM2,uint32 efGridGPerMwh,uint32 fuelCoefGPerTonne,uint64 baselineWh,uint64 baselineEndsAt,uint64 creditingStart,uint64 creditingEnd,uint64 registrationRequestedAt,uint64 calibrationValidUntil,bytes32 meteringHash,bytes32 designHash)";
export const ENERGY_TYPES = ["int64", "uint64", "uint64", "uint64"];

export type HydroParams = {
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
  registrationRequestedAt: bigint;
  calibrationValidUntil: bigint;
  meteringHash: string;
  designHash: string;
};

export type Energy = { netWh: bigint; grossWh: bigint; fuelG: bigint; leakageG: bigint };

const coder = ethers.AbiCoder.defaultAbiCoder();

export function encodeParams(p: HydroParams): string {
  return coder.encode(
    [HYDRO_PARAMS_TYPE],
    [
      [
        p.projectType,
        p.methodology,
        p.capacityKw,
        p.baselineCapacityKw,
        p.reservoirAreaM2,
        p.baselineReservoirAreaM2,
        p.efGridGPerMwh,
        p.fuelCoefGPerTonne,
        p.baselineWh,
        p.baselineEndsAt,
        p.creditingStart,
        p.creditingEnd,
        p.registrationRequestedAt,
        p.calibrationValidUntil,
        p.meteringHash,
        p.designHash,
      ],
    ],
  );
}

export function encodeEnergy(e: Energy): string {
  return coder.encode(ENERGY_TYPES, [e.netWh, e.grossWh, e.fuelG, e.leakageG]);
}

/**
 * A greenfield run-of-river plant (CDM, 500 kW) whose 7-year crediting period started `startedDaysAgo` days
 * before the latest block and was requested then. EF 1 t CO2/MWh: 1 Wh of EG_PJ is 1 g of baseline emissions.
 */
export async function hydroParams(overrides: Partial<HydroParams> = {}, startedDaysAgo = 30): Promise<HydroParams> {
  const creditingStart = BigInt((await time.latest()) - startedDaysAgo * DAY);
  const creditingEnd = creditingStart + 7n * YEAR;
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
    creditingEnd,
    registrationRequestedAt: creditingStart,
    calibrationValidUntil: creditingEnd,
    meteringHash: ethers.id("metering plan"),
    designHash: ethers.id("design"),
    ...overrides,
  };
}

export type SubmissionInput = {
  projectId: string;
  sequence: number;
  intervals: number;
  intervalSeconds: number;
  readingsDigest: string;
  reportHash: string;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
  evidenceHash: string;
  measurement: { periodStart: bigint; periodEnd: bigint; metered: string; verified: string };
};

export type Submission = SubmissionInput & { meterSignature: string; verifierSignature: string };

export const METER_STATEMENT_TYPES = {
  MeterStatement: [
    { name: "projectId", type: "bytes32" },
    { name: "sequence", type: "uint32" },
    { name: "periodStart", type: "uint64" },
    { name: "periodEnd", type: "uint64" },
    { name: "intervals", type: "uint32" },
    { name: "intervalSeconds", type: "uint32" },
    { name: "meteredHash", type: "bytes32" },
    { name: "readingsDigest", type: "bytes32" },
  ],
};

export const VERIFIER_APPROVAL_TYPES = {
  VerifierApproval: [
    { name: "meterStatement", type: "bytes32" },
    { name: "verifiedHash", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
    { name: "hcsTopicNum", type: "uint64" },
    { name: "hcsSequence", type: "uint64" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "decision", type: "uint8" },
  ],
};

export async function domainOf(registry: DmrvRegistry) {
  const { chainId } = await ethers.provider.getNetwork();
  return { name: "DmrvRegistry", version: "1", chainId, verifyingContract: await registry.getAddress() };
}

export function meterStatementOf(s: SubmissionInput) {
  return {
    projectId: s.projectId,
    sequence: s.sequence,
    periodStart: s.measurement.periodStart,
    periodEnd: s.measurement.periodEnd,
    intervals: s.intervals,
    intervalSeconds: s.intervalSeconds,
    meteredHash: ethers.keccak256(s.measurement.metered),
    readingsDigest: s.readingsDigest,
  };
}

export function approvalOf(meterDigest: string, s: SubmissionInput, decision = 1) {
  return {
    meterStatement: meterDigest,
    verifiedHash: ethers.keccak256(s.measurement.verified),
    reportHash: s.reportHash,
    hcsTopicNum: s.hcsTopicNum,
    hcsSequence: s.hcsSequence,
    evidenceHash: s.evidenceHash,
    decision,
  };
}

/** Signs a submission with the meter key (raw totals) and the VVB key (approval over the meter digest). */
export async function signSubmission(
  registry: DmrvRegistry,
  input: SubmissionInput,
  meter: Wallet = METER,
  vvb: Wallet = VVB,
  decision = 1,
): Promise<Submission> {
  const domain = await domainOf(registry);
  const statement = meterStatementOf(input);
  const meterSignature = await meter.signTypedData(domain, METER_STATEMENT_TYPES, statement);
  const meterDigest = TypedDataEncoder.hash(domain, METER_STATEMENT_TYPES, statement);
  const verifierSignature = await vvb.signTypedData(
    domain,
    VERIFIER_APPROVAL_TYPES,
    approvalOf(meterDigest, input, decision),
  );
  return { ...input, meterSignature, verifierSignature };
}

export type PeriodOptions = {
  sequence?: number;
  periodStart?: bigint;
  periodEnd?: bigint;
  metered?: Energy;
  verified?: Energy;
  intervals?: number;
  intervalSeconds?: number;
  hcsSequence?: bigint;
  evidenceHash?: string;
  reportHash?: string;
  hcsTopicNum?: bigint;
};

/** The last hour before the latest block, 450 kWh net of 460 kWh gross, 60 one-minute readings. */
export async function periodInput(projectId: string, o: PeriodOptions = {}): Promise<SubmissionInput> {
  const now = BigInt(await time.latest());
  const periodEnd = o.periodEnd ?? now;
  const periodStart = o.periodStart ?? periodEnd - BigInt(HOUR);
  const metered = o.metered ?? { netWh: 450_000n, grossWh: 460_000n, fuelG: 0n, leakageG: 0n };
  const verified = o.verified ?? metered;
  const span = Number(periodEnd - periodStart);
  const sequence = o.sequence ?? 0;
  return {
    projectId,
    sequence,
    intervals: o.intervals ?? Math.max(1, Math.round(span / 60)),
    intervalSeconds: o.intervalSeconds ?? 60,
    readingsDigest: ethers.sha256(ethers.toUtf8Bytes(`readings ${projectId} ${sequence} ${periodStart}`)),
    reportHash: o.reportHash ?? REPORT_HASH,
    hcsTopicNum: o.hcsTopicNum ?? AUDIT_TOPIC,
    hcsSequence: o.hcsSequence ?? BigInt(sequence + 1),
    evidenceHash: o.evidenceHash ?? ethers.ZeroHash,
    measurement: { periodStart, periodEnd, metered: encodeEnergy(metered), verified: encodeEnergy(verified) },
  };
}

export type Ctx = {
  registry: DmrvRegistry;
  market: CreditMarket;
  router: MockSaucerRouter;
  module: HydroVmr0017Module;
  feed: Awaited<ReturnType<typeof deployFeed>>;
  admin: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  operator: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  buyer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  stranger: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  mocked: boolean;
};

async function deployFeed() {
  return ethers.deployContract("MockV3Aggregator", [FEED_DECIMALS, HBAR_USD]);
}

/** Registry + module + market, wired, with no tokens and no projects. */
export async function deployCore(): Promise<Ctx> {
  const { mocked } = await ensureHts();
  const [admin, operator, buyer, stranger] = await ethers.getSigners();
  const registry = await ethers.deployContract("DmrvRegistry", [admin.address, MIN_COMPLETENESS_BPS]);
  const module = await ethers.deployContract("HydroVmr0017Module");
  const feed = await deployFeed();
  const router = await ethers.deployContract("MockSaucerRouter");
  const market = await ethers.deployContract("CreditMarket", [
    admin.address,
    await registry.getAddress(),
    await feed.getAddress(),
    NATIVE_PER_HBAR,
    HOUR,
    SAUCER_FACTORY,
    await router.getAddress(),
  ]);
  return { registry, market, module, feed, admin, operator, buyer, stranger, mocked, router };
}

export const PROJECT_ID = ethers.encodeBytes32String("HYDRO-DEMO-01");

/** Tokens created, module approved, market and VVB roles granted, audit topic set, one project registered. */
export async function deployReady(paramsOverrides: Partial<HydroParams> = {}) {
  const ctx = await deployCore();
  const { registry, market, module, operator } = ctx;
  await registry.createCreditToken("Hydro dMRV Carbon Credit", "HYCC", "dmrv credit", {
    value: ethers.parseEther("20"),
  });
  await registry.createCertificateToken("Hydro dMRV Retirement", "HYRET", "dmrv retirement", {
    value: ethers.parseEther("20"),
  });
  await registry.setModuleApproved(await module.getAddress(), true);
  await registry.grantRole(await registry.MARKET_ROLE(), await market.getAddress());
  await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
  await registry.setAuditTopic(AUDIT_TOPIC);
  const params = await hydroParams(paramsOverrides);
  await registry.registerProject(
    PROJECT_ID,
    "Demo run-of-river",
    await module.getAddress(),
    operator.address,
    METER.address,
    params.designHash,
    encodeParams(params),
  );
  return { ...ctx, params };
}

/** Submits one signed period and returns the attestation id. */
export async function submitPeriod(registry: DmrvRegistry, input: SubmissionInput, meter = METER, vvb = VVB) {
  const submission = await signSubmission(registry, input, meter, vvb);
  await registry.submitAttestation(submission);
  return Number(await registry.attestationCount()) - 1;
}
