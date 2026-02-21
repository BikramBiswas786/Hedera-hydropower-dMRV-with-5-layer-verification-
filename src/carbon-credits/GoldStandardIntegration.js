/**
 * Gold Standard Registry Integration
 * 
 * PURPOSE: Parallel approval pathway for carbon credits
 * STATUS: Mock implementation with real API structure
 * DOCS: https://www.goldstandard.org/articles/api-documentation
 */

const axios = require('axios');

class GoldStandardIntegration {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.GOLDSTANDARD_API_URL || 'https://registry.goldstandard.org/api/v1',
      apiKey: config.apiKey || process.env.GOLDSTANDARD_API_KEY,
      projectId: config.projectId || process.env.GOLDSTANDARD_PROJECT_ID,
      useMock: config.useMock || !process.env.GOLDSTANDARD_API_KEY,
      ...config
    };

    this.mockDatabase = new Map();
  }

  async registerCredit(credit) {
    if (this.config.useMock) {
      return this._mockRegisterCredit(credit);
    }

    try {
      const payload = {
        project_id: this.config.projectId,
        methodology: 'ACM0002',
        quantity_tco2e: credit.quantity_tco2e,
        vintage_year: new Date(credit.created_at).getFullYear(),
        verification_data: {
          blockchain_proof: credit.hedera_transaction_id,
          trust_score: credit.metadata.trust_score || 0.95
        }
      };

      const response = await axios.post(
        `${this.config.apiUrl}/credits/register`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        success: true,
        gs_certificate_id: response.data.certificate_id,
        gs_project_id: this.config.projectId,
        issuance_date: response.data.issuance_date,
        expiry_date: response.data.expiry_date,
        status: 'registered',
        registry_url: `https://registry.goldstandard.org/credit/${response.data.certificate_id}`
      };

    } catch (error) {
      console.error('[GOLD STANDARD API ERROR]', error.message);
      return this._mockRegisterCredit(credit);
    }
  }

  _mockRegisterCredit(credit) {
    const certificateId = `GS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const issuanceDate = new Date().toISOString().split('T')[0];
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const certificate = {
      success: true,
      gs_certificate_id: certificateId,
      gs_project_id: this.config.projectId || 'MOCK-GS-PROJECT-001',
      issuance_date: issuanceDate,
      expiry_date: expiryDate,
      quantity_tco2e: credit.quantity_tco2e,
      status: 'registered_mock',
      registry_url: `https://registry.goldstandard.org/credit/${certificateId}`,
      mode: 'MOCK',
      note: 'Apply for Gold Standard approval at goldstandard.org'
    };

    this.mockDatabase.set(certificateId, certificate);
    return certificate;
  }

  async getCurrentPrice() {
    if (this.config.useMock) {
      return {
        currency: 'USD',
        price_per_tco2e: 17.20,
        price_inr_per_tco2e: 1427.60,
        market: 'goldstandard_mock',
        timestamp: new Date().toISOString(),
        note: 'Gold Standard typically trades at 10-15% premium vs Verra'
      };
    }

    try {
      const response = await axios.get(
        `${this.config.apiUrl}/marketplace/prices`,
        { headers: { 'Authorization': `Bearer ${this.config.apiKey}` } }
      );

      return {
        currency: 'USD',
        price_per_tco2e: response.data.spot_price,
        price_inr_per_tco2e: response.data.spot_price * 83,
        market: 'goldstandard',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[GS PRICE ERROR]', error.message);
      return this.getCurrentPrice.call({ config: { useMock: true } });
    }
  }
}

module.exports = { GoldStandardIntegration };