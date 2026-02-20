# Edge Gateway Integration Guide

This guide covers integrating the Hedera MRV system with your hydropower plant's existing PLC/SCADA infrastructure.

---

## Overview

The MRV system runs on an **edge gateway** (industrial computer or Raspberry Pi) that:

1. **Reads sensor data** from your PLC/SCADA via Modbus, HTTP, or other protocols
2. **Validates telemetry** to ensure data quality
3. **Submits to Hedera** for blockchain verification and carbon credit issuance
4. **Exposes metrics** for monitoring and alerting

```
┌────────────────────┐
│  Sensors & PLC      │
│  (Flow, Head, etc.) │
└────────┬───────────┘
         │ Modbus/HTTP
         ▼
┌────────────────────┐
│   Edge Gateway      │
│ (RPi/Industrial PC)│
│                    │
│  • MRV Software    │
│  • Validation      │
│  • Local Backup   │
└────────┬───────────┘
         │ HTTPS
         ▼
┌────────────────────┐
│  Hedera Testnet    │
│  (HCS + HTS)       │
└────────────────────┘
```

---

## Hardware Options

### Option A: Raspberry Pi 4 (₹38K total)

**Pros:**
- Low cost
- Easy to replace if damaged
- Large developer community
- Works with most USB-to-RS485 adapters

**Cons:**
- Not industrial-rated (0–50°C vs ‑40 to +75°C)
- SD card reliability (use industrial-grade SD or SSD)
- Requires separate enclosure

**Bill of Materials:**

