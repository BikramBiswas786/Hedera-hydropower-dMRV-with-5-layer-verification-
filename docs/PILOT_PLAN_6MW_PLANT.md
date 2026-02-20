# Pilot Deployment Plan: 6 MW Run-of-River Hydropower Plant

## Context

**Target:** Small hydropower operator in Himachal Pradesh or Uttarakhand  
**Plant Capacity:** 5–8 MW run-of-river  
**Current MRV Cost:** ₹5–8 lakh/year (₹1.25–2 lakh per quarter) paid to consultants  
**Goal:** Test automated Hedera MRV system in shadow mode for 90 days before full commitment

---

## Phase 1: Baseline Assessment & Minimal Hardware (Week 1)

**Goal:** Understand existing instrumentation and connectivity.

### Step 1.1: Inventory Existing Sensors

Most small hydro plants already have basic SCADA/PLC systems monitoring:

- **Flow rate:** Ultrasonic or electromagnetic flowmeter on penstock
- **Head pressure:** Differential pressure transmitter
- **Active power:** CT/PT meters on generator output
- **Water quality:** pH/turbidity sensors (less common, may need to add)

**Action:**
- Walk plant with electrician
- Document each sensor:
  - Make/model
  - Output type (4–20mA analog, Modbus RTU/TCP, Profibus, etc.)
  - Current wiring/connectivity (local PLC, HMI, or isolated)

**Cost:** ₹0 (use own staff)

### Step 1.2: Assess Connectivity

Check if plant has:
- Internet connection (fiber/4G/VSAT)
- Local Ethernet LAN
- Wi-Fi coverage near control room

**If no internet:**  
Budget for 4G industrial router (₹8,000–15,000) + data plan (₹500–1,000/month)

**Cost:** ₹10,000 one-time + ₹1,000/month (if upgrade needed)

---

## Phase 2: Edge Gateway Deployment (Week 2)

**Goal:** Aggregate sensor data into one system that can submit to Hedera MRV API.

### Option A: Industrial Edge Gateway (Recommended)

**Hardware:**
- Maple Edge-II/III (₹25,000–40,000) or Advantech UNO-2272G (₹30,000–50,000)
- Supports Modbus RTU/TCP, 4–20mA analog inputs, digital I/O
- Linux-based, runs Node.js or Docker
- Industrial temp range (‑40°C to +75°C), DIN rail mount

**Installation:**
1. Mount gateway in control cabinet
2. Wire sensor outputs to gateway inputs
3. Connect to plant LAN via Ethernet
4. Configure to poll sensors every 5 minutes

**Cost:** ₹30,000–50,000 one-time

### Option B: Raspberry Pi 4 (Budget Option)

**Hardware:**
- Raspberry Pi 4 Model B (4GB): ₹6,500
- Waveshare RS485/CAN HAT: ₹2,000
- 4–20mA to 0–3.3V converters (4 channels): ₹2,000
- Industrial 24V→5V power supply: ₹1,500
- Weatherproof IP65 enclosure: ₹2,000
- **Total:** ₹14,500

**Trade-off:**  
- Not industrial-rated (0–50°C vs ‑40 to +75°C)
- Acceptable for 3-month pilot in temperature-controlled room
- Many small hydro operators already use RPi for data logging

**Installation:**
1. Mount Pi in enclosure near sensors
2. Connect Modbus sensors via RS485 HAT
3. Connect analog sensors via ADC to GPIO
4. Connect to LAN via Ethernet (more reliable than Wi-Fi)
5. Install Raspberry Pi OS Lite (headless)

**Cost:** ₹15,000 one-time

---

## Phase 3: Software Integration (Weeks 2–3)

**Goal:** Run Hedera MRV code on gateway and connect to sensors.

### Step 3.1: Install MRV System

SSH into gateway:

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git

# Clone MRV repo
cd /opt
sudo git clone https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv.git hedera-mrv
cd hedera-mrv

# Install dependencies
sudo npm install

# Run tests (optional)
npm test
```

**Cost:** ₹0 (open source, MIT license)

### Step 3.2: Configure Environment

Create `/opt/hedera-mrv/.env`:

```bash
# Hedera testnet credentials (free)
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=<get from repo maintainer or create own at portal.hedera.com>
AUDIT_TOPIC_ID=0.0.7462776
REC_TOKEN_ID=0.0.7964264

# Plant configuration
EF_GRID=0.82  # India grid emission factor (tCO2/MWh)
PLANT_ID=PLANT-HP-001
DEVICE_ID=TURBINE-001

# API authentication
VALID_API_KEYS=<your-api-key>
```

**Cost:** ₹0 (testnet ℏ free from faucet)

---

## Phase 4: Shadow-Mode Validation (Months 1–3)

**Goal:** Run automated MRV parallel to manual MRV, compare results.

### Success Criteria

- < 5% delta vs manual MRV reports
- < 0.5% false rejection rate  
- 99% Hedera transaction success
- Zero manual intervention for 90 consecutive days

---

## Cost Summary

| Item | One-Time | Recurring/Month |
|------|----------|-----------------|
| Hardware (Option A: Industrial) | ₹40,000 | ₹0 |
| Hardware (Option B: Raspberry Pi) | ₹15,000 | ₹0 |
| Connectivity (4G router + data) | ₹10,000 | ₹1,000 |
| MRV software | ₹0 (open source) | ₹0 |
| Hedera testnet fees | ₹0 (free ℏ) | ₹0 |
| Developer integration | ₹10,000 | ₹0 |
| **Total (Option A)** | **₹60,000** | **₹1,000** |
| **Total (Option B)** | **₹35,000** | **₹1,000** |

**3-Month Pilot Total:**
- Option A: ₹63,000
- Option B: ₹38,000

**vs Manual MRV:** ₹1.25–2 lakh per quarter  
**Savings: 60–70%**

---

## Production Transition (Month 4+)

If pilot succeeds:

1. Move to Hedera mainnet (₹500–1,000/month)
2. Register with carbon registry (₹50K–2L one-time)
3. Start minting real HRECs

**Revenue potential (6 MW plant):**
- ~39,000 MWh/year × 0.82 tCO₂/MWh = 32,000 tCO₂e/year  
- At ₹800/tCO₂e = **₹2.56 crore/year carbon revenue**
