# Operations

## Environment variables

Nothing is required to browse the app or use the engine. Copy the `.env.example` next to each package.

`packages/nextjs/.env.local`

| Variable | Required for | Notes |
| --- | --- | --- |
| `HEDERA_OPERATOR_ID` | publishing | Account that signs and pays for HCS messages. |
| `HEDERA_OPERATOR_KEY` | publishing | Hex or DER. If ECDSA, it is also the relayer's EVM key (the relayer needs no role). |
| `HCS_TOPIC_ID` | publishing | Created by `yarn mrv:create-topic`; the operator key is its submit key. |
| `MRV_API_KEY` | publishing | Bearer token for `POST /api/mrv/attest` and the MCP `submit_attestation` tool. Unset disables writes. |
| `VERIFIER_PRIVATE_KEY` | optional | Overrides the relayer EVM key that sends `submitAttestation` (ED25519 operators, local chains). It is **not** a VVB key and needs no role. |
| `METER_PRIVATE_KEYS` | server-side meter signing | JSON `{ "<plantId>": "<hex key>" }`, from `yarn hardhat:meter-keys`. Used only when a request has no meter signature. Software keys standing in for logger hardware; the public demo derivation is refused on Hedera chain ids. |
| `DEMO_VVB_PRIVATE_KEY` · `DEMO_REGISTRY_ADDRESS` | demo one-step minting | The labelled `dmrv-demo-vvb-testnet` key. Honoured only when `DEMO_REGISTRY_ADDRESS` equals the deployed `DmrvRegistry`; every mint it approves is labelled demo. Unset in production. |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` / `…MAINNET…` | optional | JSON-RPC relay; defaults to Hashio. |
| `NEXT_PUBLIC_MIRROR_NODE_URL` | optional | Defaults to the public mirror node of the first target network. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | optional | Your WalletConnect project id for production. |

`packages/hardhat/.env`

| Variable | Notes |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Written by `yarn hardhat:account:import` / `:generate`. |
| `VERIFIER_ADDRESS` | The VVB's secp256k1 signing address: gets `VERIFIER_ROLE`. Must not be a plant operator (the deploy throws) or a meter (the contract rejects). |
| `METER_ADDRESSES` | JSON `{ "<plantId>": "0x…" }` of the plants' meter addresses. Otherwise read from `.secrets/meters.<network>.json` (`yarn hardhat:meter-keys`). On Hedera networks the deploy throws if one is missing or equals the public demo derivation. |
| `POOL_GUARD_ENABLED` | `true` enforces the testnet SaucerSwap pool guard (default off: the testnet pool is mispriced); `false` disables it on mainnet (default on). |
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
| **Verify** `/verify` | Pick a plant and a scenario, or edit the JSON (readings, meter calibration, even the plant design). The report updates as you type: decision, five stages, ER / BE / PE / LE, an equation trace, QA/QC deductions and every finding. When the registry is deployed it quantifies against the plant's on-chain ledger. It previews the exact HCS report and data hash; operators can publish with the API key. |
| **Market** `/market` | Both oracle sources, which one is pricing, and whether purchases are paused. Your custody balance and proceeds; list credits in USD per tonne; buy, or buy and retire in one transaction; associate the HTS token (HIP-719) and withdraw to your wallet. |
| **Plants** `/plants`, `/plants/{id}` | Every registered plant; per plant the registered design (capacity, reservoir and power density, TOOL07 grid factor, TOOL03 COEF, baseline, crediting period, design hash), the on-chain ledger (crediting year, carried balance) and every attestation with BE, PE, ER, credits, coverage and links to its HCS report and reproduction. Rendered on the server from the same reads as the API. |
| **Portfolio** `/portfolio` | Everything an account retired, or anyone retired on behalf of a company, with totals, NFT certificates and a **CSV export** for a GHG inventory or ESG report (beneficiary names are formula-escaped). |
| **Audit** `/audit` | Every attestation with EG_PJ, ER, credits and its HCS link. **Check evidence** runs the full reproduction in your browser. Retirements link to their certificates. |
| **Certificate** `/certificate/{id}` | A printable retirement certificate in t CO₂e backed by on-chain data, with its NFT serial and Hashscan link. If the NFT could not be delivered at retirement, associate and claim it here. |
| **Debug** `/debug` | Scaffold-HBAR's contract console for every function, including `preview` to quantify a period. `buy` / `buyAndRetire` are hidden: purchases go through `prepare_purchase`. |

## Project structure

```
packages/
├── hardhat/
│   ├── contracts/
│   │   ├── DmrvRegistry.sol             projects, meters, VVBs, two-signature attestation, custody, retirement, all HTS
│   │   ├── modules/HydroVmr0017Module.sol   IMethodology: hydro registration rules and on-chain quantification
│   │   ├── CreditMarket.sol             listings, oracle settlement, SaucerSwap pool guard, proceeds
│   │   ├── ResilientHbarUsdFeed.sol     Chainlink + Supra aggregator behind AggregatorV3Interface
│   │   ├── legacy/HydroCreditRegistry.sol   phase-0 registry (read-only on testnet; kept for evidence)
│   │   ├── lib/HederaTokenLib.sol       HTS create / mint / burn / transfer for tokens and NFTs
│   │   ├── interfaces/                  IMethodology, ISaucerSwap, IHederaTokenService subset, Chainlink, Supra
│   │   └── mocks/                       HTS (tokens + NFTs + association), Chainlink, Supra, SaucerSwap V1/V2 pools
│   ├── deploy/                          00 feed + module + registry + market · 01 idempotent setup (tokens, roles, plants, pool guard)
│   ├── scripts/                         checkContractSizes.ts (CI gate) · generateMeterKeys.ts
│   ├── utils/                           per-network config (feeds, pool guards) · demoPlants.ts · meterKeys.ts
│   └── test/                            registry, module, market, sizes, meter keys, legacy, oracle, fixtures/
└── nextjs/
    ├── app/
    │   ├── methodology/ verify/ market/ audit/ certificate/[id]/   pages; client components in _components/
    │   └── api/                         methodology/* · mrv/* · registry/* · market/* · mcp
    ├── services/mrv/
    │   ├── methodology/                 fuels (IPCC) · tool07 · tool03 · project · quantify · schema · document
    │   ├── engine.ts  schema.ts         5-stage verification and QA/QC
    │   ├── demo.ts  scenarios.ts        illustrative grid, demo designs and plants, deterministic scenarios
    │   ├── report.ts  pipeline.ts       HCS data, report and project messages
    │   ├── mirror.ts  audit.ts          mirror-node reads, audit and reproduction
    │   ├── pricing.ts  views.ts  network.ts
    │   └── server/                      HCS publishing, registry reads, attestation, methodology, market, MCP, auth
    ├── scripts/mrv.ts                   yarn mrv:create-topic · mrv:attest · mrv:approve · mrv:submit · mrv:meter-key · mrv:sign
    ├── scripts/createThresholdAdmin.ts  yarn admin:threshold (2-of-3 KeyList account)
    ├── scripts/adminExec.ts             yarn admin:exec (admin calls as scheduled transactions)
    └── public/llms.txt
.harness/                                Hedera Harness spec, PRD, validators, acceptance contract
template.json                            create-scaffold-hbar manifest
```

## Extending the template

- **Your plant.** Write its `ProjectDesign` (capacity, reservoir areas, history for retrofits, fuel, crediting period,
  and either your grid's per-unit data for TOOL07 or a DNA-published combined margin), run `assess_project` or
  `POST /api/methodology/assess`, and register the returned params and `designHash` with `registerProject`. Serve or
  publish the design document so anyone can check the hash.
- **Real monitoring data.** Have the logger sign each batch's EIP-712 meter statement, post it to
  `POST /api/mrv/attest` with `publishForApproval: true`, get the VVB's signature, and post again with `anchor` and
  `verifierSignature`. Include your plant profile and metering data (accuracy classes, calibration dates). Keep batches under the 20-chunk limit (about a
  week of hourly data).
- **More of the methodology.** TOOL07 option B, dispatch-data and ex-post OM, imports and off-grid plants, integrated
  hydro projects, battery storage, TOOL05 for grid electricity consumed by the project. Add them in `methodology/`
  with hand-checked tests; mirror anything that changes issued quantities in the contract and the shared vectors.
- **Another methodology.** Implement `IMethodology` as a new module and approve it; the registry does not change.
- **Another oracle.** Implement `AggregatorV3Interface`, or change the providers behind `ResilientHbarUsdFeed`.
- **Mainnet.** Put `chains.hedera` first in `scaffold.config.ts` and deploy with `--network hederaMainnet`.

## Phase-1 redeploy

This needs the maintainer's keys; nothing here runs from CI. The legacy registry `0x9cdB5782…` stays deployed and
readable; the app reads it whenever `deployedContracts.ts` has zero addresses for chain 296.

**Testnet run, 26 Sep 2026 (14:55–15:05 IST).** Operator (deployer, plant operator and, for now, admin) 0.0.10727555
`0xc85f772c547fE3BfDD96d4B9CEa1F0Af16412A5e`; audit topic `0.0.10727574`; `DmrvRegistry` `0xc427610cFfBC919dC0B2c3f71644a4fDcB7ef84a`
(0.0.10727585), `CreditMarket` `0xd94157D9FEA7c1e572e3674c2854B404a82cf39E` (0.0.10727588), `HydroVmr0017Module`
`0x176cB1d5AF441ffbEaFe2793c729533c17Cf7c92`, `ResilientHbarUsdFeed` `0x4a6b2FE9D56B792b175Cc60b9267b33B8ac32f8a`;
HYCC `0.0.10727593`, HYRET `0.0.10727596`; VVB `0x89bb96102384BdC882313F11c7E6a4Ad8B3e57c4`. Step 3 was skipped: the
operator account holds `DEFAULT_ADMIN_ROLE` on both contracts. To hand it over, create the 2-of-3 account and, from the
operator, `grantRole(DEFAULT_ADMIN_ROLE, <threshold long-zero address>)` then `renounceRole(DEFAULT_ADMIN_ROLE, operator)`
on `DmrvRegistry` and `CreditMarket` (or re-run the deploy with `ADMIN_ADDRESS`, which does both). Transaction links are
in the README evidence table.

A second, parallel deploy the same day (`DmrvRegistry` `0xe34BeFc4081a8e751271C3549B861e03Fac512b9`, VVB
`0x437EB06f434aD8061DEDdfCDd0ecE68Ea435e84F`, HYCC `0.0.10727597`, HYRET `0.0.10727601`, readings on the old topic
`0.0.10726081`) is **superseded and unused**: the app does not read it, and it is listed in the README only for the
record.

1. **Meter keys.** `yarn hardhat:meter-keys --network hederaTestnet` writes `packages/hardhat/.secrets/meters.hederaTestnet.json`
   (gitignored). Put the private keys into the server's `METER_PRIVATE_KEYS`, or on the loggers.
2. **VVB key.** Create a secp256k1 key for the demo VVB (`dmrv-demo-vvb-testnet`), separate from the operator and the
   meters. Its address is `VERIFIER_ADDRESS`. A real VVB keeps its own key and only ever sends a signature.
3. **Threshold admin.** Collect three public keys, then
   `THRESHOLD_ADMIN_PUBLIC_KEYS="pk1,pk2,pk3" yarn admin:threshold --execute`. It prints `0.0.x` and the long-zero
   address; that is `ADMIN_ADDRESS`.
4. **Deploy.** Create a topic first (`yarn mrv:create-topic`), then `HCS_TOPIC_ID=0.0.… VERIFIER_ADDRESS=… ADMIN_ADDRESS=… yarn deploy --network hederaTestnet`. It
   deploys the module, registry and market, creates new HTS tokens, registers both demo plants with the generated
   meters, stores the SaucerSwap testnet pool guard (disabled), grants the roles, and hands admin to the threshold
   account. It regenerates `packages/nextjs/contracts/deployedContracts.ts` (chain 296 has zero-address placeholders
   until then).
5. **Verify.** `yarn hardhat:verify:sourcify hederaTestnet` (Sourcify v2 API, shown on HashScan; `yarn hardhat:verify:testnet`
   calls the retired v1 API and fails), then check the roles:
   `hasRole(VERIFIER_ROLE, VVB)`, `hasRole(DEFAULT_ADMIN_ROLE, threshold)`, and no admin role left on the deployer.
6. **Evidence.** Run `yarn mrv:attest healthy HYDRO-DEMO-01` (it writes `attest-HYDRO-DEMO-01-<seq>.json`), then
   `VVB_PRIVATE_KEY=… yarn mrv:approve attest-HYDRO-DEMO-01-<seq>.json` and `yarn mrv:submit attest-HYDRO-DEMO-01-<seq>.json`.
   Do the same for `diesel-backup HYDRO-DEMO-02`, then list and buy-and-retire one tonne from `/market`. Record the transaction links
   in the README evidence table.
7. **Vercel env.** `METER_PRIVATE_KEYS`, and if the demo site should mint in one step, `DEMO_VVB_PRIVATE_KEY` +
   `DEMO_REGISTRY_ADDRESS` (the new registry). Redeploy the app.
8. **Tag** the release and keep the legacy links: `/api/registry/attestations/{id}/reproduce?registry=0x9cdB…`.

Admin changes after the handover go through the threshold account:
`yarn admin:exec schedule <CreditMarket 0x…> "setPoolGuardEnabled(bool)" true` by one holder, then
`yarn admin:exec sign <scheduleId>` by a second.

### SaucerSwap guard: fallback

The on-chain guard compares a SaucerSwap WHBAR/USDC pool with the oracle consensus and reverts beyond 3%.

- **Hedera testnet: off.** On 26 Sep 2026 the testnet pools priced HBAR at about $2.03 (V2) and $2.28 (V1) against
  about $0.094. The pool is stored but not enforced; purchases settle on Chainlink/Supra, and only the off-chain
  mainnet pre-flight in `prepare_purchase` applies. Enforce it with `POOL_GUARD_ENABLED=true` at deploy, or
  `setPoolGuardEnabled(true)` through the threshold account, if testnet liquidity ever tracks the market.
- **Mainnet: on.** The V2 WHBAR/USDC pool tracked the oracle price on the same date.
- **If a pool is drained or manipulated**, purchases revert rather than mis-price. The threshold admin can switch the
  guard off (`setPoolGuardEnabled(false)`) or repoint it (`setPoolGuard`).
- **Limits.** A spot price can be moved in one block, so the guard can be used to block sales. It cannot make them
  cheaper, because payment always uses the oracle price. A TWAP is future work.

## Security model and limitations

- **No single key mints.** A mint needs the project's meter signature and a registered VVB's approval over that
  statement's digest, and the VVB may only make figures more conservative. Readings, reports and hashes are public
  and the engine is deterministic. Residual trust:
  - **The demo site's meter keys are server-held software keys** (`METER_PRIVATE_KEYS`). Whoever runs the server can
    sign as the meter, up to the nameplate. A production plant needs a key that never leaves the logger.
  - **The demo VVB key is the author's labelled test key.** It is honoured only on a matching `DEMO_REGISTRY_ADDRESS`,
    and every mint says so.
  - **The legacy testnet registry** registered the public demo meter derivation and trusted one verifier key. Its two
    mints prove the quantification, not the metering.
  - **Registration.** An admin chooses the meter and approves modules, so `DEFAULT_ADMIN_ROLE` sits in the 2-of-3
    threshold account, and a VVB should validate the design and the meter before `registerProject`. The setup script refuses demo plants on Hedera mainnet, including when
  `REGISTER_DEMO_PLANTS=true`. It also refuses a mainnet deploy that leaves both roles on the deployer.
- **Nobody shares a private key.** Buyers and agents sign with their own wallets (`prepare_purchase` returns unsigned
  transactions); the public deployment holds no server keys; the burner wallet is offered only on a local chain.
- **Public API.** Read and verify endpoints are unauthenticated and bounded by input limits (2 000 readings per
  batch); put a rate limit in front of a public deployment (e.g. a Vercel Firewall rule on `/api/*`).
- **Not a certification.** This implements the equations of VMR0017 v1.0 with ACM0002 v22.0, AMS-I.D, VT0011,
  TOOL07 and TOOL03 as described above. It records VT0008 additionality evidence and checks it for completeness, but the
  determination, stakeholder consultation, the monitoring plan and verification remain the job of a VVB and a
  registry (Verra, Gold Standard).
- **Grid factor scope.** VT0011 and TOOL07 are implemented ex-ante with option A per-unit data and the simple,
  simple adjusted or average OM; the dispatch-data OM, option B, ex-post vintages and the annual BM update (VT0011
  ¶72 option 2) are not. Register a published combined margin (`grid.source: "published"`) for those.
  VMR0017's battery, pumped-storage and fire-suppression emission terms are not implemented (plain hydro does not
  need them). Credits here are not issued by a standard; avoid double claiming with RECs or any
  other instrument for the same generation.
- **Registry custody** means the registry holds credits and undelivered certificates for accounts. The contracts are
  not upgradeable. The only path that moves someone else's balance is `MARKET_ROLE` (held by `CreditMarket`, for
  listings and purchases the owner initiated).
- **Oracle risk** is bounded by two independent providers, a deviation guard, staleness checks and the
  seller-favouring round-up. Tune `MAX_PRICE_AGE_SECONDS` and `MAX_ORACLE_DEVIATION_BPS` to the feeds' heartbeats.
  `CreditMarket` can also enforce a SaucerSwap pool check on-chain (enabled on mainnet, off on testnet; see
  [the fallback](#saucerswap-guard-fallback)). The purchase builder additionally refuses when the SaucerSwap V1
  WHBAR/USDC spot (mainnet pair `0.0.1462797`) is more than 3% from the settlement price.
- **Write endpoints** are disabled unless `MRV_API_KEY` is set and use a constant-time comparison. Put them behind
  your own authentication before exposing them publicly. Purchases never touch the server: agents sign their own.
- **Not audited.** This is a starting point, not production-ready code.
