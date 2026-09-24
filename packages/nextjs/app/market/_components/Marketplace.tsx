"use client";

import { AccountPanel } from "./AccountPanel";
import { ListingCard } from "./ListingCard";
import { useAccount } from "wagmi";
import { NotDeployedNotice, StatCard } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type RawListing, toListingView } from "~~/services/mrv/views";

const OraclePanel = () => {
  const { data: price } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "hbarUsdPrice" });
  const { data: maxAge } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "maxPriceAge" });
  if (!price) return <StatCard label="HBAR / USD (Chainlink)" value="…" />;

  const [answer, decimals, updatedAt] = price;
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1_000) - Number(updatedAt));
  const stale = maxAge !== undefined && ageSeconds > maxAge;
  return (
    <StatCard
      label="HBAR / USD (Chainlink)"
      value={`$${(Number(answer) / 10 ** decimals).toFixed(5)}`}
      hint={
        <span className={stale ? "text-error" : undefined}>
          Updated {Math.round(ageSeconds / 60)} min ago
          {stale && " · stale, purchases are paused until the feed updates"}
        </span>
      }
    />
  );
};

export const Marketplace = () => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "HydroREC" });
  const { data: nativeUnitsPerHbar } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "NATIVE_UNITS_PER_HBAR",
  });
  const { data: listingCount } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "listingCount" });
  const { data: listings } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "getListings",
    args: [0n, listingCount ?? 0n],
  });

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const rawListings: readonly RawListing[] = listings ?? [];
  const open = rawListings.map(toListingView).filter(listing => listing.active);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <aside className="flex flex-col gap-6">
        <OraclePanel />
        {nativeUnitsPerHbar !== undefined && <AccountPanel address={address} nativeUnitsPerHbar={nativeUnitsPerHbar} />}
      </aside>
      <section className="lg:col-span-2 flex flex-col gap-4">
        <h2 className="font-semibold text-lg m-0">Open listings ({open.length})</h2>
        {open.length === 0 && (
          <p className="m-0 text-base-content/60">
            No open listings. Plant operators receive RECs when an attestation is minted and can list them from their
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
              />
            ))}
        </div>
      </section>
    </div>
  );
};
