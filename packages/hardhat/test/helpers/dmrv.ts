import type { Wallet } from "ethers";
import { artifacts, ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { CreditMarket, DmrvRegistry, HydroVmr0017Module, MockSaucerRouter } from "../../typechain-types";
import {
  DECISION_APPROVED,
  DECISION_REJECTED,
  type Energy,
  ENERGY_TYPES,
  METER_STATEMENT_TYPES,
  type Submission,
  type SubmissionInput,
  VALIDATION_APPROVAL_TYPES,
  VERIFICATION_STATEMENT_TYPES,
  type VerificationStatement,
  encodeEnergy,
  meterStatementOf,
  registryDomain,
  signSubmission as signMeterStatement,
  signValidation,
  signVerification,
} from "../../utils/attestation";
import { ensureHts } from "./hts";

export {
  DECISION_APPROVED,
  DECISION_REJECTED,
  ENERGY_TYPES,
  METER_STATEMENT_TYPES,
  VALIDATION_APPROVAL_TYPES,
  VERIFICATION_STATEMENT_TYPES,
  encodeEnergy,
  meterStatementOf,
  signValidation,
  signVerification,
  type Energy,
  type Submission,
  type SubmissionInput,
  type VerificationStatement,
};

export const DAY = 86_400;
export const HOUR = 3_600;
export const CREDITING_YEAR = 365 * DAY;
export const YEAR = BigInt(CREDITING_YEAR);
export const FIVE_YEAR_FROM = 1_798_761_600n; // 2027-01-01T00:00:00Z
export const AUDIT_TOPIC = 4_242_424n;
export const REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes('{"schema":"hydro-dmrv/report@4"}'));
export const VALIDATION_REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes("validation report"));
export const VERIFICATION_REPORT_HASH = ethers.sha256(ethers.toUtf8Bytes("verification report"));
/** Uganda, a UN Least Developed Country: VMR0017 hydro is eligible there. */
export const UGANDA = "0x5547";
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
  "tuple(uint8 projectType,uint8 methodology,bytes2 hostCountry,uint32 capacityKw,uint32 authorizedCapacityKw,uint32 baselineCapacityKw,uint64 reservoirAreaM2,uint64 baselineReservoirAreaM2,uint32 efGridGPerMwh,uint32 fuelCoefGPerTonne,uint64 baselineWh,uint64 baselineEndsAt,uint64 creditingStart,uint64 creditingEnd,uint64 registrationRequestedAt,uint64 calibrationValidUntil,bytes32 meteringHash,bytes32 designHash)";

