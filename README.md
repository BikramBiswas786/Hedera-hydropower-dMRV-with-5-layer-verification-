# Hydro dMRV

A Scaffold-HBAR template for the part of digital MRV a policy engine leaves off-chain. `DmrvRegistry` mints only when two keys agree: the plant's meter signs an EIP-712 statement of the raw totals, and an accredited VVB signs an approval over that statement's digest. The VVB can only lower the figures. A pluggable methodology module (`HydroVmr0017Module`) recomputes `ER = BE − PE − LE` from the registered design, and the registry will not mint a different integer. Issuance is anchored on HCS. `CreditMarket` settles sales in HBAR only when Chainlink and Supra agree and a SaucerSwap WHBAR/USDC pool is within 3% of that price. There is no sale without the pool.

This sits next to [Hedera Guardian](https://github.com/hashgraph/guardian), it does not replace it. Guardian runs roles, verifiable credentials and the methodology library (including ACM0002, AMS-I.D, Tool 03 and Tool 07). A policy's Http Request Block can send its Monitoring Report VC to `/api/guardian/v1/cross-check` and get back a result VC signed by this app's own `did:hedera` DID, and `verify_guardian_evidence` checks a Guardian trust chain from the mirror node before our registry relies on it. The policy patch guide is [docs/GUARDIAN.md](docs/GUARDIAN.md). The worked example is hydropower under **Verra VMR0017 v1.0** with **ACM0002 v22.0**. That is an implementation of the equations, not a certification and not a Verra issuance.

| | Guardian | This template |
| --- | --- | --- |
| Roles, VC/DID, methodology library | Yes | No |
| Contract recomputes the tonne, meter + VVB signatures, HCS re-derivation, two-oracle HTS sale | No | Yes |
| Guardian VC as attestation evidence | Issues it | Binds its hash once (`evidenceHash`, `evidenceUsed`) |

## Quick start

Node.js ≥ 20.18.3, Git, and Yarn via Corepack (`corepack enable`). From an empty directory, this is the command CI runs:

```bash
npm create scaffold-hbar@latest -- hydro-dmrv \
  --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification- \
  --ci --package-manager yarn --solidity-framework hardhat --skip-hedera-skills
cd hydro-dmrv
yarn test
```

`yarn test` checks that the TypeScript engine and `HydroVmr0017Module.quantify` agree on one set of integers. It also shows the two live testnet mints (4,791,542 g and 73,386,435 g) still reproducing through the new module. A clone of this repo behaves the same after `yarn install`.

Local chain, no faucet and no Hedera account:

```bash
yarn chain:offline                  # terminal 1
yarn deploy --network localhost     # terminal 2: HTS, Chainlink and Supra mocks, both demo plants
```

Move `hederaLocalFork` to the front of `targetNetworks` in `packages/nextjs/scaffold.config.ts`, then `yarn start` (http://localhost:3000). To mint locally:

1. Deploy with `VERIFIER_ADDRESS` set to a VVB account other than the deployer.
2. Set `MRV_API_KEY` and `VERIFIER_PRIVATE_KEY` in `packages/nextjs/.env.local`. `VERIFIER_PRIVATE_KEY` only relays the transaction and needs no role.
3. Run the two-step flow:

```bash
yarn mrv:attest healthy HYDRO-DEMO-01           # step 1: verify, anchor, write attest-HYDRO-DEMO-01-0.json
VVB_PRIVATE_KEY=0x… yarn mrv:approve attest-HYDRO-DEMO-01-0.json   # the VVB signs, on its own machine
yarn mrv:submit attest-HYDRO-DEMO-01-0.json     # step 2: relay both signatures
```

Testnet: `yarn hardhat:account:import`, `yarn hardhat:meter-keys --network hederaTestnet` (per-plant meter keys, gitignored), then `yarn deploy --network hederaTestnet`. The deploy throws on a Hedera network if a meter key is the public demo derivation. Publishing also needs `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (ECDSA), `HCS_TOPIC_ID` (`yarn mrv:create-topic`) and `MRV_API_KEY`. The variable tables are in [docs/operations.md](docs/operations.md).

## Ninety seconds, no wallet

Live app: [hydro-dmrv.vercel.app](https://hydro-dmrv.vercel.app). MCP: `https://hydro-dmrv.vercel.app/api/mcp`.

| You are | Do this |
| --- | --- |
| Looking | [/verify](https://hydro-dmrv.vercel.app/verify): `healthy` passes, `inflated` and `tampered` do not. [/audit](https://hydro-dmrv.vercel.app/audit): **Check evidence** re-runs a testnet issuance in the browser. |
| Buying | Testnet ECDSA account from [portal.hedera.com](https://portal.hedera.com) → [/market](https://hydro-dmrv.vercel.app/market) **Buy & retire**. The page will not build the transaction if SaucerSwap is more than 3% off the settlement price. |
| An agent | `claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp` then `get_dex_price` → `list_open_listings` → `prepare_purchase` → sign with your own key. `reproduce_attestation` re-derives any issuance from HCS. |

`/water` is illustrative VMR0015. It does not mint the hydro token.

## What is on testnet

Two registries (plus a superseded, unused parallel deploy listed last), and the evidence stays linked to the one that produced it:

| | Legacy `HydroCreditRegistry` (phase 0) | `DmrvRegistry` + `CreditMarket` (phase 1, this source) |
| --- | --- | --- |
| Address | [`0x9cdB5782…84107a5`](https://hashscan.io/testnet/contract/0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5) (0.0.10726070), read-only from the app | `DmrvRegistry` [`0xc427610c…7ef84a`](https://hashscan.io/testnet/contract/0xc427610cFfBC919dC0B2c3f71644a4fDcB7ef84a) (0.0.10727585), `CreditMarket` [`0xd94157D9…2cf39E`](https://hashscan.io/testnet/contract/0xd94157D9FEA7c1e572e3674c2854B404a82cf39E) (0.0.10727588), redeployed 26 Sep 2026 |
| Who can mint | One verifier key | Meter key + VVB key (EIP-712), neither alone |
| Meter keys | Public demo derivation | Per plant, generated; the deploy refuses demo keys on Hedera |
| Admin | Deployer | Testnet: the operator account 0.0.10727555 for now; hand it to a 2-of-3 threshold account (`yarn admin:threshold`, then redeploy setup with `ADMIN_ADDRESS`, or `grantRole` + `renounceRole`) |
| SaucerSwap check | Off-chain in `prepare_purchase` only | Also in `CreditMarket.settlementPrice()`; configurable and admin-disableable. Off on testnet (see [Buying](#buying)) |
| Evidence | The two mints and the retirement in the legacy table | The two mints, VVB approvals and buy-and-retire in the phase-1 table |

The app now reads the phase-1 registry (`deployedContracts.ts`, chain 296). `/api/registry/attestations/{id}/reproduce?registry=0x9cdB…` still reads the legacy registry, and both legacy mints still reproduce. Do not point the app at the older registry `0xAEA76b83ea8e71621d443053A5Ee20D7AF8Ce746`. Link the transactions below, not the contract's transaction list (that list also shows a failed 1-tinybar probe).

| What (phase-1 registry, 26 Sep 2026) | Where |
| --- | --- |
| `DmrvRegistry` · `CreditMarket` · `HydroVmr0017Module` · `ResilientHbarUsdFeed` (all Sourcify exact match) | [0xc427610c…](https://hashscan.io/testnet/contract/0xc427610cFfBC919dC0B2c3f71644a4fDcB7ef84a) · [0xd94157D9…](https://hashscan.io/testnet/contract/0xd94157D9FEA7c1e572e3674c2854B404a82cf39E) · [0x176cB1d5…](https://hashscan.io/testnet/contract/0x176cB1d5AF441ffbEaFe2793c729533c17Cf7c92) · [0x4a6b2FE9…](https://hashscan.io/testnet/contract/0x4a6b2FE9D56B792b175Cc60b9267b33B8ac32f8a) |
| HCS audit topic (`auditTopic`) | [0.0.10727574](https://hashscan.io/testnet/topic/0.0.10727574) |
| Credits HYCC · certificates HYRET | [0.0.10727593](https://hashscan.io/testnet/token/0.0.10727593) · [0.0.10727596](https://hashscan.io/testnet/token/0.0.10727596) |
| HYDRO-DEMO-01 `healthy`: readings, report | HCS messages [1](https://hashscan.io/testnet/topic/0.0.10727574/message/1), [5](https://hashscan.io/testnet/topic/0.0.10727574/message/5) |
| HYDRO-DEMO-01: meter + VVB signed mint → 4.791 t (ER 4,791,648 g) | [0x1f2c350d…](https://hashscan.io/testnet/transaction/0x1f2c350d9f620360e9212501d4ccb377404bbbfc028e7e8320800f13e9476709) |
| HYDRO-DEMO-02 `diesel-backup`: readings, report | HCS messages [6](https://hashscan.io/testnet/topic/0.0.10727574/message/6), [10](https://hashscan.io/testnet/topic/0.0.10727574/message/10) |
| HYDRO-DEMO-02: meter + VVB signed mint → 73.388 t (ER 73,388,503 g) | [0xb25cd5c1…](https://hashscan.io/testnet/transaction/0xb25cd5c13b998431f4d6596fac6783ec12719d0b6bcb2edb464e9bf2a1b9d5c4) |
| VVB approval (EIP-712, VVB `0x89bb9610…3e57c4`, `VERIFIER_ROLE` grant) | [0xe9e40def…](https://hashscan.io/testnet/transaction/0xe9e40def8ab230c1fee02a3205ea8b3b361d03719d07181bf3db0e9eda808362); each approval signature is verified inside the mint transaction above |
| Listing #0, 1.000 t at $10/t | [0xdb10f74e…](https://hashscan.io/testnet/transaction/0xdb10f74e9e30ca78b9cbb173748a28d87e39caa2cbdc5bd6afaa098ecdd8a28a) |
| `buyAndRetire`, 0.100 t by 0.0.10727556, HYRET serial 1 delivered | [0xe620a834…](https://hashscan.io/testnet/transaction/0xe620a8346b7ade59277cfde7bfc3cc0bf716fe57129002120fb814f745c7de4c) |

| What (legacy registry `0x9cdB5782…`) | Where |
| --- | --- |
| Mint, HYDRO-DEMO-01 `healthy` → 4.791 t | [0xb473de58…](https://hashscan.io/testnet/transaction/0xb473de5821d62467f4cc76339c81f1109b6baff2d77f70aea7b8156ea64f19f2) |
| Second mint, HYDRO-DEMO-02 `diesel-backup` → 73.386 t | [0x8fef0c11…](https://hashscan.io/testnet/transaction/0x8fef0c119c3b4b2b87aa704ca3c26c9dedecc2648b96853e6f7394fc425c0e42) |
| Retirement, 1.000 t, HYRET serial 1 | [0x9f8979fb…](https://hashscan.io/testnet/transaction/0x9f8979fbb2eefbb278b2e305deec469d0ebe752d79a511290c44cea75bb7dac9) |

Legacy credits stay on HTS [0.0.10726073](https://hashscan.io/testnet/token/0.0.10726073) (HYCC) and [0.0.10726074](https://hashscan.io/testnet/token/0.0.10726074) (HYRET). The legacy feed is [0xcAE7c6eA…ba77cbb8](https://hashscan.io/testnet/contract/0xcAE7c6eA987107543C1aD0F79802d02cba77cbb8).

| What (superseded, unused: a parallel `DmrvRegistry` `0xe34BeFc4…` deploy, 26 Sep 2026; the app does not read it) | Where |
| --- | --- |
| Registry | [0xe34BeFc4…](https://hashscan.io/testnet/contract/0xe34BeFc4081a8e751271C3549B861e03Fac512b9) |
| Methodology module | [0xD5F56249…](https://hashscan.io/testnet/contract/0xD5F56249f628080D4b0fF2Ff23809e1624F64950) |
| Market | [0xcfFD810E…](https://hashscan.io/testnet/contract/0xcfFD810Ee8d6a17b2C711D41f967e14EEEa5d767) |
| Oracle feed | [0x1671e299…](https://hashscan.io/testnet/contract/0x1671e29973A8E38beA1DeADf3125E60930da0046) |
| Mint, HYDRO-DEMO-01 `healthy` → 4.791 t | [0xfcc6a982…](https://hashscan.io/testnet/transaction/0xfcc6a9820736816427a899e1f2e722128a78b0c76b14ca3da58bed14679ce948) |
| Second mint, HYDRO-DEMO-02 `diesel-backup` → 73.388 t | [0xb307eccf…](https://hashscan.io/testnet/transaction/0xb307eccf40feca7dae2c5cec6e576ad5605393eccb9570824249defc2ed95647) |
| Buy and retire, 1.000 t, from `0.0.10721162`, HYRET serial 1 | [0xc3bd20e5…](https://hashscan.io/testnet/transaction/0xc3bd20e54892791966451da1ad04719a781bf69871009f54bf03232ff7d0ac0a) |
| Pool guard stored, not enforced | [0x6f7a464f…](https://hashscan.io/testnet/transaction/0x6f7a464f10d0948c1f30239b02bd9f21fc7770100af73dcc26106ab268db5d9e) |

Superseded deploy only (unused): credits HTS [0.0.10727597](https://hashscan.io/testnet/token/0.0.10727597). Certificates: HTS [0.0.10727601](https://hashscan.io/testnet/token/0.0.10727601), serial 1 held by [0.0.10721162](https://hashscan.io/testnet/account/0.0.10721162). The VVB that signed both mints is `0x437EB06f434aD8061DEDdfCDd0ecE68Ea435e84F`. It is a test key, not an accredited verifier. The meter addresses are `0x1a1b0B722a17C34BE6A08FE5efD636Dd54F848A2` and `0x485e9404831A05a072eeE80Aa4BfA05946fd6bF4`. Their private keys are not in the repository. Readings for the new mints are HCS messages [11](https://hashscan.io/testnet/topic/0.0.10726081/message/11) and [16](https://hashscan.io/testnet/topic/0.0.10726081/message/16) on topic [0.0.10726081](https://hashscan.io/testnet/topic/0.0.10726081).

The legacy `HydroCreditRegistry` compiles to 24,551 B, 25 under Hedera's 24,576-byte limit, so it could not take another feature. After the split, `yarn hardhat:size` (a CI gate at 24,064 B) reports: `DmrvRegistry` 20,862 B, `CreditMarket` 9,010 B, `HydroVmr0017Module` 7,028 B, `ResilientHbarUsdFeed` 2,534 B. Since the redeploy the live issuer is `DmrvRegistry`.

Phase 1 enforces the following on-chain; the legacy registry does not:

- a crediting span of exactly 5, 7 or 10 × 365 days;
- `registrationRequestedAt` with the VCS five-year rule from 2027;
- a renewal that keeps the renewed span;
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

## Keys, honestly

- **Local chains.** Demo meter keys are `keccak256("hydro-dmrv demo meter " + plant id)` and are public.
- **Hedera networks.** The deploy throws unless every plant has a generated meter key (`METER_ADDRESSES` or `.secrets/meters.<network>.json`). `REGISTER_DEMO_PLANTS=true` does not override that on mainnet. A mainnet deploy also throws if `VERIFIER_ADDRESS` and `ADMIN_ADDRESS` are unset. The verifier cannot be the operator or the meter, and the contract checks this too.
- **Meter keys on the demo server.** They are software keys in `METER_PRIVATE_KEYS`, standing in for data-logger hardware. Whoever runs the server can sign as the meter. That is why the VVB's second signature exists, and why the VVB may only lower figures.
- **The demo VVB key.** `DEMO_VVB_PRIVATE_KEY` (`dmrv-demo-vvb-testnet`) is the author's labelled test key, not an accredited verifier. The server honours it only when `DEMO_REGISTRY_ADDRESS` equals the deployed registry. Every mint it approves is labelled "demo VVB" in the API, CLI and UI. Without it, the live API answers 409 "needs VVB approval" before publishing anything.

## Buying

The server never holds the buyer's key. There are two SaucerSwap checks.

**Off-chain, in `prepare_purchase`.** It reads SaucerSwap V1 WHBAR/USDC on mainnet (pair [0.0.1462797](https://hashscan.io/mainnet/contract/0.0.1462797)) and returns no transaction if that spot is more than 3% from the settlement price.

**On-chain, in `CreditMarket.settlementPrice()`.** Every quote and purchase reads a SaucerSwap pool: V1 `getReserves()` or V2 `slot0()` + `liquidity()`, as listed on [SaucerSwap's contract page](https://docs.saucerswap.finance/developers/contracts). The pool's `factory()` must be the SaucerSwap factory baked into the market. No pool, a pool from somewhere else, or a pool more than 300 bps from the Chainlink/Supra price, and the call reverts. The admin can repoint the pool. The admin cannot turn the check off.

The market already at [`0xd94157D9…`](https://hashscan.io/testnet/contract/0xd94157D9FEA7c1e572e3674c2854B404a82cf39E) was deployed before this rule. Its guard is off. This source does not match that bytecode until the next deploy. On 26 September 2026 the testnet WHBAR/USDC pool implied about $2 per HBAR against an oracle near $0.094, so that deploy will revert every testnet sale until the pool is within 3%. Local tests use a pool at the oracle price. Mainnet's V2 pool was within the band on that date.

A spot price can be moved within one block. A flash-loan-sized trade could push the pool out of band to block sales (a denial of service), but not to buy cheaper: the settlement price is still the oracle's. A TWAP would be stronger and is future work.

## For AI agents

```bash
claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp
```

Public tools need no key. `approve_attestation` returns the EIP-712 typed data a VVB signs; the server never holds a VVB key. `submit_attestation` and `publish_document` are absent unless the request carries `Authorization: Bearer $MRV_API_KEY`. Writes stay disabled when that variable is unset. The tool list, the REST twins and the OpenAPI document are in [docs/agents.md](docs/agents.md). Conventions for editing the repo are in [AGENTS.md](AGENTS.md).

An agent buyer:

```
get_dex_price → list_open_listings → prepare_purchase { listingId, amountKg, beneficiary } → sign and send
```

## Where the rest went

| | |
| --- | --- |
| Equations, five stages, scenarios, HCS reproduction | [docs/methodology.md](docs/methodology.md) |
| Guardian bridge: cross-check VC, bridge DID, schema, policy patch, evidence | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
| Registry, module and market functions, EIP-712 types, roles, pool guard | [docs/contract.md](docs/contract.md) |
| Tool table | [docs/agents.md](docs/agents.md) |
| What the tests pin | [docs/testing.md](docs/testing.md) |
| Env vars, pages, layout, security limits | [docs/operations.md](docs/operations.md) |

Hedera Harness lives in [`.harness/`](.harness/) (`spec.yaml` describes this template as VMR0017). Attach that directory when you submit. `yarn harness:validate` runs Tiers 0–2 with no credentials, after `npx playwright install chromium`.

```bash
yarn test
yarn lint && yarn next:build
```

## Not a certification

The engine implements the equations of VMR0017 v1.0 with ACM0002 v22.0, and the CDM path, as written in [docs/methodology.md](docs/methodology.md). A VVB and a registry still decide additionality, the monitoring plan and issuance. Credits here are not a Verra issuance. Do not claim the same generation as a REC.

MIT, see [LICENCE](LICENCE). Built on [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar).
