import { ENGINE_VERSION, type VerificationReport, verifyReadings } from "./engine";
import type { RegisteredDesign } from "./methodology/project";
import { fetchChunkedMessage, fetchTopicMessage } from "./mirror";
import { hashscan } from "./network";
import {
  type HcsReportMessage,
  LEGACY_REPORT_SCHEMAS,
  REPORT_SCHEMA,
  base64ToBytes,
  decodeMessage,
  parseDataMessage,
} from "./report";
import type { AttestationView } from "./views";
import type { Address, Hex } from "viem";

export type AuditCheck = {
  field: string;
  expected: string | number | null;
  actual: string | number | null | undefined;
  ok: boolean;
};

const check = (
  field: string,
  expected: string | number | null,
  actual: string | number | null | undefined,
): AuditCheck => ({ field, expected, actual, ok: expected === actual });

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
 * it, and checks the hash and every monitored input and computed emission figure against what the contract
 * recorded. Needs no credentials, so it runs the same in a browser, an API route or an AI agent.
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
    const known: string[] = [REPORT_SCHEMA, ...LEGACY_REPORT_SCHEMAS];
    if (known.includes(parsed.schema)) report = parsed;
  } catch {
    report = null;
  }

  const e = report?.emissions;
  const checks = [
    check("reportHash", attestation.reportHash, hash),
    check("decision", "APPROVED", report?.decision),
    check("plantId", attestation.plantId, report?.plantId),
    check("periodStart", attestation.periodStart, report?.periodStart),
    check("periodEnd", attestation.periodEnd, report?.periodEnd),
    check("completenessBps", attestation.completenessBps, report?.completenessBps),
    check("EG_facility (netWh)", attestation.netEnergyWh, report?.monitored.netWh),
    check("TEG (grossWh)", attestation.grossEnergyWh, report?.monitored.grossWh),
    check("FC (fuelG)", attestation.fuelG, report?.monitored.fuelG),
    // From report@4 the contract stores LE_y (monitored + embodied); report@3 had monitored leakage only.
    check("LE (leakageG)", attestation.leakageG, e?.leakageG ?? report?.monitored.leakageG),
    check("EG_PJ (Wh)", attestation.projectEnergyWh, e?.egProjectWh),
    check("BE (g)", attestation.baselineG, e?.baselineG),
    check("PE_HP (g)", attestation.reservoirG, e?.reservoirG),
    check("PE_FF (g)", attestation.fossilFuelG, e?.fossilFuelG),
    check("ER (g)", attestation.reductionG, e?.reductionG),
    check("credits (kg)", attestation.unitsMinted, e?.unitsMinted),
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
 * Re-derives the credits from public data alone: audits the report, fetches the raw readings it commits to from
 * HCS (reassembling chunks), checks their hash, re-runs the deterministic engine on them and compares every
 * figure. When the plant's registered design is supplied it also checks the data message used the on-chain
 * parameters (grid EF, fuel coefficient, baseline, crediting period), so a verifier cannot swap them.
 */
export async function reproduceAttestation(
  attestation: AttestationView,
  fetchImpl: typeof fetch = fetch,
  registered?: RegisteredDesign,
  /** The plant's meter as registered on-chain; checked against the metering record the readings were verified with. */
  registeredMeter?: Address | null,
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

  const recomputed = verifyReadings(
    parsed.readings,
    parsed.plant,
    parsed.metering,
    parsed.ledger,
    parsed.signature,
    parsed.domain,
  );
  const r = recomputed.emissions;
  const e = report.emissions;
  const designChecks = registered
    ? (Object.keys(registered) as (keyof RegisteredDesign)[])
        // registrationRequestedAt is DmrvRegistry-only; data messages published before it do not carry it.
        .filter(key => key !== "registrationRequestedAt" || parsed.plant.design[key] !== undefined)
        .map(key => check(`registered.${key}`, registered[key] ?? null, parsed.plant.design[key] ?? null))
    : [];
  const meterChecks = registeredMeter
    ? [check("registered.meter", registeredMeter.toLowerCase(), parsed.metering.deviceAddress?.toLowerCase() ?? null)]
    : [];
  const checks = [
    dataHashCheck,
    check("plantId", report.plantId, recomputed.plantId),
    check("plantSequence", report.plantSequence, parsed.ledger.attestations),
    check("decision", report.decision, recomputed.decision),
    check("completenessBps", report.completenessBps, recomputed.completenessBps),
    check("periodStart", report.periodStart, recomputed.periodStart),
    check("periodEnd", report.periodEnd, recomputed.periodEnd),
    check("readings", report.readings, recomputed.readingCount),
    check("EG_facility (netWh)", report.monitored.netWh, recomputed.monitored.netWh),
    check("TEG (grossWh)", report.monitored.grossWh, recomputed.monitored.grossWh),
    check("FC (fuelG)", report.monitored.fuelG, recomputed.monitored.fuelG),
    check("EG_PJ (Wh)", e?.egProjectWh ?? null, r?.egProjectWh ?? null),
    check("BE (g)", e?.baselineG ?? null, r?.baselineG ?? null),
    check("PE_HP (g)", e?.reservoirG ?? null, r?.reservoirG ?? null),
    check("PE_FF (g)", e?.fossilFuelG ?? null, r?.fossilFuelG ?? null),
    ...(e?.leakageG === undefined ? [] : [check("LE (g)", e.leakageG, r?.leakageG ?? null)]),
    check("ER (g)", e?.reductionG ?? null, r?.reductionG ?? null),
    check("credits (kg)", e?.unitsMinted ?? null, r?.unitsMinted ?? null),
    check("EF_grid,CM (g/MWh)", report.parameters.efGridGPerMwh, recomputed.parameters.efGridGPerMwh),
    ...designChecks,
    ...meterChecks,
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
