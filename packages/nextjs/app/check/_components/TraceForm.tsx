"use client";

import { useState } from "react";
import type { GuardianTrace } from "~~/services/mrv/guardian/trace";

/**
 * Real Guardian mints on Hedera testnet. The first is backed end to end; the iRec runs were pinned where no public
 * gateway can read them, so their signature check is incomplete.
 */
const EXAMPLES = [
  { label: "Managed Guardian mint 0.0.10760359 (12.5 t)", ref: "0.0.10238177-1790602426-400520522" },
  { label: "iRec NFT 0.0.10753268 #10", ref: "nft:0.0.10753268:10" },
  { label: "iRec NFT 0.0.10738782 #1", ref: "nft:0.0.10738782:1" },
];

const MARK = { true: "✓", false: "✗", null: "?" } as const;
const TONE = { backed: "text-success", "not-backed": "text-error", incomplete: "text-warning" } as const;

export function TraceForm() {
  const [ref, setRef] = useState(EXAMPLES[0].ref);
  const [trace, setTrace] = useState<GuardianTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(next: string) {
    setRef(next);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/guardian/v1/trace?ref=${encodeURIComponent(next)}`);
      const body = await response.json();
      if (!response.ok) {
        setTrace(null);
        setError(body.error ?? "Could not trace");
        return;
      }
      setTrace(body as GuardianTrace);
    } catch {
      setTrace(null);
      setError("Could not reach the trace service");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(example => (
          <button
            key={example.ref}
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending}
            onClick={() => run(example.ref)}
          >
            {example.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        nft:&lt;token&gt;:&lt;serial&gt;, ft:&lt;token&gt;:&lt;holder&gt; or a mint transaction id
        <input className="input input-bordered font-mono" value={ref} onChange={e => setRef(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={() => run(ref)}>
        {pending ? "Tracing" : "Trace"}
      </button>
      {error && <p className="text-error m-0">{error}</p>}
      {trace && (
        <div className="bg-base-100 border border-base-300 rounded-2xl p-4 flex flex-col gap-3">
          <p className={`text-xl font-bold m-0 ${TONE[trace.verdict]}`}>{trace.verdict.replace("-", " ")}</p>
          <p className="m-0 text-sm">
            {trace.token.name} ({trace.token.id}), treasury {trace.token.treasury}. Record{" "}
            <a
              className="link font-mono"
              href={`https://hashscan.io/testnet/topic/${trace.record.topicId}`}
              target="_blank"
              rel="noreferrer"
            >
              {trace.record.topicId} #{trace.record.sequence}
            </a>
            {trace.mintVc && (
              <>
                , MintToken VC for {trace.mintVc.amount} of {trace.mintVc.tokenId}
              </>
            )}
            .
          </p>
          <ul className="m-0 pl-0 list-none text-sm flex flex-col gap-1">
            {trace.checks.map(check => (
              <li key={check.id} className="flex gap-2">
                <span className="font-mono w-4">{MARK[String(check.ok) as keyof typeof MARK]}</span>
                <span>{check.detail}</span>
              </li>
            ))}
          </ul>
          {trace.sources.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">What the mint rests on ({trace.sources.length} documents)</summary>
              <ul className="m-0 pl-5">
                {trace.sources.map(source => (
                  <li key={source.timestamp}>
                    {"↳".repeat(source.depth)} {source.type ?? "message"} {source.status ? `(${source.status})` : ""}{" "}
                    paid by {source.payer}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
