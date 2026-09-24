import { AuditTrail } from "./_components/AuditTrail";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Audit trail",
  description: "Independently verify every hydropower attestation against its HCS report",
});

const AuditPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Audit trail">
      <p className="mt-2">
        Every issuance is backed by raw monitoring data and a report on the Hedera Consensus Service.{" "}
        <strong>Check evidence</strong> fetches both from the public mirror node in your browser, hashes them, confirms
        the data was quantified with the plant&apos;s registered design, re-runs the engine and compares EG_PJ, BE, PE,
        LE, ER and the credits minted with what the contract recorded. No trust in this server is required.
      </p>
    </PageHeader>
    <AuditTrail />
  </div>
);

export default AuditPage;
