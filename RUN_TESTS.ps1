#!/usr/bin/env pwsh
# HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE (PS1-PS6)
# Version: 2.3 (Pure ASCII - Windows PowerShell compatible)
# Date: March 4, 2026

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  HEDERA HYDROPOWER dMRV - COMPLETE TEST SUITE (PS1-PS6)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# API Configuration
$headers = @{
    "x-api-key"   = "demokey001"
    "Content-Type" = "application/json"
}
$apiUrl = "http://localhost:3000/api/v1/telemetry"

$testResults = @()

function Add-TestResult {
    param(
        [string]$name,
        [string]$result
    )
    $global:testResults += @{ Test = $name; Result = $result }
}

# Helper: current epoch ms
function Get-EpochMs {
    return [int64](Get-Date).ToUniversalTime().Subtract([datetime]"1970-01-01").TotalMilliseconds
}

# ========================================================
# PS1 - Valid APPROVED Telemetry
# ========================================================
Write-Host "[PS1] Valid APPROVED Telemetry" -ForegroundColor Green

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

    Write-Host "  Status:              $($resp.status)"
    Write-Host "  Trust Score:         $($resp.trust_score)"
    Write-Host "  Reading ID:          $($resp.reading_id)"
    Write-Host "  Physics Check:       $($resp.verification_details.physics_check)"
    Write-Host "  Environmental Check: $($resp.verification_details.environmental_check)"
    Write-Host "  Carbon Credits:      $($resp.carbon_credits.amount_tco2e) tCO2e"
    Write-Host "  Transaction:         $($resp.hedera.transaction_id)"
    Write-Host "  HashScan:            $($resp.hedera.hashscan_url)`n" -ForegroundColor Cyan

    if ($resp.status -eq "APPROVED" -and $resp.trust_score -gt 0.9) {
        Write-Host "  [PASS] PS1 PASSED`n" -ForegroundColor Green
        Add-TestResult "PS1" "PASSED"
    } else {
        Write-Host "  [FAIL] PS1 FAILED`n" -ForegroundColor Red
        Add-TestResult "PS1" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] PS1 ERROR: $($_.Exception.Message)`n" -ForegroundColor Red
    Add-TestResult "PS1" "ERROR"
}

# ========================================================
# PS2 - Fraud Detection (Inflated Power 45000 kWh)
# ========================================================
Write-Host "[PS2] Fraud Detection - Inflated Power 45000 kWh" -ForegroundColor Yellow

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

    Write-Host "  Status:        $($fraudResp.status)"
    Write-Host "  Trust Score:   $($fraudResp.trust_score)"
    Write-Host "  Physics Check: $($fraudResp.verification_details.physics_check)"
    Write-Host "  Flags:         $($fraudResp.verification_details.flags -join ', ')"
    Write-Host "  Transaction:   $($fraudResp.hedera.transaction_id)`n"

    if ($fraudResp.status -eq "FLAGGED" -and $fraudResp.trust_score -lt 0.7) {
        Write-Host "  [PASS] PS2 PASSED - Fraud detected`n" -ForegroundColor Green
        Add-TestResult "PS2" "PASSED"
    } else {
        Write-Host "  [FAIL] PS2 FAILED - Fraud not detected`n" -ForegroundColor Red
        Add-TestResult "PS2" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] PS2 ERROR: $($_.Exception.Message)`n" -ForegroundColor Red
    Add-TestResult "PS2" "ERROR"
}

# ========================================================
# PS3 - Environmental Violation Detection
# ========================================================
Write-Host "[PS3] Environmental Violation Detection" -ForegroundColor Magenta

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

    Write-Host "  Status:              $($envResp.status)"
    Write-Host "  Trust Score:         $($envResp.trust_score)"
    Write-Host "  Environmental Check: $($envResp.verification_details.environmental_check)"
    Write-Host "  Flags:               $($envResp.verification_details.flags -join ', ')`n"

    if ($envResp.status -eq "FLAGGED" -and $envResp.verification_details.environmental_check -eq "FAIL") {
        Write-Host "  [PASS] PS3 PASSED - Environmental violation detected`n" -ForegroundColor Green
        Add-TestResult "PS3" "PASSED"
    } else {
        Write-Host "  [FAIL] PS3 FAILED - Environmental violation not detected`n" -ForegroundColor Red
        Add-TestResult "PS3" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] PS3 ERROR: $($_.Exception.Message)`n" -ForegroundColor Red
    Add-TestResult "PS3" "ERROR"
}

# ========================================================
# PS4 - Zero-Flow Fraud
# ========================================================
Write-Host "[PS4] Zero-Flow Fraud" -ForegroundColor Red

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

    Write-Host "  Status:        $($zeroResp.status)"
    Write-Host "  Trust Score:   $($zeroResp.trust_score)"
    Write-Host "  Physics Check: $($zeroResp.verification_details.physics_check)"
    Write-Host "  Flags:         $($zeroResp.verification_details.flags -join ', ')`n"

    if ($zeroResp.status -eq "REJECTED" -or $zeroResp.trust_score -lt 0.5) {
        Write-Host "  [PASS] PS4 PASSED - zero-flow fraud rejected/low trust`n" -ForegroundColor Green
        Add-TestResult "PS4" "PASSED"
    } else {
        Write-Host "  [FAIL] PS4 FAILED - zero-flow fraud not rejected`n" -ForegroundColor Red
        Add-TestResult "PS4" "FAILED"
    }
}
catch {
    $msg = $_.Exception.Message
    Write-Host "  API error on zero-flow payload: $msg`n" -ForegroundColor Yellow

    if ($msg -like "*(400)*") {
        Write-Host "  [PASS] PS4 PASSED - zero-flow fraud blocked with 400 Bad Request`n" -ForegroundColor Green
        Add-TestResult "PS4" "PASSED"
    } else {
        Write-Host "  [ERROR] PS4 ERROR - unexpected error on zero-flow test`n" -ForegroundColor Red
        Add-TestResult "PS4" "ERROR"
    }
}

