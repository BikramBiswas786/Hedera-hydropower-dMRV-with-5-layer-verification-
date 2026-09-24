"use client";

import { useState } from "react";
import { ExternalLink } from "~~/components/hydro/ui";
import type { Decision } from "~~/services/mrv/engine";
import type { VerifyRequest } from "~~/services/mrv/schema";
import type { AttestOutcome } from "~~/services/mrv/server/attest";

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "done"; outcome: AttestOutcome };

/**
 * Operators publish through the server because the verifier key must never reach the browser.
 * The API key is kept in memory only.
 */
export const PublishPanel = ({ request, decision }: { request: VerifyRequest; decision: Decision }) => {
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const publish = async () => {
    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/mrv/attest", {
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
          This period is <strong>{decision}</strong>, so it cannot be anchored or credited. Fix the data or route it to
          a verifier&apos;s review.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-base-300 pt-4">
      <h3 className="font-semibold m-0">Publish & mint (operator)</h3>
      <p className="text-sm text-base-content/70 m-0">
        Publishes the readings and report to HCS, then calls <code>submitAttestation</code>, which recomputes the
        emission reductions on-chain. Requires the server&apos;s <code>MRV_API_KEY</code>.
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
        <button className="btn btn-primary btn-sm" disabled={!apiKey || state.kind === "pending"} onClick={publish}>
          {state.kind === "pending" ? <span className="loading loading-spinner loading-xs" /> : "Anchor & attest"}
        </button>
      </div>

      {state.kind === "error" && (
        <div role="alert" className="alert alert-error text-sm">
          {state.message}
        </div>
      )}
      {state.kind === "done" && state.outcome.status === "attested" && (
        <div role="status" className="alert alert-success text-sm flex flex-col items-start gap-1">
          <span>
            Attestation #{state.outcome.attestationId} minted {(state.outcome.unitsMinted / 1_000).toLocaleString()} t
            CO₂e of credits.
          </span>
          {state.outcome.hcs && (
            <>
              <ExternalLink href={state.outcome.hcs.dataUrl}>
                Raw readings on HCS (#{state.outcome.hcs.dataSequenceNumber})
              </ExternalLink>
              <ExternalLink href={state.outcome.hcs.url}>
                Report on HCS (#{state.outcome.hcs.sequenceNumber})
              </ExternalLink>
            </>
          )}
          {state.outcome.transaction.url ? (
            <ExternalLink href={state.outcome.transaction.url}>Contract transaction</ExternalLink>
          ) : (
            <code className="break-all">{state.outcome.transaction.hash}</code>
          )}
        </div>
      )}
    </div>
  );
};
