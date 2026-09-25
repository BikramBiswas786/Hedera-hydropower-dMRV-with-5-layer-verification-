import type { ReactNode } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import type { NextPage } from "next";
import { ExternalLink } from "~~/components/hydro/ui";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Start here",
  description: "How to use Hydro dMRV as a visitor, a credit buyer, a plant operator, a developer or an AI agent",
});

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li className="flex gap-4">
    <span className="flex-none w-8 h-8 rounded-full bg-primary text-primary-content font-bold grid place-items-center">
      {n}
    </span>
    <div className="flex flex-col gap-1 pt-1">
      <span className="font-semibold">{title}</span>
      <div className="text-base-content/75 text-sm">{children}</div>
    </div>
  </li>
);

const Path = ({ id, who, time, children }: { id: string; who: string; time: string; children: ReactNode }) => (
  <section id={id} className="bg-base-100 border border-base-300 rounded-2xl p-6 flex flex-col gap-4 scroll-mt-20">
    <div className="flex flex-wrap items-baseline gap-3">
      <h2 className="text-2xl font-bold m-0">{who}</h2>
      <span className="badge badge-outline">{time}</span>
    </div>
    {children}
  </section>
);

const Code = ({ children }: { children: string }) => (
  <pre className="bg-base-200 rounded-xl p-3 text-xs overflow-x-auto m-0 whitespace-pre-wrap break-all">{children}</pre>
);

const PATHS = [
  ["#look", "Just looking", "5 min, no wallet"],
  ["#buy", "Buying credits", "10 min, testnet wallet"],
  ["#operate", "Running a plant", "an afternoon"],
  ["#build", "Building on it", "follow Quick start; local chain has no faucet"],
  ["#agents", "AI agents", "1 command"],
] as const;

