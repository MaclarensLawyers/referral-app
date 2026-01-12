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
    fee_data JSONB
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_referred_matters_created_at ON referred_matters(created_at);
CREATE INDEX IF NOT EXISTS idx_fee_snapshots_matter_id ON fee_snapshots(matter_id);

-- Insert default referral percentage (10%)
INSERT INTO settings (key, value) 
VALUES ('referral_percentage', '10')
ON CONFLICT (key) DO NOTHING;
