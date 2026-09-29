"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { ExternalLink, formatPeriod } from "~~/components/hydro/ui";
import type { PendingVerification, StatementJson } from "~~/services/mrv/server/verification";
import { formatGramsAsTonnes, formatTonnes } from "~~/services/mrv/views";

type Prepared = {
  reportHash: string;
  hcs: { url: string; sequenceNumber: number } | null;
  statement: StatementJson;
  typedData: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: "VerificationStatement";
    message: Record<string, string | number>;
  };
};

type Submitted = {
  status: "approved" | "rejected";
  issuanceId: number;
  unitsIssued: number;
  transaction: { url: string | null; hash: string };
};

const post = async <T,>(path: string, apiKey: string, body: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
  return json as T;
};

/**
 * VCS verification of a plant's pending monitoring records. Anyone sees what awaits verification and whether each
 * record reproduces from HCS. A VVB then decides; the operator's server publishes the verification report (API key),
 * the VVB signs the statement with its own wallet (never the server), and the server relays it.
 */
export const VerificationPanel = ({ plantId }: { plantId: string }) => {
  const [pending, setPending] = useState<PendingVerification | null | "loading" | undefined>();
  const [error, setError] = useState<string>();
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [deductionT, setDeductionT] = useState("0");
  const [findings, setFindings] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [prepared, setPrepared] = useState<Prepared>();
  const [signature, setSignature] = useState("");
  const [submitted, setSubmitted] = useState<Submitted>();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const load = async () => {
    setPending("loading");
    setError(undefined);
    try {
      const response = await fetch(`/api/mrv/verification?plantId=${encodeURIComponent(plantId)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setPending(json.pending);
    } catch (e) {
      setError((e as Error).message);
      setPending(undefined);
    }
  };

  const run = async (action: () => Promise<void>) => {
    setError(undefined);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const prepare = () =>
    run(async () =>
      setPrepared(
        await post<Prepared>("/api/mrv/verification", apiKey, {
          plantId,
          decision,
          deductionG: Math.round(Number(deductionT) * 1e6),
          findings,
        }),
      ),
    );

  const sign = () =>
    run(async () => {
      if (!prepared) return;
      const { domain, types, primaryType, message } = prepared.typedData;
      setSignature(
        await signTypedDataAsync({
          domain,
          types,
          primaryType,
          message: {
            ...message,
            deductionG: BigInt(message.deductionG),
            hcsTopicNum: BigInt(message.hcsTopicNum),
            hcsSequence: BigInt(message.hcsSequence),
          },
        }),
      );
    });

  const submit = () =>
    run(async () => {
      if (!prepared) return;
      setSubmitted(
        await post<Submitted>("/api/mrv/verification/submit", apiKey, {
          plantId,
          statement: prepared.statement,
          signature,
        }),
      );
    });

  return (
    <section className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
      <h2 className="text-lg font-semibold m-0">Verification (VVB)</h2>
      <p className="text-sm text-base-content/70 m-0">
        Records become credits only after an accredited VVB verifies them. Load the pending run to see each record
        re-derived from its HCS readings, with the registered design, the meter and its link in the on-chain record
        chain.
      </p>
      {pending === undefined && (
        <button className="btn btn-sm btn-outline w-fit" onClick={load}>
          Load records awaiting verification
        </button>
      )}
      {pending === "loading" && <span className="loading loading-spinner loading-sm" />}
      {pending === null && <p className="m-0 text-sm">Every record of this plant has been verified.</p>}
      {pending && pending !== "loading" && (
        <>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Record</th>
                <th>Period</th>
                <th className="text-right">ER</th>
                <th>Reproduced from HCS</th>
              </tr>
            </thead>
            <tbody>
              {pending.records.map(r => (
                <tr key={r.sequence}>
                  <td>{r.sequence}</td>
                  <td className="text-xs">{formatPeriod(r.periodStart, r.periodEnd)}</td>
                  <td className="text-right">{formatGramsAsTonnes(r.reductionG)} t</td>
                  <td className="text-xs">
                    {r.reproduction === "reproduced"
                      ? "✓ reproduced"
                      : `✗ ${r.reproduction}: ${r.failedChecks.join(", ")}`}
                    {r.reportUrl && (
                      <>
                        {" "}
                        · <ExternalLink href={r.reportUrl}>report</ExternalLink>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm m-0">
            Records {pending.firstRecord}–{pending.lastRecord}: monitored ER {formatGramsAsTonnes(pending.monitoredG)}{" "}
            t. An approval without deduction issues {formatTonnes(pending.unitsIfApproved)} t. Chain head{" "}
            <code className="text-xs break-all">{pending.recordsHash}</code>.
          </p>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              aria-label="Decision"
              className="select select-bordered select-sm"
              value={decision}
              onChange={e => setDecision(e.target.value as "approve" | "reject")}
            >
              <option value="approve" disabled={!pending.allReproduced}>
                Approve
              </option>
              <option value="reject">Reject</option>
            </select>
            <label className="text-sm flex items-center gap-1">
              Deduction (t)
              <input
                className="input input-bordered input-sm w-24"
                inputMode="decimal"
                value={deductionT}
                onChange={e => setDeductionT(e.target.value)}
              />
            </label>
            <input
              aria-label="Findings"
              placeholder="Findings (published in the verification report)"
              maxLength={280}
              className="input input-bordered input-sm grow"
              value={findings}
              onChange={e => setFindings(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              aria-label="Operator API key"
              placeholder="MRV_API_KEY (publishes the report)"
              className="input input-bordered input-sm grow"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" disabled={!apiKey} onClick={prepare}>
              1. Publish verification report
            </button>
          </div>
        </>
      )}

      {prepared && (
        <div className="flex flex-col gap-2 text-sm">
          <span>
            Report published
            {prepared.hcs && (
              <>
                {" "}
                (<ExternalLink href={prepared.hcs.url}>HCS #{prepared.hcs.sequenceNumber}</ExternalLink>)
              </>
            )}
            . A key with <code>VERIFIER_ROLE</code> that is not the operator, meter or reporter signs:
          </span>
          <pre className="text-xs bg-base-200 p-2 rounded overflow-x-auto max-h-48">
            {JSON.stringify(prepared.typedData.message, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" disabled={!address} onClick={sign}>
              2. Sign as VVB with connected wallet
            </button>
            <input
              aria-label="VVB signature"
              placeholder="0x… or paste the signature from yarn mrv:approve"
              className="input input-bordered input-sm grow font-mono"
              value={signature}
              onChange={e => setSignature(e.target.value.trim())}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!/^0x[0-9a-fA-F]{130}$/.test(signature)}
              onClick={submit}
            >
              3. Relay
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div role="status" className="alert alert-success text-sm flex flex-col items-start gap-1">
          <span>
            Verification #{submitted.issuanceId}:{" "}
            {submitted.status === "rejected"
              ? "rejected; the run is closed unissued."
              : submitted.unitsIssued > 0
                ? `approved; issued ${formatTonnes(submitted.unitsIssued)} t CO₂e into the operator's custody.`
                : "approved; nothing to issue, the deficit or sub-tonne remainder carries forward."}
          </span>
          {submitted.transaction.url && (
            <ExternalLink href={submitted.transaction.url}>Contract transaction</ExternalLink>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error text-sm">
          {error}
        </div>
      )}
    </section>
  );
};
