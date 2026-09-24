# Hardhat package

`HydroREC`, its HTS helper library, deploy scripts and tests. The root [README](../../README.md) explains the
system; this file covers working inside the package. Run commands from the repo root with the `hardhat:` prefix, or
from this folder without it.

## Contracts

| File | Purpose |
| --- | --- |
| `contracts/HydroREC.sol` | Plant registry, attestations, HTS REC issuance, custody, USD-priced marketplace, retirement |
| `contracts/lib/HederaTokenLib.sol` | Create / mint / burn / transfer through the HTS system contract at `0x167`, reverting on non-`SUCCESS` codes |
| `contracts/interfaces/` | The subset of `IHederaTokenService` used, and Chainlink's `AggregatorV3Interface` |
| `contracts/mocks/` | `MockHederaTokenService` (installed at `0x167` on local chains and in tests) and `MockV3Aggregator` |

## Local chain

```bash
yarn chain:offline                  # plain Hardhat node, no internet needed
yarn chain                          # Hedera-forked node (HEDERA_FORKING=true) with real HTS emulation
yarn deploy --network localhost     # terminal 2
```

`deploy/00_deploy_hydro_rec.ts` deploys a `MockV3Aggregator` on local networks and installs the HTS mock only when
nothing already lives at `0x167`, so it works with either node. `deploy/01_setup_hydro_rec.ts` is idempotent: it
creates the HTS token, grants `VERIFIER_ROLE` to `VERIFIER_ADDRESS` if set, and registers the demo plant. Every deploy
regenerates `packages/nextjs/contracts/deployedContracts.ts`.

## Tests

```bash
yarn hardhat:test          # hermetic: HTS mock at 0x167, mock Chainlink feed
yarn hardhat:test:fork     # same suite with the Hedera forking plugin (needs internet); mock-only checks skip
yarn hardhat:test:gas      # with gas report
```

## Hedera testnet / mainnet

```bash
yarn hardhat:account:import           # or :generate; stored encrypted in packages/hardhat/.env
yarn deploy --network hederaTestnet   # or hederaMainnet
```

The deployer needs HBAR for gas plus the token-creation fee (`REC_TOKEN_CREATE_FEE_HBAR`, default 20). Use an
**ECDSA** account so its EVM address can also act as the verifier. Hashscan links are printed for each transaction.

Verify on Sourcify (Hashscan reads it):

```bash
yarn hardhat:verify --network hederaTestnet <HydroREC address> <admin> <feed> 100000000 9000 90000
```

The constructor arguments are the admin, the Chainlink feed, `NATIVE_UNITS_PER_HBAR` (1e8 on Hedera), the minimum
trust score in basis points and the oracle staleness bound in seconds, matching `deploy/00_deploy_hydro_rec.ts`.
