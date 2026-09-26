# Hydro dMRV

A Scaffold-HBAR template for the part of digital MRV a policy engine leaves off-chain. `DmrvRegistry` mints only when two keys agree: the plant's meter signs an EIP-712 statement of the raw totals, and an accredited VVB signs an approval over that statement's digest. The VVB can only lower the figures. A pluggable methodology module (`HydroVmr0017Module`) recomputes `ER = BE − PE − LE` from the registered design, and the registry will not mint a different integer. Issuance is anchored on HCS. `CreditMarket` settles sales in HBAR only when Chainlink and Supra agree. It can also revert on-chain when the SaucerSwap WHBAR/USDC pool is more than 3% off that price (see [Buying](#buying) for when that check is off).

This sits next to [Hedera Guardian](https://github.com/hashgraph/guardian), it does not replace it. Guardian runs roles, verifiable credentials and the methodology library (including ACM0002, AMS-I.D, Tool 03 and Tool 07). A policy can POST a monitoring body to this app from an Http Request Block. The recipe is [docs/GUARDIAN.md](docs/GUARDIAN.md). The worked example is hydropower under **Verra VMR0017 v1.0** with **ACM0002 v22.0**. That is an implementation of the equations, not a certification and not a Verra issuance.

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

Two registries, and the evidence stays linked to the one that produced it:

| | Legacy `HydroCreditRegistry` (phase 0) | `DmrvRegistry` + `CreditMarket` (phase 1, this source) |
| --- | --- | --- |
| Address | [`0x9cdB5782…84107a5`](https://hashscan.io/testnet/contract/0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5), read-only from the app | **Pending redeploy** with the maintainer's key (steps in [docs/operations.md](docs/operations.md#phase-1-redeploy)) |
| Who can mint | One verifier key | Meter key + VVB key (EIP-712), neither alone |
| Meter keys | Public demo derivation | Per plant, generated; the deploy refuses demo keys on Hedera |
| Admin | Deployer | 2-of-3 threshold account (`yarn admin:threshold`) |
| SaucerSwap check | Off-chain in `prepare_purchase` only | Also in `CreditMarket.settlementPrice()`; configurable and admin-disableable. Off on testnet (see [Buying](#buying)) |
| Evidence | The two mints and the retirement below | Produced after the redeploy |

Until the redeploy, the server's read routes fall back to the legacy registry. `/api/registry/attestations/{id}/reproduce?registry=0x9cdB…` always reads it. Do not point the app at the older registry `0xAEA76b83ea8e71621d443053A5Ee20D7AF8Ce746`. Link the transactions below, not the contract's transaction list (that list also shows a failed 1-tinybar probe).

| What (legacy registry) | Where |
| --- | --- |
| Mint, HYDRO-DEMO-01 `healthy` → 4.791 t | [0xb473de58…](https://hashscan.io/testnet/transaction/0xb473de5821d62467f4cc76339c81f1109b6baff2d77f70aea7b8156ea64f19f2) |
| Second mint, HYDRO-DEMO-02 `diesel-backup` → 73.386 t | [0x8fef0c11…](https://hashscan.io/testnet/transaction/0x8fef0c119c3b4b2b87aa704ca3c26c9dedecc2648b96853e6f7394fc425c0e42) |
| Retirement, 1.000 t, HYRET serial 1 | [0x9f8979fb…](https://hashscan.io/testnet/transaction/0x9f8979fbb2eefbb278b2e305deec469d0ebe752d79a511290c44cea75bb7dac9) |

Credits: HTS [0.0.10726073](https://hashscan.io/testnet/token/0.0.10726073) (HYCC). Certificates: HTS [0.0.10726074](https://hashscan.io/testnet/token/0.0.10726074) (HYRET). Settlement feed: [0xcAE7c6eA…ba77cbb8](https://hashscan.io/testnet/contract/0xcAE7c6eA987107543C1aD0F79802d02cba77cbb8) (Chainlink, Supra fallback). Readings and the report for the first mint are HCS messages [1](https://hashscan.io/testnet/topic/0.0.10726081/message/1) and [5](https://hashscan.io/testnet/topic/0.0.10726081/message/5). The redeploy creates new HTS tokens; the legacy ones stay where they are.

The legacy `HydroCreditRegistry` compiles to 24,551 B, 25 under Hedera's 24,576-byte limit, so it could not take another feature. After the split, `yarn hardhat:size` (a CI gate at 24,064 B) reports: `DmrvRegistry` 20,862 B, `CreditMarket` 9,010 B, `HydroVmr0017Module` 7,028 B, `ResilientHbarUsdFeed` 2,534 B. Until the redeploy, the live issuer is still the legacy registry.

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

**On-chain, in `CreditMarket.settlementPrice()`.** It reads a configured SaucerSwap pool: V1 `getReserves()` or V2 `slot0()` + `liquidity()`, as listed on [SaucerSwap's contract page](https://docs.saucerswap.finance/developers/contracts). A purchase reverts with `PoolPriceDeviation` when that pool is more than `maxDeviationBps` (300) from the Chainlink/Supra consensus. Every quote and purchase is covered, including direct calls.

- **Illiquid pools.** A pool below its liquidity floor reverts with `PoolIlliquid` rather than pricing from dust.
- **Admin control.** The threshold admin can repoint the guard (`setPoolGuard`) or switch it off (`setPoolGuardEnabled(false)`).

**Honest fallback: the guard is off on Hedera testnet.** On 26 September 2026 the testnet WHBAR/USDC pools implied about $2.28 (V1) and $2.03 (V2) per HBAR, against a real price near $0.094. Enforcing them would block every testnet sale. The deploy therefore configures the V2 testnet pool but leaves the guard disabled unless `POOL_GUARD_ENABLED=true`. On testnet the contract settles on Chainlink/Supra alone, and only the off-chain mainnet check applies. On mainnet the guard is enabled against the V2 WHBAR/USDC pool.

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
| Calling this from a Guardian policy | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
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
