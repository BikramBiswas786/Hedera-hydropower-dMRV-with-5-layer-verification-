# Clean up the docs folder
# Gets rid of duplicate files and fixes messy names

Write-Host "Cleaning up docs..." -ForegroundColor Cyan

$archived = 0
$renamed = 0

# Remove placeholder files
Write-Host "\n[1/4] Removing placeholder files"

if (Test-Path "docs\ACM0002-ADDITIONALITY.md") {
    git mv "docs\ACM0002-ADDITIONALITY.md" "docs\archived\" 2>$null
    if ($?) { Write-Host "  - ACM0002-ADDITIONALITY.md"; $archived++ }
}

if (Test-Path "docs\ACM0002-BASELINE-STUDY.md") {
    git mv "docs\ACM0002-BASELINE-STUDY.md" "docs\archived\" 2>$null
    if ($?) { Write-Host "  - ACM0002-BASELINE-STUDY.md"; $archived++ }
}

Write-Host "Moved $archived files to archived/" -ForegroundColor Green

# Fix confusing file names
Write-Host "\n[2/4] Fixing confusing file names"

if (Test-Path "docs\Competitive Analysis_ Hedera Hydropower MRV vs. Incumbents.md") {
    git mv "docs\Competitive Analysis_ Hedera Hydropower MRV vs. Incumbents.md" "docs\COMPETITIVE-ANALYSIS.md" 2>$null
    if ($?) { Write-Host "  - Competitive Analysis_ ... -> COMPETITIVE-ANALYSIS.md"; $renamed++ }
}

if (Test-Path "docs\Mainnet Verification & Production Readiness Checklist.md") {
    git mv "docs\Mainnet Verification & Production Readiness Checklist.md" "docs\MAINNET-CHECKLIST.md" 2>$null
    if ($?) { Write-Host "  - Mainnet Verification & ... -> MAINNET-CHECKLIST.md"; $renamed++ }
}

if (Test-Path "docs\Security Audit Checklist.md") {
    git mv "docs\Security Audit Checklist.md" "docs\SECURITY-AUDIT-CHECKLIST.md" 2>$null
    if ($?) { Write-Host "  - Security Audit Checklist.md -> SECURITY-AUDIT-CHECKLIST.md"; $renamed++ }
}

Write-Host "Renamed $renamed files" -ForegroundColor Green

# Create docs index
Write-Host "\n[3/4] Creating docs index"

$index = @"
# Documentation

All the docs you need to understand, deploy, and run this project.

## Start Here

- [Main README](../README.md) - What is this project?
- [Quick Start](../QUICK_START.md) - Get running in 5 minutes
- [API Quick Start](API_QUICKSTART.md) - Try the API

## How It Works

**Architecture**
- [ARCHITECTURE.md](ARCHITECTURE.md) - System overview
- [MRV-METHODOLOGY.md](MRV-METHODOLOGY.md) - MRV basics
- [ENGINE-V1.md](ENGINE-V1.md) - Trust scoring
- [ENGINE-V2-TWO-TIER-MODES.md](ENGINE-V2-TWO-TIER-MODES.md) - Anchoring modes

**API**
- [API.md](API.md) - REST endpoints
- [api/openapi.yaml](api/openapi.yaml) - OpenAPI spec

**Verra & Carbon Credits**
- [VERRA-GUIDEBOOK.md](VERRA-GUIDEBOOK.md) - Submit to Verra
- [ACM0002-ALIGNMENT-MATRIX.md](ACM0002-ALIGNMENT-MATRIX.md) - Methodology mapping
- [../CARBON-CREDITS-QUICK-START.md](../CARBON-CREDITS-QUICK-START.md) - Carbon credits 101

## Running It

**Deployment**
- [deployment/DEPLOYMENT-GUIDE.md](deployment/DEPLOYMENT-GUIDE.md) - Deploy to prod
- [deployment/PRODUCTION-CHECKLIST.md](deployment/PRODUCTION-CHECKLIST.md) - Pre-deploy checks
- [VERCEL-DEPLOYMENT-GUIDE.md](VERCEL-DEPLOYMENT-GUIDE.md) - Vercel setup
- [MAINNET-CHECKLIST.md](MAINNET-CHECKLIST.md) - Mainnet readiness

**Operations**
- [MONITORING-PLAN.md](MONITORING-PLAN.md) - Set up monitoring
- [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) - Daily operations
- [REC-GENERATION-WORKFLOW-EXECUTION.md](REC-GENERATION-WORKFLOW-EXECUTION.md) - Generate RECs
- [REC-GENERATION-WORKFLOW-TESTNET.md](REC-GENERATION-WORKFLOW-TESTNET.md) - Test RECs

## Development

