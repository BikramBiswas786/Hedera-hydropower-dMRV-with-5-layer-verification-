# Agent instructions

Briefing for coding agents working on this repository (Claude Code, Cursor, Codex). Claude Code loads it through
`CLAUDE.md`. Agents that want to *use* a running instance should connect to its MCP server at `/api/mcp` instead;
see the "For AI agents" section of `README.md`.

This is **Hydro dMRV**, a Scaffold-HBAR template: Next.js App Router frontend and API in `packages/nextjs`, Hardhat
contracts in `packages/hardhat`, Yarn 3 workspaces. It quantifies emission reductions of grid-connected hydropower
under Verra VMR0017 v1.0 with ACM0002 v22.0 (VT0011 grid factor, VT0008 additionality), or CDM AMS-I.D / ACM0002 (TOOL07 grid factor), with TOOL03 for fuel, anchors readings and reports on HCS, and issues HTS
carbon credits through `DmrvRegistry`. The registry mints only with two EIP-712 signatures, the plant's meter and an
accredited VVB. Its methodology module (`HydroVmr0017Module`) recomputes ER = BE − PE − LE on-chain from the plant's
registered design. `CreditMarket` sells credits at the `ResilientHbarUsdFeed` price (Chainlink with a Supra fallback),
optionally cross-checked on-chain against a SaucerSwap pool. Every retirement mints an HTS NFT certificate. Raw readings are on HCS too, so anyone can reproduce every figure.

## Commands

```bash
yarn install
yarn test                         # hardhat tests + vitest; run before every commit
yarn lint                         # eslint for both packages (CI uses --max-warnings=0)
yarn next:check-types
yarn next:build                   # production build, also type-checks

yarn chain:offline                # local Hardhat node, no internet
yarn chain                        # Hedera-forked node with HTS emulation (needs internet)
yarn deploy --network localhost   # or hederaTestnet / hederaMainnet
yarn start                        # next dev on :3000

yarn mrv:create-topic             # create the HCS audit topic
yarn mrv:attest [scenario] [plant] # step 1: verify → HCS, writes attest-<plant>-<seq>.json for the VVB
yarn mrv:approve <attest.json>    # the VVB signs the EIP-712 VerifierApproval (VVB_PRIVATE_KEY, secp256k1)
yarn mrv:submit <attest.json>     # step 2: relay meter + VVB signatures to submitAttestation
yarn mrv:meter-key                # key for a plant's data logger; METER_PRIVATE_KEY=… yarn mrv:sign file.json signs its statement
yarn hardhat:meter-keys           # per-plant meter keys for a live deploy (.secrets/, gitignored)
yarn hardhat:size                 # contract-size gate (fails above 24,064 B); CI runs it
yarn admin:threshold              # 2-of-3 threshold admin account (dry run unless --execute)
yarn admin:exec plan <contract> "<fn(types)>" [args]   # admin calls as scheduled transactions
yarn hardhat:test:fork            # contract tests against Hedera's HTS emulation
```

`yarn deploy` without `--network` targets the in-process `hardhat` network, not a running node.

## Where things live

| Concern | Path |
| --- | --- |
| Core registry (attestation, custody, retirement, all HTS calls) | `packages/hardhat/contracts/DmrvRegistry.sol` |
| Methodology module interface / hydro module (on-chain quantification) | `packages/hardhat/contracts/interfaces/IMethodology.sol`, `contracts/modules/HydroVmr0017Module.sol` |
| Market (listings, settlement, SaucerSwap pool guard) | `packages/hardhat/contracts/CreditMarket.sol`, `contracts/interfaces/ISaucerSwap.sol` |
| Phase-0 registry (read-only on testnet, kept for evidence) | `packages/hardhat/contracts/legacy/HydroCreditRegistry.sol`, ABI in `packages/nextjs/contracts/legacy/` |
| Oracle aggregator | `packages/hardhat/contracts/ResilientHbarUsdFeed.sol` |
| HTS calls (always go through this) | `packages/hardhat/contracts/lib/HederaTokenLib.sol` |
| Local test doubles | `packages/hardhat/contracts/mocks/` (HTS mock at `0x167` incl. NFTs, Chainlink and Supra mocks) |
| Deploy + idempotent setup | `packages/hardhat/deploy/00_*.ts`, `01_*.ts`; demo plant integers in `utils/demoPlants.ts` |
| Per-network feeds, units, staleness | `packages/hardhat/utils/hydroNetworkConfig.ts` |
| Methodology (pure): VMR0017 / CDM rules, TOOL07 and VT0011, TOOL03, LDC list, VT0008 checks, design assessment, integer quantification | `packages/nextjs/services/mrv/methodology/` |
| Verification engine (pure): 5 stages, QA/QC, report | `packages/nextjs/services/mrv/engine.ts`, `schema.ts` |
| Meter statements (pure): raw totals, EIP-712 digest, sign, recover | `packages/nextjs/services/mrv/provenance.ts` |
| VVB approval (pure): EIP-712 `VerifierApproval` | `packages/nextjs/services/mrv/approval.ts`; contract parity fixture `services/mrv/fixtures/eip712.json` |
| Demo grid, designs, plants, scenarios | `packages/nextjs/services/mrv/demo.ts`, `scenarios.ts` |
| Shared quantification test vectors (contract + TS) | `packages/hardhat/test/fixtures/quantificationVectors.ts` |
| HCS data + report messages | `packages/nextjs/services/mrv/report.ts`, built together by `pipeline.ts` |
| Mirror-node reads, audit, reproduction | `packages/nextjs/services/mrv/mirror.ts`, `audit.ts` |
| Unit conversions (t ↔ kg units, cents, tinybar/weibar) | `packages/nextjs/services/mrv/pricing.ts` |
| Server-only code (keys, HCS, writes, unsigned purchases) | `packages/nextjs/services/mrv/server/` |
| REST routes / MCP route | `packages/nextjs/app/api/**/route.ts` |
| Pages | `packages/nextjs/app/{methodology,verify,plants,market,portfolio,audit,certificate/[id]}/` with components in `_components/` |
| Plant detail, portfolios, CSV export (server) | `packages/nextjs/services/mrv/server/insights.ts` |
| Generated ABIs + addresses | `packages/nextjs/contracts/deployedContracts.ts` (never edit by hand) |

