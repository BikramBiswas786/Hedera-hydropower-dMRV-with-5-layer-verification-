import type { MonitoringParameter, MonitoringReport } from "~~/services/mrv/engines/types";

const GROUPS: { kind: MonitoringParameter["kind"]; title: string }[] = [
  { kind: "validation", title: "Fixed at validation" },
  { kind: "monitored", title: "Monitored" },
  { kind: "calculated", title: "Calculated" },
];

const format = (value: MonitoringParameter["value"]) =>
  value === null
    ? "n/a"
    : typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 6 })
      : value;

/** A period as the methodology's data and parameters tables: value, source, QA/QC, equation and clause per row. */
export const MonitoringTable = ({ monitoring }: { monitoring: MonitoringReport }) => (
  <div className="flex flex-col gap-3">
    <p className="m-0 text-sm text-base-content/70">
      {monitoring.methodology}. Documents cited: {monitoring.documents.join(", ")}.
    </p>
    {GROUPS.map(({ kind, title }) => (
      <div key={kind} className="overflow-x-auto">
        <p className="m-0 mb-1 text-xs uppercase tracking-wider text-base-content/60">{title}</p>
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Parameter</th>
              <th className="text-right">Value</th>
              <th>Source · QA/QC · clause</th>
            </tr>
          </thead>
          <tbody>
            {monitoring.parameters
              .filter(p => p.kind === kind)
              .map(p => (
                <tr key={p.symbol}>
                  <td className="align-top">
                    <span className="font-mono font-semibold whitespace-nowrap">{p.symbol}</span>
                    {p.equation && <span className="font-mono text-base-content/60"> eq. {p.equation}</span>}
                    <br />
                    <span className="text-base-content/60">{p.description}</span>
                  </td>
                  <td className="align-top text-right font-mono whitespace-nowrap">
                    {format(p.value)} {p.value === null ? "" : p.unit}
                  </td>
                  <td className="align-top text-base-content/70">
                    {p.source}
                    {p.frequency && <span className="block">Frequency: {p.frequency}</span>}
                    {p.qaqc && <span className="block">QA/QC: {p.qaqc}</span>}
                    <span className="block font-medium text-base-content">{p.clause}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    ))}
    {monitoring.notApplied.length > 0 && (
      <p className="m-0 text-xs text-base-content/60">
        Not applicable to this project:{" "}
        {monitoring.notApplied.map(n => `${n.symbol} (${n.reason}; ${n.clause})`).join(" · ")}
      </p>
    )}
  </div>
);
