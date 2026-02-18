# Complete Commands Reference

All commands to run, test, and verify the Hedera Hydropower dMRV system.

---

## 1. Setup

```bash
# Clone and install
git clone https://github.com/BikramBiswas786/hedera-hydropower-mrv
cd hedera-hydropower-mrv
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Hedera testnet credentials:
# HEDERA_OPERATOR_ID=0.0.XXXXXXX
# HEDERA_OPERATOR_KEY=302e...
# HEDERA_NETWORK=testnet
```

---

## 2. Run Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode (development)
npm run test:watch

# Integration tests only
npx jest tests/integration/

# Unit tests only
npx jest tests/unit/
```

---

## 3. Run Demo Scripts

```bash
# Transparent Classic mode (every reading anchored to HCS)
node scripts/demo-transparent-classic.js

# Extreme Cost Saver mode (Merkle root only)
node scripts/demo-extreme-cost-saver.js

# Cost calculator
node scripts/cost-calculator.js

# AI verification proof
node scripts/proof-ai-verification.js

# Batch visualizer
node scripts/batch-visualizer.js
```

---

## 4. Collect Evidence

```bash
# Collect basic evidence
node scripts/collect-evidence.js

# Collect complete evidence package
node scripts/collect-complete-evidence.js

# Output: evidence/ directory with JSON + CSV files
```

---

## 5. Verify On-Chain Evidence

```bash
# HashScan links — verify manually
# Operator account:   https://hashscan.io/testnet/account/0.0.6255927
# DID topic:          https://hashscan.io/testnet/topic/0.0.7462776/messages
# HYDRO token:        https://hashscan.io/testnet/token/0.0.7462184
# Token burn proof:   https://hashscan.io/testnet/transaction/1765912543.562000934
```

---

## 6. Start the Mini-Tool API

```bash
# Start the Node.js service
node code/service/index.js

# Test endpoints
curl -X POST http://localhost:3000/telemetry \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"TURBINE-1","generatedKwh":156,"flowRate":2.5,"head":45}'

curl http://localhost:3000/mrv-snapshot
```

---

## 7. Run Playground Scripts

```bash
# Step 1: Deploy DID
node code/playground/01_deploy_did.js

# Step 2: Sign gateway payload
node code/playground/02_gateway_sign.js

# Step 3: Verify and mint
node code/playground/03_orchestrator_verify.js
```

---

## 8. Useful One-Liners

```bash
# Check Node version
node --version   # Requires >= 18

# List all test files
find tests/ -name '*.test.js'

# Check coverage threshold
npm run test:coverage -- --passWithNoTests

# Lint (if configured)
npm run lint
```
