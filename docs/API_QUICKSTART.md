# API Quick Start Guide

This guide shows how to integrate your hydropower plant with the Hedera MRV system using our REST API.

---

## Prerequisites

- Plant sensors connected to PLC/SCADA
- Edge gateway (Raspberry Pi, industrial PC, or cloud VM)
- API key (contact us or use demo key for testing)

---

## Option 1: Quick Test (No Hardware)

### Start the API Server

```bash
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
npm install
npm run api
```

### Submit Test Telemetry

```bash
curl -X POST http://localhost:3000/api/v1/telemetry \
  -H "x-api-key: ghpk_demo_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "PLANT-HP-001",
    "device_id": "TURBINE-001",
    "readings": {
      "flowRate": 2.5,
      "head": 45.0,
      "generatedKwh": 900.0,
      "pH": 7.2,
      "turbidity": 10,
      "temperature": 18
    }
  }'
```

### Expected Response

```json
{
  "status": "APPROVED",
  "trust_score": 0.9850,
  "reading_id": "RDG-1708387201",
  "timestamp": 1708387201000,
  "hedera": {
    "transaction_id": "0.0.6255927@1708387201.123456789",
    "topic_id": "0.0.7462776",
    "hashscan_url": "https://hashscan.io/testnet/transaction/0.0.6255927@1708387201.123456789"
  },
  "carbon_credits": {
    "amount_tco2e": 0.72,
    "rec_tokens": 0.72,
    "token_id": "0.0.7964264"
  },
  "verification_details": {
    "physics_check": "PASS",
    "temporal_check": "PASS",
    "environmental_check": "PASS"
  }
}
```

---

## Option 2: Production Deployment

### 1. Get Your API Key

Contact us to get your production API key:
- Demo: `ghpk_demo_key_001` (testnet, rate-limited)
- Production: Custom key with your plant ID

### 2. Configure Edge Gateway

```bash
# On your edge gateway (Raspberry Pi / industrial PC)
cd /opt
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git hydro-mrv
cd hydro-mrv
npm install --production

# Create .env file
cat > .env << EOF
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
API_KEY=your_api_key_here
API_ENDPOINT=https://api.hydropower-mrv.io
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUD=9600
SUBMISSION_INTERVAL=300
EOF
```

### 3. Run Edge Gateway

```bash
# Test with mock data first
DRY_RUN=true node examples/plant-bridge-rest-api.js

# If looks good, run for real
node examples/plant-bridge-rest-api.js
```

### 4. Set Up as System Service (Linux)

```bash
sudo cat > /etc/systemd/system/hydro-mrv.service << EOF
[Unit]
Description=Hedera Hydropower MRV Edge Gateway
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/hydro-mrv
EnvironmentFile=/opt/hydro-mrv/.env
ExecStart=/usr/bin/node examples/plant-bridge-rest-api.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable hydro-mrv
sudo systemctl start hydro-mrv
sudo systemctl status hydro-mrv
```

---

## API Reference

### Base URL

- **Testnet**: `http://localhost:3000` (self-hosted)
- **Production**: `https://api.hydropower-mrv.io` (coming soon)

### Authentication

All API requests require an `x-api-key` header:

```
x-api-key: ghpk_demo_key_001
```

### Endpoints

#### POST /api/v1/telemetry

Submit sensor readings for verification.

**Request Body**:
```json
{
  "plant_id": "string (required)",
  "device_id": "string (required)",
  "readings": {
    "flowRate": "number (required, m³/s, 0.1-100)",
    "head": "number (required, meters, 1-500)",
    "generatedKwh": "number (required, kWh, 0.01-50000)",
    "timestamp": "number (optional, unix ms)",
    "pH": "number (optional, 4-10)",
    "turbidity": "number (optional, NTU, 0-1000)",
    "temperature": "number (optional, °C, 0-40)",
    "efficiency": "number (optional, 0-1)"
  }
}
```

**Response**: See example above.

**Status Codes**:
- `200 OK` - Reading approved
- `202 Accepted` - Reading flagged for review
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing API key
- `403 Forbidden` - Invalid API key
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

#### GET /api/v1/telemetry/rules

Get validation rules for telemetry.

**Response**:
```json
{
  "validation_rules": {
    "required": {
      "flowRate": { "min": 0.1, "max": 100, "unit": "m³/s" },
      "head": { "min": 1, "max": 500, "unit": "meters" },
      "generatedKwh": { "min": 0.01, "max": 50000, "unit": "kWh" }
    },
    "optional": {
      "pH": { "min": 4.0, "max": 10.0, "unit": "pH" },
      "turbidity": { "min": 0, "max": 1000, "unit": "NTU" }
    }
  }
}
```

#### GET /health

Check API server health.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": 1708387201000,
  "uptime": 3600,
  "version": "1.0.0"
}
```

#### GET /metrics

Prometheus metrics endpoint (for monitoring).

**Response**: Prometheus text format.

---

## Integration Examples

### Python

```python
import requests
import time

