# For AI agents

Agents get the same capabilities as people, without a browser, and act with their own wallets.

**MCP** at `/api/mcp` (streamable HTTP, stateless; `@modelcontextprotocol/server` v2, serving both current and
2025-era clients):

```bash
claude mcp add --transport http hydro-dmrv https://hydro-dmrv.vercel.app/api/mcp   # or http://localhost:3000/api/mcp
```

| Tool | Access | Purpose |
| --- | --- | --- |
| `assess_project` | public | Design → applicability, PD and PE_HP rate, baseline, TOOL07 CM, TOOL03 COEF, leakage, crediting period, registration integers, designHash |
| `calculate_grid_emission_factor` | public | TOOL07 OM / BM sample group / CM from per-unit grid data |
| `get_project_design` | public | A registered design document and whether its hash matches the chain |
| `list_scenarios` · `generate_sample_telemetry` | public | Scenario catalogue, demo plants and metering, ready-to-verify monitoring data |
| `verify_telemetry` | public | Full report with equation trace, clause-cited findings, the VMR0017 / ACM0002 data and parameters table, HCS report message, data hash and chunk count; writes nothing |
| `list_methodology_engines` · `get_methodology_engine` · `verify_with_engine` | public | One engine per methodology (hydro; solar, wind and ocean): documents and on-chain module · an example period · decision, findings with the clause each enforces, and the methodology's data and parameters table |
| `get_registry_overview` | public | Totals in kg CO₂e, plants with design and ledger, tokens, both oracle sources |
| `list_attestations` · `list_issuances` | public | Monitoring records (inputs, EG_PJ, BE, PE, LE, ER, hash chain, HCS anchors, status monitored / issued / rejected) · VVB verifications and what each issued |
| `audit_attestation` · `reproduce_attestation` | public | Report vs chain · full reproduction from HCS including the registered design, meter and the record's hash-chain link |
| `get_pending_verification` | public | The run of a plant's records a VVB verifies next, each reproduced from HCS, the chain head to sign and what an approval would issue |
| `trace_guardian_mint` | public | Follows a Guardian mint (transaction id, `nft:<token>:<serial>` or `ft:<token>:<account>`) to its signed VP from the mirror node and CID-checked IPFS: `backed`, `not-backed` or `incomplete`, each check listed |
| `verify_guardian_evidence` | public | Guardian VP/VC chain from the mirror node and IPFS; refuses MintToken chains (double issuance) |
| `get_dex_price` · `list_open_listings` · `prepare_purchase` | public | SaucerSwap spot vs the settlement price · listings with HBAR quotes · unsigned `buy` / `buyAndRetire`. Refuses above a 3% gap |
| `list_checkout_listings` · `prepare_checkout_purchase` | public | `UsdCheckout` listings of any HTS token, each with its token's Guardian trace verdict · unsigned `buy`, refused (409) when the token cites a Guardian record that is not backed |
| `get_plant` | public | One plant: design, validation, power density, ledger, monitored EG / BE / PE / LE / ER, credits issued and pending, coverage, records and verifications with HCS links |
| `get_retirement_certificate` · `get_portfolio` | public | Retirement record and its NFT certificate · everything an account or a beneficiary retired, with totals |
| `compare_guardian_report` | public | Recomputes a Guardian VMR0017 monitoring report's BE, PE, LE and ER in tonnes: MATCH, MISMATCH or NOT_COMPARABLE |
| `record_monitoring` | bearer `MRV_API_KEY` | Verify → meter signature → module check → dry run → HCS → `recordMonitoring`. Issues nothing. The server key must be the plant's operator or reporter |
| `prepare_verification` | bearer `MRV_API_KEY` | For a VVB: publishes its verification report (decision, deduction, findings) and returns the EIP-712 `VerificationStatement` to sign with its own key. Refuses an approval unless every record reproduces |
| `submit_verification` | bearer `MRV_API_KEY` | Relays the VVB's signature to `verifyPeriod` after checking its role, that it is not a party, and that the statement matches the report on HCS. Approval issues credits |

The three write tools are listed only for requests that carry the bearer token. None of them signs as a VVB: the
server holds no VVB key, so an issuance always carries an outside VVB's signature.

An autonomous buyer needs no special permissions:

```
get_dex_price → list_open_listings → prepare_purchase { listingId, amountKg, beneficiary } → sign & send with its own key
→ get_retirement_certificate
```

The server never sees the agent's key. Every tool has a REST twin, listed in
[`/llms.txt`](packages/nextjs/public/llms.txt) and described in **OpenAPI 3.1** at `/api/openapi.json`: request bodies
are generated from the zod schemas that validate them, each twin's `operationId` is its tool's name, and a test fails
if a route or tool is added without the other. For coding agents working *on* the template, [`AGENTS.md`](AGENTS.md)
has the conventions and invariants.
