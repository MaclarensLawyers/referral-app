/**
 * Actionstep Automation Bot
 * Uses Puppeteer to log into Actionstep and set origination fees
 */

const puppeteer = require('puppeteer');
const OTPAuth = require('otpauth');

class ActionstepBot {
    constructor(config) {
        this.username = config.username;
        this.password = config.password;
        this.totpSecret = config.totpSecret; // Optional TOTP secret for 2FA
        this.baseUrl = config.baseUrl || 'https://go.actionstepstaging.com';
        this.headless = config.headless !== false;
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    /**
     * Sleep helper (replacement for deprecated waitForTimeout)
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Initialize browser and login to Actionstep
     */
    async init() {
        console.log('[Bot] Launching browser...');
        this.browser = await puppeteer.launch({
            headless: this.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });

        // Set a reasonable timeout
        this.page.setDefaultTimeout(30000);

        console.log('[Bot] Browser launched');
        await this.login();
    }

    /**
     * Login to Actionstep
     */
    async login() {
        console.log('[Bot] Logging in to Actionstep...');

        try {
            await this.page.goto(this.baseUrl, { waitUntil: 'networkidle2' });

            // Wait for login form
            await this.page.waitForSelector('input[type="email"], input[name="username"], input#username', {
                timeout: 10000
            });

            // Fill in credentials (adjust selectors based on actual login page)
            const emailInput = await this.page.$('input[type="email"], input[name="username"], input#username');
            const passwordInput = await this.page.$('input[type="password"], input[name="password"], input#password');

            if (!emailInput || !passwordInput) {
                throw new Error('Could not find login form inputs');
            }

            console.log('[Bot] Entering username and password...');
            await emailInput.type(this.username);
            await passwordInput.type(this.password);

            // Submit form
            console.log('[Bot] Submitting login form...');
            await Promise.all([
                this.page.click('button[type="submit"], input[type="submit"]'),
                this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            ]);

            // Check if 2FA is required by URL
            const currentUrl = this.page.url();
            console.log('[Bot] Current URL after initial login:', currentUrl);

            // Wait for MFA page if redirected
            const isMfaPage = currentUrl.includes('login-mfa') || currentUrl.includes('/mfa');

            if (isMfaPage) {
                console.log('[Bot] Detected MFA page by URL');
                // Wait for the MFA page to fully load
                await this.page.waitForSelector('input[name="mfa_code"], input#mfa_code', { timeout: 10000 });
            }

            // Take screenshot after initial login
            await this.screenshot('screenshots/after-initial-login.png');

            // Look for 2FA input field with multiple possible selectors
            console.log('[Bot] Checking for 2FA requirement...');

            let totpInput = null;
            const possibleSelectors = [
                'input[name="mfa_code"]',        // Actionstep specific
                'input#mfa_code',                // Actionstep specific
                'input[name="code"]',
                'input[name="otp"]',
                'input[name="totp"]',
                'input[name="verificationCode"]',
                'input[name="token"]',
                'input[type="tel"]',
                'input[id*="code"]',
                'input[id*="otp"]',
                'input[placeholder*="code"]',
                'input[placeholder*="verification"]',
                'input[autocomplete="one-time-code"]'
            ];

            for (const selector of possibleSelectors) {
                try {
                    totpInput = await this.page.$(selector);
                    if (totpInput) {
                        console.log(`[Bot] Found 2FA input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            // If we couldn't find specific input, check if URL or page content suggests 2FA
            if (!totpInput && isMfaPage) {
                console.log('[Bot] On MFA page but input field not found with standard selectors');
                console.log('[Bot] Taking screenshot for manual inspection...');
                await this.screenshot('screenshots/2fa-page-unknown.png');

                // Try to find ANY text input field on the page
                const inputs = await this.page.$$('input[type="text"], input[type="tel"], input[type="number"], input:not([type])');
                if (inputs.length > 0) {
                    console.log(`[Bot] Found ${inputs.length} possible input field(s), using first one`);
                    totpInput = inputs[0];
                }
            }

            if (totpInput) {
                console.log('[Bot] 2FA required, generating TOTP code...');

                if (!this.totpSecret) {
                    await this.screenshot('screenshots/2fa-required-no-secret.png');
                    throw new Error('2FA required but ACTIONSTEP_TOTP_SECRET not configured. See TOTP_SETUP.md for instructions.');
                }

                // Generate TOTP code
                const totp = new OTPAuth.TOTP({
                    secret: OTPAuth.Secret.fromBase32(this.totpSecret),
                    digits: 6,
                    period: 30,
                });

                const code = totp.generate();
                console.log(`[Bot] Generated TOTP code: ${code}`);

                // Clear field first (in case there's a placeholder)
                await totpInput.click({ clickCount: 3 });
                await totpInput.press('Backspace');

                // Enter 2FA code
                console.log('[Bot] Entering 2FA code...');
                await totpInput.type(code, { delay: 100 });

                // Take screenshot before submitting
                await this.screenshot('screenshots/2fa-code-entered.png');

                // Wait a moment
                await this.sleep(1000);

                // Find and click submit button
                console.log('[Bot] Looking for submit button...');

                // Try multiple ways to find the Confirm button
                let submitButton = null;
                const buttonSelectors = [
                    'button:has-text("Confirm")',
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button:has-text("Submit")',
                    'button:has-text("Verify")',
                    'button:has-text("Continue")'
                ];

                for (const selector of buttonSelectors) {
                    try {
                        submitButton = await this.page.$(selector);
                        if (submitButton) {
                            console.log(`[Bot] Found submit button with selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }

                // If still not found, try finding by text content
                if (!submitButton) {
                    const buttons = await this.page.$$('button');
                    for (const button of buttons) {
                        const text = await button.evaluate(el => el.textContent?.trim().toLowerCase());
                        if (text && (text.includes('confirm') || text.includes('submit') || text.includes('verify'))) {
                            submitButton = button;
                            console.log(`[Bot] Found submit button by text content: ${text}`);
                            break;
                        }
                    }
                }

                if (!submitButton) {
                    console.log('[Bot] Submit button not found, trying to press Enter...');
                    await totpInput.press('Enter');
                } else {
                    console.log('[Bot] Clicking submit button...');
                    await submitButton.click();
                }

                // Wait for navigation away from MFA page
                console.log('[Bot] Waiting for navigation after 2FA...');
                try {
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
                    console.log('[Bot] Navigation completed after 2FA');
                } catch (e) {
                    console.log('[Bot] Navigation timeout after 2FA submission');
                    // Check if we're still on MFA page
                    const urlAfterSubmit = this.page.url();
                    if (urlAfterSubmit.includes('login-mfa')) {
                        await this.screenshot('screenshots/2fa-still-on-page.png');
                        throw new Error('Still on MFA page after submitting code. Code may be incorrect or expired.');
                    }
                    console.log('[Bot] Not on MFA page anymore, continuing...');
                }

                await this.screenshot('screenshots/after-2fa-submit.png');
                console.log('[Bot] 2FA code submitted successfully');
            } else {
                console.log('[Bot] No 2FA detected, proceeding...');
            }

            // Check if login was successful
            const finalUrl = this.page.url();
            console.log('[Bot] Final URL:', finalUrl);

            // Take final screenshot
            await this.screenshot('screenshots/after-full-login.png');

            // Check we're not still on login or MFA pages
            if (finalUrl.includes('/auth/login') ||
                finalUrl.includes('login-mfa') ||
                finalUrl.includes('/signin') ||
                finalUrl.includes('/authenticate')) {

                console.error('[Bot] Still on authentication page:', finalUrl);
                throw new Error('Login failed - still on authentication page. Check screenshots in screenshots/ folder.');
            }

            // Success! We should be on launch-pad or similar
            console.log('[Bot] Login successful - no longer on auth pages');

            this.isLoggedIn = true;
            console.log('[Bot] Successfully logged in');

        } catch (error) {
            console.error('[Bot] Login failed:', error.message);
            // Take screenshot for debugging
            await this.screenshot('screenshots/login-error.png').catch(() => {});
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * Check if current page is a login page (session expired)
     */
    async isOnLoginPage() {
        if (!this.page) return true;

        const url = this.page.url();
        return url.includes('/auth/login') ||
               url.includes('/signin') ||
               url.includes('/authenticate') ||
               url.includes('login-mfa');
    }

    /**
     * Ensure we're logged in (re-login if session expired)
     */
    async ensureLoggedIn() {
        const onLoginPage = await this.isOnLoginPage();

        if (onLoginPage) {
            console.log('[Bot] Session expired, re-authenticating...');
            this.isLoggedIn = false;
            await this.login();
        }
    }

    /**
     * Navigate to a specific matter's billing settings page
     * @param {string} matterId - Actionstep matter ID (action_id)
     */
    async navigateToMatter(matterId) {
        if (!this.isLoggedIn) {
            throw new Error('Not logged in');
        }

        console.log(`[Bot] Navigating to billing settings for matter ${matterId}...`);

        try {
            // Direct URL to billing settings page
            // Format: https://ap-southeast-2.actionstep.com/mym/asfw/workflow/action-billing/bill-settings/action_id/{matter_id}
            const billingUrl = `https://ap-southeast-2.actionstep.com/mym/asfw/workflow/action-billing/bill-settings/action_id/${matterId}`;

            console.log(`[Bot] Navigating to: ${billingUrl}`);
            await this.page.goto(billingUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for page to load
            await this.sleep(2000);

            // Check if we got redirected to login (session expired)
            if (await this.isOnLoginPage()) {
                console.log('[Bot] Session expired during navigation, re-authenticating...');
                await this.screenshot(`screenshots/session-expired-${matterId}.png`);
                await this.login();

                // Try navigation again
                console.log(`[Bot] Retrying navigation to matter ${matterId}...`);
                await this.page.goto(billingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await this.sleep(2000);
            }

            // Take screenshot for debugging
            await this.screenshot(`screenshots/matter-${matterId}-billing-page.png`);

            console.log(`[Bot] Loaded billing settings for matter ${matterId}`);
            return true;

        } catch (error) {
            console.error(`[Bot] Failed to navigate to matter ${matterId}:`, error.message);
            await this.screenshot(`screenshots/matter-${matterId}-navigation-error.png`);
            throw new Error(`Could not load billing settings: ${error.message}`);
        }
    }

    /**
     * Set origination fee for current matter
     * @param {string} referrerName - Staff member name (as appears in dropdown title)
     * @param {number} percentage - Origination fee percentage
     */
    async setOriginationFee(referrerName, percentage) {
        console.log(`[Bot] Setting origination fee: ${percentage}% to ${referrerName}...`);

        try {
            // Step 1: Enable origination fee checkbox
            console.log('[Bot] Enabling origination fee checkbox...');
            const checkbox = await this.page.$('#originator_fee_enabled');

            if (!checkbox) {
                throw new Error('Origination fee checkbox not found');
            }

            // Check if already enabled
            const isChecked = await checkbox.evaluate(el => el.checked);
            if (!isChecked) {
                await checkbox.click();
                console.log('[Bot] Origination fee enabled');
                // Wait for fields to become visible
                await this.sleep(1000);
            } else {
                console.log('[Bot] Origination fee already enabled');
            }

            // Take screenshot after enabling
            await this.screenshot('screenshots/origination-enabled.png');

            // Step 2: Wait for dropdown to be visible and select staff member by name
            console.log(`[Bot] Looking for staff member: ${referrerName}...`);
            await this.page.waitForSelector('#originator_fee_participant_id', { timeout: 5000 });

            // Find the option that matches the referrer name
            const staffOption = await this.page.$$eval('#originator_fee_participant_id option', (options, name) => {
                const option = options.find(opt => opt.title === name);
                return option ? { value: option.value, title: option.title } : null;
            }, referrerName);

            if (!staffOption) {
                // List available options for debugging
                const availableOptions = await this.page.$$eval('#originator_fee_participant_id option', (options) => {
                    return options.map(opt => opt.title).slice(0, 10); // First 10 for debugging
                });
                console.error('[Bot] Available staff members (first 10):', availableOptions);
                throw new Error(`Staff member "${referrerName}" not found in dropdown. Check name matches exactly.`);
            }

            console.log(`[Bot] Found staff member: ${staffOption.title} (ID: ${staffOption.value})`);

            // Select the staff member by value
            await this.page.select('#originator_fee_participant_id', staffOption.value);
            console.log('[Bot] Staff member selected');

            // Wait a moment
            await this.sleep(500);

            // Step 3: Enter percentage
            console.log(`[Bot] Entering percentage: ${percentage}%...`);
            const percentInput = await this.page.$('#originator_fee_percent');

            if (!percentInput) {
                throw new Error('Percentage input field not found');
            }

            // Clear existing value
            await percentInput.click({ clickCount: 3 });
            await percentInput.press('Backspace');

            // Format percentage to 2 decimal places
            const formattedPercentage = parseFloat(percentage).toFixed(2);
            await percentInput.type(formattedPercentage);

            console.log(`[Bot] Entered percentage: ${formattedPercentage}%`);

            // Take screenshot before saving
            await this.screenshot('screenshots/origination-filled.png');

            // Step 4: Find and click Save button
            console.log('[Bot] Looking for Save button...');

            // Try multiple possible save button selectors
            let saveButton = null;
            const saveSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Save")',
                'button.btn-primary',
                'input[value="Save"]'
            ];

            for (const selector of saveSelectors) {
                try {
                    saveButton = await this.page.$(selector);
                    if (saveButton) {
                        const buttonText = await saveButton.evaluate(el => el.textContent?.trim() || el.value);
                        console.log(`[Bot] Found Save button: "${buttonText}"`);
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }

            if (!saveButton) {
                // Try finding any button with "save" in text
                const buttons = await this.page.$$('button, input[type="submit"]');
                for (const button of buttons) {
                    const text = await button.evaluate(el => (el.textContent?.trim() || el.value || '').toLowerCase());
                    if (text.includes('save')) {
                        saveButton = button;
                        console.log(`[Bot] Found Save button by text: "${text}"`);
                        break;
                    }
                }
            }

            if (!saveButton) {
                console.warn('[Bot] Save button not found - changes may need manual save');
                await this.screenshot('screenshots/origination-no-save-button.png');
                throw new Error('Save button not found. Check screenshots/origination-no-save-button.png');
            }

            // Set up dialog handler for confirmation popup
            // This handles the "Do not print" warning dialog that appears before save
            console.log('[Bot] Setting up confirmation dialog handler...');
            this.page.once('dialog', async (dialog) => {
                const message = dialog.message();
                console.log('[Bot] Confirmation dialog detected:');
                console.log(`      ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
                await dialog.accept(); // Click OK
                console.log('[Bot] Clicked OK on confirmation dialog');
            });

            // Click save
            console.log('[Bot] Clicking Save button...');
            await saveButton.click();

            // Wait for dialog to appear and be dismissed, then for save to complete
            console.log('[Bot] Waiting for save to complete...');
            await this.sleep(3000); // Give extra time for dialog and save

            // Take final screenshot
            await this.screenshot('screenshots/origination-saved.png');

            console.log('[Bot] Origination fee set successfully');
            return true;

        } catch (error) {
            console.error('[Bot] Failed to set origination fee:', error.message);
            await this.screenshot('screenshots/origination-error.png');
            throw error;
        }
    }

    /**
     * Take a screenshot (useful for debugging)
     * @param {string} filename
     */
    async screenshot(filename) {
        if (this.page) {
            await this.page.screenshot({ path: filename, fullPage: true });
            console.log(`[Bot] Screenshot saved: ${filename}`);
        }
    }

    /**
     * Close browser
     */
    async close() {
        if (this.browser) {
            console.log('[Bot] Closing browser...');
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isLoggedIn = false;
        }
    }
}

module.exports = ActionstepBot;
