# Deployment Guide — Hedera Hydropower MRV

## Prerequisites

- Node.js 18+
- A Hedera testnet or mainnet account ([portal.hedera.com](https://portal.hedera.com))
- `.env` configured from `.env.example`

---

## Local Development

```bash
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
npm install
cp .env.example .env
# Fill in your HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY
npm test
```

---

## Run the API Server

```bash
npm start
# Server running on http://localhost:3000
```

Test it:
```bash
curl http://localhost:3000/api/v1/health
```

---

## Deploy to Hedera Testnet (PoC)

```bash
# 1. Deploy Device DID
npm run deploy-did

# 2. Create REC Token
npm run create-token

# 3. Submit a test reading
npm run submit-telemetry
```

---

## Production Deployment Roadmap

| Step | Technology | Status |
|------|-----------|--------|
| Containerise | Docker | Planned |
| Orchestrate | Kubernetes | Planned |
| Database | PostgreSQL | Planned |
| Auth | OAuth2/OIDC | Planned |
| Monitoring | Prometheus + Grafana | Planned |
| CI/CD | GitHub Actions (✅ done) | Done |
| Mainnet | Hedera mainnet account | Planned |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HEDERA_OPERATOR_ID` | Yes | Your Hedera account ID |
| `HEDERA_OPERATOR_KEY` | Yes | Your Ed25519 private key |
| `HEDERA_NETWORK` | No | `testnet` (default) or `mainnet` |
| `AUDIT_TOPIC_ID` | No | Pre-existing HCS topic |
| `EF_GRID` | No | Grid emission factor (default: 0.8) |
| `PORT` | No | API server port (default: 3000) |
