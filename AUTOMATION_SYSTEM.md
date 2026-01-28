# Origination Fee Automation System

Complete guide to the automated origination fee system for referred matters.

## System Overview

This system automatically sets origination fees in Actionstep when new matters are created for referred clients.

### Architecture (Simplified)

```
┌─────────────────┐
│   Actionstep    │  1. New matter created
│   (Source of    │
│     Truth)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Zapier      │  2. Detects new matter
│   (Workflow)    │  3. Checks referral list (Zapier Tables/Sheets)
│  + Referral     │  4. POSTs job to webhook API
│    Tracking     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Netlify API    │  5. Creates job in database
│   (Webhook)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Neon Database   │  6. Stores job in queue
│  (PostgreSQL)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Automation    │  7. Polls for pending jobs
│     Worker      │  8. Logs into Actionstep
│  (Puppeteer)    │  9. Sets origination fee
└─────────────────┘ 10. Logs results
```

## Components

### 1. Zapier Workflow

**Purpose:** Referral tracking and automation triggering

**Features:**
- Maintains list of referred clients (Zapier Tables or Google Sheets)
- Detects new matters in Actionstep
- Checks if client is referred
- POSTs to webhook to create automation job

**Setup Guide:** `ZAPIER_SETUP.md`

### 2. Database (Neon PostgreSQL)

**Purpose:** Store automation jobs and logs

**Key Tables:**
- `automation_jobs` - Queue of pending/completed jobs
- `automation_logs` - Detailed activity history

**Note:** Referred clients are now managed in Zapier, not in the database

**Schema:** `schema-automation.sql`

### 3. Netlify API

**Purpose:** Webhook endpoint for Zapier to create automation jobs

**Endpoint:**
- `/api/set-origination-fee` - Creates job in database

**Location:** `netlify/functions/`

### 4. Automation Worker (Puppeteer)

**Purpose:** Execute automation jobs using browser automation

**Features:**
- Polls database for pending jobs
- Logs into Actionstep
- Navigates to matter billing settings
- Sets origination fee
- Logs results

**Location:** `automation-worker/` directory

**Setup Guide:** `automation-worker/README.md`

## Quick Start Guide

### Step 1: Run Database Schema

```sql
-- In Neon SQL Editor, run:
\i schema-automation.sql
```

This creates the required tables for automation (`automation_jobs`, `automation_logs`).

### Step 2: Deploy/Update Netlify App

```bash
# Push latest code to Netlify
git add .
git commit -m "Update automation system"
git push
```

The webhook endpoint will be available:
- `/api/set-origination-fee` - Queue automation job (for Zapier)

### Step 3: Set Up Referral Tracking in Zapier

Choose one option:
- **Zapier Tables** (recommended): Create a table with referred clients
- **Google Sheets**: Create a spreadsheet with referred clients
- **Filter**: Hardcode client IDs in Zapier workflow

See `ZAPIER_SETUP.md` for detailed instructions.

### Step 4: Set Up Automation Worker

**Local (for testing):**

```bash
cd automation-worker
npm install
cp .env.example .env
# Edit .env with your credentials
nano .env

# Run the worker
npm start
```

**Production (DigitalOcean):**

See `automation-worker/README.md` for full migration guide.

### Step 5: Configure Zapier Workflow

Follow the step-by-step guide in `ZAPIER_SETUP.md` to:
1. Create trigger for new Actionstep matters
2. Check if client is referred
3. Trigger automation if yes

### Step 6: Test the System

**A. Verify Setup:**
```bash
cd automation-worker
node test-setup.js
```

This verifies:
- Environment variables are set
- Database connection works
- Tables exist
- TOTP generation works

**B. Test with Real Matter:**
```bash
node test-automation.js MATTER_ID "REFERRER_NAME" PERCENTAGE
```

Example:
```bash
node test-automation.js 202660890 "Aboud, Deane Nicole (Staff)" 10
```

This runs the complete automation for one matter and shows you exactly what happens.

**C. Test End-to-End with Zapier:**
1. Add a test client to referred list (Client ID: `TEST123`)
2. Create a new matter in Actionstep with that client
3. Watch the flow:
   - Zapier detects new matter ✓
   - Checks if client is referred ✓
   - Creates automation job ✓
   - Worker processes job ✓
   - Origination fee set in Actionstep ✓
4. Check automation monitor page for status

## Daily Operations

### Adding Referred Clients

When a staff member refers a new client:
1. Get client participant ID from Actionstep
2. Get referrer's exact name as it appears in Actionstep dropdown (e.g., "Aboud, Deane Nicole (Staff)")
3. Add to Zapier Tables or Google Sheets:
   - client_participant_id
   - client_name
   - referrer_name (exact match!)
   - percentage (default 10)
4. Done - automation will handle future matters automatically

### Monitoring Automation

Check the **Automation** page regularly:
- View job statistics (pending, completed, failed)
- Review recent activity
- Investigate failed jobs

