# Hydro dMRV

## Problem
Renewable energy certificates (RECs) for small hydropower are issued from spreadsheets and annual site audits.
Buyers cannot check the underlying generation, double counting is hard to rule out, and settlement is manual.

## What the template must do
1. **Verify** a batch of interval readings (flow, head, energy, water quality) with five independent layers:
   physics (ρ·g·Q·H·η), temporal continuity, environmental bounds, statistical outliers, device envelope.
   Produce a trust score and an APPROVED / FLAGGED / REJECTED decision. Works in the browser with no wallet.
2. **Anchor** approved batches on an HCS topic as two messages: the raw readings with the plant profile (chunked),
   then the report committing to them. The SHA-256 of the report is the on-chain `reportHash`.
3. **Issue** RECs through the `HydroREC` contract, which creates an HTS token (1 token = 1 MWh) and independently
   enforces the plant's nameplate capacity, non-overlapping periods and a minimum trust score.
4. **Trade and retire**: sellers list RECs in USD/MWh; buyers pay HBAR converted by `ResilientHbarUsdFeed`, which
   uses Chainlink HBAR/USD, falls back to Supra, and refuses to price when fresh sources disagree. Retiring burns the
   HTS tokens, records the beneficiary and mints an HTS NFT certificate (claimable if the wallet cannot receive it).
5. **Reproduce**: anyone can fetch both HCS messages from the mirror node, check the hashes, re-run the engine and
   confirm the on-chain verdict follows from the public data.
6. **Agent access**: an MCP server at `/api/mcp` and JSON endpoints under `/api` expose the same capabilities;
   purchases are returned unsigned so agents pay from their own wallets.

## Out of scope
Real SCADA ingestion, device-level signatures, registry standards body integration (I-REC / Verra) and a
production oracle for river flow. The README lists these as extension points.
