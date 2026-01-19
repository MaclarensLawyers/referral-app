# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fee referral tracking system for Maclarens law firm. Tracks matters originating from staff referrals and calculates fee splits between fee earners and referrers.

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (or: netlify dev)
```

Dev server runs on port 8888. Requires Netlify CLI: `npm install -g netlify-cli`

No test or lint commands are configured.

## Architecture

**Stack:** Vanilla JS frontend, Netlify Functions backend, Neon PostgreSQL database

```
public/                     # Static frontend (HTML/CSS/JS)
├── index.html              # Main dashboard
├── add-client.html         # Client registration (embeds Zapier form)
├── settings.html           # Settings & Actionstep OAuth
├── js/app.js               # Dashboard logic
└── css/styles.css          # Styling

netlify/functions/          # Serverless API endpoints
├── lib/
│   ├── actionstep.js       # Actionstep API client & OAuth token management
│   └── db.js               # Neon database connection
├── auth-callback.js        # OAuth callback handler
├── fetch-fees.js           # Fee calculation from Actionstep time entries
├── get-matters.js          # List referred matters
├── settings.js             # Settings CRUD
└── webhook.js              # Zapier webhook receiver
```

**API Routes:** All `/api/*` requests route to `/.netlify/functions/:splat` via netlify.toml

## Data Flow

1. Staff submits referred client via Zapier Interface form → Zapier Tables
2. New matter in Actionstep → Zapier workflow checks Tables → POSTs to `/api/webhook`
3. App stores matter in database
4. On demand: `/api/fetch-fees` calls Actionstep API → calculates splits → caches results

## Key Patterns

**OAuth Tokens:** Stored in `settings` table, auto-refreshed with 5-minute buffer before expiry. Check `actionstep.js:getAccessToken()` for token management.

**Fee Calculation:** Time entries aggregated by fee earner, referrer gets configurable percentage (default 10%), remaining split proportionally among fee earners.

**Database:** Uses Neon serverless driver with connection pooling. Parameterized queries via template literals. UPSERT pattern for idempotent operations.

## Environment Variables

```
DATABASE_URL              # Neon PostgreSQL connection string
ACTIONSTEP_CLIENT_ID      # OAuth client ID
ACTIONSTEP_CLIENT_SECRET  # OAuth client secret
ACTIONSTEP_API_URL        # e.g., https://api.actionstepstaging.com/api/rest
ACTIONSTEP_AUTH_DOMAIN    # e.g., go.actionstepstaging.com (default: go.actionstep.com)
APP_URL                   # Netlify app URL for OAuth callback
```

## Database Tables

- `settings` - Key-value store (OAuth tokens, referral_percentage)
- `referred_matters` - Tracked matters (matter_id, matter_name, referrer_name)
- `fee_snapshots` - Cached fee calculations (JSONB fee_data)

Schema in `schema.sql` - run manually in Neon SQL editor (no migration framework).
