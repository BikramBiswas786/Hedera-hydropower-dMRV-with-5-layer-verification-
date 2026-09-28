# Testnet evidence, keys and limits

What is deployed, what each transaction proves, and where the testnet setup is weaker than a mainnet one. The
README keeps only the quickstart; this is the record behind it.

The live market the app reads is [`0x5aeDe76f…5030`](https://hashscan.io/testnet/contract/0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030), the same address as `packages/nextjs/contracts/deployedContracts.ts`. [This transaction](https://hashscan.io/testnet/transaction/0x4735808481bde453a2354b4ed395a00ba72112fdcbb0b96c9a1196e4c5753fab) is `buyAndRetire` of 0.020 t through SaucerSwap V1 router `0.0.19264`. Settlement is Chainlink (Supra fallback) plus that pair. There is no second market on the site.

## What is on testnet

The app reads one registry. Older ones stay on chain so their mints still reproduce. Link the transactions below, not a contract's full history.

| What (26 Sep 2026) | Where |
| --- | --- |
| `DmrvRegistry` · module · feed | [0xaf9C76B4…](https://hashscan.io/testnet/contract/0xaf9C76B48B317cee770ED6AE038D516b269E0129) · [0x8D574327…](https://hashscan.io/testnet/contract/0x8D57432792aD39Ef2d2e104904e31b157846261d) · [0x9529A018…](https://hashscan.io/testnet/contract/0x9529A0189654834949cf78f9ce25336be59F8AbB) |
| `CreditMarket` | [0x5aeDe76f…](https://hashscan.io/testnet/contract/0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030) |
| HCS audit topic | [0.0.10729650](https://hashscan.io/testnet/topic/0.0.10729650) |
| Credits HYCC · certificates HYRET | [0.0.10729677](https://hashscan.io/testnet/token/0.0.10729677) · [0.0.10729678](https://hashscan.io/testnet/token/0.0.10729678) |
| SaucerSwap V1 pair the purchase swaps | [0xF98D0dF4…](https://hashscan.io/testnet/contract/0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869) |
| Meter + VVB signed mint → 4.791 t | [0x321b6d20…](https://hashscan.io/testnet/transaction/0x321b6d20db7b24eaee672160fcb9643d6fafd357c204934e892446ac6db11b6e) |
| `buyAndRetire` 0.020 t on router `0.0.19264`. HYRET serial 2 | [0x47358084…](https://hashscan.io/testnet/transaction/0x4735808481bde453a2354b4ed395a00ba72112fdcbb0b96c9a1196e4c5753fab) |
| Guardian token sold: 12.5 t minted by Managed Guardian (trace `backed`), listed on `UsdCheckout` at $15/t and bought through SaucerSwap, only after the trace gate passed | token [0.0.10760359](https://hashscan.io/testnet/token/0.0.10760359) · [mint 0.0.10238177-1790602426-400520522](https://hashscan.io/testnet/transaction/0.0.10238177-1790602426-400520522) · [list 0x2c09bf5b…](https://hashscan.io/testnet/transaction/0x2c09bf5b139cd83ceec301a44ae32504883011a64d6c43d714ad4e99d9f1af7f) · [buy 0x01886451…](https://hashscan.io/testnet/transaction/0x0188645163e1bf1aa3cfac7ca72a0c31b9c4cc655938c9edde6746be9cbc0bfe) |
| `UsdCheckout` (any HTS token): list 50 units, buy 10 through SaucerSwap | [0x455eFbF0…](https://hashscan.io/testnet/contract/0x455eFbF07B2b5d5137AEc3601c43549593741898) · [buy 0x51c9b006…](https://hashscan.io/testnet/transaction/0x51c9b0062bd36e119fbefe8b6e58e18717be1a5ea10fc2d54116a1d768ae379d) |

All five contracts above are verified on Sourcify with an **exact match** (source, compiler settings and metadata hash), so HashScan shows their source. The [Sourcify verify](../.github/workflows/sourcify-verify.yml) workflow compiles each commit they were deployed from (`06a6278c` for the registry, module and feed, `61aba8a4` for the market, `fc43362a` for the checkout) and submits the standard-JSON input; its first full run on 28 Sep 2026 returned `exact_match` for all five. The source has moved on since: the testnet `HydroVmr0017Module` renews a VMR0017 plant for its original span, while the source moves renewals requested from 1 January 2027 to 5 years (VCS v5.0, V5#101). The first testnet crediting period ends in 2033, so no testnet renewal is affected before a redeploy.

The public testnet WHBAR/USDC pair priced HBAR at $2.28 that day. The oracle was $0.094, so the contract would refuse every sale against it. The pair above was created on SaucerSwap factory `0.0.9959` at the Chainlink price. The seller was paid that pair's token, not USDC. Testnet USDC is not a dollar, so that public pair cannot be the price check.

The purchase builder also reads the public mainnet pair [0.0.1462797](https://hashscan.io/mainnet/contract/0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d) and will not return a transaction unless it is within 3% of [mainnet Chainlink](https://hashscan.io/mainnet/contract/0xAF685FB45C12b92b5054ccb9313e135525F9b5d5). On 27 Sep 2026 the pair was $0.09490 and Chainlink was $0.09504, 15 bps. A mainnet deploy uses that pair on-chain. Nothing is deployed on mainnet.

The VVB `0x437EB06f434aD8061DEDdfCDd0ecE68Ea435e84F` is a labelled test key, not an accredited verifier. The meter addresses are `0x1a1b0B722a17C34BE6A08FE5efD636Dd54F848A2` and `0x485e9404831A05a072eeE80Aa4BfA05946fd6bF4`. Their private keys are not in the repository. Admin is operator `0.0.10721162` until a 2-of-3 account is set.

The testnet contracts were deployed on 26 Sep, before three source changes: the registry's single `setMarket` (it still has a grantable `MARKET_ROLE`), `setPoolGuard` asking SaucerSwap's factory for the pair, and the removal of the market's unused `proceedsOf` / `withdrawProceeds` and V2 branch. Their ABIs in `deployedContracts.ts` show that. The source is what `yarn test` and the Mainnet fork workflow check.

Older deploys, not read by the app, are in [docs/operations.md](operations.md). The legacy registry [`0x9cdB5782…`](https://hashscan.io/testnet/contract/0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5) still reproduces the same two greenfield amounts.

The legacy `HydroCreditRegistry` compiles to 24,551 B, 25 under Hedera's 24,576-byte limit, so it could not take another feature. After the split, `yarn hardhat:size` (a CI gate at 24,064 B) reports: `DmrvRegistry` 20,984 B, `CreditMarket` 9,044 B, `UsdCheckout` 8,595 B, `HydroVmr0017Module` 7,028 B, `ResilientHbarUsdFeed` 2,534 B. Since the redeploy the live issuer is `DmrvRegistry`.

Phase 1 enforces the following on-chain; the legacy registry does not:

- a crediting span of exactly 5, 7 or 10 × 365 days;
- `registrationRequestedAt` with the VCS five-year rule from 2027;
- a renewal that keeps the renewed span, or 5 years for a VMR0017 renewal from 2027 (VCS v5.0, V5#101);
- calibration valid through the period end;
- completeness computed from the meter-signed interval count;
- the VVB's decision;
- capacity-addition leakage as the higher of EG_PJ and EG_facility × Cap_add / Cap_PJ.

Greenfield figures are unchanged, so the two legacy mints still reproduce.

Design assessment also checks some things off-chain only:

- the VT0008 sensitivity table (at least ±10%), the geographic area and a capacity band of at least ±50%;
- the ACM0002 historical window for a retrofit or capacity addition;
- a baseline-validity reference when a crediting period is renewed.

A monitoring batch that reports captive supply must deliver more than half of it to the grid. The grid factor (TOOL07, or VT0011 for VMR0017):

- counts net imports and Annex I imports at 0 t CO2/MWh;
- takes the lowest fuel factor for a multi-fuel unit;
- leaves purpose-built wheeling out.

A measured fuel factor outside the IPCC 95% interval is refused. None of this changes a greenfield credited amount. Those evidence fields, and the registration request date, are not inside the on-chain `designHash`. That hash is the project document the testnet plants were registered with; the date is stored on-chain as `registrationRequestedAt`.

## Buying

The server never holds the buyer's key. `prepare_purchase` reads the pair stored on `CreditMarket` and returns no transaction when that pair is more than 3% from the oracle. The contract does the same check, then swaps. There is not a second pool.

The market the app reads, [`0x5aeDe76f…`](https://hashscan.io/testnet/contract/0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030), sends the HBAR to SaucerSwap router `0.0.19264`. The seller is paid in the pair's USD token. The transaction [0x47358084…](https://hashscan.io/testnet/transaction/0x4735808481bde453a2354b4ed395a00ba72112fdcbb0b96c9a1196e4c5753fab) is that swap. The pair is [`0xF98D0dF4…`](https://hashscan.io/testnet/contract/0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869). It was seeded because the canonical testnet WHBAR/USDC pair, [`0x87664e55…`](https://hashscan.io/testnet/contract/0x87664e55d9606657f049139FF654390A72657667), priced HBAR at about $2.28 on 26 September 2026 while Chainlink was about $0.095. Using that pair would revert every sale. The admin cannot turn the check off. On 27 Sep 2026 the seeded pair had drifted to 411 bps ($0.09105 against $0.09479), so `settlementPrice` would have reverted. [This swap](https://hashscan.io/testnet/transaction/0xf784083ceaf3a1b9b540d896f591e3db7186a379f34847770f4f13c4ae459d26) sold 0.377 of the pair's token back through router `0.0.19264` and the spot matched Chainlink again (0 bps). The pair does not follow HBAR, so this holds only while someone keeps it there: on 28 Sep 2026 it had drifted to 1,714 bps before the keeper pulled it back (198 bps, accepted, at 13:20 UTC). [`/api/market/dex`](https://hydro-dmrv.vercel.app/api/market/dex) shows the gap and whether a sale would settle right now.

Be clear about what that testnet pair is. It was seeded with 20 HBAR against QUSD, a test token this project minted, so a seller on testnet is paid in QUSD, not in money. At that depth a trade of a few dollars moves it out of band and blocks every sale (a denial of service), though never a cheaper purchase: the amount paid is still the oracle's. A TWAP would be stronger and is future work. The [Testnet pair keeper](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/testnet-pair-keeper.yml) workflow is scheduled to run `yarn pair:rebalance` every hour (GitHub runs schedules best-effort: on 28 Sep 2026 it fired at 05:52 UTC and then not for over seven hours, so [Live smoke](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/live-smoke.yml) runs the same rebalance before each check), because the seeded pair does not follow HBAR and a 3% move in HBAR is enough to push it out of band: it reads the market's pair, router and oracle, and with a `TESTNET_REBALANCER_KEY` repository secret it makes the one SaucerSwap swap that brings a pair drifted past 1% back to the oracle, then relists up to 1 t from that account's custody when less than 0.1 t is for sale (`yarn market:keep-listing`), so there is always something to buy. On mainnet the same code points at the public WHBAR/USDC pair `0.0.1462797`, where the seller receives USDC.

The same contract is checked against Hedera mainnet on every push, with no key and no HBAR: the [Mainnet fork](https://github.com/BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification-/actions/workflows/mainnet-fork.yml) workflow forks mainnet and runs [`test/MainnetFork.test.ts`](../packages/hardhat/test/MainnetFork.test.ts). SaucerSwap's factory returns `0.0.1462797` for WHBAR/USDC; `setPoolGuard` accepts it and `settlementPrice` settles at mainnet Chainlink because the pair agrees within 3% (on 27 Sep 2026: $0.09513 against $0.09511, 2 bps); a pool that names SaucerSwap's factory but is not in its `getPair` record is refused. `setPoolGuard` asks the factory, not the pool, since any contract can return SaucerSwap's address from `factory()`. The swap itself is not run on the fork: Hedera's forking plugin cannot yet emulate a token minted by a contract supply key.

The seller must be able to receive the pair's USD token: associate it before listing (or keep a free auto-association slot). Otherwise Hedera refuses the swap's transfer and the purchase reverts, so `prepare_purchase` checks the seller on the mirror node first and builds no transaction for a listing it would fail on.

## Keys, honestly

- **Local chains.** Demo meter keys are `keccak256("hydro-dmrv demo meter " + plant id)` and are public.
- **Hedera networks.** The deploy throws unless every plant has a generated meter key (`METER_ADDRESSES` or `.secrets/meters.<network>.json`). `REGISTER_DEMO_PLANTS=true` does not override that on mainnet. A mainnet deploy also throws if `VERIFIER_ADDRESS` and `ADMIN_ADDRESS` are unset. The verifier cannot be the operator or the meter, and the contract checks this too.
- **Meter keys on the demo server.** They are software keys in `METER_PRIVATE_KEYS`, standing in for data-logger hardware. Whoever runs the server can sign as the meter. That is why the VVB's second signature exists, and why the VVB may only lower figures.
- **The admin.** It registers projects and meters and approves modules. It cannot move anyone's credits: the registry names its one market once (`setMarket`), and no role grant adds another. A new market means a new registry. (The testnet registry on the site predates this rule and uses a grantable `MARKET_ROLE`.)
- **The demo VVB key.** `DEMO_VVB_PRIVATE_KEY` (`dmrv-demo-vvb-testnet`) is the author's labelled test key, not an accredited verifier. The server honours it only when `DEMO_REGISTRY_ADDRESS` equals the deployed registry. Every mint it approves is labelled "demo VVB" in the API, CLI and UI. Without it, the live API answers 409 "needs VVB approval" before publishing anything.
