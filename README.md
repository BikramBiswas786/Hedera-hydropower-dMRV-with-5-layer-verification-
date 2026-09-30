# Hydro dMRV

One command gives you a local market where you can buy and retire a carbon credit. No Hedera account is required for that.

The contract decides how many tonnes exist. A validator signs the plant design before it can be registered. The plant's meter signs each monitoring period, and that signature does not mint anything. A second signature, over a run of those periods, is what issues tonnes, and it can only lower the figure. The sale prices HBAR from Chainlink, uses Supra if Chainlink is stale, and reverts unless the HBAR is swapped through SaucerSwap. The readings are on HCS, so anyone can recompute the number.

## Prerequisites

- Node.js 20.18.3 or newer
- Git
- Yarn, from Corepack: `corepack enable`

That is enough for the quick start. A funded ECDSA testnet account is required only in [Deploy to Hedera testnet](#deploy-to-hedera-testnet).

## Quick start: a working market in five minutes, no Hedera account

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

## Architecture

| Package | What it owns |
| --- | --- |
| `packages/hardhat` | `DmrvRegistry` (validation, monitoring, verification, issuance, and every HTS call), `HydroVmr0017Module` and `RenewableVmr0017Module` (the maths), `CreditMarket` and `UsdCheckout` (a USD price settled on SaucerSwap), `ResilientHbarUsdFeed` (Chainlink, then Supra) |
| `packages/nextjs` | The same maths in TypeScript, the pages, REST, and the MCP server |

```mermaid
flowchart LR
  subgraph Issue["Issue: DmrvRegistry"]
    VAL["VVB validation signature"] --> REG["registerProject"]
    REG --> MET["Meter-signed period"]
    MET --> REC["recordMonitoring: module computes ER, nothing is minted"]
    REC --> VER["verifyPeriod: VVB signs the record chain head"]
    VER -->|"mint whole kilograms of verified ER"| TOK[("HTS credit token")]
  end
  subgraph Sell["Sell: UsdSettlement"]
    LST["Listing priced in US cents"] --> QUO["Quote: Chainlink, Supra if stale"]
    QUO --> GRD{"SaucerSwap pair within 3% of the oracle?"}
    GRD -->|yes| SWP["Swap the buyer's HBAR to the seller's USD token"]
    GRD -->|no| REV["Revert"]
  end
  TOK --> LST
  SWP --> RET[("Retire: HTS NFT certificate")]
  REC -. "readings and report" .-> HCS[("HCS audit topic")]
  VER -. "verification report" .-> HCS
  HCS -. "yarn mrv:reproduce" .-> ANY["Anyone recomputes every record"]
```

The registry holds the credit token's supply key. A methodology module is called with `staticcall` and cannot mint. `UsdCheckout` sells any HTS fungible token with the same price and swap, so a developer can keep the market and delete the hydro methodology. The file tree is in [docs/operations.md](docs/operations.md#project-structure).

What the hydro path adds, and what it does not: Guardian still runs the policy, the roles and the verifiable credentials. This template is the on-chain half Guardian does not ship. A project is registered only with a validation signature. Each period is quantified on-chain (`ER = BE − PE − LE`) and recorded in a hash chain. Credits are issued only when a verifier signs that chain head and a report on HCS. `trace_guardian_mint` checks a Guardian mint from public data before `UsdCheckout` builds a purchase of that token. When the admin has marked the token, `buy` reverts and `buyTraced` requires a signature this server creates only after that trace is backed. The checkout at `0x455eFbF0…` was deployed before that function, so a token that is not marked still sells with `buy`. Hedera services in play: HTS, HCS, the HTS system contract at `0x167`, and the Schedule Service for a 2-of-3 admin.

**Terms.** A **VVB** is the independent validation and verification body that signs off a project. **Validation**
approves a plant's design before it may earn anything. A **monitoring record** is one metered period; the contract
computes its emission reduction, **ER = BE − PE − LE** (baseline emissions minus project emissions minus leakage),
and mints nothing. **Verification** is the VVB's signature over a run of records, and it alone mints: one token is
one tonne of CO2e, one base unit one kilogram. **Retirement** burns credits for a named beneficiary and mints an NFT
certificate.

## Ecosystem integrations, and what breaks without them

What a developer gets that is hard to build alone: a US-dollar price for any HTS token, paid in HBAR and settled
through SaucerSwap, that refuses stale prices, disagreeing oracles and pools that are off the market or not
SaucerSwap's own. `UsdCheckout` exposes it in three calls (see [Use it without carbon](#use-it-without-carbon)).

| Integration | What it does here | Remove it and | Code | On-chain proof |
| --- | --- | --- | --- | --- |
| **SaucerSwap V1** (router and factory) | Every sale swaps the buyer's HBAR to the seller's USD token through the router. The pool guard asks the factory's `getPair` for the pool, then blocks sales while its price is more than 3% from the oracle | There is no sale: `buy` and `buyAndRetire` revert | [`UsdSettlement.sol`](packages/hardhat/contracts/settlement/UsdSettlement.sol) | [buyAndRetire 0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0); the same guard against mainnet pair `0.0.1462797` in the [Mainnet fork](.github/workflows/mainnet-fork.yml) workflow |
| **Chainlink** HBAR/USD | Converts every US-cent price to tinybar | Nothing can be quoted | [`ResilientHbarUsdFeed.sol`](packages/hardhat/contracts/ResilientHbarUsdFeed.sol) | [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) reads it live |
| **Supra** HBAR/USDT (pair 75) | Takes over when Chainlink is stale; when both are fresh and disagree by more than 3%, sales stop | One stale feed pauses every sale | same | [`ResilientHbarUsdFeed.test.ts`](packages/hardhat/test/ResilientHbarUsdFeed.test.ts): fresh, stale, broken, disagreeing |
| **Hedera Guardian** and **IPFS** | `trace_guardian_mint` checks a Guardian mint's signed VP and its CID-checked IPFS documents. For a token the admin has marked, `UsdCheckout.buy` reverts and `buyTraced` checks a signature made only after that trace is backed | A marked token cannot be bought by skipping the trace. An unmarked token still can | [`UsdCheckout.sol`](packages/hardhat/contracts/UsdCheckout.sol), [`services/mrv/guardian/`](packages/nextjs/services/mrv/guardian/) | [token marked 0xc9937356…](https://hashscan.io/testnet/transaction/0xc99373563d891c814b86666674a2b9b1c8e271a7a5be2a01812a35ecf0f547cc), then [buyTraced 0x42212e6d…](https://hashscan.io/testnet/transaction/0x42212e6d7edc6725f9813921fe35d340c8bf7c91ccfafb92c31471895ba7e3ad) on [0xa42B11B3…](https://hashscan.io/testnet/contract/0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75). `buy` on that checkout reverts. The app still serves the earlier checkout until `TRACE_SIGNER_KEY` is set |

On testnet the public WHBAR/USDC pair prices HBAR near $2, so the sale swaps through a SaucerSwap V1 pair seeded at
the oracle price and kept there by a [keeper](.github/workflows/testnet-pair-keeper.yml). On mainnet the same
contract points at the public pair.

## Hedera services used

| Service | Where | What for |
| --- | --- | --- |
| Token Service (HTS), through the system contract at `0x167` | [`HederaTokenLib.sol`](packages/hardhat/contracts/lib/HederaTokenLib.sol), used only by `DmrvRegistry` and `UsdCheckout` | The credit token (3 decimals) and the retirement NFT, both created by the registry, which holds their treasury and supply keys; `UsdCheckout` escrows any HTS token |
| Consensus Service (HCS) | [`report.ts`](packages/nextjs/services/mrv/report.ts), [`verification.ts`](packages/nextjs/services/mrv/verification.ts) | Raw readings (up to 20 chunks), the monitoring report and the verification report; the contract stores each report's hash and sequence |
| Smart contracts | [`packages/hardhat/contracts`](packages/hardhat/contracts) | Registry, methodology modules (called with `staticcall`), market, checkout, price feed |
| Schedule Service | [`adminExec.ts`](packages/nextjs/scripts/adminExec.ts) | Admin calls from a 2-of-3 threshold account: one holder schedules, a second signs |
| Mirror node | [`mirror.ts`](packages/nextjs/services/mrv/mirror.ts) | Reads HCS messages, token associations and contract results back for reproduction |

## Environment variables

Nothing is required to run the local quick start or to browse the app. Copy the `.env.example` beside each package when you leave localhost.

| Variable (`packages/nextjs/.env.local`) | Needed for |
| --- | --- |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HCS_TOPIC_ID` | publishing readings and reports to HCS |
| `MRV_API_KEY` | the record and verification APIs and MCP write tools (unset: writes are off) |
| `NEXT_PUBLIC_TARGET_NETWORK` | `local` or `testnet`, to override the automatic choice |

`packages/hardhat/.env` takes `VERIFIER_ADDRESS` (the VVB, which must sign each plant's validation before it is registered) and `ADMIN_ADDRESS` (a 2-of-3 threshold account). Every variable is in [docs/operations.md](docs/operations.md).

| Market: oracle price, SaucerSwap check, listing | Verify: the five-stage engine on a day of readings |
| --- | --- |
| ![Credit market](docs/images/market.png) | ![Verify and quantify](docs/images/verify.png) |

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
- A contract cannot verify a Guardian VP's Ed25519 signatures or its IPFS documents. For a token the admin has marked, `UsdCheckout.buy` reverts and `buyTraced` checks an ECDSA signature this server creates only after the trace is backed. The checkout at `0x455eFbF0…` was deployed before that function, so a caller who skips the builder can still buy what is listed there. An unmarked token is not claimed to be a Guardian mint.
- The demo grid factor is Uganda's published CDM standardized baseline (ASB0054-2022, 2017–2019 data), re-weighted with VT0011. That baseline expired on 9 August 2025, and the demo plants were registered in 2026, outside its validity window; a real project needs a new VT0011 calculation. The Uganda tonnes illustrate the arithmetic, not a current grid.
- The contract checks that each record and verification cites a non-zero sequence on the audit topic `0.0.10729650`. It cannot load that message: the EVM has no access to HCS content. `yarn mrv:reproduce`, the app and the VVB flow read it and refuse a mismatch; a direct `verifyPeriod` call can cite a sequence whose bytes are something else.
- `evidenceHash` in a verification is an optional, single-use label. The contract checks nothing about what it names; it is not a Guardian proof.
- For a retrofit or capacity addition, a monitoring run the VVB rejects still counts toward the crediting year's energy, so later periods of that year can credit more ([contract.md](docs/contract.md)). Both demo plants are greenfield and unaffected.
- The meter uncertainty `U(BE_y)` (VMR0017 §9.2) is reported with each record, not deducted from the tonnes. The conservative QA/QC (lower of two meters, MPE after calibration expiry) is deducted.

> **Disclaimer.** Contracts, app and tooling are experimental and not audited. The engine implements published equations; it is not a certification body.

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

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| A purchase overpays by 10¹⁰ or reverts `InsufficientPayment` | `msg.value` is tinybar inside the EVM, but a JSON-RPC `value` is weibar | Send what `quote()` returns through `quoteToTxValue` ([`pricing.ts`](packages/nextjs/services/mrv/pricing.ts)) |
| The relay rejects a transaction for its fee | Hashio refuses EIP-1559 fees under its minimum gas price | Send a legacy transaction at `eth_gasPrice`, as the scripts do |
| `HtsCallFailed(…, 184)` on a purchase or withdrawal | The receiving account is not associated with the token | Call `associate()` on the token's own address first (HIP-719) |
| `HtsCallFailed(…, 292)` on `createListing` | The checkout has no allowance on the seller's token | `approve(checkout, amount)` on the token's ERC-20 facade |
| `PoolPriceDeviation`, or [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) shows `accepted: false` | The testnet pair drifted more than 3% from the oracle | Wait for the keeper, or run `yarn pair:rebalance --execute` |
| `StalePrice` | No oracle answer is newer than the market's maximum price age | Retry later; `/api/market/dex` shows each feed's age |
| `yarn deploy` changes nothing you can see | Without `--network` it deploys to an in-process chain that exits | Start `yarn chain:offline`, then `yarn deploy --network localhost` |
| A testnet deploy stops at the meter keys | Live networks refuse the public demo meter keys | `yarn hardhat:meter-keys --network hederaTestnet` |
| HashPack says the site is a malicious dapp, or “No applicable ECDSA accounts” | WalletConnect verify flags the shared scaffold project id, and an ED25519 account cannot sign | Choose HashPack’s ECDSA account (menu, add account, advanced, ECDSA), or MetaMask. A private Reown id in `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` clears the warning. The HashPack extension does not use that check |

Each of these has a test or workflow behind it in [`HEDERA_FACTS.md`](HEDERA_FACTS.md).

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
