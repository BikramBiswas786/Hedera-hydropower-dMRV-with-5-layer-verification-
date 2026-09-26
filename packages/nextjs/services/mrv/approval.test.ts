import { approvalDigest, approvalTypedDataJson, recoverApprover, signApproval } from "./approval";
import fixture from "./fixtures/eip712.json";
import {
  type MeterDomain,
  type MeterStatement,
  checkProvenance,
  meterStatementDigest,
  meterStatementOf,
  recoverDigest,
  signMeterStatement,
} from "./provenance";
import { generateScenario } from "./scenarios";
import { type Address, type Hex, decodeAbiParameters, hexToString, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const ENERGY = [{ type: "int64" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }] as const;
const decodeEnergy = (bytes: string) => {
  const [netWh, grossWh, fuelG, leakageG] = decodeAbiParameters(ENERGY, bytes as Hex);
  return { netWh: Number(netWh), grossWh: Number(grossWh), fuelG: Number(fuelG), leakageG: Number(leakageG) };
};

const s = fixture.submission;
const domain: MeterDomain = {
  chainId: fixture.domain.chainId,
  registry: fixture.domain.verifyingContract as Address,
  sequence: s.sequence,
};
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
const approval = {
  domain,
  plantId,
  statement,
  verified: decodeEnergy(s.measurement.verified),
  reportHash: s.reportHash as Hex,
  hcsTopicNum: BigInt(s.hcsTopicNum),
  hcsSequence: BigInt(s.hcsSequence),
  evidenceHash: s.evidenceHash as Hex,
};

describe("EIP-712 parity with DmrvRegistry (fixture exported by the Hardhat suite)", () => {
  it("computes the contract's meterStatementDigest and recovers the meter", () => {
    const digest = meterStatementDigest(domain, plantId, statement);
    expect(digest).toBe(fixture.meterStatementDigest);
    expect(recoverDigest(digest, s.meterSignature as Hex)).toBe(fixture.meterAddress);
  });

  it("computes the contract's approvalDigest and recovers the VVB", () => {
    expect(approvalDigest(approval)).toBe(fixture.approvalDigest);
    expect(recoverApprover(approval, s.verifierSignature as Hex)).toBe(fixture.verifierAddress);
  });

  it("changes the approval digest when a verified figure, the report or the evidence changes", () => {
    const base = approvalDigest(approval);
    expect(
      approvalDigest({ ...approval, verified: { ...approval.verified, netWh: approval.verified.netWh + 1 } }),
    ).not.toBe(base);
    expect(approvalDigest({ ...approval, reportHash: `0x${"11".repeat(32)}` })).not.toBe(base);
    expect(approvalDigest({ ...approval, evidenceHash: `0x${"22".repeat(32)}` })).not.toBe(base);
    expect(approvalDigest({ ...approval, hcsSequence: approval.hcsSequence + 1n })).not.toBe(base);
    expect(approvalDigest(approval, 2)).not.toBe(base);
  });

  it("produces signatures that standard EIP-712 wallets verify", async () => {
    const key = generatePrivateKey();
    const vvb = privateKeyToAccount(key);
    const signature = signApproval(key, approval);
    const typed = approvalTypedDataJson(approval);
    const walletSignature = await vvb.signTypedData({
      ...typed,
      domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Address },
      message: {
        ...typed.message,
        hcsTopicNum: BigInt(typed.message.hcsTopicNum),
        hcsSequence: BigInt(typed.message.hcsSequence),
      },
    });
    expect(signature).toBe(walletSignature);
    expect(
      await verifyTypedData({
        address: vvb.address,
        ...typed,
        domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Address },
        message: {
          ...typed.message,
          hcsTopicNum: BigInt(typed.message.hcsTopicNum),
          hcsSequence: BigInt(typed.message.hcsSequence),
        },
        signature,
      }),
    ).toBe(true);
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