## Invariants — keep these true

- **Units.** 1 token = 1 t CO2e; the HTS token has 3 decimals, so one base unit is 1 kg CO2e. Energy is in Wh,
  emissions in g CO2e, the grid EF in g CO2/MWh, fuel in g, the TOOL03 COEF in g CO2 per tonne of fuel. Listing
  prices are **US cents per tonne**.
- **One quantification, two implementations.** `services/mrv/methodology/quantify.ts` and
  `HydroVmr0017Module.quantify` must produce identical integers: BE rounds down (toward −∞), PE_HP and PE_FF round
  up, credits = ⌊(balance + ER) / 1000⌋ with the remainder or deficit carried. Change one, change the other, and
  extend `test/fixtures/quantificationVectors.ts`, which both test suites assert. The live testnet mints
  (4,791,542 g and 73,386,435 g) must keep reproducing through the module (`test/fixtures/liveAttestations.ts`).
- **The registry is methodology-agnostic.** Rules live in an approved `IMethodology` module (stateless, no HTS, no
  storage writes); a project keeps its module for life. HTS calls happen only in `DmrvRegistry`.
- **Methodology is registered per plant.** The hydro params' `methodology` (0 = CDM, 1 = VMR0017) fixes EF_Res (90 or
  100 kg/MWh), EF_embodied (0 or 21 g/kWh) and VMR0017's 15 MW hydro limit in the contract; `methodology/project.ts`
  holds the same constants and the LDC and VT0008 checks. Change a factor in both, and add a vector.
- **Conservative by default.** Every QA/QC adjustment and every rounding goes toward fewer credits: gaps count as
  zero, the lower of main and check meter, MPE deductions after calibration expiry, IPCC lower bounds for the
  baseline (TOOL07 / VT0011) and upper bounds for project emissions (TOOL03). VT0011's optional LDC weights
  (w_OM = 1) are deliberately not offered. Do not add a path that credits more.
- **HBAR units.** `msg.value` inside the EVM is tinybar (1e8) on Hedera but wei (1e18) on a local chain.
  `CreditMarket.NATIVE_UNITS_PER_HBAR` records which. `quote()` returns that unit; the UI converts with
  `quoteToTxValue` in `services/mrv/pricing.ts`. Never hardcode 1e8 or 1e18 elsewhere.
- **HTS never reverts.** It returns a response code (`SUCCESS = 22`). Every HTS call must go through
  `HederaTokenLib`, which reverts with `HtsCallFailed(selector, code)`. The one deliberate exception is certificate
  delivery (`tryTransferNftFromSelf`): a retirement must never fail because a wallet cannot hold the NFT yet.
- **Prices come from two providers.** `ResilientHbarUsdFeed` reverts when fresh Chainlink and Supra answers disagree
  beyond `MAX_DEVIATION_BPS`, and uses whichever is fresh when only one is. Keep `readSources()` non-reverting; the UI,
  REST overview and MCP read it to explain paused markets.
- **Treasury accounting.** `creditToken.balanceOf(registry) == Σ custodyBalanceOf` (listed units sit in the market's
  custody account). There is
  a test for it; extend it when you add a flow that moves units.
- **The engine is pure and deterministic.** No I/O, no `Date.now()`, no randomness in `engine.ts` or
  `methodology/`. It runs in the browser, API, MCP and tests. Scenario generation takes an explicit `end` date in
  tests.
