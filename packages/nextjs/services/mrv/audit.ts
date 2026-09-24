import { ENGINE_VERSION, type VerificationReport, verifyReadings } from "./engine";
import { fetchChunkedMessage, fetchTopicMessage } from "./mirror";
import { hashscan } from "./network";
import {
  type HcsReportMessage,
  REPORT_SCHEMA,
  base64ToBytes,
  decodeMessage,
  layersInBps,
  parseDataMessage,
} from "./report";
import type { AttestationView } from "./views";
import type { Hex } from "viem";

export type AuditCheck = {
  field: string;
  expected: string | number;
  actual: string | number | undefined;
  ok: boolean;
};

const check = (field: string, expected: string | number, actual: string | number | undefined): AuditCheck => ({
  field,
  expected,
  actual,
  ok: expected === actual,
});

export type AuditResult =
  | { status: "no-anchor"; attestationId: number }
  | { status: "unavailable"; attestationId: number; error: string }
  | {
      status: "verified" | "mismatch";
      attestationId: number;
      onChainHash: Hex;
      computedHash: Hex;
      /** `expected` is the on-chain value, `actual` what the HCS report says. */
      checks: AuditCheck[];
      report: HcsReportMessage | null;
      rawMessage: string;
      consensusTimestamp: string;
      hashscanUrl: string;
    };

/**
 * Proves the attestation's evidence was not altered: fetches the HCS report from the public mirror node, hashes
 * it, and checks the hash and the report's fields against what the contract recorded.
 * Needs no credentials, so it runs the same in a browser, an API route or an AI agent.
 */
export async function auditAttestation(
  attestation: AttestationView,
  fetchImpl: typeof fetch = fetch,
): Promise<AuditResult> {
  const { id, hcsTopicId, hcsSequence } = attestation;
  if (!hcsTopicId) return { status: "no-anchor", attestationId: id };

  let mirror;
  try {
    mirror = await fetchTopicMessage(hcsTopicId, hcsSequence, fetchImpl);
  } catch (error) {
    return { status: "unavailable", attestationId: id, error: (error as Error).message };
  }

  const { text, hash } = decodeMessage(base64ToBytes(mirror.message));
  let report: HcsReportMessage | null = null;
  try {
    const parsed = JSON.parse(text) as HcsReportMessage;
    if (parsed.schema === REPORT_SCHEMA) report = parsed;
  } catch {
    report = null;
  }

  const checks = [
    check("reportHash", attestation.reportHash, hash),
    check("plantId", attestation.plantId, report?.plantId),
    check("periodStart", attestation.periodStart, report?.periodStart),
    check("periodEnd", attestation.periodEnd, report?.periodEnd),
    check("energyWh", attestation.energyWh, report?.energyWh),
    check("trustScoreBps", attestation.trustScoreBps, report?.trustScoreBps),
    check("decision", "APPROVED", report?.decision),
  ];

  return {
    status: checks.every(c => c.ok) ? "verified" : "mismatch",
    attestationId: id,
    onChainHash: attestation.reportHash,
    computedHash: hash,
    checks,
    report,
    rawMessage: text,
    consensusTimestamp: mirror.consensus_timestamp,
    hashscanUrl: hashscan.topicMessage(hcsTopicId, hcsSequence),
  };
}

export type ReproductionResult =
  | { status: "not-auditable"; audit: AuditResult }
  | { status: "no-data"; audit: AuditResult; reason: string }
  | {
      status: "reproduced" | "diverged";
      audit: AuditResult;
      /** `expected` is what the anchored report claims, `actual` what re-running the engine produced. */
      checks: AuditCheck[];
      engineMatches: boolean;
      recomputed: VerificationReport;
      dataHashUrl: string;
    };

/**
 * Re-derives the verdict from public data alone: audits the report, fetches the raw readings it commits to from
 * HCS (reassembling chunks), checks their hash, re-runs the deterministic engine and compares every published
 * figure. A verifier cannot approve bad data without this failing.
 */
export async function reproduceAttestation(
  attestation: AttestationView,
  fetchImpl: typeof fetch = fetch,
): Promise<ReproductionResult> {
  const audit = await auditAttestation(attestation, fetchImpl);
  if (audit.status !== "verified" && audit.status !== "mismatch") return { status: "not-auditable", audit };

  const sequence = audit.report?.data.sequence;
  if (!audit.report || sequence == null || !attestation.hcsTopicId) {
    return { status: "no-data", audit, reason: "The report does not reference published readings" };
  }

  let data;
  try {
    const { bytes } = await fetchChunkedMessage(attestation.hcsTopicId, sequence, fetchImpl);
    data = decodeMessage(bytes);
  } catch (error) {
    return { status: "no-data", audit, reason: (error as Error).message };
  }

  const report = audit.report;
  const dataHashCheck = check("dataHash", report.data.hash, data.hash);
  let parsed;
  try {
    parsed = parseDataMessage(data.text);
  } catch (error) {
    return { status: "no-data", audit, reason: `Published readings are malformed: ${(error as Error).message}` };
  }

  const recomputed = verifyReadings(parsed.readings, parsed.plant, parsed.gridEmissionFactor);
  const layers = layersInBps(recomputed);
  const checks = [
    dataHashCheck,
    check("plantId", report.plantId, recomputed.plantId),
    check("decision", report.decision, recomputed.decision),
    check("trustScoreBps", report.trustScoreBps, recomputed.trustScoreBps),
    check("energyWh", report.energyWh, recomputed.energyWh),
    check("periodStart", report.periodStart, recomputed.periodStart),
    check("periodEnd", report.periodEnd, recomputed.periodEnd),
    check("readings", report.readings, recomputed.readingCount),
    ...Object.entries(report.layersBps).map(([layer, bps]) => check(`layers.${layer}`, bps, layers[layer])),
  ];

  return {
    status: audit.status === "verified" && checks.every(c => c.ok) ? "reproduced" : "diverged",
    audit,
    checks,
    engineMatches: parsed.engine === ENGINE_VERSION,
    recomputed,
    dataHashUrl: hashscan.topicMessage(attestation.hcsTopicId, sequence),
  };
}