API_KEY = "ghpk_demo_key_001"
API_URL = "http://localhost:3000/api/v1/telemetry"

def submit_telemetry(flow, head, power_kw, interval_seconds=300):
    energy_kwh = power_kw * (interval_seconds / 3600)
    
    payload = {
        "plant_id": "PLANT-HP-001",
        "device_id": "TURBINE-001",
        "readings": {
            "flowRate": flow,
            "head": head,
            "generatedKwh": energy_kwh,
            "timestamp": int(time.time() * 1000)
        }
    }
    
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    
    response = requests.post(API_URL, json=payload, headers=headers)
    return response.json()

# Example
result = submit_telemetry(flow=2.5, head=45.0, power_kw=900)
print(f"Status: {result['status']}")
print(f"Trust Score: {result['trust_score']}")
```

### Node.js

```javascript
const axios = require('axios');

const API_KEY = 'ghpk_demo_key_001';
const API_URL = 'http://localhost:3000/api/v1/telemetry';

async function submitTelemetry(flow, head, powerKw, intervalSeconds = 300) {
  const energyKwh = powerKw * (intervalSeconds / 3600);
  
  const response = await axios.post(API_URL, {
    plant_id: 'PLANT-HP-001',
    device_id: 'TURBINE-001',
    readings: {
      flowRate: flow,
      head: head,
      generatedKwh: energyKwh,
      timestamp: Date.now()
    }
  }, {
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
}

// Example
submitTelemetry(2.5, 45.0, 900).then(result => {
  console.log(`Status: ${result.status}`);
  console.log(`Trust Score: ${result.trust_score}`);
});
```

### cURL

```bash
#!/bin/bash

API_KEY="ghpk_demo_key_001"
API_URL="http://localhost:3000/api/v1/telemetry"
PLANT_ID="PLANT-HP-001"
DEVICE_ID="TURBINE-001"

while true; do
  # Read from sensors (example: read from files)
  FLOW=$(cat /sys/class/sensors/flow)
  HEAD=$(cat /sys/class/sensors/head)
  POWER=$(cat /sys/class/sensors/power)
  
  # Calculate energy for 5-minute interval
  ENERGY=$(echo "$POWER * 300 / 3600" | bc -l)
  
  # Submit
  curl -X POST "$API_URL" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"plant_id\": \"$PLANT_ID\",
      \"device_id\": \"$DEVICE_ID\",
      \"readings\": {
        \"flowRate\": $FLOW,
        \"head\": $HEAD,
        \"generatedKwh\": $ENERGY
      }
    }"
  
  # Wait 5 minutes
  sleep 300
done
```

---

## Monitoring

### Prometheus Metrics

The API exposes Prometheus metrics at `/metrics`:

```
# HELP mrv_telemetry_submissions_total Total number of telemetry submissions
# TYPE mrv_telemetry_submissions_total counter
mrv_telemetry_submissions_total{status="APPROVED",plant_id="PLANT-HP-001"} 142
mrv_telemetry_submissions_total{status="FLAGGED",plant_id="PLANT-HP-001"} 3
mrv_telemetry_submissions_total{status="REJECTED",plant_id="PLANT-HP-001"} 1

# HELP mrv_hedera_tx_failures_total Total Hedera transaction failures
# TYPE mrv_hedera_tx_failures_total counter
mrv_hedera_tx_failures_total{error_type="TIMEOUT"} 0

# HELP mrv_trust_score Current trust score for plant
# TYPE mrv_trust_score gauge
mrv_trust_score{plant_id="PLANT-HP-001",device_id="TURBINE-001"} 0.9850
```

### Grafana Dashboard

Import our pre-built dashboard:
```bash
curl -O https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/monitoring/grafana-dashboard.json
```

---

## Troubleshooting

### Common Errors

**"Missing required field: flowRate"**
- Ensure all required fields are present in `readings` object
- Check validation rules: `/api/v1/telemetry/rules`

**"flowRate below minimum: 0.05 < 0.1 m³/s"**
- Sensor value out of expected range
- Verify sensor calibration
- Check MODBUS register scaling

**"Physics deviation 142.5%"**
- Generated power doesn't match flow × head × efficiency
- Check if energy meter is accumulating instead of resetting
- Verify turbine efficiency is realistic (0.7-0.9)

**"Invalid API key"**
- Check `x-api-key` header spelling
- Verify API key is correct
- Ensure key is in `VALID_API_KEYS` env var on server

**"No response from API server"**
- Check API server is running: `curl http://localhost:3000/health`
- Verify network connectivity
- Check firewall rules

---

## Support

- **GitHub Issues**: [Report bugs](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues)
- **Documentation**: [Full docs](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/tree/main/docs)
- **Email**: Contact via GitHub

---

## Next Steps

1. Run the demo locally
2. Test with your sensor data format
3. Deploy to edge gateway at plant
4. Set up monitoring dashboard
5. Schedule pilot program

See [`docs/PILOT_PLAN_6MW_PLANT.md`](./PILOT_PLAN_6MW_PLANT.md) for full integration plan.
