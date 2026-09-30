"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { HederaAddress } from "~~/components/scaffold-hbar";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useTransactor,
} from "~~/hooks/scaffold-hbar";
import { formatHbar, tonnesToUnits } from "~~/services/mrv/pricing";
import { type ListingView, formatTonnes, formatUsdCents } from "~~/services/mrv/views";

export type DexGate = {
  accepted: boolean;
  deviationBps: number;
  maxDeviationBps: number;
  pair?: string;
  publicMainnet?: { accepted: boolean; deviationBps: number; maxDeviationBps: number } | null;
};

type Prepared = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  error?: string;
  summary?: string;
  valueHbar?: string;
  exactCostHbar?: string;
};

const CONNECT =
  "Unsigned purchase is ready. Connect MetaMask, HashPack, or Keplr in the header, then press Sign. HashPack must be an ECDSA account. An ED25519 account cannot sign.";

type Props = { listing: ListingView; isOwn: boolean; nativeUnitsPerHbar: bigint; dex: DexGate | null };

export const ListingCard = ({ listing, isOwn, nativeUnitsPerHbar, dex }: Props) => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const [amount, setAmount] = useState(formatTonnes(listing.unitsAvailable).replace(/,/g, ""));
  const [beneficiary, setBeneficiary] = useState("");
  const [sending, setSending] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const units = tonnesToUnits(amount);
  const tooMuch = units !== null && units > BigInt(listing.unitsAvailable);

  const { data: quote, error: quoteError } = useScaffoldReadContract({
    contractName: "CreditMarket",
    functionName: "quote",
    args: [BigInt(listing.id), units ?? 0n],
    query: { enabled: units !== null && !tooMuch },
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "CreditMarket" });
  const writeTx = useTransactor();

  // A local chain reports no public mainnet pair (null); on Hedera it must agree too.
  const poolOk = dex?.accepted === true && (dex.publicMainnet === null || dex.publicMainnet?.accepted === true);
  const canBuy = units !== null && !tooMuch && quote !== undefined && !isMining && !sending && poolOk;

  const buy = async (retire: boolean) => {
    if (!canBuy || units === null) return;
    setSending(true);
    setGateError(null);
    let built = false;
    try {
      const response = await fetch("/api/market/prepare-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          amountKg: Number(units),
          retire,
          beneficiary,
        }),
      });
      const body = (await response.json()) as Prepared;
      if (!response.ok || !body.data || !body.to) {
        setGateError(body.error ?? "No purchase transaction was built.");
        return;
      }
      built = true;
      setPrepared(body);
      if (!address) {
        setGateError(CONNECT);
        return;
      }
      await writeTx({
        account: address,
        to: body.to,
        data: body.data,
        value: BigInt(body.value),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!built) setGateError("No purchase transaction was built.");
      else if (/unsupported method|wallet_sendTransaction|ed25519|ecdsa|malicious/i.test(message)) {
        setGateError(
          "This wallet cannot sign the purchase. Use MetaMask with a Hedera testnet ECDSA account. An ED25519 HashPack account cannot.",
        );
      } else if (message) setGateError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="m-0 text-xs text-base-content/60">Listing #{listing.id}</p>
          <p className="m-0 text-xl font-bold">{formatTonnes(listing.unitsAvailable)} t CO₂e</p>
          <p className="m-0 text-sm">{formatUsdCents(listing.priceUsdCentsPerTonne)} / t</p>
        </div>
        <HederaAddress address={listing.seller} chain={targetNetwork} />
      </div>

      {isOwn ? (
        <button
          className="btn btn-outline btn-sm"
          disabled={isMining}
          onClick={() => writeContractAsync({ functionName: "cancelListing", args: [BigInt(listing.id)] })}
        >
          Cancel listing
        </button>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-20">Amount</span>
            <input
              className={`input input-bordered input-sm grow ${units === null || tooMuch ? "input-error" : ""}`}
              value={amount}
              onChange={event => setAmount(event.target.value)}
              inputMode="decimal"
              aria-label={`Amount in tonnes for listing ${listing.id}`}
            />
            <span>t CO₂e</span>
          </label>
          <p className="m-0 text-sm text-base-content/70 min-h-5">
            {tooMuch && "More than available"}
            {quote !== undefined && !tooMuch && `≈ ${formatHbar(quote, nativeUnitsPerHbar)} HBAR at the oracle price`}
            {quoteError && !tooMuch && "Oracle price unavailable or stale"}
          </p>
          <input
            className="input input-bordered input-sm"
            placeholder="Retirement beneficiary (e.g. Acme Corp FY2026)"
            maxLength={128}
            value={beneficiary}
            onChange={event => setBeneficiary(event.target.value)}
            aria-label={`Beneficiary for listing ${listing.id}`}
          />
          <p className="m-0 text-sm min-h-5 text-error">
            {dex === null && "Reading SaucerSwap before a purchase can be built."}
            {dex && !dex.accepted && `SaucerSwap settlement pair is ${dex.deviationBps} bps off. Buy stays off.`}
            {dex?.accepted && dex.publicMainnet && !dex.publicMainnet.accepted
              ? `Public mainnet WHBAR/USDC is ${dex.publicMainnet.deviationBps} bps from Chainlink. Buy stays off.`
              : ""}
            {gateError}
          </p>
          {prepared?.summary && (
            <div className="text-sm bg-base-200 rounded-xl p-3 flex flex-col gap-1">
              <p className="m-0 font-medium">{prepared.summary}</p>
              <p className="m-0 text-base-content/70">
                The wallet sends {prepared.valueHbar} HBAR. The contract refunds anything above the oracle cost of{" "}
                {prepared.exactCostHbar} HBAR. SaucerSwap pays the seller.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm grow" disabled={!canBuy} onClick={() => buy(true)}>
              {address ? "Sign and retire" : "Preview the purchase"}
            </button>
            <button className="btn btn-outline btn-sm" disabled={!canBuy || !address} onClick={() => buy(false)}>
              Buy only
            </button>
          </div>
        </>
      )}
    </div>
  );
};
