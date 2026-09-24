"use client";

import { useState } from "react";
import { ExternalLink, NotDeployedNotice, formatPeriod, shortHash } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type AuditResult, auditAttestation } from "~~/services/mrv/audit";
import { hashscan } from "~~/services/mrv/network";
import { type AttestationView, type RawAttestation, formatMwh, toAttestationView } from "~~/services/mrv/views";

const PAGE_SIZE = 50n;

const AuditOutcome = ({ result }: { result: AuditResult }) => {
  if (result.status === "no-anchor") return <span className="badge badge-ghost">no HCS anchor (local chain)</span>;
  if (result.status === "unavailable") return <span className="badge badge-warning">mirror node: {result.error}</span>;
  return (
    <details className="dropdown dropdown-end">
      <summary className={`badge cursor-pointer ${result.status === "verified" ? "badge-success" : "badge-error"}`}>
        {result.status === "verified" ? "✓ verified" : "✗ mismatch"}
      </summary>
      <div className="dropdown-content z-10 bg-base-100 border border-base-300 rounded-xl p-3 shadow-lg w-96 text-xs">
        <table className="table table-xs">
          <tbody>
            {result.checks.map(check => (
              <tr key={check.field}>
                <td>{check.ok ? "✓" : "✗"}</td>
                <td className="font-medium">{check.field}</td>
                <td className="break-all">{String(check.report ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ExternalLink href={result.hashscanUrl}>HCS message on Hashscan</ExternalLink>
      </div>
    </details>
  );
};

const AttestationRow = ({ attestation }: { attestation: AttestationView }) => {
  const [result, setResult] = useState<AuditResult | "pending">();

  const audit = async () => {
    setResult("pending");
    setResult(await auditAttestation(attestation));
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
          <button className="btn btn-xs btn-outline" onClick={audit}>
            Audit
          </button>
        )}
        {result === "pending" && <span className="loading loading-spinner loading-xs" />}
        {result && result !== "pending" && <AuditOutcome result={result} />}
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
  const retirements = [...(retirementPage ?? [])].reverse();

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
            {retirements.map((retirement, i) => (
              <li key={i}>
                {formatMwh(retirement.units)} MWh retired on{" "}
                {new Date(Number(retirement.timestamp) * 1_000).toISOString().slice(0, 10)}
                {retirement.beneficiary && <> for “{retirement.beneficiary}”</>} by{" "}
                <span className="font-mono">{shortHash(retirement.account)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
