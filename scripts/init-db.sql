-- ═════════════════════════════════════════════════════════════════
-- Hedera Hydropower MRV - Production Database Schema
-- ═════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- Devices table
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) DEFAULT 'hydropower',
  capacity_kw NUMERIC(10, 2),
  location JSONB,  -- { lat, lng, address }
  device_did VARCHAR(500),
  hedera_token_id VARCHAR(50),
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_project_id ON devices(project_id);
CREATE INDEX idx_devices_status ON devices(status);

-- ─────────────────────────────────────────────────────────────────
-- Readings table (time-series telemetry)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  flow_rate NUMERIC(10, 4),
  head_height NUMERIC(10, 2),
  generated_kwh NUMERIC(12, 4),
  efficiency NUMERIC(5, 4),
  ph NUMERIC(4, 2),
  turbidity_ntu NUMERIC(10, 2),
  temperature_celsius NUMERIC(5, 2),
  raw_data JSONB,  -- Full telemetry packet
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_readings_device_timestamp ON readings(device_id, timestamp DESC);
CREATE INDEX idx_readings_timestamp ON readings(timestamp DESC);

-- ─────────────────────────────────────────────────────────────────
-- Attestations table
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attestations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reading_id UUID,
  device_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  verification_status VARCHAR(50) NOT NULL,  -- APPROVED, FLAGGED, REJECTED
  trust_score NUMERIC(5, 4),
  checks JSONB,  -- All check results
  calculations JSONB,  -- ACM0002 calculations
  hedera_transaction_id VARCHAR(200),
  hedera_topic_id VARCHAR(50),
  signature TEXT,
  full_attestation JSONB,  -- Complete attestation object
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (reading_id) REFERENCES readings(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_attestations_device ON attestations(device_id);
CREATE INDEX idx_attestations_status ON attestations(verification_status);
CREATE INDEX idx_attestations_timestamp ON attestations(timestamp DESC);
CREATE INDEX idx_attestations_trust_score ON attestations(trust_score DESC);
CREATE INDEX idx_attestations_hedera_tx ON attestations(hedera_transaction_id);

-- ─────────────────────────────────────────────────────────────────
-- ML Models audit trail
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_hash VARCHAR(255) UNIQUE NOT NULL,
  algorithm VARCHAR(100),
  trained_on INTEGER,
  trained_at TIMESTAMPTZ,
  metrics JSONB,  -- { precision, recall, f1 }
  features JSONB,  -- Feature names array
  hedera_transaction_id VARCHAR(200),
  hedera_topic_id VARCHAR(50),
  hedera_sequence_number BIGINT,
  model_file_path TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ml_models_hash ON ml_models(model_hash);
CREATE INDEX idx_ml_models_active ON ml_models(is_active);
CREATE INDEX idx_ml_models_trained_at ON ml_models(trained_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- Carbon Credits (RECs) issued
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attestation_id UUID,
  device_id VARCHAR(255) NOT NULL,
  amount_tco2e NUMERIC(12, 6),
  generated_mwh NUMERIC(12, 4),
  ef_grid NUMERIC(6, 4),
  methodology VARCHAR(50) DEFAULT 'ACM0002',
  hedera_token_id VARCHAR(50),
  hedera_serial_numbers JSONB,  -- Array of NFT serial numbers
  mint_transaction_id VARCHAR(200),
  retirement_status VARCHAR(50) DEFAULT 'active',  -- active, retired, transferred
  retired_at TIMESTAMPTZ,
  retired_by VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (attestation_id) REFERENCES attestations(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_carbon_credits_device ON carbon_credits(device_id);
CREATE INDEX idx_carbon_credits_status ON carbon_credits(retirement_status);
CREATE INDEX idx_carbon_credits_created ON carbon_credits(created_at DESC);
CREATE INDEX idx_carbon_credits_token ON carbon_credits(hedera_token_id);

-- ─────────────────────────────────────────────────────────────────
-- Users table (for authentication)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'viewer',  -- admin, operator, auditor, viewer
  api_key VARCHAR(255) UNIQUE,
  api_key_hash TEXT,
  last_login TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_api_key ON users(api_key);
CREATE INDEX idx_users_role ON users(role);

-- ─────────────────────────────────────────────────────────────────
-- Triggers for updated_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
