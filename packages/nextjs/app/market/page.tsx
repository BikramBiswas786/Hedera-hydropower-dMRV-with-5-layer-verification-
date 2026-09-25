import { Marketplace } from "./_components/Marketplace";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Credit market",
  description: "Buy, sell and retire verified hydropower carbon credits priced in USD and settled in HBAR",
});

const MarketPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Credit market">
      <p className="mt-2">
        Each credit is one tonne of CO₂e reduced, computed on-chain from the plant&apos;s registered design and its
        verified monitoring data. Sellers price credits in USD per tonne. At purchase the contract converts that price
        to HBAR using <strong>Chainlink HBAR/USD</strong>, cross-checked against <strong>Supra</strong> and falling back
        to it when Chainlink is unavailable. This page will not build that purchase if the SaucerSwap WHBAR/USDC pool
        is more than 3% away. Retiring burns the HTS tokens and mints an HTS NFT certificate to the buyer.
      </p>
    </PageHeader>
    <Marketplace />
  </div>
);

export default MarketPage;
