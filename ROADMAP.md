# Hedera Hydropower MRV: Production Roadiness Roadmap

**Current Status:** Engineering MVP (80% to Pilot-Ready)  
**Target:** Enterprise Production (Q2 2026)  
**Last Updated:** February 20, 2026

---

## Overview

This roadmap tracks the evolution from **hackathon MVP** → **pilot-ready** → **enterprise production**. Each phase has clear deliverables, success criteria, and GitHub Issues for tracking.

**Quick Links:**
- [Production Gaps Analysis](./PRODUCTION_GAPS.md)
- [Pilot Deployment Guide](./PILOT_DEPLOYMENT_GUIDE.md)
- [OpenAPI Specification](./docs/api/openapi.yaml)
- [GitHub Issues Board](https://github.com/BikramBiswas786/.../issues)
- [GitHub Projects](https://github.com/BikramBiswas786/.../projects)

---

## Phase 0: Current State (Completed) ✅

**Status:** DONE (as of Feb 20, 2026)

### Achievements

| Component | Status | Evidence |
|-----------|--------|----------|
| **AI Guardian Engine** | ✅ Complete | 5-layer verification, trust scoring |
| **Hedera Integration** | ✅ Live | Testnet HCS/HTS with HashScan links |
| **ML Fraud Detection** | ✅ Functional | Isolation Forest, 79.5% accuracy |
| **Test Coverage** | ✅ Strong | 224 tests, 85% coverage, all passing |
| **Demo Pipeline** | ✅ Working | `/api/demo`, `/api/status` endpoints |
| **Documentation** | ✅ Good | README, HACKATHON, VALIDATION guides |
| **Vercel Deployment** | ✅ Live | https://hydropower-mrv-19feb26.vercel.app |

### Known Limitations

- ❌ No authentication (presence-check only)
- ❌ 20% Hedera transaction failure rate (no retry logic)
- ❌ Single-tenant architecture
- ❌ No observability (console logs only)
- ❌ Manual onboarding required
- ❌ No edge agent software
- ❌ Limited API documentation

**Next:** Address critical blockers in Phase 1

---

## Phase 1: Critical Fixes 🔴 (Weeks 1-2)

**Goal:** Fix production blockers that prevent pilot deployment  
**Target Date:** March 6, 2026  
**Priority:** P0 (Blocking)

### Sprint 1.1: Hedera Transaction Reliability

**GitHub Issue:** [#1 - Fix Hedera TRANSACTION_EXPIRED errors](https://github.com/BikramBiswas786/.../issues/1)

**Problem:** 20% of Hedera submissions fail with `TRANSACTION_EXPIRED`  
**Root Cause:** Stale transactions reused across retry attempts  
**Impact:** Data loss, incomplete audit trail

**Deliverables:**
- [ ] Implement `HederaRetryHandler` class with fresh transaction generation
- [ ] Add exponential backoff with jitter (1s, 2s, 4s, 8s)
- [ ] Add circuit breaker (stop after 10 consecutive failures)
- [ ] Add Prometheus metric: `hedera_transaction_success_rate`
- [ ] Unit tests: 20+ retry scenarios
- [ ] Integration test: Verify >99% success rate

**Files Changed:**
- `src/utils/hedera-retry.js` (new)
- `src/workflow.js` (refactor)
- `tests/unit/hedera-retry.test.js` (new)

**Success Criteria:**
- Transaction success rate >99%
- No data loss during Hedera network congestion
- Average retry count <1.5 per transaction

**Effort:** 2 days  
**Owner:** @BikramBiswas786

---

### Sprint 1.2: Basic API Authentication

**GitHub Issue:** [#2 - Add API key authentication](https://github.com/BikramBiswas786/.../issues/2)

**Problem:** Zero access control on API endpoints  
**Impact:** Anyone can submit telemetry and mint tokens

**Deliverables:**
- [ ] Create `APIKeyManager` class
- [ ] Implement `authenticateAPI` middleware
- [ ] Add `X-API-Key` header validation
- [ ] Add rate limiting (1000 req/hour per key)
- [ ] Add audit logging (key ID + timestamp per request)
- [ ] Update API docs with auth examples
- [ ] Tests: 15+ auth scenarios

**Files Changed:**
- `src/middleware/auth.js` (new)
- `src/api/server.js` (add middleware)
- `tests/integration/api-auth.test.js` (new)
- `docs/api/openapi.yaml` (add security schemes)

**Success Criteria:**
- All endpoints require valid API key
- Invalid keys return 401/403 with clear error
- Rate limit enforced at 1000 req/hour
- All requests logged with key ID

**Effort:** 2 days  
**Owner:** @BikramBiswas786

---

### Sprint 1.3: Structured Logging

**GitHub Issue:** [#3 - Replace console.log with Winston](https://github.com/BikramBiswas786/.../issues/3)

**Problem:** Console logs are ephemeral, unsearchable  
**Impact:** Can't debug production issues

**Deliverables:**
- [ ] Install Winston logger
- [ ] Add correlation IDs to all requests
- [ ] Structured JSON logging format
- [ ] Log levels: DEBUG, INFO, WARN, ERROR
- [ ] Separate error log file
- [ ] Update all console.log calls

**Files Changed:**
- `src/utils/logger.js` (new)
- `src/api/server.js` (add request logging)
- `src/workflow.js` (replace console.log)
- `src/engine/v1/engine-v1.js` (replace console.log)

**Success Criteria:**
- All logs in JSON format
- Correlation IDs link related logs
- Error logs separate from info logs
- No more console.log calls

**Effort:** 1 day  
**Owner:** @BikramBiswas786

---

### Sprint 1.4: OpenAPI Interactive Docs

**GitHub Issue:** [#4 - Deploy Swagger UI for API docs](https://github.com/BikramBiswas786/.../issues/4)

**Problem:** API docs are YAML file only, not interactive  
**Impact:** Hard for developers to test integration

**Deliverables:**
- [ ] Deploy Swagger UI at `/docs` endpoint
- [ ] Add "Try it out" functionality
- [ ] Add sandbox API keys for testing
- [ ] Add request/response examples
- [ ] Add tutorial walkthroughs

**Files Changed:**
- `api/docs.js` (new endpoint)
- `docs/api/openapi.yaml` (ensure up-to-date)
- `public/swagger-ui/` (static assets)

**Success Criteria:**
- Interactive docs live at `/docs`
- "Try it out" works with sandbox keys
- All endpoints have examples

**Effort:** 1 day  
**Owner:** @BikramBiswas786

---

## Phase 2: Core Infrastructure 🟡 (Weeks 3-4)

**Goal:** Build multi-tenancy and observability foundations  
**Target Date:** March 20, 2026  
**Priority:** P1 (High)

### Sprint 2.1: Multi-Tenancy Database

**GitHub Issue:** [#5 - Implement PostgreSQL with RLS](https://github.com/BikramBiswas786/.../issues/5)

**Problem:** In-memory storage, no data isolation  
**Impact:** Can't support multiple plants

**Deliverables:**
- [ ] PostgreSQL schema with `organizations`, `devices`, `attestations` tables
- [ ] Row-level security policies
- [ ] Database migration scripts
- [ ] `PostgresAttestationStore` class
- [ ] Add `org_id` to all API requests
- [ ] Tests: Verify org A can't read org B data

**Files Changed:**
- `migrations/001_multi_tenancy.sql` (new)
- `src/storage/PostgresAttestationStore.js` (new)
- `src/api/server.js` (add org_id scoping)
- `tests/integration/multi-tenancy.test.js` (new)

**Success Criteria:**
- Database queries automatically filtered by org_id
- RLS prevents cross-tenant data leaks
- <100ms query time for 1M+ attestations

**Effort:** 4 days  
**Owner:** @BikramBiswas786

---

### Sprint 2.2: Prometheus Metrics

**GitHub Issue:** [#6 - Add Prometheus instrumentation](https://github.com/BikramBiswas786/.../issues/6)

**Problem:** No metrics on system health  
**Impact:** Can't measure SLOs or detect anomalies

**Deliverables:**
- [ ] Install `prom-client` library
- [ ] Add `/metrics` endpoint
- [ ] Custom metrics:
  - `mrv_telemetry_submissions_total` (counter)
  - `mrv_verification_duration_seconds` (histogram)
  - `mrv_hedera_transactions_total` (counter by status)
  - `mrv_trust_score` (histogram)
- [ ] Default metrics (CPU, memory, event loop)

**Files Changed:**
- `src/utils/metrics.js` (new)
- `src/api/server.js` (add /metrics endpoint)
- `src/workflow.js` (instrument verification pipeline)

**Success Criteria:**
- `/metrics` endpoint returns Prometheus format
- All critical paths instrumented
- Histograms use appropriate buckets

**Effort:** 2 days  
**Owner:** @BikramBiswas786

---

### Sprint 2.3: Organization Registration API

**GitHub Issue:** [#7 - Self-service org registration](https://github.com/BikramBiswas786/.../issues/7)

**Problem:** Manual org provisioning via code changes  
**Impact:** Can't scale onboarding

**Deliverables:**
- [ ] `POST /organizations/register` endpoint
- [ ] Generate API keys automatically
- [ ] Create Hedera accounts (optional)
- [ ] Email confirmation + welcome guide
- [ ] Admin UI for org management

**Files Changed:**
- `src/api/organizations.js` (new)
- `src/utils/api-key-generator.js` (new)
- `src/services/email.js` (new)

**Success Criteria:**
- Zero-code org registration
- API key returned in response (show once)
- Welcome email sent within 30s

**Effort:** 3 days  
**Owner:** @BikramBiswas786

---

## Phase 3: Developer Experience 🟢 (Weeks 5-6)

**Goal:** Make integration easy for plant operators and developers  
**Target Date:** April 3, 2026  
**Priority:** P1 (High)

### Sprint 3.1: Edge Agent Docker Image

**GitHub Issue:** [#8 - Build edge agent container](https://github.com/BikramBiswas786/.../issues/8)

**Problem:** Custom integration code required per plant  
**Impact:** High integration cost ($5-10K per plant)

**Deliverables:**
- [ ] Docker image with Modbus, OPC-UA, REST collectors
- [ ] Configuration via environment variables
- [ ] Auto-reconnect with exponential backoff
- [ ] Local buffering (72-hour offline cache)
- [ ] Health check endpoint
- [ ] Multi-arch build (amd64, arm64)

**Files Changed:**
- `edge-agent/Dockerfile` (new)
- `edge-agent/src/main.js` (new)
- `edge-agent/config.example.yaml` (new)

**Success Criteria:**
- One-line Docker run command
- Supports 5+ SCADA protocols
- Runs on RPi4 and Advantech gateways

**Effort:** 5 days  
**Owner:** @BikramBiswas786

---

### Sprint 3.2: Grafana Dashboards

**GitHub Issue:** [#9 - Create Grafana dashboards](https://github.com/BikramBiswas786/.../issues/9)

**Problem:** Metrics exist but no visualization  
**Impact:** Can't monitor system health

**Deliverables:**
- [ ] System overview dashboard (RED metrics)
- [ ] Hedera integration dashboard
- [ ] Business metrics dashboard
- [ ] Anomaly detection dashboard
- [ ] JSON dashboard definitions

**Files Changed:**
- `grafana/dashboards/system-overview.json` (new)
- `grafana/dashboards/hedera.json` (new)
- `grafana/dashboards/business.json` (new)

**Success Criteria:**
- 4 dashboards with 20+ panels
- Real-time updates (<10s lag)
- Drill-down links to HashScan

**Effort:** 3 days  
**Owner:** @BikramBiswas786

---

### Sprint 3.3: Python/JS SDKs

**GitHub Issue:** [#10 - Generate SDKs from OpenAPI](https://github.com/BikramBiswas786/.../issues/10)

**Problem:** Developers must write raw HTTP calls  
**Impact:** High integration friction

**Deliverables:**
- [ ] Python SDK generated from OpenAPI
- [ ] JavaScript/Node.js SDK
- [ ] Published to PyPI and npm
- [ ] Code examples for common use cases
- [ ] Inline documentation

**Files Changed:**
- `sdks/python/` (new, auto-generated)
- `sdks/javascript/` (new, auto-generated)
- `.github/workflows/publish-sdks.yml` (new)

**Success Criteria:**
- `pip install hedera-mrv` works
- `npm install @hedera/mrv-sdk` works
- 10+ code examples in README

**Effort:** 2 days  
**Owner:** @BikramBiswas786

---

## Phase 4: Pilot Readiness 🔵 (Weeks 7-8)

**Goal:** Production-grade features for first customer pilots  
**Target Date:** April 17, 2026  
**Priority:** P1 (High)

### Sprint 4.1: OAuth2 Authentication

**GitHub Issue:** [#11 - Implement OAuth2 client credentials](https://github.com/BikramBiswas786/.../issues/11)

**Problem:** API keys are static, no RBAC  
**Impact:** Can't support fine-grained permissions

**Deliverables:**
- [ ] OAuth2 token endpoint
- [ ] JWT issuance with 15-min expiry
- [ ] Refresh token rotation
- [ ] Scopes: `telemetry:write`, `attestation:read`, `token:mint`
- [ ] Admin UI for scope management

**Effort:** 5 days  
**Owner:** @BikramBiswas786

---

### Sprint 4.2: Device Provisioning UI

**GitHub Issue:** [#12 - Self-service device provisioning](https://github.com/BikramBiswas786/.../issues/12)

**Problem:** Manual device setup via code  
**Impact:** Can't scale to multiple turbines/meters

**Deliverables:**
- [ ] Web UI for adding devices
- [ ] Generate DID + key pairs
- [ ] QR code for edge agent pairing
- [ ] Sensor calibration wizard
- [ ] Device management dashboard

**Effort:** 4 days  
**Owner:** @BikramBiswas786

---

### Sprint 4.3: Alerting Rules

**GitHub Issue:** [#13 - Prometheus AlertManager rules](https://github.com/BikramBiswas786/.../issues/13)

**Problem:** No alerts for incidents  
**Impact:** Failures go unnoticed

**Deliverables:**
- [ ] AlertManager configuration
- [ ] 10+ alerting rules (high error rate, Hedera failures, etc.)
- [ ] Email + Slack notifications
- [ ] Runbooks for common alerts

**Files Changed:**
- `prometheus/alerts.yml` (new)
- `alertmanager/config.yml` (new)
- `docs/runbooks/` (new)

**Effort:** 2 days  
**Owner:** @BikramBiswas786

---

## Phase 5: Enterprise Production 🟣 (Weeks 9-12)

**Goal:** Full enterprise readiness  
**Target Date:** May 15, 2026  
**Priority:** P2 (Medium)

### Sprint 5.1: mTLS for Edge Devices

**GitHub Issue:** [#14 - Implement mutual TLS](https://github.com/BikramBiswas786/.../issues/14)

**Deliverables:**
- [ ] Certificate authority setup
- [ ] Device certificate generation
- [ ] mTLS handshake validation
- [ ] Certificate revocation list (CRL)

**Effort:** 5 days

---

### Sprint 5.2: Integration Templates

**GitHub Issue:** [#15 - SCADA integration templates](https://github.com/BikramBiswas786/.../issues/15)

**Deliverables:**
- [ ] Pre-built configs for top 10 SCADA/PLC vendors
- [ ] Sensor mapping wizard
- [ ] Protocol auto-detection

**Effort:** 3 days

---

### Sprint 5.3: Load Testing & Performance

**GitHub Issue:** [#16 - Performance optimization](https://github.com/BikramBiswas786/.../issues/16)

**Deliverables:**
- [ ] Load tests (10K req/s sustained)
- [ ] Database query optimization
- [ ] Caching layer (Redis)
- [ ] CDN for static assets

**Effort:** 4 days

---

## Success Metrics

### Technical SLOs

| Metric | Current | Phase 1 Target | Phase 4 Target | Phase 5 Target |
|--------|---------|----------------|----------------|----------------|
| **API Uptime** | N/A | 95% | 99% | 99.9% |
| **P95 Latency** | ~500ms | <500ms | <300ms | <200ms |
| **Hedera Success** | 80% | 99% | 99.5% | 99.9% |
| **Test Coverage** | 85% | 85% | 90% | 95% |
| **Data Loss** | N/A | <1% | <0.1% | <0.01% |

### Business KPIs

| Metric | Current | Phase 1 Target | Phase 4 Target | Phase 5 Target |
|--------|---------|----------------|----------------|----------------|
| **Onboarding Time** | Manual (weeks) | 1 day | 1 hour | <15 min |
| **Integration Cost** | ₹5-10L | ₹1L | ₹50K | ₹20K |
| **Active Pilots** | 0 | 0 | 2-3 | 10+ |
| **MRR** | ₹0 | ₹0 | ₹50K | ₹3L |

---

## GitHub Projects Integration

### How to Use

1. **View Board:** [GitHub Projects](https://github.com/BikramBiswas786/.../projects/1)
2. **Columns:**
   - 📋 Backlog (not started)
   - 🚧 In Progress (actively working)
   - 🔍 Review (PR open)
   - ✅ Done (merged + deployed)
3. **Labels:**
   - `P0-blocking` (must fix for pilot)
   - `P1-high` (important for production)
   - `P2-medium` (nice to have)
   - `bug` (fixes)
   - `feature` (new functionality)
   - `docs` (documentation)

### Creating Issues

**Template:**
```markdown
## Problem
[Clear description of what's broken or missing]

## Impact
[Business impact if not fixed]

## Proposed Solution
[Technical approach]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Effort Estimate
[Days]

## Dependencies
[Blocking issues: #123, #456]
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process
- Release workflow

---

## Questions?

- **Technical:** Open a [GitHub Issue](https://github.com/BikramBiswas786/.../issues/new)
- **Business/Pilot:** Email bikrambiswas007@gmail.com
- **Urgent:** Slack #hedera-mrv (request invite)

---

**Last Updated:** February 20, 2026  
**Next Review:** March 1, 2026  
**Maintained by:** @BikramBiswas786
