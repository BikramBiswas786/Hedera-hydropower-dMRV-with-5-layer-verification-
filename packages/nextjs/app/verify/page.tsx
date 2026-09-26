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
        Practice checker. No wallet and nothing is saved. On the left, press <strong>healthy</strong> (it should say
        APPROVED) and then <strong>tampered</strong> (it should refuse the batch). The card on the right is the result.
        The raw file is hidden until you open it.
      </p>
    </PageHeader>
    <VerifyWorkbench />
  </div>
);

export default VerifyPage;
