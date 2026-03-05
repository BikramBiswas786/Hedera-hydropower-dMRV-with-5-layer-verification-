#!/usr/bin/env node
/**
 * HEDERA HYDROPOWER dMRV - COST MODEL COMPARISON
 * Demonstrates 97%+ cost savings vs traditional MRV systems
 *
 * Compares:
 * - Traditional manual MRV (auditors, paperwork, travel)
 * - Hedera-based automated dMRV (HCS + HTS + DID)
 *
 * Run: node scripts/show-cost-model.js
 */

require('dotenv').config();

// Force en-US formatting regardless of system locale
const fmt = (n) => n.toLocaleString('en-US');
const fmtUSD = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSDint = (n) => '$' + n.toLocaleString('en-US');

// ============================================================================
// TRADITIONAL MRV COSTS (Per 6MW Plant, Annual)
// ============================================================================
const TRADITIONAL_MRV = {
  // Third-party verification audits
  auditor_visits: {
    frequency: 4,            // Quarterly
    cost_per_visit: 15000,   // USD (travel, labor, reports)
    annual_total: 60000
  },

  // Manual data collection & processing
  data_management: {
    staff_fte: 1.5,          // Full-time equivalent staff
    annual_salary: 45000,
    annual_total: 67500
  },

  // Certification & compliance
  certification: {
    initial_certification: 25000,
    annual_renewal: 12000,
    documentation: 8000,
    annual_total: 20000      // Amortized initial + annual
  },

  // Carbon credit issuance
  issuance_fees: {
    cost_per_credit: 2.50,   // USD per tCO2e
    annual_credits: 15000,   // 6MW plant ~15,000 tCO2e/year
    annual_total: 37500
  },

  // Legal & consulting
  legal_consulting: {
    compliance_review: 10000,
    contract_management: 8000,
    annual_total: 18000
  }
};

const TRADITIONAL_ANNUAL_COST = Object.values(TRADITIONAL_MRV)
  .reduce((sum, item) => sum + item.annual_total, 0);

// ============================================================================
// HEDERA dMRV COSTS (Per 6MW Plant, Annual)
// Source: https://hedera.com/fees
// ============================================================================
const HEDERA_PRICING = {
  hcs_message:    0.0001,  // $0.0001 per HCS message
  hts_token_create: 1.00, // $1.00 one-time token creation
  hts_mint:       0.001,  // $0.001 per mint transaction
  did_operation:  0.001   // $0.001 per DID operation
};

const HEDERA_DMRV = {
  // Telemetry anchoring to HCS (every 5 minutes)
  hcs_anchoring: {
    readings_per_day: 288,
    readings_per_year: 288 * 365,
    cost_per_reading: HEDERA_PRICING.hcs_message,
    annual_total: 288 * 365 * HEDERA_PRICING.hcs_message
  },

  // HREC token minting (approved readings only)
  hrec_minting: {
    tokens_per_year: 15000,  // 15,000 MWh/year verified
    cost_per_token: HEDERA_PRICING.hts_mint,
    setup_cost: HEDERA_PRICING.hts_token_create,
    annual_total: (15000 * HEDERA_PRICING.hts_mint) + HEDERA_PRICING.hts_token_create
  },

  // Device DID registration (one-time, amortized over 10 years)
  did_management: {
    devices: 2,
    cost_per_did: HEDERA_PRICING.did_operation,
    lifespan_years: 10,
    annual_total: (2 * HEDERA_PRICING.did_operation) / 10
  },

  // Infrastructure (edge gateway + API + monitoring)
  infrastructure: {
    hosting_monthly: 20,     // USD/month VPS
    monitoring_monthly: 10,  // USD/month Grafana Cloud
    annual_total: (20 + 10) * 12
  },

  // Minimal human oversight (AI Guardian handles 99% of verification)
  human_oversight: {
    staff_fte: 0.1,
    annual_salary: 45000,
    annual_total: 45000 * 0.1
  }
};

const HEDERA_ANNUAL_COST = Object.values(HEDERA_DMRV)
  .reduce((sum, item) => sum + item.annual_total, 0);

