"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-hbar";

type Guardian =
  | { verdict: "backed" | "not-backed" | "incomplete"; ref: string; failed: string[] }
  | { verdict: "none"; detail: string };

type CheckoutListing = {
  id: number;
  token: { id: string | null; name: string; symbol: string; decimals: number };
  available: string;
  priceUsdCentsPerToken: number;
  guardian: Guardian;
};

type Prepared = {
  to?: `0x${string}`;
  data?: `0x${string}`;
  value?: string;
  summary?: string;
  exactCostHbar?: string;
  error?: string;
};

const CONNECT =
  "Unsigned purchase is ready. Connect MetaMask, HashPack, or Keplr in the header, then press Sign. HashPack must be an ECDSA account. An ED25519 account cannot sign.";

function wholeTokens(available: string, decimals: number): string {
  const units = Number(available);
  if (!Number.isFinite(units)) return available;
  const whole = decimals > 0 ? units / 10 ** decimals : units;
  return whole.toLocaleString("en-US", { maximumFractionDigits: Math.min(decimals, 3) });
}

function Offer({ listing }: { listing: CheckoutListing }) {
  const { address } = useAccount();
  const writeTx = useTransactor();
  const blocked = listing.guardian.verdict === "not-backed" || listing.guardian.verdict === "incomplete";
  const [amount, setAmount] = useState(BigInt(listing.available) >= 10n ? "10" : listing.available);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const units = /^\d+$/.test(amount) ? BigInt(amount) : null;
  const tooMuch = units !== null && units > BigInt(listing.available);
  const canPreview = units !== null && units > 0n && !tooMuch && !blocked && !sending;

  const preview = async () => {
    if (!canPreview || units === null) return;
    setSending(true);
    setNote(null);
    let built = false;
    try {
      const response = await fetch("/api/checkout/prepare-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, amount: Number(units) }),
      });
      const body = (await response.json()) as Prepared;
      if (!response.ok || !body.data || !body.to || !body.value) {
        setPrepared(null);
        setNote(body.error ?? "No purchase transaction was built.");
        return;
      }
      built = true;
      setPrepared(body);
      if (!address) {
        setNote(CONNECT);
        return;
      }
      await writeTx({ account: address, to: body.to, data: body.data, value: BigInt(body.value) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!built) setNote("No purchase transaction was built.");
      else if (/unsupported method|wallet_sendTransaction|ed25519|ecdsa|malicious/i.test(message)) {
        setNote(
          "This wallet cannot sign. Use MetaMask with a Hedera testnet ECDSA account. An ED25519 HashPack account cannot, and WalletConnect may call the site malicious.",
        );
      } else if (message) setNote(message.split("\n")[0] ?? message);
    } finally {
      setSending(false);
    }
  };

  const guardianLine =
    listing.guardian.verdict === "backed"
      ? `Guardian record ${listing.guardian.ref} is backed. The server signs the purchase only after that check.`
      : listing.guardian.verdict === "none"
        ? listing.guardian.detail
        : `Guardian check ${listing.guardian.verdict}: ${listing.guardian.failed.join("; ") || "not backed"}. No purchase is built.`;

  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
      <div>
        <p className="m-0 text-xs text-base-content/60">
          Checkout listing #{listing.id} · {listing.token.id ?? listing.token.symbol}
        </p>
        <p className="m-0 text-xl font-bold">
          {listing.token.symbol || listing.token.name} · {wholeTokens(listing.available, listing.token.decimals)}{" "}
          available
        </p>
        <p className="m-0 text-sm">${(listing.priceUsdCentsPerToken / 100).toFixed(2)} / token</p>
      </div>
      <p className={`m-0 text-sm ${blocked ? "text-error" : "text-base-content/80"}`}>{guardianLine}</p>
      <label className="flex items-center gap-2 text-sm">
        <span className="w-24">Base units</span>
        <input
          className={`input input-bordered input-sm grow ${units === null || tooMuch ? "input-error" : ""}`}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          inputMode="numeric"
          aria-label={`Base units for checkout listing ${listing.id}`}
        />
      </label>
      {prepared?.summary && (
        <div className="text-sm bg-base-200 rounded-xl p-3">
          <p className="m-0 font-medium">{prepared.summary}</p>
          <p className="m-0 text-base-content/70">
            Oracle cost {prepared.exactCostHbar} HBAR. Nothing is sent until you sign.
          </p>
        </div>
      )}
      {note && <p className="m-0 text-sm text-error">{note}</p>}
      <button className="btn btn-primary btn-sm" disabled={!canPreview} onClick={() => void preview()}>
        {sending ? "Building…" : address ? "Sign the purchase" : "Preview the purchase"}
      </button>
    </div>
  );
}

/** Guardian-checked sales. Loaded from the server so the page is not empty while the wallet reads the other market. */
export const CheckoutOffers = () => {
  const [listings, setListings] = useState<CheckoutListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/checkout/listings");
        const body = (await response.json()) as { listings?: CheckoutListing[]; error?: string };
        if (!response.ok) {
          if (!stop) setError(body.error ?? "Checkout listings could not be read.");
          return;
        }
        if (!stop) {
          setError(null);
          setListings(body.listings ?? []);
        }
      } catch {
        if (!stop) setError("Checkout listings could not be read.");
      }
    };
    void load();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-lg m-0">Guardian-checked tokens</h2>
      <p className="m-0 text-sm text-base-content/80">
        These are not the hydropower credit listing. Each one is an HTS token sold through UsdCheckout. Press Preview
        with no wallet. A token that cites Guardian is refused unless that record checks out.
      </p>
      {listings === null && !error && <p className="m-0 text-sm">Reading checkout listings…</p>}
      {error && <p className="m-0 text-sm text-error">{error}</p>}
      {listings?.length === 0 && <p className="m-0 text-sm text-base-content/60">No open checkout listings.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {listings?.map(listing => (
          <Offer key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
};