# ========================================================
# PS5 - Multi-Plant Isolation
# ========================================================
Write-Host "[PS5] Multi-Plant Isolation" -ForegroundColor Cyan

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

    Write-Host "  PLANT-ALPHA TX: $($alphaResp.hedera.transaction_id)"
    Write-Host "  PLANT-BETA  TX: $($betaResp.hedera.transaction_id)`n"

    if ($alphaResp.hedera.transaction_id -ne $betaResp.hedera.transaction_id) {
        Write-Host "  [PASS] PS5 PASSED - different plants have different TXs`n" -ForegroundColor Green
        Add-TestResult "PS5" "PASSED"
    } else {
        Write-Host "  [FAIL] PS5 FAILED - TX IDs should differ`n" -ForegroundColor Red
        Add-TestResult "PS5" "FAILED"
    }
}
catch {
    Write-Host "  [ERROR] PS5 ERROR: $($_.Exception.Message)`n" -ForegroundColor Red
    Add-TestResult "PS5" "ERROR"
}

# ========================================================
# PS6 - Replay Protection
# ========================================================
Write-Host "[PS6] Replay Protection" -ForegroundColor Yellow

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

try {
    $first = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $replayBody
    Write-Host "  First submit status: $($first.status)"
}
catch {
    Write-Host "  [ERROR] PS6 ERROR on first submit: $($_.Exception.Message)`n" -ForegroundColor Red
    Add-TestResult "PS6" "ERROR"
    $skipPS6Second = $true
}

if (-not $skipPS6Second) {
    try {
        $second = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $replayBody -ErrorAction Stop
        Write-Host "  Second submit unexpectedly succeeded: $($second.status)" -ForegroundColor Red
        Write-Host "  [FAIL] PS6 FAILED - replay not blocked`n" -ForegroundColor Red
        Add-TestResult "PS6" "FAILED"
    }
    catch {
        Write-Host "  Second submit blocked as expected:" -ForegroundColor Green
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Green
        Write-Host "  [PASS] PS6 PASSED - replay protection working`n" -ForegroundColor Green
        Add-TestResult "PS6" "PASSED"
    }
}

# ========================================================
# SUMMARY
# ========================================================
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "                    TESTING COMPLETE                   " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$passedCount = ($testResults | Where-Object { $_.Result -eq "PASSED" }).Count
$totalTests  = $testResults.Count

Write-Host "Test Results:" -ForegroundColor Cyan
foreach ($r in $testResults) {
    $color = switch ($r.Result) {
        "PASSED" { "Green" }
        "FAILED" { "Red" }
        default  { "Yellow" }
    }
    Write-Host "  $($r.Test): $($r.Result)" -ForegroundColor $color
}

Write-Host "`nSummary: $passedCount/$totalTests tests passed`n" -ForegroundColor Cyan

if ($passedCount -eq $totalTests) {
    Write-Host "*** ALL TESTS PASSED - PRODUCTION READY! ***`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "*** SOME TESTS FAILED - REVIEW RESULTS ABOVE ***`n" -ForegroundColor Yellow
    exit 1
}