| Item | Cost | Link |
|------|------|------|
| Raspberry Pi 4 (4GB) | ₹6,500 | [robu.in](https://robu.in) |
| Waveshare RS485/CAN HAT | ₹2,000 | [Waveshare](https://www.waveshare.com) |
| 32GB Industrial SD Card | ₹1,500 | SanDisk High Endurance |
| 24V→5V Power Supply | ₹1,500 | Mean Well HDR-15-5 |
| DIN Rail Enclosure (IP65) | ₹2,000 | Phoenix Contact |
| USB-to-RS485 Adapter | ₹800 | Generic (CH340 chip) |
| Ethernet Cable (10m) | ₹500 | Cat6 |
| **Total** | **₹14,800** | |

### Option B: Industrial Edge Gateway (₹60K total)

**Pros:**
- Industrial temperature range (‑40 to +75°C)
- Ruggedized design (vibration, humidity resistant)
- Built-in RS485/RS232 ports
- DIN rail mounting
- 5-year MTBF

**Cons:**
- Higher upfront cost
- Requires technical procurement

**Recommended Models:**

| Model | Cost | Specs | Supplier |
|-------|------|-------|----------|
| Advantech UNO-2272G | ₹45,000 | Intel Atom, 4GB RAM, Linux | [Advantech India](https://www.advantech.com/en/contact/india) |
| Siemens SIMATIC IOT2050 | ₹52,000 | ARM Cortex-A53, 2GB RAM, Ubuntu | [Siemens India](https://new.siemens.com/in/en.html) |
| Maple Edge-III | ₹38,000 | ARM Cortex-A53, 2GB RAM, Linux | [Maple Systems](https://www.maplesystems.com) |

---

## Integration Protocols

### 1. Modbus RTU (Serial)

**Use case:** PLC with RS485 serial port

**Hardware:**
- USB-to-RS485 adapter or RS485 HAT
- Twisted pair cable (2-wire or 4-wire)

**Configuration:**

```bash
# .env
MODBUS_TYPE=RTU
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUD_RATE=9600
MODBUS_SLAVE_ID=1
```

**Register Mapping Example:**

| Sensor | Register | Data Type | Scale | Unit |
|--------|----------|-----------|-------|------|
| Flow Rate | 40100 | UINT16 | /100 | m³/s |
| Head Pressure | 40102 | UINT16 | /100 | bar |
| Active Power | 40104 | UINT16 | ×1 | kW |
| pH | 40106 | UINT16 | /100 | pH |
| Turbidity | 40108 | UINT16 | /10 | NTU |

**Run:**

```bash
npm run bridge:modbus
```

### 2. Modbus TCP (Ethernet)

**Use case:** PLC with Ethernet port supporting Modbus TCP

**Hardware:**
- Ethernet cable to PLC
- No additional adapters needed

**Configuration:**

```bash
# .env
MODBUS_TYPE=TCP
MODBUS_TCP_HOST=192.168.1.10
MODBUS_TCP_PORT=502
MODBUS_SLAVE_ID=1
```

**Run:**

```bash
npm run bridge:modbus
```

### 3. HTTP/REST API

**Use case:** Modern PLC with built-in web server (Siemens S7-1500, Allen-Bradley, etc.)

**Configuration:**

```bash
# .env
PLC_API_BASE_URL=http://192.168.1.10:8080
PLC_API_USERNAME=admin
PLC_API_PASSWORD=your_password
PLC_API_TIMEOUT=10000
```

**API Endpoint Mapping:**

Edit `examples/plant-bridge-http.js` to match your PLC's API:

```javascript
const endpoints = {
  flowRate: '/api/sensors/flow',
  headPressure: '/api/sensors/pressure',
  activePower: '/api/sensors/power',
  pH: '/api/sensors/ph',
  turbidity: '/api/sensors/turbidity'
};
```

**Run:**

```bash
npm run bridge:http
```

### 4. OPC-UA (Coming Soon)

**Use case:** Industrial automation with OPC-UA servers

**Status:** Planned for Phase 3

---

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/deployment/install.sh | sudo bash -s -- \
  --plant-id PLANT-HP-001 \
  --device-id TURBINE-001 \
  --api-key ghdk_your_key \
  --ef-grid 0.82
```

### Manual Install

See [`deployment/README.md`](../deployment/README.md) for detailed steps.

---

## Configuration

### Required Environment Variables

```bash
# Hedera Network
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=<your_private_key>
AUDIT_TOPIC_ID=0.0.7462776
REC_TOKEN_ID=0.0.7964264

# Plant Identification
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82  # India grid emission factor

# Authentication
VALID_API_KEYS=ghdk_abc123,ghdk_xyz789

# Polling
POLL_INTERVAL=300000  # 5 minutes (in milliseconds)
```

### Optional Variables

```bash
# Monitoring
PORT=3000
LOG_LEVEL=info

# Backup
BACKUP_LOG_PATH=/var/log/hedera-mrv/failed-readings.log
```

---

## Sensor Mapping

You need to map your PLC's data points to the MRV system's expected format.

### Required Sensors

| Sensor | Description | Range | Unit |
|--------|-------------|-------|------|
| **flowRate** | Water flow through turbine | 0–100 | m³/s |
| **head** | Water head height | 0–500 | meters |
| **generatedKwh** | Energy generated in poll interval | 0–∞ | kWh |
| **timestamp** | Reading timestamp | ISO 8601 | string |

### Optional Sensors

| Sensor | Description | Range | Unit |
|--------|-------------|-------|------|
| **pH** | Water pH level | 0–14 | pH |
| **turbidity** | Water turbidity | 0–1000 | NTU |
| **temperature** | Water temperature | 0–50 | °C |
| **efficiency** | Turbine efficiency | 0–100 | % |

**Note:** Optional fields should be `undefined` if not available. **NO silent defaults** — the system will flag missing optional data in logs.

---

## Unit Conversions

### Pressure to Head

```javascript
// 1 bar ≈ 10.2 meters of water column
const headMeters = pressureBar * 10.2;
```

### Power to Energy

```javascript
// kW × hours → kWh
const pollIntervalHours = POLL_INTERVAL / 3600000;
const generatedKwh = activePowerKw * pollIntervalHours;

// Example: 900 kW for 5 minutes
// 900 × (5/60) = 75 kWh
```

### Scaling Raw Values

```javascript
// Many PLCs send scaled integers
const flowRate = rawValue / 100;  // e.g., 250 → 2.50 m³/s
const pH = rawValue / 100;         // e.g., 720 → 7.20 pH
```

---

## Validation

All telemetry is validated before submission:

### Validation Rules

1. **Required fields** must be present and finite numbers
2. **Range checks** (flow: 0–100 m³/s, head: 0–500 m, etc.)
3. **Timestamp** must be within 24 hours of current time
4. **Optional fields** can be `undefined` (will use AI Guardian defaults)

### Example Validation Output

**Valid reading:**

```
[Validation] ✓ PASSED
[Validation] Warnings: Optional field pH not provided - will use AI Guardian defaults
[MRV] Submitting to Hedera...
[MRV] ✓ Status: APPROVED | Trust: 0.9850 | TX: 0.0.6255927@1708387201
```

**Invalid reading:**

```
[Validation] ✗ FAILED
[Validation] Errors:
  - flowRate out of range: 150 m³/s (expected 0-100)
  - generatedKwh cannot be negative: -50
[Backup] Logged to /var/log/hedera-mrv/failed-readings.log
```

---

## Monitoring

### System Logs

```bash
# Real-time logs
sudo journalctl -u hedera-mrv -f

# Filter by log level
sudo journalctl -u hedera-mrv -p err

# Last 24 hours
sudo journalctl -u hedera-mrv --since "24 hours ago"
```

### Prometheus Metrics

Exposed on `http://localhost:3000/metrics`:

```
# Telemetry submissions by status
mrv_telemetry_submissions_total{plant_id="PLANT-HP-001",device_id="TURBINE-001",status="APPROVED"} 288
mrv_telemetry_submissions_total{plant_id="PLANT-HP-001",device_id="TURBINE-001",status="REJECTED"} 2

# Verification latency
mrv_verification_duration_seconds_bucket{plant_id="PLANT-HP-001",le="1"} 285

# Hedera transaction failures
mrv_hedera_tx_failures_total{error_type="TRANSACTION_EXPIRED"} 0
mrv_hedera_tx_failures_total{error_type="TIMEOUT"} 1

# Current trust score
mrv_trust_score{plant_id="PLANT-HP-001",device_id="TURBINE-001"} 0.9850
```

### Grafana Dashboard (Optional)

Import the pre-built dashboard:

```bash
# Coming soon: grafana/dashboard.json
```

---

## Troubleshooting

### Issue: Service Won't Start

**Check logs:**

```bash
sudo journalctl -u hedera-mrv -n 50 --no-pager
```

**Common causes:**
- Missing `HEDERA_OPERATOR_KEY` in `.env`
- Invalid `.env` file permissions (should be `600`)
- Node.js version < 18

### Issue: Modbus Connection Failed

**Check serial port:**

```bash
ls -l /dev/ttyUSB*
# Should show: crw-rw---- 1 root dialout ...

sudo usermod -a -G dialout $USER
# Logout and login again
```

**Test Modbus manually:**

```bash
sudo apt install python3-pip
pip3 install pymodbus
pymodbus.console serial --port /dev/ttyUSB0 --baudrate 9600
```

### Issue: Hedera Transaction Timeout

**Check network:**

```bash
ping -c 4 testnet.hedera.com
```

**Check account balance:**

Visit [Hedera Portal](https://portal.hedera.com/) and verify your testnet account has ℏ balance.

### Issue: All Readings Rejected

**Check AI Guardian sensitivity:**

Edit `src/engine/v1/engine-v1.js` and adjust weights:

```javascript
const weights = {
  physics: 0.30,       // default
  temporal: 0.20,      // reduce if seeing false positives
  environmental: 0.20,
  statistical: 0.15,
  device: 0.15
};
```

**Restart service:**

```bash
sudo systemctl restart hedera-mrv
```

---

## Security Best Practices

### 1. Secure .env File

```bash
sudo chmod 600 /opt/hedera-mrv/.env
sudo chown root:root /opt/hedera-mrv/.env
```

### 2. Firewall Rules

```bash
# Allow SSH only
sudo ufw allow 22/tcp

# If exposing metrics externally
sudo ufw allow 3000/tcp comment 'Prometheus metrics'

sudo ufw enable
```

### 3. Use API Keys

Never hardcode credentials in scripts. Always use `.env`:

```bash
VALID_API_KEYS=ghdk_abc123,ghdk_xyz789
```

### 4. Network Isolation

Place edge gateway on isolated VLAN with:
- Access to PLC/SCADA
- Internet access for Hedera
- No access to corporate network

---

## Performance Tuning

### Poll Interval

Default: 5 minutes (300,000 ms)

```bash
# For pilot/testing: 1 minute
POLL_INTERVAL=60000

# For production: 5 minutes
POLL_INTERVAL=300000

# For low-bandwidth: 15 minutes
POLL_INTERVAL=900000
```

**Hedera cost impact:**
- 5-minute polling: ~288 transactions/day = $0.0288/day
- 15-minute polling: ~96 transactions/day = $0.0096/day

### Memory Usage

Typical: 150–250 MB RAM

```bash
# Check memory
free -h

# Check process memory
top -p $(pgrep -f hedera-mrv)
```

---

## Support

### Documentation

- [Pilot Plan](PILOT_PLAN_6MW_PLANT.md) - Full deployment guide
- [Production Roadmap](../PRODUCTION_READINESS_ROADMAP.md) - Enterprise features
- [Deployment Guide](../deployment/README.md) - Installation details

### Community

- **GitHub Issues**: [Report bugs or request features](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues)
- **Discussions**: [Ask questions](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/discussions)

---

## Next Steps

1. ✅ **Hardware setup** - Install edge gateway near PLC
2. ✅ **Network config** - Connect to PLC and internet
3. ✅ **Software install** - Run one-command installer
4. ✅ **Sensor mapping** - Configure register addresses
5. ✅ **Test run** - Submit first telemetry reading
6. ✅ **Monitor** - Watch logs and metrics for 24 hours
7. ✅ **Production** - Enable systemd service for continuous operation

**You're ready to start your pilot!** 🚀
