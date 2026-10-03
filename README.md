![Hydro dMRV](docs/images/masthead.png)

# Hydro dMRV

Guardian will store a number and mint it. The portal will create a token. Neither will refuse a sale when the pool and the oracle disagree, neither will recompute the tonnes and then forbid a verifier from raising them, and neither will lock the HBAR and have Hedera complete the purchase later. This template does those three things. The registry is the worked example. The sale is the part you can use without it.

## 1. One command

This is the self-check, the same command the other templates publish. Node 20.18.3 or newer. Yarn comes from Corepack (`corepack enable`). Git needs a name and an email before that command, or the scaffolder's first commit fails.

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

```bash
npm create scaffold-hbar@latest -- --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-
cd my-hedera-dapp
yarn demo
```

Run the create line alone. If npm asks `Ok to proceed? (y)`, type `y` and Enter. Do not paste `cd` into that prompt. That answer cancels the install, and `yarn demo` then fails because the shell is still in your home folder.

PowerShell, one line, no prompt:

```powershell
$env:npm_config_yes='true'; npm create scaffold-hbar@latest -- my-hedera-dapp --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification- --yes; if ($LASTEXITCODE -eq 0) { Set-Location .\my-hedera-dapp; yarn demo }
```

Checked 3 Oct 2026 from an empty directory. The create command exited 0 and wrote `my-hedera-dapp`. `yarn demo` then exited 0: local chain, stand-ins, 39 kg listed, `healthy` approved, `inflated` and `tampered` rejected, `buyAndRetire` success.

The scaffolder selects Hardhat and Yarn from `template.json`. `yarn demo` needs no Hedera account. `yarn checkout:demo` is the same sale with no registry. It lists event tickets at $12.50, buys one, then shows `PoolPriceDeviation` and `StalePrice`. It then locks the HBAR for a later ticket. Firing that call while the pool is off returns the HBAR. Firing it while the pool agrees delivers the ticket.

## 2. A fresh developer, end to end

Run these inside `my-hedera-dapp`. `pwd` must end with that folder. `yarn demo` is enough to see a sale. If you cloned this repository instead of scaffolding it, run `yarn install` once first. The three terminals are the same work, split, if you want to watch each step.

```bash
yarn chain:offline
yarn deploy --network localhost
yarn start
```

