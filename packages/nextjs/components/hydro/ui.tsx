import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { Decision } from "~~/services/mrv/engine";

export const StatCard = ({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) => (
  <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-1">
    <span className="text-xs uppercase tracking-wider text-base-content/60 font-medium">{label}</span>
    <span className="text-2xl font-bold">{value}</span>
    {hint && <span className="text-xs text-base-content/60">{hint}</span>}
  </div>
);

const DECISION_STYLE: Record<Decision, string> = {
  APPROVED: "badge-success",
  FLAGGED: "badge-warning",
  REJECTED: "badge-error",
};

export const DecisionBadge = ({ decision }: { decision: Decision }) => (
  <span className={`badge ${DECISION_STYLE[decision]} font-semibold`}>{decision}</span>
);

export const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="link link-primary inline-flex items-center gap-1">
    {children}
    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
  </a>
);

export const ScoreBar = ({ score }: { score: number }) => {
  const tone = score >= 0.85 ? "progress-success" : score >= 0.5 ? "progress-warning" : "progress-error";
  return <progress className={`progress ${tone} w-full`} value={Math.round(score * 100)} max={100} />;
};

export const PageHeader = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="max-w-3xl">
    <h1 className="text-3xl font-bold">{title}</h1>
    <div className="text-base-content/70">{children}</div>
  </div>
);

export const NotDeployedNotice = ({ networkName }: { networkName: string }) => (
  <div role="alert" className="alert alert-info">
    <div>
      <p className="font-semibold m-0">HydroREC is not deployed on {networkName} yet.</p>
      <p className="m-0 text-sm">
        Deploy it with <code>yarn deploy --network hederaTestnet</code>, or follow the README to run it on a local
        chain. The{" "}
        <Link href="/verify" className="link">
          verifier
        </Link>{" "}
        works without any deployment.
      </p>
    </div>
  </div>
);

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

export const formatPeriod = (start: number, end: number) => {
  const fmt = (s: number) => new Date(s * 1_000).toISOString().replace("T", " ").slice(0, 16);
  return `${fmt(start)} → ${fmt(end)} UTC`;
};