// ============================================================================
// COST COMPARISON & SAVINGS
// ============================================================================
const SAVINGS = {
  absolute: TRADITIONAL_ANNUAL_COST - HEDERA_ANNUAL_COST,
  percentage: ((TRADITIONAL_ANNUAL_COST - HEDERA_ANNUAL_COST) / TRADITIONAL_ANNUAL_COST) * 100
};

const PROJECTION_5Y = {
  traditional: TRADITIONAL_ANNUAL_COST * 5,
  hedera:      HEDERA_ANNUAL_COST * 5,
  savings:     (TRADITIONAL_ANNUAL_COST - HEDERA_ANNUAL_COST) * 5
};

const PROJECTION_10Y = {
  traditional: TRADITIONAL_ANNUAL_COST * 10,
  hedera:      HEDERA_ANNUAL_COST * 10,
  savings:     (TRADITIONAL_ANNUAL_COST - HEDERA_ANNUAL_COST) * 10
};

// ============================================================================
// DISPLAY
// ============================================================================
const SEP  = '  ' + '━'.repeat(55);
const LINE = '=' .repeat(70);

console.log('\n' + LINE);
console.log('  HEDERA HYDROPOWER dMRV \u2014 COST MODEL COMPARISON');
console.log('  Apex Hackathon 2026 \u2014 Sustainability Track');
console.log(LINE + '\n');

// ── Traditional ──
console.log('\uD83D\uDCCA TRADITIONAL MRV SYSTEM (Annual Costs)\n');
console.log('  Third-Party Auditor Visits:        ' + fmtUSDint(TRADITIONAL_MRV.auditor_visits.annual_total));
console.log('    \u2022 4 quarterly visits @ $15,000 each');
console.log('    \u2022 Includes travel, labor, reporting\n');

console.log('  Manual Data Management:            ' + fmtUSDint(TRADITIONAL_MRV.data_management.annual_total));
console.log('    \u2022 1.5 FTE staff for data collection');
console.log('    \u2022 Excel sheets, manual validation\n');

console.log('  Certification & Compliance:        ' + fmtUSDint(TRADITIONAL_MRV.certification.annual_total));
console.log('    \u2022 ISO 14064 / Gold Standard certification');
console.log('    \u2022 Annual renewals + documentation\n');

console.log('  Carbon Credit Issuance Fees:       ' + fmtUSDint(TRADITIONAL_MRV.issuance_fees.annual_total));
console.log('    \u2022 $2.50 per tCO2e \u00d7 15,000 credits');
console.log('    \u2022 Registry fees (Verra, Gold Standard)\n');

console.log('  Legal & Consulting:                ' + fmtUSDint(TRADITIONAL_MRV.legal_consulting.annual_total));
console.log('    \u2022 Compliance reviews, contract mgmt\n');

console.log(SEP);
console.log('  TRADITIONAL TOTAL (Annual):        ' + fmtUSDint(TRADITIONAL_ANNUAL_COST));
console.log(SEP + '\n\n');

// ── Hedera dMRV ──
console.log('\u26A1 HEDERA dMRV SYSTEM (Annual Costs)\n');
console.log('  HCS Telemetry Anchoring:           ' + fmtUSD(HEDERA_DMRV.hcs_anchoring.annual_total));
console.log('    \u2022 ' + fmt(HEDERA_DMRV.hcs_anchoring.readings_per_year) + ' readings/year @ $0.0001 each');
console.log('    \u2022 Immutable audit trail on Hedera HCS\n');

console.log('  HREC Token Minting:                ' + fmtUSD(HEDERA_DMRV.hrec_minting.annual_total));
console.log('    \u2022 15,000 HREC tokens @ $0.001 each (+$1 setup)');
console.log('    \u2022 1 token = 1 verified MWh\n');

console.log('  Device DID Management:             ' + fmtUSD(HEDERA_DMRV.did_management.annual_total));
console.log('    \u2022 W3C DIDs for 2 turbines (amortized 10yr)');
console.log('    \u2022 Cryptographic device identity on Hedera\n');

console.log('  Infrastructure (VPS + Monitoring): ' + fmtUSD(HEDERA_DMRV.infrastructure.annual_total));
console.log('    \u2022 Edge gateway + API hosting ($20/mo)');
console.log('    \u2022 Grafana Cloud monitoring ($10/mo)\n');

