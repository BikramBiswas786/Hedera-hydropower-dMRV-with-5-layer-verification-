# Hedera facts

Things about Hedera that a developer, or an AI agent writing Hedera code, gets wrong the first time. Each fact is
stated once, says what breaks if you ignore it, names the code in this repo that handles it, and links the test or
workflow that proves it. The workflows run against real Hedera, so when Hedera changes, a check here turns red
before your code does.

Proof legend: **test** runs in `yarn test` (hermetic). **fork** runs on a Hedera mainnet fork in the
[Mainnet fork](.github/workflows/mainnet-fork.yml) workflow. **live** runs against Hedera testnet or the deployed
app in the [Live smoke](.github/workflows/live-smoke.yml) or [Testnet pair keeper](.github/workflows/testnet-pair-keeper.yml)
workflows.

## Value and gas

**1. `msg.value` is tinybar (10⁻⁸ HBAR) inside a contract, but a JSON-RPC transaction's `value` is weibar (10⁻¹⁸).**
One tinybar is 10¹⁰ weibar. A local Hardhat chain uses wei throughout. If you hardcode either factor, a purchase
overpays by 10¹⁰ or reverts for underpayment.
Handled by: `NATIVE_UNITS_PER_HBAR` in [`UsdSettlement`](packages/hardhat/contracts/settlement/UsdSettlement.sol),
set per network in [`hydroNetworkConfig.ts`](packages/hardhat/utils/hydroNetworkConfig.ts); `quoteToTxValue` in
[`pricing.ts`](packages/nextjs/services/mrv/pricing.ts).
Proof: test, `pricing.test.ts` "scales tinybar quotes to 18-decimal JSON-RPC value"; live, every keeper swap.

**2. The Hashio relay rejects EIP-1559 fees below its minimum gas price. Send legacy transactions at `eth_gasPrice`.**
Handled by: `gasPrice` from `getGasPrice()` in [`rebalanceTestnetPair.ts`](packages/nextjs/scripts/rebalanceTestnetPair.ts)
and [`keepListingOpen.ts`](packages/nextjs/scripts/keepListingOpen.ts), and `getDeployGasPrice` for deploys.
Proof: live, the Testnet pair keeper's swaps and listings.

**3. Contract bytecode is capped at 24,576 bytes (EIP-170), and Hedera enforces it.**
Handled by: `viaIR` in `hardhat.config.ts`, and the split of issuance, methodology and market into separate contracts.
Proof: test, `ContractSize.test.ts` and `yarn hardhat:size`, a CI gate at 24,064 B.

## Hedera Token Service

**4. HTS calls do not revert on failure. They return a response code, and `SUCCESS` is 22.** Ignore the code and
a failed transfer looks like a successful one.
Handled by: every HTS call goes through [`HederaTokenLib`](packages/hardhat/contracts/lib/HederaTokenLib.sol), which
reverts `HtsCallFailed(selector, code)`.
Proof: test, `UsdCheckout.test.ts` "needs the seller's approval" (code 292) and "reverts the whole purchase when the
buyer is not associated" (code 184); `DmrvRegistry.test.ts` withdraw before association.

**5. An account must be associated with a token before it can receive it.** Otherwise the transfer fails with 184
(`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`), unless the account has a free auto-association slot.
Handled by: `UsdCheckout.buy` and `createListing` document it for the buyer and the seller; `prepare_purchase` checks
the seller on the mirror node before it builds a transaction ([`association.ts`](packages/nextjs/services/mrv/server/association.ts)).
Proof: test, `association.test.ts`; `UsdCheckout.test.ts` (code 184).

**6. A contract or EOA associates itself by calling `associate()` on the token's own address (HIP-719).** A second
call returns 194 (`TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`) rather than reverting.
Handled by: `HederaTokenLib.associateSelf`, which accepts 194.
Proof: test, `UsdCheckout.test.ts` "lists the same token twice (association already held)".

**7. A contract can pull an HTS token from a holder only against an allowance the holder gave through the token's
ERC-20 `approve`, using HTS `transferFrom`.** Without it the call returns 292.
Handled by: `HederaTokenLib.transferFrom`, used by `UsdCheckout.createListing`.
Proof: test, `UsdCheckout.test.ts`.

**8. A contract can own a token outright: treasury, admin key and supply key.** Then nobody, not even the deployer,
can mint outside the contract's rules.
Handled by: `HederaTokenLib.createContractOwnedToken`, used by `DmrvRegistry` for the credit token and the
retirement NFT.
Proof: test, `DmrvRegistry.test.ts`.

