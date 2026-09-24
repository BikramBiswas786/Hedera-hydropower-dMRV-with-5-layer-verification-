import { Marketplace } from "./_components/Marketplace";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "REC market",
  description: "Buy, sell and retire verified hydropower RECs priced in USD and settled in HBAR",
});

const MarketPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="REC market">
      <p className="mt-2">
        Sellers price certificates in USD per MWh. At purchase the contract converts that price to HBAR using the{" "}
        <strong>Chainlink HBAR/USD</strong> feed on Hedera, rejecting stale answers. Retiring burns the HTS tokens and
        records the beneficiary permanently.
      </p>
    </PageHeader>
    <Marketplace />
  </div>
);

export default MarketPage;
