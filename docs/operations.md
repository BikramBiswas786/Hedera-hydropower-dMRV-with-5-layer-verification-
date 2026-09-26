# Operations

## Environment variables

Nothing is required to browse the app or use the engine. Copy the `.env.example` next to each package.

`packages/nextjs/.env.local`

| Variable | Required for | Notes |
| --- | --- | --- |
| `HEDERA_OPERATOR_ID` | publishing | Account that signs and pays for HCS messages. |
| `HEDERA_OPERATOR_KEY` | publishing | Hex or DER. If ECDSA, it is also the verifier's EVM key. |
| `HCS_TOPIC_ID` | publishing | Created by `yarn mrv:create-topic`; the operator key is its submit key. |
| `MRV_API_KEY` | publishing | Bearer token for `POST /api/mrv/attest` and the MCP `submit_attestation` tool. Unset disables writes. |
| `VERIFIER_PRIVATE_KEY` | optional | Overrides the verifier EVM key (ED25519 operators, local chains). |
| `BRIDGE_ED25519_PRIVATE_KEY` / `BRIDGE_DID` | Guardian bridge | Ed25519 key and its published `did:hedera` DID (`yarn guardian:publish-did`). The cross-check route answers 503 until both are set and match. |
| `GUARDIAN_BRIDGE_API_KEY` | Guardian bridge | Bearer token the policy's httpRequestBlock sends. |
| `GUARDIAN_BRIDGE_RESULT_SCHEMA` | Guardian bridge | JSON `{type, contextUrl}` of the imported "DMRV Cross-Check Result" schema, or a map by policyId. |
| `GUARDIAN_EVIDENCE_TOPIC_IDS` / `GUARDIAN_MIRROR_NODE_URL` / `GUARDIAN_IPFS_GATEWAY` | optional | Evidence verifier defaults. |
| `FILEBASE_IPFS_RPC_TOKEN` | bridge DID script | Only for `yarn guardian:publish-did --send`, which pins the DID document. |
| `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL` / `…MAINNET…` | optional | JSON-RPC relay; defaults to Hashio. |
| `NEXT_PUBLIC_MIRROR_NODE_URL` | optional | Defaults to the public mirror node of the first target network. |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | optional | Your WalletConnect project id for production. |

`packages/hardhat/.env`

| Variable | Notes |
| --- | --- |
| `DEPLOYER_PRIVATE_KEY_ENCRYPTED` | Written by `yarn hardhat:account:import` / `:generate`. |
| `VERIFIER_ADDRESS` | The attesting server's address: gets `VERIFIER_ROLE`, and the deployer loses it. |
| `ADMIN_ADDRESS` | Admin after setup (EVM address or `0.0.<num>`, ideally a threshold-key account): gets `DEFAULT_ADMIN_ROLE`, and the deployer renounces it. |
| `PLANT_OPERATOR_ADDRESS` | Receives the demo plants' credits; defaults to the deployer. |
| `CREDIT_TOKEN_CREATE_FEE_HBAR` · `CERTIFICATE_TOKEN_CREATE_FEE_HBAR` | HBAR sent to cover each HTS creation fee (default 20). Unused change can be swept. |
| `MAX_PRICE_AGE_SECONDS` | Oracle staleness bound for each source and for settlement (default 90000 = 25 h). |
| `MAX_ORACLE_DEVIATION_BPS` | How far fresh Chainlink and Supra answers may disagree (default 300 = 3%). |

## Walkthrough

