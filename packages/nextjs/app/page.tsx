import Link from "next/link";
import { AgentAccess } from "./_components/AgentAccess";
import { RegistryStats } from "./_components/RegistryStats";
import type { NextPage } from "next";

const STEPS = [
  {
    title: "Meter",
    service: "Plant SCADA",
    body: "Hourly flow, head, energy and water-quality readings from the plant's data logger.",
  },
  {
    title: "Verify",
    service: "5-layer engine",
    body: "Physics, temporal, environmental, statistical and device checks produce a trust score and a decision.",
  },
  {
    title: "Anchor",
    service: "HCS",
    body: "Raw readings and the report are published to a Consensus Service topic, so anyone can re-run the verification.",
  },
  {
    title: "Issue",
    service: "HTS + Solidity",
    body: "HydroREC re-checks capacity, period overlap and trust, then mints HTS RECs: 1 token = 1 MWh.",
  },
  {
    title: "Settle",
    service: "Chainlink + Supra",
    body: "RECs are priced in USD and paid in HBAR at a cross-checked oracle rate. Retiring burns them and mints an NFT certificate.",
  },
];

const Home: NextPage = () => (
  <div className="flex flex-col grow">
    <section className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal text-white px-5 py-16">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <span className="uppercase tracking-widest text-sm text-white/70">Scaffold-HBAR template</span>
        <h1 className="text-4xl md:text-5xl font-bold m-0 leading-tight">Hydro dMRV</h1>
        <p className="text-lg text-white/85 m-0 max-w-2xl">
          Digital measurement, reporting and verification for run-of-river hydropower. Turn metered generation into
          renewable energy certificates that anyone can audit, trade and retire on Hedera.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link href="/verify" className="btn bg-white text-hedera-indigo border-none hover:bg-white/90">
            Try the verifier
          </Link>
          <Link href="/market" className="btn btn-outline text-white border-white hover:bg-white/10">
            REC market
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
        <ol className="grid grid-cols-1 md:grid-cols-5 gap-4 m-0 p-0 list-none">
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
