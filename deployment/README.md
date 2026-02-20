# Deployment Guide

This directory contains deployment scripts and configuration for production edge gateway deployment.

## Quick Start

### One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/deployment/install.sh | sudo bash -s -- \
  --plant-id PLANT-HP-001 \
  --device-id TURBINE-001 \
  --api-key ghdk_your_api_key_here \
  --ef-grid 0.82
```

### Manual Installation

1. **Install Node.js 18+**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install -y nodejs git
```

2. **Clone Repository**

```bash
sudo mkdir -p /opt/hedera-mrv
sudo git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git /opt/hedera-mrv
cd /opt/hedera-mrv
```

3. **Install Dependencies**

```bash
sudo npm ci --production
```

4. **Configure Environment**

Copy and edit `.env`:

```bash
sudo cp .env.example /opt/hedera-mrv/.env
sudo nano /opt/hedera-mrv/.env
```

Set these required variables:
- `HEDERA_OPERATOR_KEY` - Your Hedera private key
- `PLANT_ID` - Your plant identifier
- `DEVICE_ID` - Your device/turbine identifier
- `VALID_API_KEYS` - API key for authentication

5. **Install Systemd Service**

```bash
sudo cp deployment/hedera-mrv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hedera-mrv
```

6. **Start Service**

```bash
sudo systemctl start hedera-mrv
```

7. **Check Status**

```bash
sudo systemctl status hedera-mrv
sudo journalctl -u hedera-mrv -f
```

## Integration Types

### Modbus RTU/TCP

For PLCs with Modbus protocol:

1. Edit `.env`:
```bash
MODBUS_TYPE=RTU  # or TCP
MODBUS_PORT=/dev/ttyUSB0  # for RTU
MODBUS_TCP_HOST=192.168.1.10  # for TCP
MODBUS_BAUD_RATE=9600
MODBUS_SLAVE_ID=1
```

2. Edit systemd service:
```bash
sudo nano /etc/systemd/system/hedera-mrv.service
# Change ExecStart to:
# ExecStart=/usr/bin/node examples/plant-bridge-modbus.js
```

### HTTP/REST API

For PLCs with HTTP endpoints:

1. Edit `.env`:
```bash
PLC_API_BASE_URL=http://192.168.1.10:8080
PLC_API_USERNAME=admin
PLC_API_PASSWORD=your_password
```

2. Edit systemd service:
```bash
sudo nano /etc/systemd/system/hedera-mrv.service
# Change ExecStart to:
# ExecStart=/usr/bin/node examples/plant-bridge-http.js
```

## Hardware Compatibility

### Tested Platforms

- ✅ Raspberry Pi 4 (4GB+) with Raspbian/Ubuntu
- ✅ Advantech UNO-2272G (Ubuntu 20.04)
- ✅ Siemens SIMATIC IOT2050 (Ubuntu 20.04)
- ✅ Generic x86_64 Linux (Ubuntu 20.04+, Debian 11+)

### Hardware Requirements

- **CPU**: ARM Cortex-A72 or x86_64
- **RAM**: 2GB minimum (4GB recommended)
- **Storage**: 4GB minimum
- **Network**: Ethernet (recommended) or Wi-Fi
- **Serial**: USB-to-RS485 adapter (for Modbus RTU)

## Monitoring

### Check Service Status

```bash
sudo systemctl status hedera-mrv
```

### View Logs

```bash
# Real-time logs
sudo journalctl -u hedera-mrv -f

# Last 100 lines
sudo journalctl -u hedera-mrv -n 100

# Logs from today
sudo journalctl -u hedera-mrv --since today
```

### Metrics Endpoint

Prometheus metrics are exposed on port 3000:

```bash
curl http://localhost:3000/metrics
```

## Troubleshooting

### Service Won't Start

1. Check configuration:
```bash
sudo cat /opt/hedera-mrv/.env
```

2. Check permissions:
```bash
sudo chown -R root:root /opt/hedera-mrv
sudo chmod 600 /opt/hedera-mrv/.env
```

3. Check logs:
```bash
sudo journalctl -u hedera-mrv -n 50 --no-pager
```

### Modbus Connection Failed

1. Check serial port:
```bash
ls -l /dev/ttyUSB*
sudo usermod -a -G dialout root
```

2. Test Modbus manually:
```bash
sudo npm install -g modbus-cli
modbus-cli read -a 100 -l 1 /dev/ttyUSB0 --baud 9600
```

### Hedera Transaction Failures

1. Check account balance:
```bash
# Visit https://portal.hedera.com/
# Check your account has sufficient testnet HBAR
```

2. Verify credentials:
```bash
sudo grep HEDERA_OPERATOR /opt/hedera-mrv/.env
```

## Updates

### Update MRV Software

```bash
cd /opt/hedera-mrv
sudo git pull origin main
sudo npm ci --production
sudo systemctl restart hedera-mrv
```

### Backup Configuration

```bash
sudo cp /opt/hedera-mrv/.env /opt/hedera-mrv/.env.backup
```

## Security

### Firewall Rules

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow metrics (if accessing externally)
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

### Secure .env File

```bash
sudo chmod 600 /opt/hedera-mrv/.env
sudo chown root:root /opt/hedera-mrv/.env
```

## Support

For issues or questions:
- GitHub: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues
- Documentation: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/tree/main/docs
