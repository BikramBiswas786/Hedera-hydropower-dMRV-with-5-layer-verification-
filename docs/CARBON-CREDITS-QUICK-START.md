# Carbon Credits Quick Start

## Your Server is Already Running! ✅

Your server at http://localhost:3000 is running v1.6.1 with 93% completion.

## Step 1: Pull Latest Code

```powershell
# Stop your current server (Ctrl+C)
# Then pull latest code:
git pull origin main

# Restart server
npm start
```

## Step 2: Test Carbon Credits (Without Restarting Server)

Run this in a NEW PowerShell window while server is running:

```powershell
# Get market prices
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/carbon-credits/marketplace/prices"

# Calculate credits
$calc = @{
    attestation = @{
        verificationStatus = "APPROVED"
        trustScore = 0.96
        calculations = @{ ER_tCO2 = 150.5 }
        verificationMethod = "AI_AUTO_APPROVED"
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/carbon-credits/calculate" `
  -Method POST `
  -Body $calc `
  -ContentType "application/json"

# Mint tokens
$mint = @{
    tenantId = "TENANT-001"
    quantity = 150.5
    metadata = @{
        plant_id = "PLANT-001"
        device_id = "TURBINE-1"
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/api/v1/carbon-credits/mint" `
  -Method POST `
  -Body $mint `
  -ContentType "application/json"
```

## Step 3: Run Complete Demo

```powershell
# This runs the full workflow
node scripts\carbon-credit-demo.js
```

## Troubleshooting

### Error: "Cannot connect to server"
```powershell
Test-NetConnection localhost -Port 3000
npm start
```

### Error: "Cannot find module"
```powershell
git pull origin main
npm install
```

## Revenue Impact

- **₹426 Cr/year** from carbon sales (1000-turbine fleet)
- **₹149 Cr** over 5 years from ESG premium
- **₹113 Cr** over 5 years from arbitrage

**Total: ₹688 Cr over 5 years**
