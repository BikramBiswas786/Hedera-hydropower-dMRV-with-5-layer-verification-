# Verra ACM0002 Digital MRV Guidebook

## Overview
This guidebook explains how the Hedera Hydropower Digital MRV tool aligns with Verra's ACM0002 methodology.

## Key Components
- **DIDs**: Decentralized Identifiers for turbines and gateways.
- **Audit Trails**: Immutable logs on Hedera Consensus Service.
- **Automated Calculations**: Baseline and emission reduction formulas implemented in code.

## Methodology Alignment
The tool implements the following ACM0002 sections:
- **Baseline Emissions**: $BE_{y} = EG_{PJ,y} 	imes EF_{grid,CM,y}$
- **Project Emissions**: Monitored and verified on-chain.
- **Leakage**: Calculated based on project boundaries.

## Verification Process
1. Data ingestion via `/telemetry`.
2. Signature verification.
3. Automated trust scoring.
4. On-chain anchoring.
