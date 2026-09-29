# Hydro dMRV

**Guardian decides what a credit is. This template makes the token prove it on-chain.**

[Hedera Guardian](https://github.com/hashgraph/guardian) runs methodology policies, roles and verifiable credentials, and its library already ships the hydro methodologies. It leaves two things off-chain: a Guardian mint is whatever number a policy rule computed, and a minted credit has no price, no market and no contract another dApp can call. This Scaffold-HBAR template is that on-chain half:

- **The VCS project cycle, enforced by a contract.** `DmrvRegistry` holds the HTS supply key and follows Verra's order: a project is registered only with a VVB's validation signature; each monitoring period is signed by the plant's meter, quantified on-chain by the methodology module (`ER = BE − PE − LE`) and recorded in a hash chain, **without issuing anything**; credits are issued only when a VVB verifies a run of records, signing the chain head and its report on HCS, and it may only lower the figures. Readings and reports go to HCS, so anyone can re-derive every record.
- **A dollar price, paid through SaucerSwap.** `UsdSettlement` prices HBAR from Chainlink (Supra fallback) and swaps the buyer's HBAR to the seller through SaucerSwap, reverting while the pool is more than 3% from the oracle. Remove the router and there is no sale. `CreditMarket` uses it for credits, `UsdCheckout` for **any** HTS token.
- **One engine per methodology, reported the way Verra writes it.** Each methodology is a plug-in engine (`services/mrv/engines/`) paired with an `IMethodology` contract behind the same registry: hydropower (VMR0017 v1.0 / ACM0002 v22.0 / AMS-I.D) and solar, wind and ocean power (VMR0017 v1.0 / ACM0002 v22.0). The solar, wind and ocean module is deployed and approved on the testnet registry; no solar, wind or ocean project is registered there yet. Every finding cites the clause it enforces (VMR0017 §9.2, ACM0002 ¶82, …) and every report carries the methodology's data and parameters table: EF_grid,CM, EF_Res, EF_embodied, EG_facility, TEG, PE_HP, PE_FF, LE, ER, each with its value, source, QA/QC, equation and clause.
- **A buyer's check on Guardian tokens, in the purchase path.** `trace_guardian_mint` follows a Guardian mint to its signed VP through the mirror node and CID-checked IPFS, with no Guardian login. The checkout builds no purchase for a token whose Guardian record does not check out.

Hedera services in play: HTS (a credit token and a certificate NFT whose treasury and supply keys are the registry contract), HCS (readings and reports), smart contracts with the HTS system contract at `0x167`, the Schedule Service (2-of-3 admin calls, `yarn admin:exec`), and the mirror node for every read-back.

## Check it on testnet

| What | Open it |
| --- | --- |
| A VVB-validated registration (HYDRO-DEMO-01, Uganda, 0.5 MW run-of-river under VMR0017) | [0xc6fb2f1e…](https://hashscan.io/testnet/transaction/0xc6fb2f1e9b16b59e5a11134f4276cc9878ee5969fd5f4165edcf49f27b1ca520) |
| Two meter-signed monitoring records, quantified on-chain, issuing nothing | [0x0e3ed83c…](https://hashscan.io/testnet/transaction/0x0e3ed83c7a946f9b3ace4fa313d0beb11f57b11aa863efead770d82cb9e30d39) · [0x18676337…](https://hashscan.io/testnet/transaction/0x18676337a85c9ba59aa75aca4d251a14aa25960f9ed2df0afe2fa61a2a1a7ddc) · [reproduce record 0 from HCS](https://hydro-dmrv.vercel.app/api/registry/attestations/0/reproduce) |
| The VVB's verification of both records, which alone issued 1.537 t | [verifyPeriod 0xffe81724…](https://hashscan.io/testnet/transaction/0xffe81724e83bc9fd4e85bae234e3654588d48f0833a0e18fc865f25fd0e391c4) · [verification report on HCS](https://hashscan.io/testnet/topic/0.0.10729650/message/21) |
| A verified **deficit**: a storage plant whose reservoir and embodied emissions exceed what it displaces on Uganda's grid; approved, nothing issued, −2.689 t carried | [0x036c34f5…](https://hashscan.io/testnet/transaction/0x036c34f5f3431eea65eb2a42681119a5240f34e497ece09c572c7125d623a1a8) |
| An agent's `buyAndRetire` through SaucerSwap on [`CreditMarket`](https://hashscan.io/testnet/contract/0x48F5056EdaD0B16c97a54085512b48417bC40F04), from a separate buyer | [0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0) · [would a sale settle now?](https://hydro-dmrv.vercel.app/api/market/dex) |
| A Managed Guardian mint traced `backed` (signatures, token, amount, treasury), then sold through `UsdCheckout` | [trace](https://hydro-dmrv.vercel.app/api/guardian/v1/trace?ref=0.0.10238177-1790602426-400520522) · [buy 0x01886451…](https://hashscan.io/testnet/transaction/0x0188645163e1bf1aa3cfac7ca72a0c31b9c4cc655938c9edde6746be9cbc0bfe) |
| Negative: the same holder with a wrong token id finds no Guardian record (HTTP 422), never `backed`; the builder answers 409 for `not-backed` or `incomplete`, and its test fails if the trace call is removed | [trace, wrong token](https://hydro-dmrv.vercel.app/api/guardian/v1/trace?ref=ft:0.0.10760320:0.0.10721162) · [`checkout.purchase.test.ts`](packages/nextjs/services/mrv/server/checkout.purchase.test.ts) |
| The same settlement against SaucerSwap's public mainnet WHBAR/USDC pair `0.0.1462797` and mainnet Chainlink | [Mainnet fork](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-fork.yml) (every push) · `publicMainnet` in [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) |
| A 2-of-3 admin call that waited for a second signature (Schedule Service) | [schedule 0.0.10764799](https://hashscan.io/testnet/schedule/0.0.10764799) |

Every step after the deploy was run by the [Testnet evidence](.github/workflows/testnet-evidence.yml) workflow with the same CLI an operator and a VVB use, and `yarn mrv:reproduce` re-derives every record from public data. The six testnet contracts are Sourcify-verified (exact match). Every address and transaction: [docs/evidence.md](docs/evidence.md).

**Limits, stated plainly**

- **These are not Verra credits.** A unit is one tonne of verified emission reductions under the plant's registered methodology, issued by this registry. The demo plants' additionality evidence is illustrative and no impact assessment exists for them. On testnet one person holds the operator, meter and labelled demo VVB keys, which a real deployment must never do.
- The testnet SaucerSwap pair holds a test USD token this project minted, because the public testnet USDC pair prices HBAR near $2. A keeper holds the pair at the oracle; a large purchase can push it out of band until the keeper runs. On mainnet the same code uses the public WHBAR/USDC pair.
- The Guardian check runs in the purchase builder (REST, MCP, UI), not in the contract: a contract cannot verify a VP's Ed25519 signatures and IPFS documents. A caller who skips the builder skips the check.
- The demo grid factor is Uganda's published CDM standardized baseline (ASB0054-2022, 2017–2019 data), re-weighted with VT0011. That baseline expired on 9 August 2025, and the demo plants were registered in 2026, outside its validity window; a real project needs a new VT0011 calculation. The Uganda tonnes illustrate the arithmetic, not a current grid.
- The contract checks that each record and verification cites a non-zero sequence on the audit topic `0.0.10729650`. It cannot load that message: the EVM has no access to HCS content. `yarn mrv:reproduce`, the app and the VVB flow read it and refuse a mismatch; a direct `verifyPeriod` call can cite a sequence whose bytes are something else.
- `evidenceHash` in a verification is an optional, single-use label. The contract checks nothing about what it names; it is not a Guardian proof.
- The meter uncertainty `U(BE_y)` (VMR0017 §9.2) is reported with each record, not deducted from the tonnes. The conservative QA/QC (lower of two meters, MPE after calibration expiry) is deducted.

> **Disclaimer.** Contracts, app and tooling are experimental and not audited. The engine implements published equations; it is not a certification body.

## Quick start: a working market in five minutes, no Hedera account

Prerequisites: Node.js ≥ 20.18.3, Git, Yarn via Corepack (`corepack enable`).

```bash
npm create scaffold-hbar@latest -- hydro-dmrv \
  --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
cd hydro-dmrv

# cloned this repo instead? run `yarn install` first
yarn chain:offline                 # terminal 1: local chain
yarn deploy --network localhost    # terminal 2: contracts, stand-ins, a validated plant, one verified record, one listing
yarn start                         # terminal 3: http://localhost:3000
```

The deploy installs local stand-ins for HTS, Chainlink, Supra and SaucerSwap, registers two demo plants with a local VVB's validation, records one hour of `HYDRO-DEMO-01` signed by its demo meter key, has the local VVB verify it (which issues the credits), and lists them at $15/t. `yarn start` sees the local deploy and targets it. Open `/market`, press **100 local HBAR** in the footer to fund the burner wallet, then **Buy & retire**; the retirement and its certificate appear in `/portfolio`. All keys on a local chain are public demo keys; the deploy refuses them on Hedera.

Then:

- `/verify` runs the five-stage engine: `healthy` passes, `inflated` and `tampered` do not.
- `yarn test` runs 145 contract tests and 373 app tests, including the Solidity and TypeScript quantification agreeing on the same integers.

## Deploy to Hedera testnet

```bash
yarn hardhat:account:import                            # an ECDSA testnet account from portal.hedera.com
yarn hardhat:meter-keys --network hederaTestnet        # one meter key per plant (.secrets/, gitignored)
yarn deploy --network hederaTestnet                    # creates the HTS token and NFT collection
yarn mrv:create-topic                                  # the HCS audit topic
yarn mrv:record healthy HYDRO-DEMO-01                  # monitoring: verify, publish to HCS, record (issues nothing)
yarn mrv:verify HYDRO-DEMO-01                          # the VVB's report on HCS; writes verification-HYDRO-DEMO-01-0-0.json
VVB_PRIVATE_KEY=0x… yarn mrv:approve verification-HYDRO-DEMO-01-0-0.json   # the VVB signs on its own machine
yarn mrv:submit verification-HYDRO-DEMO-01-0-0.json    # relay it; the approval issues the credits
yarn mrv:reproduce                                     # anyone: re-derive every record from HCS
```

| Variable (`packages/nextjs/.env.local`) | Needed for |
| --- | --- |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HCS_TOPIC_ID` | publishing readings and reports to HCS |
| `MRV_API_KEY` | the record and verification APIs and MCP write tools (unset: writes are off) |
| `NEXT_PUBLIC_TARGET_NETWORK` | `local` or `testnet`, to override the automatic choice |

`packages/hardhat/.env` takes `VERIFIER_ADDRESS` (the VVB, which must sign each plant's validation before it is registered) and `ADMIN_ADDRESS` (a 2-of-3 threshold account). Every variable is in [docs/operations.md](docs/operations.md).

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

`get_dex_price → list_open_listings → prepare_purchase → sign and send` buys with the agent's own key; `reproduce_attestation` re-derives any record from HCS and `get_pending_verification` shows what a VVB verifies next. Public tools need no key; `record_monitoring`, `prepare_verification` and `submit_verification` appear only with `Authorization: Bearer $MRV_API_KEY`, and none of them signs as a VVB. Tools, REST twins and OpenAPI: [docs/agents.md](docs/agents.md).

Writing Hedera code with an agent? [`HEDERA_FACTS.md`](HEDERA_FACTS.md) lists 24 Hedera behaviours that break code (tinybar vs weibar, HTS response codes, association, the testnet USDC pair, forking limits), each with the test or workflow that proves it. [`AGENTS.md`](AGENTS.md) has the repo's invariants and recipes for a new methodology or a new asset to sell.

## How it compares to Guardian

| | Guardian / Managed Guardian | This template |
| --- | --- | --- |
| Methodology policies, roles, VC/DID documents, trust chain | Yes | No, use Guardian |
| Who decides the minted amount | A policy rule, run by the Guardian service | The contract's methodology module, from meter-signed records, issued only on a VVB's verification |
| Price, sale, DEX settlement, a contract to compose with | No | Chainlink + Supra, SaucerSwap, `CreditMarket`, `UsdCheckout` |
| A buyer or agent checking a minted token | Trust chain in the Guardian UI; the indexer API needs an account | `trace_guardian_mint` / `GET /api/guardian/v1/trace`, public data only |
| How you start | Docker services and MongoDB, or MGS | `npm create scaffold-hbar` |

## Docs

| | |
| --- | --- |
| Testnet addresses and transactions, how buying works, keys, limits | [docs/evidence.md](docs/evidence.md) |
| The VCS cycle on-chain; registry, module, market and checkout functions, EIP-712 types, roles, pool guard | [docs/contract.md](docs/contract.md) |
| Equations, five stages, scenarios, HCS reproduction | [docs/methodology.md](docs/methodology.md) |
| Which clause of VMR0017, ACM0002, AMS-I.D, VT0008–VT0011 and VCS v5 is implemented where | [docs/standards.md](docs/standards.md) |
| Environment variables, every script, pages, layout, security limits | [docs/operations.md](docs/operations.md) |
| What the tests pin | [docs/testing.md](docs/testing.md) |
| Guardian: buyer's mint trace, cross-check VC, evidence check, policy patch | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
| MCP tools and REST twins | [docs/agents.md](docs/agents.md) |

Hedera Harness spec and validators are in [`.harness/`](.harness/); `yarn harness:validate` runs Tiers 0–2 with no credentials.

MIT, see [LICENCE](LICENCE). Built on [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar).
