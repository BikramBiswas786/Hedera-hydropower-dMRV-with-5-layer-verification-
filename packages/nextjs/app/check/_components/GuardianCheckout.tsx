"use client";

import { useEffect, useState } from "react";
import { encodeFunctionData, parseAbi } from "viem";
import { useAccount } from "wagmi";
import { useTransactor } from "~~/hooks/scaffold-hbar";
import type { CheckoutListing, PreparedCheckoutPurchase } from "~~/services/mrv/server/checkout";

const ASSOCIATE_ABI = parseAbi(["function associate() returns (uint256)"]);
const TONE = {
  backed: "badge-success",
  none: "badge-ghost",
  "not-backed": "badge-error",
  incomplete: "badge-warning",
} as const;
const LABEL = {
  backed: "Guardian record backed",
  none: "No Guardian claim",
  "not-backed": "Guardian record not backed",
  incomplete: "Guardian record unreadable",
} as const;

const toUnits = (text: string, decimals: number) => {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
  const [whole, fraction = ""] = text.trim().split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole + fraction.padEnd(decimals, "0"));
};
const fromUnits = (units: string, decimals: number) =>
  decimals === 0
    ? units
    : `${units.padStart(decimals + 1, "0").slice(0, -decimals)}.${units.slice(-decimals).padStart(decimals, "0")}`;

function Listing({ listing }: { listing: CheckoutListing }) {
  const { address } = useAccount();
  const writeTx = useTransactor();
  const { decimals } = listing.token;
  const [amount, setAmount] = useState(fromUnits("10", decimals));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const units = toUnits(amount, decimals);
  const { guardian } = listing;
  const refused = guardian.verdict === "not-backed" || guardian.verdict === "incomplete";

  const associate = async () => {
    if (!address) return;
    setBusy(true);
    try {
      // HIP-719: an account associates by calling the token itself; a second call changes nothing.
      await writeTx({
        account: address,
        to: listing.token.address,
        data: encodeFunctionData({ abi: ASSOCIATE_ABI, functionName: "associate" }),
      });
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (!address || units === null || units <= 0n) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/checkout/prepare-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, amount: Number(units) }),
      });
      const body = (await response.json()) as PreparedCheckoutPurchase & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "No purchase transaction was built.");
        return;
      }
      setMessage(body.summary);
      await writeTx({ account: address, to: body.to, data: body.data, value: BigInt(body.value) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The purchase failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <p className="m-0 text-xs text-base-content/60">
            Checkout listing #{listing.id} · token {listing.token.id}
          </p>
          <p className="m-0 text-xl font-bold">
            {fromUnits(listing.available, decimals)} {listing.token.symbol}
          </p>
          <p className="m-0 text-sm">
            {listing.token.name} · ${(listing.priceUsdCentsPerToken / 100).toFixed(2)} per token
          </p>
        </div>
        <span className={`badge ${TONE[guardian.verdict]}`}>{LABEL[guardian.verdict]}</span>
      </div>
      {guardian.verdict !== "none" && (
        <p className="m-0 text-xs text-base-content/70 break-all">
          Traced from <code>{guardian.ref}</code>
          {guardian.failed.length > 0 ? `: ${guardian.failed.join("; ")}` : ": every check passed"}
        </p>
      )}
      {refused ? (
        <p className="m-0 text-sm text-error">
          No purchase is built for a token whose Guardian record does not check out.
        </p>
      ) : (
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className={`input input-bordered input-sm w-32 ${units === null ? "input-error" : ""}`}
            value={amount}
            onChange={event => setAmount(event.target.value)}
            aria-label="Amount"
          />
          <button className="btn btn-outline btn-sm" disabled={!address || busy} onClick={associate}>
            Associate
          </button>
          <button className="btn btn-primary btn-sm" disabled={!address || busy || units === null} onClick={buy}>
            Buy
          </button>
        </div>
      )}
      {message && <p className="m-0 text-sm break-words">{message}</p>}
    </div>
  );
}

/** UsdCheckout listings of any HTS token; the server traces each token before it builds a purchase. */
export function GuardianCheckout() {
  const [listings, setListings] = useState<CheckoutListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/checkout/listings")
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not read the checkout");
        setListings(body.listings);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Could not read the checkout"));
  }, []);

  if (error) return <p className="m-0 text-sm text-base-content/70">{error}</p>;
  if (!listings) return <span className="loading loading-dots loading-md" />;
  if (listings.length === 0) return <p className="m-0 text-sm">No open checkout listings.</p>;
  return (
    <div className="flex flex-col gap-4">
      {listings.map(listing => (
        <Listing key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
