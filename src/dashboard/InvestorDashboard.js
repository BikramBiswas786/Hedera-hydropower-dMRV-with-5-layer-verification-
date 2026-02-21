'use strict';

/**
 * Investor Dashboard - Public Metrics
 * ════════════════════════════════════════════════════════════════
 * Public-facing dashboard for investors and stakeholders
 * NO sensitive operational data exposed
 */

class InvestorDashboard {
  constructor(workflow) {
    this.workflow = workflow;
  }

  /**
   * Get real-time public metrics
   */
  async getPublicMetrics() {
    const report = await this.workflow.generateMonitoringReport();
    
    return {
      realtime: {
        total_generation_mwh: report.totalGenerationMWh,
        total_carbon_offset_tco2e: report.totalCarbonCredits_tco2e,
        uptime_percentage: this._calculateUptime(report),
        last_updated: new Date().toISOString()
      },
      project: {
        project_id: this.workflow.projectId,
        technology: 'Hydropower',
        location: 'India',
        capacity_mw: 6,
        commissioned_date: '2024-01-01'
      },
      impact: {
        co2_equivalent_cars_off_road: Math.floor(report.totalCarbonCredits_tco2e / 4.6),
        homes_powered_annually: Math.floor(report.totalGenerationMWh / 10.8),
        trees_planted_equivalent: Math.floor(report.totalCarbonCredits_tco2e * 50)
      },
      verification: {
        blockchain: 'Hedera',
        methodology: 'ACM0002',
        average_trust_score: report.averageTrustScore,
        total_attestations: report.totalReadings
      }
    };
  }

  /**
   * Get monthly generation history
   */
  async getMonthlyHistory(months = 12) {
    // Mock data - in production, query from database
    const history = [];
    const now = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      
      // Simulate monsoon seasonality
      const isMonsoon = [6, 7, 8, 9].includes(date.getMonth());
      const baseGen = isMonsoon ? 4500 : 3000;
      const generation = baseGen + (Math.random() - 0.5) * 500;
      
      history.push({
        month: monthName,
        generation_mwh: parseFloat(generation.toFixed(2)),
        carbon_credits_tco2e: parseFloat((generation * 0.82 / 1000).toFixed(4)),
        uptime: 95 + Math.random() * 4
      });
    }
    
    return history;
  }

  /**
   * Calculate uptime percentage
   */
  _calculateUptime(report) {
    const total = report.totalReadings;
    const approved = report.approvedReadings;
    
    if (total === 0) return 0;
    return parseFloat(((approved / total) * 100).toFixed(2));
  }
}

module.exports = { InvestorDashboard };
