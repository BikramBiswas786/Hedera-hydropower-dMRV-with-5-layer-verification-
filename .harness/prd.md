# Hydro dMRV

## Problem
Carbon credits for small hydropower are quantified in spreadsheets and checked at annual site audits. Buyers cannot
check the monitoring data or the arithmetic behind a credit, double counting is hard to rule out, and settlement is
manual. Existing digitisations often skip parts of the methodology (project emissions, leakage, the grid emission
factor calculation).

## What the template must do
1. **Assess** a project design against CDM AMS-I.D (≤ 15 MW) or ACM0002: applicability, the reservoir power-density
   rule, the baseline for greenfield / retrofit / capacity-addition plants, the TOOL07 combined margin, the TOOL03
   fuel coefficient, leakage and the crediting period. Output the integers the contract registers.
2. **Verify** a monitoring period in five stages: applicability, data QA/QC (replays, gaps, main/check meters,
   delayed calibration), physical cross-checks (nameplate, ρ·g·Q·H·η_max, export ≤ generation), quantification
   (ER = BE − PE − LE with conservative rounding) and environmental safeguards. Decision APPROVED / FLAGGED /
   REJECTED. Works in the browser with no wallet.
3. **Anchor** approved periods on an HCS topic as two messages: the raw readings with plant profile, metering and
   ledger (chunked), then the report committing to them. The SHA-256 of the report is the on-chain `reportHash`.
4. **Issue** credits through `HydroCreditRegistry`, which stores the validated design, recomputes EG_PJ, BE, PE_HP,
   PE_FF, LE and ER from the monitored inputs, carries remainders and deficits, and mints an HTS token
   (1 token = 1 t CO2e).
5. **Trade and retire**: sellers list credits in USD per tonne; buyers pay HBAR converted by `ResilientHbarUsdFeed`
   (Chainlink with a Supra fallback, refusing to price when fresh sources disagree). Retiring burns the HTS tokens,
   records the beneficiary and mints an HTS NFT certificate.
6. **Reproduce**: anyone can fetch both HCS messages from the mirror node, check the hashes, confirm the registered
   design was used, re-run the engine and confirm every on-chain figure follows from public data.
7. **Agent access**: an MCP server at `/api/mcp` and JSON endpoints under `/api` expose the same capabilities;
   purchases are returned unsigned so agents pay from their own wallets.

## Out of scope
Real SCADA ingestion, device-level signatures, VVB workflow and registry (Verra / Gold Standard) integration, TOOL07
option B / dispatch-data / ex-post OM, integrated hydro projects. The README lists these as extension points.
