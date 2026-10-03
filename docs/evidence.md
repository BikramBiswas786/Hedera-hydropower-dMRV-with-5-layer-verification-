# Testnet evidence, keys and limits

What is deployed, what each transaction proves, and where the testnet setup is weaker than a mainnet one. The README
links the four transactions to open first. This page is the full record.

## The VCS cycle on testnet, 29 Sep 2026

The registry was deployed by the [Testnet deploy](../.github/workflows/testnet-deploy.yml) workflow from `3bbc4cd1`,
and every step after it by the [Testnet evidence](../.github/workflows/testnet-evidence.yml) workflow with the same
CLI an operator and a VVB use (`yarn mrv:record`, `mrv:verify`, `mrv:approve`, `mrv:submit`, `market:agent-buy`).
Anyone can re-derive every record from HCS: `yarn mrv:reproduce`, or the links below.

| Step | What it proves | Where |
| --- | --- | --- |
| Registration, validated | The admin registered each demo plant only with the demo VVB's `ValidationApproval` over its design, params and validation report. The report is the labelled demo statement in [`utils/validation.ts`](../packages/hardhat/utils/validation.ts) (what was and was not checked); its SHA-256 is the on-chain `validationReportHash` (`0x140bc36b…` and `0x201096d5…`) | [HYDRO-DEMO-01 0xc6fb2f1e…](https://hashscan.io/testnet/transaction/0xc6fb2f1e9b16b59e5a11134f4276cc9878ee5969fd5f4165edcf49f27b1ca520) · [HYDRO-DEMO-02 0xe09a2281…](https://hashscan.io/testnet/transaction/0xe09a2281b72ccbef798b5c96faca63e928ea9e2c0eb155283c6ec0e85d6183fc) |
| Monitoring, recorded not issued | Three 24-hour periods (27–29 Sep), each signed by the plant's meter, published to HCS (readings, then report) and quantified by `HydroVmr0017Module` on-chain. DEMO-01: +0.769 t per day; DEMO-02: −2.689 t (below) | [record 0 0x0e3ed83c…](https://hashscan.io/testnet/transaction/0x0e3ed83c7a946f9b3ace4fa313d0beb11f57b11aa863efead770d82cb9e30d39) · [record 1 0x18676337…](https://hashscan.io/testnet/transaction/0x18676337a85c9ba59aa75aca4d251a14aa25960f9ed2df0afe2fa61a2a1a7ddc) · [DEMO-02 record 0 0x81e896dc…](https://hashscan.io/testnet/transaction/0x81e896dc4d2493335d8105299583057c0ce803387d7e9e20639aca6bafd43ca0) · reports on HCS [#10](https://hashscan.io/testnet/topic/0.0.10729650/messages#10), [#15](https://hashscan.io/testnet/topic/0.0.10729650/messages#15), [#20](https://hashscan.io/testnet/topic/0.0.10729650/messages#20) |
| Verification, then issuance | The VVB reproduced both DEMO-01 records from HCS, published its verification report and signed the `VerificationStatement` over the record chain head; relayed, it issued ⌊1,537,266 g / 1,000⌋ = 1.537 t | [verifyPeriod 0xffe81724…](https://hashscan.io/testnet/transaction/0xffe81724e83bc9fd4e85bae234e3654588d48f0833a0e18fc865f25fd0e391c4) · [verification report #21](https://hashscan.io/testnet/topic/0.0.10729650/messages#21) |
| A verified deficit | DEMO-02 is a storage plant on Uganda's hydro-dominated grid: PE_HP (100 kg/MWh) plus embodied LE (21 kg/MWh) exceed the 110 kg/MWh it displaces. The VVB approved the record; nothing was issued and the −2.689 t carries against its future periods | [verifyPeriod 0x036c34f5…](https://hashscan.io/testnet/transaction/0x036c34f5f3431eea65eb2a42681119a5240f34e497ece09c572c7125d623a1a8) · [verification report #22](https://hashscan.io/testnet/topic/0.0.10729650/messages#22) |
| Listing and an agent's purchase | The operator listed 1 t at $15/t. A separate buyer ran `get_dex_price → list_open_listings → prepare_purchase` and signed `buyAndRetire` of 0.010 t (1.2726 HBAR), swapped through SaucerSwap and retired with an HYRET certificate | [list 0x500c5be9…](https://hashscan.io/testnet/transaction/0x500c5be93df1ebaa510596b99bbec81540c891231ce2a9135082250d95929698) · [buyAndRetire 0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0) |
| Reproduction | All three records re-derived from HCS by the engine with the registered design and meter, including each record's hash-chain link | `yarn mrv:reproduce`, [`/api/registry/attestations/0/reproduce`](https://hydro-dmrv.vercel.app/api/registry/attestations/0/reproduce) |

## What is on testnet

| What | Where |
| --- | --- |
| `DmrvRegistry` v2 · `HydroVmr0017Module` v2 · `RenewableVmr0017Module` (approved) · `DmrvAnnotations` · feed | [0x4EB51769…](https://hashscan.io/testnet/contract/0x4EB517694CBac7b59a26B188eFEBa35aAb5Fd48e) · [0xe9f23475…](https://hashscan.io/testnet/contract/0xe9f234753775AE6371819366472A84717ddb57eb) · [0x2A6FEc6B…](https://hashscan.io/testnet/contract/0x2A6FEc6Bf13FD1EdCa25F46943BEEfadDb75433a) · [0x2F5EC1b4…](https://hashscan.io/testnet/contract/0x2F5EC1b43414f97ae905808A69CE7040Ebb25E9F) · [0x59AFbF3a…](https://hashscan.io/testnet/contract/0x59AFbF3a3BA4587179d8E3aD49Bf7061fABa1e17) |
| `CreditMarket`, the registry's one market (`setMarket`), pool guard enforced on the seeded SaucerSwap V1 pair | [0x48F5056E…](https://hashscan.io/testnet/contract/0x48F5056EdaD0B16c97a54085512b48417bC40F04) · [guard 0xaa2523e9…](https://hashscan.io/testnet/transaction/0xaa2523e9b30de8228af159263e8e92c233aed721781594dcfa45a19b9b55cb85) |
| HCS audit topic | [0.0.10729650](https://hashscan.io/testnet/topic/0.0.10729650) |
| Credits HYCC · certificates HYRET | [0.0.10771273](https://hashscan.io/testnet/token/0.0.10771273) · [0.0.10771274](https://hashscan.io/testnet/token/0.0.10771274) |
| SaucerSwap V1 pair the purchase swaps | [0xF98D0dF4…](https://hashscan.io/testnet/contract/0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869) |
| Guardian check, negative: the holder 0.0.10721162 with a wrong token id, 0.0.10760320, answers HTTP 422 "No Guardian transfer", never `backed`; `checkout.purchase.test.ts` shows the builder returns 409 and never quotes for `not-backed` or `incomplete`, and fails if the trace call is removed | [trace, wrong token](https://hydro-dmrv.vercel.app/api/guardian/v1/trace?ref=ft:0.0.10760320:0.0.10721162) |
| Guardian token sold: 12.5 t minted by Managed Guardian (trace `backed`), listed on `UsdCheckout` at $15/t and bought through SaucerSwap, only after the trace gate passed | token [0.0.10760359](https://hashscan.io/testnet/token/0.0.10760359) · [mint 0.0.10238177-1790602426-400520522](https://hashscan.io/testnet/transaction/0.0.10238177-1790602426-400520522) · [list 0x2c09bf5b…](https://hashscan.io/testnet/transaction/0x2c09bf5b139cd83ceec301a44ae32504883011a64d6c43d714ad4e99d9f1af7f) · [buy 0x01886451…](https://hashscan.io/testnet/transaction/0x0188645163e1bf1aa3cfac7ca72a0c31b9c4cc655938c9edde6746be9cbc0bfe) |
| Guardian token, contract gate: `UsdCheckout` marks `0.0.10760359`. `buy` reverts. `buyTraced` sells 10 units only with a signature over that Guardian ref. Production `CHECKOUT_ADDRESS` is this contract | [0xa42B11B3…](https://hashscan.io/testnet/contract/0xa42B11B322a6Dd1B638abe69Aa6671A45C85Ab75) · [mark 0xc9937356…](https://hashscan.io/testnet/transaction/0xc99373563d891c814b86666674a2b9b1c8e271a7a5be2a01812a35ecf0f547cc) · [buyTraced 0x42212e6d…](https://hashscan.io/testnet/transaction/0x42212e6d7edc6725f9813921fe35d340c8bf7c91ccfafb92c31471895ba7e3ad) |
| Schedule Service, 2-of-3: a KeyList account [0.0.10764798](https://hashscan.io/testnet/account/0.0.10764798) made admin of `UsdCheckout`. Holder 1 scheduled `setPoolGuardEnabled(true)` and it waited; holder 2's `ScheduleSign` made the network run it. Holders 3 and 1 then scheduled and signed `renounceRole`, so the account holds no role (`yarn admin:demo`, throwaway keys) | [schedule 0.0.10764799](https://hashscan.io/testnet/schedule/0.0.10764799) · [call](https://hashscan.io/testnet/transaction/0.0.10721162-1790620225-035173372) · [schedule 0.0.10764800](https://hashscan.io/testnet/schedule/0.0.10764800) · [renounce](https://hashscan.io/testnet/transaction/0.0.10721162-1790620227-436533410) |
| Schedule Service, purchase: buyer `0.0.10015230` locked the quote on a fresh `UsdCheckout` and signed the schedule. Sixty seconds after `executeAt`, Hedera called `settleScheduled`. The seller `0.0.10721162` received 0.148478 of the pair's token and the buyer received 10 credit units. This contract is not the production checkout `0xa42B11B3…`, which does not have `schedulePurchase`. The seeded pair had been 267 bps under the oracle, inside the 3% guard but under the swap floor once the 0.3% pool fee was taken, so 1.170498 of the pair's token was sold for WHBAR first ([swap 0x75378793…](https://hashscan.io/testnet/transaction/0x753787934457d72f67733f82d834761bb60143199fd5f39d7ceb3aead5403eb8)). Two earlier schedules on the previous bytecode reverted: one while that floor was missed, one at the exact expiry second | [checkout 0xc084DDD1…](https://hashscan.io/testnet/contract/0xc084DDD1765145D6FF54bf1CBaF61B2fAa34BAC3) · [schedule 0.0.10842021](https://hashscan.io/testnet/schedule/0.0.10842021) · [Hedera's call](https://hashscan.io/testnet/transaction/0.0.7314364-1791031299-291157934) |
| `UsdCheckout` (any HTS token): list 50 units, buy 10 through SaucerSwap | [0x455eFbF0…](https://hashscan.io/testnet/contract/0x455eFbF07B2b5d5137AEc3601c43549593741898) · [buy 0x51c9b006…](https://hashscan.io/testnet/transaction/0x51c9b0062bd36e119fbefe8b6e58e18717be1a5ea10fc2d54116a1d768ae379d) |

Every contract above except `0xc084DDD1…` is verified on Sourcify with an **exact match** (source, compiler settings and metadata hash),
so HashScan shows its source. The [Sourcify verify](../.github/workflows/sourcify-verify.yml) workflow compiles the
commit each was deployed from (`3bbc4cd1` for the v2 registry, modules, annotations, feed and market; `fc43362a` for
the checkout) and submits the build the artifact came from; on 29 Sep 2026 it returned `exact_match` for all six v2
contracts. Earlier deploys, which the app no longer reads, are in [operations.md](operations.md#older-deploys).

The public testnet WHBAR/USDC pair priced HBAR at $2.28 on 26 Sep 2026. The oracle was $0.094, so the contract would
refuse every sale against it. The pair above was created on SaucerSwap factory `0.0.9959` at the Chainlink price. The
seller was paid that pair's token, not USDC. Testnet USDC is not a dollar, so that public pair cannot be the price
check.

The purchase builder also reads the public mainnet pair [0.0.1462797](https://hashscan.io/mainnet/contract/0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d) and will not return a transaction unless it is within 3% of [mainnet Chainlink](https://hashscan.io/mainnet/contract/0xAF685FB45C12b92b5054ccb9313e135525F9b5d5). A mainnet deploy uses that pair on-chain. Nothing is deployed on mainnet.

The demo VVB `0xE079E4f1deE110c43E3a94c9b313c149505156F2`, the meters `0x3a2c6B89464dA5c20D749FB9fFC6d581e77159D6`
(HYDRO-DEMO-01) and `0xbbd5eC3f5D146C3Cb6EB3B19a9F34C307558403E` (HYDRO-DEMO-02) and the buyer
`0x3cCD45f560467A33206363046E0AFC63a7E44264` are derived from the deployer's secret in CI
(`packages/hardhat/utils/testnetDemoKeys.ts`); their private keys are in no file. The operator and admin is
`0.0.10721162` until a 2-of-3 account takes over.

## What keeps this true

Seven workflows check the claims above against Hedera or produce them:

- [Testnet evidence](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/testnet-evidence.yml) (on demand) runs the whole cycle again: records, a VVB verification, a listing, an agent's `buyAndRetire`, and reproduces every record.
- [Live smoke](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/live-smoke.yml) (every 6 h and after each production deploy) clicks through the deployed app with no wallet: the pairs against their oracles, an open listing, an unsigned purchase, every record re-derived from HCS, a real Guardian mint traced, the scenarios, the MCP tools.
- [Guardian trace](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/guardian-trace.yml) (daily) traces a real Managed Guardian mint on testnet (token `0.0.10760359`, 12.5 t) and requires `backed`.
- [Mainnet fork](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-fork.yml) (every push) runs the settlement against SaucerSwap's real factory, the public WHBAR/USDC pair and mainnet Chainlink.
- [Testnet pair read](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/testnet-pair-keeper.yml) reports the seeded pair. It does not swap and it does not relist. [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) shows whether a sale would settle right now. If the pair is outside 3%, the sale reverts.
- [Mainnet checkout](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-checkout.yml) (on demand) is the mainnet settlement exhibit: a labelled test token sold through `UsdCheckout` against the public pair `0.0.1462797`, the seller paid USDC ([operations.md](operations.md#mainnet-settlement-exhibit)). It is ready and was rehearsed step for step on testnet on 29 Sep 2026 ([buy 0x019dc29b…](https://hashscan.io/testnet/transaction/0x019dc29be04bf50685238322d834bbde6ed932f51e2fd3e5fabec771b98bef26), seller paid 0.981 QUSD); it has not been run on mainnet, which needs a funded account.
- [Checkout testnet demo](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/checkout-testnet-demo.yml) (on demand) deploys `UsdCheckout` next to the live contracts and makes one sale.

## Buying

The server never holds the buyer's key. `prepare_purchase` reads the pair stored on `CreditMarket` and returns no transaction when that pair is more than 3% from the oracle. The contract does the same check, then swaps. There is not a second pool.

The market the app reads, [`0x48F5056E…`](https://hashscan.io/testnet/contract/0x48F5056EdaD0B16c97a54085512b48417bC40F04), sends the HBAR to SaucerSwap router `0.0.19264`. The seller is paid in the pair's USD token. The transaction [0x180f3a7c…](https://hashscan.io/testnet/transaction/0x180f3a7c2d0285a6a2ee0841c417232058a615093143c0a24489d396546178c0) is that swap (29 Sep 2026, pair 74 bps from the oracle). The pair is [`0xF98D0dF4…`](https://hashscan.io/testnet/contract/0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869).

That pair was seeded because the canonical testnet WHBAR/USDC pair, [`0x87664e55…`](https://hashscan.io/testnet/contract/0x87664e55d9606657f049139FF654390A72657667), priced HBAR at about $2.28 on 26 September 2026 while Chainlink was about $0.095. Using the public pair would revert every sale. The admin cannot turn the check off. The seeded pair does not follow HBAR, so it drifts:

| When | Gap | What happened |
| --- | --- | --- |
| 27 Sep 2026 | 411 bps ($0.09105 against $0.09479) | `settlementPrice` would have reverted |
| 28 Sep 2026 | brought back to 0 bps | [This swap](https://hashscan.io/testnet/transaction/0xf784083ceaf3a1b9b540d896f591e3db7186a379f34847770f4f13c4ae459d26) sold 0.377 of the pair's token back through router `0.0.19264` |
| 28 Sep 2026, later | 1,714 bps, then 198 bps at 13:20 UTC | The keeper pulled it back inside the band |
| 29 Sep 2026, 10:28 UTC | 74 bps ($0.11875 against $0.11787) | Accepted. This is the sale above |

[`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) shows the gap and whether a sale would settle right now.

The pair was seeded with 20 HBAR against QUSD, a test token this project minted. A seller on that recorded sale was paid in QUSD, not in USDC. Those swaps are history. This template no longer trades the pair back to the oracle and no longer relists from a keeper account. A purchase reverts while the pair is more than 3% from the oracle. The amount a sale would pay is still the oracle's. On mainnet the same code points at the public WHBAR/USDC pair `0.0.1462797`, and the seller would receive USDC. Nothing is deployed on mainnet.

The [pair read](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/testnet-pair-keeper.yml) is scheduled and only reports the drift. It does not swap. Live smoke does not swap before its check. The swaps in the table above already happened. They are not repeated.

The same contract is checked against Hedera mainnet on every push, with no key and no HBAR. The [Mainnet fork](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-fork.yml) workflow forks mainnet and runs [`test/MainnetFork.test.ts`](../packages/hardhat/test/MainnetFork.test.ts). SaucerSwap's factory returns `0.0.1462797` for WHBAR/USDC. The router quotes 1 HBAR through that pair, within 3% of mainnet Chainlink, and reverts on any other path. `setPoolGuard` accepts that pair, and `settlementPrice` uses mainnet Chainlink because the pair agrees within 3% (27 Sep 2026: $0.09513 against $0.09511, 2 bps; 29 Sep 2026: $0.11861925 against $0.1182475, 31 bps). A pool that names SaucerSwap's factory but is not in its `getPair` record is refused. `setPoolGuard` asks the factory, not the pool, because any contract can return SaucerSwap's address from `factory()`. The swap itself is not run on the fork. Hedera's forking plugin cannot yet emulate a token minted by a contract supply key.

The seller must be associated with the pair's USD token before listing, or keep a free auto-association slot. Otherwise Hedera refuses the swap's transfer and the purchase reverts. `prepare_purchase` checks the seller on the mirror node first and builds no transaction for a listing that would fail.

## Keys, honestly

- **Local chains.** Demo meter keys are `keccak256("hydro-dmrv demo meter " + plant id)` and the local VVB key is
  `keccak256("hydro-dmrv demo vvb local")`. They are public.
- **Hedera networks.** The deploy throws unless every plant has a generated meter key (`METER_ADDRESSES` or
  `.secrets/meters.<network>.json`). A mainnet deploy also throws if `VERIFIER_ADDRESS` and `ADMIN_ADDRESS` are unset.
  The contract refuses a VVB that is the operator, the meter or the reporter.
- **Meter keys on the demo server.** They are software keys in `METER_PRIVATE_KEYS`, standing in for data-logger
  hardware. Whoever runs the server can sign as the meter and record a period. It cannot issue: only a VVB's
  verification does, and the VVB reproduces every record from HCS before it signs.
- **The admin.** It registers projects and meters (only with a VVB's validation signature) and approves modules. It
  cannot issue or move anyone's credits: the registry names its one market once (`setMarket`).
- **The testnet demo VVB.** It is the author's labelled test key, derived in CI from the deployer secret, not an
  accredited verifier. One person holds the operator, meter and VVB keys on testnet, which is exactly what a real
  deployment must not do. The app and API hold no VVB key at all.
- **What the contract checks of HCS.** Only that a record or verification cites a non-zero sequence on topic
  `0.0.10729650`. It cannot load the message. `yarn mrv:reproduce`, the app and the VVB flow read it and refuse a
  mismatch; a direct `verifyPeriod` call can cite a sequence whose bytes are something else. `evidenceHash` is a
  single-use label, not a check of a Guardian VP.
- **The Uganda grid factor.** ASB0054-2022 expired on 9 August 2025; the demo plants were registered in 2026, outside
  its validity window. The tonnes illustrate the arithmetic, not a current grid.
- **What a credit is.** A unit is one tonne of verified emission reductions under the plant's registered methodology,
  issued by this registry. It is not a Verra VCU. These testnet credits come from demo plants with illustrative
  additionality evidence and no real impact assessment; they have no value.
