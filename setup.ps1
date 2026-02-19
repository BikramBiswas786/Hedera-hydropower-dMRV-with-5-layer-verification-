# Hedera Hydropower MRV — PowerShell Setup Script
# Run this ONCE in your project folder:
#   cd C:\path\to\your\project
#   .\setup.ps1

Write-Host ""
Write-Host "=== Hedera Hydropower MRV Setup ==" -ForegroundColor Cyan
Write-Host "Creating .env file and setting session variables..." -ForegroundColor Yellow
Write-Host ""

# 1. Set environment variables for this PowerShell session
$env:HEDERA_OPERATOR_ID  = "0.0.6255927"
$env:HEDERA_OPERATOR_KEY = "3030020100300706052b8104000a04220420398637ba54e6311afdc8a2f1a2f1838834dc30ce2d1fec22cb2cddd6ca28fbde"
$env:AUDIT_TOPIC_ID      = "0.0.7462776"
$env:REC_TOKEN_ID        = "0.0.7964264"
$env:EF_GRID             = "0.8"

Write-Host "[OK] Session environment variables set" -ForegroundColor Green

# 2. Write .env file to project root (used by dotenv / Node.js)
$envContent = @"
HEDERA_OPERATOR_ID=0.0.6255927
HEDERA_OPERATOR_KEY=3030020100300706052b8104000a04220420398637ba54e6311afdc8a2f1a2f1838834dc30ce2d1fec22cb2cddd6ca28fbde
AUDIT_TOPIC_ID=0.0.7462776
REC_TOKEN_ID=0.0.7964264
EF_GRID=0.8
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8 -Force
Write-Host "[OK] .env file created in current directory" -ForegroundColor Green

# 3. Verify
Write-Host ""
Write-Host "--- Verification ---" -ForegroundColor Cyan
Write-Host "HEDERA_OPERATOR_ID  = $env:HEDERA_OPERATOR_ID"
Write-Host "HEDERA_OPERATOR_KEY = $($env:HEDERA_OPERATOR_KEY.Substring(0,20))..." 
Write-Host "AUDIT_TOPIC_ID      = $env:AUDIT_TOPIC_ID"
Write-Host "REC_TOKEN_ID        = $env:REC_TOKEN_ID"
Write-Host "EF_GRID             = $env:EF_GRID"
Write-Host ""
Write-Host "[OK] .env file contents:" -ForegroundColor Cyan
Get-Content .env
Write-Host ""
Write-Host "=== Setup complete! Now run: npm install && npm run demo ==" -ForegroundColor Green
Write-Host ""
