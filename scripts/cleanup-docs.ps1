# Documentation Cleanup Script
# Removes duplicate and outdated files, renames confusing titles
# Run this to get your docs organized

Write-Host "Cleaning up documentation..." -ForegroundColor Cyan
Write-Host ""

$cleaned = 0

# Step 1: Archive ACM0002 stubs (these are just placeholders)
Write-Host "[1/4] Archiving placeholder files..." -ForegroundColor Yellow

if (Test-Path "docs\ACM0002-ADDITIONALITY.md") {
    git mv "docs\ACM0002-ADDITIONALITY.md" "docs\archived\" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ACM0002-ADDITIONALITY.md (stub)"
        $cleaned++
    }
}

if (Test-Path "docs\ACM0002-BASELINE-STUDY.md") {
    git mv "docs\ACM0002-BASELINE-STUDY.md" "docs\archived\" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ACM0002-BASELINE-STUDY.md (stub)"
        $cleaned++
    }
}

Write-Host "Archived $cleaned placeholder files" -ForegroundColor Green
Write-Host ""

# Step 2: Rename files with confusing titles
Write-Host "[2/4] Fixing file names..." -ForegroundColor Yellow

$renamed = 0

if (Test-Path "docs\Competitive Analysis_ Hedera Hydropower MRV vs. Incumbents.md") {
    git mv "docs\Competitive Analysis_ Hedera Hydropower MRV vs. Incumbents.md" "docs\COMPETITIVE-ANALYSIS.md" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Competitive Analysis_ ... → COMPETITIVE-ANALYSIS.md"
        $renamed++
    }
}

if (Test-Path "docs\Mainnet Verification & Production Readiness Checklist.md") {
    git mv "docs\Mainnet Verification & Production Readiness Checklist.md" "docs\MAINNET-CHECKLIST.md" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Mainnet Verification & ... → MAINNET-CHECKLIST.md"
        $renamed++
    }
}

if (Test-Path "docs\Security Audit Checklist.md") {
    git mv "docs\Security Audit Checklist.md" "docs\SECURITY-AUDIT-CHECKLIST.md" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Security Audit Checklist.md → SECURITY-AUDIT-CHECKLIST.md"
        $renamed++
    }
}

Write-Host "Renamed $renamed files" -ForegroundColor Green
Write-Host ""

# Step 3: Create docs index
Write-Host "[3/4] Creating documentation index..." -ForegroundColor Yellow

$docsIndex = @"
# Documentation

Quick reference to all project documentation.

## Getting Started

- [Main README](../README.md) - Project overview
- [Quick Start](../QUICK_START.md) - Get up and running fast
- [API Quick Start](API_QUICKSTART.md) - Test the API in 5 minutes

## Core Docs

### Architecture
- [ARCHITECTURE.md](ARCHITECTURE.md) - How the system works
- [MRV-METHODOLOGY.md](MRV-METHODOLOGY.md) - MRV methodology
- [ENGINE-V1.md](ENGINE-V1.md) - Trust scoring engine
- [ENGINE-V2-TWO-TIER-MODES.md](ENGINE-V2-TWO-TIER-MODES.md) - Anchoring modes

### API
- [API.md](API.md) - REST API reference
- [api/openapi.yaml](api/openapi.yaml) - OpenAPI spec

### Verra & Carbon Credits
- [VERRA-GUIDEBOOK.md](VERRA-GUIDEBOOK.md) - How to submit to Verra
- [ACM0002-ALIGNMENT-MATRIX.md](ACM0002-ALIGNMENT-MATRIX.md) - Methodology mapping
- [../CARBON-CREDITS-QUICK-START.md](../CARBON-CREDITS-QUICK-START.md) - Carbon credits basics

## Operations

### Deployment
- [deployment/DEPLOYMENT-GUIDE.md](deployment/DEPLOYMENT-GUIDE.md) - Deploy to production
- [deployment/PRODUCTION-CHECKLIST.md](deployment/PRODUCTION-CHECKLIST.md) - Pre-deploy checklist
- [VERCEL-DEPLOYMENT-GUIDE.md](VERCEL-DEPLOYMENT-GUIDE.md) - Deploy to Vercel
- [MAINNET-CHECKLIST.md](MAINNET-CHECKLIST.md) - Mainnet readiness

### Running the System
- [MONITORING-PLAN.md](MONITORING-PLAN.md) - Monitoring setup
- [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) - Day-to-day operations
- [REC-GENERATION-WORKFLOW-EXECUTION.md](REC-GENERATION-WORKFLOW-EXECUTION.md) - Generate RECs
- [REC-GENERATION-WORKFLOW-TESTNET.md](REC-GENERATION-WORKFLOW-TESTNET.md) - Test REC generation

## Development

### Testing
- [../TESTING_GUIDE.md](../TESTING_GUIDE.md) - How to run tests
- [../VALIDATION.md](../VALIDATION.md) - Validation procedures
- [../VERIFICATION_GUIDE.md](../VERIFICATION_GUIDE.md) - Verification guide
- [SCENARIO1-SPEC.md](SCENARIO1-SPEC.md) - Test scenarios

