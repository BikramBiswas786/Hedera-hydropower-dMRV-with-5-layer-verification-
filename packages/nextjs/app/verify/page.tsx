import { VerifyWorkbench } from "./_components/VerifyWorkbench";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Verify & quantify",
  description: "Verify hydropower monitoring data and quantify emission reductions under AMS-I.D / ACM0002",
});

const VerifyPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Verify & quantify">
      <p className="mt-2">
        Five stages check a monitoring period against the registered design and the methodology: applicability, data
        QA/QC, physical cross-checks, quantification (ER = BE − PE − LE) and environmental safeguards. It runs in your
        browser, so you can try tampered data safely. Only <strong>APPROVED</strong> periods can be anchored on HCS and
        credited.
      </p>
    </PageHeader>
    <VerifyWorkbench />
  </div>
);

export default VerifyPage;
