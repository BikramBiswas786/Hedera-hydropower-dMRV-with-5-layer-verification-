import { auditAttestation, reproduceAttestation } from "./audit";
import { DEMO_METERING, DEMO_PLANT } from "./demo";
import type { VerificationReport } from "./engine";
import type { MirrorTopicMessage } from "./mirror";
import { prepareAnchors } from "./pipeline";
import { HCS_CHUNK_BYTES, buildHcsMessage, decodeMessage } from "./report";
import { type ScenarioName, generateScenario } from "./scenarios";
import type { AttestationView } from "./views";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

const TOPIC = "0.0.5005";
const DATA_SEQUENCE = 10;
const END = new Date("2026-09-20T00:00:00Z");

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A fake mirror node: splits messages into HCS chunks and answers both mirror endpoints the audit uses. */
class FakeMirror {
  private messages: MirrorTopicMessage[] = [];

  publish(text: string, account = "0.0.42"): number {
    const bytes = new TextEncoder().encode(text);
    const total = Math.ceil(bytes.length / HCS_CHUNK_BYTES);
    const first = this.nextSequence();
    for (let i = 0; i < total; i++) {
      this.messages.push({
        sequence_number: this.nextSequence(),
        consensus_timestamp: `1790000000.00000000${i}`,
        message: toBase64(bytes.slice(i * HCS_CHUNK_BYTES, (i + 1) * HCS_CHUNK_BYTES)),
        chunk_info: {
          initial_transaction_id: { account_id: account, transaction_valid_start: `1790000000.${first}`, nonce: 0 },
          number: i + 1,
          total,
        },
      });
    }
    return first;
  }

  skipTo(sequence: number) {
    while (this.nextSequence() < sequence) this.publish("{}", "0.0.999");
  }

  private nextSequence() {
    return this.messages.length + 1;
  }

  fetch: typeof fetch = async input => {
    const url = new URL(String(input));
    const single = url.pathname.match(/messages\/(\d+)$/);
    if (single) {
      const message = this.messages.find(m => m.sequence_number === Number(single[1]));
      return message ? Response.json(message) : new Response("", { status: 404 });
    }
    const from = Number(url.searchParams.get("sequencenumber")?.replace("gte:", ""));
    return Response.json({ messages: this.messages.filter(m => m.sequence_number >= from) });
  };
}

/** What the contract stores for an anchored report: the monitored inputs and its own recomputed figures. */
function onChain(report: VerificationReport, reportHash: Hex, hcsSequence: number): AttestationView {
  const e = report.emissions!;
  return {
    id: 3,
    plantId: report.plantId,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    netEnergyWh: report.monitored.netWh,
    grossEnergyWh: report.monitored.grossWh,
    fuelG: report.monitored.fuelG,
    projectEnergyWh: e.egProjectWh,
    baselineG: e.baselineG,
    reservoirG: e.reservoirG,
    fossilFuelG: e.fossilFuelG,
    leakageG: e.leakageG,
    reductionG: e.reductionG,
    unitsMinted: e.unitsMinted,
    completenessBps: report.completenessBps,
    reportHash,
    hcsTopicId: TOPIC,
    hcsSequence,
    verifier: "0x0000000000000000000000000000000000000001",
    timestamp: report.periodEnd + 60,
  };
}

/** Publishes data then report exactly as the attestation pipeline does, returning what the contract would store. */
function anchor(mirror: FakeMirror, scenarioName: ScenarioName = "healthy") {
  const request = generateScenario(scenarioName, { end: END });
  const { report, data } = prepareAnchors(request);
  mirror.skipTo(DATA_SEQUENCE);
  const dataSequence = mirror.publish(data.message);
  const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: dataSequence });
  const reportSequence = mirror.publish(anchored.message);
  return { request, report, data, anchored, attestation: onChain(report, anchored.reportHash, reportSequence) };
}

