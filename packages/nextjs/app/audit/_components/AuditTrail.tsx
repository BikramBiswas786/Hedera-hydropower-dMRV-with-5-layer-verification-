"use client";

import { useState } from "react";
import Link from "next/link";
import { type Hex, zeroHash } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { ExternalLink, NotDeployedNotice, formatPeriod, shortHash } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type AuditCheck, type ReproductionResult, reproduceAttestation } from "~~/services/mrv/audit";
import { hashscan } from "~~/services/mrv/network";
import {
  type AttestationView,
  type IssuanceView,
  type PlantView,
  type RawDmrvAttestation,
  type RawIssuance,
  type RawProject,
  type RawRetirement,
  closureOf,
  formatGramsAsTonnes,
  formatTonnes,
  formatWhAsMwh,
  plantIdToBytes32,
  shortHashOr,
  toDmrvAttestationView,
  toIssuanceView,
  toProjectView,
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
            <td className="break-all">{shortHashOr(check.actual)}</td>
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
      <div className="dropdown-content z-10 bg-base-100 border border-base-300 rounded-xl p-3 shadow-lg w-[28rem] text-xs max-h-[32rem] overflow-y-auto">
        <CheckTable title="HCS report vs contract" checks={audit.checks} />
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

type ReadDesign = (plantId: string) => Promise<Pick<PlantView, "design" | "meter"> | undefined>;
/** Chain head before a record: zero for a project's first record, else the previous record's chainHash. */
type ReadPreviousHash = (record: AttestationView) => Promise<Hex | undefined>;

const STATUS: Record<AttestationView["status"], { label: string; tone: string }> = {
  monitored: { label: "monitored, awaiting VVB", tone: "badge-warning" },
  issued: { label: "verified, issued", tone: "badge-success" },
  rejected: { label: "rejected by VVB", tone: "badge-error" },
};

const AttestationRow = ({
  attestation,
  readDesign,
  readPreviousHash,
}: {
  attestation: AttestationView;
  readDesign: ReadDesign;
  readPreviousHash: ReadPreviousHash;
}) => {
  const [result, setResult] = useState<ReproductionResult | "pending">();
  const status = STATUS[attestation.status];

  const check = async () => {
    setResult("pending");
    // Also proves the published data used the plant's registered EF, fuel coefficient, baseline and meter, and that
    // the readings are the ones whose meter statement sits in the on-chain record chain.
    const [plant, previous] = await Promise.all([readDesign(attestation.plantId), readPreviousHash(attestation)]);
    setResult(await reproduceAttestation(attestation, fetch, plant?.design, plant?.meter, previous));
  };

  return (
    <tr>
      <td>#{attestation.id}</td>
      <td>
        {attestation.plantId} <span className="text-base-content/60">record {attestation.sequence}</span>
      </td>
      <td className="text-xs">{formatPeriod(attestation.periodStart, attestation.periodEnd)}</td>
      <td className="text-right">{formatWhAsMwh(attestation.projectEnergyWh)}</td>
      <td className="text-right">{formatGramsAsTonnes(attestation.reductionG)}</td>
      <td>
        <span className={`badge badge-sm ${status.tone}`}>{status.label}</span>
        {attestation.issuanceId !== null && (
          <span className="text-xs text-base-content/60"> verification #{attestation.issuanceId}</span>
        )}
      </td>
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
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "DmrvRegistry" });
  const { data: count } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "attestationCount",
  });
  const start = count && count > PAGE_SIZE ? count - PAGE_SIZE : 0n;
  const { data: page } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "getAttestations",
    args: [start, PAGE_SIZE],
  });
  const { data: auditTopic } = useScaffoldReadContract({ contractName: "DmrvRegistry", functionName: "auditTopic" });
  const { data: issuanceCount } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "issuanceCount",
  });
  const { data: retirementCount } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "retirementCount",
  });
  const retirementStart = retirementCount && retirementCount > PAGE_SIZE ? retirementCount - PAGE_SIZE : 0n;
  const read = deployment ? { address: deployment.address, abi: deployment.abi } : undefined;
  // The registry returns one issuance or retirement per call; batch them.
  const { data: issuanceResults } = useReadContracts({
    contracts: read
      ? Array.from({ length: Number(issuanceCount ?? 0n) }, (_, i) => ({
          ...read,
          functionName: "getIssuance" as const,
          args: [BigInt(i)] as const,
          chainId: targetNetwork.id,
        }))
      : [],
  });
  const { data: retirementResults } = useReadContracts({
    contracts: read
      ? Array.from({ length: Number((retirementCount ?? 0n) - retirementStart) }, (_, i) => ({
          ...read,
          functionName: "getRetirement" as const,
          args: [retirementStart + BigInt(i)] as const,
          chainId: targetNetwork.id,
        }))
      : [],
  });

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const readDesign: ReadDesign = async plantId => {
    if (!deployment || !publicClient) return undefined;
    const id = plantIdToBytes32(plantId);
    const raw = await publicClient.readContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "getProject",
      args: [id],
    });
    return toProjectView(id, raw as RawProject);
  };

  const topic = auditTopic ?? 0n;
  const issuances: IssuanceView[] = (issuanceResults ?? []).flatMap((r, i) =>
    r.status === "success" ? [toIssuanceView(r.result as RawIssuance, i, topic)] : [],
  );
  const closure = closureOf(issuances);
  const rawAttestations: readonly RawDmrvAttestation[] = page ?? [];
  const attestations = rawAttestations
    .map((raw, i) => toDmrvAttestationView(raw, Number(start) + i, topic, closure))
    .reverse();
  const retirements = (retirementResults ?? [])
    .flatMap((r, i) =>
      r.status === "success" ? [toRetirementView(r.result as RawRetirement, Number(retirementStart) + i)] : [],
    )
    .reverse();

  const readPreviousHash: ReadPreviousHash = async record => {
    if (record.sequence === 0) return zeroHash;
    const loaded = attestations.find(a => a.plantId === record.plantId && a.sequence === record.sequence - 1);
    if (loaded) return loaded.chainHash;
    // Outside the loaded page: scan back for the project's previous record.
    if (!deployment || !publicClient) return undefined;
    const earlier = (await publicClient.readContract({
      address: deployment.address,
      abi: deployment.abi,
      functionName: "getAttestations",
      args: [0n, BigInt(record.id)],
    })) as readonly RawDmrvAttestation[];
    const previous = [...earlier]
      .reverse()
      .find(raw => raw.sequence === record.sequence - 1 && raw.projectId === plantIdToBytes32(record.plantId));
    return previous?.chainHash;
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Monitoring records ({count?.toString() ?? "…"})</h2>
        <p className="mt-0 text-sm text-base-content/70">
          Each record is one meter-signed period the methodology module quantified on-chain. A record issues nothing:
          credits exist only after an accredited VVB verifies a run of records (below).
        </p>
        {attestations.length === 0 ? (
          <p className="m-0 text-base-content/60">
            No records yet. Record an APPROVED period from the Verify page or run <code>yarn mrv:record</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Plant</th>
                  <th>Period</th>
                  <th className="text-right">EG_PJ (MWh)</th>
                  <th className="text-right">ER (t CO₂e)</th>
                  <th>Status</th>
                  <th>HCS report</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map(attestation => (
                  <AttestationRow
                    key={attestation.id}
                    attestation={attestation}
                    readDesign={readDesign}
                    readPreviousHash={readPreviousHash}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Verifications ({issuanceCount?.toString() ?? "…"})</h2>
        {issuances.length === 0 ? (
          <p className="m-0 text-base-content/60">
            No verifications yet. A VVB verifies pending records with <code>yarn mrv:verify</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Plant · records</th>
                  <th>Decision</th>
                  <th className="text-right">Monitored ER (t)</th>
                  <th className="text-right">VVB deduction (t)</th>
                  <th className="text-right">Issued (t)</th>
                  <th>VVB</th>
                  <th>Verification report</th>
                </tr>
              </thead>
              <tbody>
                {[...issuances].reverse().map(issuance => (
                  <tr key={issuance.id}>
                    <td>#{issuance.id}</td>
                    <td>
                      {issuance.plantId} · {issuance.firstRecord}–{issuance.lastRecord}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${issuance.decision === 1 ? "badge-success" : "badge-error"}`}>
                        {issuance.decision === 1 ? "approved" : "rejected"}
                      </span>
                    </td>
                    <td className="text-right">{formatGramsAsTonnes(issuance.monitoredG)}</td>
                    <td className="text-right">{formatGramsAsTonnes(issuance.deductionG)}</td>
                    <td className="text-right">{formatTonnes(issuance.unitsIssued)}</td>
                    <td className="font-mono text-xs" title={issuance.verifier}>
                      {shortHash(issuance.verifier)}
                    </td>
                    <td className="text-xs">
                      {issuance.hcsTopicId ? (
                        <ExternalLink href={hashscan.topicMessage(issuance.hcsTopicId, issuance.hcsSequence)}>
                          {issuance.hcsTopicId} #{issuance.hcsSequence}
                        </ExternalLink>
                      ) : (
                        shortHash(issuance.reportHash)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Retirements</h2>
        {retirements.length === 0 ? (
          <p className="m-0 text-base-content/60">No credits retired yet.</p>
        ) : (
          <ul className="m-0 pl-4 list-disc text-sm">
            {retirements.map(retirement => (
              <li key={retirement.id}>
                {formatTonnes(retirement.units)} t CO₂e retired on{" "}
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
