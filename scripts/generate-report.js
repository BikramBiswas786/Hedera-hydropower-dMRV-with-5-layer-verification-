// scripts/generate-report.js
// Generate monitoring report from verification results

const fs = require('fs');
const path = require('path');

function loadResults(directory = '.') {
  const files = fs.readdirSync(directory)
    .filter(f => f.startsWith('telemetry-results-') && f.endsWith('.json'));

  if (files.length === 0) {
    throw new Error('No telemetry result files found. Run 03_submit_telemetry.js first.');
  }

  console.log(`\nFound ${files.length} result file(s):`);
  files.forEach(f => console.log(`  - ${f}`));

  const allResults = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    allResults.push(...data.results);
  }

  return allResults;
}

function analyzeResults(results) {
  const approved = results.filter(r => r.attestation.verificationStatus === 'APPROVED');
  const flagged = results.filter(r => r.attestation.verificationStatus === 'FLAGGED');
  const rejected = results.filter(r => r.attestation.verificationStatus === 'REJECTED');

  const totalRECs = approved.reduce((sum, r) => sum + r.attestation.calculations.RECs_issued, 0);
  const avgTrust = results.reduce((sum, r) => sum + r.attestation.trustScore, 0) / results.length;

  // Physics analysis
  const physicsScores = results.map(r => r.attestation.checks.physics.score);
  const avgPhysics = physicsScores.reduce((a, b) => a + b, 0) / physicsScores.length;

  // Temporal analysis
  const temporalScores = results.map(r => r.attestation.checks.temporal.score);
  const avgTemporal = temporalScores.reduce((a, b) => a + b, 0) / temporalScores.length;

  // Environmental analysis
  const envScores = results.map(r => r.attestation.checks.environmental.score);
  const avgEnv = envScores.reduce((a, b) => a + b, 0) / envScores.length;

  // Statistical analysis
  const statScores = results.map(r => r.attestation.checks.statistical.score);
  const avgStat = statScores.reduce((a, b) => a + b, 0) / statScores.length;

  // Consistency analysis
  const consScores = results.map(r => r.attestation.checks.consistency.score);
  const avgCons = consScores.reduce((a, b) => a + b, 0) / consScores.length;

  // Device breakdown
  const deviceMap = new Map();
  for (const result of results) {
    const deviceId = result.attestation.deviceId;
    if (!deviceMap.has(deviceId)) {
      deviceMap.set(deviceId, { approved: 0, flagged: 0, rejected: 0, totalRECs: 0 });
    }
    const stats = deviceMap.get(deviceId);

    if (result.attestation.verificationStatus === 'APPROVED') {
      stats.approved++;
      stats.totalRECs += result.attestation.calculations.RECs_issued;
    } else if (result.attestation.verificationStatus === 'FLAGGED') {
      stats.flagged++;
    } else {
      stats.rejected++;
    }
  }

  const deviceBreakdown = Array.from(deviceMap.entries()).map(([deviceId, stats]) => ({
    deviceId,
    ...stats,
    totalRECs: parseFloat(stats.totalRECs.toFixed(6))
  }));

  return {
    summary: {
      totalReadings: results.length,
      approved: approved.length,
      flagged: flagged.length,
      rejected: rejected.length,
      approvalRate: parseFloat(((approved.length / results.length) * 100).toFixed(2)),
      totalRECs: parseFloat(totalRECs.toFixed(6)),
      averageTrustScore: parseFloat(avgTrust.toFixed(4))
    },
    validationScores: {
      physics: parseFloat(avgPhysics.toFixed(4)),
      temporal: parseFloat(avgTemporal.toFixed(4)),
      environmental: parseFloat(avgEnv.toFixed(4)),
      statistical: parseFloat(avgStat.toFixed(4)),
      consistency: parseFloat(avgCons.toFixed(4))
    },
    deviceBreakdown
  };
}

function generateMarkdownReport(analysis) {
  const { summary, validationScores, deviceBreakdown } = analysis;
  const timestamp = new Date().toISOString();

  let report = `# Hydropower MRV Monitoring Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Readings | ${summary.totalReadings} |\n`;
  report += `| ✓ Approved | ${summary.approved} (${summary.approvalRate}%) |\n`;
  report += `| ⚠ Flagged | ${summary.flagged} |\n`;
  report += `| ✗ Rejected | ${summary.rejected} |\n`;
  report += `| Total RECs Issued | ${summary.totalRECs} tCO2 |\n`;
  report += `| Average Trust Score | ${summary.averageTrustScore} |\n\n`;

  report += `## Validation Scores\n\n`;
  report += `| Check | Average Score |\n`;
  report += `|-------|---------------|\n`;
  report += `| Physics | ${validationScores.physics} |\n`;
  report += `| Temporal | ${validationScores.temporal} |\n`;
  report += `| Environmental | ${validationScores.environmental} |\n`;
  report += `| Statistical | ${validationScores.statistical} |\n`;
  report += `| Consistency | ${validationScores.consistency} |\n\n`;

  report += `## Device Breakdown\n\n`;
  report += `| Device | Approved | Flagged | Rejected | RECs Issued |\n`;
  report += `|--------|----------|---------|----------|-------------|\n`;
  for (const device of deviceBreakdown) {
    report += `| ${device.deviceId} | ${device.approved} | ${device.flagged} | ${device.rejected} | ${device.totalRECs} tCO2 |\n`;
  }
  report += `\n`;

  report += `---\n\n`;
  report += `*Report generated by Hedera Hydropower MRV System*\n`;

  return report;
}

async function main() {
  console.log("\n📊 HEDERA HYDROPOWER MRV - MONITORING REPORT");
  console.log("============================================");

  try {
    // Load results
    const results = loadResults();
    console.log(`\n✓ Loaded ${results.length} total attestations`);

    // Analyze
    console.log("\nAnalyzing results...");
    const analysis = analyzeResults(results);

    // Generate reports
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save JSON
    const jsonFile = `monitoring-report-${timestamp}.json`;
    fs.writeFileSync(jsonFile, JSON.stringify(analysis, null, 2));
    console.log(`✓ JSON report saved: ${jsonFile}`);

    // Save Markdown
    const mdReport = generateMarkdownReport(analysis);
    const mdFile = `monitoring-report-${timestamp}.md`;
    fs.writeFileSync(mdFile, mdReport);
    console.log(`✓ Markdown report saved: ${mdFile}`);

    // Print summary
    console.log("\n=== SUMMARY ===");
    console.log(`Total Readings: ${analysis.summary.totalReadings}`);
    console.log(`Approval Rate: ${analysis.summary.approvalRate}%`);
    console.log(`Total RECs: ${analysis.summary.totalRECs} tCO2`);
    console.log(`Average Trust: ${analysis.summary.averageTrustScore}`);

    console.log("\n✓ Report Generation Complete!");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
