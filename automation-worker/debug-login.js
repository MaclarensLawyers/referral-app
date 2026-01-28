/**
 * Debug Login Script
 * Opens browser and pauses at 2FA page so you can inspect elements
 */

require('dotenv').config();
const puppeteer = require('puppeteer');

async function debugLogin() {
    console.log('Starting debug login...');
    console.log('This will open a browser and pause at the 2FA page');
    console.log('You can inspect the page to find the correct selectors\n');

    const browser = await puppeteer.launch({
        headless: false,
        devtools: true, // Opens DevTools automatically
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        // Navigate to Actionstep
        const baseUrl = process.env.ACTIONSTEP_URL || 'https://go.actionstepstaging.com';
        console.log(`Navigating to ${baseUrl}...`);
        await page.goto(baseUrl, { waitUntil: 'networkidle2' });

        // Wait for login form
        await page.waitForSelector('input[type="email"], input[name="username"], input#username', {
            timeout: 10000
        });

        console.log('Login page loaded');

        // Fill credentials
        const emailInput = await page.$('input[type="email"], input[name="username"], input#username');
        const passwordInput = await page.$('input[type="password"], input[name="password"], input#password');

        if (emailInput && passwordInput) {
            console.log('Entering credentials...');
            await emailInput.type(process.env.ACTIONSTEP_USERNAME);
            await passwordInput.type(process.env.ACTIONSTEP_PASSWORD);

            // Submit
            console.log('Submitting login form...');
            await Promise.all([
                page.click('button[type="submit"], input[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            ]);

            console.log('\n✅ Initial login submitted');
            console.log(`Current URL: ${page.url()}`);

            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('\n📋 Page Analysis:');
            console.log('─'.repeat(50));

            // Find all input fields
            const inputs = await page.$$eval('input', (elements) => {
                return elements.map(el => ({
                    type: el.type,
                    name: el.name,
                    id: el.id,
                    placeholder: el.placeholder,
                    autocomplete: el.autocomplete,
                    className: el.className
                }));
            });

            if (inputs.length > 0) {
                console.log('\nInput fields found:');
                inputs.forEach((input, i) => {
                    console.log(`\n  Input ${i + 1}:`);
                    console.log(`    Type: ${input.type}`);
                    if (input.name) console.log(`    Name: ${input.name}`);
                    if (input.id) console.log(`    ID: ${input.id}`);
                    if (input.placeholder) console.log(`    Placeholder: ${input.placeholder}`);
                    if (input.autocomplete) console.log(`    Autocomplete: ${input.autocomplete}`);
                    if (input.className) console.log(`    Class: ${input.className}`);
                });
            } else {
                console.log('\n❌ No input fields found on this page');
            }

            // Find all buttons
            const buttons = await page.$$eval('button, input[type="submit"]', (elements) => {
                return elements.map(el => ({
                    text: el.textContent?.trim() || el.value,
                    type: el.type,
                    id: el.id,
                    className: el.className
                }));
            });

            if (buttons.length > 0) {
                console.log('\nButtons found:');
                buttons.forEach((btn, i) => {
                    console.log(`\n  Button ${i + 1}:`);
                    console.log(`    Text: ${btn.text}`);
                    if (btn.type) console.log(`    Type: ${btn.type}`);
                    if (btn.id) console.log(`    ID: ${btn.id}`);
                    if (btn.className) console.log(`    Class: ${btn.className}`);
                });
            }

            console.log('\n' + '─'.repeat(50));
            console.log('\n🔍 Inspect the page in DevTools to find the correct selectors');
            console.log('📸 Screenshot saved to: screenshots/debug-page.png');

            // Save screenshot
            await page.screenshot({
                path: 'screenshots/debug-page.png',
                fullPage: true
            });

            console.log('\n⏸️  Browser will stay open. Press Ctrl+C to exit.\n');

            // Keep browser open indefinitely
            await new Promise(() => {});
        }

    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({ path: 'screenshots/debug-error.png', fullPage: true });
        console.log('Error screenshot saved to: screenshots/debug-error.png');
    }
}

debugLogin();
