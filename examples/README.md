# Plant Bridge Examples

These example scripts demonstrate how to integrate the Hedera Hydropower MRV system with real plant SCADA/PLC systems.

## Available Examples

### 1. Modbus Integration (`plant-bridge-modbus.js`)

For plants with Modbus RTU/TCP sensors (most common in industrial settings).

**Hardware:**
- Edge gateway (Raspberry Pi 4 or industrial)
- Modbus RTU/TCP flowmeter, pressure sensor, power meter
- RS485/Ethernet connection

**Setup:**
```bash
# Install dependencies (including optional modbus library)
npm install

# Configure .env
MODBUS_TYPE=RTU  # or TCP
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUD_RATE=9600
MODBUS_SLAVE_ID=1
POLL_INTERVAL=300000  # 5 minutes in milliseconds
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82

# Run using npm script (recommended)
npm run bridge:modbus

# Or run directly
node examples/plant-bridge-modbus.js
```

**Modbus Register Map:**

Edit the `CONFIG.registers` object in the script to match your PLC manual:

```javascript
const CONFIG = {
  registers: {
    flowRate: { address: 100, scale: 100 },      // Adjust address & scale
    headPressure: { address: 102, scale: 100 },
    activePower: { address: 104, scale: 1 },
    pH: { address: 106, scale: 100 },
    turbidity: { address: 108, scale: 10 }
  }
};
```

### 2. HTTP API Integration (`plant-bridge-http.js`)

For plants with modern SCADA systems that expose REST APIs.

**Hardware:**
- Any server/gateway with network access to SCADA
- SCADA system with HTTP API enabled

**Setup:**
```bash
# Install dependencies (including optional axios library)
npm install

# Configure .env
PLC_API_BASE_URL=http://192.168.1.10:8080
PLC_API_USERNAME=admin
PLC_API_PASSWORD=your_password
PLC_API_TIMEOUT=10000
POLL_INTERVAL=300000
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82

# Run using npm script (recommended)
npm run bridge:http

# Or run directly
node examples/plant-bridge-http.js
```

**API Endpoint Mapping:**

Edit the `CONFIG.endpoints` object to match your PLC's API:

```javascript
const endpoints = {
  flowRate: '/api/sensors/flow',
  headPressure: '/api/sensors/pressure',
  activePower: '/api/sensors/power',
  pH: '/api/sensors/ph',
  turbidity: '/api/sensors/turbidity'
};
```

## Features

Both examples include:

✅ **Pre-submission validation** - Catches bad data before sending to blockchain  
✅ **No silent defaults** - Optional fields remain undefined if not present  
✅ **Error logging** - Failed readings logged to `BACKUP_LOG_PATH`  
✅ **Graceful shutdown** - Ctrl+C cleanly closes connections  
✅ **Retry logic** - Workflow handles Hedera transaction retries automatically  
✅ **Unit conversion** - Handles pressure→head, power→energy conversions  
✅ **Continuous polling** - Runs at configured interval

## Production Deployment

### Option 1: One-Command Installer (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/deployment/install.sh | sudo bash -s -- \
  --plant-id PLANT-HP-001 \
  --device-id TURBINE-001 \
  --api-key ghdk_your_key \
  --ef-grid 0.82
```

This automatically:
- Installs Node.js
- Clones the repository
- Installs dependencies
- Creates `.env` file
- Sets up systemd service
- Configures logging

See [`deployment/README.md`](../deployment/README.md) for full details.

### Option 2: Manual systemd Service

Create `/etc/systemd/system/hedera-mrv.service`:

```ini
[Unit]
Description=Hedera Hydropower MRV Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hedera-mrv
EnvironmentFile=/opt/hedera-mrv/.env
ExecStart=/usr/bin/node examples/plant-bridge-modbus.js
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable hedera-mrv
sudo systemctl start hedera-mrv
sudo journalctl -u hedera-mrv -f  # Watch logs
```

### Option 3: Docker Container (Future)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "examples/plant-bridge-modbus.js"]
```

Build and run:
```bash
docker build -t hedera-mrv .
docker run -d --name mrv-bridge \
  --device=/dev/ttyUSB0 \
  --env-file .env \
  --restart unless-stopped \
  hedera-mrv
```

## Troubleshooting

