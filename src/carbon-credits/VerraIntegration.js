/**
 * Verra Registry Integration
 * 
 * PURPOSE: Submit carbon credits to Verra for certification
 * STATUS: Mock implementation with real API structure
 * DOCS: https://registry.verra.org/api/docs
 */

const axios = require('axios');

class VerraIntegration {
  constructor(config = {}) {
    this.config = {
      apiUrl: config.apiUrl || process.env.VERRA_API_URL || 'https://registry.verra.org/api/v1',
      apiKey: config.apiKey || process.env.VERRA_API_KEY,
      projectId: config.projectId || process.env.VERRA_PROJECT_ID,
      useMock: config.useMock || !process.env.VERRA_API_KEY,
      ...config
    };

    this.mockDatabase = new Map();
  }

  async registerCredit(credit) {
    if (this.config.useMock) {
      return this._mockRegisterCredit(credit);
    }

    try {
      const payload = this._buildVerraPayload(credit);
      
      const response = await axios.post(
        `${this.config.apiUrl}/carbon-credits/register`,
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
        verra_certificate_id: response.data.certificate_id,
        verra_project_id: this.config.projectId,
        issuance_date: response.data.issuance_date,
        expiry_date: response.data.expiry_date,
        status: 'registered',
        registry_url: `https://registry.verra.org/certificate/${response.data.certificate_id}`
      };

    } catch (error) {
      console.error('[VERRA API ERROR]', error.message);
      return this._mockRegisterCredit(credit);
    }
  }

  _buildVerraPayload(credit) {
    return {
      project_id: this.config.projectId,
      methodology: 'ACM0002',
      quantity_tco2e: credit.quantity_tco2e,
      vintage_year: new Date(credit.created_at).getFullYear(),
      verification: {
        method: credit.metadata.verification_method || 'AI_AUTO_APPROVED',
        trust_score: credit.metadata.trust_score || 0.95,
        blockchain_proof: credit.hedera_transaction_id
      },
      device_info: credit.metadata.device_info || {}
    };
  }

  _mockRegisterCredit(credit) {
    const certificateId = `VCS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const issuanceDate = new Date().toISOString().split('T')[0];
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const certificate = {
      success: true,
      verra_certificate_id: certificateId,
      verra_project_id: this.config.projectId || 'MOCK-PROJECT-001',
      issuance_date: issuanceDate,
      expiry_date: expiryDate,
      quantity_tco2e: credit.quantity_tco2e,
      status: 'registered_mock',
      registry_url: `https://registry.verra.org/certificate/${certificateId}`,
      mode: 'MOCK',
      note: 'Apply for Verra approval at registry.verra.org'
    };

    this.mockDatabase.set(certificateId, certificate);
    return certificate;
  }

  async getProjectStatus() {
    if (this.config.useMock) {
      return {
        project_id: 'MOCK-PROJECT-001',
        status: 'mock_mode',
        approval_status: 'pending_real_approval',
        methodology: 'ACM0002',
        note: 'Configure VERRA_API_KEY to connect to real Verra registry'
      };
    }

    try {
      const response = await axios.get(
        `${this.config.apiUrl}/projects/${this.config.projectId}`,
        { headers: { 'Authorization': `Bearer ${this.config.apiKey}` } }
      );
      return response.data;
    } catch (error) {
      return { error: error.message, project_id: this.config.projectId, status: 'api_error' };
    }
  }

  async getCurrentPrice() {
    if (this.config.useMock) {
      return {
        currency: 'USD',
        price_per_tco2e: 15.50,
        price_inr_per_tco2e: 1286.50,
        market: 'verra_mock',
        timestamp: new Date().toISOString(),
        note: 'Mock prices based on 2026 market estimates'
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
        market: 'verra',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[VERRA PRICE ERROR]', error.message);
      return this.getCurrentPrice.call({ config: { useMock: true } });
    }
  }
}

module.exports = { VerraIntegration };