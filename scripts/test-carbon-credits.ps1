# Carbon Credit API Test Suite - PowerShell
# Run this script to test all carbon credit endpoints

$BASE_URL = "http://localhost:3000"
$HEADERS = @{
    "Content-Type" = "application/json"
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CARBON CREDIT API TEST SUITE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if server is running
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/health" -Method GET -ErrorAction Stop
    Write-Host "✅ Server is running at $BASE_URL" -ForegroundColor Green
} catch {
    Write-Host "❌ Server not running! Start server first: npm start" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "TEST 1: Get Market Prices" -ForegroundColor Yellow
Write-Host "------------------------------------------"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/marketplace/prices" -Method GET -Headers $HEADERS
    Write-Host "✅ Market Prices Retrieved" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 2: Calculate Carbon Credits from Attestation" -ForegroundColor Yellow
Write-Host "------------------------------------------"
$attestation = @{
    attestation = @{
        verificationStatus = "APPROVED"
        trustScore = 0.96
        calculations = @{
            ER_tCO2 = 150.5
        }
        verificationMethod = "AI_AUTO_APPROVED"
        timestamp = "2026-02-22T02:16:00Z"
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/calculate" -Method POST -Headers $HEADERS -Body $attestation
    Write-Host "✅ Carbon Credits Calculated" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    $CREDITS_CALCULATED = $response.adjusted_credits_tco2e
    Write-Host "📊 Credits: $CREDITS_CALCULATED tCO2e" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 3: Mint Hedera HTS Tokens" -ForegroundColor Yellow
Write-Host "------------------------------------------"
$mintRequest = @{
    tenantId = "TENANT-001"
    quantity = 150.5
    metadata = @{
        plant_id = "PLANT-001"
        device_id = "TURBINE-1"
        trust_score = 0.96
        verification_method = "AI_AUTO_APPROVED"
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/mint" -Method POST -Headers $HEADERS -Body $mintRequest
    Write-Host "✅ Tokens Minted" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    $CREDIT_ID = $response.credit_id
    Write-Host "🎫 Credit ID: $CREDIT_ID" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    $CREDIT_ID = "mock-credit-id"
}

Write-Host ""
Write-Host "TEST 4: Register with Verra" -ForegroundColor Yellow
Write-Host "------------------------------------------"
$verraRequest = @{
    creditId = $CREDIT_ID
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/verra/register" -Method POST -Headers $HEADERS -Body $verraRequest
    Write-Host "✅ Verra Registration Complete" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 5: Register with Gold Standard" -ForegroundColor Yellow
Write-Host "------------------------------------------"
$gsRequest = @{
    creditId = $CREDIT_ID
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/goldstandard/register" -Method POST -Headers $HEADERS -Body $gsRequest
    Write-Host "✅ Gold Standard Registration Complete" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 6: Get Tenant Inventory" -ForegroundColor Yellow
Write-Host "------------------------------------------"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/inventory/TENANT-001" -Method GET -Headers $HEADERS
    Write-Host "✅ Inventory Retrieved" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 7: Create Sell Order" -ForegroundColor Yellow
Write-Host "------------------------------------------"
$sellRequest = @{
    tenantId = "TENANT-001"
    creditId = $CREDIT_ID
    quantity_tco2e = 100
    asking_price_per_tco2e = 16.5
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/marketplace/sell" -Method POST -Headers $HEADERS -Body $sellRequest
    Write-Host "✅ Sell Order Created" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "TEST 8: View Order Book" -ForegroundColor Yellow
Write-Host "------------------------------------------"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/v1/carbon-credits/marketplace/orderbook" -Method GET -Headers $HEADERS
    Write-Host "✅ Order Book Retrieved" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ALL TESTS COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan