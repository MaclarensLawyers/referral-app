/**
 * Debug Billing Page Script
 * Logs in, navigates to a matter's billing page, and helps you inspect the origination fee fields
 */

require('dotenv').config();
const ActionstepBot = require('./actionstep-bot');

async function debugBillingPage() {
    const matterId = process.argv[2];

    if (!matterId) {
        console.error('❌ Please provide a matter ID');
        console.error('\nUsage: node debug-billing-page.js MATTER_ID');
        console.error('Example: node debug-billing-page.js 202660890');
        process.exit(1);
    }

    console.log('╭────────────────────────────────────────────╮');
    console.log('│  Billing Page Debugger                     │');
    console.log('╰────────────────────────────────────────────╯\n');
    console.log(`Matter ID: ${matterId}\n`);

    const bot = new ActionstepBot({
        username: process.env.ACTIONSTEP_USERNAME,
        password: process.env.ACTIONSTEP_PASSWORD,
        totpSecret: process.env.ACTIONSTEP_TOTP_SECRET,
        baseUrl: process.env.ACTIONSTEP_URL || 'https://go.actionstep.com',
        headless: false // Keep browser open
    });

    try {
        // Initialize and login
        console.log('[Debug] Logging in...');
        await bot.init();

        // Navigate to billing page
        console.log(`[Debug] Navigating to billing page for matter ${matterId}...`);
        await bot.navigateToMatter(matterId);

        console.log('\n✅ Successfully loaded billing page');
        console.log('─'.repeat(50));

        // Analyze page
        console.log('\n📋 Page Analysis:');
        console.log('─'.repeat(50));

        // Find all visible form elements
        const formElements = await bot.page.$$eval('input, select, textarea, button', (elements) => {
            return elements
                .filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                })
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    type: el.type,
                    name: el.name,
                    id: el.id,
                    value: el.value,
                    placeholder: el.placeholder,
                    text: el.textContent?.trim().substring(0, 50),
                    className: el.className
                }));
        });

        console.log(`\nFound ${formElements.length} visible form elements:\n`);

        // Group by type
        const inputs = formElements.filter(el => el.tag === 'input');
        const selects = formElements.filter(el => el.tag === 'select');
        const checkboxes = formElements.filter(el => el.type === 'checkbox');
        const buttons = formElements.filter(el => el.tag === 'button');

        if (checkboxes.length > 0) {
            console.log('Checkboxes:');
            checkboxes.forEach((cb, i) => {
                console.log(`\n  ${i + 1}. ${cb.name || cb.id || 'unnamed'}`);
                if (cb.id) console.log(`     ID: ${cb.id}`);
                if (cb.name) console.log(`     Name: ${cb.name}`);
                if (cb.className) console.log(`     Class: ${cb.className}`);
            });
            console.log('');
        }

        if (selects.length > 0) {
            console.log('\nDropdowns/Selects:');
            selects.forEach((sel, i) => {
                console.log(`\n  ${i + 1}. ${sel.name || sel.id || 'unnamed'}`);
                if (sel.id) console.log(`     ID: ${sel.id}`);
                if (sel.name) console.log(`     Name: ${sel.name}`);
            });
            console.log('');
        }

        if (inputs.length > 0) {
            console.log('\nText Inputs:');
            inputs.filter(inp => inp.type !== 'checkbox' && inp.type !== 'hidden').forEach((inp, i) => {
                console.log(`\n  ${i + 1}. Type: ${inp.type}, Name: ${inp.name || 'unnamed'}`);
                if (inp.id) console.log(`     ID: ${inp.id}`);
                if (inp.placeholder) console.log(`     Placeholder: ${inp.placeholder}`);
                if (inp.value) console.log(`     Value: ${inp.value}`);
            });
            console.log('');
        }

        // Look for origination-related text
        console.log('\n🔍 Searching for "origination" related content...\n');
        const pageText = await bot.page.content();
        const hasOrigination = pageText.toLowerCase().includes('origination') ||
                              pageText.toLowerCase().includes('originating');

        if (hasOrigination) {
            console.log('✅ Found "origination" text on page');

            // Try to find labels with "origination"
            const labels = await bot.page.$$eval('label', (elements) => {
                return elements
                    .filter(el => el.textContent?.toLowerCase().includes('originat'))
                    .map(el => ({
                        text: el.textContent?.trim(),
                        htmlFor: el.htmlFor,
                        id: el.id
                    }));
            });

            if (labels.length > 0) {
                console.log('\nLabels containing "origination":');
                labels.forEach(label => {
                    console.log(`  - ${label.text}`);
                    if (label.htmlFor) console.log(`    Links to: ${label.htmlFor}`);
                });
            }
        } else {
            console.log('⚠️  No "origination" text found on page');
            console.log('   You may need to scroll or expand sections');
        }

        console.log('\n' + '─'.repeat(50));
        console.log('\n📸 Screenshot saved to: screenshots/debug-billing-page.png');
        await bot.screenshot(`screenshots/debug-billing-page.png`);

        console.log('\n⏸️  Browser will stay open for manual inspection');
        console.log('   - Inspect elements in DevTools');
        console.log('   - Look for origination fee fields');
        console.log('   - Note the selectors (id, name, class)');
        console.log('\n   Press Ctrl+C to exit\n');

        // Keep browser open
        await new Promise(() => {});

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        await bot.screenshot('screenshots/debug-billing-error.png');
        console.log('Screenshot saved to: screenshots/debug-billing-error.png');
        await bot.close();
        process.exit(1);
    }
}

debugBillingPage();
