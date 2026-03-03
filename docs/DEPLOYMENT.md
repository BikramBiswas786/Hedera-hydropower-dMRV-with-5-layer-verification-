# Deployment Guide

**Last reviewed**: March 4, 2026

This guide covers deployment to three environments: Vercel (recommended for API), Docker (self-hosted), and bare-metal Node.js. It also covers Redis and Hedera configuration for each.

---

## Prerequisites

- Node.js 18+
- npm 9+
- A Hedera testnet or mainnet account ([portal.hedera.com](https://portal.hedera.com))
- Redis 7+ (for replay protection and rate limiting)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
# Hedera credentials
HEDERA_OPERATOR_ID=0.0.XXXXXXX
HEDERA_OPERATOR_KEY=302e...
HEDERA_NETWORK=testnet

# Hedera resources (created at first run if absent)
HEDERA_TOPIC_ID=0.0.7462776
HEDERA_TOKEN_ID=0.0.7964264

# API authentication
API_KEY_1=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
# Add more keys as needed: API_KEY_2, API_KEY_3, ...

# Redis
REDIS_URL=redis://localhost:6379

# Application
PORT=3000
NODE_ENV=production
```

**Security**: Never commit `.env` to version control. Verify it is in `.gitignore` before every commit.

---

## Option 1: Vercel (Recommended)

Vercel is the simplest deployment path and handles TLS, scaling, and CI/CD automatically.

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Set environment variables in the Vercel dashboard under **Settings → Environment Variables**. Do not use the `.env` file for Vercel deployments.

**Redis on Vercel**: Vercel functions are stateless. Use a managed Redis service:
- [Upstash](https://upstash.com) — free tier available, Redis-compatible, serverless-native
- [Redis Cloud](https://redis.com/redis-enterprise-cloud) — production-grade

Set `REDIS_URL` to the managed instance connection string in Vercel environment variables.

---

## Option 2: Docker

```bash
# Build image
docker build -t hedera-hydropower-mrv .

# Run with Redis
docker run -d --name redis redis:7-alpine
docker run -d \
  --name mrv-api \
  --link redis:redis \
  -p 3000:3000 \
  --env-file .env \
  hedera-hydropower-mrv
```

For production, use Docker Compose or Kubernetes to manage the service lifecycle.

---

## Option 3: Bare-Metal Node.js

```bash
# Install dependencies
npm ci --only=production

# Start API
npm run api

# Recommended: use PM2 for process management
npm install -g pm2
pm2 start npm --name "mrv-api" -- run api
pm2 save
pm2 startup
```

---

## Redis

Redis provides two functions:
1. **Replay protection** — deduplicates readings by `plant_id + device_id + timestamp`
2. **Rate limiting** — enforces per-key request quotas

If Redis is unavailable at startup, both features fall back to no-op mode. This is logged at `WARN` level. It is acceptable in development but must not occur in production.

**Start Redis locally**:
```bash
# Docker (recommended)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# WSL (Windows development)
wsl sudo service redis-server start

# Verify
redis-cli ping   # expected: PONG
```

---

## Post-Deployment Verification

After deploying, verify the system is functioning correctly:

```bash
# 1. Check API status
curl https://your-deployment.vercel.app/api/status

# 2. Run the production test script (requires API server running locally)
powershell -ExecutionPolicy Bypass -File .\RUN_TESTS.ps1

# 3. Check Hedera audit topic
# https://hashscan.io/testnet/topic/0.0.7462776
```

All 6 tests in RUN_TESTS.ps1 must pass before considering the deployment healthy.

---

## Mainnet Migration Checklist

Before switching from testnet to mainnet:

- [ ] Fund mainnet account with sufficient HBAR (minimum 100 HBAR recommended)
- [ ] Create new HCS topic on mainnet
- [ ] Create new HTS token on mainnet
- [ ] Update `HEDERA_NETWORK=mainnet` in environment
- [ ] Update `HEDERA_TOPIC_ID` and `HEDERA_TOKEN_ID`
- [ ] Replace testnet private key with mainnet key
- [ ] Run full test suite against mainnet
- [ ] Review [SECURITY.md](./SECURITY.md) — mainnet requires stricter key management
- [ ] Configure managed Redis (not localhost)
- [ ] Set up monitoring (see [MONITORING.md](../docs/MONITORING-PLAN.md))
