import { DecisionBadge, formatPeriod } from "./ui";
import type { StageResult, VerificationReport } from "~~/services/mrv/engine";
import { formatGramsAsTonnes, formatWhAsMwh } from "~~/services/mrv/views";

const STAGE_STYLE: Record<StageResult["status"], string> = {
  PASS: "badge-success",
  REVIEW: "badge-warning",
  FAIL: "badge-error",
};

const SEVERITY_STYLE = { reject: "text-error", review: "text-warning", info: "text-base-content/60" } as const;

const Figure = ({ label, value, unit, strong }: { label: string; value: string; unit: string; strong?: boolean }) => (
  <div className={`rounded-xl p-3 ${strong ? "bg-primary text-primary-content" : "bg-base-200"}`}>
    <p className="m-0 text-xs uppercase tracking-wider opacity-70">{label}</p>
    <p className={`m-0 font-bold ${strong ? "text-2xl" : "text-lg"}`}>
      {value} <span className="text-xs font-normal">{unit}</span>
    </p>
  </div>
);

export const ReportView = ({ report }: { report: VerificationReport }) => {
  const { emissions, monitored } = report;
  const deductions = Object.entries(monitored.deductions).filter(([, wh]) => wh > 0);
  const findings = [...report.issues].sort(
    (a, b) => ["reject", "review", "info"].indexOf(a.severity) - ["reject", "review", "info"].indexOf(b.severity),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={report.decision} />
          <span className="badge badge-outline">{report.methodology}</span>
          <span className="text-xs text-base-content/60">{report.engine}</span>
        </div>
        <p className="m-0">{report.reasoning}</p>
        <p className="m-0 text-sm text-base-content/60">
          {report.readingCount} intervals · {(report.completenessBps / 100).toFixed(1)}% coverage ·{" "}
          {formatPeriod(report.periodStart, report.periodEnd)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Figure
          label="ER = BE − PE − LE"
          value={emissions ? formatGramsAsTonnes(emissions.reductionG) : "—"}
          unit="t CO₂e"
          strong
        />
        <Figure label="BE" value={emissions ? formatGramsAsTonnes(emissions.baselineG) : "—"} unit="t CO₂e" />
        <Figure label="PE" value={emissions ? formatGramsAsTonnes(emissions.projectG) : "—"} unit="t CO₂e" />
        <Figure label="LE" value={emissions ? formatGramsAsTonnes(emissions.leakageG) : "—"} unit="t CO₂e" />
        <Figure label="EG_facility (net)" value={formatWhAsMwh(monitored.netWh)} unit="MWh" />
        <Figure label="EG_PJ" value={emissions ? formatWhAsMwh(emissions.egProjectWh) : "—"} unit="MWh" />
        <Figure label="EF_grid,CM" value={(report.parameters.efGridGPerMwh / 1e6).toFixed(6)} unit="t/MWh" />
        <Figure
          label="Credits minted"
          value={emissions ? (emissions.unitsMinted / 1_000).toLocaleString("en-US") : "—"}
          unit="t"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Stage</th>
              <th className="w-24">Status</th>
              <th>Finding</th>
            </tr>
          </thead>
          <tbody>
            {report.stages.map((stage, i) => (
              <tr key={stage.stage}>
                <td className="font-medium whitespace-nowrap">
                  {i + 1}. {stage.title}
                </td>
                <td>
                  <span className={`badge badge-sm ${STAGE_STYLE[stage.status]}`}>{stage.status}</span>
                </td>
                <td className="text-sm text-base-content/70">{stage.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="collapse collapse-arrow bg-base-200" open>
        <summary className="collapse-title font-medium">Equation trace</summary>
        <div className="collapse-content overflow-x-auto">
          <table className="table table-xs">
            <tbody>
              {report.equations.map(step => (
                <tr key={step.symbol}>
                  <td className="font-mono font-semibold whitespace-nowrap">{step.symbol}</td>
                  <td className="text-base-content/70">{step.expression}</td>
                  <td className="text-right font-mono whitespace-nowrap">
                    {step.value.toLocaleString("en-US", { maximumFractionDigits: 6 })} {step.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-base-content/60 m-0 mt-2">
            Integers in the report (Wh, g) are what the contract recomputes: BE rounds down, PE rounds up, sub-kg
            remainders and deficits carry to the next period.
          </p>
        </div>
      </details>

      {deductions.length > 0 && (
        <div role="note" className="alert alert-info text-sm">
          <span>
            Conservative QA/QC deductions from metered export:{" "}
            {deductions.map(([reason, wh]) => `${reason.replace(/Wh$/, "")} ${(wh / 1_000).toFixed(1)} kWh`).join(", ")}
          </span>
        </div>
      )}

      {findings.length > 0 && (
        <details className="collapse collapse-arrow bg-base-200">
          <summary className="collapse-title font-medium">
            {findings.filter(f => f.severity === "reject").length} rejecting,{" "}
            {findings.filter(f => f.severity === "review").length} for review,{" "}
            {findings.filter(f => f.severity === "info").length} informational
          </summary>
          <div className="collapse-content">
            <ul className="text-sm m-0 pl-4 list-disc">
              {findings.map((issue, i) => (
                <li key={i}>
                  <span className={SEVERITY_STYLE[issue.severity]}>{issue.stage}</span>
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
