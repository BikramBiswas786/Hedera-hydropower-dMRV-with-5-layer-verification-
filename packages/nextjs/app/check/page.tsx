import { CompareForm } from "./_components/CompareForm";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Compare",
  description: "Recompute a Guardian hydropower figure. No mint.",
});

const CheckPage: NextPage = () => (
  <div className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold m-0">Compare a Guardian figure</h1>
      <p className="m-0 text-base-content/80">
        Managed Guardian already calculates the tonnes and can mint that number. This page runs the same inputs through
        the integer the contract uses. If the two disagree, do not sell the credit. This check does not mint.
      </p>
    </header>
    <CompareForm />
  </div>
);

export default CheckPage;
