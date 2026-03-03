# Testing Guide

**Last reviewed**: March 4, 2026

---

## Test Suite Overview

| Suite | Count | What it tests |
|---|---|---|
| Unit | 150 | Engine layers, ACM0002 maths, trust score algorithm |
| Integration | 50 | Workflow orchestration, Hedera SDK (mocked) |
| Edge cases | 24 | Invalid telemetry, network failures, boundary conditions |
| API | 7 | REST endpoints, auth, rate limiting |
| Audit | 6 | See PS1–PS6 below |
| **Total** | **237** | |

---

## Running the Unit/Integration Suite

```bash
# All tests
npm test

# With coverage report
npm run test:coverage

# Watch mode (development)
npm run test:watch
```

**Expected output**:
```
Test Suites: 12 passed, 12 total
Tests:       237 passed, 237 total
Coverage:    85.3% statements | 82.7% branches | 88.9% functions
Time:        ~18s
```

A coverage drop below 80% on any metric is treated as a regression and must be investigated before merging.

---

## Production Test Suite (PS1–PS6)

PS1–PS6 are end-to-end tests against a running API server. They test the full pipeline including Hedera transactions and Redis-backed replay protection.

**Prerequisite**: API server must be running (`npm run api`) and Redis must be available.

```powershell
powershell -ExecutionPolicy Bypass -File .\RUN_TESTS.ps1
```

### Test Descriptions

| Test | Scenario | Expected result |
|---|---|---|
| **PS1** | Valid reading with correct physics and water quality | Status: APPROVED, trust_score > 0.90 |
| **PS2** | Inflated generation (50× physics violation) | Status: FLAGGED, trust_score < 0.70, PHYSICS_VIOLATION flag |
| **PS3** | Environmental violations (pH 4.5, turbidity 180 NTU) | Status: FLAGGED, environmental_check: FAIL |
| **PS4** | Impossible reading (flowRate=0, generatedKwh=500) | HTTP 400 Bad Request |
| **PS5** | Same valid reading from two different plants | Two distinct Hedera transaction IDs |
| **PS6** | Same reading submitted twice (identical timestamp) | First: APPROVED; Second: HTTP 409 Conflict |

### Interpreting Results

- A **PASS** on all six tests confirms the API, verification engine, Hedera integration, and Redis replay protection are all functioning correctly end-to-end.
- A failure on PS1–PS3 indicates a problem with the verification engine or Hedera SDK.
- A failure on PS4 indicates the input validation middleware is not enforcing physics constraints.
- A failure on PS5 is unexpected if Hedera is healthy (transaction IDs are always unique).
- A failure on PS6 (second request not blocked) indicates Redis is unavailable or replay protection is misconfigured.

---

## CI/CD

GitHub Actions runs the unit/integration suite automatically on every push and pull request. See `.github/workflows/test.yml`.

The PS1–PS6 suite is not run in CI because it requires a live Hedera connection and a running API server. Run it manually before every production deployment.

---

## Writing New Tests

- Unit tests for engine logic go in `tests/unit/`.
- Integration tests for the full workflow go in `tests/integration/`.
- Use Jest's mock system for Hedera SDK calls in unit and integration tests. Do not make real Hedera transactions in automated tests.
- Every new API endpoint must have at least one success test and one error test.
- Every new verification layer must have a unit test for each confidence tier.
