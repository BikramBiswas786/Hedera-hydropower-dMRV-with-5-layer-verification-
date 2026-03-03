#──────────────────────────────────────────────────────────
# PS4 – Zero-Flow Fraud (should be blocked)
#──────────────────────────────────────────────────────────
Write-Host "[PS4] Zero-Flow Fraud (generatedKwh > 0, flowRate = 0)" -ForegroundColor Red

$zeroBody = @{
    plant_id  = "PLANT-ALPHA"
    device_id = "TURBINE-ZEROFLOW-$(Get-Random)"
    readings  = @{
        timestamp    = Get-EpochMs
        flowRate     = 0          # impossible with kWh > 0
        head         = 45
        generatedKwh = 500
        pH           = 7.1
        turbidity    = 12
        temperature  = 18
        efficiency   = 0.85
    }
} | ConvertTo-Json -Depth 5

try {
    # Try to send impossible physics payload
    $zeroResp = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $zeroBody -ErrorAction Stop

    Write-Host "  Status:        $($zeroResp.status)"
    Write-Host "  Trust Score:   $($zeroResp.trust_score)"
    Write-Host "  Physics Check: $($zeroResp.verification_details.physics_check)"
    Write-Host "  Flags:         $($zeroResp.verification_details.flags -join ', ')`n"

    if ($zeroResp.status -eq "REJECTED" -or $zeroResp.trust_score -lt 0.5) {
        Write-Host "  ✅ PS4 PASSED - zero-flow fraud rejected/low trust`n" -ForegroundColor Green
        Add-TestResult "PS4" "PASSED"
    } else {
        Write-Host "  ❌ PS4 FAILED - zero-flow fraud not rejected`n" -ForegroundColor Red
        Add-TestResult "PS4" "FAILED"
    }
}
catch {
    # Any 400 Bad Request for this impossible physics is also a PASS
    $msg = $_.Exception.Message
    Write-Host "  API error on zero-flow payload: $msg`n" -ForegroundColor Yellow

    if ($msg -like "*(400)*") {
        Write-Host "  ✅ PS4 PASSED - zero-flow fraud blocked with 400 Bad Request`n" -ForegroundColor Green
        Add-TestResult "PS4" "PASSED"
    } else {
        Write-Host "  ❌ PS4 ERROR - unexpected error on zero-flow test`n" -ForegroundColor Red
        Add-TestResult "PS4" "ERROR"
    }
}
