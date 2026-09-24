import { PortfolioView } from "./_components/PortfolioView";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Retirement portfolio",
  description: "Carbon credits retired by an account or on behalf of a company, with certificates and a CSV export",
});

const PortfolioPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Retirement portfolio">
      <p className="mt-2">
        Every tonne your wallet retired, or that anyone retired on behalf of your organisation, with its NFT
        certificate. Export it as CSV for a GHG inventory or ESG report; each row links to a certificate backed by
        on-chain data and, through the audit trail, by the metered readings on HCS.
      </p>
    </PageHeader>
    <PortfolioView />
  </div>
);

export default PortfolioPage;
