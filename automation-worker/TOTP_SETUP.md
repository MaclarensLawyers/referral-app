# Getting Your TOTP Secret for 2FA Automation

The automation worker needs your TOTP secret to generate 2FA codes automatically. Here's how to get it.

## Option 1: Extract from Authenticator Extension (Recommended)

### Step 1: Export from Authenticator Extension

1. Open Chrome and go to the Authenticator extension
2. Click the extension icon (or go to `chrome-extension://bhghoamapcdpbohphigoooaddinpkbai/view/popup.html`)
3. Find your Actionstep account
4. Click the **pencil/edit icon** next to it
5. You should see the **secret key** (also called "secret" or "key")
6. Copy this secret - it's usually a Base32 string like `JBSWY3DPEHPK3PXP`

### Step 2: Add to .env File

In `automation-worker/.env`, add:

```env
ACTIONSTEP_TOTP_SECRET=JBSWY3DPEHPK3PXP
```

Replace with your actual secret.

## Option 2: Get Secret When Setting Up 2FA

If you're setting up 2FA for the first time or re-setting it:

1. Go to Actionstep → Settings → Security → Two-Factor Authentication
2. When shown the QR code, look for a link that says **"Can't scan?"** or **"Enter manually"**
3. Click it to reveal the secret key
4. Copy the secret (looks like `JBSWY3DPEHPK3PXP`)
5. Add to both:
   - Your Authenticator app (by entering manually)
   - Your `.env` file as `ACTIONSTEP_TOTP_SECRET`

## Option 3: Using Existing QR Code

If you only have a QR code:

1. Take a screenshot of the QR code
2. Use an online QR decoder (e.g., https://zxing.org/w/decode)
3. Upload the screenshot
4. The decoded URL will look like: `otpauth://totp/Actionstep?secret=JBSWY3DPEHPK3PXP&issuer=Actionstep`
5. Copy the part after `secret=` and before `&` (e.g., `JBSWY3DPEHPK3PXP`)
6. Add to `.env` file

## Testing Your Secret

To verify your secret works:

```javascript
// test-totp.js
const OTPAuth = require('otpauth');

const secret = 'YOUR_SECRET_HERE';
const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    digits: 6,
    period: 30,
});

console.log('Current TOTP code:', totp.generate());
```

Run:
```bash
node test-totp.js
```

Compare the generated code with what your Authenticator app shows. They should match!

## Security Notes

### Keep Your Secret Safe

- The TOTP secret is as sensitive as your password
- Never commit `.env` file to git (it's in `.gitignore`)
- Only store it locally or on secure servers
- Anyone with this secret can generate valid 2FA codes

### Backup Recommendation

Store your TOTP secret in a secure password manager (like 1Password, Bitwarden) as a backup. If you lose it, you'll need to:
1. Disable 2FA in Actionstep
2. Re-enable it with a new secret
3. Update the `.env` file

## Troubleshooting

### "Invalid 2FA code" error

**Cause:** Time sync issue or wrong secret

**Solution:**
1. Verify the secret is correct
2. Check your computer's time is accurate (TOTP depends on time)
3. Test the secret with the test script above

### "ACTIONSTEP_TOTP_SECRET not configured"

**Cause:** Environment variable not set

**Solution:**
1. Make sure `.env` file exists in `automation-worker/`
2. Add `ACTIONSTEP_TOTP_SECRET=your_secret_here`
3. Restart the worker

### "Cannot find module 'otpauth'"

**Cause:** Package not installed

**Solution:**
```bash
cd automation-worker
npm install
```

## Alternative: Use Chrome Extension (Not Recommended)

If you really want to use the Chrome extension instead of storing the secret:

### Pros:
- Don't need to store secret in `.env`
- Secret stays in Chrome extension

### Cons:
- Must run in non-headless mode
- Slower and less reliable
- Harder to deploy to DigitalOcean
- Requires Chrome profile access

If you still want this approach, let me know and I can implement it. But the TOTP library approach above is much better for automation.

## What Gets Generated

The `otpauth` library generates time-based codes:
- **6 digits** (e.g., `123456`)
- **Valid for 30 seconds**
- **Synchronized with time** (same as your Authenticator app)

It's the exact same algorithm used by Google Authenticator, Authy, and other authenticator apps.
