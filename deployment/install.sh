#!/bin/bash
#
# Hedera Hydropower MRV Installation Script
# 
# This script automates the installation of the MRV system on edge gateways.
# Tested on: Raspberry Pi OS, Ubuntu 20.04/22.04, Debian 11
#
# USAGE:
#   sudo bash deployment/install.sh
#
# OR
#   curl -fsSL https://raw.githubusercontent.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/main/deployment/install.sh | sudo bash
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "====================================="
echo "Hedera Hydropower MRV Installer"
echo "====================================="
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
    VERSION=$VERSION_ID
    echo -e "${GREEN}Detected OS: $OS $VERSION${NC}"
else
    echo -e "${RED}Cannot detect OS. Exiting.${NC}"
    exit 1
fi

# Check if Node.js 18+ is installed
echo ""
echo "[1/7] Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo -e "${GREEN}Node.js $(node -v) already installed${NC}"
    else
        echo -e "${YELLOW}Node.js version too old. Upgrading...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
else
    echo -e "${YELLOW}Installing Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Check if Git is installed
echo ""
echo "[2/7] Checking Git..."
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Installing Git...${NC}"
    apt-get install -y git
else
    echo -e "${GREEN}Git already installed${NC}"
fi

# Clone repository
echo ""
echo "[3/7] Cloning repository..."
INSTALL_DIR="/opt/hedera-hydropower-mrv"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Directory exists. Pulling latest changes...${NC}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "${GREEN}Cloning fresh installation...${NC}"
    git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo ""
echo "[4/7] Installing Node.js dependencies..."
npm install --production

# Create dedicated user
echo ""
echo "[5/7] Creating system user..."
if ! id -u mrv &> /dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" mrv
    echo -e "${GREEN}User 'mrv' created${NC}"
else
    echo -e "${GREEN}User 'mrv' already exists${NC}"
fi

# Create data directory
echo ""
echo "[6/7] Setting up directories..."
mkdir -p "$INSTALL_DIR/data"
chown -R mrv:mrv "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"
chmod 770 "$INSTALL_DIR/data"

# Setup .env file
echo ""
echo "[7/7] Configuring environment..."
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Edit /opt/hedera-hydropower-mrv/.env with your credentials:${NC}"
    echo "  - HEDERA_OPERATOR_ID"
    echo "  - HEDERA_OPERATOR_KEY"
    echo "  - PLANT_ID"
    echo "  - DEVICE_ID"
    echo "  - VALID_API_KEYS"
    echo ""
    echo "Get free testnet credentials: https://portal.hedera.com/faucet"
    echo ""
else
    echo -e "${GREEN}.env file already exists${NC}"
fi

# Install systemd service
echo ""
read -p "Install as systemd service? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing systemd service..."
    cp "$INSTALL_DIR/deployment/hedera-mrv.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable hedera-mrv
    echo -e "${GREEN}Service installed and enabled${NC}"
    echo ""
    echo "Start the service with:"
    echo "  sudo systemctl start hedera-mrv"
    echo ""
    echo "View logs with:"
    echo "  sudo journalctl -u hedera-mrv -f"
fi

# Final instructions
echo ""
echo "====================================="
echo -e "${GREEN}Installation Complete!${NC}"
echo "====================================="
echo ""
echo "Next steps:"
echo "  1. Edit configuration: sudo nano /opt/hedera-hydropower-mrv/.env"
echo "  2. Adjust Modbus registers: sudo nano /opt/hedera-hydropower-mrv/examples/plant-bridge-modbus.js"
echo "  3. Run tests: cd /opt/hedera-hydropower-mrv && npm test"
echo "  4. Start service: sudo systemctl start hedera-mrv"
echo "  5. Check status: sudo systemctl status hedera-mrv"
echo ""
echo "Documentation: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/docs/PILOT_PLAN_6MW_PLANT.md"
echo ""
