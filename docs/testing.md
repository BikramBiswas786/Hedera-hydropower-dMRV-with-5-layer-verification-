# Testing

## Commands

```bash
yarn verify            # engine only: healthy APPROVED, inflated and tampered REJECTED, with the reason. No chain.
yarn demo              # local chain, deploy, those three checks, buy 10 kg, then the market page
yarn test              # contracts + frontend unit tests
yarn hardhat:test      # 152 passing (4 pending without a fork), hermetic (HTS mock at 0x167, oracle and SaucerSwap mocks)
yarn hardhat:test:fork # same suite against Hedera's HTS emulation (HEDERA_FORKING, needs internet)
HEDERA_FORK_NETWORK=mainnet HEDERA_RPC_URL=https://mainnet.hashio.io/api \
  yarn workspace @sh/hardhat hardhat test test/MainnetFork.test.ts  # real SaucerSwap + Chainlink on a mainnet fork
yarn hardhat:test:gas  # with a gas report
yarn next:test         # 419 vitest tests
yarn hardhat:size      # runtime bytecode; fails above 24,064 B; prints tight when under 256 B of that (does not fail)
yarn lint && yarn next:build
```

What the tests pin down:

- **Methodology** (hand-checked numbers): TOOL07 options A1 and A2, simple / simple adjusted / average OM, the < 50%
  LCMR gate, BM sample steps 5(c), 5(d) and 5(f), CM weights by technology and crediting period; TOOL03 COEF
  (43.3 GJ/t × 74 800 kg/TJ = 3.23884 t CO₂/t diesel); power density boundaries at 4 and 10 W/m²; retrofit baselines
  with the sample standard deviation; leakage and crediting rules.
- **Quantification in both implementations**: `test/fixtures/quantificationVectors.ts` (greenfield with reservoir and
  diesel emissions and a deficit; a retrofit across crediting years and past DATE_BaselineRetrofit) is asserted by the
  contract suite *and* the TypeScript suite, gram for gram.
- **Meter provenance**: EIP-712 statements interoperate with standard wallets both ways (legacy EIP-191 batch
  signatures still verify); wrong key, missing signature,
  any edited reading and replay against another plant, chain or registry are rejected; edits after signing fail
  reproduction, and `readings@2`–`@5` data messages still parse. A shared vector
  (`test/fixtures/meterStatementVector.ts`) pins the statement hash in both suites.
- **Meter statements on-chain**: only the registered meter's signature is accepted; net above, fuel below or gross
  different from the statement revert (`NotMetered`); a statement signed for another registry reverts; only the admin
  can swap a meter. For every scenario on both demo plants the engine's figures are at least as conservative as the
  statement, which is what the contract requires.
- **Engine**: every scenario on both plants; net metering; lower-of-two-meters; MPE after calibration expiry; gaps;
  replays; export capped at generation; physics exclusions; reservoir emissions from TEG; safeguards never changing
  the quantity; determinism.
- **DmrvRegistry** (the VCS cycle): **validation** — registration and renewal need a `ValidationApproval` from a
  `VERIFIER_ROLE` key that is not the operator or meter, for exactly those terms, params and report; duplicates of a
  meter, design or external id revert; the module's refusals (not an LDC, above 15 MW, 7 years requested after 2027)
  surface. **Monitoring** — a meter-signed period is recorded as monitored ER and issues nothing; only the operator or
  its named reporter records; a missing, wrong or foreign-registry meter signature, a raised figure, a reused signature
  or period, a lapsed calibration, a period outside the crediting window or in the future, a missing HCS anchor and
  gross above nameplate all revert; completeness is computed from the meter-signed interval count. **Verification** —
  anyone relays a VVB's statement; runs are contiguous from the first unverified record; a different chain head, a key
  without the role, a party, an unknown decision, a revoked VVB, a report off the audit topic and reused evidence all
  revert; the deduction lowers issuance and the remainder carries; a rejection closes the run unissued and drops its
  ER. **Renewal** — needs a new validation and every record verified, resets the module ledger, keeps the ER balance,
  and may re-measure Cap_PJ and A_PJ. **Custody** — association before withdrawal, `deposit` back, retirement burns
  and mints a certificate, pending certificates are claimable once, the market is named once. The EIP-712 digests and
  the record chain match `services/mrv/fixtures/eip712.json`, which the TypeScript suite also asserts.
- **HydroVmr0017Module**: 5-year VMR0017 periods for requests from 1 Jan 2027 (a 7-year request at 31 Dec 2026
  23:59:59 UTC is still accepted), CDM renewals 5→5 and 7→7 only, VMR0017 renewals from 2027 5 years only (V5#101), VMR0017 Table 1 on-chain (the UN LDC list with graduation dates, 15 MW by the higher of rated and
  authorized capacity), metering rules, and parity: all 13 frozen outputs of the phase-0 registry's quantification
  reproduce, and a full validated-record-verified flow on the v2 registry re-issues the phase-0 testnet mints'
  4 791 542 g and 73 386 435 g.
- **RenewableVmr0017Module**: VMR0017 Table 1 (terrestrial solar and wind refused in high-income countries; floating
  solar, wave and tidal accepted; CDM unrestricted), a declared battery refused, the 2027 five-year rule, renewals, VVB-only-lowers metering rules, the four shared vectors in
  `fixtures/renewableVectors.ts` (also asserted by `renewable.test.ts`), and a validated, recorded and verified
  solar issuance through `DmrvRegistry` with no registry change.
