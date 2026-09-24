import { VerifyWorkbench } from "./_components/VerifyWorkbench";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Verify telemetry",
  description: "Run the 5-layer hydropower verification engine on metered telemetry",
});

const VerifyPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Verify telemetry">
      <p className="mt-2">
        The verifier scores a batch of interval readings across five independent layers. It runs in your browser, so you
        can try tampered data safely. Only <strong>APPROVED</strong> batches can be anchored on HCS and minted as RECs.
      </p>
    </PageHeader>
    <VerifyWorkbench />
  </div>
);

export default VerifyPage;
