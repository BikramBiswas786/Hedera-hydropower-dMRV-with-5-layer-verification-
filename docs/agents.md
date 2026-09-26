# For AI agents

## For AI agents

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
| `verify_telemetry` | public | Full report with equation trace, HCS report message, data hash and chunk count; writes nothing |
| `get_registry_overview` | public | Totals in kg CO₂e, plants with design and ledger, tokens, both oracle sources |
| `list_attestations` | public | Attestations with monitored inputs, EG_PJ, BE, PE, LE, ER, credits and HCS anchors |
| `audit_attestation` · `reproduce_attestation` | public | Report vs chain · full reproduction from HCS including the registered design |
| `verify_guardian_evidence` | public | Guardian VP/VC chain from the mirror node and IPFS; refuses MintToken chains (double issuance) |
| `get_dex_price` · `list_open_listings` · `prepare_purchase` | public | SaucerSwap spot vs the settlement price · listings with HBAR quotes · unsigned `buy` / `buyAndRetire`. Refuses above a 3% gap |
| `get_plant` | public | One plant: design, power density, ledger, lifetime EG / BE / PE / ER / credits, coverage, credits per MWh, attestations with HCS links |
| `get_retirement_certificate` · `get_portfolio` | public | Retirement record and its NFT certificate · everything an account or a beneficiary retired, with totals |
| `submit_attestation` | bearer `MRV_API_KEY` | Verify → contract agreement check → HCS → mint. Only listed for authenticated requests |

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
