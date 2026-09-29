# Hydro dMRV

**Guardian decides what a credit is. This template makes the token prove it on-chain.**

[Hedera Guardian](https://github.com/hashgraph/guardian) runs methodology policies, roles and verifiable credentials, and its library already ships the hydro methodologies. It leaves two things off-chain: a Guardian mint is whatever number a policy rule computed, and a minted credit has no price, no market and no contract another dApp can call. This Scaffold-HBAR template is that on-chain half:

- **Issuance a contract enforces.** `DmrvRegistry` holds the HTS supply key and mints only with two EIP-712 signatures (the plant's meter over the raw totals, and a VVB who may only lower figures), and only the integer its methodology module recomputes: `ER = BE − PE − LE`. Readings and reports go to HCS, so anyone can re-derive a mint.
- **A dollar price, paid through SaucerSwap.** `UsdSettlement` prices HBAR from Chainlink (Supra fallback) and swaps the buyer's HBAR to the seller through SaucerSwap, reverting while the pool is more than 3% from the oracle. Remove the router and there is no sale. `CreditMarket` uses it for credits, `UsdCheckout` for **any** HTS token.
- **One engine per methodology, reported the way Verra writes it.** Each methodology is a plug-in engine (`services/mrv/engines/`) paired with an `IMethodology` contract behind the same registry: hydropower (VMR0017 v1.0 / ACM0002 v22.0 / AMS-I.D) and solar, wind and ocean power (VMR0017 v1.0 / ACM0002 v22.0). The solar, wind and ocean module runs in `/verify` and the tests; it is not yet approved on the testnet registry, so no solar credit has been minted there. Every finding cites the clause it enforces (VMR0017 §9.2, ACM0002 ¶82, …) and every report carries the methodology's data and parameters table: EF_grid,CM, EF_Res, EF_embodied, EG_facility, TEG, PE_HP, PE_FF, LE, ER, each with its value, source, QA/QC, equation and clause.
- **A buyer's check on Guardian tokens, in the purchase path.** `trace_guardian_mint` follows a Guardian mint to its signed VP through the mirror node and CID-checked IPFS, with no Guardian login. The checkout builds no purchase for a token whose Guardian record does not check out.

Hedera services in play: HTS (a credit token and a certificate NFT whose treasury and supply keys are the registry contract), HCS (readings and reports), smart contracts with the HTS system contract at `0x167`, the Schedule Service (2-of-3 admin calls, `yarn admin:exec`), and the mirror node for every read-back.

## Check it on testnet

| What | Open it |
| --- | --- |
| A meter + VVB signed mint, recomputed on-chain (4.791 t) | [0x321b6d20…](https://hashscan.io/testnet/transaction/0x321b6d20db7b24eaee672160fcb9643d6fafd357c204934e892446ac6db11b6e) · [reproduce from HCS](https://hydro-dmrv.vercel.app/api/registry/attestations/0/reproduce) |
| `buyAndRetire` through SaucerSwap on the current market [`0x26E77708…`](https://hashscan.io/testnet/contract/0x26E77708717cE69EBBBF76e59D106B20e67e1D61) | [0xbbeb258c…](https://hashscan.io/testnet/transaction/0xbbeb258c78ae6f1d9c2bfcbea37d754a151102b25528f63074f5e7f4c2b065f0) · [would a sale settle now?](https://hydro-dmrv.vercel.app/api/market/dex) |
| A Managed Guardian mint traced `backed` (signatures, token, amount, treasury), then sold through `UsdCheckout` | [trace](https://hydro-dmrv.vercel.app/api/guardian/v1/trace?ref=0.0.10238177-1790602426-400520522) · [buy 0x01886451…](https://hashscan.io/testnet/transaction/0x0188645163e1bf1aa3cfac7ca72a0c31b9c4cc655938c9edde6746be9cbc0bfe) |
| Negative: the same holder with a wrong token id finds no Guardian record (HTTP 422), never `backed`; an edited amount or token in the VP fails its signature; the builder answers 409 for `not-backed` or `incomplete`, and its test fails if the trace call is removed | [trace, wrong token](https://hydro-dmrv.vercel.app/api/guardian/v1/trace?ref=ft:0.0.10760320:0.0.10721162) · [`checkout.purchase.test.ts`](packages/nextjs/services/mrv/server/checkout.purchase.test.ts) · [`trace.test.ts`](packages/nextjs/services/mrv/guardian/trace.test.ts) |
| The same settlement against SaucerSwap's public mainnet WHBAR/USDC pair `0.0.1462797` and mainnet Chainlink | [Mainnet fork](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-fork.yml) (every push) · `publicMainnet` in [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) |
| A 2-of-3 admin call that waited for a second signature (Schedule Service) | [schedule 0.0.10764799](https://hashscan.io/testnet/schedule/0.0.10764799) |

The five testnet contracts are Sourcify-verified (exact match). Every address, transaction and the workflows that re-check them against Hedera: [docs/evidence.md](docs/evidence.md).

**Limits, stated plainly**

- The testnet SaucerSwap pair holds a test USD token this project minted, because the public testnet USDC pair prices HBAR near $2. A keeper holds the pair at the oracle; a large purchase can push it out of band until the keeper runs. On mainnet the same code uses the public WHBAR/USDC pair.
- The VVB and meter keys on testnet are labelled test keys, not an accredited verifier or data-logger hardware. These credits are not a Verra issuance.
- The Guardian check runs in the purchase builder (REST, MCP, UI), not in the contract: a contract cannot verify a VP's Ed25519 signatures and IPFS documents. A caller who skips the builder skips the check.
- The testnet registry and hydro module were deployed on 26 Sep, before the single `setMarket` and the VCS v5 renewal rule in the source; the market and checkout are the current source.

> **Disclaimer.** Contracts, app and tooling are experimental and not audited. The engine implements published equations; it is not a certification body.

## Quick start: a working market in five minutes, no Hedera account

Prerequisites: Node.js ≥ 20.18.3, Git, Yarn via Corepack (`corepack enable`).

```bash
npm create scaffold-hbar@latest -- hydro-dmrv \
  --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
cd hydro-dmrv

# cloned this repo instead? run `yarn install` first
yarn chain:offline                 # terminal 1: local chain
yarn deploy --network localhost    # terminal 2: contracts, stand-ins, one minted batch, one listing
yarn start                         # terminal 3: http://localhost:3000
```

The deploy installs local stand-ins for HTS, Chainlink, Supra and SaucerSwap, registers two demo plants, mints one hour of `HYDRO-DEMO-01` signed by its demo meter key and a local VVB key, and lists the credits at $15/t. `yarn start` sees the local deploy and targets it. Open `/market`, press **100 local HBAR** in the footer to fund the burner wallet, then **Buy & retire**; the retirement and its certificate appear in `/portfolio`. All keys on a local chain are public demo keys; the deploy refuses them on Hedera.

Then:

- `/verify` runs the five-stage engine: `healthy` passes, `inflated` and `tampered` do not.
- `yarn test` runs 191 contract tests and 352 app tests, including the Solidity and TypeScript quantification agreeing on the same integers.

## Deploy to Hedera testnet

```bash
yarn hardhat:account:import                            # an ECDSA testnet account from portal.hedera.com
yarn hardhat:meter-keys --network hederaTestnet        # one meter key per plant (.secrets/, gitignored)
yarn deploy --network hederaTestnet                    # creates the HTS token and NFT collection
yarn mrv:create-topic                                  # the HCS audit topic
yarn mrv:attest healthy HYDRO-DEMO-01                  # step 1: verify and anchor on HCS
VVB_PRIVATE_KEY=0x… yarn mrv:approve attest-HYDRO-DEMO-01-0.json   # the VVB signs on its own machine
yarn mrv:submit attest-HYDRO-DEMO-01-0.json            # step 2: relay both signatures; the contract mints
```

| Variable (`packages/nextjs/.env.local`) | Needed for |
| --- | --- |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HCS_TOPIC_ID` | publishing readings and reports to HCS |
| `MRV_API_KEY` | the attestation API and MCP write tool (unset: writes are off) |
| `NEXT_PUBLIC_TARGET_NETWORK` | `local` or `testnet`, to override the automatic choice |

`packages/hardhat/.env` takes `VERIFIER_ADDRESS` (the VVB) and `ADMIN_ADDRESS` (a 2-of-3 threshold account). Every variable is in [docs/operations.md](docs/operations.md).

| Market: oracle price, SaucerSwap check, listing | Verify: the five-stage engine on a day of readings |
| --- | --- |
| ![Credit market](docs/images/market.png) | ![Verify and quantify](docs/images/verify.png) |

## Use it without carbon

Most Hedera apps that sell something want a dollar price and HBAR payment. `UsdCheckout` puts the settlement in front of any HTS fungible token: tickets, real-world-asset shares, in-game items.

```solidity
// seller: token.approve(checkout, amount) on the HTS token's ERC-20 facade, then
checkout.createListing(token, amount, 1_250);        // $12.50 per whole token, escrowed in the checkout
// buyer: token.associate() once (HIP-719), then
uint256 tinybar = checkout.quote(listingId, amount); // Chainlink (Supra fallback), after SaucerSwap agrees within 3%
checkout.buy{ value: tinybar }(listingId, amount);   // HBAR is swapped to the pair's USD token for the seller
```

A stale feed, a pool more than 3% from the oracle, or a pool SaucerSwap's factory did not create blocks the sale rather than making it cheaper, and no admin function can move escrowed tokens ([tests](packages/hardhat/test/UsdCheckout.test.ts)).

## For AI agents

```bash
claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp
```

`get_dex_price → list_open_listings → prepare_purchase → sign and send` buys with the agent's own key; `reproduce_attestation` re-derives any mint from HCS. Public tools need no key; `submit_attestation` appears only with `Authorization: Bearer $MRV_API_KEY`. Tools, REST twins and OpenAPI: [docs/agents.md](docs/agents.md).

Writing Hedera code with an agent? [`HEDERA_FACTS.md`](HEDERA_FACTS.md) lists 24 Hedera behaviours that break code (tinybar vs weibar, HTS response codes, association, the testnet USDC pair, forking limits), each with the test or workflow that proves it. [`AGENTS.md`](AGENTS.md) has the repo's invariants and recipes for a new methodology or a new asset to sell.

## How it compares to Guardian

| | Guardian / Managed Guardian | This template |
| --- | --- | --- |
| Methodology policies, roles, VC/DID documents, trust chain | Yes | No, use Guardian |
| Who decides the minted amount | A policy rule, run by the Guardian service | The contract, with meter and VVB signatures |
| Price, sale, DEX settlement, a contract to compose with | No | Chainlink + Supra, SaucerSwap, `CreditMarket`, `UsdCheckout` |
| A buyer or agent checking a minted token | Trust chain in the Guardian UI; the indexer API needs an account | `trace_guardian_mint` / `GET /api/guardian/v1/trace`, public data only |
| How you start | Docker services and MongoDB, or MGS | `npm create scaffold-hbar` |

## Docs

| | |
| --- | --- |
| Testnet addresses and transactions, how buying works, keys, limits | [docs/evidence.md](docs/evidence.md) |
| Architecture; registry, module, market and checkout functions, EIP-712 types, roles, pool guard | [docs/contract.md](docs/contract.md) |
| Equations, five stages, scenarios, HCS reproduction | [docs/methodology.md](docs/methodology.md) |
| Which clause of VMR0017, ACM0002, AMS-I.D, VT0008–VT0011 and VCS v5 is implemented where | [docs/standards.md](docs/standards.md) |
| Environment variables, every script, pages, layout, security limits | [docs/operations.md](docs/operations.md) |
| What the tests pin | [docs/testing.md](docs/testing.md) |
| Guardian: buyer's mint trace, cross-check VC, evidence check, policy patch | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
| MCP tools and REST twins | [docs/agents.md](docs/agents.md) |

Hedera Harness spec and validators are in [`.harness/`](.harness/); `yarn harness:validate` runs Tiers 0–2 with no credentials.

MIT, see [LICENCE](LICENCE). Built on [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar).
