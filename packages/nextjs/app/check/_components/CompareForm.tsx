"use client";

import { useState } from "react";

type Result = {
  decision: "MATCH" | "MISMATCH" | "NOT_COMPARABLE";
  oursT: { be: number; pe: number; le: number; er: number };
  theirsT: { be: number; pe: number; le: number; er: number };
  deltaTonnes: number;
  notes: string[];
};

/** Run-of-river 5 MW, 1,000 MWh, EF_CM 0.7. The engine's answer is 679 t. */
const AGREE = {
  field3: "0.8",
  field4: "0.6",
  field5: "0.5",
  field6: "0.5",
  field7: "1000",
  field24: "700",
  field25: "0",
  field26: "21",
  field27: "679",
};

const DISAGREE = { ...AGREE, field24: "710", field27: "689" };

const FIELDS: { key: keyof typeof AGREE; label: string }[] = [
  { key: "field7", label: "Generation, MWh (their EG)" },
  { key: "field3", label: "Operating margin, t/MWh" },
  { key: "field4", label: "Build margin, t/MWh" },
  { key: "field5", label: "Weight on operating margin" },
  { key: "field6", label: "Weight on build margin" },
  { key: "field24", label: "Their baseline, t" },
  { key: "field25", label: "Their project emissions, t" },
  { key: "field26", label: "Their leakage, t" },
  { key: "field27", label: "Their credit, t" },
];

export function CompareForm() {
  const [values, setValues] = useState(AGREE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(next: typeof AGREE) {
    setValues(next);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/methodology/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, field8: 1, field9: 0, field11: 5, field13: 100, field44: 21, field30: 1010 }),
      });
      const body = await response.json();
      if (!response.ok) {
        setResult(null);
        setError(body.error ?? "Could not compare");
        return;
      }
      setResult(body as Result);
    } catch {
      setResult(null);
      setError("Could not reach the compare service");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(AGREE)}>
          Their number matches
        </button>
        <button type="button" className="btn btn-outline" disabled={pending} onClick={() => run(DISAGREE)}>
          Their number is 10 t high
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map(field => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            <input
              className="input input-bordered"
              inputMode="decimal"
              value={values[field.key]}
              onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={() => run(values)}>
        {pending ? "Checking" : "Compare"}
      </button>
      {error && <p className="text-error m-0">{error}</p>}
      {result && (
        <div className="bg-base-100 border border-base-300 rounded-2xl p-4 flex flex-col gap-2">
          <p className="text-xl font-bold m-0">{result.decision.replaceAll("_", " ")}</p>
          <p className="m-0">
            This engine: {result.oursT.er} t. Their figure: {result.theirsT.er} t. Difference: {result.deltaTonnes} t.
          </p>
          <p className="m-0 text-sm text-base-content/70">
            Baseline {result.oursT.be} t, project emissions {result.oursT.pe} t, leakage {result.oursT.le} t. Nothing
            was minted.
          </p>
          {result.notes.length > 0 && (
            <ul className="m-0 pl-5 text-sm">
              {result.notes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