### Handling Failed Jobs

If a job fails:
1. Check the error message in logs
2. Common issues:
   - Actionstep login failed → Check worker credentials
   - Matter not found → Verify matter ID is correct
   - UI navigation failed → May need to update `actionstep-bot.js`
3. Fix the issue
4. Job will automatically retry (up to 3 attempts)

## Maintenance

### Weekly

- Review automation logs for errors
- Check worker uptime (if on DigitalOcean)
- Verify origination fees are being set correctly

### Monthly

- Review referred client list in Zapier Tables/Sheets for accuracy
- Check database performance
- Update worker if Actionstep UI changes

### As Needed

- Add new referred clients in Zapier Tables/Sheets
- Remove old referred clients from Zapier Tables/Sheets
- Update origination percentages in Zapier Tables/Sheets

## Customizing Actionstep Automation

The Puppeteer automation in `automation-worker/actionstep-bot.js` needs to be customized for your specific Actionstep setup.

**Current Status:** The `setOriginationFee()` function is a placeholder. You need to:

1. Run worker in non-headless mode:
   ```bash
   # In automation-worker/.env
   HEADLESS=false
   ```

2. Watch the browser navigate to a matter

3. Manually click through to billing/origination fee settings

4. Inspect HTML elements (right-click → Inspect)

5. Update `setOriginationFee()` with correct selectors:
   ```javascript
   async setOriginationFee(staffId, percentage) {
       // Your specific steps, e.g.:
       await this.page.click('a#billing-tab');
       await this.page.waitForTimeout(1000);

       await this.page.click('input#origination-checkbox');
       await this.page.select('select#staff-dropdown', staffId);
       await this.page.type('input#percentage-field', percentage.toString());

       await this.page.click('button#save-button');
       await this.page.waitForNavigation();
   }
   ```

6. Test with a dummy matter

7. Take screenshots at each step for documentation

## Troubleshooting

### Jobs stuck in "pending"

**Cause:** Worker not running or can't connect to database

**Solution:**
```bash
# Check worker status
pm2 status  # on DigitalOcean
# or check local terminal

# Check logs
pm2 logs actionstep-automation
```

### Jobs failing with login error

**Cause:** Actionstep credentials incorrect or expired

**Solution:**
1. Verify credentials in `automation-worker/.env`
2. Test login manually
3. Update credentials if needed
4. Restart worker

### Origination fee not appearing in Actionstep

**Cause:** UI selectors in bot don't match actual Actionstep UI

**Solution:**
1. Run worker in non-headless mode
2. Watch what it's clicking
3. Update selectors in `actionstep-bot.js`
4. Test again

### Zapier not triggering

**Cause:** Workflow not turned on, or filter misconfigured

**Solution:**
1. Check Zapier history for errors
2. Verify filter: `is_referred` = `true`
3. Test each step individually
4. Ensure Zap is turned ON

## Security Best Practices

### Credentials

- Never commit `.env` files
- Use strong passwords for Actionstep
- Rotate credentials periodically
- Consider using a dedicated Actionstep account for automation

### Access Control

- Restrict who can add referred clients (admin only if needed)
- Monitor automation logs for suspicious activity
- Review failed jobs regularly

### Database

- Neon database is already encrypted at rest
- Use connection pooling (already configured)
- Backup database regularly (Neon handles this)

## Performance

### Expected Processing Time

- Job creation (Zapier → API): < 1 second
- Job pickup (Worker polls): 30 seconds average (configurable)
- Job execution (Puppeteer): 10-30 seconds per matter
- Total: New matter → Fee set in ~1 minute

### Scalability

- Current setup: 1 job at a time (safe, prevents conflicts)
- Can increase `MAX_CONCURRENT_JOBS` if needed
- Database can handle thousands of jobs
- Consider multiple workers for high volume

## Costs

### Current Setup (Local)

- **Netlify:** Free tier
- **Neon Database:** Free tier (sufficient)
- **Zapier:** Free tier (100 tasks/month) or Paid ($20+/month for more)
- **Worker:** $0 (running locally)

### Production Setup (DigitalOcean)

- **Netlify:** Free tier
- **Neon Database:** Free tier
- **Zapier:** Depends on usage
- **DigitalOcean Droplet:** $4-6/month
- **Total:** ~$5-10/month

## Support & Documentation

- **Setup Issues:** See `automation-worker/README.md`
- **Zapier Setup:** See `ZAPIER_SETUP.md`
- **Database Schema:** See `schema-automation.sql`
- **API Endpoints:** See `netlify/functions/` directory
- **Network Sharing:** See `NETWORK_SHARING.md`

## Future Enhancements

Potential improvements:
- Email notifications for failed jobs
- Dashboard analytics (referrals by staff, success rate, etc.)
- Webhook endpoint for Actionstep (bypass Zapier completely)
- Automated testing of Puppeteer scripts
- Multi-worker support for high volume
- Health check endpoint for monitoring worker status
