import {
  DECISION_REJECTED,
  VALIDATION_APPROVAL_TYPES,
  type VerificationInput,
  nextRecordsHash,
  recoverVerifier,
  signVerification,
  verificationDigest,
  verificationTypedDataJson,
} from "./approval";
import fixture from "./fixtures/eip712.json";
import {
  type MeterDomain,
  type MeterStatement,
  checkProvenance,
  dmrvDomain,
  meterStatementDigest,
  meterStatementOf,
  recoverDigest,
  signMeterStatement,
} from "./provenance";
import { generateScenario } from "./scenarios";
import {
  type Address,
  type Hex,
  decodeAbiParameters,
  hashTypedData,
  hexToString,
  verifyTypedData,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const ENERGY = [{ type: "int64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }] as const;
const decodeEnergy = (bytes: string) => {
  const [netWh, grossWh, fuelG, leakageG] = decodeAbiParameters(ENERGY, bytes as Hex);
  return { netWh: Number(netWh), grossWh: Number(grossWh), fuelG: Number(fuelG), leakageG: Number(leakageG) };
};

const s = fixture.submission;
const registry = { chainId: fixture.domain.chainId, registry: fixture.domain.verifyingContract as Address };
const domain: MeterDomain = { ...registry, sequence: s.sequence };
const plantId = hexToString(s.projectId as Hex, { size: 32 }).replace(/\0+$/, "");
const metered = decodeEnergy(s.measurement.metered);
const statement: MeterStatement = {
  periodStart: Number(s.measurement.periodStart),
  periodEnd: Number(s.measurement.periodEnd),
  grossWh: metered.grossWh,
  netWh: metered.netWh,
  fuelG: metered.fuelG,
  readingsDigest: s.readingsDigest as Hex,
  intervals: s.intervals,
  intervalSeconds: s.intervalSeconds,
};
const v = fixture.verification;
const verification: VerificationInput = {
  plantId,
  firstRecord: v.firstRecord,
  lastRecord: v.lastRecord,
  recordsHash: v.recordsHash as Hex,
  deductionG: BigInt(v.deductionG),
  reportHash: v.reportHash as Hex,
  hcsTopicNum: BigInt(v.hcsTopicNum),
  hcsSequence: BigInt(v.hcsSequence),
  evidenceHash: v.evidenceHash as Hex,
  decision: v.decision,
};

describe("EIP-712 parity with DmrvRegistry v2 (fixture exported by the Hardhat suite)", () => {
  it("computes the contract's ValidationApproval digest and recovers the VVB", () => {
    const { signature, digest, ...message } = fixture.validation;
    const computed = hashTypedData({
      domain: dmrvDomain(registry),
      types: VALIDATION_APPROVAL_TYPES,
      primaryType: "ValidationApproval",
      message: message as never,
    });
    expect(computed).toBe(digest);
    expect(recoverDigest(computed, signature as Hex)).toBe(fixture.verifierAddress);
  });

  it("computes the contract's meterStatementDigest and recovers the meter", () => {
    const digest = meterStatementDigest(domain, plantId, statement);
    expect(digest).toBe(fixture.meterStatementDigest);
    expect(recoverDigest(digest, s.meterSignature as Hex)).toBe(fixture.meterAddress);
  });

  it("recomputes the record hash chain exactly as recordMonitoring does", () => {
    const head = nextRecordsHash(zeroHash, registry, {
      plantId,
      sequence: s.sequence,
      statement,
      verified: s.measurement.verified as Hex,
      reportHash: s.reportHash as Hex,
      hcsTopicNum: BigInt(s.hcsTopicNum),
      hcsSequence: BigInt(s.hcsSequence),
      reductionG: BigInt(fixture.reductionG),
    });
    expect(head).toBe(fixture.recordsHash);
    expect(decodeEnergy(s.measurement.verified).netWh).toBeLessThan(metered.netWh);
  });

  it("computes the contract's VerificationStatement digest and recovers the VVB", () => {
    expect(recoverVerifier(registry, verification, v.signature as Hex)).toBe(fixture.verifierAddress);
  });

  it("changes the verification digest when the run, chain head, deduction, report, anchor or decision changes", () => {
    const base = verificationDigest(registry, verification);
    const variants: Partial<VerificationInput>[] = [
      { lastRecord: 1 },
      { recordsHash: `0x${"11".repeat(32)}` },
      { deductionG: 1n },
      { reportHash: `0x${"22".repeat(32)}` },
      { hcsSequence: verification.hcsSequence + 1n },
      { evidenceHash: zeroHash },
      { decision: DECISION_REJECTED },
    ];
    for (const change of variants) expect(verificationDigest(registry, { ...verification, ...change })).not.toBe(base);
    expect(verificationDigest({ ...registry, chainId: 296 }, verification)).not.toBe(base);
  });

  it("produces signatures that standard EIP-712 wallets verify", async () => {
    const key = generatePrivateKey();
    const vvb = privateKeyToAccount(key);
    const signature = signVerification(key, registry, verification);
    const typed = verificationTypedDataJson(registry, verification);
    const message = {
      ...typed.message,
      deductionG: BigInt(typed.message.deductionG),
      hcsTopicNum: BigInt(typed.message.hcsTopicNum),
      hcsSequence: BigInt(typed.message.hcsSequence),
    };
    const walletSignature = await vvb.signTypedData({ ...typed, message });
    expect(signature).toBe(walletSignature);
    expect(await verifyTypedData({ address: vvb.address, ...typed, message, signature })).toBe(true);
  });
});

describe("meter provenance on a DmrvRegistry domain", () => {
  const eipDomain: MeterDomain = { chainId: 296, registry: "0x7Da5C616f478c4111cF9173102298b2B6D888993", sequence: 3 };
  const { plant, readings } = generateScenario("healthy", { end: new Date("2026-09-20T00:00:00Z"), domain: eipDomain });
  const key = generatePrivateKey();
  const meter = privateKeyToAccount(key);

  it("signs the EIP-712 statement, bound to the ledger sequence", () => {
    const signature = signMeterStatement(key, eipDomain, plant.plantId, readings);
    expect(checkProvenance(plant.plantId, readings, meter.address, signature, eipDomain).status).toBe("signed");
    expect(
      checkProvenance(plant.plantId, readings, meter.address, signature, { ...eipDomain, sequence: 4 }).status,
    ).toBe("invalid");
    const legacy = { chainId: eipDomain.chainId, registry: eipDomain.registry };
    expect(checkProvenance(plant.plantId, readings, meter.address, signature, legacy).status).toBe("invalid");
  });

  it("reports the interval count and length the registry computes completeness from", () => {
    const statement = meterStatementOf(plant.plantId, readings);
    expect(statement.intervals).toBe(readings.length);
    expect(statement.intervalSeconds).toBe(Math.min(...readings.map(r => r.intervalMinutes * 60)));
  });
});
