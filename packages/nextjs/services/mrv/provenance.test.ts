import { METER_STATEMENT_VECTOR } from "../../../hardhat/test/fixtures/meterStatementVector";
import {
  type MeterDomain,
  checkProvenance,
  meterStatementHash,
  meterStatementOf,
  readingsDigest,
  signMeterStatement,
  signReadings,
} from "./provenance";
import { generateScenario } from "./scenarios";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const DOMAIN: MeterDomain = { chainId: 296, registry: "0x7Da5C616f478c4111cF9173102298b2B6D888993" };
const { plant, readings } = generateScenario("diesel-backup", { end: END, domain: DOMAIN });
const key = generatePrivateKey();
const meter = privateKeyToAccount(key);

describe("meter statement", () => {
  it("hashes exactly like the legacy HydroCreditRegistry.meterStatementHash (shared vector)", () => {
    const { domain, plantId, statement, hash } = METER_STATEMENT_VECTOR;
    // The legacy EIP-191 hash does not cover the interval count; the EIP-712 statement does.
    expect(meterStatementHash(domain, plantId, { ...statement, intervals: 0, intervalSeconds: 0 })).toBe(hash);
  });

  it("carries the raw totals: gross and fuel rounded up, net export rounded down", () => {
    const statement = meterStatementOf(plant.plantId, readings);
    const sum = (pick: (r: (typeof readings)[number]) => number) => readings.reduce((s, r) => s + pick(r), 0);
    expect(statement.grossWh).toBe(Math.ceil(Number((sum(r => r.generationKwh) * 1_000).toFixed(3))));
    expect(statement.netWh).toBe(Math.floor(Number((sum(r => r.exportKwh - (r.importKwh ?? 0)) * 1_000).toFixed(3))));
    expect(statement.fuelG).toBeGreaterThan(0);
    expect(statement.periodEnd - statement.periodStart).toBe(24 * 3_600);
    expect(statement.readingsDigest).toBe(readingsDigest(plant.plantId, readings));
  });

  it("produces standard EIP-191 signatures any Ethereum library can check", async () => {
    const signature = signMeterStatement(key, DOMAIN, plant.plantId, readings);
    const hash = meterStatementHash(DOMAIN, plant.plantId, meterStatementOf(plant.plantId, readings));
    expect(await recoverMessageAddress({ message: { raw: hash }, signature })).toBe(meter.address);
    // …and the engine accepts one made by a standard wallet.
    const walletSignature = await meter.signMessage({ message: { raw: hash } });
    expect(checkProvenance(plant.plantId, readings, meter.address, walletSignature, DOMAIN).status).toBe("signed");
  });

  it("accepts the registered meter and nothing else", () => {
    const signature = signMeterStatement(key, DOMAIN, plant.plantId, readings);
    expect(checkProvenance(plant.plantId, readings, meter.address, signature, DOMAIN).status).toBe("signed");
    expect(checkProvenance(plant.plantId, readings, meter.address, undefined, DOMAIN).status).toBe("missing");
    expect(checkProvenance(plant.plantId, readings, undefined, signature, DOMAIN).status).toBe("unregistered");

    const other = privateKeyToAccount(generatePrivateKey()).address;
    expect(checkProvenance(plant.plantId, readings, other, signature, DOMAIN).status).toBe("invalid");
  });

  it("detects any edit after signing, and replay against another plant, chain or registry", () => {
    const signature = signMeterStatement(key, DOMAIN, plant.plantId, readings);
    const edited = readings.map((r, i) => (i === 7 ? { ...r, exportKwh: r.exportKwh + 0.001 } : r));
    const check = (rows = readings, plantId = plant.plantId, domain = DOMAIN) =>
      checkProvenance(plantId, rows, meter.address, signature, domain).status;

    expect(check(edited)).toBe("invalid");
    expect(check(readings, "HYDRO-DEMO-02")).toBe("invalid");
    expect(check(readings, plant.plantId, { ...DOMAIN, chainId: 295 })).toBe("invalid");
    expect(check(readings, plant.plantId, { ...DOMAIN, registry: meter.address })).toBe("invalid");
    expect(checkProvenance(plant.plantId, readings, meter.address, "0x1234", DOMAIN).status).toBe("invalid");
  });

  it("still checks the legacy batch signature of data messages before readings@5", () => {
    const legacy = signReadings(key, plant.plantId, readings);
    expect(checkProvenance(plant.plantId, readings, meter.address, legacy, null).status).toBe("signed");
    expect(checkProvenance(plant.plantId, readings, meter.address, legacy, DOMAIN).status).toBe("invalid");
  });
});
