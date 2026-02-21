'use strict';

/**
 * Carbon Marketplace Connector
 * ════════════════════════════════════════════════════════════════════
 * Connects to voluntary carbon registries for REC certification
 */

const axios = require('axios');

class MarketplaceConnector {
  constructor(options = {}) {
    this.verraApiKey = options.verraApiKey || process.env.VERRA_API_KEY;
    this.goldStandardApiKey = options.goldStandardApiKey || process.env.GOLD_STANDARD_API_KEY;
    
    this.verraBaseUrl = 'https://registry.verra.org/api/v1';
    this.goldStandardBaseUrl = 'https://api.goldstandard.org/v1';
    
    // Mock mode for development
    this.mockMode = !this.verraApiKey && !this.goldStandardApiKey;
    
    if (this.mockMode) {
      console.warn('[MarketplaceConnector] Running in mock mode (no API keys)');
    }
  }

  /**
   * Submit RECs to Verra Registry
   * @param {Array} attestations - Verified attestations with carbon credits
   * @returns {object} - Submission result
   */
  async submitToVerra(attestations) {
    if (this.mockMode) {
      return this._mockSubmission('verra', attestations);
    }

    try {
      const payload = {
        project_id: process.env.VERRA_PROJECT_ID,
        methodology: 'ACM0002',
        credits: attestations.map(a => ({
          serial_number: a.hedera_transaction_id,
          amount_tco2e: a.carbonCredits?.amount_tco2e || 0,
          generated_mwh: a.carbonCredits?.generated_mwh || 0,
          timestamp: a.timestamp,
          verification_url: `https://hashscan.io/testnet/transaction/${a.hedera_transaction_id}`
        }))
      };

      const response = await axios.post(
        `${this.verraBaseUrl}/projects/credits/submit`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.verraApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        registry: 'verra',
        submission_id: response.data.submission_id,
        status: response.data.status,
        credits_submitted: attestations.length,
        total_tco2e: attestations.reduce((sum, a) => sum + (a.carbonCredits?.amount_tco2e || 0), 0)
      };
    } catch (error) {
      console.error('[MarketplaceConnector] Verra submission failed:', error.message);
      throw error;
    }
  }

  /**
   * Submit RECs to Gold Standard
   */
  async submitToGoldStandard(attestations) {
    if (this.mockMode) {
      return this._mockSubmission('gold_standard', attestations);
    }

    try {
      const payload = {
        project_id: process.env.GOLD_STANDARD_PROJECT_ID,
        technology: 'hydropower',
        credits: attestations.map(a => ({
          external_id: a.hedera_transaction_id,
          amount: a.carbonCredits?.amount_tco2e || 0,
          verification_date: a.timestamp
        }))
      };

      const response = await axios.post(
        `${this.goldStandardBaseUrl}/carbon-credits/submit`,
        payload,
        {
          headers: {
            'X-API-Key': this.goldStandardApiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        registry: 'gold_standard',
        submission_id: response.data.id,
        status: response.data.status,
        credits_submitted: attestations.length
      };
    } catch (error) {
      console.error('[MarketplaceConnector] Gold Standard submission failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current carbon credit price (spot market)
   * @returns {object} - Price data
   */
  async getCurrentPrice() {
    if (this.mockMode) {
      // Mock price data
      return {
        price_usd_per_tco2e: 15.50,
        currency: 'USD',
        source: 'mock',
        timestamp: new Date().toISOString(),
        market: 'voluntary'
      };
    }

    try {
      // In production, use actual carbon price APIs
      // Example: Climate Trade, Carbon Direct, etc.
      const response = await axios.get(
        'https://api.carbonprice.io/v1/spot',
        { timeout: 10000 }
      );

      return {
        price_usd_per_tco2e: response.data.price,
        currency: response.data.currency,
        source: response.data.source,
        timestamp: response.data.timestamp,
        market: response.data.market_type
      };
    } catch (error) {
      console.error('[MarketplaceConnector] Price fetch failed:', error.message);
      // Fallback to mock
      return this.getCurrentPrice.call({ mockMode: true });
    }
  }

  /**
   * Calculate revenue projection
   * @param {number} totalTco2e - Total carbon credits
   * @returns {object} - Revenue breakdown
   */
  async calculateRevenue(totalTco2e) {
    const priceData = await this.getCurrentPrice();
    const revenue = totalTco2e * priceData.price_usd_per_tco2e;

    return {
      total_tco2e: totalTco2e,
      price_per_tco2e: priceData.price_usd_per_tco2e,
      estimated_revenue_usd: parseFloat(revenue.toFixed(2)),
      estimated_revenue_inr: parseFloat((revenue * 83).toFixed(2)), // USD to INR
      currency: 'USD',
      price_source: priceData.source,
      calculated_at: new Date().toISOString()
    };
  }

  /**
   * Generate monthly revenue report
   * @param {Array} attestations - Month's attestations
   */
  async generateMonthlyReport(attestations) {
    const totalTco2e = attestations.reduce(
      (sum, a) => sum + (a.carbonCredits?.amount_tco2e || 0),
      0
    );

    const totalMwh = attestations.reduce(
      (sum, a) => sum + (a.carbonCredits?.generated_mwh || 0),
      0
    );

    const revenue = await this.calculateRevenue(totalTco2e);

    return {
      period: `${new Date().toISOString().slice(0, 7)}`, // YYYY-MM
      attestations_count: attestations.length,
      total_generation_mwh: parseFloat(totalMwh.toFixed(2)),
      total_carbon_credits_tco2e: parseFloat(totalTco2e.toFixed(4)),
      ...revenue,
      average_price_per_mwh: parseFloat((revenue.estimated_revenue_usd / totalMwh).toFixed(2))
    };
  }

  /**
   * Retire carbon credits
   * @param {Array} creditIds - Credit serial numbers to retire
   * @param {string} beneficiary - Who is retiring (company name)
   */
  async retireCredits(creditIds, beneficiary) {
    if (this.mockMode) {
      return {
        success: true,
        retired_count: creditIds.length,
        retirement_certificate: `MOCK-RET-${Date.now()}`,
        beneficiary
      };
    }

    // Actual retirement via registry APIs
    // Implementation depends on specific registry
    throw new Error('Production retirement not yet implemented');
  }

  /**
   * Mock submission for development
   */
  _mockSubmission(registry, attestations) {
    const totalTco2e = attestations.reduce(
      (sum, a) => sum + (a.carbonCredits?.amount_tco2e || 0),
      0
    );

    return {
      success: true,
      registry,
      submission_id: `MOCK-${registry.toUpperCase()}-${Date.now()}`,
      status: 'pending_review',
      credits_submitted: attestations.length,
      total_tco2e: parseFloat(totalTco2e.toFixed(4)),
      estimated_review_time: '14 days',
      note: 'Mock submission - no actual registry interaction'
    };
  }
}

module.exports = { MarketplaceConnector };