- **The chain is authoritative for the design and ledger.** `attestReadings` refuses a plant profile whose design
  differs from `getProject`, quantifies against the on-chain ledger, and checks the module's `preview` agrees before
  publishing. The signed `sequence` guards against stale reports and replays (`StaleLedger`).
- **Demo registrations are generated.** `packages/hardhat/utils/demoPlants.ts` holds the engine's output for the demo
  designs; `services/mrv/demo.test.ts` fails if they drift. Regenerate, never hand-edit.
- **Two keys mint, and the VVB may only lower figures.** The meter signs an EIP-712 `MeterStatement` (raw totals,
  period, interval count, `readingsDigest`, sequence; domain = chain id + registry). A key with `VERIFIER_ROLE` that
  is neither the operator nor the meter signs a `VerifierApproval` embedding that statement's digest plus the
  accepted figures, report hash, HCS anchor and `evidenceHash`. The module rejects net above, fuel or leakage below,
  or gross different from (metered, capped at nameplate) the statement (`NotMetered`). The engine may only make
  figures more conservative. `provenance.ts` / `approval.ts` and the contract must stay byte-identical
  (`services/mrv/fixtures/eip712.json`, written by the Hardhat test; the legacy EIP-191 vector is
  `test/fixtures/meterStatementVector.ts`). The digest uses the data message's row encoding. Scenarios sign after
  their manipulation, except `tampered`. Data messages before readings@5 carry the legacy batch signature.
- **Keys are split.** Meter keys sign statements, VVB keys (`VERIFIER_ROLE`) sign approvals, anyone relays,
  `DEFAULT_ADMIN_ROLE` registers plants and meters (production: the 2-of-3 threshold account via `ADMIN_ADDRESS`).
  Do not add a path that lets the verifier or the server change a registration, lets anyone mint without both
  signatures, or keeps a VVB key on the server (the only exception is the labelled demo VVB key, honoured only when
  `DEMO_REGISTRY_ADDRESS` equals the deployed registry). Live deploys refuse demo-derived meter keys.
- **No VVB, no publish.** `POST /api/mrv/attest` without `verifierSignature` answers 409 before anything reaches HCS,
  unless the caller asks for step 1 (`publishForApproval: true`). Keep that ordering; `attest.dryrun.test.ts` pins it.
- **Two HCS messages per attestation, in order.** The data message (readings, plant, metering, ledger; up to 20
  chunks) is published first; the report (one chunk, ≤ 1024 bytes) commits to it with `data: { hash, sequence }`. Both limits are
  enforced in `report.ts` and tested.
- **`reportHash` = sha256 of the exact report bytes.** `reproduceAttestation` checks report vs chain, data vs report
  and an engine re-run vs report. If you change either message shape, bump its schema string and update `audit.ts`.
- **On-chain rules mirror the engine's hard failures.** Power density at registration, crediting span (5/7/10 years,
  `registrationRequestedAt` and the 2027 five-year rule, renewal span), crediting year, non-overlapping periods,
  calibration validity, nameplate ceiling, net ≤ gross, minimum completeness (from the meter-signed interval count)
  and registered fuel are enforced by the contracts. Changing a threshold in one place means reviewing the other.
- **Secrets stay server-side.** Anything reading `HEDERA_OPERATOR_KEY`, `VERIFIER_PRIVATE_KEY` or `MRV_API_KEY`
  lives under `services/mrv/server/` and is imported only by route handlers and `scripts/`. Client components may
  import server *types* only (`import type`).
- **Writes are authenticated; purchases are not the server's.** Server-signed writes (attestation) must check
  `isAuthorized` and stay disabled when `MRV_API_KEY` is unset. Anything a user or agent pays for is returned unsigned
  (`prepare_purchase`) for their own wallet. Read-only MCP tools need `readOnlyHint: true`.
- **Errors callers may see** are `ApiError(message, httpStatus)` from `services/mrv/server/errors.ts`; route handlers
  map them with `toErrorResponse`, MCP tools with `run()`.

## Frontend contract interaction

Use the Scaffold-HBAR hooks in `packages/nextjs/hooks/scaffold-hbar` with the names that exist:
`useScaffoldReadContract`, `useScaffoldWriteContract`, `useDeployedContractInfo`, `useTransactor`.

Reads go through the hooks: custody, retirements and attestations on `DmrvRegistry`; listings, quotes and proceeds on
`CreditMarket`. Purchases do not. `POST /api/market/prepare-purchase` (MCP: `prepare_purchase`) builds the unsigned
`CreditMarket` transaction and refuses it when the SaucerSwap WHBAR/USDC spot is more than 3% from the settlement
price. It also reports the on-chain guard (`onChainPoolGuard`), which reverts the purchase itself when enabled. The
caller signs `to`, `data` and `value` with their own wallet. Do not call `buy` or `buyAndRetire` with a value the UI
invented.

