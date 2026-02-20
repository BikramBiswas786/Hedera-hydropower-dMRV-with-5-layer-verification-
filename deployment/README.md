# Deployment Guide

This directory contains scripts and configuration files for production deployment of the Hedera Hydropower MRV system on edge gateways.

## Quick Start

### Automated Installation

The installation script automates the entire setup process:

```bash
# Download and run installer
curl -fsSL https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/deployment/install.sh | sudo bash
```

Or clone first:

```bash
git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git
cd https-github.com-BikramBiswas786-hedera-hydropower-mrv
sudo bash deployment/install.sh
```

### What the Installer Does

1. Checks/installs Node.js 18+
2. Checks/installs Git
3. Clones repository to `/opt/hedera-hydropower-mrv`
4. Installs npm dependencies
5. Creates dedicated `mrv` system user
6. Sets up data directory with correct permissions
7. Creates `.env` from template
8. (Optional) Installs systemd service

### Tested Platforms

✅ Raspberry Pi OS (Bullseye, Bookworm)  
✅ Ubuntu 20.04 LTS  
✅ Ubuntu 22.04 LTS  
✅ Debian 11 (Bullseye)  
✅ Debian 12 (Bookworm)

Should work on any Debian/Ubuntu-based system.

## Manual Installation

If you prefer manual control:

### 1. Install Prerequisites

```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git

# Verify
node -v  # Should be v18.x or higher
npm -v
```

### 2. Clone Repository

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git hedera-hydropower-mrv
cd hedera-hydropower-mrv
```

### 3. Install Dependencies

```bash
sudo npm install --production

# For Modbus support
sudo npm install modbus-serial

# For HTTP API support
sudo npm install axios
```

### 4. Create System User

```bash
sudo useradd -r -s /bin/false -d /opt/hedera-hydropower-mrv mrv
sudo chown -R mrv:mrv /opt/hedera-hydropower-mrv
```

### 5. Configure Environment

```bash
sudo cp .env.example .env
sudo nano .env
```

Edit these critical variables:

```bash
# Hedera Credentials (get from portal.hedera.com)
HEDERA_OPERATOR_ID=0.0.YOUR_ACCOUNT
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...
AUDIT_TOPIC_ID=0.0.YOUR_TOPIC
REC_TOKEN_ID=0.0.YOUR_TOKEN

# Plant Configuration
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001
EF_GRID=0.82  # India grid emission factor

# API Authentication
VALID_API_KEYS=your_secure_api_key_here

# Modbus (if using)
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUDRATE=9600
```

### 6. Install Systemd Service

```bash
sudo cp deployment/hedera-mrv.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hedera-mrv
```

### 7. Start Service

```bash
sudo systemctl start hedera-mrv
sudo systemctl status hedera-mrv
```

## Service Management

### Start/Stop/Restart

```bash
sudo systemctl start hedera-mrv    # Start service
sudo systemctl stop hedera-mrv     # Stop service
sudo systemctl restart hedera-mrv  # Restart service
sudo systemctl status hedera-mrv   # Check status
```

### View Logs

```bash
# Follow live logs
sudo journalctl -u hedera-mrv -f

# Last 100 lines
sudo journalctl -u hedera-mrv -n 100

# Logs since boot
sudo journalctl -u hedera-mrv -b

# Logs for specific date
sudo journalctl -u hedera-mrv --since "2026-02-20"
```

### Enable/Disable Auto-Start

```bash
sudo systemctl enable hedera-mrv   # Start on boot
sudo systemctl disable hedera-mrv  # Don't start on boot
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status hedera-mrv

# Check logs
sudo journalctl -u hedera-mrv -n 50

# Test manually
cd /opt/hedera-hydropower-mrv
sudo -u mrv node examples/plant-bridge-modbus.js
```

### Modbus Connection Issues

```bash
# Check USB device exists
ls -l /dev/ttyUSB*

# Grant permissions
sudo usermod -a -G dialout mrv
sudo chmod 666 /dev/ttyUSB0

# Test Modbus connection
npx modbus-cli read -a 1 -p /dev/ttyUSB0 -b 9600 -r 100
```

### Permission Errors

```bash
# Fix ownership
sudo chown -R mrv:mrv /opt/hedera-hydropower-mrv

# Fix data directory
sudo chmod 770 /opt/hedera-hydropower-mrv/data
```

### Hedera Transaction Failures

Check:
1. HEDERA_OPERATOR_KEY is correct (302e... format)
2. Account has HBAR balance (get from faucet)
3. AUDIT_TOPIC_ID exists and is accessible
4. Network connectivity to Hedera nodes

```bash
# Test Hedera connection
cd /opt/hedera-hydropower-mrv
node -e "require('dotenv').config(); const {Client} = require('@hashgraph/sdk'); const c = Client.forTestnet().setOperator(process.env.HEDERA_OPERATOR_ID, process.env.HEDERA_OPERATOR_KEY); console.log('Connected:', c.operatorAccountId.toString());"
```

## Updating

### Update Code

```bash
cd /opt/hedera-hydropower-mrv
sudo -u mrv git pull origin main
sudo -u mrv npm install --production
sudo systemctl restart hedera-mrv
```

### Update Configuration

```bash
sudo nano /opt/hedera-hydropower-mrv/.env
sudo systemctl restart hedera-mrv
```

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop hedera-mrv
sudo systemctl disable hedera-mrv
sudo rm /etc/systemd/system/hedera-mrv.service
sudo systemctl daemon-reload

# Remove files
sudo rm -rf /opt/hedera-hydropower-mrv

# Remove user
sudo userdel mrv
```

## Security Best Practices

1. **Never commit .env to Git** - It contains private keys
2. **Use strong API keys** - Generate with `openssl rand -hex 32`
3. **Limit SSH access** - Use SSH keys, not passwords
4. **Keep Node.js updated** - Run `sudo apt update && sudo apt upgrade` regularly
5. **Monitor logs** - Set up log rotation and monitoring
6. **Backup data directory** - `/opt/hedera-hydropower-mrv/data` contains audit logs

## Production Checklist

Before going live:

- [ ] `.env` configured with real credentials
- [ ] Modbus registers match PLC manual
- [ ] Sensors calibrated within 6-12 months
- [ ] Test readings submitted successfully
- [ ] Service auto-starts on boot
- [ ] Logs monitored (setup log forwarding)
- [ ] Backup strategy in place
- [ ] Firewall configured (if needed)
- [ ] Network connectivity stable
- [ ] Documentation updated with plant-specific details

## Support

For deployment issues:
- GitHub Issues: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/issues
- Documentation: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/docs/PILOT_PLAN_6MW_PLANT.md