const GuidePage: NextPage = async () => {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  return (
    <div className="flex flex-col gap-8 px-5 py-8 max-w-4xl w-full mx-auto">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold m-0">Start here</h1>
        <p className="text-lg text-base-content/80 m-0">
          A small hydropower plant sends clean electricity to a grid that would otherwise burn coal and gas. Every
          megawatt-hour it exports avoids some CO₂, and that avoided CO₂ can be sold as carbon credits. The hard part is
          proving the numbers are real. Hydro dMRV does that proof in public:
        </p>
        <ol className="list-decimal pl-6 m-0 flex flex-col gap-1 text-base-content/80">
          <li>
            the plant&apos;s meter <strong>signs</strong> its readings, so nobody can edit them later;
          </li>
          <li>
            a verification engine <strong>checks</strong> them (gaps, meters that disagree, physically impossible
            numbers) and <strong>calculates</strong> the CO₂ avoided with the UN&apos;s CDM formulas;
          </li>
          <li>
            the readings and the result are <strong>published</strong> on the Hedera Consensus Service, and a smart
            contract <strong>recalculates</strong> everything before it mints credits (1 credit = 1 tonne CO₂);
          </li>
          <li>
            anyone can <strong>buy and retire</strong> credits, get an NFT certificate, and <strong>re-check</strong>{" "}
            every figure from public data.
          </li>
        </ol>
        <nav className="flex flex-wrap gap-2 mt-2" aria-label="Pick your path">
          {PATHS.map(([href, who, time]) => (
            <a key={href} href={href} className="btn btn-sm btn-outline">
              {who} <span className="text-xs font-normal opacity-70">· {time}</span>
            </a>
          ))}
        </nav>
        <p className="text-sm text-base-content/60 m-0">
          This site runs on Hedera <strong>testnet</strong>: the credits are real tokens on a test network with no money
          value, and the two plants are demos. It is a working template of the full system, not a certified carbon
          registry.
        </p>
      </header>

      <Path id="look" who="Just looking" time="5 min, no wallet">
        <ol className="flex flex-col gap-4 m-0 p-0 list-none">
          <Step n={1} title="Watch the verifier catch a fraud">
            Open{" "}
            <Link href="/verify" className="link link-primary">
              Verify
            </Link>
            . The default <em>healthy</em> day is <span className="badge badge-success badge-sm">APPROVED</span> and
            shows the credits it would earn. Click <em>inflated</em> (the meter claims more power than the water can
            make) and <em>tampered</em> (numbers changed after the meter signed them): both turn{" "}
            <span className="badge badge-error badge-sm">REJECTED</span>, and the table says exactly why. Everything
            runs in your browser.
          </Step>
          <Step n={2} title="See what each plant has earned">
            <Link href="/plants" className="link link-primary">
              Plants
            </Link>{" "}
            lists the registered plants. Open one to see its design (size, reservoir, grid emission factor), every
            verified day, and the credits minted for it.
          </Step>
          <Step n={3} title="Re-check an issuance yourself">
            On{" "}
            <Link href="/audit" className="link link-primary">
              Audit
            </Link>
            , press <strong>Check evidence</strong> on any attestation. Your browser downloads the raw readings from
            Hedera&apos;s public mirror node, re-runs the calculation and compares every number with what the contract
            minted. &ldquo;Reproduced&rdquo; means you did not have to trust this website.
          </Step>
          <Step n={4} title="Read the rules">
            <Link href="/methodology" className="link link-primary">
              Methodology
            </Link>{" "}
            shows every equation (emission reductions = baseline − project emissions − leakage) with the demo
            plants&apos; numbers.
          </Step>
        </ol>
      </Path>

      <Path id="buy" who="Buying credits" time="10 min, testnet wallet">
        <ol className="flex flex-col gap-4 m-0 p-0 list-none">
          <Step n={1} title="Get a testnet wallet with test HBAR">
            Create an <strong>ECDSA</strong> account at{" "}
            <ExternalLink href="https://portal.hedera.com">portal.hedera.com</ExternalLink> (free test HBAR from its
            faucet), import its key into MetaMask and connect with the button in the header, on the Hedera Testnet
            network.
          </Step>
          <Step n={2} title="Buy and retire">
            On{" "}
            <Link href="/market" className="link link-primary">
              Market
            </Link>
            , pick a listing, enter how many tonnes and the name to put on the certificate (for example your company),
            and choose <strong>Buy &amp; retire</strong>. Prices are in US dollars per tonne and paid in HBAR at the
            live Chainlink rate, cross-checked with Supra. Retiring burns the credits so nobody can sell them again.
          </Step>
          <Step n={3} title="Keep the proof">
            You receive an NFT certificate. On{" "}
            <Link href="/portfolio" className="link link-primary">
              Portfolio
            </Link>{" "}
            search your wallet or company name to see every tonne retired and <strong>download a CSV</strong> for a
            sustainability report. Each row links to a printable certificate.
          </Step>
        </ol>
        <p className="text-sm text-base-content/60 m-0">
          No listing yet? Credits appear on the market once a plant operator lists them (next section).
        </p>
      </Path>

      <Path id="operate" who="Running a plant" time="an afternoon">
        <ol className="flex flex-col gap-4 m-0 p-0 list-none">
          <Step n={1} title="Check the project qualifies">
            Describe the plant (capacity, reservoir area, start date, grid data) and post it to{" "}
            <code>/api/methodology/assess</code>, or ask an agent to call <code>assess_project</code>. You get the
            methodology (AMS-I.D up to 15 MW, ACM0002 above), the grid emission factor, reservoir rules and the exact
            numbers to register on-chain.
          </Step>
          <Step n={2} title="Register it">
            The registry admin records the validated design on-chain (<code>registerPlant</code>, done for the demo
            plants by <code>yarn deploy</code>). From then on the contract refuses anything that breaks it.
          </Step>
          <Step n={3} title="Give the meter a key">
            <code>yarn mrv:meter-key</code> creates a key for the data logger; its address is registered with the plant.
            The logger signs every batch&apos;s totals (<code>yarn mrv:sign</code> or any Ethereum library), and the
            contract never mints more than the meter signed.
          </Step>
          <Step n={4} title="Attest and sell">
            <code>yarn mrv:attest</code> (or <code>POST /api/mrv/attest</code> with your API key) verifies a period,
            publishes it to HCS and mints the credits to you. Then open{" "}
            <Link href="/market" className="link link-primary">
              Market
            </Link>
            , choose <strong>List for sale</strong> and set a price in US dollars per tonne. When buyers pay, collect
            the HBAR under <em>Sale proceeds</em> in the same panel.
          </Step>
        </ol>
        <p className="text-sm text-base-content/60 m-0">
          A real project also needs an accredited validation/verification body (VVB) and a carbon standard; this system
          makes their checks reproducible, it does not replace them.
        </p>
      </Path>

      <Path id="build" who="Building on it" time="follow Quick start; local chain has no faucet">
        <p className="m-0 text-base-content/80">
          Hydro dMRV is a Scaffold-HBAR template: one command gives you the contracts, this app, the API and the MCP
          server, ready to change.
        </p>
        <Code>{`npm create scaffold-hbar@latest --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
yarn chain:offline               # terminal 1: local chain, no internet
yarn deploy --network localhost  # terminal 2: contracts, tokens, two demo plants
yarn start                       # terminal 3: http://localhost:3000`}</Code>
        <p className="m-0 text-sm text-base-content/75">
          Then deploy to testnet with <code>yarn deploy --network hederaTestnet</code>. The{" "}
          <ExternalLink href="https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-#readme">
            README
          </ExternalLink>{" "}
          walks through every step; <code>AGENTS.md</code> lists where things live and the rules to keep (units,
          rounding, security) so a coding agent can extend it safely. The whole REST API is described in{" "}
          <a href="/api/openapi.json" className="link link-primary">
            OpenAPI
          </a>
          .
        </p>
      </Path>

      <Path id="agents" who="AI agents" time="1 command">
        <p className="m-0 text-base-content/80">
          Everything a person can do here, an agent can do through the MCP server, without a browser and without sharing
          keys: it checks designs, verifies data, reproduces issuances, and buys credits with its own wallet (the server
          only prepares the unsigned transaction).
        </p>
        <Code>{`claude mcp add --transport http hydro-dmrv ${origin}/api/mcp`}</Code>
        <p className="m-0 text-sm font-semibold">Things to ask it</p>
        <ul className="list-disc pl-6 m-0 text-sm text-base-content/80 flex flex-col gap-1">
          <li>&ldquo;Generate the tampered scenario, verify it and explain why it is rejected.&rdquo;</li>
          <li>&ldquo;Reproduce attestation 1 from HCS and tell me whether the credits are justified.&rdquo;</li>
          <li>
            &ldquo;Would a 12 MW plant with a 1.8 km² reservoir qualify, and what is its reservoir emission rate?&rdquo;
          </li>
          <li>&ldquo;Show plant HYDRO-DEMO-02&apos;s lifetime emission reductions per MWh.&rdquo;</li>
          <li>&ldquo;Prepare a purchase of 1 tonne from listing 0, retired for Acme Corp.&rdquo;</li>
        </ul>
        <p className="m-0 text-sm text-base-content/75">
          Other agents and tools can read{" "}
          <a href="/llms.txt" className="link link-primary">
            /llms.txt
          </a>{" "}
          or the{" "}
          <a href="/api/openapi.json" className="link link-primary">
            OpenAPI description
          </a>
          ; every MCP tool has a REST twin with the same name.
        </p>
      </Path>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold m-0">Common questions</h2>
        <div className="join join-vertical w-full">
          {[
            [
              "Is this a real carbon registry?",
              "No. It implements the published CDM methodologies (AMS-I.D, ACM0002, TOOL07, TOOL03) and runs on Hedera testnet with demo plants. Credits it mints are not Verra or Gold Standard units. A real deployment needs a validated project, an accredited verifier and a standard's approval.",
            ],
            [
              "Why should I trust the numbers?",
              "You do not have to. The meter signs the readings, the readings are public on HCS, the contract recomputes the credits, and the Audit page lets your browser redo the whole calculation.",
            ],
            [
              "What stops a plant from over-claiming?",
              "Physics checks (energy the water cannot produce is not credited), two meters compared against each other, conservative rounding, a completeness floor, and the contract refusing anything outside the registered design or crediting period.",
            ],
            [
              "Can this website mint credits or move my money?",
              "No. This public deployment has no operator keys, so it cannot attest; purchases are signed by your own wallet.",
            ],
          ].map(([question, answer]) => (
            <div key={question} className="collapse collapse-arrow join-item border border-base-300 bg-base-100">
              <input type="radio" name="faq" aria-label={question} />
              <div className="collapse-title font-semibold">{question}</div>
              <div className="collapse-content text-sm text-base-content/80">
                <p className="m-0">{answer}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GuidePage;
