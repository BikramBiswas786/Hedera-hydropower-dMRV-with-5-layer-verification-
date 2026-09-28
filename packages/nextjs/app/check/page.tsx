import { CompareForm } from "./_components/CompareForm";
import { TraceForm } from "./_components/TraceForm";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Check a Guardian credit",
  description: "Trace a Guardian mint to its signed record, or recompute a Guardian hydropower figure. No mint.",
});

const CheckPage: NextPage = () => (
  <div className="flex flex-col gap-10 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold m-0">Is this Guardian token backed?</h1>
        <p className="m-0 text-base-content/80">
          Guardian writes the consensus timestamp of a signed Verifiable Presentation into every mint. This follows it
          on the public mirror node, reads the VP from IPFS with each block checked against its CID, verifies the
          signatures, and checks that the VC names this token and amount and was signed by the identity the token
          treasury published. No Guardian login, no indexer account. Agents call it as <code>trace_guardian_mint</code>.
        </p>
      </header>
      <TraceForm />
    </section>
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold m-0">Compare a Guardian figure</h2>
        <p className="m-0 text-base-content/80">
          Managed Guardian already calculates the tonnes and can mint that number. This runs the same inputs through the
          integer the contract uses. If the two disagree, do not sell the credit. This check does not mint.
        </p>
      </header>
      <CompareForm />
    </section>
  </div>
);

export default CheckPage;
