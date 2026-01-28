# Quick Start Guide

## First Time Setup

### 1. Install Dependencies
```bash
cd automation-worker
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env  # or edit with your text editor
```

Required settings:
```env
DATABASE_URL=your_neon_connection_string
ACTIONSTEP_USERNAME=your_email@example.com
ACTIONSTEP_PASSWORD=your_password
ACTIONSTEP_TOTP_SECRET=your_totp_secret_from_authenticator
```

See `TOTP_SETUP.md` for how to get your TOTP secret.

### 3. Verify Setup
```bash
node test-setup.js
```

Fix any errors before proceeding.

## Testing

### Quick Test (Single Matter)
```bash
node test-automation.js MATTER_ID "REFERRER_NAME" PERCENTAGE
```

Example:
```bash
node test-automation.js 202660890 "Aboud, Deane Nicole (Staff)" 10
```

**Important:** Referrer name must match EXACTLY as shown in Actionstep dropdown.

### Test TOTP Only
```bash
node test-totp.js
```

Generates a code - compare with your Authenticator app.

### Debug Login
```bash
node debug-login.js
```

Opens browser and stops at 2FA page for manual inspection.

### Debug Billing Page
```bash
node debug-billing-page.js MATTER_ID
```

Opens matter's billing page and analyzes form fields.

## Running the Worker

### Development (with browser visible)
```env
# In .env file
HEADLESS=false
```

```bash
npm start
```

### Production (headless)
```env
# In .env file
HEADLESS=true
```

```bash
npm start
```

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm start` | Start the worker |
| `node test-setup.js` | Verify configuration |
| `node test-totp.js` | Test 2FA code generation |
| `node test-automation.js ...` | Test complete workflow |
| `node debug-login.js` | Debug login process |
| `node debug-billing-page.js ...` | Debug billing page |

## Screenshots

All actions save screenshots to `screenshots/` folder:

| Screenshot | When Created |
|------------|--------------|
| `after-initial-login.png` | After password login |
| `2fa-code-entered.png` | After entering 2FA code |
| `after-full-login.png` | After complete login |
| `matter-{id}-billing-page.png` | Matter billing page loaded |
| `origination-enabled.png` | After enabling checkbox |
| `origination-filled.png` | All fields filled in |
| `origination-saved.png` | After clicking Save |

Use these for debugging if something fails.

## Checking Logs

The worker outputs detailed logs:

```
[Bot] Logging in to Actionstep...
[Bot] Current URL after initial login: https://...
[Bot] Detected MFA page by URL
[Bot] Found 2FA input with selector: input[name="mfa_code"]
[Bot] Generated TOTP code: 123456
[Bot] Successfully logged in
[Processor] Processing job 1 for matter 202660890...
[Bot] Navigating to billing settings for matter 202660890...
[Bot] Setting origination fee: 10% to Aboud, Deane Nicole (Staff)...
[Bot] Origination fee set successfully
```

## Troubleshooting

### "Login failed"
- Check username/password in `.env`
- Run `node debug-login.js` to see what's happening

### "2FA required but ACTIONSTEP_TOTP_SECRET not configured"
- Add your TOTP secret to `.env`
- See `TOTP_SETUP.md` for instructions
- Test with `node test-totp.js`

### "Staff member not found in dropdown"
- Referrer name doesn't match exactly
- Run `node debug-billing-page.js MATTER_ID` to see available names
- Update database with exact name format

### "Save button not found"
- Run `node debug-billing-page.js MATTER_ID`
- Check screenshots to see page layout
- May need to update selectors in `actionstep-bot.js`

### "Navigation timeout"
- Page is loading slowly
- Increase timeout in code
- Check internet connection

## Database Queries

Useful SQL queries:

### Check pending jobs
```sql
SELECT * FROM automation_jobs WHERE status = 'pending';
```

### View recent logs
```sql
SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 10;
```

### Job statistics
```sql
SELECT status, COUNT(*) FROM automation_jobs GROUP BY status;
```

### Failed jobs
```sql
SELECT * FROM automation_jobs WHERE status = 'failed' ORDER BY created_at DESC;
```

## Next Steps

After testing locally:

1. ✅ Verify automation works correctly
2. ✅ Set up Zapier workflow (see `ZAPIER_SETUP.md`)
3. ✅ Add referred clients to Zapier Tables or Google Sheets
4. ✅ Deploy to DigitalOcean for 24/7 operation (see `README.md`)

## Support

- **Setup Issues:** See `README.md`
- **TOTP Setup:** See `TOTP_SETUP.md`
- **Zapier Setup:** See `ZAPIER_SETUP.md`
- **System Overview:** See `AUTOMATION_SYSTEM.md`
