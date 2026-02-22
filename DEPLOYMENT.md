# 🚀 Deployment Guide

## 📊 Grafana Dashboard

### Quick Start

1. **Start monitoring stack:**
```bash
docker-compose up -d
```

2. **Access Grafana:**
- URL: http://localhost:3001
- Username: `admin`
- Password: `admin`

3. **Import Dashboard:**
- Go to **Dashboards** → **Import**
- Upload: `monitoring/grafana/dashboards/mrv-dashboard.json`
- Select Prometheus data source
- Click **Import**

### Dashboard Features

#### 📊 System Overview
- **237 Tests Passed** - Real-time test status
- **100% Pass Rate** - Gauge visualization
- **98.3% ML Accuracy** - Fraud detection performance
- **$3.04 HBAR Cost** - Real spend tracking

#### 🔗 Blockchain Transactions
- **Transaction Table** with clickable HashScan links:
  - [Approved TX](https://hashscan.io/testnet/transaction/0.0.6255927@1771708839.586094103)
  - [Fraud TX](https://hashscan.io/testnet/transaction/0.0.6255927@1771708968.275909856)
  - [REC Token](https://hashscan.io/testnet/token/0.0.697227)

#### 💰 Cost Analysis
- **Pie Chart** showing cost breakdown:
  - Topic Creation: $0.03
  - Token Creation: $3.00
  - Token Minting: $0.005
- **Carbon Credit Value**: $3,027.91 USD

#### 📈 Performance Metrics
- **Test Execution Time** - Time series graph
- **Trust Score Distribution** - Histogram
- **Anomaly Detection Rate** - Real-time monitoring

### Custom Metrics

The dashboard tracks these Prometheus metrics:

```prometheus
# Test metrics
mrv_test_execution_time
mrv_readings_total

# ML metrics
mrv_anomalies_detected_total
mrv_trust_score

# Blockchain metrics
mrv_hedera_tx_success
mrv_hedera_tx_failure
```

---

## 🌐 Vercel UI Deployment

### Option 1: One-Click Deploy (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv&project-name=hedera-mrv-dashboard)

**Important:** After clicking, set:
- **Root Directory:** `vercel-ui`
- **Framework Preset:** Next.js

### Option 2: Manual Vercel Deploy

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Login to Vercel:**
```bash
vercel login
```

3. **Deploy:**
```bash
cd vercel-ui
vercel --prod
```

### Option 3: GitHub Integration

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select this repo
4. **Configure Project:**
   - **Root Directory:** `vercel-ui`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
5. Click **Deploy**

### Vercel UI Features

✅ **Real Test Results** - 237/237 passed
✅ **Live HashScan Links** - Click to verify on blockchain
✅ **Cost Transparency** - $3.04 USD breakdown
✅ **Carbon Credit Demo** - $3,027 market value
✅ **Beautiful UI** - Glassmorphism + gradients
✅ **Mobile Responsive** - Works on all devices

### Expected URL

After deployment:
```
https://hedera-mrv-dashboard.vercel.app
```

### Troubleshooting

#### Build Fails

**Problem:** `Cannot find module 'next'`

**Solution:** Ensure `vercel-ui` is set as Root Directory in Vercel settings.

#### 404 on All Routes

**Problem:** Wrong root directory

**Solution:**
1. Go to Project Settings
2. General → Root Directory
3. Set to: `vercel-ui`
4. Redeploy

#### Styling Not Loading

**Problem:** Tailwind not compiling

**Solution:** Check that `postcss.config.js` and `tailwind.config.ts` exist in `vercel-ui/`

---

## 🐳 Docker Deployment

### Full Stack

```bash
docker-compose up -d
```

This starts:
- ✅ API Server (port 3000)
- ✅ PostgreSQL (port 5432)
- ✅ Redis (port 6379)
- ✅ Prometheus (port 9090)
- ✅ Grafana (port 3001)

### Individual Services

```bash
# API only
docker-compose up api

# Monitoring only
docker-compose up prometheus grafana
```

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# Prometheus metrics
curl http://localhost:3000/metrics

# Grafana
curl http://localhost:3001/api/health
```

---

## 🔧 Local Development

### Backend API

```bash
npm install
npm run dev
```

### Vercel UI

```bash
cd vercel-ui
npm install
npm run dev
```

Open: http://localhost:3000

---

## 📊 Monitoring URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| API | http://localhost:3000 | N/A |
| Grafana | http://localhost:3001 | admin/admin |
| Prometheus | http://localhost:9090 | N/A |
| Vercel UI | https://hedera-mrv-dashboard.vercel.app | N/A |

---

## 🎯 Next Steps

1. ✅ **Deploy to Vercel** - Use Option 1 (one-click)
2. ✅ **Import Grafana Dashboard** - Use updated JSON
3. ✅ **Share URLs** - Vercel URL + Grafana screenshots
4. ✅ **Monitor Costs** - Track HBAR usage in dashboard

---

## 📝 Environment Variables

### For API (.env)

```bash
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e...
HEDERA_NETWORK=testnet
JWT_SECRET=your-secret
API_KEYS=key1,key2
```

### For Vercel (None Required!)

All data is hardcoded from test results - no env vars needed.

---

**Built for Hedera Apex Hackathon 2026** 🏆
