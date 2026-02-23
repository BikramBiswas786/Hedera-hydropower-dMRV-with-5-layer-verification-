# Independent Verification Guide

Anyone can verify all claims in this repository in under 5 minutes using only 3 commands — no special tools, no accounts required.

---

## What This Repo Proves

This project is a production-grade Measurement, Reporting and Verification (MRV) system for hydropower renewable energy certificates (RECs) built on Hedera Hashgraph.

### Claims You Can Independently Verify

| No. | Claim | How to Verify |
|-----|-------|---------------|
| 1 | 259 unit and integration tests all pass | `npm test` |
| 2 | Physics-based telemetry fraud detection works | `tests/anomaly-detector.test.js` |
| 3 | AI trust scoring (0–100%) correctly classifies readings | `tests/verifier-attestation.test.js` |
| 4 | Attestations are cryptographically signed and verifiable | `tests/verifier-attestation.test.js` |
| 5 | Full MRV pipeline runs on real Hedera testnet | `tests/e2e-production.test.js` |
| 6 | 1000 readings processed in under 60 seconds | `tests/complete-workflow.test.js` |
| 7 | Hedera DID, HCS topic, and HTS token creation works live | `tests/complete-workflow.test.js` |
| 8 | ACM0002 baseline emissions calculations are correct | `tests/verifier-attestation.test.js` |

---

## Quick Start — 3 Commands

### Prerequisites

- Node.js 18 or higher installed (https://nodejs.org)
- Internet connection (for live Hedera testnet calls)

### Step 1 — Clone

```
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
```

### Step 2 — Install

```
npm install
```

### Step 3 — Run All Tests

```
npm test
```

### Expected Output

```
Test Suites:  17 passed, 17 total
Tests:       259 passed, 259 total
Snapshots:    0 total
Time:        ~3s
```

All 224 tests pass. Zero failures.

---

## Run Individual Suites

You can verify each claim independently by running the corresponding test file:

```
# Physics fraud detection
npx jest tests/anomaly-detector.test.js --runInBand

# AI trust scoring engine
npx jest tests/verifier-attestation.test.js --runInBand

# Cryptographic attestations
npx jest tests/verifier-attestation.test.js --runInBand

# MRV engine (EngineV1 full pipeline)
npx jest tests/engine-v1.test.js --runInBand

# Hedera DID, HCS, and HTS (mocked)
npx jest tests/hedera-integration.test.js --runInBand

# Configuration and schema validation
npx jest tests/configuration-validator.test.js --runInBand

# Complete workflow (real Hedera testnet)
npx jest tests/complete-workflow.test.js --runInBand

# Production E2E (real Hedera testnet, full pipeline)
npx jest tests/e2e-production.test.js --runInBand
```

---

## Live Hedera Testnet Verification

The E2E and workflow tests run against the real Hedera testnet using pre-funded test credentials included in the .env file.

During `npm test` you will see live transaction IDs similar to:

```
Transaction ID:  0.0.6255927@1771366336.586176805
DID:             did:hedera:testnet:z485944524f2d54555242494e452d31
Token ID:        0.0.7964070
Topic ID:        0.0.7964069
```

### Verify Transactions on Hedera Explorer

Paste any transaction ID into the Hedera explorer:

```
https://hashscan.io/testnet/transaction/<transactionId>
```

Example:

```
https://hashscan.io/testnet/transaction/0.0.6255927@1771366336.586176805
```

---

## Architecture Overview

The system processes telemetry data through four sequential stages:

```
Telemetry Input
      |
      v
AnomalyDetector  (src/anomaly-detector.js)
  - Physics checks
  - Temporal checks
  - Environmental checks
  - Statistical checks
      |
      v
AIGuardianVerifier  (src/ai-guardian-verifier.js)
  - Trust Score: 0 to 100%
  - Decision: APPROVED / FLAGGED / REJECTED
      |
      v
VerifierAttestation  (src/verifier-attestation.js)
  - Cryptographic signing
  - ACM0002 baseline calculations
  - REC issuance
      |
      v
Hedera Hashgraph
  - HCS Topic:    immutable audit log
  - HTS Token:    REC token minting
  - DID Registry: device identity
```

---

## Test Coverage Summary

| Test Suite                       | Tests | What It Covers                                                |
|----------------------------------|-------|---------------------------------------------------------------|
| anomaly-detector.test.js         | 22    | Physics, temporal, environmental, statistical fraud detection |
| unit/anomaly-detector.test.js    | 21    | Same module, isolated unit scope                              |
| ai-guardian-verifier.test.js     | 27    | Trust scoring, auto-approval thresholds, batch processing     |
| verifier-attestation.test.js     | 22    | Cryptographic signing, ACM0002 calculations, export/import    |
| engine-v1.test.js                | 7     | EngineV1 full verification pipeline                           |
| hedera-integration.test.js       | 56    | HCS topics, HTS tokens, transactions, accounts, errors        |
| configuration-validator.test.js  | 50    | Config, reading, and environment schema validation            |
| complete-workflow.test.js        | 18    | Real Hedera testnet, full workflow, 1000-reading performance  |
| e2e-production.test.js           | 11    | Production E2E: DID to REC to telemetry to audit trail        |
| Total                            | 224   | All passing                                                   |

---

## Security Notes for Reviewers

- The .env file contains Hedera testnet credentials only — no mainnet keys.
- Testnet HBAR has no monetary value.
- Private keys in .env are for a dedicated test account created solely for this demo.
- For production deployment, replace with environment-injected secrets or an HSM solution.

---

## Contact

- GitHub: https://github.com/BikramBiswas786
- Repository: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv

Last verified: February 2026 — 9 suites, 224 tests, 0 failures.
