# Complete Deployment Guide

## Hedera Hydropower MRV - Testnet to Mainnet Deployment

**Version**: 1.0  
**Status**: Production-Ready  
**Last Updated**: 2026-02-15

---

## Table of Contents

1. [Testnet Deployment](#testnet-deployment)
2. [Mainnet Deployment](#mainnet-deployment)
3. [Configuration Management](#configuration-management)
4. [Monitoring & Operations](#monitoring--operations)
5. [Troubleshooting](#troubleshooting)

---

## Testnet Deployment

### Prerequisites

```bash
# Check Node.js version
node --version  # Should be 16+

# Check npm version
npm --version   # Should be 8+

# Install dependencies
npm install

# Verify installation
npm list @hashgraph/sdk
```

### Step 1: Setup Hedera Testnet Account

```bash
# 1. Visit Hedera Testnet Faucet
# URL: https://testnet.hedera.com/faucet

# 2. Create or import account
# - Create new account (get free testnet account)
# - Or import existing account with private key

# 3. Request test HBAR
# - Click "Get test HBAR"
# - Receive 10 HBAR (free)

# 4. Copy credentials
# Account ID: 0.0.XXXXXX
# Private Key: 302a300506032b6570032100...
```

### Step 2: Configure Environment

```bash
# Create .env file
cat > .env << 'EOF'
# Hedera Testnet Configuration
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.YOUR_ACCOUNT_ID
HEDERA_PRIVATE_KEY=YOUR_PRIVATE_KEY

# Operator (same as above for testnet)
OPERATOR_ACCOUNT_ID=0.0.YOUR_ACCOUNT_ID
OPERATOR_PRIVATE_KEY=YOUR_PRIVATE_KEY

# Optional: Existing Topic/Token IDs (leave blank for first run)
DID_TOPIC_ID=
AUDIT_TOPIC_ID=
REC_TOKEN_ID=

# Engine Configuration
ENGINE_AUTO_APPROVAL_THRESHOLD=0.90
ENGINE_FLAG_THRESHOLD=0.50

# Logging
LOG_LEVEL=info
EOF

# Verify .env is not committed to git
echo ".env" >> .gitignore
```

### Step 3: Deploy Device DID

```bash
# Run DID deployment script
node code/playground/01_deploy_did_complete.js

# Expected output:
# ========================================
# Deploying Device DID to Hedera Testnet
# ========================================
# ✓ Connected to Hedera Testnet
# ✓ Generated Ed25519 key pair
# ✓ Topic created: 0.0.7462776
# ✓ Device DID registered: did:hedera:testnet:0.0.7462776
# ✓ DID stored in topic
#
# Device DID Deployment Successful!
# Device ID: TURBINE-1
# DID: did:hedera:testnet:0.0.7462776
# Topic ID: 0.0.7462776
```

### Step 4: Create REC Token

```bash
# Run token creation script
node code/playground/02_create_rec_token.js

# Expected output:
# ========================================
# Creating REC Token on Hedera HTS
# ========================================
# ✓ Connected to Hedera Testnet
# ✓ Token created: 0.0.7462931
# ✓ Token Name: Hydropower REC
# ✓ Token Symbol: H-REC
# ✓ Decimals: 2
# ✓ Supply Type: INFINITE
#
# REC Token Creation Successful!
# Token ID: 0.0.7462931
```

### Step 5: Submit Telemetry

```bash
# Run telemetry submission script
node code/playground/03_submit_telemetry.js

# Expected output:
# ========================================
# Submitting Telemetry Data to HCS
# ========================================
# ✓ Generated 91 readings
# ✓ Submitted 91/91 readings
# ✓ Total Generation: 16,800.00 MWh
# ✓ Total Emission Reductions: 13,440.00 tCO2
# ✓ Total RECs: 13,440.00
```

### Step 6: Verify Testnet Deployment

```bash
# Check DID topic on HashScan
curl -s https://hashscan.io/api/v1/topics/0.0.7462776 | jq .

# Check REC token on HashScan
curl -s https://hashscan.io/api/v1/tokens/0.0.7462931 | jq .

# Check telemetry messages
curl -s https://hashscan.io/api/v1/topics/0.0.7462776/messages | jq .

# Expected responses:
# - Topic: Active, 91 messages
# - Token: Active, 13,440 supply
# - Messages: 91 records
```

### Step 7: Run Unit Tests

```bash
# Run all tests
npm test

# Expected output:
# ✓ Anomaly Detector Tests (15 tests)
# ✓ AI Guardian Verifier Tests (12 tests)
# ✓ Verifier Attestation Tests (10 tests)
# ✓ Integration Tests (8 tests)
# 
# Total: 45 tests passed
# Coverage: 95%+
```

### Step 8: Generate Testnet Evidence Package

```bash
# Create evidence directory
mkdir -p evidence

# Run evidence collection script
node scripts/collect-evidence.js

# Expected files:
# - evidence/device-did.json
# - evidence/rec-token.json
# - evidence/telemetry-submission.json
# - evidence/verification-results.json
# - evidence/rec-minting.json
# - evidence/monitoring-report.json
```

---

## Mainnet Deployment

### Prerequisites

**Important**: Mainnet deployment requires real HBAR tokens and will incur actual costs.

```bash
# 1. Obtain Hedera Mainnet Account
# - Create account on Hedera Mainnet
# - Fund account with HBAR (minimum 100 HBAR recommended)
# - Backup private key securely

# 2. Verify Account Balance
node -e "
const { Client, AccountBalanceQuery } = require('@hashgraph/sdk');
const client = Client.forMainnet();
client.setOperator(process.env.HEDERA_ACCOUNT_ID, process.env.HEDERA_PRIVATE_KEY);

new AccountBalanceQuery()
  .setAccountId(process.env.HEDERA_ACCOUNT_ID)
  .execute(client)
  .then(balance => {
    console.log('Account Balance:', balance.hbars.toString());
    client.close();
  });
"
```

### Step 1: Prepare Mainnet Configuration

```bash
# Create .env.mainnet file
cat > .env.mainnet << 'EOF'
# Hedera Mainnet Configuration
HEDERA_NETWORK=mainnet
HEDERA_ACCOUNT_ID=0.0.YOUR_MAINNET_ACCOUNT_ID
HEDERA_PRIVATE_KEY=YOUR_MAINNET_PRIVATE_KEY

# Operator (same as above for mainnet)
OPERATOR_ACCOUNT_ID=0.0.YOUR_MAINNET_ACCOUNT_ID
OPERATOR_PRIVATE_KEY=YOUR_MAINNET_PRIVATE_KEY

# Mainnet Topic/Token IDs (will be created)
DID_TOPIC_ID=
AUDIT_TOPIC_ID=
REC_TOKEN_ID=

# Engine Configuration (Conservative for mainnet)
ENGINE_AUTO_APPROVAL_THRESHOLD=0.95
ENGINE_FLAG_THRESHOLD=0.70

# Logging (Verbose for mainnet)
LOG_LEVEL=debug
EOF
```

### Step 2: Pre-Deployment Checklist

```bash
# Create checklist
cat > MAINNET-DEPLOYMENT-CHECKLIST.md << 'EOF'
# Mainnet Deployment Checklist

## Pre-Deployment (Week 1)
- [ ] Mainnet account created and funded (100+ HBAR)
- [ ] Private key backed up securely (hardware wallet)
- [ ] All testnet tests passing (95%+ coverage)
- [ ] Security audit completed
- [ ] Cost analysis reviewed
- [ ] Verra approval obtained (if applicable)

## Configuration (Week 2)
- [ ] .env.mainnet configured correctly
- [ ] Network set to "mainnet"
- [ ] Account ID verified
- [ ] Private key verified
- [ ] Conservative thresholds set (0.95 auto-approval)

## Deployment (Week 3)
- [ ] DID deployment script tested
- [ ] Token creation script tested
- [ ] Telemetry submission script tested
- [ ] Monitoring script tested
- [ ] Verification script tested

## Post-Deployment (Week 4)
- [ ] All on-chain operations verified
- [ ] HashScan links verified
- [ ] Monitoring dashboard active
- [ ] Alert system active
- [ ] Support team trained

## Go/No-Go Decision
- [ ] All checklist items complete
- [ ] No critical issues found
- [ ] Team approval obtained
- [ ] Proceed to production
EOF

# Run checklist
cat MAINNET-DEPLOYMENT-CHECKLIST.md
```

### Step 3: Deploy to Mainnet

```bash
# Load mainnet configuration
export $(cat .env.mainnet | xargs)

# Deploy Device DID
echo "Deploying Device DID to Mainnet..."
node code/playground/01_deploy_did_complete.js

# Deploy REC Token
echo "Creating REC Token on Mainnet..."
node code/playground/02_create_rec_token.js

# Submit initial telemetry
echo "Submitting initial telemetry to Mainnet..."
node code/playground/03_submit_telemetry.js

# Verify mainnet deployment
echo "Verifying mainnet deployment..."
node scripts/verify-mainnet.js
```

### Step 4: Verify Mainnet Deployment

```bash
# Check mainnet on HashScan
# URL: https://hashscan.io/mainnet/

# Verify DID topic
curl -s https://hashscan.io/api/v1/topics/0.0.YOUR_TOPIC_ID | jq .

# Verify REC token
curl -s https://hashscan.io/api/v1/tokens/0.0.YOUR_TOKEN_ID | jq .

# Expected status:
# - Topic: Active
# - Token: Active
# - All transactions confirmed
```

### Step 5: Monitor Mainnet Operations

```bash
# Start monitoring dashboard
npm run monitor

# Expected output:
# ========================================
# Hedera Hydropower MRV - Monitoring
# ========================================
# Network: Mainnet
# DID Topic: 0.0.XXXXXX
# REC Token: 0.0.XXXXXX
# 
# Status: OPERATIONAL
# Uptime: 99.9%
# Transactions: 1,234
# RECs Issued: 13,440
```

---

## Configuration Management

### Environment Variables

```bash
# Network Configuration
HEDERA_NETWORK=testnet|mainnet
HEDERA_ACCOUNT_ID=0.0.XXXXXX
HEDERA_PRIVATE_KEY=302a300506...

# Topic & Token IDs
DID_TOPIC_ID=0.0.XXXXXX
AUDIT_TOPIC_ID=0.0.XXXXXX
REC_TOKEN_ID=0.0.XXXXXX

# Engine Configuration
ENGINE_AUTO_APPROVAL_THRESHOLD=0.90
ENGINE_FLAG_THRESHOLD=0.50

# Logging
LOG_LEVEL=info|debug|warn|error
LOG_FILE=/var/log/hedera-hydropower.log

# Monitoring
MONITORING_ENABLED=true
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

# Alerts
ALERT_EMAIL=admin@example.com
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/...
```

### Configuration Files

```bash
# Create config directory
mkdir -p config

# Create engine config
cat > config/engine.json << 'EOF'
{
  "autoApprovalThreshold": 0.90,
  "flagThreshold": 0.50,
  "weights": {
    "physics": 0.30,
    "temporal": 0.25,
    "environmental": 0.20,
    "statistical": 0.15,
    "consistency": 0.10
  },
  "physics": {
    "maxDeviation": 0.30,
    "minEfficiency": 0.70,
    "maxEfficiency": 0.95
  }
}
EOF

# Create hedera config
cat > config/hedera.json << 'EOF'
{
  "network": "testnet",
  "maxTransactionFee": 2,
  "requestTimeout": 30000,
  "retryAttempts": 3,
  "retryDelay": 1000
}
EOF
```

---

## Monitoring & Operations

### Health Checks

```bash
# Create health check script
cat > scripts/health-check.sh << 'EOF'
#!/bin/bash

echo "=== Hedera Hydropower MRV Health Check ==="
echo "Timestamp: $(date)"

# Check Hedera connection
echo "Checking Hedera connection..."
node -e "
const { Client, AccountBalanceQuery } = require('@hashgraph/sdk');
const client = Client.forTestnet();
client.setOperator(process.env.HEDERA_ACCOUNT_ID, process.env.HEDERA_PRIVATE_KEY);

new AccountBalanceQuery()
  .setAccountId(process.env.HEDERA_ACCOUNT_ID)
  .execute(client)
  .then(balance => {
    console.log('✓ Hedera connection OK');
    console.log('  Balance:', balance.hbars.toString());
    client.close();
  })
  .catch(err => {
    console.log('✗ Hedera connection FAILED');
    console.log('  Error:', err.message);
  });
"

# Check topic
echo "Checking DID topic..."
curl -s https://hashscan.io/api/v1/topics/$DID_TOPIC_ID | jq '.topic_id' > /dev/null && echo "✓ DID topic OK" || echo "✗ DID topic FAILED"

# Check token
echo "Checking REC token..."
curl -s https://hashscan.io/api/v1/tokens/$REC_TOKEN_ID | jq '.token_id' > /dev/null && echo "✓ REC token OK" || echo "✗ REC token FAILED"

# Check logs
echo "Checking recent logs..."
tail -5 /var/log/hedera-hydropower.log

echo "=== Health Check Complete ==="
EOF

chmod +x scripts/health-check.sh
./scripts/health-check.sh
```

### Monitoring Dashboard

```bash
# Start Prometheus
docker run -d \
  -p 9090:9090 \
  -v $(pwd)/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Start Grafana
docker run -d \
  -p 3000:3000 \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana

# Access dashboards
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
```

### Alerting

```bash
# Configure alerts
cat > monitoring/alerts.yml << 'EOF'
groups:
  - name: hedera_hydropower
    rules:
      - alert: HighErrorRate
        expr: rate(errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
          
      - alert: LowApprovalRate
        expr: approval_rate < 0.95
        for: 10m
        annotations:
          summary: "Low approval rate detected"
          
      - alert: SystemDown
        expr: up{job="hedera-hydropower"} == 0
        for: 1m
        annotations:
          summary: "System is down"
EOF
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Connection Timeout

```
Error: Request timeout after 30000ms
```

**Solution**:
```bash
# Check network connectivity
ping hashscan.io

# Increase timeout in config
cat > config/hedera.json << 'EOF'
{
  "requestTimeout": 60000  // Increase to 60 seconds
}
EOF

# Restart application
npm restart
```

#### Issue 2: Insufficient Balance

```
Error: Account has insufficient balance for transaction
```

**Solution**:
```bash
# Check balance
node -e "
const { Client, AccountBalanceQuery } = require('@hashgraph/sdk');
const client = Client.forTestnet();
client.setOperator(process.env.HEDERA_ACCOUNT_ID, process.env.HEDERA_PRIVATE_KEY);

new AccountBalanceQuery()
  .setAccountId(process.env.HEDERA_ACCOUNT_ID)
  .execute(client)
  .then(balance => console.log('Balance:', balance.hbars.toString()));
"

# Request more testnet HBAR
# Visit: https://testnet.hedera.com/faucet
```

#### Issue 3: Invalid Private Key

```
Error: Invalid private key format
```

**Solution**:
```bash
# Verify private key format
# Should be: 302a300506032b6570032100...

# If using mnemonic, convert to private key
node -e "
const { PrivateKey } = require('@hashgraph/sdk');
const privateKey = PrivateKey.fromString('YOUR_PRIVATE_KEY');
console.log('Valid key:', privateKey.toString());
"
```

#### Issue 4: Topic Not Found

```
Error: Topic 0.0.7462776 not found
```

**Solution**:
```bash
# Verify topic ID is correct
echo $DID_TOPIC_ID

# Check topic on HashScan
curl https://hashscan.io/api/v1/topics/0.0.7462776

# If not found, redeploy topic
node code/playground/01_deploy_did_complete.js
```

### Debugging

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Run with verbose output
npm run dev

# Check logs
tail -f /var/log/hedera-hydropower.log

# Monitor transactions
watch -n 1 'curl -s https://hashscan.io/api/v1/topics/0.0.7462776/messages | jq ".messages | length"'
```

---

## Rollback Procedures

### Testnet Rollback

```bash
# If deployment fails on testnet, simply redeploy
# Testnet is ephemeral, no data loss concerns

node code/playground/01_deploy_did_complete.js
node code/playground/02_create_rec_token.js
```

### Mainnet Rollback

```bash
# Mainnet rollback is NOT recommended
# Instead, create new topic/token with updated configuration

# Create new DID topic
node code/playground/01_deploy_did_complete.js --new-topic

# Create new REC token
node code/playground/02_create_rec_token.js --new-token

# Update .env.mainnet with new IDs
# Continue operations with new infrastructure
```

---

**Document Version**: 1.0  
**Status**: Production-Ready  
**Last Updated**: 2026-02-15
