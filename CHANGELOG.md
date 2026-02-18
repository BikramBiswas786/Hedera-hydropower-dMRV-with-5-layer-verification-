# Changelog

All notable changes to this project are documented here.

---

## [Unreleased]

### Added
- `src/storage/InMemoryAttestationStore.js` — pluggable persistence layer with PostgreSQL-compatible interface
- `src/api/server.js` — minimal REST API (health, telemetry, attestations endpoints)
- `src/config/default-config.js` — centralised configuration with environment variable overrides
- `docs/api/API-REFERENCE.md` — full API documentation
- `docs/deployment/DEPLOYMENT-GUIDE.md` — local and production deployment instructions
- `docs/deployment/PRODUCTION-CHECKLIST.md` — phase-by-phase production readiness tracker
- `CHANGELOG.md` — this file

---

## [1.1.0] — 2026-02-19

### Fixed
- Corrected Hedera HCS transaction construction order: `construct → setTopicId → setMessage → freezeWith → sign → execute`
- Removed all hardcoded Hedera account IDs and private keys from source files
- Added `.gitignore` to exclude `.env` and `node_modules/`

### Improved
- Added `try-catch` error handling to all critical Hedera network operations
- Cleaned `package.json` — removed unnecessary/bloated dependencies
- Removed duplicate and backup files from root directory
- Reorganised repository: `src/`, `tests/`, `docs/`, `evidence/`, `.github/`

---

## [1.0.0] — 2026-02-18

### Added
- 224 unit, integration, and E2E tests across 9 suites — all passing
- Live Hedera testnet proof: approved TX, rejected TX, HREC token, HCS audit topic
- Evidence bundle: `evidence/EVIDENCE.md`, `evidence/HASHSCAN-LINKS.md`, raw Jest output
- GitHub Actions CI workflow
- Documentation: `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/MRV-METHODOLOGY.md`
- `README.md` with HashScan verification links and quick-start guide
- `VERIFY.md` and `VERIFICATION_GUIDE.md` for independent verification
- `LICENSE` (MIT)
