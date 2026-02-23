'use strict';

/**
 * PostgreSQL Connection Pool
 * ───────────────────────────────────────────────────────
 * Single shared pg.Pool across the whole process.
 * Reads DATABASE_URL from env (Railway / Heroku / docker-compose).
 * Falls back gracefully when DATABASE_URL is missing so the server
 * still boots locally without a database.
 */

const { Pool } = require('pg');

let _pool = null;

/**
 * Returns the pg Pool, or null if DATABASE_URL is not configured.
 * @returns {import('pg').Pool | null}
 */
function getPool() {
  if (_pool) return _pool;

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[DB] ❌ DATABASE_URL is not set in production!');
    } else {
      console.warn('[DB] ⚠️  DATABASE_URL not set — using in-memory fallback');
    }
    return null;
  }

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000
  });

  _pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  _pool.on('connect', () => {
    console.log('[DB] ✅ New client connected to PostgreSQL');
  });

  console.log('[DB] ✅ PostgreSQL pool initialised');
  return _pool;
}

/**
 * Run a health check query against the pool.
 * @returns {Promise<{ok: boolean, latencyMs: number, storage: string}>}
 */
async function healthCheck() {
  const pool = getPool();
  if (!pool) return { ok: false, latencyMs: 0, storage: 'in-memory' };

  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - t0, storage: 'postgresql' };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, storage: 'postgresql', error: err.message };
  }
}

module.exports = { getPool, healthCheck };
