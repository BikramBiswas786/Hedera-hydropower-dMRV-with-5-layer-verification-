import { auditAttestation, reproduceAttestation } from "./audit";
import { verifyReadings } from "./engine";
import type { MirrorTopicMessage } from "./mirror";
import { HCS_CHUNK_BYTES, buildDataMessage, buildHcsMessage } from "./report";
import { DEMO_PLANT, generateScenario } from "./scenarios";
import type { AttestationView } from "./views";
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

/** Publishes data then report exactly as the attestation pipeline does, returning what the contract would store. */
function anchor(mirror: FakeMirror, scenarioName: Parameters<typeof generateScenario>[0] = "healthy") {
  const readings = generateScenario(scenarioName, { end: END });
  const report = verifyReadings(readings, DEMO_PLANT, 0.82);
  const data = buildDataMessage(readings, DEMO_PLANT, 0.82, report.engine);
  mirror.skipTo(DATA_SEQUENCE);
  const dataSequence = mirror.publish(data.message);
  const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: dataSequence });
  const reportSequence = mirror.publish(anchored.message);

  const attestation: AttestationView = {
    id: 3,
    plantId: report.plantId,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    energyWh: report.energyWh,
    unitsMinted: Math.floor(report.energyWh / 1_000),
    trustScoreBps: report.trustScoreBps,
    reportHash: anchored.reportHash,
    hcsTopicId: TOPIC,
    hcsSequence: reportSequence,
    verifier: "0x0000000000000000000000000000000000000001",
    timestamp: report.periodEnd + 60,
  };
  return { readings, report, data, anchored, attestation };
}

describe("auditAttestation", () => {
  it("verifies an attestation whose HCS report hashes and matches field by field", async () => {
    const mirror = new FakeMirror();
    const { attestation, anchored } = anchor(mirror);
    const result = await auditAttestation(attestation, mirror.fetch);

    expect(result.status).toBe("verified");
    if (result.status !== "verified") return;
    expect(result.computedHash).toBe(anchored.reportHash);
    expect(result.hashscanUrl).toContain(`/topic/${TOPIC}/message/${attestation.hcsSequence}`);
  });

  it("detects an attestation that claims more energy than its anchored report", async () => {
    const mirror = new FakeMirror();
    const { attestation } = anchor(mirror);
    const result = await auditAttestation({ ...attestation, energyWh: attestation.energyWh * 2 }, mirror.fetch);

    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.checks.filter(check => !check.ok).map(check => check.field)).toEqual(["energyWh"]);
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
  it("re-derives the decision from the chunked readings published on HCS", async () => {
    const mirror = new FakeMirror();
    const { attestation, data, report } = anchor(mirror);
    expect(data.chunks).toBeGreaterThan(1);

    const result = await reproduceAttestation(attestation, mirror.fetch);
    expect(result.status).toBe("reproduced");
    if (result.status !== "reproduced") return;
    expect(result.engineMatches).toBe(true);
    expect(result.recomputed).toEqual(report);
    expect(result.checks.every(check => check.ok)).toBe(true);
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
    const readings = generateScenario("inflated", { end: END });
    const honest = verifyReadings(readings, DEMO_PLANT, 0.82);
    const data = buildDataMessage(readings, DEMO_PLANT, 0.82, honest.engine);
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(data.message);
    // The dishonest verifier publishes the real readings but a doctored verdict.
    const forged = buildHcsMessage(
      { ...honest, decision: "APPROVED", trustScore: 0.95, trustScoreBps: 9_500 },
      { hash: data.dataHash, sequence: dataSequence },
    );
    const reportSequence = mirror.publish(forged.message);
    const attestation = {
      ...anchor(new FakeMirror()).attestation,
      energyWh: honest.energyWh,
      trustScoreBps: 9_500,
      reportHash: forged.reportHash,
      hcsSequence: reportSequence,
    };

    const result = await reproduceAttestation(attestation, mirror.fetch);
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.recomputed.decision).toBe("REJECTED");
    expect(result.checks.find(check => check.field === "decision")?.ok).toBe(false);
  });

  it("flags readings that do not match the hash the report committed to", async () => {
    const mirror = new FakeMirror();
    const readings = generateScenario("healthy", { end: END });
    const report = verifyReadings(readings, DEMO_PLANT, 0.82);
    const real = buildDataMessage(readings, DEMO_PLANT, 0.82, report.engine);
    const swapped = buildDataMessage(readings.slice(1), DEMO_PLANT, 0.82, report.engine);
    mirror.skipTo(DATA_SEQUENCE);
    const dataSequence = mirror.publish(swapped.message);
    const anchored = buildHcsMessage(report, { hash: real.dataHash, sequence: dataSequence });
    const reportSequence = mirror.publish(anchored.message);
    const attestation = {
      ...anchor(new FakeMirror()).attestation,
      reportHash: anchored.reportHash,
      hcsSequence: reportSequence,
    };

    const result = await reproduceAttestation(attestation, mirror.fetch);
    expect(result.status).toBe("diverged");
    if (result.status !== "diverged") return;
    expect(result.checks.find(check => check.field === "dataHash")?.ok).toBe(false);
  });

  it("explains when a report does not reference published readings", async () => {
    const mirror = new FakeMirror();
    const readings = generateScenario("healthy", { end: END });
    const report = verifyReadings(readings, DEMO_PLANT, 0.82);
    const data = buildDataMessage(readings, DEMO_PLANT, 0.82, report.engine);
    const anchored = buildHcsMessage(report, { hash: data.dataHash, sequence: null });
    const reportSequence = mirror.publish(anchored.message);
    const attestation = {
      ...anchor(new FakeMirror()).attestation,
      reportHash: anchored.reportHash,
      hcsSequence: reportSequence,
    };

    const result = await reproduceAttestation(attestation, mirror.fetch);
    expect(result.status).toBe("no-data");
  });
});
