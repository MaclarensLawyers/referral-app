# Actionstep Origination Fee Automation

Automated system for setting origination fees in Actionstep when new matters are created for referred clients.

## System Overview

**Simple Architecture:**
- **Zapier** maintains referred client list and triggers automation
- **Netlify Function** receives webhook and creates job in database
- **Automation Worker** processes jobs and sets fees in Actionstep

## Quick Start

### 1. Database Setup

Run the schema in your Neon database:
```sql
-- In Neon SQL Editor, paste contents of schema-automation.sql
```

### 2. Zapier Setup

See [ZAPIER_SETUP.md](ZAPIER_SETUP.md) for detailed instructions:
1. Create Zapier Table or Google Sheet with referred clients
2. Set up workflow: Actionstep trigger → Lookup → POST webhook
3. Test with sample matter

### 3. Automation Worker Setup

See [automation-worker/README.md](automation-worker/README.md) for detailed instructions:
```bash
cd automation-worker
npm install
cp .env.example .env
# Edit .env with credentials
npm start
```

## Components

### Netlify Function
- `/api/set-origination-fee` - Webhook endpoint for Zapier

### Neon Database
- `automation_jobs` - Job queue
- `automation_logs` - Activity history

### Automation Worker
- Puppeteer-based bot that processes jobs
- Automatic 2FA authentication
- Session timeout handling
- Browser crash recovery

## Documentation

- [AUTOMATION_SYSTEM.md](AUTOMATION_SYSTEM.md) - Complete system documentation
- [ZAPIER_SETUP.md](ZAPIER_SETUP.md) - Zapier workflow setup guide
- [automation-worker/README.md](automation-worker/README.md) - Worker setup and deployment
- [automation-worker/QUICK_START.md](automation-worker/QUICK_START.md) - Quick reference guide

## Environment Variables

### Netlify (for webhook endpoint)
```
DATABASE_URL=your_neon_connection_string
```

### Automation Worker
```
DATABASE_URL=your_neon_connection_string
ACTIONSTEP_USERNAME=your_email@example.com
ACTIONSTEP_PASSWORD=your_password
ACTIONSTEP_TOTP_SECRET=your_totp_secret
ACTIONSTEP_URL=https://go.actionstep.com
POLL_INTERVAL=30
HEADLESS=true
```

## Deployment

### Netlify Function
Automatically deployed when you push to GitHub (already configured).

### Automation Worker
Deploy to DigitalOcean for 24/7 operation - see [automation-worker/README.md](automation-worker/README.md#migration-to-digitalocean).

## Monitoring

### Check job status in database
```sql
SELECT * FROM automation_jobs ORDER BY created_at DESC LIMIT 10;
SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 20;
```

### Check worker logs
The automation worker outputs detailed logs to console.

### Check Zapier history
https://zapier.com/app/history

## Support

For issues or questions:
1. Check the documentation files listed above
2. Review worker screenshots in `automation-worker/screenshots/`
3. Check database logs for error messages
