"use client";

import { useEffect, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { type DexGate, ListingCard } from "./ListingCard";
import { OraclePanel } from "./OraclePanel";
import { useAccount } from "wagmi";
import { NotDeployedNotice } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type RawListing, toListingView } from "~~/services/mrv/views";

const CLOSED: DexGate = { accepted: false, deviationBps: 10_000, maxDeviationBps: 300 };

export const Marketplace = () => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const [dex, setDex] = useState<DexGate | null>(null);
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "CreditMarket" });
  const { data: nativeUnitsPerHbar } = useScaffoldReadContract({
    contractName: "CreditMarket",
    functionName: "NATIVE_UNITS_PER_HBAR",
  });
  const { data: listingCount } = useScaffoldReadContract({
    contractName: "CreditMarket",
    functionName: "listingCount",
  });
  const { data: listings } = useScaffoldReadContract({
    contractName: "CreditMarket",
    functionName: "getListings",
    args: [0n, listingCount ?? 0n],
  });

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/market/dex");
        if (!response.ok) {
          if (!stop) setDex(CLOSED);
          return;
        }
        const body = (await response.json()) as DexGate;
        if (!stop) setDex(body);
      } catch {
        if (!stop) setDex(CLOSED);
      }
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const rawListings: readonly RawListing[] = listings ?? [];
  const open = rawListings.map(toListingView).filter(listing => listing.active);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <aside className="flex flex-col gap-6">
        <OraclePanel />
        <AccountPanel address={address} />
      </aside>
      <section className="lg:col-span-2 flex flex-col gap-4">
        <h2 className="font-semibold text-lg m-0">Open listings ({open.length})</h2>
        {dex && !dex.accepted && (
          <p className="m-0 text-error">
            SaucerSwap settlement pair is {dex.deviationBps} bps from the oracle. Buy is not built until it is inside{" "}
            {dex.maxDeviationBps}.
          </p>
        )}
        {open.length === 0 && (
          <p className="m-0 text-base-content/60">
            No open listings. Plant operators receive credits when an attestation is minted and can list them from their
            account panel.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nativeUnitsPerHbar !== undefined &&
            open.map(listing => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isOwn={listing.seller.toLowerCase() === address?.toLowerCase()}
                nativeUnitsPerHbar={nativeUnitsPerHbar}
                dex={dex}
              />
            ))}
        </div>
      </section>
    </div>
  );
};
