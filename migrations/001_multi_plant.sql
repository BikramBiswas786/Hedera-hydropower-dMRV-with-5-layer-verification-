-- ═══════════════════════════════════════════════════════════════
-- Multi-Plant Management Database Schema
-- ═══════════════════════════════════════════════════════════════
-- Version: 1.0
-- Date: 2026-02-21
-- Purpose: Enable tracking of multiple hydropower plants

-- ───────────────────────────────────────────────────────────────
-- Plants Table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plants (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  capacity_mw DECIMAL(10, 2) NOT NULL,
  commissioned_date DATE,
  operator VARCHAR(255),
  operator_contact VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'decommissioned')),
  plant_type VARCHAR(50) DEFAULT 'hydro' CHECK (plant_type IN ('hydro', 'solar', 'wind', 'biomass')),
  turbine_count INTEGER,
  head_height_meters DECIMAL(8, 2),
  design_flow_rate DECIMAL(10, 3),
  grid_connection_type VARCHAR(50),
  hedera_account_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for plants table
CREATE INDEX IF NOT EXISTS idx_plants_status ON plants(status);
CREATE INDEX IF NOT EXISTS idx_plants_type ON plants(plant_type);
CREATE INDEX IF NOT EXISTS idx_plants_operator ON plants(operator);
CREATE INDEX IF NOT EXISTS idx_plants_location ON plants(latitude, longitude);

-- ───────────────────────────────────────────────────────────────
-- Plant Telemetry Table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plant_telemetry (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(50) NOT NULL REFERENCES plants(plant_id) ON DELETE CASCADE,
  reading JSONB NOT NULL,
  trust_score DECIMAL(5, 4),
  physics_score DECIMAL(5, 4),
  temporal_score DECIMAL(5, 4),
  environmental_score DECIMAL(5, 4),
  ml_score DECIMAL(5, 4),
  verdict VARCHAR(20) CHECK (verdict IN ('APPROVED', 'FLAGGED', 'REJECTED')),
  hedera_tx_id VARCHAR(255),
  hedera_topic_id VARCHAR(50),
  carbon_credits_tco2e DECIMAL(10, 6),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for telemetry table
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_plant ON plant_telemetry(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_created ON plant_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_verdict ON plant_telemetry(verdict);
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_trust ON plant_telemetry(trust_score);
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_hedera ON plant_telemetry(hedera_tx_id) WHERE hedera_tx_id IS NOT NULL;

-- Create GIN index for JSONB reading data
CREATE INDEX IF NOT EXISTS idx_plant_telemetry_reading_gin ON plant_telemetry USING GIN (reading);

-- ───────────────────────────────────────────────────────────────
-- Plant Performance Metrics (Materialized View)
-- ───────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS plant_performance_daily AS
SELECT 
  plant_id,
  DATE(created_at) as date,
  COUNT(*) as total_readings,
  COUNT(*) FILTER (WHERE verdict = 'APPROVED') as approved_readings,
  COUNT(*) FILTER (WHERE verdict = 'FLAGGED') as flagged_readings,
  COUNT(*) FILTER (WHERE verdict = 'REJECTED') as rejected_readings,
  AVG(trust_score) as avg_trust_score,
  SUM((reading->>'generatedKwh')::NUMERIC) as total_generation_kwh,
  SUM(carbon_credits_tco2e) as total_carbon_credits,
  AVG((reading->>'efficiency')::NUMERIC) as avg_efficiency,
  MIN(created_at) as first_reading,
  MAX(created_at) as last_reading
FROM plant_telemetry
GROUP BY plant_id, DATE(created_at);

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_plant_performance_plant_date ON plant_performance_daily(plant_id, date DESC);

-- ───────────────────────────────────────────────────────────────
-- Plant Alerts Table
-- ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plant_alerts (
  id SERIAL PRIMARY KEY,
  plant_id VARCHAR(50) NOT NULL REFERENCES plants(plant_id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'fraud_detected',
    'underperformance',
    'offline',
    'maintenance_required',
    'anomaly',
    'threshold_breach'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message TEXT NOT NULL,
  details JSONB,
  telemetry_id INTEGER REFERENCES plant_telemetry(id),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for alerts table
CREATE INDEX IF NOT EXISTS idx_plant_alerts_plant ON plant_alerts(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_alerts_type ON plant_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_plant_alerts_severity ON plant_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_plant_alerts_unresolved ON plant_alerts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_plant_alerts_created ON plant_alerts(created_at DESC);

-- ───────────────────────────────────────────────────────────────
-- Functions & Triggers
-- ───────────────────────────────────────────────────────────────

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_plants_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ───────────────────────────────────────────────────────────────
-- Sample Data (Optional - for testing)
-- ───────────────────────────────────────────────────────────────

-- Insert demo plants
INSERT INTO plants (plant_id, name, location, latitude, longitude, capacity_mw, commissioned_date, operator, plant_type, turbine_count, head_height_meters, design_flow_rate)
VALUES 
  ('PLANT-001', 'Balurghat Hydro Plant', 'Balurghat, West Bengal', 25.2220, 88.7500, 5.0, '2020-01-15', 'West Bengal Power Development Corporation', 'hydro', 2, 45.0, 12.5),
  ('PLANT-002', 'Jaldhaka Hydropower', 'Jaldhaka, West Bengal', 26.8860, 88.7587, 3.5, '2019-06-20', 'WBSEDCL', 'hydro', 1, 38.0, 9.8),
  ('PLANT-003', 'Teesta Low Dam Project', 'Darjeeling, West Bengal', 26.9910, 88.4460, 132.0, '2015-03-10', 'NHPC Limited', 'hydro', 6, 96.0, 320.0)
ON CONFLICT (plant_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────
-- Useful Queries
-- ───────────────────────────────────────────────────────────────

-- Get total capacity by status
-- SELECT status, SUM(capacity_mw) as total_capacity_mw, COUNT(*) as plant_count
-- FROM plants
-- GROUP BY status;

-- Get daily performance for a plant
-- SELECT * FROM plant_performance_daily
-- WHERE plant_id = 'PLANT-001'
-- ORDER BY date DESC
-- LIMIT 30;

-- Get active alerts
-- SELECT p.name, a.alert_type, a.severity, a.message, a.created_at
-- FROM plant_alerts a
-- JOIN plants p ON a.plant_id = p.plant_id
-- WHERE a.resolved = FALSE
-- ORDER BY a.severity DESC, a.created_at DESC;

-- Refresh materialized view (run daily via cron)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY plant_performance_daily;

COMMIT;
