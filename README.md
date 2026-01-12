# Referral Tracking App

A fee referral tracking system for Maclarens law firm. Tracks matters originating from staff referrals and calculates fee splits between fee earners and referrers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  INTAKE                                                         │
│  Staff adds referred client via Zapier Interface form           │
│  (embedded in app) → saved to Zapier Tables                     │
│  [Client Participant ID | Client Name | Referrer Name]          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  MATTER CREATION                                                │
│  New matter trigger fires in Zapier →                           │
│  Checks Zapier Tables for client →                              │
│  If match: POST to /api/webhook with matter ID + referrer       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  THIS APP (Netlify + Neon)                                      │
│  Stores matter → Fetches fees from Actionstep on demand →       │
│  Calculates split → Displays for accounts team                  │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Neon Database

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Copy the connection string (format: `postgresql://user:pass@host/db`)
3. Run `schema.sql` in the Neon SQL editor to create tables

### 2. Actionstep API Application

1. In Actionstep Admin, go to API → Applications
2. Create a new application:
   - Name: "Referral Tracker"
   - Redirect URI: `https://your-netlify-app.netlify.app/api/auth-callback`
3. Note the Client ID and Client Secret

### 3. Netlify Deployment

1. Push this repo to GitHub
2. Connect to Netlify
3. Set environment variables:
   - `DATABASE_URL` - Neon connection string
   - `ACTIONSTEP_CLIENT_ID` - From step 2
   - `ACTIONSTEP_CLIENT_SECRET` - From step 2
   - `ACTIONSTEP_API_URL` - e.g., `https://ap-southeast-2.actionstep.com/api/rest`
   - `APP_URL` - Your Netlify app URL (e.g., `https://maclarens-referrals.netlify.app`)

4. Deploy

### 4. Zapier Setup

#### Zapier Table

Create a table with columns:
- `client_participant_id` (Text)
- `client_name` (Text)
- `referrer_name` (Text)
- `date_added` (Date)

#### Zapier Interface Form

1. Create a new Interface at interfaces.zapier.com
2. Add a Form with fields matching the table
3. Connect form submissions to add records to your table
4. Copy the embed URL and update `add-client.html`

#### Zapier Workflow

```
Trigger: New Matter (Actionstep)
    ↓
Action: Find Record (Zapier Tables)
    - Table: Your referred clients table
    - Search field: client_participant_id
    - Search value: {{Primary Participants ID}}
    ↓
Filter: Only continue if record found
    ↓
Action: POST (Webhooks by Zapier)
    - URL: https://your-app.netlify.app/api/webhook
    - Payload Type: JSON
    - Data:
        matter_id: {{Action ID}}
        matter_name: {{Action Name}}
        referrer_name: {{referrer_name from lookup}}
```

### 5. Connect Actionstep

1. Go to Settings in the app
2. Click "Connect to Actionstep"
3. Authorize the connection

## Usage

### For Intake Staff

1. When registering a referred client, go to "Add Client"
2. Fill in:
   - Client Participant ID (from Actionstep URL)
   - Client Name
   - Referrer Name
3. Submit the form

### For Accounts

1. Go to the main "Matters" page
2. View referred matters for current month (or all time)
3. Click "Fetch All Fees" to pull data from Actionstep
4. View the fee allocation breakdown:
   - Original fee earner amounts (adjusted for referral)
   - Referrer allocation
5. Use this information when allocating fees

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook` | POST | Receive new referred matters from Zapier |
| `/api/get-matters` | GET | List referred matters (query: `period=current_month\|all`) |
| `/api/fetch-fees` | POST | Fetch fee data from Actionstep for specified matters |
| `/api/settings` | GET/POST | View or update app settings |
| `/api/auth-callback` | GET | Handle Actionstep OAuth flow |

## Local Development

```bash
npm install
netlify dev
```

Requires Netlify CLI: `npm install -g netlify-cli`

You'll need to set environment variables locally via `.env` or `netlify env:set`.
