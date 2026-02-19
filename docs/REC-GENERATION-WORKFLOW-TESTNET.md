# REC Generation Workflow — Complete Testnet Guide

> Renamed from `REC Generation Workflow ΓÇô Complete Testnet Guide.md` (encoding-corrupted filename)

This document covers the end-to-end REC generation workflow on Hedera Testnet.
See [`REC-GENERATION-WORKFLOW-EXECUTION.md`](./REC-GENERATION-WORKFLOW-EXECUTION.md) for the full execution log.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in your testnet credentials
npx jest --runInBand
```

## Workflow Steps
1. `workflow.initialize()` — connect to Hedera Testnet, create audit topic
2. `workflow.deployDeviceDID()` — register device identity on HCS
3. `workflow.createRECToken()` — mint HTS token for RECs
4. `workflow.submitReading()` — submit telemetry → AI verification → HCS anchoring
5. `workflow.mintRECs()` — issue RECs based on verified generation
6. `workflow.generateMonitoringReport()` — produce ACM0002-compliant report

## Related Docs
- [Architecture](./ARCHITECTURE.md)
- [ACM0002 Alignment Matrix](./ACM0002-ALIGNMENT-MATRIX.md)
- [Pilot Deployment Plan](./PILOT-DEPLOYMENT-IMPLEMENTATION-GUIDE.md)
