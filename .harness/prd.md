# Hydro dMRV

## Problem
Renewable energy certificates (RECs) for small hydropower are issued from spreadsheets and annual site audits.
Buyers cannot check the underlying generation, double counting is hard to rule out, and settlement is manual.

## What the template must do
1. **Verify** a batch of interval readings (flow, head, energy, water quality) with five independent layers:
   physics (ρ·g·Q·H·η), temporal continuity, environmental bounds, statistical outliers, device envelope.
   Produce a trust score and an APPROVED / FLAGGED / REJECTED decision. Works in the browser with no wallet.
2. **Anchor** approved reports on an HCS topic; the SHA-256 of the message is the on-chain `reportHash`.
3. **Issue** RECs through the `HydroREC` contract, which creates an HTS token (1 token = 1 MWh) and independently
   enforces the plant's nameplate capacity, non-overlapping periods and a minimum trust score.
4. **Trade and retire**: sellers list RECs in USD/MWh; buyers pay HBAR converted with the Chainlink HBAR/USD feed
   (stale answers rejected). Retiring burns the HTS tokens and records the beneficiary.
5. **Audit**: anyone can fetch the HCS message from the mirror node and prove it matches the attestation.
6. **Agent access**: an MCP server at `/api/mcp` and JSON endpoints under `/api` expose the same capabilities.

## Out of scope
Real SCADA ingestion, device-level signatures, registry standards body integration (I-REC / Verra) and a
production oracle for river flow. The README lists these as extension points.
