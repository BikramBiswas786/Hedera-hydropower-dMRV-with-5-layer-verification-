# Agent instructions

Briefing for coding agents working on this repository (Claude Code, Cursor, Codex). Claude Code loads it through
`CLAUDE.md`. Agents that want to *use* a running instance should connect to its MCP server at `/api/mcp` instead;
see the "For AI agents" section of `README.md`.

This is **Hydro dMRV**, a Scaffold-HBAR template: Next.js App Router frontend and API in `packages/nextjs`, Hardhat
contracts in `packages/hardhat`, Yarn 3 workspaces. It verifies hydropower telemetry, anchors reports on HCS, mints
HTS RECs through the `HydroREC` contract, prices them through `ResilientHbarUsdFeed` (Chainlink with a Supra
fallback), and mints an HTS NFT certificate for every retirement. Raw readings are on HCS too, so anyone can reproduce
a verdict.

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
yarn mrv:attest [scenario]        # verify → HCS → submitAttestation from the CLI
yarn hardhat:test:fork            # contract tests against Hedera's HTS emulation
```

`yarn deploy` without `--network` targets the in-process `hardhat` network, not a running node.

## Where things live

| Concern | Path |
| --- | --- |
| Registry contract | `packages/hardhat/contracts/HydroREC.sol` |
| Oracle aggregator | `packages/hardhat/contracts/ResilientHbarUsdFeed.sol` |
| HTS calls (always go through this) | `packages/hardhat/contracts/lib/HederaTokenLib.sol` |
| Local test doubles | `packages/hardhat/contracts/mocks/` (HTS mock at `0x167` incl. NFTs, Chainlink and Supra mocks) |
| Deploy + idempotent setup | `packages/hardhat/deploy/00_*.ts`, `01_*.ts` |
| Per-network feeds, units, staleness | `packages/hardhat/utils/hydroNetworkConfig.ts` |
| Verification engine (pure) | `packages/nextjs/services/mrv/engine.ts`, `schema.ts`, `scenarios.ts` |
| HCS data + report messages | `packages/nextjs/services/mrv/report.ts`, built together by `pipeline.ts` |
| Mirror-node reads, audit, reproduction | `packages/nextjs/services/mrv/mirror.ts`, `audit.ts` |
| Unit conversions (kWh, cents, tinybar/weibar) | `packages/nextjs/services/mrv/pricing.ts` |
| Server-only code (keys, HCS, writes, unsigned purchases) | `packages/nextjs/services/mrv/server/` |
| REST routes / MCP route | `packages/nextjs/app/api/**/route.ts` |
| Pages | `packages/nextjs/app/{verify,market,audit,certificate/[id]}/` with client components in `_components/` |
| Generated ABIs + addresses | `packages/nextjs/contracts/deployedContracts.ts` (never edit by hand) |

## Invariants — keep these true

- **Units.** 1 token = 1 MWh; the HTS token has 3 decimals, so one base unit is 1 kWh. Attestations carry `energyWh`;
  `units = (energyWh + carryWh) / 1000`. Listing prices are **US cents per MWh**.
- **HBAR units.** `msg.value` inside the EVM is tinybar (1e8) on Hedera but wei (1e18) on a local chain.
  `HydroREC.NATIVE_UNITS_PER_HBAR` records which. `quote()` returns that unit; the UI converts with
  `quoteToTxValue` in `services/mrv/pricing.ts`. Never hardcode 1e8 or 1e18 elsewhere.
- **HTS never reverts.** It returns a response code (`SUCCESS = 22`). Every HTS call must go through
  `HederaTokenLib`, which reverts with `HtsCallFailed(selector, code)`. The one deliberate exception is certificate
  delivery (`tryTransferNftFromSelf`): a retirement must never fail because a wallet cannot hold the NFT yet.
- **Prices come from two providers.** `ResilientHbarUsdFeed` reverts when fresh Chainlink and Supra answers disagree
  beyond `MAX_DEVIATION_BPS`, and uses whichever is fresh when only one is. Keep `readSources()` non-reverting; the UI,
  REST overview and MCP read it to explain paused markets.
- **Treasury accounting.** `recToken.balanceOf(HydroREC) == Σ custodyBalanceOf + Σ active listing units`. There is
  a test for it; extend it when you add a flow that moves units.
- **The engine is pure and deterministic.** No I/O, no `Date.now()`, no randomness in `engine.ts`. It runs in the
  browser, API, MCP and tests. Scenario generation takes an explicit `end` date in tests.
- **Two HCS messages per attestation, in order.** The data message (readings + plant profile, up to 20 chunks) is
  published first; the report (one chunk, ≤ 1024 bytes) commits to it with `data: { hash, sequence }`. Both limits are
  enforced in `report.ts` and tested.
- **`reportHash` = sha256 of the exact report bytes.** `reproduceAttestation` checks report vs chain, data vs report
  and an engine re-run vs report. If you change either message shape, bump its schema string and update `audit.ts`.
- **On-chain rules mirror the engine's hard failures.** Capacity ceiling, non-overlapping periods and minimum trust
  are enforced in `submitAttestation`. Changing a threshold in one place means reviewing the other.
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

```typescript
const { data: custody } = useScaffoldReadContract({
  contractName: "HydroREC",
  functionName: "custodyBalanceOf",
  args: [address],
});

const { writeContractAsync } = useScaffoldWriteContract({ contractName: "HydroREC" });
await writeContractAsync({ functionName: "buyAndRetire", args: [listingId, units, beneficiary], value });
```

Contract types are generated for the **first** network in `scaffold.config.ts` `targetNetworks`. Until HydroREC is
deployed there, hook results are loosely typed; annotate arrays with the `Raw*` types from `services/mrv/views.ts`
(as `AuditTrail.tsx` does) so code compiles in both states. Convert raw structs with the `to*View` helpers rather
than reading struct fields ad hoc.

Server code reads the chain with viem through `services/mrv/server/registry.ts`, which resolves the ABI with
`getHydroRecDeployment()` and works whichever network is deployed.

## Adding things

- **A verification rule**: add it to the relevant layer in `engine.ts`, emit an `Issue` with a clear message, add
  or adjust a scenario in `scenarios.ts`, and cover it in `engine.test.ts`. Update the table in `README.md` and the
  methodology text in `services/mrv/server/mcp.ts`.
- **A contract function**: custom errors over strings, events for every state change, `nonReentrant` on anything
  that moves value, and tests for the happy path and each revert. Run `yarn deploy` to regenerate ABIs.
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
