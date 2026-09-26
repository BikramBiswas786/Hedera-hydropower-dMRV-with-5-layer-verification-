# Contract and oracle

`HydroCreditRegistry` compiled from this source is 507 bytes under Hedera's 24 KB contract-size limit. Further additions need a split. The deployed price age is 25 hours (`MAX_PRICE_AGE_SECONDS`, default 90000). Two days is only the upper bound the contract will accept (`MAX_PRICE_AGE`); a deploy cannot set a longer window.

## The HydroCreditRegistry contract

`packages/hardhat/contracts/HydroCreditRegistry.sol` (OpenZeppelin `AccessControl` + `ReentrancyGuard`, compiled
with `viaIR` to stay under the 24 KB limit).

A registry compiled from this source refuses a second plant on the same meter or the same design hash, refuses a
renewal whose grid factor is zero, refuses an oracle age of zero or above two days, and refuses an attestation that
does not cite the HCS topic stored by `setAuditTopic`. The testnet registry in the table above
(`0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5`) was deployed with those checks. `setAuditTopic` points it at
`0.0.10726081`. The older contract `0xAEA76b83…` does not enforce them.

This source also requires a crediting span of exactly 5, 7 or 10 × 365 days. A VMR0017 period that starts on or
after 1 January 2027 must be 5 years, and a period renews at most twice (a fixed 10-year period does not renew).
Capacity-addition leakage uses the higher of EG_PJ and EG_facility × Cap_add / Cap_PJ, so the added units are not
under-counted. The testnet registry above was deployed before those two rules. Greenfield quantification is
unchanged, so the attestations in the table still match this engine.

**Units.** 1 HYCC token = 1 t CO₂e; 3 decimals, so one base unit is 1 kg. `quantify(plantId, input)` is public, so any
wallet or agent can preview exactly what an attestation will mint.

**Registry custody.** Minted credits stay in the contract, which is the HTS treasury, and are tracked per account, like
Verra and Gold Standard registry accounts. Buyers never need an HTS association to buy or retire. Only `withdraw`
moves tokens to a wallet, which must be associated first (HIP-719 `associate()` on the token address).

**Retirement certificates.** Every retirement burns the credits, then mints one NFT with metadata
`hydro-dmrv:retirement:<id>` and tries to transfer it to the retiring account. HTS reports failure as a response
code, so if the wallet cannot hold it yet, the retirement still succeeds and the NFT waits for `claimCertificate`.

| Function | Who | What it enforces |
| --- | --- | --- |
| `createCreditToken` · `createCertificateToken` (payable) | admin | Creates the HTS token / NFT collection through `0x167`; the contract is treasury, admin and supply key. Once each. |
| `registerPlant(id, name, operator, design)` | admin | Power density (`PowerDensityTooLow`, `ReservoirBelowBaseline`), baseline fields per project type, grid EF range, crediting span of exactly 5, 7 or 10 × 365 days (VMR0017 from 1 Jan 2027 must be 5 years). Derives the PE_HP rate. |
| `renewCreditingPeriod(id, ef, start, end, hash)` | admin | Starts after the previous period; a 10-year period cannot renew, and no period renews a third time; new EF (TOOL07 BM update and weights); the new span follows the same 5/7/10 rule; restarts the crediting-year count. |
| `submitAttestation(input)` | `VERIFIER_ROLE` | Plant active; period ≤ now, not overlapping, inside the crediting period and one crediting year; `plantSequence` matches (`StaleLedger`); completeness ≥ 90%; TEG ≤ nameplate × duration; net ≤ gross; fuel only with a registered COEF. Recomputes EG_PJ, BE, PE_HP, PE_FF, ER; mints from the carried balance. |
| `quantify(id, input)` | view | The same computation without recording anything. |
| `createListing(units, usdCentsPerTonne)` · `cancelListing(id)` | holder | Moves units between custody and escrow. |
| `quote(listingId, units)` | view | Native cost at the oracle price, rounded up in the seller's favour. |
| `buy` · `buyAndRetire` (payable) | anyone | Rejects stale or invalid prices and underpayment; escrows proceeds (pull payment); refunds excess. |
| `retire(units, beneficiary)` | holder | Burns on HTS, stores a permanent record, issues the certificate NFT. |
| `claimCertificate(retirementId)` | retiring account | Delivers a certificate NFT that could not be sent at retirement time. |
| `withdraw(units)` · `withdrawProceeds()` | holder / seller | HTS token transfer · HBAR proceeds. |
| `sweepHbar(to)` | admin | Recovers stray HBAR (for example, token-creation change) but never seller proceeds. |

**HBAR decimals.** Inside the EVM on Hedera, `msg.value` is in tinybar (10⁸ per HBAR), while JSON-RPC `value` is
18-decimal weibar. The contract takes `NATIVE_UNITS_PER_HBAR` as a constructor argument (10⁸ on Hedera, 10¹⁸ on a
local Hardhat EVM), so quotes are always in the unit `msg.value` uses. The UI and `prepare_purchase` scale quotes to
weibar with `quoteToTxValue` (`services/mrv/pricing.ts`).

**HTS response codes.** HTS returns a response code instead of reverting. `contracts/lib/HederaTokenLib.sol` turns
every non-`SUCCESS` (22) code into `HtsCallFailed(selector, code)`, except the certificate delivery, which is
deliberately best-effort.

## Oracle integration: Chainlink with a Supra fallback

The registry reads prices through `AggregatorV3Interface`. The deployment points it at
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

The purchase builder adds one more check the contract does not. It reads reserves on the SaucerSwap V1 pair
[0.0.1462797](https://hashscan.io/mainnet/contract/0.0.1462797) (WHBAR/USDC, mainnet) and will not return a transaction
if that spot is more than 3% from the testnet settlement price. `GET /api/market/dex` and `get_dex_price` report the
gap. A direct contract call still settles on Chainlink and Supra only.

Settlement price for `units` kg listed at `p` US cents per tonne, with feed answer `a` at `d` decimals:

```
native = ceil( p · units · 10^d · NATIVE_UNITS_PER_HBAR / (100 · 1000 · a) )
```

The registry applies its own `maxPriceAge` on top, adjustable by the admin with `setMaxPriceAge`. Any
`AggregatorV3Interface` works, so you can swap in Pyth through an adapter (see Scaffold-HBAR's `oracles` template).
