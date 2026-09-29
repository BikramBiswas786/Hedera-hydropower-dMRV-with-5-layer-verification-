import { MonitoringTable } from "./MonitoringTable";
import { DecisionBadge } from "./ui";
import type { EngineReport } from "~~/services/mrv/engines/types";

const STAGE_STYLE = { PASS: "badge-success", REVIEW: "badge-warning", FAIL: "badge-error" } as const;
const SEVERITY_STYLE = { reject: "text-error", review: "text-warning", info: "text-base-content/60" } as const;

/** Any methodology engine's report: decision, stages and findings with clauses, the data and parameters table. */
export const EngineReportView = ({ report }: { report: EngineReport }) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <DecisionBadge decision={report.decision} />
      <span className="badge badge-outline">{report.methodology}</span>
      <span className="text-xs text-base-content/60">{report.engine}</span>
    </div>
    <p className="m-0">{report.reasoning}</p>
    <div className="rounded-xl p-3 bg-primary text-primary-content w-fit">
      <p className="m-0 text-xs uppercase tracking-wider opacity-70">ER = BE − PE − LE</p>
      <p className="m-0 text-2xl font-bold">
        {report.reductionG === null ? "—" : (report.reductionG / 1e6).toFixed(3)}{" "}
        <span className="text-xs">t CO₂e</span>
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="table table-sm">
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
              <td className="text-xs text-base-content/60">{stage.clause}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <MonitoringTable monitoring={report.monitoring} />
    {report.findings.length > 0 && (
      <ul className="text-sm m-0 pl-4 list-disc">
        {report.findings.map((f, i) => (
          <li key={i}>
            <span className={SEVERITY_STYLE[f.severity]}>{f.stage}</span>
            {f.reading !== null && ` · interval #${f.reading}`}: {f.message}{" "}
            <span className="text-xs text-base-content/60">({f.clause})</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
