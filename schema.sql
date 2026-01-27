-- Referral App Database Schema
-- Run this in your Neon database console

-- Store OAuth tokens and app settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Store referred matters
CREATE TABLE IF NOT EXISTS referred_matters (
    id SERIAL PRIMARY KEY,
    matter_id TEXT UNIQUE NOT NULL,
    matter_name TEXT,
    referrer_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Cache fee data fetched from Actionstep
CREATE TABLE IF NOT EXISTS fee_snapshots (
    id SERIAL PRIMARY KEY,
    matter_id TEXT REFERENCES referred_matters(matter_id) ON DELETE CASCADE,
    fetched_at TIMESTAMP DEFAULT NOW(),
    total_fees NUMERIC(10,2),
    fee_data JSONB,
    fetch_status TEXT DEFAULT 'completed',
    correlation_id TEXT,
    error_message TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_referred_matters_created_at ON referred_matters(created_at);
CREATE INDEX IF NOT EXISTS idx_fee_snapshots_matter_id ON fee_snapshots(matter_id);
CREATE INDEX IF NOT EXISTS idx_fee_snapshots_status ON fee_snapshots(matter_id, fetch_status, fetched_at DESC);

-- Insert default referral percentage (10%)
INSERT INTO settings (key, value)
VALUES ('referral_percentage', '10')
ON CONFLICT (key) DO NOTHING;

-- Insert default fetch method and Zapier URL
INSERT INTO settings (key, value)
VALUES
  ('fetch_method', 'direct'),
  ('zapier_fetch_url', '')
ON CONFLICT (key) DO NOTHING;