Open `/market`. A burner wallet connects on its own. Press **100 local HBAR**, then **Buy & retire**. The certificate is on `/portfolio`. `yarn verify` needs no chain: `healthy` is approved, and `inflated` and `tampered` are rejected. A funded account is required only for [Deploy to Hedera testnet](#deploy-to-hedera-testnet).

## 3. The testnet transactions

Five, if you open nothing else. The rest of the cycle is in [docs/evidence.md](docs/evidence.md).

| What | Open it |
| --- | --- |
| A sale. The buyer's HBAR is swapped on SaucerSwap and the credits are retired | [0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0) |
| The signature that minted. Nothing was minted before it | [0xffe81724…](https://hashscan.io/testnet/transaction/0xffe81724e83bc9fd4e85bae234e3654588d48f0833a0e18fc865f25fd0e391c4) |
| A monitoring record. Quantified. It issues nothing | [0x0e3ed83c…](https://hashscan.io/testnet/transaction/0x0e3ed83c7a946f9b3ace4fa313d0beb11f57b11aa863efead770d82cb9e30d39) |
| A marked token. `buy` reverts. `buyTraced` is the sale | [0x42212e6d…](https://hashscan.io/testnet/transaction/0x42212e6d7edc6725f9813921fe35d340c8bf7c91ccfafb92c31471895ba7e3ad) |
| Hedera settles a locked purchase. The buyer signed the schedule. The network called `settleScheduled` | [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021) · [call 0.0.7314364-1791031299-291157934](https://hashscan.io/testnet/transaction/0.0.7314364-1791031299-291157934) |

The live desk is [hydro-dmrv.vercel.app](https://hydro-dmrv.vercel.app). These are not Verra credits.

## Already available

Use the other tool when it is the job.

| You need | Use |
| --- | --- |
| A policy, a credential, and an issuance workflow that stores the number it was given | [Guardian](https://guardian.hedera.com). This contract will not accept that number unless it recomputes it, and a verifier can only lower it. |
| A token or a topic, with no methodology | The [Hedera portal](https://portal.hedera.com) and the SDK. |
| A dollar price on any HTS token, paid in HBAR, that reverts when the pool or the oracles disagree | This template. `yarn checkout:demo`. The registry is optional. |
| That purchase left for Hedera to execute later, and returned if the pool has moved by then | This template. `schedulePurchase`. The portal can schedule a transfer. It cannot refuse one. |

## Judge note

Read this before the rest.

- `yarn checkout:demo` sells a token and does not deploy the registry. `yarn demo` is the local credit market. Neither is a testnet issuance.
- Testnet issuance needs three separate keys: the operator, the plant meter, and the VVB. None of those private keys are written out in this repository. The local demo VVB and meter keys are recomputed from fixed strings, the same way Hardhat's default accounts are known: anyone can recover the private key. A Hedera deploy refuses those keys. The testnet demo VVB is derived in CI from the deploy secret, and the app never holds it. On that demo one person holds all three roles. A real deployment must not.
- These are HTS units issued by this registry. They are not Verra credits. The demo grid factor is ASB0054-2022, which expired on 9 August 2025. The tonnes illustrate the arithmetic.
- `DmrvRegistry` is 23,958 bytes. Hedera refuses a contract above 24,576, so 618 bytes remain. This repo fails CI at 24,064, which is 512 bytes earlier, and the registry is 106 bytes under that line. `yarn hardhat:size` prints `tight` and still exits 0. Do not add a function to that contract unless you cut at least as much.
- The contract stores an HCS sequence and a hash. It cannot read the message. `yarn mrv:submit` refuses an approval unless those monitoring records reproduce from HCS and the verification report at the cited sequence matches the statement. A direct `verifyPeriod` can still cite a sequence whose bytes are something else.
- The scheduled pair workflow only reads the testnet pool. It does not trade it. If the pair is more than 3% from the oracle, the sale reverts. The recorded sale used a project-minted dollar token, not public USDC. Nothing here is a mainnet carbon deployment.
- `schedulePurchase` locks the HBAR and asks the Schedule Service at `0x16b` to call `settleScheduled` as the buyer, 60 seconds after `executeAt`. Locally `0x16b` is a stand-in and `yarn checkout:demo` fires the recorded call. On testnet the buyer signed [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021) and Hedera ran the call: [0.0.7314364-1791031299-291157934](https://hashscan.io/testnet/transaction/0.0.7314364-1791031299-291157934). The seller was paid the pair's token. The 2-of-3 workflow is still admin calls, not this sale.
- The contracts have not been audited.

## Video

2:48. Under the five-minute limit. The live app on Vercel, then the testnet schedule on Hashscan, then the two commands that need no Hedera account.

On screen, in order: the home page; the guide, with `yarn verify` and `yarn demo`; Verify, where healthy is approved and inflated and tampered are rejected; Audit, where Check evidence reproduces a record from the public mirror; the market preview, which builds the swap and does not send it; plant HYDRO-DEMO-01; [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021), which Hedera executed; then `yarn verify` and `yarn checkout:demo` in a fresh scaffold. The schedule service in that last command is the local stand-in. The Hashscan page is the testnet call.

[Watch the walkthrough](docs/demo/Hydro-dMRV-for-developers.mp4)

34 seconds. The same two commands, with the narration for that part.

[Watch the run](docs/demo/Hydro-dMRV-run.mp4)

## Read this in order

| You are | Start here |
| --- | --- |
| Selling any HTS token, and you do not want the carbon registry | `yarn checkout:demo`, then [Use it without carbon](#use-it-without-carbon) |
| New, and you want a market on your machine | [Quick start](#quick-start-a-working-market-in-five-minutes-no-hedera-account) |
| Checking that the sale actually needs SaucerSwap and the oracles | [Ecosystem integrations](#ecosystem-integrations-and-what-breaks-without-them) |
| Opening the testnet proof | [Check it on testnet](#check-it-on-testnet) |
| Looking up an address, a key, or a limit | [docs/evidence.md](docs/evidence.md) |
| Reading the equations | [docs/methodology.md](docs/methodology.md), then [docs/standards.md](docs/standards.md) |
| Editing this repo | [AGENTS.md](AGENTS.md) and [HEDERA_FACTS.md](HEDERA_FACTS.md) |

The full map is [docs/README.md](docs/README.md).

## Prerequisites

- Node.js 20.18.3 or newer (CI uses 20.18.3, pinned in `.nvmrc`)
- Git
- Yarn, from Corepack: `corepack enable`

That is enough for the quick start. A funded ECDSA testnet account is required only in [Deploy to Hedera testnet](#deploy-to-hedera-testnet).

## Quick start: one command, no Hedera account

The scaffold command is at the top. Inside the new directory:

```bash
yarn demo
```

`yarn demo` starts the local chain, deploys stand-ins for HTS, Chainlink, Supra and SaucerSwap, registers the demo plant, issues one batch, and buys it. It then starts the app. The dev server polls for file changes, so it does not need a higher file-watcher limit. The three terminals below are the same steps, if you want them split.

```bash
yarn chain:offline                 # terminal 1: local chain
yarn deploy --network localhost    # terminal 2: contracts and one listing
yarn start                         # terminal 3: http://localhost:3000
```

The deploy installs local stand-ins for HTS, Chainlink, Supra and SaucerSwap. It registers two demo plants, records one hour of `HYDRO-DEMO-01` signed by its demo meter, has the local verifier issue the credits, and lists them at $15/t.

The local chain is written to gitignored `deployedContracts.local.ts`. The committed testnet addresses are not rewritten, so `yarn test` still passes in that same checkout. `yarn start` then targets that local chain. Open `/market`. A burner wallet connects on its own. Press **100 local HBAR** in the footer, then **Buy & retire**. The certificate is on `/portfolio`.

Three commands cover the rest of a first run:

- `yarn verify` runs the engine only. `healthy` is approved. `inflated` and `tampered` are rejected, and the line says why. No chain, no wallet, no verifier key.
- `yarn demo` starts the chain, deploys, runs those three checks, and buys 10 kg. Then run `yarn start`.
- Issuing on testnet is still the four commands below. The server never holds the verifier key.

`/verify` runs the same five-stage engine. `yarn test` runs 152 contract tests and 419 app tests. The Solidity and TypeScript quantification must agree on the same integers.

All keys on a local chain are private keys anyone can recompute, the same way Hardhat's default accounts are known. The deploy refuses those keys on Hedera.

| Market: oracle price, SaucerSwap check, listing | Verify: the five-stage engine on a day of readings |
| --- | --- |
| ![Credit market](docs/images/market.png) | ![Verify and quantify](docs/images/verify.png) |

## How a tonne is issued

A **VVB** is the independent body that signs off a project. **Validation** approves the design before the plant may earn anything. A **monitoring record** is one metered period. The contract computes its emission reduction, **ER = BE − PE − LE** (baseline minus project emissions minus leakage), and mints nothing. **Verification** is the VVB's signature over a run of records. Only that signature mints. One token is one tonne of CO₂e. One base unit is one kilogram. **Retirement** burns credits for a named beneficiary and mints an NFT certificate.

Guardian still runs the policy, the roles and the credentials. This template is the part Guardian does not run: on-chain quantification, the hash chain, and a sale. `UsdCheckout` sells any HTS fungible token with the same price and swap, so the market still builds if the hydro module is removed.

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

The registry holds the credit token's supply key. A methodology module is called with `staticcall` and cannot mint. The file tree is in [docs/operations.md](docs/operations.md#project-structure).

## Ecosystem integrations, and what breaks without them

A developer can put a US-dollar price on any HTS token, take payment in HBAR, and settle through SaucerSwap. The sale refuses a stale price, two oracles that disagree, and a pool that is off the market or that SaucerSwap's factory did not create. `UsdCheckout` is three calls. See [Use it without carbon](#use-it-without-carbon).

| Integration | What it does here | Remove it and | Code | On-chain proof |
| --- | --- | --- | --- | --- |
| **SaucerSwap V1** (router and factory) | Every sale swaps the buyer's HBAR to the seller's USD token through the router. The pool guard asks the factory's `getPair` for the pool, then blocks sales while its price is more than 3% from the oracle | There is no sale: `buy` and `buyAndRetire` revert | [`UsdSettlement.sol`](packages/hardhat/contracts/settlement/UsdSettlement.sol) | [buyAndRetire 0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0); the same guard against mainnet pair `0.0.1462797` in the [Mainnet fork](.github/workflows/mainnet-fork.yml) workflow |
| **Chainlink** HBAR/USD | Converts every US-cent price to tinybar | Nothing can be quoted | [`ResilientHbarUsdFeed.sol`](packages/hardhat/contracts/ResilientHbarUsdFeed.sol) | [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) reads it live |
| **Supra** HBAR/USDT (pair 75) | Takes over when Chainlink is stale. When both are fresh and disagree by more than 3%, sales stop | One stale feed no longer has a fallback, so a stale Chainlink price pauses every sale | same | [`ResilientHbarUsdFeed.test.ts`](packages/hardhat/test/ResilientHbarUsdFeed.test.ts): fresh, stale, broken, disagreeing |
| **Hedera Guardian** and **IPFS** | `trace_guardian_mint` checks a Guardian mint's signed VP and its CID-checked IPFS documents. For a token the admin has marked, `UsdCheckout.buy` reverts and `buyTraced` checks a signature made only after that trace is backed | A marked token cannot be bought by skipping the trace. An unmarked token still can | [`UsdCheckout.sol`](packages/hardhat/contracts/UsdCheckout.sol), [`services/mrv/guardian/`](packages/nextjs/services/mrv/guardian/) | [token marked 0xc9937356…](https://hashscan.io/testnet/transaction/0xc99373563d891c814b86666674a2b9b1c8e271a7a5be2a01812a35ecf0f547cc), then [buyTraced 0x42212e6d…](https://hashscan.io/testnet/transaction/0x42212e6d7edc6725f9813921fe35d340c8bf7c91ccfafb92c31471895ba7e3ad) on [0xa42B11B3…](https://hashscan.io/testnet/contract/0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75). `buy` on that checkout reverts |

On testnet the public WHBAR/USDC pair prices HBAR near $2, so the recorded sale swapped through a SaucerSwap V1 pair this project seeded at the oracle price. The scheduled workflow only reads that pair. It does not trade it back. When the pair is more than 3% from the oracle, the sale reverts. On mainnet the same contract points at the public pair. The swap is not executed on the fork. The router quote is.

## Hedera services used

| Service | Where | What for |
| --- | --- | --- |
| Token Service (HTS), through the system contract at `0x167` | [`HederaTokenLib.sol`](packages/hardhat/contracts/lib/HederaTokenLib.sol), used only by `DmrvRegistry` and `UsdCheckout` | The credit token (3 decimals) and the retirement NFT. The registry creates both and holds their treasury and supply keys. `UsdCheckout` escrows any HTS token |
| Consensus Service (HCS) | [`report.ts`](packages/nextjs/services/mrv/report.ts), [`verification.ts`](packages/nextjs/services/mrv/verification.ts) | Raw readings (up to 20 chunks), the monitoring report and the verification report. The contract stores each report's hash and sequence |
| Smart contracts | [`packages/hardhat/contracts`](packages/hardhat/contracts) | Registry, methodology modules (called with `staticcall`), market, checkout, price feed |
| Schedule Service | [`UsdCheckout.schedulePurchase`](packages/hardhat/contracts/UsdCheckout.sol) calls `0x16b`. [`adminExec.ts`](packages/nextjs/scripts/adminExec.ts) is the separate 2-of-3 admin path | A buyer locks HBAR. Hedera calls `settleScheduled` 60 seconds after `executeAt`, and the pool check runs then. [Schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021) did. Locally `0x16b` is a stand-in. The admin path does not settle a sale |
| Mirror node | [`mirror.ts`](packages/nextjs/services/mrv/mirror.ts) | Reads HCS messages, token associations and contract results back, so a record can be reproduced |

## Environment variables

Nothing is required for the local quick start, or to browse the app. Copy the `.env.example` beside each package when you leave localhost.

| Variable (`packages/nextjs/.env.local`) | Needed for |
| --- | --- |
| `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HCS_TOPIC_ID` | Publishing readings and reports to HCS |
| `MRV_API_KEY` | The record and verification APIs, and the MCP write tools. Unset: writes are off |
| `CHECKOUT_ADDRESS` | The `UsdCheckout` the server reads. Production is `0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75`, where a marked token cannot use `buy`. Unset: the checkout written by the last deploy |
| `TRACE_SIGNER_KEY` | The ECDSA key that signs `buyTraced` after a Guardian trace is backed. Without it the server will not build a purchase of a marked token. Never commit it |
| `NEXT_PUBLIC_TARGET_NETWORK` | `local` or `testnet`, when you want to override the automatic choice |

`packages/hardhat/.env` takes `VERIFIER_ADDRESS` (the VVB, which must sign each plant's validation before it is registered) and `ADMIN_ADDRESS` (a 2-of-3 threshold account). The full list is in [docs/operations.md](docs/operations.md).

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

Open these five. The rest of the cycle, including the deficit plant, the Guardian trace, the 2-of-3 admin schedule and the older checkout, is in [docs/evidence.md](docs/evidence.md).

| What | Open it |
| --- | --- |
| A sale. The buyer's HBAR is swapped on SaucerSwap and the credits are retired | [0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0) · [would a sale settle now?](https://hydro-dmrv.vercel.app/api/market/dex) |
| The signature that minted. Two meter-signed days, 1.537 t, nothing minted before this transaction | [0xffe81724…](https://hashscan.io/testnet/transaction/0xffe81724e83bc9fd4e85bae234e3654588d48f0833a0e18fc865f25fd0e391c4) |
| A monitoring record. Quantified on-chain. Issues nothing | [0x0e3ed83c…](https://hashscan.io/testnet/transaction/0x0e3ed83c7a946f9b3ace4fa313d0beb11f57b11aa863efead770d82cb9e30d39) · [reproduce it from HCS](https://hydro-dmrv.vercel.app/api/registry/attestations/0/reproduce) |
| A marked Guardian token. `buy` reverts. `buyTraced` is the sale | [0x42212e6d…](https://hashscan.io/testnet/transaction/0x42212e6d7edc6725f9813921fe35d340c8bf7c91ccfafb92c31471895ba7e3ad) on [0xa42B11B3…](https://hashscan.io/testnet/contract/0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75) |
| Hedera settles a locked purchase. The buyer signed. The network called `settleScheduled` | [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021) · [call 0.0.7314364-1791031299-291157934](https://hashscan.io/testnet/transaction/0.0.7314364-1791031299-291157934) |

The [Testnet evidence](.github/workflows/testnet-evidence.yml) workflow ran the cycle with the same commands an operator and a VVB use. The six contracts from that deploy are Sourcify-verified (exact match). The scheduled checkout [0xc084DDD1…](https://hashscan.io/testnet/contract/0xc084DDD1765145D6FF54bf1CBaF61B2fAa34BAC3) is a runtime exact match as well, verified on 3 Oct 2026. It is not the production checkout. The public mainnet pair `0.0.1462797` is quoted on every push by the [Mainnet fork](.github/workflows/mainnet-fork.yml) workflow. The swap is not executed there.

## Limits, stated plainly

- **These are not Verra credits.** The registry issues its own units from the equations it implements. The demo plants' additionality evidence is illustrative. On testnet one person holds the operator, meter and labelled demo VVB keys. A real deployment must not do that.
- The testnet SaucerSwap pair holds a USD token this project minted, because the public testnet USDC pair prices HBAR near $2. The recorded sale used that pair. Nothing in this template trades it back to the oracle. A later purchase reverts while the pair is more than 3% off. On mainnet the same code uses the public WHBAR/USDC pair.
- The contract cannot verify a Guardian VP. For a marked token, `buy` reverts and `buyTraced` checks a signature this server creates only after the trace is backed. An unmarked token is not a Guardian mint. The checkout deployed before that function, `0x455eFbF0…`, still sells with `buy`.
- The demo grid factor is Uganda's published CDM standardized baseline (ASB0054-2022). It expired on 9 August 2025. The demo plants were registered in 2026, outside that window. The tonnes illustrate the arithmetic. A real project needs a new grid factor.
- The contract checks that each record cites a non-zero sequence on HCS topic `0.0.10729650`. It cannot read the message. `yarn mrv:submit` refuses to relay an approval when the records do not reproduce or the published report does not match. A direct `verifyPeriod` call can still cite a sequence whose bytes are something else.
- `evidenceHash` is an optional label. The contract does not check what it names.
- A monitoring run the VVB rejects still counts toward that year's energy for a retrofit or a capacity addition. Both demo plants are greenfield, so this does not affect them. Detail is in [docs/contract.md](docs/contract.md).
- Meter uncertainty is reported with each record. It is not deducted from the tonnes. The lower of two meters, and the maximum permissible error after calibration expires, are deducted.

> **Disclaimer.** The contracts, the app and the tooling are experimental and have not been audited. The engine implements published equations. It is not a certification body.

## Use it without carbon

Most Hedera apps that sell something want a dollar price and an HBAR payment. `UsdCheckout` is that settlement, in front of any HTS fungible token: tickets, shares, in-game items. `yarn checkout:demo` runs it locally without the registry. The calls are:

```solidity
// seller: token.approve(checkout, amount) on the HTS token's ERC-20 facade, then
checkout.createListing(token, amount, 1_250);        // $12.50 per whole token, escrowed in the checkout
// buyer: token.associate() once (HIP-719), then
uint256 tinybar = checkout.quote(listingId, amount); // Chainlink (Supra fallback), after SaucerSwap agrees within 3%
checkout.buy{ value: tinybar }(listingId, amount);   // HBAR is swapped to the pair's USD token for the seller
// or leave it for Hedera. The HBAR is locked now. The pool is checked again at executeAt.
checkout.schedulePurchase{ value: tinybar }(listingId, amount, executeAt);
```

A stale feed, a pool more than 3% from the oracle, or a pool SaucerSwap's factory did not create blocks the sale, including one Hedera fires later. If that later call reverts, `cancelScheduled` returns the HBAR. No admin function can move it, or the escrowed tokens. The tests are in [`UsdCheckout.test.ts`](packages/hardhat/test/UsdCheckout.test.ts). Locally `0x16b` is a stand-in. On Hedera the buyer signs the schedule, and the network fires it 60 seconds after `executeAt`. That happened: [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021).

## For AI agents

```bash
claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp
```

`get_dex_price`, then `list_open_listings`, then `prepare_purchase`. The agent signs with its own key. `reproduce_attestation` re-derives a record from HCS. `get_pending_verification` shows what a VVB should verify next. Public tools need no key. `record_monitoring`, `prepare_verification` and `submit_verification` appear only with `Authorization: Bearer $MRV_API_KEY`. None of them signs as a VVB. The tool list is [docs/agents.md](docs/agents.md).

[`HEDERA_FACTS.md`](HEDERA_FACTS.md) lists Hedera behaviours that break ordinary contract code, each with the test that proves it. [`AGENTS.md`](AGENTS.md) has the invariants, and the recipes for a new methodology or a new asset to sell.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm error canceled`, then `Command "demo" not found` or `Command "chain:offline" not found` | npm asked `Ok to proceed? (y)` and the next pasted line was `cd my-hedera-dapp`. The install never ran. The shell is still `C:\Users\USER` | Ctrl+C. Paste the one line in [One command](#1-one-command). Then `pwd` must end in `my-hedera-dapp` |
| A purchase overpays by 10¹⁰, or reverts `InsufficientPayment` | `msg.value` is tinybar inside the EVM. A JSON-RPC `value` is weibar | Send what `quote()` returns, through `quoteToTxValue` ([`pricing.ts`](packages/nextjs/services/mrv/pricing.ts)) |
| The relay rejects a transaction for its fee | Hashio refuses EIP-1559 fees under its minimum gas price | Send a legacy transaction at `eth_gasPrice`, as the scripts do |
| `HtsCallFailed(…, 184)` on a purchase or a withdrawal | The receiving account is not associated with the token | Call `associate()` on the token's own address first (HIP-719) |
| `HtsCallFailed(…, 292)` on `createListing` | The checkout has no allowance on the seller's token | `approve(checkout, amount)` on the token's ERC-20 facade |
| `PoolPriceDeviation`, or [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) shows `accepted: false` | The testnet pair is more than 3% from the oracle | The sale reverts. This template does not run a keeper. The public testnet USDC pair is not a dollar, and the seeded pair is not one either |
| `StalePrice` | No oracle answer is newer than the market's maximum price age | Retry later. `/api/market/dex` shows each feed's age |
| `yarn deploy` changes nothing you can see | Without `--network` it deploys to an in-process chain that exits | Start `yarn chain:offline`, then `yarn deploy --network localhost` |
| `yarn test` fails after a local deploy, or `deployedContracts.ts` contains chain 31337 | An older deploy wrote the local chain into the committed file | `yarn reset:local`, then deploy again. A current deploy writes gitignored `deployedContracts.local.ts` and leaves the committed file alone |
| `yarn lint` fails inside `generator-function/require.mjs` on Node 22 | That package's `module-sync` export is ESM, and Node 22.13 loads it from CommonJS ESLint | This repo patches it to the CommonJS entry. CI uses Node 20.18.3. Do not delete the patch under `.yarn/patches` |
| `yarn start` restarts, saying the server is approaching its memory threshold | The first compile is large. An older config also made webpack snapshot `node_modules` | Restart `yarn start`. Do not set a Node heap bigger than about half the machine's RAM |
| Check evidence, a quote, or `yarn mrv:reproduce` sits there | The mirror node or an IPFS gateway did not answer | The read fails after 12 seconds (`UPSTREAM_TIMEOUT_MS`). Retry. The contract still cannot read the HCS message itself |
| The API returns 429 | This instance saw 300 calls in a minute from one address | Wait for `Retry-After`. Instances do not share the counter, so a public site should also set a Vercel Firewall rule on `/api/*` |
| `yarn mrv:record` asks for `METER_PRIVATE_KEYS` | That command records on testnet. `yarn demo` already issued the local listing and does not use this key | `yarn start`, then Buy & retire. Testnet meters are `yarn hardhat:meter-keys --network hederaTestnet`. Do not run `yarn deploy` with no network |
| I only want to see a rejection | The testnet VVB commands need an operator and a separate key | `yarn verify`, or open `/verify` and press **tampered**. `yarn mrv` prints both paths. A local listing is already issued by `yarn deploy` |
| A testnet deploy stops at the meter keys | Live networks refuse the public demo meter keys | `yarn hardhat:meter-keys --network hederaTestnet` |
| HashPack says the site is a malicious dapp, or "No applicable ECDSA accounts" | WalletConnect's shared project id is flagged, and an ED25519 account cannot sign | Use HashPack's ECDSA account, or MetaMask. `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` clears the warning. The HashPack extension does not use that check |

Each row has a test or a workflow behind it, listed in [`HEDERA_FACTS.md`](HEDERA_FACTS.md).

## How it compares to Guardian

| | Guardian | This template |
| --- | --- | --- |
| Policies, roles, credentials, trust chain | Yes | No. Use Guardian |
| Who decides the minted amount | A policy, run by the Guardian service | The contract, from meter-signed records, and only after a VVB signs |
| Price, sale, DEX settlement | No | Chainlink, Supra, SaucerSwap, `CreditMarket`, `UsdCheckout` |
| A buyer checking a minted token | The Guardian UI. The indexer needs an account | `GET /api/guardian/v1/trace`, from public data |
| How you start | Docker and MongoDB, or Managed Guardian | `npm create scaffold-hbar` |

## Docs

The reading order is [docs/README.md](docs/README.md).

| Document | What it covers |
| --- | --- |
| Every testnet address, transaction, key and limit | [docs/evidence.md](docs/evidence.md) |
| Registry, module, market and checkout: functions, EIP-712 types, roles | [docs/contract.md](docs/contract.md) |
| Equations, five stages, scenarios, HCS reproduction | [docs/methodology.md](docs/methodology.md) |
| Which clause of VMR0017, ACM0002, AMS-I.D and the VT tools is implemented where | [docs/standards.md](docs/standards.md) |
| Environment, scripts, pages, security limits | [docs/operations.md](docs/operations.md) |
| What the tests pin | [docs/testing.md](docs/testing.md) |
| Guardian trace, the cross-check credential, the policy patch | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
| MCP tools and their REST twins | [docs/agents.md](docs/agents.md) |

Hedera Harness spec and validators are in [`.harness/`](.harness/). `yarn harness:validate` runs Tiers 0–2 with no credentials, in this repository. A scaffold removes `template.json`, and the same command fails in that copy. Run it here.

MIT, see [LICENCE](LICENCE). Built on [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar).
