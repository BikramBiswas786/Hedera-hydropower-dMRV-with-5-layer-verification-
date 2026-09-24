import { DEMO_DESIGNS, DEMO_METERING, DEMO_PLANT, DEMO_PLANTS } from "./demo";
import { prepareAnchors } from "./pipeline";
import {
  HCS_CHUNK_BYTES,
  HCS_MAX_DATA_BYTES,
  base64ToBytes,
  buildDataMessage,
  buildHcsMessage,
  buildProjectMessage,
  decodeMessage,
  parseDataMessage,
} from "./report";
import { SCENARIO_NAMES, type ScenarioName, generateScenario } from "./scenarios";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const LEDGER = { attestations: 3, balanceG: -1_250, creditingYear: 0, yearNetWh: 42_000_000 };
const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function anchors(name: ScenarioName, hours = 24, plant = DEMO_PLANT) {
  const request = generateScenario(name, { end: END, hours, plant });
  const prepared = prepareAnchors({ ...request, ledger: LEDGER });
  return {
    ...prepared,
    readings: request.readings,
    anchored: buildHcsMessage(prepared.report, { hash: prepared.data.dataHash, sequence: 41 }),
  };
}

describe("HCS report message", () => {
  for (const plant of DEMO_PLANTS) {
    it.each(SCENARIO_NAMES)(`fits a single HCS chunk for ${plant.plantId} %s`, name => {
      expect(new TextEncoder().encode(anchors(name, 24, plant).anchored.message).length).toBeLessThanOrEqual(
        HCS_CHUNK_BYTES,
      );
    });
  }

  it("carries the monitored inputs and every figure the contract recomputes", () => {
    const { report, anchored } = anchors("diesel-backup");
    expect(anchored.body.plantSequence).toBe(LEDGER.attestations);
    expect(anchored.body.monitored).toEqual({
      netWh: report.monitored.netWh,
      grossWh: report.monitored.grossWh,
      fuelG: report.monitored.fuelG,
      leakageG: 0,
    });
    expect(anchored.body.emissions?.reductionG).toBe(report.emissions?.reductionG);
    expect(anchored.body.emissions?.fossilFuelG).toBeGreaterThan(0);
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
  it("round-trips readings, plant, metering and ledger exactly", () => {
    const { readings, data, plant } = anchors("polluted");
    const parsed = parseDataMessage(data.message);

    expect(parsed.readings).toEqual(readings);
    expect(parsed.plant).toEqual(plant);
    expect(parsed.metering).toEqual(DEMO_METERING);
    expect(parsed.ledger).toEqual(LEDGER);
  });

  it("omits absent optional fields instead of inventing values", () => {
    const [first] = generateScenario("healthy", { end: END, hours: 1 }).readings;
    const bare = {
      timestamp: first.timestamp,
      intervalMinutes: 60,
      generationKwh: first.generationKwh,
      exportKwh: first.exportKwh,
      flowRateM3s: first.flowRateM3s,
      headM: first.headM,
    };
    const data = buildDataMessage([bare], DEMO_PLANT, DEMO_METERING, LEDGER, "engine");
    expect(parseDataMessage(data.message).readings[0]).toEqual(bare);
  });

  it("changes its hash when any reading is altered", () => {
    const { readings, data } = anchors("healthy");
    const tampered = readings.map((r, i) => (i === 3 ? { ...r, exportKwh: r.exportKwh + 0.001 } : r));
    expect(buildDataMessage(tampered, DEMO_PLANT, DEMO_METERING, LEDGER, data.body.engine).dataHash).not.toBe(
      data.dataHash,
    );
  });

  it("fits a day in a few chunks and a week of hourly data within the 20-chunk limit", () => {
    expect(anchors("healthy").data.chunks).toBeLessThanOrEqual(4);
    expect(anchors("healthy", 24 * 7, DEMO_PLANTS[1]).data.chunks).toBeLessThanOrEqual(20);
  });

  it("refuses batches larger than the 20-chunk HCS limit", () => {
    expect(() => anchors("healthy", 24 * 10)).toThrow(`HCS allows ${HCS_MAX_DATA_BYTES}`);
  });

  it("rejects malformed data messages", () => {
    expect(() => parseDataMessage('{"schema":"something-else"}')).toThrow();
    const { data } = anchors("healthy");
    expect(() => parseDataMessage(data.message.replace('"intervalMinutes"', '"interval"'))).toThrow();
  });
});

describe("project message", () => {
  it("hashes the design document deterministically", () => {
    const first = buildProjectMessage(DEMO_DESIGNS[0]);
    expect(buildProjectMessage(structuredClone(DEMO_DESIGNS[0])).designHash).toBe(first.designHash);
    expect(buildProjectMessage({ ...DEMO_DESIGNS[0], capacityKw: 501 }).designHash).not.toBe(first.designHash);
  });
});
