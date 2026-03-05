#!/usr/bin/env pwsh
# HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE (PS1-PS6)
# Version: 2.6 (Fixed array initialization for Windows PowerShell)
# Date: March 6, 2026

Write-Host "
========================================================" -ForegroundColor Cyan
Write-Host "  HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE" -ForegroundColor Cyan
Write-Host "========================================================
" -ForegroundColor Cyan

# API Configuration
$headers = @{
    "x-api-key"   = "demokey001"
    "Content-Type" = "application/json"
}
$apiUrl = "http://localhost:3000/api/v1/telemetry"

# Initialize as global array to avoid PowerShell scoping issues
$global:testResults = @()

function Add-TestResult {
    param(
        [string]$name,
        [string]$result
    )
    $global:testResults += [PSCustomObject]@{
        Test   = $name
        Result = $result
    }
}

# Helper: current epoch ms
function Get-EpochMs {
    return [int64](Get-Date).ToUniversalTime().Subtract([datetime]"1970-01-01").TotalMilliseconds
}

# ========================================================
# TEST 1 - Valid APPROVED Telemetry
# ========================================================
Write-Host "[TEST 1] Valid APPROVED Telemetry" -ForegroundColor Green

$validBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-TEST-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 2.5
        head         = 45
        generatedKwh = 900
        pH           = 7.2
        turbidity    = 10
        temperature  = 18
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