| Page | What you can do |
| --- | --- |
| **Home** `/` | The flow, live registry totals in t CO₂e, and how to connect an agent over MCP. |
| **Methodology** `/methodology` | The equations, QA/QC rules, the TOOL07 calculation on the demo grid unit by unit (EF_EL, option A1/A2, BM sample), each demo plant's assessment and the exact integers registered on-chain. |
| **Verify** `/verify` | Pick a plant and a scenario, or edit the JSON (readings, meter calibration, even the plant design). The report updates as you type: decision, five stages, ER / BE / PE / LE, an equation trace, QA/QC deductions and every finding. When the registry is deployed it quantifies against the plant's on-chain ledger. It previews the exact HCS report and data hash; operators can publish with the API key. |
| **Market** `/market` | Both oracle sources, which one is pricing, and whether purchases are paused. Your custody balance and proceeds; list credits in USD per tonne; buy, or buy and retire in one transaction; associate the HTS token (HIP-719) and withdraw to your wallet. |
| **Plants** `/plants`, `/plants/{id}` | Every registered plant; per plant the registered design (capacity, reservoir and power density, TOOL07 grid factor, TOOL03 COEF, baseline, crediting period, design hash), the on-chain ledger (crediting year, carried balance) and every attestation with BE, PE, ER, credits, coverage and links to its HCS report and reproduction. Rendered on the server from the same reads as the API. |
| **Portfolio** `/portfolio` | Everything an account retired, or anyone retired on behalf of a company, with totals, NFT certificates and a **CSV export** for a GHG inventory or ESG report (beneficiary names are formula-escaped). |
| **Audit** `/audit` | Every attestation with EG_PJ, ER, credits and its HCS link. **Check evidence** runs the full reproduction in your browser. Retirements link to their certificates. |
| **Certificate** `/certificate/{id}` | A printable retirement certificate in t CO₂e backed by on-chain data, with its NFT serial and Hashscan link. If the NFT could not be delivered at retirement, associate and claim it here. |
| **Debug** `/debug` | Scaffold-HBAR's contract console for every function, including `quantify` to preview an attestation. |

## Project structure

```
packages/
├── hardhat/
│   ├── contracts/
│   │   ├── HydroCreditRegistry.sol      registration, on-chain quantification, credits, market, retirement, NFTs
│   │   ├── ResilientHbarUsdFeed.sol     Chainlink + Supra aggregator behind AggregatorV3Interface
│   │   ├── lib/HederaTokenLib.sol       HTS create / mint / burn / transfer for tokens and NFTs
│   │   ├── interfaces/                  IHederaTokenService subset, Chainlink and Supra interfaces
│   │   └── mocks/                       HTS (tokens + NFTs + association), Chainlink, Supra
│   ├── deploy/                          00 oracles + contracts · 01 idempotent setup (tokens, roles, demo plants)
│   ├── utils/                           per-network config · demoPlants.ts (generated registration integers)
│   └── test/                            registry, oracle, fixtures/quantificationVectors.ts
└── nextjs/
    ├── app/
    │   ├── methodology/ verify/ market/ audit/ certificate/[id]/   pages; client components in _components/
    │   └── api/                         methodology/* · mrv/* · registry/* · market/* · mcp
    ├── services/mrv/
    │   ├── methodology/                 fuels (IPCC) · tool07 · tool03 · project · quantify · schema · document
    │   ├── engine.ts  schema.ts         5-stage verification and QA/QC
    │   ├── demo.ts  scenarios.ts        illustrative grid, demo designs and plants, deterministic scenarios
    │   ├── report.ts  pipeline.ts       HCS data, report and project messages
    │   ├── mirror.ts  audit.ts          mirror-node reads, audit and reproduction
    │   ├── pricing.ts  views.ts  network.ts
    │   └── server/                      HCS publishing, registry reads, attestation, methodology, market, MCP, auth
    ├── scripts/mrv.ts                   yarn mrv:create-topic · mrv:attest [scenario] [plant] · mrv:meter-key · mrv:sign
    └── public/llms.txt
.harness/                                Hedera Harness spec, PRD, validators, acceptance contract
template.json                            create-scaffold-hbar manifest
```

## Extending the template

