import { WaterForm } from "./_components/WaterForm";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { DEMO_WATER, quantifySafeWater } from "~~/services/mrv/water/vmr0015";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Safe water",
  description: "Illustrative VMR0015 quantification. Not a hydro credit.",
});

const WaterPage: NextPage = () => {
  const demo = quantifySafeWater(DEMO_WATER);
  return (
    <div className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
      <PageHeader title="Safe water">
        VMR0015, the safe-drinking-water revision of AMS-III.AV. The demo is 2,000 people and issues{" "}
        {demo.creditsTonnes.toLocaleString("en-US")} t after rounding down. It does not touch the hydro token.
      </PageHeader>
      <ul className="text-sm opacity-80 m-0">
        {demo.trace.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <WaterForm />
    </div>
  );
};

export default WaterPage;