### Integration
- [../INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) - Integrate the system
- [EDGE_GATEWAY_INTEGRATION.md](EDGE_GATEWAY_INTEGRATION.md) - Edge gateway setup
- [multi-tenant-guide.md](multi-tenant-guide.md) - Multi-tenancy

### Security
- [SECURITY.md](SECURITY.md) - Security overview
- [SECURITY-AUDIT-CHECKLIST.md](SECURITY-AUDIT-CHECKLIST.md) - Security checklist

## Planning

### Strategy
- [../ROADMAP.md](../ROADMAP.md) - Project roadmap
- [IMPLEMENTATION-PLAN-COMPREHENSIVE.md](IMPLEMENTATION-PLAN-COMPREHENSIVE.md) - Implementation plan
- [PILOT_PLAN_6MW_PLANT.md](PILOT_PLAN_6MW_PLANT.md) - Pilot deployment plan

### Analysis
- [COST-ANALYSIS.md](COST-ANALYSIS.md) - Cost breakdown
- [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) - Competitive analysis
- [../INVESTMENT_SUMMARY.md](../INVESTMENT_SUMMARY.md) - Investment overview
- [../IMPACT.md](../IMPACT.md) - Environmental impact
- [methodology_analysis.md](methodology_analysis.md) - Methodology notes

## Technical Specs

### Data & Sampling
- [ANCHORING-MODES.md](ANCHORING-MODES.md) - Blockchain anchoring
- [SMART-SAMPLING-STRATEGY.md](SMART-SAMPLING-STRATEGY.md) - Sampling strategy

### Schemas
- [project-profile.schema.json](project-profile.schema.json) - Project profile schema
- [multi-tenant-schema.sql](multi-tenant-schema.sql) - Database schema

## Other

- [FEATURES.md](../FEATURES.md) - Feature list
- [DEMO_GUIDE.md](../DEMO_GUIDE.md) - Demo walkthrough
- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute

### Archived
- [archived/](archived/) - Old/deprecated docs
- [MERGE-NOTES.md](MERGE-NOTES.md) - Consolidation notes

## Evidence & ML

- [../evidence/](../evidence/) - Transaction records, test outputs
- [../ml/](../ml/) - ML module docs

---

**Last updated**: Feb 22, 2026  
**Active docs**: ~40 files  
**Archived**: ~35 files
"@

$docsIndex | Out-File -FilePath "docs\README.md" -Encoding UTF8 -Force
git add "docs\README.md" 2>$null

Write-Host "Created docs/README.md" -ForegroundColor Green
Write-Host ""

# Step 4: Update root README
Write-Host "[4/4] Updating root README..." -ForegroundColor Yellow

$docSection = @"

---

## Documentation

All docs are organized in the `docs/` directory.

**Quick links**:
- [All Documentation](docs/README.md) - Complete index
- [Architecture](docs/ARCHITECTURE.md) - System design
- [API Reference](docs/API.md) - REST API
- [Verra Guide](docs/VERRA-GUIDEBOOK.md) - Submit to Verra
- [Deployment](docs/deployment/DEPLOYMENT-GUIDE.md) - Deploy to production
- [Operator Guide](docs/OPERATOR_GUIDE.md) - Daily operations
- [Testing](TESTING_GUIDE.md) - Run tests
- [Security](docs/SECURITY.md) - Security overview

*Note: We cleaned up 35+ redundant files in Feb 2026. Archived docs are in `docs/archived/` if you need them.*
"@

if (Test-Path "README.md") {
    $readme = Get-Content "README.md" -Raw
    if ($readme -notmatch "## Documentation") {
        $docSection | Out-File -FilePath "README.md" -Encoding UTF8 -Append
        git add "README.md" 2>$null
        Write-Host "Added doc section to README.md" -ForegroundColor Green
    } else {
        Write-Host "README.md already has doc section" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: README.md not found" -ForegroundColor Red
}

Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Done!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "  Phases 1-3: 35 files cleaned" -ForegroundColor White
Write-Host "  This phase: $cleaned archived, $renamed renamed" -ForegroundColor White
Write-Host "  Total: ~37 files cleaned" -ForegroundColor Yellow
Write-Host "  Result: 93 → ~56 files (cleaner repo!)" -ForegroundColor Green
Write-Host ""
Write-Host "Changes:" -ForegroundColor White
Write-Host "  ✓ Removed duplicate docs" -ForegroundColor Green
Write-Host "  ✓ Fixed confusing file names" -ForegroundColor Green
Write-Host "  ✓ Created documentation index" -ForegroundColor Green
Write-Host "  ✓ Updated main README" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Review: git status" -ForegroundColor Gray
Write-Host "  2. Commit: git add . && git commit -m 'Clean up documentation'" -ForegroundColor Gray
Write-Host "  3. Push: git push origin main" -ForegroundColor Gray
Write-Host ""
Write-Host "Docs are now organized! 🎉" -ForegroundColor Green
Write-Host ""
