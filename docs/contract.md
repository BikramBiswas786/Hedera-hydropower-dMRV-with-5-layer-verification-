# Contracts and oracle

Phase 1 splits the phase-0 `HydroCreditRegistry` into four contracts:

| Contract | Role | Size (`yarn hardhat:size`) |
| --- | --- | --- |
| `DmrvRegistry.sol` | Projects, meters, verifiers, module approval, two-signature attestation, anchoring, custody, retirement, certificates, and every HTS call (only here) | 20,862 B |
| `modules/HydroVmr0017Module.sol` | Stateless `IMethodology`: VMR0017 / ACM0002 / AMS-I.D registration rules and integer quantification | 7,028 B |
| `CreditMarket.sol` | Listings, oracle quote, SaucerSwap router swap, pool guard | 10,131 B |
| `ResilientHbarUsdFeed.sol` | Chainlink HBAR/USD with a Supra fallback | 2,534 B |

CI fails any contract above 24,064 B (512 B under EIP-170), and `ContractSize.test.ts` keeps `DmrvRegistry` ≤ 21,504 B.
The phase-0 contract lives on as `contracts/legacy/HydroCreditRegistry.sol`. It is compiled and tested so the live
testnet evidence keeps reproducing. The deployed price age is 25 hours (`MAX_PRICE_AGE_SECONDS`, default 90000). Two
days is only the upper bound `CreditMarket` accepts (`MAX_PRICE_AGE`).

The legacy testnet registry (`0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5`, 24,551 B compiled from
`contracts/legacy/`) stays readable. It predates the crediting-span rule and the capacity-addition leakage bound.
The app does not read it. The issuer since 26 Sep 2026 is `DmrvRegistry`
`0xaf9C76B48B317cee770ED6AE038D516b269E0129` and `CreditMarket`
`0x5aeDe76fc6625cfA3227FFf70197D4D7ff3e5030`, which swaps through SaucerSwap router `0.0.19264`.
Earlier phase-1 deploys (`0xc427610cFfBC919dC0B2c3f71644a4fDcB7ef84a`, `0xe34BeFc4081a8e751271C3549B861e03Fac512b9`)
are unused.

## Roles

