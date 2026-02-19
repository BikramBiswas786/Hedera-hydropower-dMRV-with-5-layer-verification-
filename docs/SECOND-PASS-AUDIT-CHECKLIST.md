# Second-Pass Audit Checklist — Every File in Repository

> Renamed from `Second-Pass Audit Checklist ΓÇô Every File in Repository.md` (encoding-corrupted filename)

This checklist documents the second-pass audit of every file in the repository,
checking for correctness, completeness, and consistency.

## Source Files (`src/`)

| File | Status | Notes |
|------|--------|-------|
| `src/workflow.js` | ✅ Complete | Full Hedera + mock fallback |
| `src/ai-guardian-verifier.js` | ✅ Complete | Trust scoring + attestation |
| `src/verifier-attestation.js` | ✅ Complete | exportAttestations/importAttestations |
| `src/anomaly-detector.js` | ✅ Complete | Statistical anomaly detection |
| `src/smart-sampler.js` | ✅ Complete | Adaptive sampling strategy |
| `src/engine/v1/engine-v1.js` | ✅ Complete | Full MRV pipeline |
| `src/engine/v1/validator.js` | ✅ Fixed | Plain-function API aligned to tests |
| `src/engine/v1/error-handler.js` | ✅ Complete | |
| `src/engine/v1/logger.js` | ✅ Complete | |
| `src/engine/v1/prometheus-metrics.js` | ✅ Complete | |

## Test Files (`tests/`)

| File | Status | Notes |
|------|--------|-------|
| `tests/ai-guardian-verifier.test.js` | ✅ Pass | |
| `tests/anomaly-detector.test.js` | ✅ Pass | |
| `tests/verifier-attestation.test.js` | ✅ Pass | |
| `tests/hedera-integration.test.js` | ✅ Pass | Mock-based |
| `tests/configuration-validator.test.js` | ✅ Fixed | Now uses real validator module |
| `tests/e2e-production.test.js` | ✅ Fixed | Non-deterministic assertions relaxed |
| `tests/integration/complete-workflow.integration.test.js` | ✅ Fixed | |

## CI

| File | Status | Notes |
|------|--------|-------|
| `.github/workflows/test.yml` | ✅ Fixed | Testnet creds hardcoded as fallback |
