'use strict';

const { InMemoryAttestationStore } = require('../../src/storage/InMemoryAttestationStore');

describe('InMemoryAttestationStore', () => {
  let store;

  beforeEach(() => {
    store = new InMemoryAttestationStore();
  });

  describe('save()', () => {
    it('saves an attestation and returns it', () => {
      const att = { id: 'att-001', status: 'APPROVED', trustScore: 1.0 };
      const result = store.save(att);
      expect(result).toEqual(att);
    });

    it('throws if attestation has no id', () => {
      expect(() => store.save({ status: 'APPROVED' })).toThrow('Attestation must have an id field');
    });

    it('stores multiple attestations', () => {
      store.save({ id: 'att-001', status: 'APPROVED' });
      store.save({ id: 'att-002', status: 'REJECTED' });
      expect(store.count()).toBe(2);
    });
  });

  describe('findById()', () => {
    it('returns attestation by id', () => {
      store.save({ id: 'att-001', status: 'APPROVED' });
      const result = store.findById('att-001');
      expect(result.id).toBe('att-001');
    });

    it('returns null for unknown id', () => {
      expect(store.findById('nonexistent')).toBeNull();
    });
  });

  describe('findByStatus()', () => {
    it('returns only matching status', () => {
      store.save({ id: 'att-001', status: 'APPROVED' });
      store.save({ id: 'att-002', status: 'REJECTED' });
      store.save({ id: 'att-003', status: 'APPROVED' });
      const approved = store.findByStatus('APPROVED');
      expect(approved).toHaveLength(2);
      approved.forEach(a => expect(a.status).toBe('APPROVED'));
    });

    it('returns empty array when none match', () => {
      expect(store.findByStatus('FLAGGED')).toHaveLength(0);
    });
  });

  describe('findByDevice()', () => {
    it('returns attestations for specific device', () => {
      store.save({ id: 'att-001', deviceId: 'TURBINE-1', status: 'APPROVED' });
      store.save({ id: 'att-002', deviceId: 'TURBINE-2', status: 'APPROVED' });
      store.save({ id: 'att-003', deviceId: 'TURBINE-1', status: 'FLAGGED' });
      const results = store.findByDevice('TURBINE-1');
      expect(results).toHaveLength(2);
    });
  });

  describe('all()', () => {
    it('returns copy of all records', () => {
      store.save({ id: 'att-001', status: 'APPROVED' });
      const all = store.all();
      expect(all).toHaveLength(1);
      // Mutating the returned array should not affect the store
      all.push({ id: 'injected' });
      expect(store.count()).toBe(1);
    });
  });

  describe('exportJSON() / importJSON()', () => {
    it('round-trips data correctly', () => {
      store.save({ id: 'att-001', status: 'APPROVED', trustScore: 0.98 });
      const json = store.exportJSON();
      const store2 = new InMemoryAttestationStore();
      store2.importJSON(json);
      expect(store2.count()).toBe(1);
      expect(store2.findById('att-001').trustScore).toBe(0.98);
    });

    it('throws on invalid JSON array input', () => {
      expect(() => store.importJSON('{"not":"array"}')).toThrow();
    });
  });

  describe('clear()', () => {
    it('empties the store', () => {
      store.save({ id: 'att-001', status: 'APPROVED' });
      store.clear();
      expect(store.count()).toBe(0);
    });
  });
});