- **CreditMarket**: escrow in registry custody, oracle-priced settlement, refunds, buy-and-retire, and the
  SaucerSwap guard: V1 `getReserves` read in feed decimals, settlement within 3%, blocked beyond 3% in either
  direction and on an illiquid pool, cannot be switched off, V2 pools and impostor pools refused, config validation.
- **UsdCheckout**: escrow of any HTS fungible token (HIP-719 association, `transferFrom` against an allowance, a
  second listing of the same token), prices per whole token rounded up, the seller's USD minimum, stale and
  out-of-band refusals, refunds, sell-out, a buyer not associated (HTS 184) and a failed swap each revert the whole
  purchase, and the invariant *checkout balance = active listings*.
- **Local demo deploy** (`LocalDemo.test.ts`): the real deploy scripts install the stand-ins, register the plants with a validation, record one signed hour, have the local VVB verify it, list the credits, and a buyer can buy and retire.
- **Contract size**: every deployable contract outside `mocks/` is covered by the 24,064 B guard.
- **ResilientHbarUsdFeed**: agreement, fallback, disagreement and double staleness, Supra's units, and a purchase
  settled through the fallback during a Chainlink outage.
- **Guardian bridge** (`services/mrv/guardian/*.test.ts`, `server/guardianBridge.test.ts`): cross-check VCs signed
  with the exact `@digitalbazaar` versions Guardian 3.7.0 pins and verified through a port of Guardian's `VCJS.verify`,
  with the bridge DID resolved from a fake mirror node and IPFS the way `RemoteDidLoader` does; tampered values, a
  wrong key, an unpublished DID and a future issuance date fail; the Monitoring Report field mapping (MATCH, MISMATCH,
  NOT_COMPARABLE, exact decimal scaling, EF rounding slack, ER floored at 0); the schema and the Excel import layout;
  evidence acceptance and refusals (MintToken anywhere in the chain, wrong topic, altered IPFS document, unknown DID,
  revoked, mismatching report, mint memo and NFT metadata resolution); the route's 503, 401, 413, 400, 422, 429 and
  idempotency.
- **HCS and reproduction** (against a fake mirror node that chunks like HCS): message sizes for every scenario,
  round-trips, a forged verdict over honest data, a swapped data message, a non-registered grid factor, interleaved
  chunks, missing data, and a record whose hash-chain link breaks when the record before it is swapped.
- **Server flows** (`record.dryrun.test.ts`, `verification.flow.test.ts`): nothing reaches HCS before the module
  agrees with the engine, the dry run passes and the server key is the operator or reporter; data is published before
  the report and the record cites the report's sequence; an approval is refused unless every record reproduces; a
  signer without the role, or a statement that does not match the report at its HCS anchor, is refused before relay.
- **Gas** on Hedera testnet (29 Sep 2026): `recordMonitoring` 625 591, `verifyPeriod` issuing credits 318 917,
  `buyAndRetire` with the SaucerSwap swap and certificate 1 420 410. The server sends them with 1 200 000
  (`RECORD_GAS`), 1 000 000 (`VERIFY_GAS`) and 3 000 000.
- **Demo registration**: the integers the deploy script registers equal what the engine derives from the demo designs.

The template ships a [Hedera Harness](https://github.com/hedera-dev/hedera-harness) recipe in `.harness/`: static and
command validators, a Playwright smoke gate for every route, a Tier 3 acceptance contract, and an opt-in Tier 3.5
testnet deployment. After a one-time `npx playwright install chromium` run `yarn harness:validate` (Tiers 0–2, no
credentials), or `yarn harness:run` to have an agent build a feature against these validators. CI
(`.github/workflows/ci.yaml`) runs every check on Node 20.18.3 and scaffolds with the Quick start command from the
README (`npm create scaffold-hbar@latest -- hydro-dmrv --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification- --ci --package-manager yarn --solidity-framework hardhat --skip-hedera-skills`).
The checkout under test is supplied with `CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR`.

## First checks

`yarn verify` is the checker. It does not deploy, publish, or sign. `/verify` is the same engine in the browser: press **healthy**, then **inflated**, then **tampered**.

`yarn demo` is the market. It writes chain 31337 only to gitignored `packages/nextjs/contracts/deployedContracts.local.ts`. `yarn test` does not read that file, so a deploy and a test run can share one checkout. `yarn reset:local` deletes the local file and checks the committed address file back out.

On testnet, monitoring and issuance are four commands (`yarn mrv:record`, `yarn mrv:verify`, `yarn mrv:approve`, `yarn mrv:submit`). They do not use the local chain. `yarn demo` already issued that listing. `yarn mrv:record` without `METER_PRIVATE_KEYS` says so, and names `yarn hardhat:meter-keys --network hederaTestnet`. It does not say to run `yarn deploy` with no network. `yarn mrv:verify` publishes the VVB's report and does not sign. The VVB key stays on the VVB's machine. The contract stores each report's hash and a non-zero sequence on HCS topic `0.0.10729650`. It cannot read the message. `yarn mrv:reproduce` refuses a hash mismatch. A direct `verifyPeriod` call can still cite a sequence whose bytes are something else.

`yarn hardhat:size` prints `tight` when a contract is under 256 B of the 24,064 B fail limit. `tight` does not fail CI. `DmrvRegistry` is in that band. Do not add a registry function without an equal cut.

`yarn mrv` prints the local path and the four testnet commands. `yarn verify` is the engine. `yarn mrv:verify` publishes a VVB report and does not sign. A mirror node or IPFS gateway that stays silent fails that read after 12 seconds (`UPSTREAM_TIMEOUT_MS`). `/api/*` returns 429 after 300 calls in a minute on one instance; instances do not share the counter.
