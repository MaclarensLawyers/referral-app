# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Actionstep origination fee automation system. Automatically sets origination fees in Actionstep when new matters are created for referred clients.

## Architecture

**Simplified webhook-based system:**
1. Zapier maintains referred client list (Zapier Tables or Google Sheets)
2. Zapier detects new matters in Actionstep
3. Zapier POSTs to Netlify webhook to create automation job
4. Puppeteer worker polls database and processes jobs
5. Worker logs into Actionstep and sets origination fee

## Project Structure

```
netlify/functions/           # Serverless API
└── set-origination-fee.js   # Zapier webhook endpoint (creates jobs)

automation-worker/           # Puppeteer automation bot (runs separately)
├── actionstep-bot.js        # Bot class for Actionstep automation
├── job-processor.js         # Job queue processor
├── index.js                 # Worker entry point
├── test-*.js                # Test scripts
├── debug-*.js               # Debug scripts
└── README.md                # Worker setup guide

schema-automation.sql        # Database schema (automation_jobs, automation_logs)

Documentation:
├── README.md                # Quick start guide
├── AUTOMATION_SYSTEM.md     # Complete system documentation
└── ZAPIER_SETUP.md          # Zapier workflow setup
```

## No Frontend

This app has no user interface. All interaction happens via:
- Zapier interface forms (for managing referrals)
- Zapier workflow (for automation triggering)
- Direct database queries (for monitoring)

## Key Components

### Netlify Function

**Single endpoint:** `/api/set-origination-fee`
- Public webhook for Zapier
- Accepts: matter_id, client_participant_id, referrer_name, percentage
- Creates job in `automation_jobs` table
- No authentication (safe because it only queues jobs, doesn't execute)

**Routing:** netlify.toml routes `/api/*` to `/.netlify/functions/:splat`

### Database

**Neon PostgreSQL with serverless driver:**
- `automation_jobs` - Job queue (pending/processing/completed/failed)
- `automation_logs` - Activity history

**No user tables, no Auth0, no original fee calculation tables**

### Automation Worker

**Puppeteer-based Node.js worker (runs separately from Netlify):**
- Polls database every 30 seconds for pending jobs
- Logs into Actionstep with automatic TOTP 2FA
- Navigates to matter billing page
- Sets origination fee using exact staff name
- Handles session timeouts and browser crashes
- Retries failed jobs up to 3 times
- Takes screenshots for debugging

**Deployment:** Local for testing, DigitalOcean for production

## Environment Variables

### Netlify
```
DATABASE_URL              # Neon PostgreSQL connection string
```

### Automation Worker (.env file)
```
DATABASE_URL              # Neon PostgreSQL connection string
ACTIONSTEP_USERNAME       # Actionstep login email
ACTIONSTEP_PASSWORD       # Actionstep password
ACTIONSTEP_TOTP_SECRET    # TOTP secret for 2FA
ACTIONSTEP_URL           # e.g., https://go.actionstep.com
POLL_INTERVAL            # Seconds between polls (default 30)
HEADLESS                 # true for production, false for debugging
```

## Development Workflow

**No local dev server needed.** The only code that runs is:
1. Netlify Function (deployed automatically on git push)
2. Automation Worker (run locally or on DigitalOcean)

**Testing:**
```bash
cd automation-worker
npm install
cp .env.example .env
# Edit .env
node test-setup.js           # Verify configuration
node test-automation.js MATTER_ID "REFERRER_NAME" PERCENTAGE
npm start                    # Run worker
```

**No build process, no compilation, no frontend bundling.**

## Critical Implementation Details

### Referrer Name Format
Must match EXACTLY as in Actionstep dropdown:
- ✅ "Aboud, Deane Nicole (Staff)"
- ❌ "Deane Aboud"
- ❌ "Aboud, Deane Nicole"

Use `debug-billing-page.js` to see exact dropdown options.

### Session Management
Worker handles:
- Automatic TOTP 2FA authentication
- Session timeout detection and re-login
- Browser crash recovery

### Job Processing
- One job at a time (configurable via MAX_CONCURRENT_JOBS)
- Automatic retries on failure (max 3 attempts)
- Screenshots saved to `automation-worker/screenshots/`

## Dependencies

**Netlify Function:**
- `@neondatabase/serverless` - Database connection

**Automation Worker:**
- `puppeteer` - Browser automation
- `@neondatabase/serverless` - Database connection
- `otpauth` - TOTP 2FA code generation
- `dotenv` - Environment variables

## No Authentication

The webhook endpoint is intentionally public. This is safe because:
- It only creates jobs, doesn't execute them
- Worker requires Actionstep credentials to actually set fees
- Job data is non-sensitive (IDs and percentages only)

## Monitoring

**Database queries:**
```sql
SELECT * FROM automation_jobs WHERE status = 'pending';
SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 20;
SELECT status, COUNT(*) FROM automation_jobs GROUP BY status;
```

**Worker logs:** Console output shows all actions

**Zapier history:** https://zapier.com/app/history

**Screenshots:** `automation-worker/screenshots/` for debugging
