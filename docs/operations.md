# Operations

## Environment variables

Nothing is required to browse the app or use the engine. Copy the `.env.example` next to each package.

`packages/nextjs/.env.local`

| Variable | Required for | Notes |
| --- | --- | --- |
| `HEDERA_OPERATOR_ID` | publishing | Account that signs and pays for HCS messages. |
| `HEDERA_OPERATOR_KEY` | publishing | Hex or DER. If ECDSA, it is also the relayer's EVM key. To record monitoring that address must be the plant's operator or the reporter it named (`setReporter`); relaying a verification needs no role. |
| `HCS_TOPIC_ID` | publishing | The registry's audit topic (`yarn mrv:create-topic`); the server refuses to publish to any other. |
| `MRV_API_KEY` | publishing | Bearer token for `POST /api/mrv/record`, `/api/mrv/verification`, `/api/mrv/verification/submit` and the MCP write tools. Unset disables writes. |
| `CHECKOUT_ADDRESS` | checkout purchases | `UsdCheckout` the server reads. Production is `0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75`. Unset uses the checkout in `deployedContracts.ts`. |
| `TRACE_SIGNER_KEY` | marked-token purchases | ECDSA hex key that signs `buyTraced` after a Guardian trace is backed. The account must be `traceSigner` on that checkout. Unset: a marked token gets no transaction. Never commit it. |
| `RELAYER_PRIVATE_KEY` | optional | Overrides the relayer EVM key (ED25519 operators, local chains). It is **not** a VVB key. |
| `METER_PRIVATE_KEYS` | server-side meter signing | JSON `{ "<plantId>": "<hex key>" }`, from `yarn hardhat:meter-keys`. Used only when a request has no meter signature. Software keys standing in for logger hardware; the public demo derivation is refused on Hedera chain ids. |
| `BRIDGE_ED25519_PRIVATE_KEY` / `BRIDGE_DID` | Guardian bridge | Ed25519 key and its published `did:hedera` DID (`yarn guardian:publish-did`). The cross-check route answers 503 until both are set and match. |
| `GUARDIAN_BRIDGE_API_KEY` | Guardian bridge | Bearer token the policy's httpRequestBlock sends. |
| `GUARDIAN_BRIDGE_RESULT_SCHEMA` | Guardian bridge | JSON `{type, contextUrl}` of the imported "DMRV Cross-Check Result" schema, or a map by policyId. |
| `GUARDIAN_EVIDENCE_TOPIC_IDS` / `GUARDIAN_MIRROR_NODE_URL` / `GUARDIAN_IPFS_GATEWAY` | optional | Evidence verifier defaults. |
| `FILEBASE_IPFS_RPC_TOKEN` | bridge DID script | Only for `yarn guardian:publish-did --send`, which pins the DID document. |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` / `…MAINNET…` | optional | JSON-RPC relay; defaults to Hashio. |
| `NEXT_PUBLIC_MIRROR_NODE_URL` | optional | Defaults to the public mirror node of the first target network. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | optional | Reown project id for the HashPack and Keplr WalletConnect fallback. Unset uses the scaffold id, which HashPack's verify list can label a malicious dapp. The three connect buttons (MetaMask, HashPack, Keplr) are always shown. An extension connection does not use this id. |
| `NEXT_PUBLIC_TARGET_NETWORK` | optional | `local` or `testnet`. Unset: `yarn start` targets the local chain once `yarn deploy --network localhost` has written gitignored `deployedContracts.local.ts`, and Hedera testnet otherwise. Production builds and `yarn test` keep Hedera first. |

`packages/hardhat/.env`

| Variable | Notes |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Written by `yarn hardhat:account:import` / `:generate`. |
| `VERIFIER_ADDRESS` | The VVB's secp256k1 signing address: gets `VERIFIER_ROLE`. Must not be a plant operator (the deploy throws), a meter or a reporter (the contract rejects its signatures). |
| `VALIDATOR_PRIVATE_KEY` | Testnet demo only: the labelled demo VVB key that signs the demo plants' `ValidationApproval` during the deploy (the Testnet deploy workflow derives it). Without it the demo plants are not registered. A real VVB signs on its own machine. |
| `METER_ADDRESSES` | JSON `{ "<plantId>": "0x…" }` of the plants' meter addresses. Otherwise read from `.secrets/meters.<network>.json` (`yarn hardhat:meter-keys`). On Hedera networks the deploy throws if one is missing or equals the public demo derivation. |
| `POOL_GUARD_ENABLED` | Ignored. The contract rejects a pool guard that is switched off. |
| `ADMIN_ADDRESS` | Admin after setup on both `DmrvRegistry` and `CreditMarket` (EVM address or `0.0.<num>`; the 2-of-3 account from `yarn admin:threshold`): gets `DEFAULT_ADMIN_ROLE`, and the deployer renounces it. |
| `PLANT_OPERATOR_ADDRESS` | Receives the demo plants' credits; defaults to the deployer. |
| `CREDIT_TOKEN_CREATE_FEE_HBAR` · `CERTIFICATE_TOKEN_CREATE_FEE_HBAR` | HBAR sent to cover each HTS creation fee (default 20). Unused change can be swept. |
| `MAX_PRICE_AGE_SECONDS` | Oracle staleness bound for each source and for settlement (default 90000 = 25 h). |
| `MAX_ORACLE_DEVIATION_BPS` | How far fresh Chainlink and Supra answers may disagree (default 300 = 3%). |

## Walkthrough

| Page | What you can do |
| --- | --- |
| **Home** `/` | The flow, live registry totals in t CO₂e, and how to connect an agent over MCP. |
| **Methodology** `/methodology` | The equations, QA/QC rules, the TOOL07 calculation on the demo grid unit by unit (EF_EL, option A1/A2, BM sample), each demo plant's assessment and the exact integers registered on-chain. |
| **Verify** `/verify` | Pick a plant and a scenario, or edit the JSON (readings, meter calibration, even the plant design). The report updates as you type: decision, five stages, ER / BE / PE / LE, an equation trace, QA/QC deductions and every finding. When the registry is deployed it quantifies against the plant's on-chain ledger. It previews the exact HCS report and data hash; operators can record the period with the API key (nothing is issued until a VVB verifies it). |
| **Market** `/market` | Both oracle sources, which one is pricing, and the SaucerSwap pair the contract swaps. List credits in USD per tonne; buy, or buy and retire in one transaction; associate the HTS token (HIP-719) and withdraw to your wallet. Buy stays off while the pair is outside 3% of the oracle. |
| **Plants** `/plants`, `/plants/{id}` | Every registered plant; per plant the registered design (host country, capacity, reservoir and power density, VT0011 / TOOL07 grid factor, TOOL03 COEF, baseline, crediting period, design hash), who validated it and its validation report hash, the ledger (records, verified records, unissued balance, record chain head), every monitoring record with BE, PE, LE, ER, coverage, status and links to its HCS report and reproduction, and every verification with what it issued. The **Verification (VVB)** panel loads the pending run, reproduced from HCS, and lets a VVB publish its report, sign the statement with its own wallet and relay it. |
| **Portfolio** `/portfolio` | Everything an account retired, or anyone retired on behalf of a company, with totals, NFT certificates and a **CSV export** for a GHG inventory or ESG report (beneficiary names are formula-escaped). |
| **Audit** `/audit` | Every monitoring record with EG_PJ, ER, its status and HCS link; every verification with its decision, deduction, units issued, VVB and report. **Check evidence** runs the full reproduction in your browser, including the record's hash-chain link. Retirements link to their certificates. |
| **Certificate** `/certificate/{id}` | A printable retirement certificate in t CO₂e backed by on-chain data, with its NFT serial and Hashscan link. If the NFT could not be delivered at retirement, associate and claim it here. |
| **Debug** `/debug` | Scaffold-HBAR's contract console for every function (the module's `quantify` previews a period). `buy` / `buyAndRetire` are hidden: purchases go through `prepare_purchase`. |

## Scripts

| Command | What it does |
| --- | --- |
| `yarn verify` | Engine only: healthy is approved, inflated and tampered are rejected, with the reason. No chain and no VVB key |
| `yarn mrv` | Prints that path, then the four testnet issuance commands. `yarn mrv:verify` is not `yarn verify` |
| `yarn demo` | Local chain if it is down, deploy, those three checks, buy 10 kg. Skips the app when under 6 GB is free |
| `yarn chain:offline` · `yarn deploy --network localhost` · `yarn start` | Local chain, contracts and demo batch, app |
| `yarn test` · `yarn lint` · `yarn next:build` | Contract and app tests, lint, production build |
| `yarn hardhat:size` | Contract-size gate (24,064 B). `tight` means under 256 B of that limit and does not fail |
| `yarn mrv:record` | Monitoring: verify, publish to HCS, `recordMonitoring` (issues nothing) |
| `yarn mrv:verify` · `yarn mrv:approve` · `yarn mrv:submit` | Verification: publish the VVB's report, the VVB signs on its own machine, relay `verifyPeriod` |
| `yarn mrv:reproduce [plantId…]` | Anyone, no key: re-derive every record from HCS, hash chain included |
| `yarn admin:threshold` · `yarn admin:exec` · `yarn admin:demo` | 2-of-3 admin account, scheduled admin calls, and the whole path on testnet with throwaway keys |
| `yarn live:smoke` · `yarn pair:rebalance` · `yarn market:keep-listing` | Check the live app; keep the testnet pair and a listing healthy |
| `yarn market:agent-buy [kg] [beneficiary]` | The agent purchase flow with `BUYER_PRIVATE_KEY`: `get_dex_price → list_open_listings → prepare_purchase → sign` |
| `yarn mainnet:checkout plan \| prepare \| buy` | The mainnet settlement exhibit (below): read-only plan, then a test token, the feed and `UsdCheckout`, and one sale through pair `0.0.1462797` |
| `yarn guardian:trace <ref>` | Is a Guardian-minted token backed? Mirror node + CID-checked IPFS, no Guardian login |
| `yarn verify:sourcify hederaTestnet` (in `packages/hardhat`) | Verify a deployment on Sourcify (HashScan shows the source); the Sourcify verify workflow does it from the deploy commit |

## Project structure

```
packages/
├── hardhat/
│   ├── contracts/
│   │   ├── DmrvRegistry.sol             validation, monitoring records, verification and issuance, custody, all HTS
│   │   ├── DmrvAnnotations.sol          records nothing enforces: accreditation, Article 6.2, VCU references
│   │   ├── modules/HydroVmr0017Module.sol   IMethodology: hydro applicability (Table 1, LDC list) and quantification
│   │   ├── modules/RenewableVmr0017Module.sol   IMethodology: greenfield solar, wind, ocean
│   │   ├── CreditMarket.sol · UsdCheckout.sol · settlement/UsdSettlement.sol   sales at a USD price via SaucerSwap
│   │   ├── ResilientHbarUsdFeed.sol     Chainlink + Supra aggregator behind AggregatorV3Interface
│   │   ├── lib/HederaTokenLib.sol       HTS create / mint / burn / transfer for tokens and NFTs
│   │   ├── interfaces/                  IMethodology, ISaucerSwap, IHederaTokenService subset, Chainlink, Supra
│   │   └── mocks/                       HTS (tokens + NFTs + association), Chainlink, Supra, SaucerSwap V1/V2 pools
│   ├── deploy/                          00 feed, module, registry, annotations, market · 01 setup (tokens, roles, validated plants, pool guard) · 02 checkout · 03 local seed · 04 renewable module
│   ├── scripts/                         checkContractSizes.ts (CI gate) · generateMeterKeys.ts · testnetDemoKeys.ts · verifySourcify.ts
│   ├── utils/                           per-network config · attestation.ts (EIP-712) · validation.ts · demoPlants.ts · meterKeys.ts · testnetDemoKeys.ts
│   └── test/                            registry, modules, market, checkout, sizes, meter keys, oracle, mainnet fork, fixtures/
└── nextjs/
    ├── app/
    │   ├── methodology/ verify/ market/ audit/ certificate/[id]/   pages; client components in _components/
    │   └── api/                         methodology/* · mrv/* · registry/* · market/* · mcp
    ├── services/mrv/
    │   ├── methodology/                 fuels (IPCC) · tool07 (+VT0011) · tool03 · ldc · project · quantify · renewable · schema · document
    │   ├── engines/                     one plug-in engine per methodology (hydro, renewable)
    │   ├── provenance.ts  approval.ts  verification.ts   meter statement, VVB messages and record chain, verification report
    │   ├── engine.ts  schema.ts         5-stage verification and QA/QC
    │   ├── demo.ts  scenarios.ts        illustrative grid, demo designs and plants, deterministic scenarios
    │   ├── report.ts  pipeline.ts       HCS data, report and project messages
    │   ├── mirror.ts  audit.ts          mirror-node reads, audit and reproduction
    │   ├── pricing.ts  views.ts  network.ts
    │   └── server/                      HCS publishing, registry reads, monitoring, verification, methodology, market, MCP, auth
    ├── scripts/mrv.ts                   yarn mrv:create-topic · mrv:record · mrv:verify · mrv:approve · mrv:submit · mrv:reproduce · mrv:meter-key · mrv:sign
    ├── scripts/agentBuy.ts              yarn market:agent-buy
    ├── scripts/createThresholdAdmin.ts  yarn admin:threshold (2-of-3 KeyList account)
    ├── scripts/adminExec.ts             yarn admin:exec (admin calls as scheduled transactions)
    ├── scripts/thresholdAdminDemo.ts    yarn admin:demo (2-of-3 schedule, sign, renounce on testnet)
    └── public/llms.txt
.harness/                                Hedera Harness spec, PRD, validators, acceptance contract
template.json                            create-scaffold-hbar manifest
```

## Extending the template

- **Your plant.** Write its `ProjectDesign` (capacity, reservoir areas, history for retrofits, fuel, crediting period,
  and either your grid's per-unit data for TOOL07 or a DNA-published combined margin), run `assess_project` or
  `POST /api/methodology/assess`, have your VVB validate it and sign the `ValidationApproval`, and register the
  returned params and `designHash` with `registerProject`. Serve or publish the design document so anyone can check
  the hash.
- **Real monitoring data.** Have the logger sign each batch's EIP-712 meter statement and post it to
  `POST /api/mrv/record` with your plant profile and metering data (accuracy classes, calibration dates). Keep batches
  under the 20-chunk limit (about a week of hourly data). When a verification is due, your VVB reviews
  `GET /api/mrv/verification?plantId=…`, publishes its report (`POST /api/mrv/verification`), signs the statement
  with its own key and relays it (`/api/mrv/verification/submit`, or from its own wallet).
- **More of the methodology.** TOOL07 option B, dispatch-data and ex-post OM, imports and off-grid plants, integrated
  hydro projects, battery storage, TOOL05 for grid electricity consumed by the project. Add them in `methodology/`
  with hand-checked tests; mirror anything that changes issued quantities in the contract and the shared vectors.
- **Another methodology.** Implement `IMethodology` as a new module and approve it; the registry does not change.
- **Another oracle.** Implement `AggregatorV3Interface`, or change the providers behind `ResilientHbarUsdFeed`.
- **Mainnet.** Put `chains.hedera` first in `hederaFirst` in `scaffold.config.ts` and deploy with `--network hederaMainnet`.

## What is deployed

The app reads `DmrvRegistry` `0x4EB517694CBac7b59a26B188eFEBa35aAb5Fd48e` and `CreditMarket`
`0x48F5056EdaD0B16c97a54085512b48417bC40F04` (29 Sep 2026, from `3bbc4cd1`). Topic `0.0.10729650`. HYCC
`0.0.10771273`, HYRET `0.0.10771274`. Admin and operator is `0.0.10721162` until a 2-of-3 account is set. Every
transaction is in [evidence.md](evidence.md).

### Older deploys

Kept on chain so their history stays checkable; the app does not read them.

| Registry | What it was |
| --- | --- |
| `DmrvRegistry` v1 `0xaf9C76B48B317cee770ED6AE038D516b269E0129` (26 Sep 2026) with markets `0x26E77708717cE69EBBBF76e59D106B20e67e1D61` and `0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030`, HYCC `0.0.10729677` | Minted on a meter signature plus a VVB approval of one period, with no validation at registration and no separation of monitoring and verification. Superseded by v2 |
| `HydroCreditRegistry` `0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5` (phase 0) | One verifier key, public demo meters. Its two mints (4,791,542 g and 73,386,435 g) still reproduce through `HydroVmr0017Module` (`test/fixtures/liveAttestations.ts`) |
| `0xc427610cFfBC919dC0B2c3f71644a4fDcB7ef84a`, `0xe34BeFc4081a8e751271C3549B861e03Fac512b9` | Unused phase-1 test deploys |

## To deploy again

The [Testnet deploy](../.github/workflows/testnet-deploy.yml) workflow does steps 1–5 from a commit whose message
contains `[deploy-testnet]`, with the `TESTNET_REBALANCER_KEY` secret and demo keys derived from it; the
[Testnet evidence](../.github/workflows/testnet-evidence.yml) workflow does step 6. By hand:

1. **Meter keys.** `yarn hardhat:meter-keys --network hederaTestnet` writes `packages/hardhat/.secrets/meters.hederaTestnet.json`
   (gitignored). Put the private keys into the server's `METER_PRIVATE_KEYS`, or on the loggers.
2. **VVB key.** A secp256k1 key separate from the operator, the meters and any reporter. Its address is
   `VERIFIER_ADDRESS`. A real VVB keeps its own key and only ever sends signatures. For the demo plants the deploy can
   sign their validation with `VALIDATOR_PRIVATE_KEY`, a labelled demo key.
3. **Threshold admin.** Collect three public keys, then
   `THRESHOLD_ADMIN_PUBLIC_KEYS="pk1,pk2,pk3" yarn admin:threshold --execute`. It prints `0.0.x` and the long-zero
   address; that is `ADMIN_ADDRESS`.
4. **Deploy.** Create a topic first (`yarn mrv:create-topic`), then
   `HCS_TOPIC_ID=0.0.… VERIFIER_ADDRESS=… VALIDATOR_PRIVATE_KEY=… ADMIN_ADDRESS=… yarn deploy --network hederaTestnet`.
   It deploys the modules, registry, annotations and market, creates new HTS tokens, registers both demo plants with
   the generated meters and a validation signature, stores the SaucerSwap testnet pool with the check on, names the
   market once (`setMarket`), grants `VERIFIER_ROLE`, and hands admin to the threshold account. It regenerates
   `packages/nextjs/contracts/deployedContracts.ts` for the network just deployed, and keeps every other chain
   already in that file. A localhost deploy does not write that file. It writes gitignored
   `deployedContracts.local.ts`, which `yarn test` ignores.
5. **Verify.** `yarn verify:sourcify hederaTestnet` in `packages/hardhat` (Sourcify v2 API, shown on HashScan), then
   check the roles: `hasRole(VERIFIER_ROLE, VVB)`, `hasRole(DEFAULT_ADMIN_ROLE, threshold)`, and no admin role left on
   the deployer.
6. **Evidence.** `yarn mrv:record healthy HYDRO-DEMO-01`, then `yarn mrv:verify HYDRO-DEMO-01` (it writes
   `verification-HYDRO-DEMO-01-<first>-<last>.json`), `VVB_PRIVATE_KEY=… yarn mrv:approve verification-….json` on the
   VVB's machine and `yarn mrv:submit verification-….json`. Then `yarn market:keep-listing --execute` and
   `BUYER_PRIVATE_KEY=… yarn market:agent-buy`, and record the links in [evidence.md](evidence.md).
7. **Vercel env.** `HEDERA_OPERATOR_*`, `HCS_TOPIC_ID`, `MRV_API_KEY`, `CHECKOUT_ADDRESS`, `TRACE_SIGNER_KEY` (the checkout's `traceSigner`, not the operator), and `METER_PRIVATE_KEYS` if the site should record
   the demo plants. Redeploy the app. New variables are picked up only on a redeploy.

Admin changes after the handover go through the threshold account:
`yarn admin:exec schedule <CreditMarket 0x…> "setPoolGuardEnabled(bool)" true` by one holder, then
`yarn admin:exec sign <scheduleId>` by a second.

### SaucerSwap guard

The on-chain guard compares the pair stored on `CreditMarket` with the oracle and reverts beyond 3%.
`setPoolGuardEnabled(false)` reverts. The admin can repoint the pool only.

The live market `0x48F5056EdaD0B16c97a54085512b48417bC40F04` has this rule. It swaps through router `0.0.19264` and the pair is `0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869`.

The public testnet V1 WHBAR/USDC pair (`0x87664e55d9606657f049139FF654390A72657667`, factory `0.0.9959`) priced HBAR at $2.28 on 26 Sep 2026. The oracle was about $0.094. Pointing the guard at that pair would reject every sale, because testnet USDC is not a dollar. The exhibit uses a pair seeded on the same factory at the Chainlink price. The purchase builder also refuses unless the public mainnet pair `0.0.1462797` is within 3% of mainnet Chainlink. On 27 Sep 2026 that was 15 bps ($0.09490 against $0.09504). A mainnet deploy uses that pair on-chain. Nothing is deployed on mainnet.

A spot price can be moved in one block, so the guard can block sales. It cannot make them cheaper, because payment uses the oracle price.

### Mainnet settlement exhibit

The registry refuses demo plants on mainnet, so no carbon credit is sold there. What mainnet can show is the
settlement itself: `UsdCheckout` pricing a sale at mainnet Chainlink (Supra fallback), refusing it while SaucerSwap's
public WHBAR/USDC pair `0.0.1462797` is more than 3% away, and swapping the buyer's HBAR through that pair so the
seller is paid USDC. The [Mainnet checkout](../.github/workflows/mainnet-checkout.yml) workflow does it with a labelled
test token (`DMRVTEST`, supply 10, no admin or supply key, memo "not a carbon credit"):

1. **Plan** (`step=plan`, no key needed): the pair against Chainlink, whether `settlementPrice` would pass, and the
   HBAR the run needs (about 43 HBAR at 72 tinybar gas and $0.118 per HBAR on 29 Sep 2026, 20 of it sent to the buyer). With the key it also
   checks the seller's account, balance and USDC association.
2. **Execute** (`step=execute`, `confirm` = `spend mainnet HBAR`): creates the token and associates the seller with
   USDC `0.0.456858` (Hedera SDK), funds a buyer, deploys `ResilientHbarUsdFeed` and `UsdCheckout` with
   `deploy/05_deploy_mainnet_checkout.ts`, lists 2 tokens at $1, buys 1, and fails unless the receipt has a log from
   the pair and the seller's USDC grew by at least `minUsdOut`. Then it verifies both contracts on Sourcify and uploads
   the evidence and deployment files.

The key is `MAINNET_DEPLOYER_KEY`, the ECDSA key of a new account with an EVM alias. The buyer's key is derived from it
unless `BUYER_PRIVATE_KEY` is set, so one person holds both: the exhibit proves the settlement path, not an arm's-length
trade. The Mainnet fork workflow rehearses the deploy on every push, and `network=testnet` (or a push whose message
contains `[checkout-rehearsal]`) runs every step on testnet first. The rehearsal on 29 Sep 2026 created
[`DMRVTEST` 0.0.10776102](https://hashscan.io/testnet/token/0.0.10776102), listed 2 and
[bought 1 for 8.389 HBAR](https://hashscan.io/testnet/transaction/0x019dc29be04bf50685238322d834bbde6ed932f51e2fd3e5fabec771b98bef26):
the pair logged the swap and the seller received 0.981 QUSD (at least 0.97 required). It has not been run on mainnet.

## Security model and limitations

- **No single key issues.** Registration needs a VVB's validation signature; a monitoring record needs the project's
  meter signature and issues nothing; issuance needs a VVB's verification of the records' hash chain and its report
  on HCS, and the VVB may only make figures more conservative. Readings, reports and hashes are public and the engine
  is deterministic. Residual trust:
  - **The demo site's meter keys are server-held software keys** (`METER_PRIVATE_KEYS`). Whoever runs the server can
    sign as the meter and record, up to the nameplate. A production plant needs a key that never leaves the logger.
    The VVB is the check: it reproduces every record from HCS before it signs.
  - **The testnet demo VVB is the author's labelled test key** (derived in CI). The app and API hold no VVB key.
  - **Older testnet registries** (see [older deploys](#older-deploys)) issued under weaker rules. Their mints prove the
    quantification, not the VCS cycle.
  - **Registration.** An admin chooses the meter and approves modules, so `DEFAULT_ADMIN_ROLE` sits in the 2-of-3
    threshold account; the registry refuses a registration without a VVB's `ValidationApproval` over that meter and
    design. The setup script refuses demo plants on Hedera mainnet, including when `REGISTER_DEMO_PLANTS=true`. It
    also refuses a mainnet deploy that leaves both roles on the deployer.
- **Nobody shares a private key.** Buyers and agents sign with their own wallets (`prepare_purchase` returns unsigned
  transactions); the public deployment holds no server keys; the burner wallet is offered only on a local chain.
- **Public API.** Read and verify endpoints are unauthenticated and bounded by input limits (2 000 readings per
  batch). Each server instance refuses a client after 300 calls in 60 seconds (`429`, `Retry-After`). Instances do
  not share that counter, so a public deployment should still put a rate limit in front (a Vercel Firewall rule on
  `/api/*`). Guardian bridge routes keep their own 60 per minute. A mirror node or IPFS gateway that stays silent
  fails the read after 12 seconds (`UPSTREAM_TIMEOUT_MS`) instead of hanging reproduce, a trace, or a purchase quote.
- **Not a certification.** This implements the equations of VMR0017 v1.0 with ACM0002 v22.0, AMS-I.D, VT0011,
  TOOL07 and TOOL03 as described above, and the order of the VCS project cycle. It records VT0008 additionality
  evidence and the safeguards references and checks them for completeness, but the determination, stakeholder
  consultation, the monitoring plan and verification remain the job of a VVB, and issuance of VCUs the job of Verra.
  An issued unit here is a verified emission reduction under the registered methodology, not a VCU; an operator that
  also issues on Verra records the VCU range in `DmrvAnnotations`, and must not sell both.
- **Grid factor scope.** VT0011 and TOOL07 are implemented ex-ante with option A per-unit data and the simple,
  simple adjusted or average OM; the dispatch-data OM, option B, ex-post vintages and the annual BM update (VT0011
  ¶72 option 2) are not. Register a published combined margin (`grid.source: "published"`) for those; on the VMR0017
  path include its OM and BM, which the engine recombines with VT0011's weights.
  VMR0017's battery, pumped-storage and fire-suppression emission terms are not implemented (plain hydro does not
  need them). Credits here are not issued by a standard; avoid double claiming with RECs or any
  other instrument for the same generation.
- **Registry custody** means the registry holds credits and undelivered certificates for accounts. The contracts are
  not upgradeable. The only path that moves someone else's balance is the market named once by `setMarket`
  (`CreditMarket`, for listings and purchases the owner initiated). No role grant can add another caller.
- **Oracle risk** is bounded by two independent providers, a deviation guard, staleness checks and the
  seller-favouring round-up. Tune `MAX_PRICE_AGE_SECONDS` and `MAX_ORACLE_DEVIATION_BPS` to the feeds' heartbeats.
  `CreditMarket` enforces a SaucerSwap pool check on-chain on every quote and purchase (testnet and mainnet; see
  [the guard](#saucerswap-guard)). The purchase builder also refuses when the pair stored on CreditMarket is more
  than 3% from the oracle, or when the public mainnet pair `0.0.1462797` is more than 3% from mainnet Chainlink.
- **Write endpoints** are disabled unless `MRV_API_KEY` is set and use a constant-time comparison. Put them behind
  your own authentication before exposing them publicly. Purchases never touch the server: agents sign their own.
- **Not audited.** This is a starting point, not production-ready code.