**Testing**
- [../TESTING_GUIDE.md](../TESTING_GUIDE.md) - Run tests
- [../VALIDATION.md](../VALIDATION.md) - Validation
- [../VERIFICATION_GUIDE.md](../VERIFICATION_GUIDE.md) - Verification
- [SCENARIO1-SPEC.md](SCENARIO1-SPEC.md) - Test scenarios

**Integration**
- [../INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md) - Integrate the system
- [EDGE_GATEWAY_INTEGRATION.md](EDGE_GATEWAY_INTEGRATION.md) - Edge gateway
- [multi-tenant-guide.md](multi-tenant-guide.md) - Multi-tenancy

**Security**
- [SECURITY.md](SECURITY.md) - Security notes
- [SECURITY-AUDIT-CHECKLIST.md](SECURITY-AUDIT-CHECKLIST.md) - Security checklist

## Planning

**Strategy**
- [../ROADMAP.md](../ROADMAP.md) - Roadmap
- [IMPLEMENTATION-PLAN-COMPREHENSIVE.md](IMPLEMENTATION-PLAN-COMPREHENSIVE.md) - Implementation plan
- [PILOT_PLAN_6MW_PLANT.md](PILOT_PLAN_6MW_PLANT.md) - Pilot plan

**Analysis**
- [COST-ANALYSIS.md](COST-ANALYSIS.md) - Costs
- [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) - Competition
- [../INVESTMENT_SUMMARY.md](../INVESTMENT_SUMMARY.md) - Investment
- [../IMPACT.md](../IMPACT.md) - Impact
- [methodology_analysis.md](methodology_analysis.md) - Notes

## Technical Details

- [ANCHORING-MODES.md](ANCHORING-MODES.md) - Blockchain anchoring
- [SMART-SAMPLING-STRATEGY.md](SMART-SAMPLING-STRATEGY.md) - Sampling
- [project-profile.schema.json](project-profile.schema.json) - Project schema
- [multi-tenant-schema.sql](multi-tenant-schema.sql) - Database schema

## Other Stuff

- [FEATURES.md](../FEATURES.md) - Features
- [DEMO_GUIDE.md](../DEMO_GUIDE.md) - Demo
- [CHANGELOG.md](../CHANGELOG.md) - Changelog
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contributing
- [archived/](archived/) - Old docs
- [MERGE-NOTES.md](MERGE-NOTES.md) - Cleanup notes

## Evidence & ML

- [../evidence/](../evidence/) - Transactions, test outputs
- [../ml/](../ml/) - ML docs

---

Last updated: Feb 22, 2026 | Active: ~40 files | Archived: ~35 files
"@

$index | Out-File -FilePath "docs\README.md" -Encoding UTF8 -Force
git add "docs\README.md" 2>$null
Write-Host "Created docs/README.md" -ForegroundColor Green

# Update main README
Write-Host "\n[4/4] Updating main README"

$section = @"

---

## Documentation

Everything's in the `docs/` folder.

**Quick links:**
- [All Docs](docs/README.md) - Complete list
- [Architecture](docs/ARCHITECTURE.md) - How it works
- [API](docs/API.md) - REST API
- [Verra Guide](docs/VERRA-GUIDEBOOK.md) - Submit to Verra
- [Deploy](docs/deployment/DEPLOYMENT-GUIDE.md) - Go to production
- [Operations](docs/OPERATOR_GUIDE.md) - Run the system
- [Testing](TESTING_GUIDE.md) - Run tests
- [Security](docs/SECURITY.md) - Security

*We cleaned up 35+ duplicate files in Feb 2026. Old stuff is in `docs/archived/` if you need it.*
"@

if (Test-Path "README.md") {
    $readme = Get-Content "README.md" -Raw
    if ($readme -notmatch "## Documentation") {
        $section | Out-File -FilePath "README.md" -Encoding UTF8 -Append
        git add "README.md" 2>$null
        Write-Host "Updated README.md" -ForegroundColor Green
    } else {
        Write-Host "README.md already updated" -ForegroundColor Yellow
    }
}

# Done
Write-Host "\n======================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Green
Write-Host "======================================\n" -ForegroundColor Cyan

Write-Host "What changed:"
Write-Host "  - Archived: $archived files"
Write-Host "  - Renamed: $renamed files"
Write-Host "  - Created docs index"
Write-Host "  - Updated README\n"

Write-Host "Total cleanup (all phases): ~37 files"
Write-Host "Before: 93 files | After: ~56 files\n" -ForegroundColor Green

Write-Host "Next steps:"
Write-Host "  git status"
Write-Host "  git add ."
Write-Host "  git commit -m 'Clean up documentation'"
Write-Host "  git push origin main\n"

Write-Host "Your docs are organized! 🎉\n" -ForegroundColor Green