describe("auditAttestation", () => {
  it("verifies an attestation whose HCS report hashes and matches field by field", async () => {
    const mirror = new FakeMirror();
    const { attestation, anchored } = anchor(mirror, "diesel-backup");
    const result = await auditAttestation(attestation, mirror.fetch);

    expect(result.status).toBe("verified");
    if (result.status !== "verified") return;
    expect(result.computedHash).toBe(anchored.reportHash);
    expect(result.hashscanUrl).toContain(`/topic/${TOPIC}/message/${attestation.hcsSequence}`);
  });

  it("detects an attestation that minted more than its anchored report computed", async () => {
    const mirror = new FakeMirror();
    const { attestation } = anchor(mirror);
    const result = await auditAttestation(
      { ...attestation, reductionG: attestation.reductionG * 2, unitsMinted: attestation.unitsMinted * 2 },
      mirror.fetch,
    );

    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.checks.filter(check => !check.ok).map(check => check.field)).toEqual(["ER (g)", "credits (kg)"]);
  });

  it("detects a report whose bytes differ from the on-chain hash", async () => {
    const mirror = new FakeMirror();
    const { attestation } = anchor(mirror);
    const result = await auditAttestation({ ...attestation, reportHash: `0x${"ab".repeat(32)}` }, mirror.fetch);

    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.checks.find(check => check.field === "reportHash")?.ok).toBe(false);
  });

  it("reports attestations without an HCS anchor", async () => {
    const { attestation } = anchor(new FakeMirror());
    expect(await auditAttestation({ ...attestation, hcsTopicId: null })).toEqual({
      status: "no-anchor",
      attestationId: 3,
    });
  });

  it("surfaces mirror node failures instead of throwing", async () => {
    const { attestation } = anchor(new FakeMirror());
    const down = (async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await auditAttestation(attestation, down)).toEqual({
      status: "unavailable",
      attestationId: 3,
      error: "Mirror node returned 503",
    });
  });
});

