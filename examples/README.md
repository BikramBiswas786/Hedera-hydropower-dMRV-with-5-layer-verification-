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
# Install Modbus library
npm install modbus-serial

# Configure .env
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUDRATE=9600
MODBUS_SLAVE_ID=1
POLLING_INTERVAL_MS=300000  # 5 minutes
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82

# Run
node examples/plant-bridge-modbus.js
```

**Modbus Register Map:**

Edit the `REGISTERS` object in the script to match your PLC manual:

```javascript
const REGISTERS = {
  FLOW_RATE: 100,      // Your PLC address for flow rate
  HEAD_PRESSURE: 102,  // Your PLC address for pressure
  ACTIVE_POWER: 104,   // Your PLC address for power
  PH: 106,             // Optional
  TURBIDITY: 108       // Optional
};
```

### 2. HTTP API Integration (`plant-bridge-http.js`)

For plants with modern SCADA systems that expose REST APIs.

**Hardware:**
- Any server/gateway with network access to SCADA
- SCADA system with HTTP API enabled

**Setup:**
```bash
# Install HTTP library
npm install axios

# Configure .env
SCADA_API_URL=http://192.168.1.100/api/telemetry
SCADA_API_KEY=your_api_key_if_needed
POLLING_INTERVAL_MS=300000
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82

# Run
node examples/plant-bridge-http.js
```

**API Response Format:**

The script expects SCADA API to return JSON like:
```json
{
  "flow_rate_m3s": 2.5,
  "head_pressure_bar": 4.4,
  "active_power_kw": 900,
  "ph": 7.2,
  "turbidity_ntu": 12,
  "timestamp": "2026-02-20T10:30:00Z"
}
```

Edit the mapping in `fetchSCADAData()` to match your API format.

## Features

Both examples include:

✅ **Pre-submission validation** - Catches bad data before sending to blockchain  
✅ **No silent defaults** - Optional fields remain undefined if not present  
✅ **Error logging** - Failed readings logged to `data/failed-readings.log`  
✅ **Backup logging** - Approved readings logged to `data/approved-readings.log`  
✅ **Graceful shutdown** - Ctrl+C cleanly closes connections  
✅ **Retry logic** - Workflow handles Hedera transaction retries automatically

## Production Deployment

### As systemd Service

Create `/etc/systemd/system/hedera-mrv.service`:

```ini
[Unit]
Description=Hedera Hydropower MRV Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hedera-hydropower-mrv
EnvironmentFile=/opt/hedera-hydropower-mrv/.env
ExecStart=/usr/bin/node examples/plant-bridge-modbus.js
Restart=on-failure
RestartSec=10s

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

### As Docker Container

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
docker run -d --name mrv-bridge --device=/dev/ttyUSB0 --env-file .env hedera-mrv
```

## Troubleshooting

### Modbus Connection Fails

```bash
# Check USB device
ls -l /dev/ttyUSB*

# Check permissions
sudo chmod 666 /dev/ttyUSB0

# Test with modbus-cli
npx modbus-cli read -a 1 -p /dev/ttyUSB0 -b 9600 -r 100
```

### HTTP API Connection Fails

```bash
# Test API manually
curl -H "Authorization: Bearer YOUR_KEY" http://192.168.1.100/api/telemetry

# Check firewall
sudo ufw status
```

### Validation Failures

Check `data/failed-readings.log` for details:

```bash
tail -f data/failed-readings.log
```

Common issues:
- Flow rate out of range → Check sensor calibration
- Negative power → Check CT orientation
- Missing timestamp → Ensure time sync (NTP)

## Customization

Both scripts are templates. Modify:

1. **Register addresses** - Match your PLC manual
2. **Data mapping** - Adjust unit conversions
3. **Polling interval** - Balance freshness vs network load
4. **Error handling** - Add alerting (email, SMS, webhook)

## Support

For integration help, open an issue: [GitHub Issues](https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues)
