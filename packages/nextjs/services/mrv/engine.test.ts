import { DECISION_THRESHOLDS, LAYER_WEIGHTS, expectedEnergyKwh, verifyReadings } from "./engine";
import { buildHcsMessage, hashBase64Message, readingsHash } from "./report";
import { DEMO_PLANT, SCENARIO_NAMES, generateScenario } from "./scenarios";
import { describe, expect, it } from "vitest";

const END = new Date("2026-09-20T00:00:00Z");
const scenario = (name: Parameters<typeof generateScenario>[0]) => generateScenario(name, { end: END });

describe("verifyReadings", () => {
  it("approves a healthy day of generation", () => {
    const report = verifyReadings(scenario("healthy"), DEMO_PLANT);

    expect(report.decision).toBe("APPROVED");
    expect(report.trustScore).toBeGreaterThanOrEqual(DECISION_THRESHOLDS.approve);
    expect(report.hardFailures).toEqual([]);
    expect(report.issues.filter(i => i.severity === "fail")).toEqual([]);
    expect(report.layers.every(l => l.status === "PASS")).toBe(true);
  });

  it("rejects energy the river cannot physically produce", () => {
    const report = verifyReadings(scenario("inflated"), DEMO_PLANT);

    expect(report.decision).toBe("REJECTED");
    expect(report.layers.find(l => l.layer === "physics")?.status).toBe("FAIL");
    expect(report.hardFailures[0]).toMatch(/more energy than the water can produce/);
  });

  it("rejects replayed intervals regardless of how good the numbers look", () => {
    const report = verifyReadings(scenario("replay"), DEMO_PLANT);

    expect(report.decision).toBe("REJECTED");
    expect(report.hardFailures.join()).toMatch(/double count/);
    expect(report.issues.some(i => i.layer === "temporal" && i.severity === "fail")).toBe(true);
  });

  it("flags isolated spikes for review instead of auto-approving them", () => {
    const report = verifyReadings(scenario("spikes"), DEMO_PLANT);

    expect(report.decision).toBe("FLAGGED");
    const outliers = report.issues.filter(i => i.layer === "statistical" && i.severity === "fail").map(i => i.reading);
    expect(outliers).toEqual([5, 12, 19]);
  });

  it("flags implausible water quality", () => {
    const report = verifyReadings(scenario("polluted"), DEMO_PLANT);

    expect(report.decision).toBe("FLAGGED");
    expect(report.layers.find(l => l.layer === "environmental")?.status).toBe("FAIL");
  });

  it("rejects intervals above nameplate capacity", () => {
    const [first] = scenario("healthy");
    const report = verifyReadings([{ ...first, energyKwh: DEMO_PLANT.capacityKw + 1 }], DEMO_PLANT);

    expect(report.decision).toBe("REJECTED");
    expect(report.hardFailures).toContain("Metered energy exceeds nameplate capacity");
  });

  it("derives the period and energy the contract will enforce", () => {
    const readings = scenario("healthy");
    const report = verifyReadings(readings, DEMO_PLANT);

    expect(report.periodEnd).toBe(END.getTime() / 1_000);
    expect(report.periodEnd - report.periodStart).toBe(24 * 3_600);
    expect(report.energyWh).toBe(Math.round(readings.reduce((s, r) => s + r.energyKwh, 0) * 1_000));
    // The on-chain capacity ceiling must never be tighter than what the engine approves.
    expect(report.energyWh).toBeLessThanOrEqual(DEMO_PLANT.capacityKw * 24 * 1_000);
  });

  it("is deterministic and weights layers to 100%", () => {
    expect(verifyReadings(scenario("healthy"), DEMO_PLANT)).toEqual(verifyReadings(scenario("healthy"), DEMO_PLANT));
    expect(Object.values(LAYER_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("computes hydraulic energy as ρ·g·Q·H·η·t", () => {
    const [reading] = scenario("healthy");
    const expected = (1_000 * 9.81 * reading.flowRateM3s * reading.headM * 0.85) / 1_000;
    expect(expectedEnergyKwh(reading, DEMO_PLANT)).toBeCloseTo(expected, 9);
  });
});

describe("HCS report", () => {
  it.each(SCENARIO_NAMES)("fits a single HCS chunk for the %s scenario", name => {
    const readings = scenario(name);
    const { message } = buildHcsMessage(verifyReadings(readings, DEMO_PLANT), readings);
    expect(new TextEncoder().encode(message).length).toBeLessThanOrEqual(1_024);
  });

  it("hashes identically whether computed locally or from the mirror node's base64 payload", () => {
    const readings = scenario("healthy");
    const { message, reportHash, body } = buildHcsMessage(verifyReadings(readings, DEMO_PLANT), readings);
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(message)));

    expect(hashBase64Message(base64)).toEqual({ text: message, hash: reportHash });
    expect(body.dataHash).toBe(readingsHash(readings));
  });

  it("changes the data hash when any reading is altered", () => {
    const readings = scenario("healthy");
    const tampered = readings.map((r, i) => (i === 3 ? { ...r, energyKwh: r.energyKwh + 0.001 } : r));
    expect(readingsHash(tampered)).not.toBe(readingsHash(readings));
  });
});
