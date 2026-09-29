"use client";

import { useEffect, useMemo, useState } from "react";
import { EngineReportView } from "~~/components/hydro/EngineReportView";
import { ENGINES, type EngineReport, verifyWithEngine } from "~~/services/mrv/engines";

const OTHER_ENGINES = ENGINES.filter(engine => engine.id !== "hydro-vmr0017");

/** Runs any non-hydro methodology engine in the browser on its example period, editable as JSON. */
export const EngineWorkbench = () => {
  const [engineId, setEngineId] = useState<string>(OTHER_ENGINES[0].id);
  const [text, setText] = useState("");
  const engine = OTHER_ENGINES.find(e => e.id === engineId) ?? OTHER_ENGINES[0];

  // Generated on the client: the example ends at the current hour.
  useEffect(() => setText(JSON.stringify(engine.example(new Date()), null, 2)), [engine]);

  const result = useMemo((): { report: EngineReport } | { error: string } | null => {
    if (!text) return null;
    try {
      const report = verifyWithEngine(engine.id, JSON.parse(text));
      return report ? { report } : { error: `Unknown engine ${engine.id}` };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [engine, text]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Engine
          <select
            className="select select-bordered select-sm"
            value={engineId}
            onChange={e => setEngineId(e.target.value)}
          >
            {OTHER_ENGINES.map(e => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.id})
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm m-0 text-base-content/70">
          {engine.scope}. Implements {engine.documents.join(", ")}; recomputed on-chain by{" "}
          <code>{engine.contract}</code>.
        </p>
        <details className="collapse collapse-arrow bg-base-200">
          <summary className="collapse-title text-sm font-medium min-h-0 py-3">Edit the monitoring period</summary>
          <div className="collapse-content">
            <textarea
              aria-label="Engine input JSON"
              className="textarea textarea-bordered font-mono text-xs h-72 w-full rounded-xl"
              spellCheck={false}
              value={text}
              onChange={event => setText(event.target.value)}
            />
          </div>
        </details>
      </section>
      <section className="lg:col-span-3 bg-base-100 border border-base-300 rounded-2xl p-5">
        {result && "report" in result ? (
          <EngineReportView report={result.report} />
        ) : (
          <pre className="text-error text-xs whitespace-pre-wrap m-0" role="alert">
            {result?.error ?? ""}
          </pre>
        )}
      </section>
    </div>
  );
};
