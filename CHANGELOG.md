## [1.6.1] - 2026-02-23

### Added
- Multi-tenancy middleware (x-tenant-id header, org isolation)
- ML Forecasting Engine (linear + seasonal carbon credit projection)
- Solar adapter (irradiance-based physics validation)
- Wind adapter (Betz limit, cut-in/cut-out enforcement)
- Biomass adapter (fuel-type emission factors, thermodynamic limits)
- Hydropower adapter (ACM0002 v18.0 wrapper)
- Unified adapter registry for all 4 energy types

# Changelog

All notable changes to this project are documented here.

---

## [Unreleased]

---

## [1.3.0] â€” 2026-02-23

### Added
- `src/hedera/retry.js` â€” executeWithRetry helper: fresh TX per attempt, eliminates TRANSACTION_EXPIRED on retry
- `src/db/plants.js` â€” PlantRepository backed by PostgreSQL with in-memory fallback
- `src/middleware/validate.js` â€” plantCreateRules via express-validator (capacity_mw min 0, max 10000)
- `src/middleware/auth.js` wired into server.js â€” JWT/RBAC on all write endpoints; API-Key for IoT telemetry
- POST /api/auth/login and GET /api/auth/demo-token endpoints
- Docker validation CI job: docker compose config + docker build + container smoke test
- scripts/test-onchain.js â€” on-chain sanity script moved from root
- tests/hedera-retry.test.js â€” 4 tests: fresh TX per retry, fail-fast on non-expiry errors
- test/ml/accuracy-benchmark.test.js â€” ML accuracy benchmark asserting >= 85% on 500 labeled samples
- docs/deleted/ and docs/archived/ â€” 18 redundant files consolidated out of root

### Fixed
- TRANSACTION_EXPIRED: mintRECs and topic submit now call buildTxFn() fresh each retry attempt
- CI: Node 18 removed from matrix (React Native / Metro require >= 20.19.4)
- CI: accuracy-benchmark.test.js rewritten from Mocha/Chai to Jest
- CI: Hedera SDK mock missing setMaxTransactionFee, setTransactionValidDuration, setRegenerateTransactionId
- CI: undefined === undefined caused all errors to be retried in mock env
- plants.js require path: ../../../src/middleware/validate corrected to ../../middleware/validate
- .env.backup, .env.old, .env.production removed from git tracking

### Improved
- /api/features docker_deployment.tested set to true (CI proves it)
- /api/features ml_fraud_detection.accuracy corrected to 87%+ (measured, was unverifiable 98.3%)
- README test count updated to 288+ and accuracy claim aligned with benchmark
- plants[] in-memory array fully replaced by PlantRepository
- Rate limiting, HTTPS (Vercel), and input validation all production-wired

### Added
- `src/storage/InMemoryAttestationStore.js` â€” pluggable persistence layer with PostgreSQL-compatible interface
- `src/api/server.js` â€” minimal REST API (health, telemetry, attestations endpoints)
- `src/config/default-config.js` â€” centralised configuration with environment variable overrides
- `docs/api/API-REFERENCE.md` â€” full API documentation
- `docs/deployment/DEPLOYMENT-GUIDE.md` â€” local and production deployment instructions
- `docs/deployment/PRODUCTION-CHECKLIST.md` â€” phase-by-phase production readiness tracker
- `CHANGELOG.md` â€” this file

---

## [1.1.0] â€” 2026-02-19

### Fixed
- Corrected Hedera HCS transaction construction order: `construct â†’ setTopicId â†’ setMessage â†’ freezeWith â†’ sign â†’ execute`
- Removed all hardcoded Hedera account IDs and private keys from source files
- Added `.gitignore` to exclude `.env` and `node_modules/`

### Improved
- Added `try-catch` error handling to all critical Hedera network operations
- Cleaned `package.json` â€” removed unnecessary/bloated dependencies
- Removed duplicate and backup files from root directory
- Reorganised repository: `src/`, `tests/`, `docs/`, `evidence/`, `.github/`

---

## [1.0.0] â€” 2026-02-18

### Added
- 224 unit, integration, and E2E tests across 9 suites â€” all passing
- Live Hedera testnet proof: approved TX, rejected TX, HREC token, HCS audit topic
- Evidence bundle: `evidence/EVIDENCE.md`, `evidence/HASHSCAN-LINKS.md`, raw Jest output
- GitHub Actions CI workflow
- Documentation: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/MRV-METHODOLOGY.md`
- `README.md` with HashScan verification links and quick-start guide
- `VERIFY.md` and `VERIFICATION_GUIDE.md` for independent verification
- `LICENSE` (MIT)

