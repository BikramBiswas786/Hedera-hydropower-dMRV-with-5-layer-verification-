"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { ExternalLink } from "~~/components/hydro/ui";
import type { Decision } from "~~/services/mrv/engine";
import type { VerifyRequest } from "~~/services/mrv/schema";
import type { AttestAnchor, AttestOutcome } from "~~/services/mrv/server/attest";

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "done"; outcome: AttestOutcome };

type Step = { publishForApproval?: boolean; anchor?: AttestAnchor; verifierSignature?: string };

/**
 * Two signatures mint: the plant's meter and an accredited VVB. Operators publish through the server (the relayer
 * key never reaches the browser); the VVB signs the EIP-712 approval with its own wallet, here or offline with
 * `yarn mrv:approve`. On a labelled demo registry the server's demo VVB key can approve in one step, and the result
 * says so. The API key is kept in memory only.
 */
export const PublishPanel = ({ request, decision }: { request: VerifyRequest; decision: Decision }) => {
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [signature, setSignature] = useState("");
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const send = async (step: Step) => {
    setState({ kind: "pending" });
    try {
      const response = await fetch("/api/mrv/attest", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        // The server quantifies against the on-chain ledger itself, so a stale browser copy cannot matter.
        body: JSON.stringify({ ...request, ledger: undefined, ...step }),
      });
      const body = await response.json();
      setState(response.ok ? { kind: "done", outcome: body } : { kind: "error", message: body.error });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  };

  const awaiting = state.kind === "done" && state.outcome.status === "awaiting-approval" ? state.outcome : null;

  const signAsVvb = async () => {
    if (!awaiting) return;
    const { domain, types, primaryType, message } = awaiting.approval;
    const signed = await signTypedDataAsync({
      domain,
      types,
      primaryType,
      message: { ...message, hcsTopicNum: BigInt(message.hcsTopicNum), hcsSequence: BigInt(message.hcsSequence) },
    });
    setSignature(signed);
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
      <h3 className="font-semibold m-0">Publish (operators only)</h3>
      <p className="text-sm text-base-content/70 m-0">
        Visitors cannot mint from this page. It needs the server operator key. Leave it alone unless you deployed this
        template yourself.
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
        <button
          className="btn btn-primary btn-sm"
          disabled={!apiKey || state.kind === "pending"}
          onClick={() => send({ publishForApproval: true })}
        >
          {state.kind === "pending" ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "1. Anchor for VVB approval"
          )}
        </button>
        <button
          className="btn btn-outline btn-sm"
          disabled={!apiKey || state.kind === "pending"}
          title="Only works on a labelled demo registry whose demo VVB key is configured on the server"
          onClick={() => send({})}
        >
          Attest with demo VVB
        </button>
      </div>

      {awaiting && (
        <div className="flex flex-col gap-2 text-sm">
          <span>
            Anchored on HCS. A VVB holding <code>VERIFIER_ROLE</code> must sign this approval (not the operator or the
            meter):
          </span>
          <pre className="text-xs bg-base-200 p-2 rounded overflow-x-auto max-h-48">
            {JSON.stringify(awaiting.approval, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" disabled={!address} onClick={signAsVvb}>
              Sign as VVB with connected wallet
            </button>
            <input
              aria-label="VVB signature"
              placeholder="0x… VerifierApproval signature"
              className="input input-bordered input-sm grow font-mono"
              value={signature}
              onChange={event => setSignature(event.target.value.trim())}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!/^0x[0-9a-fA-F]{130}$/.test(signature)}
              onClick={() => send({ anchor: awaiting.anchor, verifierSignature: signature })}
            >
              2. Relay & mint
            </button>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div role="alert" className="alert alert-error text-sm">
          {state.message}
        </div>
      )}
      {state.kind === "done" && state.outcome.status === "attested" && (
        <div role="status" className="alert alert-success text-sm flex flex-col items-start gap-1">
          <span>
            Attestation #{state.outcome.attestationId} minted {(state.outcome.unitsMinted / 1_000).toLocaleString()} t
            CO₂e of credits, approved by VVB <code>{state.outcome.verifier.address}</code>
            {state.outcome.verifier.demo && " (labelled demo VVB key, not an accredited verifier)"}.
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