- **Your plant.** Write its `ProjectDesign` (capacity, reservoir areas, history for retrofits, fuel, crediting period,
  and either your grid's per-unit data for TOOL07 or a DNA-published combined margin), run `assess_project` or
  `POST /api/methodology/assess`, and register the returned integers and `designHash` with `registerPlant`. Serve or
  publish the design document so anyone can check the hash.
- **Real monitoring data.** Post your logger's readings to `POST /api/mrv/attest` on a schedule, with your plant
  profile and metering data (accuracy classes, calibration dates). Keep batches under the 20-chunk limit (about a
  week of hourly data).
- **More of the methodology.** TOOL07 option B, dispatch-data and ex-post OM, imports and off-grid plants, integrated
  hydro projects, battery storage, TOOL05 for grid electricity consumed by the project. Add them in `methodology/`
  with hand-checked tests; mirror anything that changes issued quantities in the contract and the shared vectors.
- **Another oracle.** Implement `AggregatorV3Interface`, or change the providers behind `ResilientHbarUsdFeed`.
- **Mainnet.** Put `chains.hedera` first in `scaffold.config.ts` and deploy with `--network hederaMainnet`.

## Security model and limitations

- **The verifier cannot hide its work, or mint beyond what the registered meter signed.** Readings, reports and
  hashes are public, the engine is deterministic, and the contract only accepts figures at least as conservative as
  that statement. This does not hold for the demo plants: their meter keys are `keccak256("hydro-dmrv demo meter " +
  plant id)` and are registered on the public testnet deployment, so a verifier key can sign any period for them up
  to the nameplate. A production plant needs a key that never leaves the logger. The other trust is registration:
  an admin chooses the meter, so hold `DEFAULT_ADMIN_ROLE` in a threshold-key account and have a VVB validate the
  design and the meter before `registerPlant`. The setup script refuses demo plants on Hedera mainnet, including when
  `REGISTER_DEMO_PLANTS=true`. It also refuses a mainnet deploy that leaves both roles on the deployer.
- **Nobody shares a private key.** Buyers and agents sign with their own wallets (`prepare_purchase` returns unsigned
  transactions); the public deployment holds no server keys; the burner wallet is offered only on a local chain.
- **Public API.** Read and verify endpoints are unauthenticated and bounded by input limits (2 000 readings per
  batch); put a rate limit in front of a public deployment (e.g. a Vercel Firewall rule on `/api/*`).
- **Not a certification.** This implements the equations of VMR0017 v1.0 with ACM0002 v22.0, AMS-I.D, VT0011,
  TOOL07 and TOOL03 as described above. It records VT0008 additionality evidence and checks it for completeness, but the
  determination, stakeholder consultation, the monitoring plan and verification remain the job of a VVB and a
  registry (Verra, Gold Standard).
- **Grid factor scope.** VT0011 and TOOL07 are implemented ex-ante with option A per-unit data and the simple,
  simple adjusted or average OM; the dispatch-data OM, option B, ex-post vintages and the annual BM update (VT0011
  ¶72 option 2) are not. Register a published combined margin (`grid.source: "published"`) for those.
  VMR0017's battery, pumped-storage and fire-suppression emission terms are not implemented (plain hydro does not
  need them). Credits here are not issued by a standard; avoid double claiming with RECs or any
  other instrument for the same generation.
- **Registry custody** means the contract holds credits and undelivered certificates for accounts. The contract is not
  upgradeable and has no admin path to move anyone's balance.
- **Oracle risk** is bounded by two independent providers, a deviation guard, staleness checks and the
  seller-favouring round-up. Tune `MAX_PRICE_AGE_SECONDS` and `MAX_ORACLE_DEVIATION_BPS` to the feeds' heartbeats.
  The template's purchase builder also refuses when the SaucerSwap V1 WHBAR/USDC spot (mainnet pair `0.0.1462797`)
  is more than 3% from that settlement price. The registry contract does not read the pool, so a caller who skips
  `prepare_purchase` is not covered by the DEX check.
- **Write endpoints** are disabled unless `MRV_API_KEY` is set and use a constant-time comparison. Put them behind
  your own authentication before exposing them publicly. Purchases never touch the server: agents sign their own.
- **Not audited.** This is a starting point, not production-ready code.
