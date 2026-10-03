import Link from "next/link";
import { AgentAccess } from "./_components/AgentAccess";
import { RegistryStats } from "./_components/RegistryStats";
import type { NextPage } from "next";

const STEPS = [
  {
    title: "Verify a day",
    service: "No wallet",
    body: "Open Verify and press Tampered. A good day fails. Nothing is sent to the network.",
    href: "/verify",
  },
  {
    title: "Reproduce an issuance",
    service: "Public log",
    body: "On Audit, press Check evidence. The browser re-runs a published issuance from Hedera.",
    href: "/audit",
  },
  {
    title: "Preview a purchase",
    service: "Wallet only to sign",
    body: "The market quotes without a wallet. Connect only when you are ready to sign. HashPack must be an ECDSA account.",
    href: "/market",
  },
];

const Home: NextPage = () => (
  <div className="flex flex-col grow">
    <section className="px-5 py-16 text-white" style={{ background: "#12241e" }}>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <span className="uppercase tracking-widest text-sm text-white/60">Hedera testnet</span>
        <h1 className="text-4xl md:text-5xl font-bold m-0 leading-tight">Hydro dMRV</h1>
        <p className="text-lg text-white/85 m-0 max-w-2xl">
          Guardian calculates a tonne and can mint it. This desk recomputes that tonne and will not agree to a different
          one. The plants are examples. The tokens are not Verra credits.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <Link
            href="/verify"
            className="btn border-none text-white hover:opacity-90"
            style={{ background: "#0c6b52" }}
          >
            Verify a day
          </Link>
          <Link href="/audit" className="btn btn-outline text-white border-white/40 hover:bg-white/10">
            Reproduce an issuance
          </Link>
          <Link href="/market" className="btn btn-outline text-white border-white/40 hover:bg-white/10">
            Preview a purchase
          </Link>
        </div>
      </div>
    </section>

    <div className="max-w-6xl w-full mx-auto px-5 py-10 flex flex-col gap-10">
      <section>
        <h2 className="text-2xl font-bold m-0">Start without an account</h2>
        <p className="text-base-content/70 mt-2 mb-4 max-w-2xl">
          The contract stores an HCS sequence. It cannot read the message. The verifier and the audit page do. A sale
          reverts while the testnet pair is more than 3% from the oracle. This template does not run a keeper.
        </p>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 m-0 p-0 list-none">
          {STEPS.map((step, i) => (
            <li key={step.title} className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-2">
              <span className="text-sm font-semibold" style={{ color: "#0c6b52" }}>
                0{i + 1}
              </span>
              <Link href={step.href} className="text-lg font-semibold text-base-content no-underline hover:underline">
                {step.title}
              </Link>
              <span className="badge badge-outline badge-sm w-fit">{step.service}</span>
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
