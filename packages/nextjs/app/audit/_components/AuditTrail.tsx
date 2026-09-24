"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, NotDeployedNotice, formatPeriod, shortHash } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type AuditCheck, type ReproductionResult, reproduceAttestation } from "~~/services/mrv/audit";
import { hashscan } from "~~/services/mrv/network";
import {
  type AttestationView,
  type RawAttestation,
  type RawRetirement,
  formatMwh,
  toAttestationView,
  toRetirementView,
} from "~~/services/mrv/views";

const PAGE_SIZE = 50n;

const CheckTable = ({ title, checks }: { title: string; checks: AuditCheck[] }) => (
  <>
    <p className="font-semibold m-0 mt-2">{title}</p>
    <table className="table table-xs">
      <tbody>
        {checks.map(check => (
          <tr key={check.field}>
            <td>{check.ok ? "✓" : "✗"}</td>
            <td className="font-medium">{check.field}</td>
            <td className="break-all">{String(check.actual ?? "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
);

const VERDICT: Record<string, { label: string; tone: string }> = {
  reproduced: { label: "✓ reproduced from public data", tone: "badge-success" },
  diverged: { label: "✗ does not reproduce", tone: "badge-error" },
  verified: { label: "✓ report verified", tone: "badge-success" },
  mismatch: { label: "✗ report mismatch", tone: "badge-error" },
};

/** Shows the strongest result available: reproduction when readings are on HCS, otherwise the report audit. */
const EvidenceOutcome = ({ result }: { result: ReproductionResult }) => {
  const { audit } = result;
  if (audit.status === "no-anchor") return <span className="badge badge-ghost">no HCS anchor (local chain)</span>;
  if (audit.status === "unavailable") return <span className="badge badge-warning">mirror node: {audit.error}</span>;

  const verdict = VERDICT[result.status === "no-data" ? audit.status : result.status];
  return (
    <details className="dropdown dropdown-end">
      <summary className={`badge cursor-pointer ${verdict.tone}`}>{verdict.label}</summary>
      <div className="dropdown-content z-10 bg-base-100 border border-base-300 rounded-xl p-3 shadow-lg w-[26rem] text-xs">
        <CheckTable title="Report vs on-chain attestation" checks={audit.checks} />
        {result.status === "no-data" && <p className="m-0 mt-2 text-warning">Readings not re-run: {result.reason}</p>}
        {(result.status === "reproduced" || result.status === "diverged") && (
          <>
            <CheckTable title="Engine re-run on published readings vs report" checks={result.checks} />
            {!result.engineMatches && (
              <p className="m-0 text-warning">Published with a different engine version than this app runs.</p>
            )}
            <ExternalLink href={result.dataHashUrl}>Raw readings on Hashscan</ExternalLink>{" "}
          </>
        )}
        <ExternalLink href={audit.hashscanUrl}>Report on Hashscan</ExternalLink>
      </div>
    </details>
  );
};

const AttestationRow = ({ attestation }: { attestation: AttestationView }) => {
  const [result, setResult] = useState<ReproductionResult | "pending">();

  const check = async () => {
    setResult("pending");
    setResult(await reproduceAttestation(attestation));
  };

  return (
    <tr>
      <td>#{attestation.id}</td>
      <td>{attestation.plantId}</td>
      <td className="text-xs">{formatPeriod(attestation.periodStart, attestation.periodEnd)}</td>
      <td className="text-right">{formatMwh(attestation.unitsMinted)}</td>
      <td className="text-right">{(attestation.trustScoreBps / 100).toFixed(1)}%</td>
      <td className="text-xs">
        {attestation.hcsTopicId ? (
          <ExternalLink href={hashscan.topicMessage(attestation.hcsTopicId, attestation.hcsSequence)}>
            {attestation.hcsTopicId} #{attestation.hcsSequence}
          </ExternalLink>
        ) : (
          <span title={attestation.reportHash}>{shortHash(attestation.reportHash)}</span>
        )}
      </td>
      <td>
        {result === undefined && (
          <button className="btn btn-xs btn-outline" onClick={check}>
            Check evidence
          </button>
        )}
        {result === "pending" && <span className="loading loading-spinner loading-xs" />}
        {result && result !== "pending" && <EvidenceOutcome result={result} />}
      </td>
    </tr>
  );
};

export const AuditTrail = () => {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "HydroREC" });
  const { data: count } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "attestationCount" });
  const start = count && count > PAGE_SIZE ? count - PAGE_SIZE : 0n;
  const { data: page } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "getAttestations",
    args: [start, PAGE_SIZE],
  });
  const { data: retirementCount } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "retirementCount",
  });
  const retirementStart = retirementCount && retirementCount > PAGE_SIZE ? retirementCount - PAGE_SIZE : 0n;
  const { data: retirementPage } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "getRetirements",
    args: [retirementStart, PAGE_SIZE],
  });

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const rawAttestations: readonly RawAttestation[] = page ?? [];
  const attestations = rawAttestations.map((raw, i) => toAttestationView(raw, Number(start) + i)).reverse();
  const rawRetirements: readonly RawRetirement[] = retirementPage ?? [];
  const retirements = rawRetirements.map((raw, i) => toRetirementView(raw, Number(retirementStart) + i)).reverse();

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Attestations ({count?.toString() ?? "…"})</h2>
        {attestations.length === 0 ? (
          <p className="m-0 text-base-content/60">
            No attestations yet. Publish an APPROVED batch from the Verify page or run <code>yarn mrv:attest</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Plant</th>
                  <th>Period</th>
                  <th className="text-right">RECs (MWh)</th>
                  <th className="text-right">Trust</th>
                  <th>HCS report</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map(attestation => (
                  <AttestationRow key={attestation.id} attestation={attestation} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Retirements</h2>
        {retirements.length === 0 ? (
          <p className="m-0 text-base-content/60">No RECs retired yet.</p>
        ) : (
          <ul className="m-0 pl-4 list-disc text-sm">
            {retirements.map(retirement => (
              <li key={retirement.id}>
                {formatMwh(retirement.units)} MWh retired on{" "}
                {new Date(retirement.timestamp * 1_000).toISOString().slice(0, 10)}
                {retirement.beneficiary && <> for “{retirement.beneficiary}”</>} by{" "}
                <span className="font-mono">{shortHash(retirement.account)}</span> ·{" "}
                <Link className="link link-primary" href={`/certificate/${retirement.id}`}>
                  certificate #{retirement.id}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
