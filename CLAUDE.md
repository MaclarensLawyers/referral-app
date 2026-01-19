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

**Stack:** Vanilla JS frontend, Netlify Functions backend, Neon PostgreSQL database, Netlify Identity auth

```
public/                     # Static frontend (HTML/CSS/JS)
├── index.html              # Main dashboard (protected)
├── add-client.html         # Client registration (protected)
├── settings.html           # Settings & admin features (protected, admin-only for some features)
├── login.html              # Login page with Netlify Identity widget
├── js/
│   ├── app.js              # Dashboard logic
│   └── auth.js             # Frontend auth utilities
└── css/styles.css          # Styling

netlify/functions/          # Serverless API endpoints
├── lib/
│   ├── actionstep.js       # Actionstep API client & OAuth token management
│   ├── auth.js             # JWT verification middleware
│   └── db.js               # Neon database connection
├── auth-callback.js        # Actionstep OAuth callback handler
├── fetch-fees.js           # Fee calculation (requires auth)
├── get-matters.js          # List referred matters (requires auth)
├── invite-user.js          # Invite new users (requires admin)
├── settings.js             # Settings CRUD (GET: auth, POST: admin)
└── webhook.js              # Zapier webhook receiver (public)
```

**API Routes:** All `/api/*` requests route to `/.netlify/functions/:splat` via netlify.toml

## Data Flow

1. Staff submits referred client via Zapier Interface form → Zapier Tables
2. New matter in Actionstep → Zapier workflow checks Tables → POSTs to `/api/webhook`
3. App stores matter in database
4. On demand: `/api/fetch-fees` calls Actionstep API → calculates splits → caches results

## Key Patterns

**User Authentication:** Netlify Identity with invite-only registration. Admin role required for settings changes and inviting users. JWT tokens verified via `lib/auth.js` middleware. Frontend uses `auth.js` for token management and `auth.getAuthHeaders()` for API calls.

**Actionstep OAuth:** Tokens stored in `settings` table, auto-refreshed with 5-minute buffer before expiry. Check `actionstep.js:getAccessToken()` for token management.

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
