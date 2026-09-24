import { verifyReadings } from "./engine";
import {
  HCS_CHUNK_BYTES,
  HCS_MAX_DATA_BYTES,
  base64ToBytes,
  buildDataMessage,
  buildHcsMessage,
  decodeMessage,
  parseDataMessage,
} from "./report";
import { DEMO_PLANT, SCENARIO_NAMES, generateScenario } from "./scenarios";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const scenario = (name: Parameters<typeof generateScenario>[0], hours = 24) =>
  generateScenario(name, { end: END, hours });
const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function anchors(name: Parameters<typeof generateScenario>[0], hours = 24) {
  const readings = scenario(name, hours);
  const report = verifyReadings(readings, DEMO_PLANT, 0.82);
  const data = buildDataMessage(readings, DEMO_PLANT, 0.82, report.engine);
  return { readings, report, data, anchored: buildHcsMessage(report, { hash: data.dataHash, sequence: 41 }) };
}

describe("HCS report message", () => {
  it.each(SCENARIO_NAMES)("fits a single HCS chunk for the %s scenario", name => {
    expect(new TextEncoder().encode(anchors(name).anchored.message).length).toBeLessThanOrEqual(HCS_CHUNK_BYTES);
  });

  it("commits to the data message by hash and sequence", () => {
    const { data, anchored } = anchors("healthy");
    expect(anchored.body.data).toEqual({ hash: data.dataHash, sequence: 41 });
  });

  it("hashes identically whether computed locally or from the mirror node's base64 payload", () => {
    const { anchored } = anchors("healthy");
    expect(decodeMessage(base64ToBytes(toBase64(anchored.message)))).toEqual({
      text: anchored.message,
      hash: anchored.reportHash,
    });
  });
});

describe("HCS data message", () => {
  it("round-trips readings, plant profile and emission factor exactly", () => {
    const { readings, data } = anchors("polluted");
    const parsed = parseDataMessage(data.message);

    expect(parsed.readings).toEqual(readings);
    expect(parsed.plant).toEqual(DEMO_PLANT);
    expect(parsed.gridEmissionFactor).toBe(0.82);
  });

  it("omits absent optional fields instead of inventing values", () => {
    const [first] = scenario("healthy", 1);
    const bare = { ...first, ph: undefined, turbidityNtu: undefined, temperatureC: undefined, efficiency: undefined };
    const data = buildDataMessage([bare], DEMO_PLANT, 0.82, "engine");

    expect(parseDataMessage(data.message).readings[0]).toEqual({
      timestamp: first.timestamp,
      intervalMinutes: 60,
      flowRateM3s: first.flowRateM3s,
      headM: first.headM,
      energyKwh: first.energyKwh,
    });
  });

  it("changes its hash when any reading is altered", () => {
    const { readings, data } = anchors("healthy");
    const tampered = readings.map((r, i) => (i === 3 ? { ...r, energyKwh: r.energyKwh + 0.001 } : r));
    expect(buildDataMessage(tampered, DEMO_PLANT, 0.82, "hydro-dmrv-engine@1.0.0").dataHash).not.toBe(data.dataHash);
  });

  it("reports how many HCS chunks a day and a week of readings need", () => {
    expect(anchors("healthy").data.chunks).toBeGreaterThan(1);
    expect(anchors("healthy", 24 * 7).data.chunks).toBeLessThanOrEqual(20);
  });

  it("refuses batches larger than the 20-chunk HCS limit", () => {
    expect(() => anchors("healthy", 24 * 14)).toThrow(`HCS allows ${HCS_MAX_DATA_BYTES}`);
  });

  it("rejects malformed data messages", () => {
    expect(() => parseDataMessage('{"schema":"something-else"}')).toThrow();
    const { data } = anchors("healthy");
    expect(() => parseDataMessage(data.message.replace('"intervalMinutes"', '"interval"'))).toThrow();
  });
});
