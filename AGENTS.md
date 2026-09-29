# Agent instructions

Briefing for coding agents working on this repository (Claude Code, Cursor, Codex). Claude Code loads it through
`CLAUDE.md`. Agents that want to *use* a running instance should connect to its MCP server at `/api/mcp` instead;
see the "For AI agents" section of `README.md`.

This is **Hydro dMRV**, a Scaffold-HBAR template: Next.js App Router frontend and API in `packages/nextjs`, Hardhat
contracts in `packages/hardhat`, Yarn 3 workspaces. It quantifies emission reductions of grid-connected hydropower
under Verra VMR0017 v1.0 with ACM0002 v22.0 (VT0011 grid factor, VT0008 additionality), or CDM AMS-I.D / ACM0002 (TOOL07 grid factor), with TOOL03 for fuel, anchors readings and reports on HCS, and issues HTS
carbon credits through `DmrvRegistry`, which runs the VCS project cycle: a VVB-validated registration, meter-signed
monitoring records (quantified, not issued), and a VVB verification of a run of records, which alone issues. Its
methodology module (`HydroVmr0017Module`) recomputes ER = BE − PE − LE on-chain from the plant's registered design. `CreditMarket` sells credits at the `ResilientHbarUsdFeed` price (Chainlink with a Supra fallback),
and every sale is swapped through a SaucerSwap pool that must sit within 3% of that price. Every retirement mints an HTS NFT certificate. Raw readings are on HCS too, so anyone can reproduce every figure.
The same settlement (`UsdSettlement`) also backs `UsdCheckout`, which sells any HTS fungible token at a USD price.

