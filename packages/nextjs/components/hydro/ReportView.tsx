import { DecisionBadge, ScoreBar, formatPeriod } from "./ui";
import type { VerificationReport } from "~~/services/mrv/engine";

const LAYER_LABEL: Record<string, string> = {
  physics: "Physics (ρ·g·Q·H·η)",
  temporal: "Temporal continuity",
  environmental: "Environmental bounds",
  statistical: "Statistical outliers",
  device: "Device envelope",
};

export const ReportView = ({ report }: { report: VerificationReport }) => {
  const failing = report.issues.filter(issue => issue.severity === "fail");
  const warnings = report.issues.filter(issue => issue.severity === "warn");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-6">
        <div
          className="radial-progress text-primary font-bold"
          style={{ "--value": Math.round(report.trustScore * 100), "--size": "6rem" } as React.CSSProperties}
          role="progressbar"
          aria-label="Trust score"
        >
          {(report.trustScore * 100).toFixed(1)}%
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <DecisionBadge decision={report.decision} />
            <span className="text-sm text-base-content/60">{report.engine}</span>
          </div>
          <p className="m-0">{report.reasoning}</p>
          <p className="m-0 text-sm text-base-content/60">
            {report.readingCount} intervals · {(report.energyWh / 1_000_000).toFixed(3)} MWh ·{" "}
            {formatPeriod(report.periodStart, report.periodEnd)} · ≈{report.carbon.emissionReductionTco2.toFixed(3)}{" "}
            tCO₂e avoided
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Layer</th>
              <th className="w-16">Weight</th>
              <th className="w-40">Score</th>
              <th>Finding</th>
            </tr>
          </thead>
          <tbody>
            {report.layers.map(layer => (
              <tr key={layer.layer}>
                <td className="font-medium">{LAYER_LABEL[layer.layer]}</td>
                <td>{layer.weight * 100}%</td>
                <td>
                  <div className="flex items-center gap-2">
                    <ScoreBar score={layer.score} />
                    <span className="text-xs w-10 text-right">{(layer.score * 100).toFixed(0)}</span>
                  </div>
                </td>
                <td className="text-sm text-base-content/70">{layer.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.hardFailures.length > 0 && (
        <div role="alert" className="alert alert-error">
          <ul className="m-0 list-disc pl-4">
            {report.hardFailures.map(failure => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      )}

      {(failing.length > 0 || warnings.length > 0) && (
        <details className="collapse collapse-arrow bg-base-200">
          <summary className="collapse-title font-medium">
            {failing.length} failed and {warnings.length} warning interval checks
          </summary>
          <div className="collapse-content">
            <ul className="text-sm m-0 pl-4 list-disc">
              {[...failing, ...warnings].map((issue, i) => (
                <li key={i}>
                  <span className={issue.severity === "fail" ? "text-error" : "text-warning"}>{issue.layer}</span>
                  {issue.reading !== null && ` · interval #${issue.reading}`}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
};
