# Hydro dMRV

A Scaffold-HBAR template for the part of digital MRV a policy engine leaves off-chain. `DmrvRegistry` mints only when two keys agree: the plant's meter signs an EIP-712 statement of the raw totals, and an accredited VVB signs an approval over that statement's digest. The VVB can only lower the figures. A pluggable methodology module (`HydroVmr0017Module`) recomputes `ER = BE − PE − LE` from the registered design, and the registry will not mint a different integer. Issuance is anchored on HCS. `CreditMarket` sells only by sending the oracle HBAR amount through the SaucerSwap router. If the router or the pinned pair fails the 3% band, nothing is sold.

The live market the app reads is [`0x5aeDe76f…5030`](https://hashscan.io/testnet/contract/0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030), the same address as `packages/nextjs/contracts/deployedContracts.ts`. [This transaction](https://hashscan.io/testnet/transaction/0x4735808481bde453a2354b4ed395a00ba72112fdcbb0b96c9a1196e4c5753fab) is `buyAndRetire` of 0.020 t through SaucerSwap V1 router `0.0.19264`. Settlement is Chainlink (Supra fallback) plus that pair. There is no second market on the site.

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
| Buying | Testnet ECDSA account from [portal.hedera.com](https://portal.hedera.com) → [/market](https://hydro-dmrv.vercel.app/market) **Buy & retire**. The button stays off unless the pair the contract swaps is within 3% of the oracle. |
| An agent | `claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp` then `get_dex_price` → `list_open_listings` → `prepare_purchase` → sign with your own key. `reproduce_attestation` re-derives any issuance from HCS. |

`/water` is illustrative VMR0015. It does not mint the hydro token.

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

The public testnet WHBAR/USDC pair priced HBAR at $2.28 that day. The oracle was $0.094, so the contract would refuse every sale against it. The pair above was created on SaucerSwap factory `0.0.9959` at the Chainlink price. The seller was paid that pair's token, not USDC.

The VVB `0x437EB06f434aD8061DEDdfCDd0ecE68Ea435e84F` is a labelled test key, not an accredited verifier. The meter addresses are `0x1a1b0B722a17C34BE6A08FE5efD636Dd54F848A2` and `0x485e9404831A05a072eeE80Aa4BfA05946fd6bF4`. Their private keys are not in the repository. Admin is operator `0.0.10721162` until a 2-of-3 account is set.

Older deploys, not read by the app, are in [docs/operations.md](docs/operations.md). The legacy registry [`0x9cdB5782…`](https://hashscan.io/testnet/contract/0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5) still reproduces the same two greenfield amounts.

The legacy `HydroCreditRegistry` compiles to 24,551 B, 25 under Hedera's 24,576-byte limit, so it could not take another feature. After the split, `yarn hardhat:size` (a CI gate at 24,064 B) reports: `DmrvRegistry` 20,862 B, `CreditMarket` 10,131 B, `HydroVmr0017Module` 7,028 B, `ResilientHbarUsdFeed` 2,534 B. Since the redeploy the live issuer is `DmrvRegistry`.

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

The server never holds the buyer's key. `prepare_purchase` reads the pair stored on `CreditMarket` and returns no transaction when that pair is more than 3% from the oracle. The contract does the same check, then swaps. There is not a second pool.

The market the app reads, [`0x5aeDe76f…`](https://hashscan.io/testnet/contract/0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030), sends the HBAR to SaucerSwap router `0.0.19264`. The seller is paid in the pair's USD token. The transaction [0x47358084…](https://hashscan.io/testnet/transaction/0x4735808481bde453a2354b4ed395a00ba72112fdcbb0b96c9a1196e4c5753fab) is that swap. The pair is [`0xF98D0dF4…`](https://hashscan.io/testnet/contract/0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869). It was seeded because the canonical testnet WHBAR/USDC pair, [`0x87664e55…`](https://hashscan.io/testnet/contract/0x87664e55d9606657f049139FF654390A72657667), priced HBAR at about $2.28 on 26 September 2026 while Chainlink was about $0.095. Using that pair would revert every sale. The admin cannot turn the check off.

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
