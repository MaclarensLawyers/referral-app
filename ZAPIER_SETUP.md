# Zapier Workflow Setup (Simplified)

This guide explains how to set up the Zapier workflow that triggers origination fee automation when new matters are created in Actionstep.

## Overview

**Simplified Architecture:**
- Zapier maintains the list of referred clients (Zapier Tables or Google Sheets)
- When a new matter is created in Actionstep, Zapier checks the referral list
- If client is referred, Zapier POSTs directly to your webhook to create automation job
- Automation worker processes the job and sets the origination fee

## Prerequisites

- Zapier account with Actionstep integration
- Automation worker running (local or DigitalOcean)
- Database tables created (`automation_jobs`, `automation_logs`)

## Step 1: Create Referral Tracking

Choose one option:

### Option A: Zapier Tables (Recommended)

1. In Zapier, go to **Tables** → **Create Table**
2. Name it: **Referred Clients**
3. Create columns:
   - `client_participant_id` (Text, Primary Key)
   - `client_name` (Text)
   - `referrer_name` (Text) - Must match Actionstep dropdown exactly!
   - `percentage` (Number) - Default 10

4. Add your referred clients to the table

**Example:**
| client_participant_id | client_name | referrer_name | percentage |
|-----------------------|-------------|---------------|------------|
| 12345 | John Smith | Aboud, Deane Nicole (Staff) | 10 |
| 67890 | Jane Doe | Smith, John (Staff) | 15 |

### Option B: Google Sheets

1. Create a Google Sheet with columns:
   - Column A: `client_participant_id`
   - Column B: `client_name`
   - Column C: `referrer_name` (Must match Actionstep dropdown exactly!)
   - Column D: `percentage`

2. Add your referred clients as rows

### Option C: Simple Filter (Manual)

Use Zapier's Filter step to check if client ID matches a hardcoded list. Update manually when adding new clients.

## Step 2: Create Zapier Workflow

### 2.1 Trigger: New Matter in Actionstep

1. Create a new Zap
2. **Trigger**: Actionstep → New Action
3. Connect your Actionstep account
4. Configure to detect new matters
5. **Test**: Get sample data with a recent matter

**Important fields to note:**
- Matter ID (action_id)
- Client Participant ID

### 2.2 Action: Lookup Referral

**If using Zapier Tables:**
1. Add step: **Zapier Tables → Find Record**
2. Select your "Referred Clients" table
3. Search field: `client_participant_id`
4. Search value: Map Client Participant ID from Step 2.1
5. **Important**: Enable "Create Zapier Tables record if it doesn't exist yet?" → **NO**
6. Test: Should find the record if client is referred

**If using Google Sheets:**
1. Add step: **Google Sheets → Lookup Spreadsheet Row**
2. Select your spreadsheet and worksheet
3. Lookup column: `client_participant_id`
4. Lookup value: Map Client Participant ID from Step 2.1
5. Test: Should find the row if client is referred

**If using Filter:**
1. Add step: **Filter by Zapier**
2. Only continue if:
   - Client Participant ID from Step 2.1
   - (Text) Is in: `12345,67890,11111` (comma-separated list)

### 2.3 Filter: Only Continue if Found

**If using Tables/Sheets:**
1. Add step: **Filter by Zapier**
2. Only continue if:
   - Choose the `id` or `client_participant_id` field from Step 2.2
   - (Text) Exists

**If using Filter option:**
Skip this step (already filtered in 2.2)

### 2.4 Action: Create Automation Job

1. Add step: **Webhooks by Zapier**
2. Event: **POST**
3. Configure:
   - **URL**: `https://your-app.netlify.app/api/set-origination-fee`
   - **Payload Type**: json
   - **Data**:
     ```
     matter_id: [Map from Step 2.1 - Actionstep Matter ID]
     client_participant_id: [Map from Step 2.1]
     referrer_name: [Map from Step 2.2 - Referrer Name field]
     percentage: [Map from Step 2.2 - Percentage field, OR hardcode 10]
     ```
   - **Headers**: Leave empty

4. **Test**: Should return:
   ```json
   {
     "success": true,
     "job_id": 123,
     "message": "Automation job queued successfully"
   }
   ```

### 2.5 Optional: Notification

Add a notification step (email/Slack) to alert you when automation is triggered. Helpful for monitoring.

### 2.6 Turn On Zap

Click **Publish** to activate!

## Step 3: Test End-to-End

1. **Add test client** to your Zapier Table/Google Sheet:
   - client_participant_id: `TEST123`
   - client_name: `Test Client`
   - referrer_name: `Aboud, Deane Nicole (Staff)` (exact match!)
   - percentage: `10`

2. **Start automation worker**:
   ```bash
   cd automation-worker
   npm start
   ```

3. **Create test matter** in Actionstep with client ID `TEST123`

4. **Watch the flow**:
   - Check Zapier History → should show successful run
   - Check worker logs → should process the job
   - Check Actionstep → origination fee should be set

