#!/bin/bash
#
# Hedera Hydropower MRV - One-Command Installer
# Usage: curl -fsSL https://install.hydropower-mrv.io/setup.sh | sudo bash -s -- --plant-id PLANT-001 --api-key ghdk_xyz
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/opt/hedera-mrv"
NODE_VERSION="18"
REPO_URL="https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git"
BRANCH="main"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --plant-id)
      PLANT_ID="$2"
      shift 2
      ;;
    --device-id)
      DEVICE_ID="$2"
      shift 2
      ;;
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --ef-grid)
      EF_GRID="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required params
if [ -z "$PLANT_ID" ]; then
  echo -e "${RED}Error: --plant-id is required${NC}"
  exit 1
fi

if [ -z "$API_KEY" ]; then
  echo -e "${RED}Error: --api-key is required${NC}"
  exit 1
fi

# Set defaults for optional params
DEVICE_ID=${DEVICE_ID:-"TURBINE-001"}
EF_GRID=${EF_GRID:-"0.82"}

echo -e "${GREEN}=== Hedera Hydropower MRV Installer ===${NC}"
echo "Plant ID: $PLANT_ID"
echo "Device ID: $DEVICE_ID"
echo "Install Directory: $INSTALL_DIR"
echo "Branch: $BRANCH"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  VER=$VERSION_ID
else
  echo -e "${RED}Error: Cannot detect OS${NC}"
  exit 1
fi

echo -e "${GREEN}[1/7] Detected OS: $OS $VER${NC}"

# Install Node.js
echo -e "${GREEN}[2/7] Installing Node.js $NODE_VERSION...${NC}"
if ! command -v node &> /dev/null; then
  if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ] || [ "$OS" = "raspbian" ]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs git
  elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    yum install -y nodejs git
  else
    echo -e "${YELLOW}Warning: Unsupported OS for auto Node.js install. Please install Node.js $NODE_VERSION manually.${NC}"
    exit 1
  fi
else
  echo "Node.js already installed: $(node --version)"
fi

# Clone repository
echo -e "${GREEN}[3/7] Cloning MRV repository...${NC}"
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Warning: $INSTALL_DIR already exists. Pulling latest...${NC}"
  cd "$INSTALL_DIR"
  git pull origin "$BRANCH"
else
  git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
echo -e "${GREEN}[4/7] Installing npm dependencies...${NC}"
npm ci --production

# Create .env file
echo -e "${GREEN}[5/7] Creating .env configuration...${NC}"
cat > "$INSTALL_DIR/.env" <<EOF
# Hedera Network Configuration
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=
AUDIT_TOPIC_ID=0.0.7462776
REC_TOKEN_ID=0.0.7964264

# Plant Configuration
PLANT_ID=$PLANT_ID
DEVICE_ID=$DEVICE_ID
EF_GRID=$EF_GRID

# API Authentication
VALID_API_KEYS=$API_KEY

# Modbus Configuration (if using Modbus bridge)
MODBUS_TYPE=RTU
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUD_RATE=9600
MODBUS_SLAVE_ID=1

# HTTP API Configuration (if using HTTP bridge)
PLC_API_BASE_URL=http://192.168.1.10:8080
PLC_API_USERNAME=admin
PLC_API_PASSWORD=admin

# Monitoring
PORT=3000
LOG_LEVEL=info
POLL_INTERVAL=300000

# Backup
BACKUP_LOG_PATH=/var/log/hedera-mrv/failed-readings.log
EOF

chmod 600 "$INSTALL_DIR/.env"

echo -e "${YELLOW}Note: Update HEDERA_OPERATOR_KEY in $INSTALL_DIR/.env with your private key${NC}"

# Create log directory
mkdir -p /var/log/hedera-mrv

# Install systemd service
echo -e "${GREEN}[6/7] Installing systemd service...${NC}"
cat > /etc/systemd/system/hedera-mrv.service <<EOF
[Unit]
Description=Hedera Hydropower MRV Edge Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node examples/plant-bridge-modbus.js
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal

# Environment
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Enable but don't start yet
echo -e "${GREEN}[7/7] Enabling service...${NC}"
systemctl enable hedera-mrv

echo ""
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit $INSTALL_DIR/.env and add your HEDERA_OPERATOR_KEY"
echo "2. Configure Modbus/HTTP settings in .env"
echo "3. Start the service: sudo systemctl start hedera-mrv"
echo "4. Check logs: sudo journalctl -u hedera-mrv -f"
echo ""
echo "For more details, see: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv"