export type HydroParams = {
  projectType: number;
  methodology: number;
  /** ISO 3166-1 alpha-2 as bytes2 hex, e.g. "0x5547" (UG). Defaults to Uganda when encoding. */
  hostCountry?: string;
  capacityKw: number;
  /** Authorized capacity (kW) from the activity approval; 0 when none. */
  authorizedCapacityKw?: number;
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

const coder = ethers.AbiCoder.defaultAbiCoder();

export function encodeParams(p: HydroParams): string {
  return coder.encode(
    [HYDRO_PARAMS_TYPE],
    [
      [
        p.projectType,
        p.methodology,
        p.hostCountry ?? UGANDA,
        p.capacityKw,
        p.authorizedCapacityKw ?? 0,
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

export async function domainOf(registry: DmrvRegistry) {
  const { chainId } = await ethers.provider.getNetwork();
  return registryDomain(chainId, await registry.getAddress());
}

/** Signs a monitoring period with the meter key. */
export async function signSubmission(
  registry: DmrvRegistry,
  input: SubmissionInput,
  meter: Wallet = METER,
): Promise<Submission> {
  return signMeterStatement(await domainOf(registry), input, meter);
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
/** Installs MockSaucerFactory at SAUCER_FACTORY so `getPair` answers like SaucerSwap's factory. */
export async function ensureSaucerFactory() {
  if ((await ethers.provider.getCode(SAUCER_FACTORY)) === "0x") {
    const { deployedBytecode } = await artifacts.readArtifact("MockSaucerFactory");
    await network.provider.send("hardhat_setCode", [SAUCER_FACTORY, deployedBytecode]);
  }
  return ethers.getContractAt("MockSaucerFactory", SAUCER_FACTORY);
}

export async function deployCore(): Promise<Ctx> {
  const { mocked } = await ensureHts();
  await ensureSaucerFactory();
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

export type RegisterOptions = {
  projectId?: string;
  operator?: string;
  meter?: string;
  validator?: Wallet;
  externalId?: string;
  reportHash?: string;
};

/** Registers a project with a VVB's `ValidationApproval` over exactly this registration. */
export async function registerValidated(
  registry: DmrvRegistry,
  module: string,
  params: string,
  designHash: string,
  o: RegisterOptions & { operator: string },
) {
  const r = {
    projectId: o.projectId ?? PROJECT_ID,
    module,
    operator: o.operator,
    meter: o.meter ?? METER.address,
    designHash,
    validationReportHash: o.reportHash ?? VALIDATION_REPORT_HASH,
    externalId: o.externalId ?? ethers.ZeroHash,
    params,
  };
  const signature = await signValidation(
    await domainOf(registry),
    { ...r, reportHash: r.validationReportHash, creditingPeriod: 1 },
    o.validator ?? VVB,
  );
  return registry.registerProject(r, signature);
}

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
  await registry.setMarket(await market.getAddress());
  await registry.grantRole(await registry.VERIFIER_ROLE(), VVB.address);
  await registry.setAuditTopic(AUDIT_TOPIC);
  const params = await hydroParams(paramsOverrides);
  await registerValidated(registry, await module.getAddress(), encodeParams(params), params.designHash, {
    operator: operator.address,
  });
  return { ...ctx, params };
}

/** Records one meter-signed period as the operator and returns its attestation id. */
export async function recordPeriod(
  registry: DmrvRegistry,
  input: SubmissionInput,
  reporter: Parameters<DmrvRegistry["connect"]>[0],
  meter = METER,
) {
  const submission = await signSubmission(registry, input, meter);
  await registry.connect(reporter).recordMonitoring(submission);
  return Number(await registry.attestationCount()) - 1;
}

export type VerifyOptions = {
  firstRecord?: number;
  lastRecord?: number;
  deductionG?: bigint;
  decision?: number;
  evidenceHash?: string;
  reportHash?: string;
  hcsSequence?: bigint;
  vvb?: Wallet;
  recordsHash?: string;
};

/** The statement a VVB signs for records first..last of a project, with the chain head read from the registry. */
export async function verificationOf(
  registry: DmrvRegistry,
  projectId: string,
  o: VerifyOptions = {},
): Promise<VerificationStatement> {
  const project = await registry.getProject(projectId);
  const firstRecord = o.firstRecord ?? Number(project.verifiedRecords);
  const lastRecord = o.lastRecord ?? Number(project.attestations) - 1;
  const all = await registry.getAttestations(0, await registry.attestationCount());
  const last = all.find(a => a.projectId === projectId && Number(a.sequence) === lastRecord);
  return {
    projectId,
    firstRecord,
    lastRecord,
    recordsHash: o.recordsHash ?? last?.chainHash ?? ethers.ZeroHash,
    deductionG: o.deductionG ?? 0n,
    reportHash: o.reportHash ?? VERIFICATION_REPORT_HASH,
    hcsTopicNum: AUDIT_TOPIC,
    hcsSequence: o.hcsSequence ?? 1_000n + BigInt(lastRecord),
    evidenceHash: o.evidenceHash ?? ethers.ZeroHash,
    decision: o.decision ?? DECISION_APPROVED,
  };
}

/** Signs and relays a verification of the project's unverified records; returns the issuance id. */
export async function verifyRecords(registry: DmrvRegistry, projectId: string, o: VerifyOptions = {}) {
  const statement = await verificationOf(registry, projectId, o);
  const signature = await signVerification(await domainOf(registry), statement, o.vvb ?? VVB);
  await registry.verifyPeriod(statement, signature);
  return Number(await registry.issuanceCount()) - 1;
}

/** Records one period as the operator and verifies it at once: the shortest path to issued credits. */
export async function submitPeriod(
  registry: DmrvRegistry,
  input: SubmissionInput,
  reporter: Parameters<DmrvRegistry["connect"]>[0],
) {
  const attestationId = await recordPeriod(registry, input, reporter);
  const issuanceId = await verifyRecords(registry, input.projectId);
  return { attestationId, issuanceId };
}
