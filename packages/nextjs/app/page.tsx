import Link from "next/link";
import { AgentAccess } from "./_components/AgentAccess";
import { RegistryStats } from "./_components/RegistryStats";
import type { NextPage } from "next";

const STEPS = [
  {
    title: "Look",
    service: "No wallet",
    body: "Open Verify, press Tampered, and watch a good day fail. Nothing is sent to the network.",
  },
  {
    title: "Check",
    service: "Public log",
    body: "On Audit, press Check evidence. Your browser re-runs a published issuance from Hedera.",
  },
  {
    title: "Buy",
    service: "Optional",
    body: "Market needs MetaMask with a Hedera testnet ECDSA account. HashPack over WalletConnect will not send the purchase.",
  },
];

const Home: NextPage = () => (
  <div className="flex flex-col grow">
    <section className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal text-white px-5 py-16">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <span className="uppercase tracking-widest text-sm text-white/70">Hedera testnet demo</span>
        <h1 className="text-4xl md:text-5xl font-bold m-0 leading-tight">Hydro dMRV</h1>
        <p className="text-lg text-white/85 m-0 max-w-2xl">
          A practice desk for hydropower carbon credits. Press a scenario and see whether the readings would be allowed
          to become a credit. The two plants are demos. The tokens have no money value.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link href="/guide" className="btn bg-white text-hedera-indigo border-none hover:bg-white/90">
            Start here
          </Link>
          <Link href="/verify" className="btn btn-outline text-white border-white hover:bg-white/10">
            Try the verifier
          </Link>
          <Link href="/market" className="btn btn-outline text-white border-white hover:bg-white/10">
            Credit market
          </Link>
          <Link href="/methodology" className="btn btn-outline text-white border-white hover:bg-white/10">
            Methodology
          </Link>
          <Link href="/audit" className="btn btn-outline text-white border-white hover:bg-white/10">
            Audit trail
          </Link>
        </div>
      </div>
    </section>

    <div className="max-w-6xl w-full mx-auto px-5 py-10 flex flex-col gap-10">
      <section>
        <h2 className="text-2xl font-bold">How it works</h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 m-0 p-0 list-none">
          {STEPS.map((step, i) => (
            <li key={step.title} className="bg-base-100 border border-base-300 rounded-2xl p-4 flex flex-col gap-2">
              <span className="text-primary font-bold">
                {i + 1}. {step.title}
              </span>
              <span className="badge badge-outline badge-sm">{step.service}</span>
              <p className="text-sm text-base-content/70 m-0">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <RegistryStats />
      <AgentAccess />
    </div>
  </div>
);

export default Home;
