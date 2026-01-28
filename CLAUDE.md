# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fee referral tracking system for Maclarens law firm. Tracks matters originating from staff referrals and calculates fee splits between fee earners and referrers.

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server (recommended)
npm run dev:netlify      # Start Netlify dev server (alternative)
```

**Local dev server** (recommended):
- Runs on port 8888 (configurable via PORT env var)
- Uses custom Express server (`server.js`)
- Faster and simpler than Netlify CLI
- Loads env vars from `.env` file
- See `LOCAL_DEV.md` for setup instructions

**Netlify dev server** (alternative):
- Requires Netlify CLI: `npm install -g netlify-cli`
- More authentic to production environment
- Slower to start, may have dependency issues

No test or lint commands are configured.

## Architecture

**Stack:** Vanilla JS frontend, Netlify Functions backend, Neon PostgreSQL database, Auth0 authentication

```
public/                     # Static frontend (HTML/CSS/JS)
├── index.html              # Main dashboard (protected)
├── add-client.html         # Client registration (protected)
├── settings.html           # Settings & admin features (protected, admin-only for some features)
├── login.html              # Login page with Auth0
├── callback.html           # Auth0 callback handler
├── js/
│   ├── app.js              # Dashboard logic
│   └── auth.js             # Frontend auth utilities (Auth0 SPA SDK)
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

**User Authentication:** Auth0 with invite-only registration. Admin role required for settings changes and inviting users. JWT tokens verified via `lib/auth.js` middleware using JWKS. Frontend uses Auth0 SPA SDK via `auth.js` for token management and `auth.getAuthHeaders()` for API calls.

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

# Auth0 Configuration
AUTH0_DOMAIN              # Auth0 tenant domain (e.g., your-tenant.auth0.com)
AUTH0_AUDIENCE            # Auth0 API identifier/audience
AUTH0_MGMT_CLIENT_ID      # Auth0 Management API client ID (for user invitations)
AUTH0_MGMT_CLIENT_SECRET  # Auth0 Management API client secret
AUTH0_CONNECTION          # Auth0 database connection name (default: Username-Password-Authentication)
```

Frontend Auth0 configuration is set via `window.auth0Config` in HTML files. Replace placeholder values (`__AUTH0_DOMAIN__`, `__AUTH0_CLIENT_ID__`, `__AUTH0_AUDIENCE__`) with actual values during build or deployment.

## Auth0 Setup Requirements

**IMPORTANT:** For user management to work, you must create an `admin` role in Auth0:

1. Go to Auth0 Dashboard → User Management → Roles
2. Create a new role named `admin` (exact name, lowercase)
3. Add this role to your initial admin user(s)
4. The role is used to control access to settings and user management features

## Database Tables

- `settings` - Key-value store (OAuth tokens, referral_percentage)
- `referred_matters` - Tracked matters (matter_id, matter_name, referrer_name)
- `fee_snapshots` - Cached fee calculations (JSONB fee_data)

Schema in `schema.sql` - run manually in Neon SQL editor (no migration framework).