### Modbus Connection Fails

```bash
# Check USB device
ls -l /dev/ttyUSB*

# Check permissions
sudo usermod -a -G dialout $USER
# (logout and login again)

# Test with pymodbus
sudo apt install python3-pip
pip3 install pymodbus
pymodbus.console serial --port /dev/ttyUSB0 --baudrate 9600
```

### HTTP API Connection Fails

```bash
# Test API manually
curl http://192.168.1.10:8080/api/sensors/flow

# Test with authentication
curl -u admin:password http://192.168.1.10:8080/api/sensors/flow

# Check network connectivity
ping 192.168.1.10
```

### Validation Failures

Check the backup log:

```bash
tail -f /var/log/hedera-mrv/failed-readings.log
```

Common issues:
- **Flow rate out of range** → Check sensor calibration or adjust `CONFIG.registers` scale
- **Negative power** → Check CT orientation or scale factor
- **Missing timestamp** → Ensure system time is synced (install `ntpd` or `chrony`)
- **Head pressure unrealistic** → Verify bar→meters conversion (1 bar ≈ 10.2m)

### Service Won't Start

```bash
# Check service status
sudo systemctl status hedera-mrv

# View recent logs
sudo journalctl -u hedera-mrv -n 50 --no-pager

# Check .env file
sudo cat /opt/hedera-mrv/.env

# Verify Node.js version
node --version  # Should be 18+
```

## Monitoring

### View Live Logs

```bash
# Follow all logs
sudo journalctl -u hedera-mrv -f

# Filter by log level (errors only)
sudo journalctl -u hedera-mrv -p err

# Logs from last hour
sudo journalctl -u hedera-mrv --since "1 hour ago"
```

### Prometheus Metrics

The system exposes metrics on port 3000:

```bash
curl http://localhost:3000/metrics
```

Key metrics:
- `mrv_telemetry_submissions_total` - Total submissions by status
- `mrv_verification_duration_seconds` - Verification latency
- `mrv_trust_score` - Current trust score
- `mrv_hedera_tx_failures_total` - Transaction failures by error type

## Customization

Both scripts are templates designed to be customized:

### 1. Register Addresses

Match your PLC manual:

```javascript
const CONFIG = {
  registers: {
    flowRate: { address: 40100, scale: 100 },     // Your PLC address
    headPressure: { address: 40102, scale: 100 },
    activePower: { address: 40104, scale: 1 },
    // ... add more sensors
  }
};
```

### 2. Unit Conversions

Adjust for your sensor outputs:

```javascript
// If your pressure sensor outputs PSI instead of bar
const headMeters = pressurePsi * 0.703;  // 1 PSI ≈ 0.703m

// If your flow sensor outputs gallons/minute
const flowM3s = flowGPM * 0.0000631;  // 1 GPM = 6.31e-5 m³/s
```

### 3. Polling Interval

Balance freshness vs network/blockchain costs:

```bash
# Test/pilot: 1 minute (288 TX/day = $0.0288/day)
POLL_INTERVAL=60000

# Production: 5 minutes (288 TX/day = $0.0288/day)
POLL_INTERVAL=300000

# Low bandwidth: 15 minutes (96 TX/day = $0.0096/day)
POLL_INTERVAL=900000
```

### 4. Alerting

Add webhook or email notifications:

```javascript
if (result.verificationStatus === 'REJECTED') {
  // Send alert
  await sendAlert(`Reading rejected: ${result.trustScore}`);
}
```

## Documentation

For more details:

- **[Edge Gateway Integration Guide](../docs/EDGE_GATEWAY_INTEGRATION.md)** - Complete hardware and protocol guide
- **[Pilot Plan](../docs/PILOT_PLAN_6MW_PLANT.md)** - 6 MW plant deployment walkthrough
- **[Deployment Guide](../deployment/README.md)** - Installation and operations
- **[Production Roadmap](../PRODUCTION_READINESS_ROADMAP.md)** - Enterprise features

## Support

For integration help:

- **GitHub Issues**: [Report bugs or request features](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues)
- **Discussions**: [Ask questions](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/discussions)

---

**Ready to deploy? Start with the [Pilot Plan](../docs/PILOT_PLAN_6MW_PLANT.md)!** 🚀
