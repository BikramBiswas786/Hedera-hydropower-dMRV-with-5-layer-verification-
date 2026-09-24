"use client";

import { useEffect, useMemo, useState } from "react";
import { PublishPanel } from "./PublishPanel";
import { z } from "zod";
import { ReportView } from "~~/components/hydro/ReportView";
import { prepareAnchors } from "~~/services/mrv/pipeline";
import { DEMO_PLANT, SCENARIOS, SCENARIO_NAMES, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";
import { type Reading, readingSchema } from "~~/services/mrv/schema";

const readingsSchema = z.array(readingSchema).min(1);

function parseReadings(text: string): { readings: Reading[] } | { error: string } {
  try {
    const parsed = readingsSchema.safeParse(JSON.parse(text));
    return parsed.success ? { readings: parsed.data } : { error: z.prettifyError(parsed.error) };
  } catch (error) {
    return { error: `Invalid JSON: ${(error as Error).message}` };
  }
}

export const VerifyWorkbench = () => {
  const [scenario, setScenario] = useState<ScenarioName>("healthy");
  const [text, setText] = useState("");

  // Generated on the client because scenarios end at the current hour, which would differ from the server render.
  useEffect(() => setText(JSON.stringify(generateScenario(scenario), null, 2)), [scenario]);

  const parsed = useMemo(() => (text ? parseReadings(text) : null), [text]);
  const result = useMemo(() => {
    if (!parsed || "error" in parsed) return null;
    try {
      return { readings: parsed.readings, ...prepareAnchors({ readings: parsed.readings, plant: DEMO_PLANT }) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [parsed]);
  const error = parsed && "error" in parsed ? parsed.error : result && "error" in result ? result.error : null;
  const ready = result && !("error" in result) ? result : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 flex flex-col gap-3">
        <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-lg m-0">1. Telemetry</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sample scenario">
            {SCENARIO_NAMES.map(name => (
              <button
                key={name}
                role="radio"
                aria-checked={scenario === name}
                className={`btn btn-sm ${scenario === name ? "btn-primary" : "btn-outline"}`}
                onClick={() => setScenario(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="text-sm text-base-content/70 m-0">{SCENARIOS[scenario]}</p>
          <p className="text-xs text-base-content/60 m-0">
            Plant {DEMO_PLANT.plantId}: {DEMO_PLANT.capacityKw} kW, design flow ≤ {DEMO_PLANT.maxFlowM3s} m³/s, head ≤{" "}
            {DEMO_PLANT.maxHeadM} m. Edit the readings to see each layer react.
          </p>
          <textarea
            aria-label="Readings JSON"
            className="textarea textarea-bordered font-mono text-xs h-[28rem] w-full rounded-xl"
            spellCheck={false}
            value={text}
            onChange={event => setText(event.target.value)}
          />
          {error && (
            <pre className="text-error text-xs whitespace-pre-wrap m-0" role="alert">
              {error}
            </pre>
          )}
        </div>
      </section>

      <section className="lg:col-span-3 flex flex-col gap-6">
        <div className="bg-base-100 border border-base-300 rounded-2xl p-5">
          <h2 className="font-semibold text-lg mt-0 mb-4">2. Verification report</h2>
          {ready ? (
            <ReportView report={ready.report} />
          ) : (
            <p className="m-0 text-base-content/60">No valid readings yet.</p>
          )}
        </div>

        {ready && (
          <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-lg m-0">3. HCS anchors</h2>
            <p className="text-sm text-base-content/70 m-0">
              Publishing writes two messages to the audit topic. First the raw readings and plant profile (
              {ready.data.chunks} HCS chunk{ready.data.chunks === 1 ? "" : "s"}), so anyone can re-run this
              verification; then this report, which commits to them by hash and sequence number. The report&apos;s
              SHA-256 becomes the attestation&apos;s <code>reportHash</code> on-chain.
            </p>
            <pre className="bg-base-200 rounded-xl p-3 text-xs overflow-x-auto m-0">
              {JSON.stringify(ready.preview.body, null, 2)}
            </pre>
            <p className="text-xs font-mono break-all m-0">
              dataHash: {ready.data.dataHash}
              <br />
              reportHash: {ready.preview.reportHash}{" "}
              <span className="text-base-content/60">(before data.sequence is known)</span>
            </p>
            <PublishPanel readings={ready.readings} decision={ready.report.decision} />
          </div>
        )}
      </section>
    </div>
  );
};
