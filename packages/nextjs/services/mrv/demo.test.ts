import { DEMO_PLANTS as REGISTERED } from "../../../hardhat/utils/demoPlants";
import { DEMO_ASSESSMENTS, DEMO_DESIGNS, DEMO_METERING, demoMeterKey, demoMeteringFor } from "./demo";
import { buildProjectMessage } from "./report";
import { readMeterKey } from "./server/attest";
import { generatePrivateKey } from "viem/accounts";
import { afterEach, describe, expect, it } from "vitest";

describe("demo plants registered by the deploy script", () => {
  it("match what the methodology engine derives from the demo designs", () => {
    expect(REGISTERED.map(p => p.plantId)).toEqual(DEMO_DESIGNS.map(d => d.plantId));
    DEMO_DESIGNS.forEach((design, i) => {
      const { designHash, ...integers } = REGISTERED[i].design;
      expect(REGISTERED[i].name).toBe(design.name);
      expect(integers).toEqual(DEMO_ASSESSMENTS[i].registration);
      expect(designHash).toBe(buildProjectMessage(design).designHash);
      expect(REGISTERED[i].meter).toBe(demoMeteringFor(design.plantId).deviceAddress);
      expect(REGISTERED[i].calibrationValidUntil).toBe(Date.parse(DEMO_METERING.calibrationValidUntil) / 1000);
      expect(REGISTERED[i].meteringHash).toBe(`0x${DEMO_METERING.calibrationCertificateSha256}`);
    });
  });
});

describe("server-held meter keys", () => {
  afterEach(() => {
    delete process.env.METER_PRIVATE_KEYS;
  });

  it("refuse the public demo-derived key on a Hedera chain id", () => {
    process.env.METER_PRIVATE_KEYS = JSON.stringify({ "HYDRO-DEMO-01": demoMeterKey("HYDRO-DEMO-01") });
    expect(() => readMeterKey("HYDRO-DEMO-01", 296)).toThrow(/public demo meter key/);
    expect(() => readMeterKey("HYDRO-DEMO-01", 295)).toThrow(/public demo meter key/);
    expect(readMeterKey("HYDRO-DEMO-01", 31337)).toBe(demoMeterKey("HYDRO-DEMO-01"));
  });

  it("accept a generated key on a Hedera chain id", () => {
    const key = generatePrivateKey();
    process.env.METER_PRIVATE_KEYS = JSON.stringify({ "HYDRO-DEMO-01": key });
    expect(readMeterKey("HYDRO-DEMO-01", 296)).toBe(key);
    expect(readMeterKey("HYDRO-DEMO-02", 296)).toBeNull();
  });
});