5. **Verify in database**:
   ```sql
   SELECT * FROM automation_jobs ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 5;
   ```

## Field Mapping Reference

| Zapier Field | Description | Source |
|--------------|-------------|--------|
| `matter_id` | Actionstep matter/action ID | Step 2.1 (Trigger) |
| `client_participant_id` | Client's participant ID | Step 2.1 (Trigger) |
| `referrer_name` | Staff name as in Actionstep dropdown | Step 2.2 (Lookup) |
| `percentage` | Origination fee percentage | Step 2.2 (Lookup) |

## Important Notes

### Referrer Name Format

The `referrer_name` MUST match EXACTLY as it appears in Actionstep's origination fee dropdown:
- ✅ `Aboud, Deane Nicole (Staff)`
- ❌ `Deane Aboud`
- ❌ `Aboud, Deane Nicole`

To find the exact format:
1. Run the automation worker with `HEADLESS=false`
2. Use `debug-billing-page.js` to see the dropdown options
3. Copy the exact text including "(Staff)" suffix

### Webhook URL

Replace `https://your-app.netlify.app` with your actual Netlify URL:
- Production: `https://your-site-name.netlify.app`
- Or use ngrok for local testing: `https://abc123.ngrok.io`

## Troubleshooting

### Zap runs but no job created

**Check webhook response in Zapier history:**
- If error about missing fields → check field mapping in Step 2.4
- If 500 error → check your DATABASE_URL is set in Netlify

**Test webhook manually:**
```bash
curl -X POST https://your-app.netlify.app/api/set-origination-fee \
  -H "Content-Type: application/json" \
  -d '{
    "matter_id": "12345",
    "client_participant_id": "67890",
    "referrer_name": "Aboud, Deane Nicole (Staff)",
    "percentage": 10
  }'
```

### Job created but not processing

**Check automation worker:**
```bash
# Is it running?
ps aux | grep node

# Check logs
cd automation-worker
npm start
```

**Check database:**
```sql
SELECT * FROM automation_jobs WHERE status = 'pending';
```

### Origination fee not set in Actionstep

**Check worker logs for errors:**
- Login failed → check ACTIONSTEP_USERNAME/PASSWORD in .env
- 2FA failed → check ACTIONSTEP_TOTP_SECRET in .env
- Staff member not found → referrer_name doesn't match dropdown exactly
- Save button not found → may need to update actionstep-bot.js selectors

**Check screenshots:**
```bash
cd automation-worker/screenshots
ls -lt | head -10
```

### Filter not working

**For Tables/Sheets lookup:**
- Ensure the search field matches exactly (case-sensitive)
- Test the lookup step independently
- Check "Continue even if..." is set correctly

**For Filter by Zapier:**
- Ensure field exists before filtering
- Use "Exists" condition, not "Is not empty"

## Managing Referred Clients

### Add New Referred Client

**Zapier Tables:**
1. Go to Zapier Tables → Referred Clients
2. Click **Add Record**
3. Fill in all fields
4. Save

**Google Sheets:**
1. Open your spreadsheet
2. Add a new row with all columns filled
3. Save (auto-saves)

### Remove Referred Client

Simply delete the row/record. Future matters will not trigger automation.

### Update Referrer or Percentage

Edit the record in Zapier Tables or Google Sheets. Changes apply to future matters only.

## Monitoring

### Zapier History
Check Zap runs, successes, and failures: https://zapier.com/app/history

### Database Logs
```sql
-- Recent automation activity
SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 20;

-- Job statistics
SELECT status, COUNT(*) FROM automation_jobs GROUP BY status;

-- Failed jobs
SELECT * FROM automation_jobs WHERE status = 'failed';
```

### Worker Logs
The automation worker logs all actions to console. Monitor for errors.

## Security

The webhook endpoint (`/api/set-origination-fee`) is intentionally public for Zapier to call. This is safe because:
- It only creates jobs (doesn't execute immediately)
- The worker requires Actionstep credentials to actually set fees
- Job data is non-sensitive (just IDs and percentages)

### Optional: Add Webhook Secret

For extra security, add authentication:

1. In Netlify environment variables:
   ```
   ZAPIER_WEBHOOK_SECRET=your_random_secret_here
   ```

2. Update `set-origination-fee.js`:
   ```javascript
   const secret = event.headers['x-zapier-secret'];
   if (secret !== process.env.ZAPIER_WEBHOOK_SECRET) {
       return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
   }
   ```

3. In Zapier webhook step, add header:
   - Key: `X-Zapier-Secret`
   - Value: `your_random_secret_here`

## Next Steps

1. ✅ Set up Zapier workflow
2. ✅ Add referred clients to Zapier Tables/Sheets
3. ✅ Test with a sample matter
4. ✅ Deploy automation worker to DigitalOcean (see automation-worker/README.md)
5. ✅ Monitor for a few days
6. ✅ Add more referred clients as needed
