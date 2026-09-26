# Hydro dMRV

A Scaffold-HBAR template for the part of digital MRV a policy engine leaves off-chain. The contract recomputes `ER = BE − PE − LE` from a registered design and meter-signed totals, and it will not mint a different integer. Issuance is anchored on HCS. Sales settle in HBAR only when Chainlink and Supra agree. `prepare_purchase` also refuses a SaucerSwap spot more than 3% off that price. That pool check is off-chain, and a direct call skips it.

This sits next to [Hedera Guardian](https://github.com/hashgraph/guardian), it does not replace it. Guardian runs roles, verifiable credentials and the methodology library (including ACM0002, AMS-I.D, Tool 03 and Tool 07). A policy can POST a monitoring body to this app from an Http Request Block. The recipe is [docs/GUARDIAN.md](docs/GUARDIAN.md). The worked example is hydropower under **Verra VMR0017 v1.0** with **ACM0002 v22.0**. That is an implementation of the equations, not a certification and not a Verra issuance.

| | Guardian | This template |
| --- | --- | --- |
| Roles, VC/DID, methodology library | Yes | No |
| Contract recomputes the tonne, HCS re-derivation, two-oracle HTS sale | No | Yes |

## Quick start

Node.js ≥ 20.18.3, Git, and Yarn via Corepack (`corepack enable`). From an empty directory, this is the command CI runs:

```bash
npm create scaffold-hbar@latest -- hydro-dmrv \
  --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification- \
  --ci --package-manager yarn --solidity-framework hardhat --skip-hedera-skills
cd hydro-dmrv
yarn test
```

`yarn test` is the TypeScript engine and `HydroCreditRegistry.quantify` on one set of integers. A clone of this repo is the same after `yarn install`.

Local chain, no faucet and no Hedera account:

```bash
yarn chain:offline                  # terminal 1
yarn deploy --network localhost     # terminal 2: HTS, Chainlink and Supra mocks, both demo plants
```

Move `hederaLocalFork` to the front of `targetNetworks` in `packages/nextjs/scaffold.config.ts`, then `yarn start` (http://localhost:3000). To mint locally, set `MRV_API_KEY` and `VERIFIER_PRIVATE_KEY` (Hardhat account #0, printed by `yarn chain:offline`) in `packages/nextjs/.env.local`.

Testnet: `yarn hardhat:account:import`, then `yarn deploy --network hederaTestnet`. Publishing also needs `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (ECDSA), `HCS_TOPIC_ID` (`yarn mrv:create-topic`) and `MRV_API_KEY`. The variable tables are in [docs/operations.md](docs/operations.md).

## Ninety seconds, no wallet

Live app: [hydro-dmrv.vercel.app](https://hydro-dmrv.vercel.app). MCP: `https://hydro-dmrv.vercel.app/api/mcp`.

| You are | Do this |
| --- | --- |
| Looking | [/verify](https://hydro-dmrv.vercel.app/verify): `healthy` passes, `inflated` and `tampered` do not. [/audit](https://hydro-dmrv.vercel.app/audit): **Check evidence** re-runs a testnet issuance in the browser. |
| Buying | Testnet ECDSA account from [portal.hedera.com](https://portal.hedera.com) → [/market](https://hydro-dmrv.vercel.app/market) **Buy & retire**. The page will not build the transaction if SaucerSwap is more than 3% off the settlement price. |
| An agent | `claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp` then `get_dex_price` → `list_open_listings` → `prepare_purchase` → sign with your own key. |

`/water` is illustrative VMR0015. It does not mint the hydro token.

## What is on testnet

The app reads the registry below and holds no server key. That deployment predates two rules in this source, named after the table. Do not point the app at the older registry `0xAEA76b83ea8e71621d443053A5Ee20D7AF8Ce746`. Link the transactions below, not the contract's transaction list (that list also shows a failed 1-tinybar probe).

| What | Where |
| --- | --- |
| Mint, HYDRO-DEMO-01 `healthy` → 4.791 t | [0xb473de58…](https://hashscan.io/testnet/transaction/0xb473de5821d62467f4cc76339c81f1109b6baff2d77f70aea7b8156ea64f19f2) |
| Second mint, HYDRO-DEMO-02 `diesel-backup` → 73.386 t | [0x8fef0c11…](https://hashscan.io/testnet/transaction/0x8fef0c119c3b4b2b87aa704ca3c26c9dedecc2648b96853e6f7394fc425c0e42) |
| Retirement, 1.000 t, HYRET serial 1 | [0x9f8979fb…](https://hashscan.io/testnet/transaction/0x9f8979fbb2eefbb278b2e305deec469d0ebe752d79a511290c44cea75bb7dac9) |
| Registry `0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5` | [contract](https://hashscan.io/testnet/contract/0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5) |

That registry enforces a unique meter, a unique design hash, a non-zero grid factor at renewal, and an attestation that cites topic [0.0.10726081](https://hashscan.io/testnet/topic/0.0.10726081). The price age on this deploy is **25 hours**. Two days is only the contract's upper bound (`MAX_PRICE_AGE`); a longer window does not deploy. `submitAttestation` is simulated, and `quantify` must match the engine, before anything is published to HCS.

Compiled from this source, `HydroCreditRegistry` is 24,551 bytes, 25 under Hedera's 24,576-byte limit. Another feature in that contract means splitting it. `contracts/modules/HydroVmr0017Module.sol` reproduces `quantify` behind `IMethodology` so a later split has a measured module. It is not deployed, and it is not the issuer. The live contract is still `HydroCreditRegistry`.

Credits: HTS [0.0.10726073](https://hashscan.io/testnet/token/0.0.10726073) (HYCC). Certificates: HTS [0.0.10726074](https://hashscan.io/testnet/token/0.0.10726074) (HYRET). Settlement feed: [0xcAE7c6eA…ba77cbb8](https://hashscan.io/testnet/contract/0xcAE7c6eA987107543C1aD0F79802d02cba77cbb8) (Chainlink, Supra fallback). Readings and the report for the first mint are HCS messages [1](https://hashscan.io/testnet/topic/0.0.10726081/message/1) and [5](https://hashscan.io/testnet/topic/0.0.10726081/message/5).

Two rules in the current source are **not** on that registry yet: a crediting span of exactly 5, 7 or 10 × 365 days, and capacity-addition leakage as the higher of EG_PJ and EG_facility × Cap_add / Cap_PJ. Greenfield figures are unchanged, so the two mints still match the engine.

Design assessment also checks, off-chain only, the VT0008 sensitivity table (at least ±10%), the geographic area and a capacity band of at least ±50%, the ACM0002 historical window for a retrofit or capacity addition, and a baseline-validity reference when a crediting period is renewed. A monitoring batch that reports captive supply must deliver more than half of it to the grid. The grid factor counts net imports and Annex I imports at 0 t CO2/MWh, takes the lowest fuel factor for a multi-fuel unit, and leaves purpose-built wheeling out. A measured fuel factor outside the IPCC 95% interval is refused. None of this changes a greenfield credited amount. Those evidence fields are not inside the on-chain `designHash`: that hash is the project document the testnet plants were registered with.

## Meter keys are for testing

Demo meter keys are `keccak256("hydro-dmrv demo meter " + plant id)`. They are public. A verifier key can sign any period for those plants, up to the nameplate. Do not treat the testnet credits as metered production tonnes.

`yarn deploy --network hederaMainnet` does not register them. Setting `REGISTER_DEMO_PLANTS=true` does not override that. It throws. A mainnet deploy also throws if `VERIFIER_ADDRESS` and `ADMIN_ADDRESS` are unset, so one key cannot keep both roles.

## Buying

The server never holds the buyer's key. `prepare_purchase` reads SaucerSwap V1 WHBAR/USDC on mainnet (pair [0.0.1462797](https://hashscan.io/mainnet/contract/0.0.1462797)) and returns no transaction if that spot is more than 3% from the settlement price. The contract itself still settles on Chainlink and Supra only. A caller who skips `prepare_purchase` is not covered by the pool check.

## For AI agents

```bash
claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp
```

Public tools need no key. `submit_attestation` and `publish_document` are absent unless the request carries `Authorization: Bearer $MRV_API_KEY`. Writes stay disabled when that variable is unset. The tool list, the REST twins and the OpenAPI document are in [docs/agents.md](docs/agents.md). Conventions for editing the repo are in [AGENTS.md](AGENTS.md).

An agent buyer:

```
get_dex_price → list_open_listings → prepare_purchase { listingId, amountKg, beneficiary } → sign and send
```

## Where the rest went

| | |
| --- | --- |
| Equations, five stages, scenarios, HCS reproduction | [docs/methodology.md](docs/methodology.md) |
| Calling this from a Guardian policy | [docs/GUARDIAN.md](docs/GUARDIAN.md) |
| Registry functions, HBAR units, Chainlink and Supra | [docs/contract.md](docs/contract.md) |
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
