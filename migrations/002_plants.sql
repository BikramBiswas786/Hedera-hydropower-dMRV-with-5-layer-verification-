-- ═════════════════════════════════════════════════════════════════════
-- Migration 002: Multi-Plant Management
-- Requires: scripts/init-db.sql must have run first
--           (defines update_updated_at_column trigger function)
-- ═════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plants (
  id          SERIAL         PRIMARY KEY,
  plant_id    VARCHAR(50)    UNIQUE NOT NULL,
  name        VARCHAR(255)   NOT NULL,
  location    VARCHAR(255),
  capacity_mw DECIMAL(10, 2) NOT NULL
              CHECK (capacity_mw > 0 AND capacity_mw <= 10000),
  plant_type  VARCHAR(50)    NOT NULL DEFAULT 'hydro'
              CHECK (plant_type IN ('hydro', 'solar', 'wind', 'biomass', 'geothermal', 'tidal')),
  status      VARCHAR(20)    NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive', 'maintenance')),
  tenant_id   VARCHAR(255),
  created_by  VARCHAR(255),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_plants_plant_id  ON plants(plant_id);
CREATE INDEX IF NOT EXISTS idx_plants_status    ON plants(status);
CREATE INDEX IF NOT EXISTS idx_plants_type      ON plants(plant_type);
CREATE INDEX IF NOT EXISTS idx_plants_tenant    ON plants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plants_created   ON plants(created_at DESC);

-- Auto-update updated_at on every UPDATE
CREATE TRIGGER update_plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Verification query ────────────────────────────────────────────────────────────────────
-- Run after migration to confirm table was created:
--
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'plants'
--   ORDER BY ordinal_position;
