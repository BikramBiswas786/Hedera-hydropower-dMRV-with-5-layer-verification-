import { auditAttestation } from "./audit";
import { verifyReadings } from "./engine";
import { buildHcsMessage } from "./report";
import { DEMO_PLANT, generateScenario } from "./scenarios";
import type { AttestationView } from "./views";
import { describe, expect, it } from "vitest";

const readings = generateScenario("healthy", { end: new Date("2026-09-20T00:00:00Z") });
const report = verifyReadings(readings, DEMO_PLANT);
const { message, reportHash } = buildHcsMessage(report, readings);

const attestation: AttestationView = {
  id: 3,
  plantId: report.plantId,
  periodStart: report.periodStart,
  periodEnd: report.periodEnd,
  energyWh: report.energyWh,
  unitsMinted: Math.floor(report.energyWh / 1_000),
  trustScoreBps: report.trustScoreBps,
  reportHash,
  hcsTopicId: "0.0.5005",
  hcsSequence: 12,
  verifier: "0x0000000000000000000000000000000000000001",
  timestamp: report.periodEnd + 60,
};

function mirrorReturning(text: string): typeof fetch {
  const body = { message: btoa(text), consensus_timestamp: "1790000000.000000001", sequence_number: 12 };
  return (async () => new Response(JSON.stringify(body))) as typeof fetch;
}

describe("auditAttestation", () => {
  it("verifies an attestation whose HCS report hashes and matches field by field", async () => {
    const result = await auditAttestation(attestation, mirrorReturning(message));

    expect(result.status).toBe("verified");
    if (result.status !== "verified") return;
    expect(result.computedHash).toBe(reportHash);
    expect(result.checks.every(check => check.ok)).toBe(true);
    expect(result.hashscanUrl).toContain("/topic/0.0.5005/message/12");
  });

  it("detects an attestation that claims more energy than its anchored report", async () => {
    const inflated = { ...attestation, energyWh: attestation.energyWh * 2 };
    const result = await auditAttestation(inflated, mirrorReturning(message));

    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.checks.filter(check => !check.ok).map(check => check.field)).toEqual(["energyWh"]);
  });

  it("detects a report that was altered after anchoring", async () => {
    const altered = message.replace(`"energyWh":${report.energyWh}`, `"energyWh":${report.energyWh + 1}`);
    const result = await auditAttestation(attestation, mirrorReturning(altered));

    expect(result.status).toBe("mismatch");
    if (result.status !== "mismatch") return;
    expect(result.checks.find(check => check.field === "reportHash")?.ok).toBe(false);
  });

  it("reports attestations without an HCS anchor", async () => {
    expect(await auditAttestation({ ...attestation, hcsTopicId: null })).toEqual({
      status: "no-anchor",
      attestationId: 3,
    });
  });

  it("surfaces mirror node failures instead of throwing", async () => {
    const down = (async () => new Response("", { status: 503 })) as typeof fetch;
    expect(await auditAttestation(attestation, down)).toEqual({
      status: "unavailable",
      attestationId: 3,
      error: "Mirror node returned 503",
    });
  });
});
