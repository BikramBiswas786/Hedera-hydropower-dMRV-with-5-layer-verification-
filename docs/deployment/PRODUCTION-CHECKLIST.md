# Production Readiness Checklist

## Current Status: PoC → Production Path

| Item | Status | Notes |
|------|--------|-------|
| Core verification logic | ✅ Done | Physics, temporal, environmental, statistical |
| Unit + integration tests | ✅ Done | 224/224 passing, 9 suites |
| Live Hedera testnet evidence | ✅ Done | HashScan verifiable transactions |
| CI pipeline | ✅ Done | `.github/workflows/test.yml` |
| Standard repo structure | ✅ Done | `src/`, `tests/`, `docs/`, `evidence/` |
| `.env.example` | ✅ Done | No secrets in repo |
| `.gitignore` | ✅ Done | `node_modules/`, `.env` excluded |
| REST API stub | ✅ Done | `src/api/server.js` |
| Auth placeholder | ✅ Done | API key middleware, OAuth2 path documented |
| Storage abstraction | ✅ Done | `InMemoryAttestationStore` — swap-ready for PostgreSQL |
| API documentation | ✅ Done | `docs/api/API-REFERENCE.md` |
| Architecture docs | ✅ Done | `docs/ARCHITECTURE.md` |
| Security docs | ✅ Done | `docs/SECURITY.md` |
| MRV methodology docs | ✅ Done | `docs/MRV-METHODOLOGY.md` |
| Deployment guide | ✅ Done | `docs/deployment/DEPLOYMENT-GUIDE.md` |
| PostgreSQL integration | ⏳ Phase 2 | Replace `InMemoryAttestationStore` |
| Full OAuth2/OIDC | ⏳ Phase 2 | Replace API-key placeholder |
| Docker + Kubernetes | ⏳ Phase 2 | Containerisation |
| Monitoring + alerting | ⏳ Phase 2 | Prometheus, Grafana |
| Hedera mainnet account | ⏳ Phase 2 | Funded mainnet account |
| Verra MIN submission | ⏳ Phase 3 | Non-code milestone |
| External security review | ⏳ Phase 3 | Third-party pentest |
| First pilot deployment | ⏳ Phase 3 | Real hydropower plant |
