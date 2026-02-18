/**
 * InMemoryAttestationStore
 *
 * PoC persistence layer — stores attestations in memory.
 * Designed to be replaced by a PostgreSQL/MongoDB adapter in production.
 * All public methods mirror what a production DB adapter would expose.
 */
'use strict';

class InMemoryAttestationStore {
  constructor() {
    this._store = [];
  }

  /**
   * Persist an attestation record.
   * @param {Object} attestation
   * @returns {Object} the saved attestation
   */
  save(attestation) {
    if (!attestation || !attestation.id) {
      throw new Error('Attestation must have an id field');
    }
    this._store.push({ ...attestation });
    return attestation;
  }

  /**
   * Find a single attestation by its ID.
   * @param {string} id
   * @returns {Object|null}
   */
  findById(id) {
    return this._store.find(a => a.id === id) || null;
  }

  /**
   * Find all attestations with a given status.
   * @param {'APPROVED'|'FLAGGED'|'REJECTED'} status
   * @returns {Object[]}
   */
  findByStatus(status) {
    return this._store.filter(a => a.status === status);
  }

  /**
   * Find all attestations for a specific device.
   * @param {string} deviceId
   * @returns {Object[]}
   */
  findByDevice(deviceId) {
    return this._store.filter(a => a.deviceId === deviceId);
  }

  /**
   * Return all stored attestations.
   * @returns {Object[]}
   */
  all() {
    return [...this._store];
  }

  /**
   * Return count of all stored attestations.
   * @returns {number}
   */
  count() {
    return this._store.length;
  }

  /**
   * Export all attestations as a JSON string.
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(this._store, null, 2);
  }

  /**
   * Import attestations from a JSON string.
   * @param {string} jsonString
   */
  importJSON(jsonString) {
    const records = JSON.parse(jsonString);
    if (!Array.isArray(records)) throw new Error('Expected JSON array');
    this._store = records;
  }

  /**
   * Clear all records (useful for testing).
   */
  clear() {
    this._store = [];
  }
}

// TODO (Production): Replace with:
//   class PostgresAttestationStore { ... }
// or:
//   class MongoAttestationStore { ... }
// keeping the same public API so no engine code changes are needed.

module.exports = { InMemoryAttestationStore };