**9. HTS amounts are `int64`.** A `uint256` above 2⁶³−1 must be refused, not truncated.
Handled by: `HederaTokenLib._toInt64` reverts `HtsAmountOverflow`.

## Consensus Service and the mirror node

**10. An HCS message chunk carries at most 1,024 bytes, and a chunked message at most 20 chunks.**
Handled by: [`report.ts`](packages/nextjs/services/mrv/report.ts) keeps the report in one chunk and the data message
within 20.
Proof: test, `report.test.ts` "fits a single HCS chunk" and "refuses batches larger than the 20-chunk HCS limit".

**11. The mirror node, not the JSON-RPC relay, is where you read HCS messages, token relationships and account
settings.** For example, association state and `max_automatic_token_associations` come from
`/api/v1/accounts/{id}/tokens` and `/api/v1/accounts/{id}`.
Handled by: [`mirror.ts`](packages/nextjs/services/mrv/mirror.ts), `association.ts`.
Proof: live, Live smoke "Every issuance reproduces from HCS".

## Oracles and DEX

**12. Chainlink HBAR/USD and Supra HBAR/USDT (pair 75) both run on Hedera; each can go stale.** Use one as the
fallback of the other and refuse when fresh answers disagree.
Handled by: [`ResilientHbarUsdFeed`](packages/hardhat/contracts/ResilientHbarUsdFeed.sol). The addresses are in
`hydroNetworkConfig.ts`.
Proof: test, `ResilientHbarUsdFeed.test.ts` (fresh, stale, broken, disagreeing); fork, "settles at mainnet
Chainlink".

**13. The public testnet WHBAR/USDC pair prices HBAR near $2, because testnet USDC is not a dollar.** Any check of
an oracle against it fails. Seed your own testnet pair at the oracle price, or check against the mainnet pair.
Handled by: the seeded pair `0xF98D0dF4…` plus the [keeper](.github/workflows/testnet-pair-keeper.yml) that holds it
at the oracle price; the purchase builder also reads mainnet pair 0.0.1462797.
Proof: live, Live smoke "SaucerSwap pair vs oracle" and "Public mainnet WHBAR/USDC vs mainnet Chainlink".

**14. A SaucerSwap pool can lie about its own `factory()`.** Ask the factory's `getPair(token0, token1)` instead.
Handled by: `UsdSettlement.setPoolGuard`.
Proof: test, `CreditMarket.test.ts` "refuses a pool SaucerSwap did not create"; fork, the same against SaucerSwap's
mainnet factory.

**15. SaucerSwap V1 on Hedera: testnet factory 0.0.9959, router 0.0.19264; mainnet factory 0.0.1062784, router
0.0.3045981, WHBAR/USDC pair 0.0.1462797.** The router's `swapExactETHForTokens` takes `msg.value` in tinybar
from a contract.
Proof: fork, `getPair(WHBAR, USDC)` equals 0.0.1462797; live, the keeper's swaps on router 0.0.19264.

## Forking Hedera locally

**16. The Hedera forking plugin (`@hashgraph/system-contracts-forking` 0.1.2) reads every long-zero address that is
not a token as empty, SaucerSwap's contracts included.** Fork mainnet without the plugin to test against them.
**17. A plain Hardhat fork needs a hardfork history for chains 295 and 296, and Shanghai, not Cancun.** Hedera
block headers carry no blob-gas fields, so Cancun panics. Mine one local block before the first call.
**18. The plugin's HTS emulation cannot mint a token created inside the fork with a contract supply key (code 180).**
Handled by: `hardhat.config.ts` (`chains` with `shanghai: 0`) and [`MainnetFork.test.ts`](packages/hardhat/test/MainnetFork.test.ts).
Proof: fork, the Mainnet fork workflow.

## Guardian

**19. A Guardian mint is the number a policy's `mintDocumentBlock` rule reads from a document, minted by the Guardian
service with the registry's keys.** Nothing on-chain recomputes it. In a VMR0015 policy on Managed Guardian
(topic 0.0.10718470) the rule is `totalToken`, which a `customLogicBlock` copies from the approved Monitoring Report's
`emissionReductionsTotal` field.
**20. Managed Guardian refuses every `httpRequestBlock`: `ALLOWED_PROTOCOLS` is unset and a tenant cannot set it.**
A self-hosted Guardian can allow it.
Handled by: [`docs/GUARDIAN.md`](docs/GUARDIAN.md), which cites the Guardian source for both.

## Keeping this true

Add a fact when a Hedera behaviour costs you time, and add the test or workflow that proves it in the same PR. A fact
without a proof goes stale; a proof that turns red is the signal to update both.
