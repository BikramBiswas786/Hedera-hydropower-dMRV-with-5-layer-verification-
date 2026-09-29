import { EngineWorkbench } from "./_components/EngineWorkbench";
import { VerifyWorkbench } from "./_components/VerifyWorkbench";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Verify & quantify",
  description:
    "Verify monitoring data and quantify emission reductions under VMR0017, ACM0002 and AMS-I.D, one engine per methodology",
});

const VerifyPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Verify & quantify">
      <p className="mt-2">
        Practice checker. No wallet and nothing is saved. On the left, press <strong>healthy</strong> (it should say
        APPROVED) and then <strong>tampered</strong> (it should refuse the batch). The card on the right is the result.
        The raw file is hidden until you open it.
      </p>
    </PageHeader>
    <VerifyWorkbench />
    <section className="flex flex-col gap-3 mt-4">
      <h2 className="text-xl font-bold m-0">Other methodologies: one engine each</h2>
      <p className="m-0 text-base-content/70">
        Every methodology is a plug-in engine with its own QA/QC and its own data and parameters table, paired with an{" "}
        <code>IMethodology</code> contract. The registry, market and audit trail are shared. Solar, wind and ocean power
        under VMR0017 / ACM0002 / AMS-I.D runs here on an example day.
      </p>
      <EngineWorkbench />
    </section>
  </div>
);

export default VerifyPage;
