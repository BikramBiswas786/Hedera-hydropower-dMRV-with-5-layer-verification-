"use client";

import { useEffect, useMemo, useState } from "react";
import { PublishPanel } from "./PublishPanel";
import { z } from "zod";
import { ReportView } from "~~/components/hydro/ReportView";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";
import { DEMO_PLANTS } from "~~/services/mrv/demo";
import { prepareAnchors } from "~~/services/mrv/pipeline";
import { SCENARIOS, SCENARIO_NAMES, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";
import { type LedgerJson, type VerifyRequest, verifyRequestSchema } from "~~/services/mrv/schema";
import { type RawPlant, plantIdToBytes32, toPlantView } from "~~/services/mrv/views";

function parseRequest(text: string): { request: VerifyRequest } | { error: string } {
  try {
    const parsed = verifyRequestSchema.safeParse(JSON.parse(text));
    return parsed.success ? { request: parsed.data } : { error: z.prettifyError(parsed.error) };
  } catch (error) {
    return { error: `Invalid JSON: ${(error as Error).message}` };
  }
}

export const VerifyWorkbench = () => {
  const [plantIndex, setPlantIndex] = useState(0);
  const [scenario, setScenario] = useState<ScenarioName>("healthy");
  const [text, setText] = useState("");
  const plant = DEMO_PLANTS[plantIndex];

  // Generated on the client because scenarios end at the current hour, which would differ from the server render.
  useEffect(() => setText(JSON.stringify(generateScenario(scenario, { plant }), null, 2)), [scenario, plant]);

  // Quantify against the plant's on-chain ledger when the registry is deployed, exactly as attesting would.
  const { data: rawPlant } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "getPlant",
    args: [plantIdToBytes32(plant.plantId)],
  });
  const onChain = rawPlant ? toPlantView(plantIdToBytes32(plant.plantId), rawPlant as RawPlant) : null;
  const ledger: LedgerJson | undefined = onChain?.design.capacityKw ? onChain.ledger : undefined;

  const parsed = useMemo(() => (text ? parseRequest(text) : null), [text]);
  const result = useMemo(() => {
    if (!parsed || "error" in parsed) return null;
    try {
      return { request: parsed.request, ...prepareAnchors({ ...parsed.request, ledger }) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [parsed, ledger]);
  const error = parsed && "error" in parsed ? parsed.error : result && "error" in result ? result.error : null;
  const ready = result && !("error" in result) ? result : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 flex flex-col gap-3">
        <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-lg m-0">1. Monitoring data</h2>
          <label className="flex flex-col gap-1 text-sm">
            Plant
            <select
              className="select select-bordered select-sm"
              value={plantIndex}
              onChange={event => setPlantIndex(Number(event.target.value))}
            >
              {DEMO_PLANTS.map((p, i) => (
                <option key={p.plantId} value={i}>
                  {p.plantId} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sample scenario">
            {SCENARIO_NAMES.map(name => (
              <button
                key={name}
                role="radio"
                aria-checked={scenario === name}
                className={`btn btn-xs ${scenario === name ? "btn-primary" : "btn-outline"}`}
                onClick={() => setScenario(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="text-sm text-base-content/70 m-0">{SCENARIOS[scenario]}</p>
          <p className="text-xs text-base-content/60 m-0">
            {plant.methodology} · {plant.design.capacityKw.toLocaleString()} kW · EF_grid,CM{" "}
            {(plant.design.efGridGPerMwh / 1e6).toFixed(4)} t/MWh (TOOL07) ·{" "}
            {ledger
              ? `quantified against the on-chain ledger (${ledger.attestations} attestation${ledger.attestations === 1 ? "" : "s"})`
              : "empty ledger (registry not deployed on this network)"}
            . Edit the JSON (readings, meter calibration, plant design) to see each stage react.
          </p>
          <textarea
            aria-label="Verification request JSON"
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
          <h2 className="font-semibold text-lg mt-0 mb-4">2. Verification & quantification</h2>
          {ready ? (
            <ReportView report={ready.report} />
          ) : (
            <p className="m-0 text-base-content/60">No valid monitoring data yet.</p>
          )}
        </div>

        {ready && (
          <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-lg m-0">3. HCS anchors</h2>
            <p className="text-sm text-base-content/70 m-0">
              Publishing writes two messages to the audit topic. First the raw readings, plant profile, metering and
              ledger ({ready.data.chunks} HCS chunk{ready.data.chunks === 1 ? "" : "s"}), so anyone can re-run this
              quantification; then this report, which commits to them by hash and sequence number. The report&apos;s
              SHA-256 becomes the attestation&apos;s <code>reportHash</code>, and the contract recomputes every figure
              in it.
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
            <PublishPanel request={ready.request} decision={ready.report.decision} />
          </div>
        )}
      </section>
    </div>
  );
};
