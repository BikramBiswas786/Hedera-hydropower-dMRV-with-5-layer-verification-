import Link from "next/link";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Audit note",
  description: "What is on chain, what an agent must not invent, and how to check one issuance",
});

const BlogPage: NextPage = () => (
  <article className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
    <p className="text-sm uppercase tracking-wide m-0 opacity-70">Notes · 26 September 2026</p>
    <h1 className="text-4xl font-bold m-0">Check one tonne before you trust the story</h1>
    <p className="text-lg m-0">
      This template is a hydropower worked example of a pattern any Hedera app can reuse: a contract that holds the
      credits, two price feeds that have to agree, and a public log you can recompute. The methodology is not the
      pattern. The pattern is the part worth copying.
    </p>

    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold m-0">What to open</h2>
      <ol className="m-0 pl-5 flex flex-col gap-2">
        <li>
          <Link href="/verify">Verify</Link> a healthy day, then an inflated one. Only the first is approved.
        </li>
        <li>
          <Link href="/audit">Audit</Link> and press <strong>Check evidence</strong>. The page re-reads the HCS report
          and runs the same integers the contract used. The current message is <code>hydro-dmrv/report@4</code>. Older{" "}
          <code>@3</code> messages still reproduce; they are not what the screen writes today.
        </li>
        <li>
          <Link href="/market">Market</Link> shows the Chainlink price and the Supra fallback. A retirement is supposed
          to mint an NFT. The collection exists. Its supply is still zero until someone buys and retires.
        </li>
      </ol>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold m-0">What the testnet actually shows</h2>
      <p className="m-0">
        The two demo plants on the current registry are VMR0017. That is <code>design.methodology = 1</code> on chain,
        not a sentence in this note. Attestations #0 and #1 minted credits. The certificate token HYRET has not minted
        a serial yet. Messages 5–8 on the old topic are leftovers. Audit follows the sequence stored on the attestation,
        not every message on the topic.
      </p>
      <p className="m-0">
        If a page and Hashscan disagree, believe the contract. Do not edit the engine so the README looks tidy.
      </p>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold m-0">For an agent</h2>
      <p className="m-0">
        Read <code>AGENTS.md</code> first. One quantification lives in <code>methodology/quantify.ts</code> and again in{" "}
        <code>HydroCreditRegistry.quantify</code>. Change both or neither. Do not hand-edit <code>demoPlants.ts</code>.
        Do not add a second methodology file to look busy. <code>llms.txt</code>, the OpenAPI <code>operationId</code>s
        and the MCP tool names are one list.
      </p>
      <p className="m-0">
        Call <code>get_plant</code> and trust the methodology field you get back. A blog post is not a plant design.
      </p>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold m-0">What this is not</h2>
      <p className="m-0">
        Not a Verra issuance. Not a faucet. A local chain has no Hedera token service and no consensus topic unless you
        deploy them. Scaffold, then follow Quick start. There is no fifteen-minute shortcut around a funded testnet
        account if you want a new Hashscan link.
      </p>
    </section>
  </article>
);

export default BlogPage;