```typescript
const { data: custody } = useScaffoldReadContract({
  contractName: "DmrvRegistry",
  functionName: "custodyBalanceOf",
  args: [address],
});
const { data: proceeds } = useScaffoldReadContract({
  contractName: "CreditMarket",
  functionName: "proceedsOf",
  args: [address],
});

const writeTx = useTransactor();

const response = await fetch("/api/market/prepare-purchase", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ listingId, amountKg, retire: true, beneficiary }),
});
const prepared = await response.json(); // { chainId, to: CreditMarket, data, value, dex, onChainPoolGuard }
if (!response.ok) throw new Error(prepared.error ?? "prepare_purchase refused");

await writeTx({
  account: address,
  to: prepared.to,
  data: prepared.data,
  value: BigInt(prepared.value),
});
```

`ListingCard.tsx` is the reference. Agents use the same flow without a browser:
`get_dex_price` → `list_open_listings` → `prepare_purchase` → sign and send.

Attestation from an agent or operator server is two calls, with the VVB's signature in between:

```typescript
// Step 1: verify, publish to HCS, get the VVB's typed data (bearer token required).
const step1 = await post("/api/mrv/attest", { ...batch, publishForApproval: true });
// step1.status === "awaiting-approval"; step1.approval is EIP-712 typed data, step1.anchor the HCS anchor.

// The VVB signs on its own machine (wallet eth_signTypedData_v4, or `yarn mrv:approve`). Read-only preview for the
// VVB: POST /api/mrv/approve (MCP approve_attestation) with the same body + anchor.
const verifierSignature = await vvbWallet.signTypedData(step1.approval);

// Step 2: relay. Anyone can; the server key needs no role.
const minted = await post("/api/mrv/attest", { ...batch, anchor: step1.anchor, verifierSignature });
```

Contract types are generated for the **first** network in `scaffold.config.ts` `targetNetworks`. Until the registry is
deployed there, hook results are loosely typed; annotate arrays with the `Raw*` types from `services/mrv/views.ts`
(as `AuditTrail.tsx` does) so code compiles in both states. Convert raw structs with the `to*View` helpers rather
than reading struct fields ad hoc.

Server code reads the chain with viem through `services/mrv/server/registry.ts`, which resolves the ABIs with
`getRegistryDeployment()` / `getMarketDeployment()`. While `DmrvRegistry` is at the zero address for a chain (chain 296 was
redeployed on 26 Sep 2026), read routes fall back to the legacy registry (`activeRegistry()`); `registryAt(address)` selects it
explicitly for historic evidence.

## Adding things

- **A QA/QC rule**: add it to the relevant stage in `engine.ts` with a severity (`reject`, `review`, `info`), make any
  quantity adjustment conservative, add or adjust a scenario in `scenarios.ts`, and cover it in `engine.test.ts`.
  Update the README table and `services/mrv/methodology/document.ts` (the MCP methodology resource).
- **A methodology equation or parameter**: cite the tool or methodology section in a comment, implement it in
  `methodology/` with a hand-checkable test, mirror it in the contract if it changes issued quantities, and add a
  vector to `quantificationVectors.ts`. Bump `ENGINE_VERSION` and the report schema if the report changes.
- **A contract function**: custom errors over strings, events for every state change, `nonReentrant` on anything
  that moves value, and tests for the happy path and each revert. Run `yarn deploy` to regenerate ABIs and
  `yarn hardhat:size` to check the 24,064 B gate (`DmrvRegistry` is at 20,862 B).
- **A methodology**: implement `IMethodology` as a new stateless module, with its own params encoding and tests, and
  approve it with `setModuleApproved`. Do not add methodology rules to `DmrvRegistry`.
- **An API route or MCP tool**: validate input with zod (`schema.ts`, or a schema next to the server function),
  throw `ApiError` for caller mistakes, give every MCP tool a REST twin, and list both in `public/llms.txt` and the
  README.
- **An oracle provider**: wrap it behind `AggregatorV3Interface`, or extend `ResilientHbarUsdFeed._read*` and add
  cases to `ResilientHbarUsdFeed.test.ts` for fresh, stale, broken and disagreeing answers.

## Style

- TypeScript: prefer `type` over `interface`, let inference work, no `any`. Imports use the `~~` alias in Next.js.
- UI: DaisyUI components and classes; pages are server components that render client components from `_components/`.
- Solidity 0.8.28, OpenZeppelin 5, NatSpec on public functions. `yarn format` runs Prettier for both packages.
- Comments explain *why* (a Hedera quirk, an invariant), not what the next line does.
- Never commit `.env`, `.env.local` or keys. `.env.example` files document every variable.