console.log('  Human Oversight (0.1 FTE):         ' + fmtUSD(HEDERA_DMRV.human_oversight.annual_total));
console.log('    \u2022 Minimal staff for anomaly review');
console.log('    \u2022 AI Guardian handles 99%+ of verification\n');

console.log(SEP);
console.log('  HEDERA dMRV TOTAL (Annual):        ' + fmtUSD(HEDERA_ANNUAL_COST));
console.log(SEP + '\n\n');

// ── Savings ──
console.log('\uD83D\uDCB0 COST SAVINGS ANALYSIS\n');
console.log('  Traditional MRV Annual Cost:       ' + fmtUSDint(TRADITIONAL_ANNUAL_COST));
console.log('  Hedera dMRV Annual Cost:           ' + fmtUSD(HEDERA_ANNUAL_COST));
console.log(SEP);
console.log('  ANNUAL SAVINGS:                    ' + fmtUSD(SAVINGS.absolute));
console.log('  COST REDUCTION:                    ' + SAVINGS.percentage.toFixed(2) + '%');
console.log(SEP + '\n');

// ── Projections ──
console.log('\uD83D\uDCC8 LONG-TERM PROJECTIONS\n');
console.log('  5-YEAR PROJECTION:');
console.log('    Traditional MRV:                 ' + fmtUSDint(PROJECTION_5Y.traditional));
console.log('    Hedera dMRV:                     ' + fmtUSD(PROJECTION_5Y.hedera));
console.log('    Total Savings:                   ' + fmtUSD(PROJECTION_5Y.savings));
console.log('    ROI:                             ' + ((PROJECTION_5Y.savings / PROJECTION_5Y.hedera) * 100).toFixed(0) + '%\n');

console.log('  10-YEAR PROJECTION:');
console.log('    Traditional MRV:                 ' + fmtUSDint(PROJECTION_10Y.traditional));
console.log('    Hedera dMRV:                     ' + fmtUSD(PROJECTION_10Y.hedera));
console.log('    Total Savings:                   ' + fmtUSD(PROJECTION_10Y.savings));
console.log('    ROI:                             ' + ((PROJECTION_10Y.savings / PROJECTION_10Y.hedera) * 100).toFixed(0) + '%\n');

// ── Advantages ──
console.log('\uD83C\uDFAF KEY ADVANTAGES OF HEDERA dMRV\n');
console.log('  \u2705 Real-time verification (every 5 min vs quarterly audits)');
console.log('  \u2705 Cryptographic fraud prevention (not just detection)');
console.log('  \u2705 Immutable audit trail (Hedera HCS consensus timestamp)');
console.log('  \u2705 Automated carbon credit minting (no manual processing)');
console.log('  \u2705 Sub-cent transaction costs ($0.0001 per HCS message)');
console.log('  \u2705 Scalable to thousands of plants (no human bottleneck)');
console.log('  \u2705 Transparent for auditors/regulators (HashScan explorer)\n');

// ── Footer ──
const pct = SAVINGS.percentage.toFixed(2);
const footerMsg = '  \uD83C\uDFC6 RESULT: ' + pct + '% COST REDUCTION WITH HEDERA dMRV';
console.log(LINE);
console.log(footerMsg);
console.log(LINE + '\n');

console.log('\uD83D\uDCC4 DATA SOURCES:');
console.log('  \u2022 Hedera pricing: https://hedera.com/fees');
console.log('  \u2022 Traditional MRV benchmarks: Verra, Gold Standard, World Bank (2024)');
console.log('  \u2022 Plant basis: 6MW run-of-river hydro, 15,000 MWh/year\n');

// ============================================================================
// EXPORT FOR PROGRAMMATIC USE
// ============================================================================
if (require.main !== module) {
  module.exports = {
    TRADITIONAL_MRV,
    HEDERA_DMRV,
    TRADITIONAL_ANNUAL_COST,
    HEDERA_ANNUAL_COST,
    SAVINGS,
    PROJECTION_5Y,
    PROJECTION_10Y
  };
}
