# Actionstep Automation Worker

This worker automates the process of setting origination fees in Actionstep for referred matters.

## How It Works

1. **Zapier** creates new matters in Actionstep and triggers the webhook
2. **Netlify Function** (`/api/set-origination-fee`) creates an automation job in the database
3. **This Worker** polls the database for pending jobs
4. **Puppeteer** logs into Actionstep and sets the origination fee
5. **Results** are logged to the database for monitoring

## Setup (Local Development)

### 1. Install Dependencies

```bash
cd automation-worker
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=your_neon_connection_string
ACTIONSTEP_USERNAME=your_actionstep_email@example.com
ACTIONSTEP_PASSWORD=your_actionstep_password
ACTIONSTEP_TOTP_SECRET=your_totp_secret_here
ACTIONSTEP_URL=https://go.actionstepstaging.com
POLL_INTERVAL=30
HEADLESS=false
MAX_CONCURRENT_JOBS=1
```

**Important:**
- Set `HEADLESS=false` during development so you can see the browser
- Use staging URL for testing: `https://go.actionstepstaging.com`
- `POLL_INTERVAL` is in seconds (30 = check every 30 seconds)
- **If Actionstep uses 2FA, you MUST set `ACTIONSTEP_TOTP_SECRET`** (see below)

### 3. Set Up 2FA (If Required)

If Actionstep requires 2FA authentication:

1. **Get your TOTP secret** - See `TOTP_SETUP.md` for detailed instructions
   - Export from your Authenticator extension, OR
   - Get it when setting up 2FA, OR
   - Decode from QR code

2. **Add to `.env` file:**
   ```env
   ACTIONSTEP_TOTP_SECRET=JBSWY3DPEHPK3PXP
   ```

3. **Test it works:**
   ```bash
   node test-totp.js
   ```

   This will generate a code - compare it with your Authenticator app to verify.

**📖 Full 2FA setup guide:** See `TOTP_SETUP.md`

### 4. Verify Setup

Before running the worker, verify everything is configured correctly:

```bash
node test-setup.js
```

This checks:
- ✅ All environment variables are set
- ✅ Database connection works
- ✅ Required tables exist
- ✅ TOTP code generation works

Fix any issues before proceeding.

### 5. Test End-to-End (Optional but Recommended)

Test the complete automation with a real matter:

```bash
node test-automation.js MATTER_ID "REFERRER_NAME" PERCENTAGE
```

**Example:**
```bash
node test-automation.js 202660890 "Aboud, Deane Nicole (Staff)" 10
```

This will:
1. Create a test job in the database
2. Log in to Actionstep
3. Navigate to the matter's billing page
4. Set the origination fee
5. Save screenshots at each step
6. Keep browser open for 10 seconds to verify
7. Update job status

**Important:** The referrer name must match EXACTLY as it appears in Actionstep's dropdown.

### 6. Run the Worker

Once testing is successful, start the worker:

```bash
npm start
```

You should see:
```
╭────────────────────────────────────────────╮
│                                            │
│   Actionstep Automation Worker             │
│   Origination Fee Automation               │
│                                            │
╰────────────────────────────────────────────╯

[Bot] Launching browser...
[Bot] Logging in to Actionstep...
[Bot] Successfully logged in
[Processor] Worker started successfully
```

The worker will:
- Keep the browser open (if `HEADLESS=false`)
- Poll the database every 30 seconds for new jobs
- Process jobs one at a time
- Save screenshots to `screenshots/` folder for debugging

### 4. Test with a Sample Job

Create a test job in your database:

```sql
INSERT INTO automation_jobs (
    matter_id,
    client_participant_id,
    referrer_staff_id,
    origination_percentage,
    status
) VALUES (
    'TEST_MATTER_123',
    'TEST_CLIENT_456',
    'STAFF_789',
    10.00,
    'pending'
);
```

Watch the worker logs to see it process the job.

## Mapping Actionstep UI

The automation logic in `actionstep-bot.js` needs to be customized to match your actual Actionstep UI. You'll need to:

