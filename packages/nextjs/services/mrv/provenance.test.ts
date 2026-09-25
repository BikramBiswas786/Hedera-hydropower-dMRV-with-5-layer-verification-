import { checkProvenance, readingsDigest, recoverReadingsSigner, signReadings } from "./provenance";
import { generateScenario } from "./scenarios";
import { recoverMessageAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const { plant, readings } = generateScenario("healthy", { end: END });
const key = generatePrivateKey();
const meter = privateKeyToAccount(key);

describe("meter provenance", () => {
  it("produces standard EIP-191 signatures any Ethereum library can check", async () => {
    const signature = signReadings(key, plant.plantId, readings);
    const signer = await recoverMessageAddress({
      message: { raw: readingsDigest(plant.plantId, readings) },
      signature,
    });
    expect(signer).toBe(meter.address);
  });

  it("recovers signatures made by a standard wallet", async () => {
    const signature = await meter.signMessage({ message: { raw: readingsDigest(plant.plantId, readings) } });
    expect(recoverReadingsSigner(plant.plantId, readings, signature)).toBe(meter.address);
  });

  it("accepts the registered meter and nothing else", () => {
    const signature = signReadings(key, plant.plantId, readings);
    expect(checkProvenance(plant.plantId, readings, meter.address, signature).status).toBe("signed");
    expect(checkProvenance(plant.plantId, readings, meter.address, undefined).status).toBe("missing");
    expect(checkProvenance(plant.plantId, readings, undefined, signature).status).toBe("unregistered");

    const other = privateKeyToAccount(generatePrivateKey()).address;
    expect(checkProvenance(plant.plantId, readings, other, signature).status).toBe("invalid");
  });

  it("detects any edit after signing, and replay against another plant", () => {
    const signature = signReadings(key, plant.plantId, readings);
    const edited = readings.map((r, i) => (i === 7 ? { ...r, exportKwh: r.exportKwh + 0.001 } : r));
    expect(checkProvenance(plant.plantId, edited, meter.address, signature).status).toBe("invalid");
    expect(checkProvenance("HYDRO-DEMO-02", readings, meter.address, signature).status).toBe("invalid");
    expect(checkProvenance(plant.plantId, readings, meter.address, "0x1234").status).toBe("invalid");
  });
});
