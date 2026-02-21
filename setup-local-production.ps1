# Hedera Hydropower MRV - Local Production Setup
# This script configures your local environment to match the Vercel production deployment

Write-Host "=== Hedera Hydropower MRV - Local Production Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Node.js not found. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "✗ npm not found. Please install npm 9+" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Node.js $(node --version) found" -ForegroundColor Green
Write-Host "✓ npm $(npm --version) found" -ForegroundColor Green
Write-Host ""

# Step 2: Install dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 3: Copy production environment file
Write-Host "[3/5] Setting up production environment..." -ForegroundColor Yellow

if (Test-Path ".env.production") {
    Copy-Item ".env.production" ".env" -Force
    Write-Host "✓ .env file created from .env.production" -ForegroundColor Green
} else {
    Write-Host "⚠ .env.production not found, using .env.example" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env" -Force
    Write-Host "⚠ WARNING: Using example credentials. Update .env with real values." -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Run tests
Write-Host "[4/5] Running tests to verify setup..." -ForegroundColor Yellow
npm test --silent -- --passWithNoTests
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ Some tests failed, but continuing..." -ForegroundColor Yellow
} else {
    Write-Host "✓ All tests passed" -ForegroundColor Green
}
Write-Host ""

# Step 5: Display configuration
Write-Host "[5/5] Configuration summary:" -ForegroundColor Yellow
Write-Host ""

if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "HEDERA_OPERATOR_ID=([0-9.]+)") {
        $accountId = $matches[1]
        Write-Host "  Hedera Account:  $accountId" -ForegroundColor Cyan
        Write-Host "  Explorer:        https://hashscan.io/testnet/account/$accountId" -ForegroundColor Gray
    }
    if ($envContent -match "AUDIT_TOPIC_ID=([0-9.]+)") {
        $topicId = $matches[1]
        Write-Host "  HCS Audit Topic: $topicId" -ForegroundColor Cyan
        Write-Host "  Explorer:        https://hashscan.io/testnet/topic/$topicId" -ForegroundColor Gray
    }
    if ($envContent -match "REC_TOKEN_ID=([0-9.]+)") {
        $tokenId = $matches[1]
        Write-Host "  HREC Token:      $tokenId" -ForegroundColor Cyan
        Write-Host "  Explorer:        https://hashscan.io/testnet/token/$tokenId" -ForegroundColor Gray
    }
}
Write-Host ""

# Final instructions
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start the API server:   npm run api" -ForegroundColor White
Write-Host "  2. Run the demo:           npm run demo" -ForegroundColor White
Write-Host "  3. Run tests:              npm test" -ForegroundColor White
Write-Host ""
Write-Host "API will be available at:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "Health check:               http://localhost:3000/health" -ForegroundColor Gray
Write-Host "Metrics:                    http://localhost:3000/metrics" -ForegroundColor Gray
Write-Host "API docs:                   http://localhost:3000/" -ForegroundColor Gray
Write-Host ""
Write-Host "Production deployment:      https://hydropower-mrv-19feb26.vercel.app" -ForegroundColor Cyan
Write-Host ""
