# Documentation

Read the [README](../README.md) first. This page is where to go after that.

## By task

| Task | Read | Then |
| --- | --- | --- |
| Run a local market | README quick start | `yarn demo`, then `yarn start` |
| See a rejection with no chain | README, `yarn verify` | `/verify` |
| Open the testnet proof | README, "Check it on testnet" | [evidence.md](evidence.md) |
| Deploy your own plant | README, "Deploy to Hedera testnet" | [operations.md](operations.md) |
| Check an equation | [methodology.md](methodology.md) | [standards.md](standards.md), then [contract.md](contract.md) |
| Sell an HTS token that is not a credit | README, "Use it without carbon" | [contract.md](contract.md) |
| Trace a Guardian mint | [GUARDIAN.md](GUARDIAN.md) | README ecosystem table |
| Call it from an agent | README, "For AI agents" | [agents.md](agents.md) |
| Change the code | [../AGENTS.md](../AGENTS.md) | [../HEDERA_FACTS.md](../HEDERA_FACTS.md) |
| See what the tests lock | [testing.md](testing.md) | `yarn test` |
| Watch the two-minute demo | [../README.md](../README.md) | [demo/Hydro-dMRV-demo.mp4](demo/Hydro-dMRV-demo.mp4) |

## What each file is

| File | What it is not |
| --- | --- |
| [evidence.md](evidence.md) | The address book and the Hashscan record. Not a tutorial. |
| [contract.md](contract.md) | Functions, EIP-712 types, and roles. Not the methodology prose. |
| [methodology.md](methodology.md) | Equations, the five stages, and HCS reproduction. Not a certification. |
| [standards.md](standards.md) | Which clause is implemented where. Not a claim that this is a Verra project. |
| [operations.md](operations.md) | Environment variables, scripts, and pages. Not required for the local quick start. |
| [testing.md](testing.md) | What `yarn test` and `yarn verify` pin. |
| [GUARDIAN.md](GUARDIAN.md) | The trace, the cross-check credential, and the policy patch. Guardian itself is a separate system. |
| [agents.md](agents.md) | MCP tools and the REST route for each one. |
| [../AGENTS.md](../AGENTS.md) | Rules for an editor of this repo. |
| [../HEDERA_FACTS.md](../HEDERA_FACTS.md) | Hedera behaviours that break ordinary contract code, each with the test that shows it. |

Local credits are not Verra credits. The limits are in the README and in [evidence.md](evidence.md).
