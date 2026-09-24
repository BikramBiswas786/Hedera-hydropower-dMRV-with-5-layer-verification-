import { MIRROR_NODE_URL, hashscan } from "./network";
import { type HcsReportMessage, REPORT_SCHEMA, hashBase64Message } from "./report";
import type { AttestationView } from "./views";
import type { Hex } from "viem";

export type AuditCheck = { field: string; onChain: string | number; report: string | number | undefined; ok: boolean };

export type AuditResult =
  | { status: "no-anchor"; attestationId: number }
  | { status: "unavailable"; attestationId: number; error: string }
  | {
      status: "verified" | "mismatch";
      attestationId: number;
      onChainHash: Hex;
      computedHash: Hex;
      checks: AuditCheck[];
      report: HcsReportMessage | null;
      rawMessage: string;
      consensusTimestamp: string;
      hashscanUrl: string;
    };

type MirrorTopicMessage = { message: string; consensus_timestamp: string; sequence_number: number };

/**
 * Independently re-derives an attestation's evidence: fetches the HCS message from the public mirror node,
 * hashes it, and checks both the hash and the report's contents against what the contract recorded.
 * Needs no credentials, so it runs the same in a browser, an API route or an AI agent.
 */
export async function auditAttestation(
  attestation: AttestationView,
  fetchImpl: typeof fetch = fetch,
): Promise<AuditResult> {
  const { id, hcsTopicId, hcsSequence } = attestation;
  if (!hcsTopicId) return { status: "no-anchor", attestationId: id };

  let mirror: MirrorTopicMessage;
  try {
    const response = await fetchImpl(`${MIRROR_NODE_URL}/api/v1/topics/${hcsTopicId}/messages/${hcsSequence}`);
    if (!response.ok) throw new Error(`Mirror node returned ${response.status}`);
    mirror = (await response.json()) as MirrorTopicMessage;
  } catch (error) {
    return { status: "unavailable", attestationId: id, error: (error as Error).message };
  }

  const { text, hash } = hashBase64Message(mirror.message);
  let report: HcsReportMessage | null = null;
  try {
    const parsed = JSON.parse(text) as HcsReportMessage;
    if (parsed.schema === REPORT_SCHEMA) report = parsed;
  } catch {
    report = null;
  }

  const check = (field: string, onChain: string | number, value: string | number | undefined): AuditCheck => ({
    field,
    onChain,
    report: value,
    ok: onChain === value,
  });
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
