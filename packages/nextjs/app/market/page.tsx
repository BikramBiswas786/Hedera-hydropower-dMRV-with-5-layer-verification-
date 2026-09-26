import { Marketplace } from "./_components/Marketplace";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Credit market",
  description: "Buy and retire hydropower credits. The HBAR is swapped on SaucerSwap.",
});

const MarketPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Credit market">
      <p className="mt-2">
        Each credit is one tonne of CO₂e reduced, computed on-chain from the plant&apos;s registered design and its
        verified monitoring data. Sellers price credits in USD per tonne. A purchase sends the HBAR amount, from{" "}
        <strong>Chainlink HBAR/USD</strong> with <strong>Supra</strong> as fallback, to the SaucerSwap router. The
        seller is paid by that swap. If the settlement pair is more than 3% from the oracle, the contract reverts and
        this page does not build the transaction. Retiring burns the credits and mints an HTS NFT to the buyer.
      </p>
    </PageHeader>
    <Marketplace />
  </div>
);

export default MarketPage;
