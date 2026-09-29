"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "~~/components/hydro/ui";
import type { Decision } from "~~/services/mrv/engine";
import type { VerifyRequest } from "~~/services/mrv/schema";
import type { RecordOutcome } from "~~/services/mrv/server/monitoring";

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "done"; outcome: RecordOutcome };

/**
 * Monitoring: the operator's server publishes the readings and report to HCS and records the period on-chain with
 * the meter's signature (the relayer key never reaches the browser). A record issues nothing; a VVB verifies it later
 * on the plant's page. The API key is kept in memory only.
 */
export const PublishPanel = ({ request, decision }: { request: VerifyRequest; decision: Decision }) => {
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const send = async () => {
    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/mrv/record", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        // The server quantifies against the on-chain ledger itself, so a stale browser copy cannot matter.
        body: JSON.stringify({ ...request, ledger: undefined }),
      });
      const body = await response.json();
      setState(response.ok ? { kind: "done", outcome: body } : { kind: "error", message: body.error });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  };

  if (decision !== "APPROVED") {
    return (
      <div role="note" className="alert">
        <span>
          This period is <strong>{decision}</strong>, so it cannot be recorded or credited. Fix the data or route it to
          a verifier&apos;s review.
        </span>
      </div>
    );
  }

  const recorded = state.kind === "done" && state.outcome.status === "recorded" ? state.outcome : null;

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 pt-4">
      <h3 className="font-semibold m-0">Record on-chain (operators only)</h3>
      <p className="text-sm text-base-content/70 m-0">
        Visitors cannot record from this page: it needs the server&apos;s operator key, and the server must be the
        plant&apos;s operator or reporter. Recording issues nothing. An accredited VVB verifies recorded periods, and
        only its approval issues credits.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          aria-label="Operator API key"
          placeholder="MRV_API_KEY"
          className="input input-bordered input-sm grow"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={!apiKey || state.kind === "pending"} onClick={send}>
          {state.kind === "pending" ? <span className="loading loading-spinner loading-xs" /> : "Publish and record"}
        </button>
      </div>

      {state.kind === "error" && (
        <div role="alert" className="alert alert-error text-sm">
          {state.message}
        </div>
      )}
      {state.kind === "done" && state.outcome.status === "not-eligible" && (
        <div role="alert" className="alert alert-warning text-sm">
          The server re-ran the engine against the on-chain ledger and the period is {state.outcome.report.decision}.
          Nothing was published.
        </div>
      )}
      {recorded && (
        <div role="status" className="alert alert-success text-sm flex flex-col items-start gap-1">
          <span>
            Recorded as {recorded.report.plantId} record {recorded.sequence} (#{recorded.attestationId}): ER{" "}
            {(recorded.reductionG / 1e6).toLocaleString("en-US", { maximumFractionDigits: 3 })} t CO₂e, awaiting a VVB.
            Chain head <code className="break-all">{recorded.chainHash}</code>.
          </span>
          {recorded.hcs && (
            <>
              <ExternalLink href={recorded.hcs.dataUrl}>
                Raw readings on HCS (#{recorded.hcs.dataSequenceNumber})
              </ExternalLink>
              <ExternalLink href={recorded.hcs.url}>Report on HCS (#{recorded.hcs.sequenceNumber})</ExternalLink>
            </>
          )}
          {recorded.transaction.url ? (
            <ExternalLink href={recorded.transaction.url}>Contract transaction</ExternalLink>
          ) : (
            <code className="break-all">{recorded.transaction.hash}</code>
          )}
          <Link className="link link-primary" href={`/plants/${encodeURIComponent(recorded.report.plantId)}`}>
            Verify on the plant&apos;s page
          </Link>
        </div>
      )}
    </div>
  );
};
