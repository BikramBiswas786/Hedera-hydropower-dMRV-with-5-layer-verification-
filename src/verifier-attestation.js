/**
 * Verifier Attestation Module - Production Grade
 * Creates and manages attestation records
 */
const crypto = require('crypto');

class VerifierAttestation {
  constructor(config = {}) {
    this.config = config;
    this.attestations = [];
  }

  /**
   * Create attestation (alias for createAttestation for test compatibility)
   * @param {Object} data - Attestation data
   * @returns {Object} Created attestation
   */
  create(data) {
    return this.createAttestation(data, data.verifier || 'AI-Guardian-v1');
  }

  /**
   * Create attestation record
   * @param {Object} data - Attestation data
   * @param {string} verifier - Verifier identifier
   * @returns {Object} Created attestation
   */
  createAttestation(data, verifier) {
    if (!data) {
      throw new Error('Attestation data is required');
    }

    const now = new Date().toISOString();

    const attestation = {
      id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      deviceId: data.deviceId,
      period: data.period || {
        start: data.timestamp || now,
        end: data.timestamp || now
      },
      timestamp: data.timestamp || now,
      verificationStatus: data.verificationStatus || 'APPROVED',
      trustScore: data.trustScore ?? 0.95,
      verifier: verifier || 'AI-Guardian-v1',
      signature: this.generateSignature(data),
      checks: data.checks || {},
      calculations: data.calculations || {},
      rejectionReasons: data.verificationStatus === 'REJECTED'
        ? (data.rejectionReasons && data.rejectionReasons.length > 0 ? data.rejectionReasons : ['Low trust score'])
        : undefined,
      metadata: {
        created: now,
        version: '1.0.0'
      },
      status: 'valid'
    };

    this.attestations.push(attestation);
    return attestation;
  }

  /**
   * Generate cryptographic signature
   * @param {Object} data - Data to sign
   * @returns {string} Signature
   */
  generateSignature(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Verify attestation by ID
   * @param {string} attestationId - Attestation ID
   * @returns {Object} Verification result
   */
  verifyAttestation(attestationId) {
    const attestation = this.attestations.find(a => a.id === attestationId);

    if (!attestation) {
      return {
        valid: false,
        reason: 'Attestation not found'
      };
    }

    const { signature, ...dataToVerify } = attestation;
    const expectedSig = this.generateSignature(dataToVerify);
    const valid = expectedSig === signature;

    return {
      valid,
      attestation,
      reason: valid ? null : 'Signature mismatch'
    };
  }

  /**
   * Get all attestations
   * @returns {Array} Array of attestations
   */
  getAttestations() {
    return this.attestations;
  }

  /**
   * Get attestations by status
   * @param {string} status - Status to filter by
   * @returns {Array} Filtered attestations
   */
  getAttestationsByStatus(status) {
    return this.attestations.filter(a => a.verificationStatus === status);
  }

  /**
   * Get attestations by device ID
   * @param {string} deviceId - Device ID to filter by
   * @returns {Array} Filtered attestations
   */
  getAttestationsByDevice(deviceId) {
    return this.attestations.filter(a => a.deviceId === deviceId);
  }

  /**
   * Clear all attestations
   */
  clearAttestations() {
    this.attestations = [];
  }

  /**
   * Export attestations as JSON
   * @returns {string} JSON string of attestations
   */
  exportAttestations() {
    return JSON.stringify(this.attestations, null, 2);
  }

  /**
   * Import attestations from JSON
   * @param {string} json - JSON string of attestations
   */
  importAttestations(json) {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        this.attestations = imported;
        return { success: true, count: imported.length };
      }
      throw new Error('Invalid attestation format');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = VerifierAttestation;
