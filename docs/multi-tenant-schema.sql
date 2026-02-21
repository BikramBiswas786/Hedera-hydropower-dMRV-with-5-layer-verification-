-- Multi-Tenant Architecture Schema
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  tier VARCHAR(50) NOT NULL,
  license_key VARCHAR(255) UNIQUE,
  plants_limit INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);
-- Link existing tables
ALTER TABLE plants ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE readings ADD COLUMN tenant_id UUID REFERENCES tenants(id);
-- Billing tables
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  tier VARCHAR(50) NOT NULL,
  annual_fee DECIMAL(12,2) NOT NULL,
  billing_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  transaction_type VARCHAR(50),
  cost_usd DECIMAL(10,4),
  cost_inr DECIMAL(12,2),
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE transaction_bills (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  transaction_count INT NOT NULL,
  total_cost_inr DECIMAL(12,2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