Read [`HEDERA_FACTS.md`](HEDERA_FACTS.md) before writing Hedera code: tinybar versus weibar, HTS response codes,
association, the testnet USDC pair, forking limits. Each fact links the test or workflow that proves it.

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
yarn mrv:record [scenario] [plant] [endIso]  # monitoring: verify → HCS → recordMonitoring (issues nothing)
yarn mrv:verify <plant> [approve|reject] [deductionT] [findings]  # VVB step 1: reproduce pending records, publish report
yarn mrv:approve <verification.json>  # the VVB signs the EIP-712 VerificationStatement (VVB_PRIVATE_KEY, secp256k1)
yarn mrv:submit <verification.json>   # relay it to verifyPeriod; an approval issues credits
yarn mrv:meter-key                # key for a plant's data logger; METER_PRIVATE_KEY=… yarn mrv:sign file.json signs its statement
yarn hardhat:meter-keys           # per-plant meter keys for a live deploy (.secrets/, gitignored)
yarn hardhat:size                 # contract-size gate (fails above 24,064 B); CI runs it
yarn admin:threshold              # 2-of-3 threshold admin account (dry run unless --execute)
yarn admin:exec plan <contract> "<fn(types)>" [args]   # admin calls as scheduled transactions
yarn admin:demo                   # the 2-of-3 path on testnet with throwaway keys (CONTRACT_ADDRESS, an admin operator)
yarn hardhat:test:fork            # contract tests against Hedera's HTS emulation
yarn live:smoke                   # click through the deployed app (Live smoke workflow, every 6 h and after each deploy)
yarn guardian:trace <ref>         # is a Guardian-minted token backed? nft:<token>:<serial> | ft:<token>:<account> | tx id
yarn pair:rebalance [--execute]   # hold the testnet SaucerSwap pair at the oracle (Testnet pair keeper)
yarn market:keep-listing [--execute]  # keep a listing open on the testnet market
yarn market:agent-buy [kg] [beneficiary]  # the agent purchase flow with BUYER_PRIVATE_KEY (buyAndRetire)
```

`yarn deploy` without `--network` targets the in-process `hardhat` network, not a running node.

## Where things live

| Concern | Path |
| --- | --- |
| Core registry (validation, monitoring records, verification and issuance, custody, retirement, all HTS calls) | `packages/hardhat/contracts/DmrvRegistry.sol` |
| Records nothing enforces (VVB accreditation, Article 6.2, corresponding adjustments, VCU references) | `packages/hardhat/contracts/DmrvAnnotations.sol` |
| Methodology module interface / hydro module (on-chain quantification) | `packages/hardhat/contracts/interfaces/IMethodology.sol`, `contracts/modules/HydroVmr0017Module.sol` |
| Second module: greenfield solar, wind, ocean (VMR0017 / CDM ACM0002; approved on testnet, no project yet) and its TS twin | `contracts/modules/RenewableVmr0017Module.sol`, `services/mrv/methodology/renewable.ts`, vectors `test/fixtures/renewableVectors.ts`, deploy `deploy/04_*.ts` |
| USD settlement shared by both sale contracts (oracle price, SaucerSwap pool guard, swap to seller) | `packages/hardhat/contracts/settlement/UsdSettlement.sol`, `contracts/interfaces/ISaucerSwap.sol` |
| Market for registry credits (listings in registry custody, `buyAndRetire`) | `packages/hardhat/contracts/CreditMarket.sol` |
| Checkout for any HTS fungible token (escrow, USD price per whole token) | `packages/hardhat/contracts/UsdCheckout.sol`, deploy `deploy/02_*.ts`, testnet demo `scripts/checkoutTestnetDemo.ts` |
| Oracle aggregator | `packages/hardhat/contracts/ResilientHbarUsdFeed.sol` |
| HTS calls (always go through this) | `packages/hardhat/contracts/lib/HederaTokenLib.sol` |
| Local test doubles | `packages/hardhat/contracts/mocks/` (HTS mock at `0x167` incl. NFTs, Chainlink and Supra mocks) |
| Deploy + idempotent setup | `packages/hardhat/deploy/00_*.ts`, `01_*.ts` (VVB-validated registration of the demo plants), `02_*.ts` (checkout), `03_*.ts` (local chains only: public local VVB key, one record, one verification, one listing); SaucerSwap stand-ins in `utils/localSaucer.ts`; EIP-712 signing in `utils/attestation.ts`; demo plant integers in `utils/demoPlants.ts`; testnet demo keys in `utils/testnetDemoKeys.ts` |
| Per-network feeds, units, staleness | `packages/hardhat/utils/hydroNetworkConfig.ts` |
| Methodology (pure): VMR0017 / CDM rules, TOOL07 and VT0011, TOOL03, LDC list, VT0008 checks, design assessment, integer quantification | `packages/nextjs/services/mrv/methodology/` |
| Verification engine (pure): 5 stages, QA/QC, report | `packages/nextjs/services/mrv/engine.ts`, `schema.ts` |
| Methodology engines as plug-ins: `MethodologyEngine` interface, registry, clause-cited findings, the methodology's data and parameters table (hydro, and solar/wind/ocean) | `packages/nextjs/services/mrv/engines/` (`types.ts`, `index.ts`, `hydro.ts`, `hydroMonitoring.ts`, `renewable.ts`); REST `app/api/mrv/engines/`, UI `app/verify/_components/EngineWorkbench.tsx` |
| Meter statements (pure): raw totals, EIP-712 digest, sign, recover | `packages/nextjs/services/mrv/provenance.ts` |
| VVB messages (pure): EIP-712 `ValidationApproval` and `VerificationStatement`, the record hash chain | `packages/nextjs/services/mrv/approval.ts`; contract parity fixture `services/mrv/fixtures/eip712.json` |
| Verification report message (pure) | `packages/nextjs/services/mrv/verification.ts` |
| Demo grid, designs, plants, scenarios | `packages/nextjs/services/mrv/demo.ts`, `scenarios.ts` |
| Shared quantification test vectors (contract + TS) | `packages/hardhat/test/fixtures/quantificationVectors.ts` |
| HCS data + report messages | `packages/nextjs/services/mrv/report.ts`, built together by `pipeline.ts` |
| Mirror-node reads, audit, reproduction | `packages/nextjs/services/mrv/mirror.ts`, `audit.ts` |
| Guardian (pure): VC/DID verification ported from Guardian 3.7, evidence check, buyer's mint trace, CID-checked IPFS reads | `packages/nextjs/services/mrv/guardian/` (`trace.ts`, `ipfs.ts`, `evidence.ts`, `vc.ts`); server side `services/mrv/server/guardianBridge.ts` |
| Unit conversions (t ↔ kg units, cents, tinybar/weibar) | `packages/nextjs/services/mrv/pricing.ts` |
| Server-only code (keys, HCS, writes, unsigned purchases) | `packages/nextjs/services/mrv/server/`; recording in `monitoring.ts`, VVB verification in `verification.ts` |
| REST routes / MCP route | `packages/nextjs/app/api/**/route.ts` |
| Pages | `packages/nextjs/app/{methodology,verify,plants,market,portfolio,audit,certificate/[id]}/` with components in `_components/` |
| Checkout listings and purchases for any HTS token, gated on the token's Guardian trace (server) | `packages/nextjs/services/mrv/server/checkout.ts`, REST `app/api/checkout/`, UI `app/check/_components/GuardianCheckout.tsx` |
| Plant detail, portfolios, CSV export (server) | `packages/nextjs/services/mrv/server/insights.ts` |
| Generated ABIs + addresses | `packages/nextjs/contracts/deployedContracts.ts` (never edit by hand) |

## Invariants — keep these true

- **Units.** 1 token = 1 t CO2e; the HTS token has 3 decimals, so one base unit is 1 kg CO2e. Energy is in Wh,
  emissions in g CO2e, the grid EF in g CO2/MWh, fuel in g, the TOOL03 COEF in g CO2 per tonne of fuel. Listing
  prices are **US cents per tonne**.
- **One quantification, two implementations.** `services/mrv/methodology/quantify.ts` and
  `HydroVmr0017Module.quantify` must produce identical integers: BE rounds down (toward −∞), PE_HP and PE_FF round
  up, credits = ⌊(balance + ER) / 1000⌋ with the remainder or deficit carried. Change one, change the other, and
  extend `test/fixtures/quantificationVectors.ts`, which both test suites assert. The same holds for
  `RenewableVmr0017Module` and `methodology/renewable.ts` with `test/fixtures/renewableVectors.ts`. The live testnet mints
  (4,791,542 g and 73,386,435 g, phase-0 registry) must keep reproducing through the module
  (`test/fixtures/liveAttestations.ts`).
- **The registry is methodology-agnostic.** Rules live in an approved `IMethodology` module (stateless, no HTS, no
  storage writes); a project keeps its module for life. HTS calls happen only in `DmrvRegistry`.
- **No methodology without its contract and vectors.** An engine in `services/mrv/engines/` ships in the same change
  as its `IMethodology` module and a shared vector fixture that both the Hardhat and vitest suites assert. Hydro and
  renewable meet that bar; nothing else is listed, named in docs, or offered as a report-only engine until it does.
  A methodology the contract cannot recompute would be a claim the chain does not check.
- **Zero terms print as numbers.** The quantification stage line shows BE, PE, PE_HP, PE_FF, LE and ER with three
  decimals, and every zero PE term states why (`A_PJ = A_BL`, PD above 10 W/m², no fuel). `monitored.leakageG` is
  measured leakage and stays 0; LE is computed (VMR0017 §8.3). `engines.test.ts` fails if LE drops off the line.
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
  custody account). There is a test for it; extend it when you add a flow that moves units. `UsdCheckout` holds
  its listed tokens itself: `token.balanceOf(checkout) == Σ available` over its active listings of that token
  (`expectEscrowMatchesListings` in `UsdCheckout.test.ts`). No admin function moves escrowed tokens.
- **One settlement.** Pricing, the pool guard and the swap to the seller live only in `UsdSettlement`. A change
  there changes both `CreditMarket` and `UsdCheckout`; run both test files.
- **The engine is pure and deterministic.** No I/O, no `Date.now()`, no randomness in `engine.ts` or
  `methodology/`. It runs in the browser, API, MCP and tests. Scenario generation takes an explicit `end` date in
  tests.
- **The chain is authoritative for the design and ledger.** `recordReadings` refuses a plant profile whose design
  differs from `getProject`, quantifies against the module's on-chain ledger word, and checks that the project's
  module `quantify` returns the engine's ER before publishing. The signed `sequence` guards against stale reports and
  replays (`StaleLedger`).
- **Demo registrations are generated.** `packages/hardhat/utils/demoPlants.ts` holds the engine's output for the demo
  designs; `services/mrv/demo.test.ts` fails if they drift. Regenerate, never hand-edit.
- **Validation, monitoring and verification are separate signatures.** A VVB's `ValidationApproval` (design hash,
  params hash, validation report, external id) is required to register or renew a project. The meter signs an EIP-712
  `MeterStatement` (raw totals, period, interval count, `readingsDigest`, sequence; domain = chain id + registry v2)
  for every monitoring record; the module rejects net above, fuel or leakage below, or gross different from (metered,
  capped at nameplate) the statement (`NotMetered`). A record issues nothing. A VVB's `VerificationStatement` over a
  contiguous run of records, signing the record hash-chain head, its report on HCS and a deduction, is the only thing
  that issues. The engine and the VVB may only make figures more conservative. `provenance.ts` / `approval.ts` and
  the contract must stay byte-identical (`services/mrv/fixtures/eip712.json`, written by the Hardhat test; the legacy
  EIP-191 vector is `test/fixtures/meterStatementVector.ts`). The digest uses the data message's row encoding.
  Scenarios sign after their manipulation, except `tampered`. Data messages before readings@5 carry the legacy batch
  signature.
- **Keys are split.** Meter keys sign statements, VVB keys (`VERIFIER_ROLE`) sign validations and verifications and
  must not be the operator, meter or reporter (`VerifierIsParty`), the operator or its reporter records, anyone
  relays a verification, `DEFAULT_ADMIN_ROLE` registers plants and meters (production: the 2-of-3 threshold account
  via `ADMIN_ADDRESS`). Do not add a path that lets the server change a registration, issue without a VVB
  verification, or hold a VVB key. The testnet demo VVB key is derived from the deployer secret in CI only
  (`utils/testnetDemoKeys.ts`) and labelled as a demo key. Live deploys refuse demo-derived meter keys.
- **Nothing reaches HCS that the registry would refuse.** `recordReadings` checks the module's ER and dry-runs
  `recordMonitoring` before it publishes (`record.dryrun.test.ts`). `prepareVerification` refuses an approval
  unless every pending record reproduces from HCS, and `submitVerification` refuses a statement whose report is not
  the one at its HCS anchor (`verification.flow.test.ts`).
- **Two HCS messages per monitoring record, in order, and one per verification.** The data message (readings, plant,
  metering, ledger; up to 20 chunks) is published first; the monitoring report (one chunk, ≤ 1024 bytes) commits to
  it with `data: { hash, sequence }`. The verification report (`verification.ts`, one chunk) names the records, the
  chain head, the decision and deduction. The limits are enforced and tested.
- **`reportHash` = sha256 of the exact report bytes.** `reproduceAttestation` checks report vs chain, data vs report,
  an engine re-run vs report and, given the previous record's chain hash, the record's hash-chain link. If you change
  a message shape, bump its schema string and update `audit.ts`.
- **On-chain rules mirror the engine's hard failures.** Power density at registration, crediting span (5/7/10 years,
  `registrationRequestedAt` and the 2027 five-year rule, renewal span), crediting year, non-overlapping periods,
  calibration validity, nameplate ceiling, net ≤ gross, minimum completeness (from the meter-signed interval count)
  and registered fuel are enforced by the contracts. Changing a threshold in one place means reviewing the other.
- **Secrets stay server-side.** Anything reading `HEDERA_OPERATOR_KEY`, `RELAYER_PRIVATE_KEY`, `METER_PRIVATE_KEYS` or `MRV_API_KEY`
  lives under `services/mrv/server/` and is imported only by route handlers and `scripts/`. Client components may
  import server *types* only (`import type`).
- **Writes are authenticated; purchases are not the server's.** Server-signed writes (recording, publishing and relaying a verification) must check
  `isAuthorized` and stay disabled when `MRV_API_KEY` is unset. Anything a user or agent pays for is returned unsigned
  (`prepare_purchase`) for their own wallet. Read-only MCP tools need `readOnlyHint: true`.
- **Never trust an IPFS gateway.** Guardian documents are read as raw blocks and hashed against their CID
  (`guardian/ipfs.ts`); a source that cannot be read makes a trace `incomplete`, never `backed` and never a bad
  signature.
- **Errors callers may see** are `ApiError(message, httpStatus)` from `services/mrv/server/errors.ts`; route handlers
  map them with `toErrorResponse`, MCP tools with `run()`.

## Frontend contract interaction

Use the Scaffold-HBAR hooks in `packages/nextjs/hooks/scaffold-hbar` with the names that exist:
`useScaffoldReadContract`, `useScaffoldWriteContract`, `useDeployedContractInfo`, `useTransactor`.

Reads go through the hooks: custody, retirements and attestations on `DmrvRegistry`; listings and quotes on
`CreditMarket`. Purchases do not. `POST /api/market/prepare-purchase` (MCP: `prepare_purchase`) builds the unsigned
`CreditMarket` transaction and refuses it when the settlement pair is more than 3% from the settlement price, or when
the public mainnet WHBAR/USDC pair `0.0.1462797` is more than 3% from mainnet Chainlink. It also reports the on-chain
guard (`onChainPoolGuard`), which reverts the purchase itself when the pair is outside the band. The
caller signs `to`, `data` and `value` with their own wallet. Do not call `buy` or `buyAndRetire` with a value the UI
invented.

```typescript
const { data: custody } = useScaffoldReadContract({
  contractName: "DmrvRegistry",
  functionName: "custodyBalanceOf",
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

Monitoring and verification from an operator server or agent (bearer token required for each write):

```typescript
// Monitoring: verify, publish readings and report to HCS, recordMonitoring. Issues nothing.
const recorded = await post("/api/mrv/record", batch); // { status: "recorded", sequence, chainHash, hcs, ... }

// Verification, read-only: what awaits the VVB, each record reproduced from HCS (MCP get_pending_verification).
const { pending } = await get(`/api/mrv/verification?plantId=${plantId}`);

// The VVB decides; the server publishes its report and returns the statement (MCP prepare_verification).
const prepared = await post("/api/mrv/verification", { plantId, decision: "approve", deductionG: 0, findings });

// The VVB signs on its own machine (wallet eth_signTypedData_v4, or `yarn mrv:approve`); the server never can.
const signature = await vvbWallet.signTypedData(prepared.typedData);

// Relay (MCP submit_verification). An approval issues into the operator's custody.
const issued = await post("/api/mrv/verification/submit", { plantId, statement: prepared.statement, signature });
```

Contract types are generated for the **first** network in `scaffold.config.ts` `hederaFirst`. At runtime the app puts the local chain first in development once a local deploy exists (`NEXT_PUBLIC_TARGET_NETWORK` overrides). Until the registry is
deployed there, hook results are loosely typed; annotate arrays with the `Raw*` types from `services/mrv/views.ts`
(as `AuditTrail.tsx` does) so code compiles in both states. Convert raw structs with the `to*View` helpers rather
than reading struct fields ad hoc.

Server code reads the chain with viem through `services/mrv/server/registry.ts`, which resolves the ABIs with
`getRegistryDeployment()` / `getMarketDeployment()`. The app reads only the registry in `deployedContracts.ts`;
older testnet registries are documented in `docs/operations.md` and not read.

## Adding things

- **A QA/QC rule**: add it to the relevant stage in `engine.ts` with a severity (`reject`, `review`, `info`), make any
  quantity adjustment conservative, add or adjust a scenario in `scenarios.ts`, and cover it in `engine.test.ts`.
  Update the README table and `services/mrv/methodology/document.ts` (the MCP methodology resource).
- **A methodology equation or parameter**: cite the tool or methodology section in a comment, implement it in
  `methodology/` with a hand-checkable test, mirror it in the contract if it changes issued quantities, and add a
  vector to `quantificationVectors.ts`. Bump `ENGINE_VERSION` and the report schema if the report changes.
- **A contract function**: custom errors over strings, events for every state change, `nonReentrant` on anything
  that moves value, and tests for the happy path and each revert. Run `yarn deploy` to regenerate ABIs and
  `yarn hardhat:size` to check the 24,064 B gate. `DmrvRegistry` is at 24,011 B: a new registry function needs an
  equal cut, or belongs in `DmrvAnnotations` if nothing enforces it.
- **A methodology**: see the recipe below. Do not add methodology rules to `DmrvRegistry`.
- **A new thing to sell** (tickets, RWA shares, any HTS fungible token): no new contract. Deploy `UsdCheckout`
  (`yarn deploy --tags UsdCheckout`, or `scripts/checkoutTestnetDemo.ts` next to a live feed), have the seller
  `approve` it on the token and call `createListing(token, amount, usdCentsPerWholeToken)`. Buyers associate with the
  token, call `quote`, and send at least that as `buy`'s value (in tinybar; weibar over JSON-RPC, see
  `quoteToTxValue`). The seller is paid the settlement pair's USD token, so the seller must be associated with it.

### Recipe: add a methodology in about 30 minutes

The registry is methodology-agnostic; a methodology is one stateless contract plus its TypeScript twin.

1. **Contract.** Copy `contracts/modules/HydroVmr0017Module.sol` to `contracts/modules/<Name>Module.sol` and
   implement `IMethodology`:
   - `methodologyId()`: `keccak256("<standard>/<code>")`; `version()`; `schemaHash()`: keccak256 of your params
     and measurement ABI strings. Bump `version` whenever they change.
   - `validateProject(params)`: decode your params struct, revert on anything the methodology forbids, and return
     `ProjectTerms`: crediting start and end, the most the device can measure per second (the registry refuses a
     metered rate above it), calibration expiry and the registration request time.
   - `quantify(params, state, m)`: decode `m.metered` (what the device signed) and `m.verified` (what the VVB
     accepted). Revert `NotMetered` if `verified` is more generous than `metered` in any direction that credits
     more. Return `reductionG` (signed, grams CO2e), the next `state` (carry rounding remainders here) and a
     `breakdown` you want on-chain. Round the baseline down and project emissions up.
   - `validateRenewal` and `describe` as in the hydro module. No storage writes and no HTS calls: the registry
     calls the module with STATICCALL.
2. **TypeScript twin.** Put the same integer arithmetic in `packages/nextjs/services/mrv/methodology/<name>.ts`,
   pure and deterministic, and add shared vectors to `packages/hardhat/test/fixtures/quantificationVectors.ts` (or a
   sibling fixture) so the Hardhat and vitest suites assert the same integers.
3. **Engine.** Add `packages/nextjs/services/mrv/engines/<name>.ts` implementing `MethodologyEngine` (`types.ts`):
   `parse` (a zod schema of the monitoring input), `verify` (QA/QC, then your twin's quantification) and `example`.
   Every finding carries the clause it enforces, and `monitoring` lists the methodology's data and parameters tables
   (value, source, frequency, QA/QC, equation, clause) plus the terms that do not apply. Add it to `ENGINES` in
   `engines/index.ts`; `/api/mrv/engines`, the MCP tools and `/verify` pick it up. `renewable.ts` is the reference.
4. **Tests.** `test/<Name>Module.test.ts`: one case per revert in `validateProject` and `quantify`, the vectors,
   and one end-to-end record + verification through `DmrvRegistry` using `test/helpers/dmrv.ts`
   (`registerValidated`, `recordPeriod`, `verifyRecords`); `engines/engines.test.ts` for the engine.
5. **Wire it.** Deploy the module, call `DmrvRegistry.setModuleApproved(module, true)` (admin), have a VVB sign the
   `ValidationApproval`, then `registerProject(registration, validationSignature)`. Projects keep their module for
   life; a new version is a new module.
6. **Check.** `yarn test`, `yarn hardhat:size`, `yarn lint`. The market, checkout, HCS reproduction and MCP tools
   work unchanged, because they read the registry, not the methodology.
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
