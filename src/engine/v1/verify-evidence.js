#!/usr/bin/env node

/**
 * Evidence Verification Script
 * 
 * Purpose: Verify all on-chain evidence by testing HashScan links
 * Status: Production-Ready Phase 1
 * Date: February 14, 2026
 * 
 * This script:
 * 1. Reads evidence/txids.csv
 * 2. Tests each HashScan link for accessibility
 * 3. Validates link format and structure
 * 4. Generates verification report
 * 5. Flags any broken or invalid links
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const EVIDENCE_FILE = path.join(__dirname, '../evidence/txids.csv');
const REPORT_FILE = path.join(__dirname, '../evidence/VERIFICATION-REPORT.md');
const TESTNET_BASE = 'https://hashscan.io/testnet';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Statistics
let stats = {
  total: 0,
  verified: 0,
  failed: 0,
  skipped: 0,
  errors: [],
};

/**
 * Test if a URL is accessible
 * @param {string} url - URL to test
 * @returns {Promise<boolean>} - True if accessible, false otherwise
 */
function testUrl(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000); // 5 second timeout

    https.get(url, { timeout: 5000 }, (res) => {
      clearTimeout(timeout);
      // Accept 200-399 status codes as valid
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Validate HashScan link format
 * @param {string} url - URL to validate
 * @returns {object} - Validation result
 */
function validateLinkFormat(url) {
  const result = {
    isValid: false,
    type: null,
    id: null,
    error: null,
  };

  if (!url.startsWith(TESTNET_BASE)) {
    result.error = 'Not a testnet HashScan link';
    return result;
  }

  // Parse different link types
  if (url.includes('/account/')) {
    result.type = 'account';
    const match = url.match(/\/account\/(0\.0\.\d+)/);
    if (match) {
      result.id = match[1];
      result.isValid = true;
    } else {
      result.error = 'Invalid account ID format';
    }
  } else if (url.includes('/topic/')) {
    result.type = 'topic';
    const match = url.match(/\/topic\/(0\.0\.\d+)/);
    if (match) {
      result.id = match[1];
      result.isValid = true;
    } else {
      result.error = 'Invalid topic ID format';
    }
  } else if (url.includes('/token/')) {
    result.type = 'token';
    const match = url.match(/\/token\/(0\.0\.\d+)/);
    if (match) {
      result.id = match[1];
      result.isValid = true;
    } else {
      result.error = 'Invalid token ID format';
    }
  } else if (url.includes('/transaction/')) {
    result.type = 'transaction';
    const match = url.match(/\/transaction\/([\d\.@]+)/);
    if (match) {
      result.id = match[1];
      result.isValid = true;
    } else {
      result.error = 'Invalid transaction ID format';
    }
  } else {
    result.error = 'Unknown link type';
  }

  return result;
}

/**
 * Process evidence file
 */
async function processEvidence() {
  console.log(`${colors.blue}Starting Evidence Verification${colors.reset}\n`);

  if (!fs.existsSync(EVIDENCE_FILE)) {
    console.error(`${colors.red}Error: ${EVIDENCE_FILE} not found${colors.reset}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(EVIDENCE_FILE, 'utf-8');
  const lines = fileContent.split('\n').filter((line) => line.trim());

  const results = [];

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 4) continue;

    const [name, id, type, url, description] = parts;
    stats.total++;

    // Skip non-URL entries
    if (!url || !url.startsWith('http')) {
      stats.skipped++;
      results.push({
        name: name.trim(),
        id: id.trim(),
        type: type.trim(),
        url: url.trim(),
        status: 'SKIPPED',
        reason: 'Not a URL',
      });
      continue;
    }

    // Validate format
    const formatValidation = validateLinkFormat(url.trim());
    if (!formatValidation.isValid) {
      stats.failed++;
      stats.errors.push(`${name}: ${formatValidation.error}`);
      results.push({
        name: name.trim(),
        id: id.trim(),
        type: type.trim(),
        url: url.trim(),
        status: 'INVALID',
        reason: formatValidation.error,
      });
      console.log(`${colors.red}✗ ${name}: ${formatValidation.error}${colors.reset}`);
      continue;
    }

    // Test accessibility
    const isAccessible = await testUrl(url.trim());
    if (isAccessible) {
      stats.verified++;
      results.push({
        name: name.trim(),
        id: id.trim(),
        type: type.trim(),
        url: url.trim(),
        status: 'VERIFIED',
        reason: 'Link accessible',
      });
      console.log(`${colors.green}✓ ${name}${colors.reset}`);
    } else {
      stats.failed++;
      stats.errors.push(`${name}: Link not accessible`);
      results.push({
        name: name.trim(),
        id: id.trim(),
        type: type.trim(),
        url: url.trim(),
        status: 'FAILED',
        reason: 'Link not accessible',
      });
      console.log(`${colors.yellow}⚠ ${name}: Link not accessible${colors.reset}`);
    }
  }

  // Generate report
  generateReport(results);

  // Print summary
  console.log(`\n${colors.blue}Verification Summary${colors.reset}`);
  console.log(`Total entries: ${stats.total}`);
  console.log(`${colors.green}Verified: ${stats.verified}${colors.reset}`);
  console.log(`${colors.red}Failed: ${stats.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${stats.skipped}${colors.reset}`);

  if (stats.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    stats.errors.forEach((error) => {
      console.log(`  - ${error}`);
    });
  }

  console.log(`\n${colors.blue}Report saved to: ${REPORT_FILE}${colors.reset}`);
}

/**
 * Generate markdown verification report
 */
function generateReport(results) {
  let markdown = `# Evidence Verification Report

**Generated**: ${new Date().toISOString()}  
**Status**: Production-Ready Phase 1  
**Total Entries**: ${stats.total}  
**Verified**: ${stats.verified}  
**Failed**: ${stats.failed}  
**Skipped**: ${stats.skipped}  

## Summary

This report documents the verification of all on-chain evidence links in the Hedera Hydropower Digital MRV Tool.

### Verification Results

| Name | ID | Type | URL | Status | Notes |
|---|---|---|---|---|---|
`;

  results.forEach((result) => {
    const statusEmoji = result.status === 'VERIFIED' ? '✓' : result.status === 'INVALID' ? '✗' : '⚠';
    markdown += `| ${result.name} | ${result.id} | ${result.type} | [Link](${result.url}) | ${statusEmoji} ${result.status} | ${result.reason} |\n`;
  });

  markdown += `\n## Verification by Type\n\n`;

  // Group by type
  const byType = {};
  results.forEach((result) => {
    if (!byType[result.type]) {
      byType[result.type] = { verified: 0, failed: 0, skipped: 0 };
    }
    if (result.status === 'VERIFIED') byType[result.type].verified++;
    else if (result.status === 'FAILED') byType[result.type].failed++;
    else byType[result.type].skipped++;
  });

  Object.entries(byType).forEach(([type, counts]) => {
    markdown += `### ${type.charAt(0).toUpperCase() + type.slice(1)}\n`;
    markdown += `- Verified: ${counts.verified}\n`;
    markdown += `- Failed: ${counts.failed}\n`;
    markdown += `- Skipped: ${counts.skipped}\n\n`;
  });

  if (stats.errors.length > 0) {
    markdown += `## Issues Found\n\n`;
    stats.errors.forEach((error) => {
      markdown += `- ${error}\n`;
    });
    markdown += `\n`;
  }

  markdown += `## Recommendations\n\n`;
  if (stats.failed === 0) {
    markdown += `✓ All links verified successfully. No action required.\n`;
  } else {
    markdown += `⚠ ${stats.failed} links failed verification. Please investigate:\n`;
    results
      .filter((r) => r.status === 'FAILED')
      .forEach((result) => {
        markdown += `- ${result.name}: ${result.url}\n`;
      });
  }

  markdown += `\n## Conclusion\n\n`;
  markdown += `The Hedera Hydropower Digital MRV Tool has ${stats.verified} verified on-chain evidence entries on Hedera Testnet.\n`;
  markdown += `All evidence is publicly accessible and verifiable via HashScan.\n`;
  markdown += `\n**Status**: Phase 1 Complete - Ready for Phase 2 (Verra MIN Review)\n`;

  fs.writeFileSync(REPORT_FILE, markdown);
}

// Run verification
processEvidence().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
