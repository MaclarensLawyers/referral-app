-- Automation system schema
-- Run this in Neon SQL Editor to add automation tables

-- NOTE: Referred clients are managed in Zapier (Zapier Tables or Google Sheets)
-- Zapier looks up referrals and POSTs directly to create automation jobs

-- Table: automation_jobs
-- Queue for pending automation tasks
CREATE TABLE IF NOT EXISTS automation_jobs (
    id SERIAL PRIMARY KEY,
    matter_id TEXT NOT NULL,
    client_participant_id TEXT NOT NULL,
    referrer_name TEXT NOT NULL,  -- Staff name as appears in Actionstep dropdown
    origination_percentage DECIMAL NOT NULL,
    status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Index for efficient job polling
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created ON automation_jobs(created_at DESC);

-- Table: automation_logs
-- Detailed logs of all automation attempts
CREATE TABLE IF NOT EXISTS automation_logs (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES automation_jobs(id),
    matter_id TEXT NOT NULL,
    client_participant_id TEXT,
    action TEXT NOT NULL,  -- 'origination_fee_set', 'already_set', 'failed', 'skipped'
    status TEXT NOT NULL,  -- 'success', 'error', 'warning'
    message TEXT,
    error_details TEXT,
    triggered_by TEXT DEFAULT 'zapier',  -- 'zapier', 'manual', 'retry'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_matter ON automation_logs(matter_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON automation_logs(status);

-- Update existing referred_matters table (optional - for backward compatibility)
-- This allows you to keep tracking matters in the app if needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'referred_matters'
                   AND column_name = 'origination_fee_set') THEN
        ALTER TABLE referred_matters
        ADD COLUMN origination_fee_set BOOLEAN DEFAULT FALSE,
        ADD COLUMN last_sync_attempt TIMESTAMPTZ;
    END IF;
END $$;

-- View: Recent automation activity (useful for monitoring)
CREATE OR REPLACE VIEW automation_activity AS
SELECT
    j.id AS job_id,
    j.matter_id,
    j.client_participant_id,
    c.client_name,
    c.referrer_name,
    j.origination_percentage,
    j.status,
    j.attempts,
    j.error_message,
    j.created_at,
    j.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(j.completed_at, NOW()) - j.created_at)) AS duration_seconds
FROM automation_jobs j
LEFT JOIN referred_clients c ON j.client_participant_id = c.client_participant_id
ORDER BY j.created_at DESC;

-- Migration: Change referrer_staff_id to referrer_name in automation_jobs (if already created)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'automation_jobs'
               AND column_name = 'referrer_staff_id') THEN
        ALTER TABLE automation_jobs RENAME COLUMN referrer_staff_id TO referrer_name;
    END IF;
END $$;

-- Grant permissions (adjust based on your Neon setup)
-- GRANT ALL PRIVILEGES ON TABLE referred_clients TO your_user;
-- GRANT ALL PRIVILEGES ON TABLE automation_jobs TO your_user;
-- GRANT ALL PRIVILEGES ON TABLE automation_logs TO your_user;
