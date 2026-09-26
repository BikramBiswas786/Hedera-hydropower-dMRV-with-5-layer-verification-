# Testing

## Testing

```bash
yarn test              # contracts + frontend unit tests
yarn hardhat:test      # 154 contract tests, hermetic (HTS mock at 0x167, oracle and SaucerSwap mocks)
yarn hardhat:test:fork # same suite against Hedera's HTS emulation (HEDERA_FORKING, needs internet)
yarn hardhat:test:gas  # with a gas report
yarn next:test         # 238 vitest tests
yarn hardhat:size      # runtime bytecode per contract; fails above 24,064 B (CI runs it)
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
- **Meter provenance**: signatures interoperate with standard EIP-191 wallets both ways; wrong key, missing signature,
  any edited reading and replay against another plant, chain or registry are rejected; edits after signing fail
  reproduction, and `readings@2`–`@4` attestations still reproduce. A shared vector
  (`test/fixtures/meterStatementVector.ts`) pins the statement hash in both suites.
- **Meter statements on-chain**: only the registered meter's signature is accepted; net above, fuel below or gross
  different from the statement revert (`NotMetered`); a statement signed for another registry reverts; only the admin
  can swap a meter. For every scenario on both demo plants the engine's figures are at least as conservative as the
  statement, which is what the contract requires.
- **Engine**: every scenario on both plants; net metering; lower-of-two-meters; MPE after calibration expiry; gaps;
  replays; export capped at generation; physics exclusions; reservoir emissions from TEG; safeguards never changing
  the quantity; determinism.
- **DmrvRegistry** (two-signature attestation): a stranger can relay the meter + VVB signatures; submissions without
  the meter's signature, approvals from keys without `VERIFIER_ROLE`, from the project's operator or meter, or signed
  before a role revocation are rejected; tampering with either figure set breaks a signature; the VVB may lower net
  export and raise fuel/leakage but never the reverse; any decision other than approval reverts; signatures for another
  registry, reused signature pairs, reused periods and reused `evidenceHash` (`evidenceUsed`) revert; completeness is
  computed from the meter-signed interval count; periods after calibration lapses, outside the crediting window, in the
  future or without an audit-topic anchor revert; renewal keeps the span; Article 6 metadata is recorded; custody,
  retirement and certificates. The EIP-712 digests match `services/mrv/fixtures/eip712.json`, which the TypeScript
  suite also asserts.
- **HydroVmr0017Module**: 5-year VMR0017 periods for requests from 1 Jan 2027 (a 7-year request at 31 Dec 2026
  23:59:59 UTC is still accepted), renewals 5→5 and 7→7 only, metering rules, and parity: all 13 frozen outputs of the
  legacy `HydroCreditRegistry.quantify` reproduce, and a full greenfield flow on the new registry reproduces the legacy
  registry's 4 791 542 g and 73 386 435 g.
- **CreditMarket**: escrow in registry custody, oracle-priced settlement, refunds, proceeds, buy-and-retire, and the
  SaucerSwap guard: V1 `getReserves` and V2 `slot0` (WHBAR as token0 and token1) read in feed decimals, settlement
  within 3%, blocked beyond 3% in either direction and on an illiquid pool, admin-disableable, config validation.
- **Contract size**: every deployable contract outside `mocks/` and `legacy/` is covered by the 24,064 B guard.
- **Legacy HydroCreditRegistry** (kept for evidence): registration rules (PD, baselines, EF range, crediting period, renewal), on-chain ER with
  fuel and leakage, remainders and deficits, crediting-year and stale-ledger guards, nameplate and net ≤ gross,
  completeness, HTS token and NFT creation, mint and burn, association, certificates, oracle-priced quotes, refunds,
  pull-payment proceeds, sweep, and the invariant *treasury balance = custody + listed*.
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
  chunks and missing data.
- **Gas**: one two-signature `submitAttestation` on the local Hardhat node used 697 539 gas (26 Sep 2026); the
  server sends it with a 1 500 000 limit (`ATTEST_GAS`).
- **Demo registration**: the integers the deploy script registers equal what the engine derives from the demo designs.

The template ships a [Hedera Harness](https://github.com/hedera-dev/hedera-harness) recipe in `.harness/`: static and
command validators, a Playwright smoke gate for every route, a Tier 3 acceptance contract, and an opt-in Tier 3.5
testnet deployment. After a one-time `npx playwright install chromium` run `yarn harness:validate` (Tiers 0–2, no
credentials), or `yarn harness:run` to have an agent build a feature against these validators. CI
(`.github/workflows/ci.yaml`) runs every check on Node 20.18.3 and scaffolds with the Quick start command from the
README (`npm create scaffold-hbar@latest -- hydro-dmrv --template BikramBiswas786/Hedera-hydropower-dMRV-with-5-layer-verification- --ci --package-manager yarn --solidity-framework hardhat --skip-hedera-skills`).
The checkout under test is supplied with `CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR`.
