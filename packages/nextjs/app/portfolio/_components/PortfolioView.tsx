"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ExternalLink, StatCard } from "~~/components/hydro/ui";
import type { Portfolio } from "~~/services/mrv/server/insights";
import { formatTonnes } from "~~/services/mrv/views";

type Query = { account: string; beneficiary: string };

const toSearch = ({ account, beneficiary }: Query, format: "json" | "csv") => {
  const params = new URLSearchParams({ format });
  if (account.trim()) params.set("account", account.trim());
  if (beneficiary.trim()) params.set("beneficiary", beneficiary.trim());
  return `/api/registry/retirements?${params}`;
};

export const PortfolioView = () => {
  const { address } = useAccount();
  const [form, setForm] = useState<Query>({ account: "", beneficiary: "" });
  const [query, setQuery] = useState<Query | null>(null);
  const [state, setState] = useState<{ loading: boolean; portfolio?: Portfolio; error?: string }>({ loading: false });

  // Start from the connected wallet, once, without overwriting what the user typed.
  useEffect(() => {
    if (address && !form.account && !query) {
      const initial = { account: address, beneficiary: "" };
      setForm(initial);
      setQuery(initial);
    }
  }, [address, form.account, query]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    setState({ loading: true });
    fetch(toSearch(query, "json"), { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        setState({ loading: false, portfolio: body as Portfolio });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ loading: false, error: (error as Error).message });
      });
    return () => controller.abort();
  }, [query]);

  const { portfolio } = state;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="bg-base-100 border border-base-300 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end"
        onSubmit={event => {
          event.preventDefault();
          setQuery({ ...form });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Retiring account
          <input
            className="input input-bordered input-sm font-mono"
            placeholder="0x… (defaults to your connected wallet)"
            value={form.account}
            onChange={event => setForm({ ...form, account: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Beneficiary
          <input
            className="input input-bordered input-sm"
            placeholder="Company name written on the certificate"
            value={form.beneficiary}
            onChange={event => setForm({ ...form, beneficiary: event.target.value })}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!form.account.trim() && !form.beneficiary.trim()}
        >
          Show retirements
        </button>
      </form>

      {state.loading && <span className="loading loading-spinner" aria-label="Loading" />}
      {state.error && (
        <p className="text-error m-0" role="alert">
          {state.error}
        </p>
      )}

      {portfolio && query && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Retired" value={`${formatTonnes(portfolio.totals.retiredKg)} t CO₂e`} />
            <StatCard label="Retirements" value={portfolio.totals.retirements} />
            <StatCard label="NFT certificates" value={portfolio.totals.certificates} />
            <StatCard
              label="Held in custody"
              value={portfolio.totals.custodyKg === null ? "—" : `${formatTonnes(portfolio.totals.custodyKg)} t`}
              hint="Bought, not yet retired or withdrawn"
            />
          </div>
          <section className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold m-0">Retirements</h2>
              <a className="btn btn-outline btn-sm" href={toSearch(query, "csv")} download>
                Download CSV
              </a>
            </div>
            {portfolio.retirements.length === 0 ? (
              <p className="m-0 text-base-content/60">
                None yet. Buy and retire credits on the{" "}
                <Link href="/market" className="link">
                  market
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Retired (UTC)</th>
                      <th className="text-right">Amount</th>
                      <th>Beneficiary</th>
                      <th>Account</th>
                      <th>Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.retirements.map(r => (
                      <tr key={r.id}>
                        <td className="font-mono">{r.id}</td>
                        <td className="whitespace-nowrap">
                          {new Date(r.timestamp * 1_000).toISOString().replace("T", " ").slice(0, 16)}
                        </td>
                        <td className="text-right whitespace-nowrap">{formatTonnes(r.units)} t</td>
                        <td>{r.beneficiary || <span className="text-base-content/50">—</span>}</td>
                        <td className="font-mono text-xs">{`${r.account.slice(0, 8)}…${r.account.slice(-4)}`}</td>
                        <td className="whitespace-nowrap flex gap-3">
                          <Link href={r.certificateUrl} className="link link-primary">
                            {r.certificateSerial ? `NFT #${r.certificateSerial}` : "View"}
                          </Link>
                          {r.nftUrl && <ExternalLink href={r.nftUrl}>Hashscan</ExternalLink>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