1. **Set `HEADLESS=false`** so you can see the browser
2. **Manually navigate** to a matter and billing options
3. **Inspect the HTML** to find the correct selectors
4. **Update `setOriginationFee()`** with the correct steps

### Finding Selectors

In the browser opened by Puppeteer:
1. Right-click on elements → Inspect
2. Note the element's ID, name, or class
3. Update `actionstep-bot.js` with correct selectors

Example flow to implement in `setOriginationFee()`:
```javascript
// 1. Click billing tab
await this.page.click('a[href*="billing"]');
await this.page.waitForTimeout(1000);

// 2. Enable origination fee checkbox
await this.page.click('input#origination-enabled');

// 3. Select staff member
await this.page.select('select#originator-staff', staffId);

// 4. Enter percentage
await this.page.type('input#origination-percentage', percentage.toString());

// 5. Save
await this.page.click('button#save-billing');
await this.page.waitForNavigation();
```

## Debugging

### View Screenshots

All actions save screenshots to `screenshots/`:
- `matter-{id}-before.png` - Before setting origination fee
- `matter-{id}-after.png` - After setting origination fee

### Check Logs

The worker logs all actions:
```
[Bot] Navigating to matter 12345...
[Bot] Loaded matter 12345
[Bot] Setting origination fee: 10% to staff 789...
[Processor] Job 1 completed successfully
```

### Database Logs

Check `automation_logs` table:
```sql
SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 10;
```

## Migration to DigitalOcean

When ready for production, the same code runs on DigitalOcean:

### 1. Create Droplet

- Go to DigitalOcean → Create → Droplets
- Choose: Ubuntu 22.04 LTS
- Basic plan: $6/month (1GB RAM)
- Choose datacenter region closest to you

### 2. Initial Setup

SSH into droplet:
```bash
ssh root@your_droplet_ip
```

Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

Install Chromium (for Puppeteer):
```bash
apt-get install -y chromium-browser chromium-codecs-ffmpeg
```

Clone your repo:
```bash
git clone https://github.com/your-username/referral-app.git
cd referral-app/automation-worker
```

### 3. Configure

Create `.env` file:
```bash
nano .env
```

Paste your production credentials.

Install dependencies:
```bash
npm install
```

### 4. Run with PM2

Install PM2:
```bash
npm install -g pm2
```

Start worker:
```bash
pm2 start index.js --name actionstep-automation
```

Configure auto-start on reboot:
```bash
pm2 startup
pm2 save
```

### 5. Monitor

Check status:
```bash
pm2 status
pm2 logs actionstep-automation
```

Restart:
```bash
pm2 restart actionstep-automation
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Neon PostgreSQL connection string |
| `ACTIONSTEP_USERNAME` | Yes | - | Actionstep login email |
| `ACTIONSTEP_PASSWORD` | Yes | - | Actionstep password |
| `ACTIONSTEP_URL` | No | `https://go.actionstepstaging.com` | Actionstep base URL |
| `POLL_INTERVAL` | No | `30` | Seconds between job checks |
| `HEADLESS` | No | `true` | Run browser in headless mode |
| `MAX_CONCURRENT_JOBS` | No | `1` | Max jobs to process at once |

## Troubleshooting

### Browser won't launch
- Install Chromium dependencies: `apt-get install -y chromium-browser`
- Try non-headless mode: `HEADLESS=false npm start`

### Login fails
- Check credentials in `.env`
- Check if Actionstep URL is correct
- Run non-headless to see what's happening

### Jobs stuck in "processing"
- Worker might have crashed - check logs
- Restart worker: `pm2 restart actionstep-automation`
- Check database for jobs with `status='processing'`

### Screenshots not saving
- Check `screenshots/` directory exists
- Check write permissions
- Create manually: `mkdir screenshots`

## Security Notes

- **Never commit `.env` file** - it contains credentials
- Use strong Actionstep password
- Consider using a dedicated Actionstep account for automation
- Regularly rotate passwords
- Monitor `automation_logs` for suspicious activity