describe("reproduceAttestation", () => {
  it("re-derives every figure from the chunked readings published on HCS", async () => {
    const mirror = new FakeMirror();
    const { attestation, data, report } = anchor(mirror);
    expect(data.chunks).toBeGreaterThan(1);

    const result = await reproduceAttestation(attestation, mirror.fetch, DEMO_PLANT.design);
    expect(result.status).toBe("reproduced");
    if (result.status !== "reproduced") return;
    expect(result.engineMatches).toBe(true);
    expect(result.recomputed).toEqual(report);
    expect(result.checks.every(check => check.ok)).toBe(true);
    expect(result.checks.some(check => check.field === "registered.efGridGPerMwh")).toBe(true);
  });

  it("catches readings quantified with a grid factor other than the registered one", async () => {
    const mirror = new FakeMirror();
    const request = generateScenario("healthy", { end: END });
    const inflatedEf = { ...request.plant, design: { ...request.plant.design, efGridGPerMwh: 1_300_000 } };
    const { report, data } = prepareAnchors({ ...request, plant: inflatedEf });
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(data.message);
    const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: dataSequence });
    const reportSequence = mirror.publish(anchored.message);

    const result = await reproduceAttestation(
      onChain(report, anchored.reportHash, reportSequence),
      mirror.fetch,
      DEMO_PLANT.design,
    );
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.checks.filter(check => !check.ok).map(check => check.field)).toEqual(["registered.efGridGPerMwh"]);
  });

  it("reassembles chunks even when another submitter's messages interleave", async () => {
    const mirror = new FakeMirror();
    const { attestation } = anchor(mirror);
    const interleaved = new FakeMirror();
    const original = mirror.fetch;
    interleaved.fetch = async input => {
      const response = await original(input);
      if (!String(input).includes("sequencenumber")) return response;
      const { messages } = (await response.json()) as { messages: MirrorTopicMessage[] };
      const noise = { ...messages[0], chunk_info: { ...messages[0].chunk_info!, number: 2 }, message: btoa("x") };
      noise.chunk_info.initial_transaction_id = { ...noise.chunk_info.initial_transaction_id, account_id: "0.0.7" };
      return Response.json({ messages: [messages[0], noise, ...messages.slice(1)] });
    };

    expect((await reproduceAttestation(attestation, interleaved.fetch)).status).toBe("reproduced");
  });

  it("catches a verifier who approves data the engine rejects", async () => {
    const mirror = new FakeMirror();
    const request = generateScenario("inflated", { end: END });
    const { report: honest, data } = prepareAnchors(request);
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(data.message);
    // The dishonest verifier publishes the real readings but a doctored verdict and credits.
    const healthy = anchor(new FakeMirror()).report;
    const forged = buildHcsMessage(
      { ...honest, decision: "APPROVED", completenessBps: 10_000, emissions: healthy.emissions },
      { hash: data.dataHash, sequence: dataSequence },
    );
    const reportSequence = mirror.publish(forged.message);
    const attestation = { ...onChain(healthy, forged.reportHash, reportSequence) };

    const result = await reproduceAttestation(attestation, mirror.fetch);
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.recomputed.decision).toBe("REJECTED");
    const failed = result.checks.filter(check => !check.ok).map(check => check.field);
    expect(failed).toContain("decision");
    expect(failed).toContain("ER (g)");
  });

  it("catches readings edited after the meter signed them, even when the report matches the edit", async () => {
    const mirror = new FakeMirror();
    const request = generateScenario("healthy", { end: END });
    const edited = request.readings.map(r => ({ ...r, exportKwh: r.exportKwh * 1.01, checkExportKwh: undefined }));
    // The verifier computes an honest-looking report on edited readings, dropping the meter key from the record.
    const { deviceAddress: _, ...unsigned } = request.metering;
    const { report } = prepareAnchors({ ...request, readings: edited, metering: unsigned, signature: undefined });
    const { data } = prepareAnchors({ ...request, readings: edited });
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(data.message);
    const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: dataSequence });
    const reportSequence = mirror.publish(anchored.message);

    const result = await reproduceAttestation(onChain(report, anchored.reportHash, reportSequence), mirror.fetch);
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.recomputed.provenance.status).toBe("invalid");
    expect(result.checks.find(check => check.field === "decision")?.ok).toBe(false);
  });

  it("reproduces attestations published as readings@2, before meter signatures", async () => {
    const mirror = new FakeMirror();
    const request = generateScenario("diesel-backup", { end: END });
    const { data } = prepareAnchors({ ...request, metering: DEMO_METERING, signature: undefined });
    const legacy = JSON.parse(data.message);
    legacy.schema = "hydro-dmrv/readings@2";
    delete legacy.signature;
    const legacyMessage = JSON.stringify(legacy);
    const { report } = prepareAnchors({ ...request, metering: DEMO_METERING, signature: undefined });
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(legacyMessage);
    const legacyHash = decodeMessage(new TextEncoder().encode(legacyMessage)).hash;
    const anchored = buildHcsMessage(report, { hash: legacyHash, sequence: dataSequence });
    const reportSequence = mirror.publish(anchored.message);

    const result = await reproduceAttestation(onChain(report, anchored.reportHash, reportSequence), mirror.fetch);
    expect(result.status).toBe("reproduced");
    if (result.status !== "reproduced") return;
    expect(result.recomputed.provenance.status).toBe("unregistered");
  });

  it("flags readings that do not match the hash the report committed to", async () => {
    const mirror = new FakeMirror();
    const request = generateScenario("healthy", { end: END });
    const { report, data: real } = prepareAnchors(request);
    const { data: swapped } = prepareAnchors({ ...request, readings: request.readings.slice(1) });
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(swapped.message);
    const anchored = buildHcsMessage(report, { hash: real.dataHash, sequence: dataSequence });
    const reportSequence = mirror.publish(anchored.message);

    const result = await reproduceAttestation(onChain(report, anchored.reportHash, reportSequence), mirror.fetch);
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.checks.find(check => check.field === "dataHash")?.ok).toBe(false);
  });

  it("explains when a report does not reference published readings", async () => {
    const mirror = new FakeMirror();
    const { report, data } = prepareAnchors(generateScenario("healthy", { end: END }));
    const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: null });
    const reportSequence = mirror.publish(anchored.message);

    const result = await reproduceAttestation(onChain(report, anchored.reportHash, reportSequence), mirror.fetch);
    expect(result.status).toBe("no-data");
  });
});