| Role | Holder (production) | Can |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | 2-of-3 threshold account (`ADMIN_ADDRESS`, `yarn admin:threshold`) on both contracts | Approve modules, register and renew projects, set meters and calibration, grant `VERIFIER_ROLE`, set the audit topic, Article 6 fields, pool guard, sweep stray HBAR |
| `VERIFIER_ROLE` | Each accredited VVB's secp256k1 key (`VERIFIER_ADDRESS`) | Sign `VerifierApproval`s. It never sends a transaction and cannot mint alone |
| Meter | One generated key per project (`setMeter`) | Sign `MeterStatement`s |
| `MARKET_ROLE` | `CreditMarket` | Move custody for listings and purchases, retire on a buyer's behalf |
| Relayer | Anyone (the server's operator key in practice) | Send `submitAttestation`; it cannot change a signed figure |

The registry rejects an approval from the project's operator or meter (`VerifierIsParty`).

## Attestation: two EIP-712 signatures

Domain: `{ name: "DmrvRegistry", version: "1", chainId, verifyingContract: registry }`. A signature is useless on
another chain (`WrongChain`) or deployment.

```
MeterStatement(bytes32 projectId,uint32 sequence,uint64 periodStart,uint64 periodEnd,uint32 intervals,
               uint32 intervalSeconds,bytes32 meteredHash,bytes32 readingsDigest)
VerifierApproval(bytes32 meterStatement,bytes32 verifiedHash,bytes32 reportHash,uint64 hcsTopicNum,
                 uint64 hcsSequence,bytes32 evidenceHash,uint8 decision)
```

- **`meteredHash` and `verifiedHash`.** Each is the keccak256 of the ABI-encoded `(netWh, grossWh, fuelG, leakageG)`:
  the meter's raw totals, and the figures the VVB accepted.
- **The VVB signs the meter statement's digest** (hash chaining), so both signatures bind the same raw totals. The
  approval also binds the report hash, the HCS anchor and the evidence hash.
- **`sequence` is the project's attestation count.** Each signature pair is usable once (`StaleLedger`).
- **`evidenceHash`** is an optional external artefact the VVB relied on, such as a Guardian VC or VP hash.
  `evidenceUsed[hash]` makes it single-use (`EvidenceAlreadyUsed`).
- **`decision` must be 1 (approved).** A VVB that rejects simply does not sign.
- **The VVB may only lower figures.** The module reverts `NotMetered` if the verified net exceeds the metered net,
  verified fuel or leakage is below the metered value, or verified gross differs from the metered gross capped at
  nameplate.
- **Completeness is computed on-chain** from the meter-signed `intervals × intervalSeconds` over the period, not
  taken from the caller.
- **The calibration must be valid through the period end** (`CalibrationExpired`; the admin records a renewed
  certificate with `setCalibrationValidUntil`).

TypeScript mirrors: `services/mrv/provenance.ts` (`meterStatementDigest`) and `services/mrv/approval.ts`
(`approvalDigest`). `services/mrv/fixtures/eip712.json` is written by the Hardhat test and asserted by vitest, so the
two cannot drift.

## Methodology modules

`interfaces/IMethodology.sol` defines the module interface:

- `validateProject(params)` and `validateRenewal(old, new, prevStart, prevEnd, periods)` return the `ProjectTerms`
  the registry stores: crediting window, nameplate rate, calibration validity and `registrationRequestedAt`.
- `quantify(params, state, measurement)` is a pure function of the registered params, the module's 32-byte ledger
  state and the period.
- A module is stateless and makes no HTS calls. The admin approves it (`setModuleApproved`), and a project keeps its
  module for life.

`HydroVmr0017Module` enforces:

- the power density (`PowerDensityTooLow`, `ReservoirBelowBaseline`) and the grid-factor range;
- VMR0017's 15 MW limit;
- a crediting span of exactly 5, 7 or 10 × 365 days, with `registrationRequestedAt` required and not in the future.
  VMR0017 requests on or after 1 January 2027 must be 5 years (VCS Standard v5.0 Table 8);
- renewals: at most two, no renewal of a 10-year period, the same span (`RenewalSpan`), and no overlap or other param
  changes except the grid factor and the window (`ParamsChanged`);
- a calibration valid past the crediting start;
- per period: one crediting year, gross ≤ nameplate, net ≤ gross, fuel only with a registered COEF.

It recomputes EG_PJ, BE, PE_HP, PE_FF, LE and ER exactly as `services/mrv/methodology/quantify.ts` does, with the
same shared vectors. The two live testnet mints reproduce through it to the gram: 4,791,542 g and 73,386,435 g.

## DmrvRegistry functions

| Function | Who | What it enforces |
| --- | --- | --- |
| `createCreditToken` · `createCertificateToken` (payable) | admin | HTS token / NFT collection through `0x167`, with the registry as treasury and supply key. Once each |
| `setModuleApproved(module, bool)` | admin | Only approved modules can register projects |
| `registerProject(id, name, module, operator, meter, designHash, params)` | admin | Module `validateProject`; unique meter and design hash; `registrationRequestedAt` not in the future |
| `renewCreditingPeriod(id, newParams)` | admin | Module `validateRenewal` |
| `setMeter` · `setCalibrationValidUntil` · `setProjectActive` · `setMinCompleteness` · `setAuditTopic` | admin | Named errors, events for each |
| `setVerifierProfile(verifier, accreditationHash)` | admin | Records the VVB's accreditation reference |
| `setArticle6(id, {hostParty, authorizedUse, firstTransferDefinition, authorizationRef})` · `setCorrespondingAdjustment(attestationId, status, ref)` | admin | Reserved Paris Agreement Article 6.2 fields. Recorded, not enforced; the corresponding adjustment happens in the host Party's registry |
| `submitAttestation(Submission)` | anyone (relayer) | Everything under "Attestation" above, then the module's `quantify`; mints ⌊(balance + ER) / 1000⌋ kg into the operator's custody and carries the remainder |
| `preview(id, measurement)` · `meterStatementDigest(s)` · `approvalDigest(s)` | view | What an attestation would mint; the digests the two keys sign |
| `retire(units, beneficiary)` · `claimCertificate(id)` · `withdraw(units)` | holder | Burn + certificate NFT (best-effort delivery); HTS transfer out of custody |
| `moveCustody` · `retireFor` | `MARKET_ROLE` | Used by `CreditMarket` only |

**Units.** 1 HYCC token = 1 t CO₂e with 3 decimals, so one base unit is 1 kg. **Registry custody**: minted credits
stay in the registry (the HTS treasury) and are tracked per account. Buyers need no HTS association to buy or
retire; only `withdraw` moves tokens to an associated wallet (HIP-719 `associate()`). **Retirement certificates**: a
retirement burns, then mints one NFT (`hydro-dmrv:retirement:<id>`) and tries to send it. If the wallet cannot hold it
yet, the NFT waits for `claimCertificate`.

## CreditMarket functions

| Function | Who | What it enforces |
| --- | --- | --- |
| `createListing(units, usdCentsPerTonne)` · `cancelListing(id)` | holder | Moves units between registry custody and the market's custody |
| `quote(listingId, units)` | view | Native cost at the settlement price, rounded up in the seller's favour |
| `buy` · `buyAndRetire` (payable) | anyone | Sends the oracle HBAR amount to the SaucerSwap router. Reverts if the pool is more than 3% off or the swap fails |
| `withdrawProceeds()` | seller | Pull payment |
| `setMaxPriceAge` · `setPoolGuard(...)` · `setPoolGuardEnabled(bool)` · `sweepHbar(to)` | admin | `sweepHbar` never touches owed proceeds |

### SaucerSwap pool guard

`settlementPrice()` runs on every quote and purchase. It reverts `InvalidPoolGuard` when no SaucerSwap pool is
configured, and `PoolPriceDeviation(poolPrice, oraclePrice, bps)` when the pool is more than 300 bps from the oracle.
`setPoolGuardEnabled(false)` reverts. The admin can repoint the pool, not remove the check. It reverts `PoolIlliquid` below
`minLiquidity`.

- **V1 pairs** (Uniswap V2 fork): `getReserves()`. The interface is SaucerSwap's `IUniswapV2Pair`
  ([saucerswaplabs core](https://github.com/saucerswaplabs/saucerswaplabs-core)).
- **V2 pools** (Uniswap V3 fork): `slot0().sqrtPriceX96` and `liquidity()`, as in `IUniswapV3PoolState`
  ([saucerswaplabs v2 core](https://github.com/saucerswaplabs/saucerswaplabs-v2-core)). Price =
  (sqrtPriceX96 / 2⁹⁶)² in token1 per token0 base units, scaled by the decimals.
- **Token order** is read from `token0()` / `token1()` when the guard is set, so either order works.

Pools the deploy script writes. Testnet is the pair the live market already swaps. Mainnet is the V1 WHBAR/USDC pair `getPair` returns; it is not deployed.

| Network | Pool | WHBAR | State |
| --- | --- | --- | --- |
| Testnet | V1 pair `0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869` on factory 0.0.9959. The live market `0x5aeDe76f…` swaps through router 0.0.19264 | `0x0000000000000000000000000000000000003aD2` (0.0.15058) | Enforced. Seeded at the Chainlink price on 26 Sep 2026 |
| Mainnet | V1 WHBAR/USDC `0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d` (0.0.1462797, factory 0.0.1062784, router 0.0.3045981) | `0x0000000000000000000000000000000000163B5a` (0.0.1456986) | Next mainnet deploy. Spot was 24 bps from Chainlink on 26 Sep 2026. Nothing is deployed on mainnet |

A spot price can be moved inside one block. Someone who pushes the pool out of band can block sales (a denial of
service), but cannot buy cheaper, because the payment is always computed from the oracle price. A TWAP would remove
the denial-of-service vector and is future work. The admin can repoint the pool. The admin cannot turn the check off.

**HBAR decimals.** Inside the EVM on Hedera, `msg.value` is in tinybar (10⁸ per HBAR), while JSON-RPC `value` is
18-decimal weibar. `CreditMarket` takes `NATIVE_UNITS_PER_HBAR` as a constructor argument (10⁸ on Hedera, 10¹⁸ on a
local Hardhat EVM), so quotes are always in the unit `msg.value` uses. The UI and `prepare_purchase` scale quotes to
weibar with `quoteToTxValue` (`services/mrv/pricing.ts`).

**HTS response codes.** HTS returns a response code instead of reverting. `contracts/lib/HederaTokenLib.sol` turns
every non-`SUCCESS` (22) code into `HtsCallFailed(selector, code)`, except the certificate delivery, which is
deliberately best-effort.

## Oracle integration: Chainlink with a Supra fallback

`CreditMarket` reads prices through `AggregatorV3Interface`. The deployment points it at
`contracts/ResilientHbarUsdFeed.sol`, which implements that interface over two independent providers:

| Network | Chainlink HBAR/USD (primary) | Supra push oracle (fallback, pair 75 HBAR/USDT) |
| --- | --- | --- |
| Hedera testnet (296) | `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` | `0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917` |
| Hedera mainnet (295) | `0xAF685FB45C12b92b5054ccb9313e135525F9b5d5` | `0xD02cc7a670047b6b012556A88e275c685d25e0c9` |
| Local | `MockV3Aggregator` ($0.25) | `MockSupraSValueFeed` ($0.2505) |

Rules, applied on every read:

| Chainlink | Supra | Result |
| --- | --- | --- |
| fresh | fresh | Must agree within `MAX_DEVIATION_BPS` (3%), otherwise **revert** `PriceSourcesDisagree`. Chainlink's answer is used. |
| fresh | stale / unavailable | Chainlink alone |
| stale / invalid | fresh | Supra alone (the market survives a Chainlink outage) |
| stale | stale | **revert** `NoFreshPrice` |

Both answers are normalised to 8 decimals. Supra's millisecond timestamps and 18-decimal prices are handled, and a
reverting provider counts as unavailable instead of bubbling up. `readSources()` never reverts, so dashboards and
agents can always see both providers.

The purchase builder reads the SaucerSwap pair stored on `CreditMarket` and will not return a transaction if that
pair is more than 3% from the oracle. `GET /api/market/dex` and `get_dex_price` report that same pair. The contract
then swaps through the SaucerSwap router. The mainnet WHBAR/USDC pair is not this check.

Settlement price for `units` kg listed at `p` US cents per tonne, with feed answer `a` at `d` decimals:

```
native = ceil( p · units · 10^d · NATIVE_UNITS_PER_HBAR / (100 · 1000 · a) )
```

The market applies its own `maxPriceAge` on top, adjustable by the admin with `setMaxPriceAge`. Any
`AggregatorV3Interface` works, so you can swap in Pyth through an adapter (see Scaffold-HBAR's `oracles` template).
