'use strict';

/**
 * PlantRepository
 * ───────────────────────────────────────────────────────
 * All CRUD operations for the `plants` table.
 * Auto-detects whether PostgreSQL is available; falls back to
 * an in-memory array so the server stays functional without a DB.
 */

const { getPool } = require('./pool');

class PlantRepository {
  constructor() {
    // In-memory fallback (lost on restart — only used when no DB)
    this._mem = [];
  }

  /** Returns true if a live PostgreSQL pool is available. */
  get _db() { return getPool(); }
  isUsingDB() { return !!this._db; }

  /**
   * Insert a new plant.
   * Throws 'PLANT_EXISTS' if plant_id already taken.
   */
  async create(plant) {
    if (!this._db) {
      if (this._mem.find(p => p.plant_id === plant.plant_id)) {
        throw new Error('PLANT_EXISTS');
      }
      const record = { ...plant, id: this._mem.length + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      this._mem.push(record);
      return record;
    }

    try {
      const { rows } = await this._db.query(
        `INSERT INTO plants
           (plant_id, name, location, capacity_mw, plant_type, status, tenant_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          plant.plant_id,
          plant.name,
          plant.location    || null,
          plant.capacity_mw,
          plant.plant_type  || 'hydro',
          plant.status      || 'active',
          plant.tenant_id   || null,
          plant.created_by  || null
        ]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') throw new Error('PLANT_EXISTS'); // unique violation
      throw err;
    }
  }

  /**
   * List plants with optional filters.
   * @param {{ status?: string, type?: string }} filters
   */
  async findAll({ status, type } = {}) {
    if (!this._db) {
      let result = [...this._mem];
      if (status) result = result.filter(p => p.status    === status);
      if (type)   result = result.filter(p => p.plant_type === type);
      return result;
    }

    const conditions = [];
    const params     = [];

    if (status) { conditions.push(`status     = $${params.length + 1}`); params.push(status); }
    if (type)   { conditions.push(`plant_type = $${params.length + 1}`); params.push(type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this._db.query(
      `SELECT * FROM plants ${where} ORDER BY created_at DESC`,
      params
    );
    return rows;
  }

  /** Find a single plant by its plant_id string. */
  async findById(plantId) {
    if (!this._db) {
      return this._mem.find(p => p.plant_id === plantId) || null;
    }
    const { rows } = await this._db.query(
      'SELECT * FROM plants WHERE plant_id = $1',
      [plantId]
    );
    return rows[0] || null;
  }

  /** Fleet-wide aggregate statistics. */
  async aggregate() {
    if (!this._db) {
      const plants = this._mem;
      const byType   = {};
      const byStatus = {};
      plants.forEach(p => { byType[p.plant_type] = (byType[p.plant_type] || 0) + 1; });
      plants.forEach(p => { byStatus[p.status]   = (byStatus[p.status]   || 0) + 1; });
      return {
        total_plants:      plants.length,
        active_plants:     plants.filter(p => p.status === 'active').length,
        total_capacity_mw: plants.reduce((s, p) => s + Number(p.capacity_mw), 0),
        by_type:   byType,
        by_status: byStatus,
        storage:   'in-memory'
      };
    }

    const [{ rows: [agg] }, { rows: byType }, { rows: byStatus }] = await Promise.all([
      this._db.query(`
        SELECT
          COUNT(*)                                  AS total_plants,
          COUNT(*) FILTER (WHERE status = 'active') AS active_plants,
          COALESCE(SUM(capacity_mw), 0)             AS total_capacity_mw
        FROM plants
      `),
      this._db.query('SELECT plant_type, COUNT(*)::int AS count FROM plants GROUP BY plant_type'),
      this._db.query('SELECT status,     COUNT(*)::int AS count FROM plants GROUP BY status')
    ]);

    return {
      total_plants:      parseInt(agg.total_plants),
      active_plants:     parseInt(agg.active_plants),
      total_capacity_mw: parseFloat(agg.total_capacity_mw),
      by_type:   Object.fromEntries(byType.map(r  => [r.plant_type, r.count])),
      by_status: Object.fromEntries(byStatus.map(r => [r.status,     r.count])),
      storage:   'postgresql'
    };
  }
}

// Process-wide singleton
const plantRepo = new PlantRepository();
module.exports = { plantRepo, PlantRepository };