try {
    $resp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $validBody

    Write-Host "  Status: $($resp.status)" -ForegroundColor White
    Write-Host "  Trust Score: $($resp.trust_score)" -ForegroundColor White
    Write-Host "  Reading ID: $($resp.reading_id)" -ForegroundColor Gray
    Write-Host "  Physics Check: $($resp.verification_details.physics_check)" -ForegroundColor White
    Write-Host "  Environmental Check: $($resp.verification_details.environmental_check)" -ForegroundColor White
    Write-Host "  Carbon Credits: $($resp.carbon_credits.amount_tco2e) tCO2e" -ForegroundColor White
    Write-Host "  Transaction: $($resp.hedera.transaction_id)" -ForegroundColor Cyan
    Write-Host "  HashScan: $($resp.hedera.hashscan_url)" -ForegroundColor Cyan
    Write-Host ""

    if ($resp.status -eq "APPROVED" -and $resp.trust_score -gt 0.9) {
        Write-Host "  TEST 1 PASSED" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 1" "PASSED"
    } else {
        Write-Host "  TEST 1 FAILED" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 1" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] TEST 1 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Add-TestResult "TEST 1" "ERROR"
}

# ========================================================
# TEST 2 - Fraud Detection
# ========================================================
Write-Host "[TEST 2] Fraud Detection - Inflated Power" -ForegroundColor Yellow

$fraudBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-FRAUD-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 2.5
        head         = 45
        generatedKwh = 45000
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

try {
    $fraudResp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $fraudBody

    Write-Host "  Status: $($fraudResp.status)" -ForegroundColor White
    Write-Host "  Trust Score: $($fraudResp.trust_score)" -ForegroundColor White
    Write-Host "  Physics Check: $($fraudResp.verification_details.physics_check)" -ForegroundColor White
    Write-Host "  Flags: $($fraudResp.verification_details.flags -join ', ')" -ForegroundColor Yellow
    Write-Host "  Transaction: $($fraudResp.hedera.transaction_id)" -ForegroundColor Cyan
    Write-Host ""

    if ($fraudResp.status -eq "FLAGGED" -and $fraudResp.trust_score -lt 0.7) {
        Write-Host "  TEST 2 PASSED - Fraud detected" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 2" "PASSED"
    } else {
        Write-Host "  TEST 2 FAILED - Fraud not detected" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 2" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] TEST 2 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Add-TestResult "TEST 2" "ERROR"
}

# ========================================================
# TEST 3 - Environmental Violation Detection
# ========================================================
Write-Host "[TEST 3] Environmental Violation Detection" -ForegroundColor Magenta

$envBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-ENV-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 2.5
        head         = 45
        generatedKwh = 900
        pH           = 4.5
        turbidity    = 180
        temperature  = 35
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

try {
    $envResp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $envBody

    Write-Host "  Status: $($envResp.status)" -ForegroundColor White
    Write-Host "  Trust Score: $($envResp.trust_score)" -ForegroundColor White
    Write-Host "  Environmental Check: $($envResp.verification_details.environmental_check)" -ForegroundColor White
    Write-Host "  Flags: $($envResp.verification_details.flags -join ', ')" -ForegroundColor Yellow
    Write-Host ""

    if ($envResp.status -eq "FLAGGED" -and $envResp.verification_details.environmental_check -eq "FAIL") {
        Write-Host "  TEST 3 PASSED - Environmental violation detected" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 3" "PASSED"
    } else {
        Write-Host "  TEST 3 FAILED - Environmental violation not detected" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 3" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] TEST 3 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Add-TestResult "TEST 3" "ERROR"
}

# ========================================================
# TEST 4 - Zero-Flow Fraud
# ========================================================
Write-Host "[TEST 4] Zero-Flow Fraud Detection" -ForegroundColor Red

$zeroBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-ZEROFLOW-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 0
        head         = 45
        generatedKwh = 500
        pH           = 7.1
        turbidity    = 12
        temperature  = 18
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

try {
    $zeroResp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $zeroBody -ErrorAction Stop

    Write-Host "  Status: $($zeroResp.status)" -ForegroundColor White
    Write-Host "  Trust Score: $($zeroResp.trust_score)" -ForegroundColor White
    Write-Host "  Physics Check: $($zeroResp.verification_details.physics_check)" -ForegroundColor White
    Write-Host "  Flags: $($zeroResp.verification_details.flags -join ', ')" -ForegroundColor Yellow
    Write-Host ""

    if ($zeroResp.status -eq "REJECTED" -or $zeroResp.trust_score -lt 0.5) {
        Write-Host "  TEST 4 PASSED - Zero-flow fraud rejected" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 4" "PASSED"
    } else {
        Write-Host "  TEST 4 FAILED - Zero-flow fraud not rejected" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 4" "FAILED"
    }
}
catch {
    $msg = $_.Exception.Message
    Write-Host "  API Response: $msg" -ForegroundColor Yellow
    Write-Host ""

    if ($msg -like "*(400)*" -or $msg -like "*zero*") {
        Write-Host "  TEST 4 PASSED - Zero-flow fraud blocked" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 4" "PASSED"
    } else {
        Write-Host "  TEST 4 ERROR - Unexpected error" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 4" "ERROR"
    }
}

# ========================================================
# TEST 5 - Multi-Plant Isolation
# ========================================================
Write-Host "[TEST 5] Multi-Plant Isolation" -ForegroundColor Cyan

$alphaBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-ALPHA-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 2.0
        head         = 40
        generatedKwh = 700
        pH           = 7.0
        turbidity    = 15
        temperature  = 19
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

$betaBody = @{
    plant_id  = "PLANT-BETA"
    device_id = "TURBINE-BETA-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 3.0
        head         = 35
        generatedKwh = 800
        pH           = 7.3
        turbidity    = 20
        temperature  = 20
        efficiency   = 0.86
    }
} | ConvertTo-Json -Depth 5

try {
    $alphaResp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $alphaBody
    $betaResp  = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $betaBody

    Write-Host "  PLANT-ALPHA TX: $($alphaResp.hedera.transaction_id)" -ForegroundColor Cyan
    Write-Host "  PLANT-BETA TX:  $($betaResp.hedera.transaction_id)" -ForegroundColor Cyan
    Write-Host ""

    if ($alphaResp.hedera.transaction_id -ne $betaResp.hedera.transaction_id) {
        Write-Host "  TEST 5 PASSED - Multi-plant isolation verified" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 5" "PASSED"
    } else {
        Write-Host "  TEST 5 FAILED - Transaction IDs should differ" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 5" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] TEST 5 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Add-TestResult "TEST 5" "ERROR"
}

# ========================================================
# TEST 6 - Replay Protection
# ========================================================
Write-Host "[TEST 6] Replay Attack Prevention" -ForegroundColor Yellow

$fixedTs = Get-EpochMs

$replayBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-REPLAY-001"
    readings  = @{
        timestamp    = $fixedTs
        flowRate     = 2.5
        head         = 45
        generatedKwh = 900
        pH           = 7.2
        turbidity    = 10
        temperature  = 18
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

$skipPS6Second = $false

try {
    $first = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $replayBody
    Write-Host "  First submission: $($first.status)" -ForegroundColor White
}
catch {
    Write-Host "  [ERROR] TEST 6 ERROR on first submit: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Add-TestResult "TEST 6" "ERROR"
    $skipPS6Second = $true
}

if (-not $skipPS6Second) {
    Start-Sleep -Milliseconds 100
    try {
        $second = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $replayBody -ErrorAction Stop
        Write-Host "  Second submission: Unexpectedly succeeded" -ForegroundColor Red
        Write-Host ""
        Write-Host "  TEST 6 FAILED - Replay attack not blocked" -ForegroundColor Red
        Write-Host ""
        Add-TestResult "TEST 6" "FAILED"
    }
    catch {
        Write-Host "  Second submission: Blocked (expected)" -ForegroundColor Green
        Write-Host ""
        Write-Host "  TEST 6 PASSED - Replay protection working" -ForegroundColor Green
        Write-Host ""
        Add-TestResult "TEST 6" "PASSED"
    }
}

# ========================================================
# SUMMARY
# ========================================================
Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "              TESTING COMPLETE                        " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$passedCount = ($global:testResults | Where-Object { $_.Result -eq "PASSED" }).Count
$totalTests  = $global:testResults.Count

Write-Host "Test Results:" -ForegroundColor White
foreach ($r in $global:testResults) {
    $icon = if ($r.Result -eq "PASSED") { "[OK]" } elseif ($r.Result -eq "FAILED") { "[!!]" } else { "[??]" }
    $color = switch ($r.Result) {
        "PASSED" { "Green" }
        "FAILED" { "Red" }
        default  { "Yellow" }
    }
    Write-Host "  $icon $($r.Test): $($r.Result)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Summary: $passedCount/$totalTests tests passed" -ForegroundColor Cyan
Write-Host ""

if ($passedCount -eq $totalTests -and $totalTests -gt 0) {
    Write-Host "[OK] ALL TESTS PASSED - PRODUCTION READY!" -ForegroundColor Green
    Write-Host ""
    exit 0
} elseif ($totalTests -eq 0) {
    Write-Host "[??] NO TESTS RUN - CHECK API SERVER" -ForegroundColor Yellow
    Write-Host ""
    exit 1
} else {
    Write-Host "[!!] SOME TESTS FAILED - REVIEW RESULTS ABOVE" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
