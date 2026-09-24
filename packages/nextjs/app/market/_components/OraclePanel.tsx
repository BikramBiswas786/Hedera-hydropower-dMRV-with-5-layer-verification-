"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

type Reading = { answer: bigint; updatedAt: bigint; fresh: boolean };

const SOURCE_NAMES = ["none", "Chainlink", "Supra"] as const;

const formatUsd = (answer: bigint) => `$${(Number(answer) / 1e8).toFixed(5)}`;
const minutesAgo = (updatedAt: bigint) => Math.max(0, Math.round((Date.now() / 1_000 - Number(updatedAt)) / 60));

const SourceRow = ({ name, reading, active }: { name: string; reading?: Reading; active: boolean }) => (
  <tr>
    <td className="font-medium">
      {name} {active && <span className="badge badge-primary badge-xs">pricing</span>}
    </td>
    <td className="text-right">{reading && reading.answer > 0n ? formatUsd(reading.answer) : "—"}</td>
    <td className="text-right">
      {!reading || reading.updatedAt === 0n ? (
        <span className="text-error">unavailable</span>
      ) : (
        <span className={reading.fresh ? undefined : "text-error"}>
          {minutesAgo(reading.updatedAt)} min{reading.fresh ? "" : " · stale"}
        </span>
      )}
    </td>
  </tr>
);

/**
 * Shows both oracle sources behind `ResilientHbarUsdFeed` and which one prices purchases right now. When the feed
 * refuses to answer (sources disagree, or neither is fresh) purchases revert, and this panel says why.
 */
export const OraclePanel = () => {
  const { data: sources } = useScaffoldReadContract({
    contractName: "ResilientHbarUsdFeed",
    functionName: "readSources",
  });
  const { data: resolved, error } = useScaffoldReadContract({
    contractName: "ResilientHbarUsdFeed",
    functionName: "resolve",
  });
  const { data: maxDeviation } = useScaffoldReadContract({
    contractName: "ResilientHbarUsdFeed",
    functionName: "MAX_DEVIATION_BPS",
  });

  const [primary, fallback] = (sources ?? []) as Reading[];
  const [answer, source] = (resolved ?? []) as [Reading | undefined, number | undefined];

  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-base-content/60 font-medium">
        HBAR / USD settlement price
      </span>
      <span className="text-2xl font-bold">{answer ? formatUsd(answer.answer) : error ? "paused" : "…"}</span>
      <table className="table table-xs">
        <tbody>
          <SourceRow name="Chainlink (primary)" reading={primary} active={source === 1} />
          <SourceRow name="Supra (fallback)" reading={fallback} active={source === 2} />
        </tbody>
      </table>
      <p className="m-0 text-xs text-base-content/60">
        {error
          ? `Purchases are paused: ${error.message.includes("PriceSourcesDisagree") ? "the oracles disagree" : "no fresh price"}.`
          : `Fresh sources must agree within ${maxDeviation !== undefined ? Number(maxDeviation) / 100 : "…"}%; if one fails the other prices alone.`}{" "}
        Active source: {SOURCE_NAMES[source ?? 0]}.
      </p>
    </div>
  );
};
