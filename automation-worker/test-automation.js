/**
 * End-to-End Test Script
 * Tests the complete automation workflow from job creation to completion
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const ActionstepBot = require('./actionstep-bot');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function header(message) {
    console.log('\n' + '═'.repeat(60));
    log(message, colors.bright + colors.cyan);
    console.log('═'.repeat(60) + '\n');
}

function step(number, message) {
    log(`\n[Step ${number}] ${message}`, colors.bright);
}

function success(message) {
    log(`✅ ${message}`, colors.green);
}

function error(message) {
    log(`❌ ${message}`, colors.red);
}

function warning(message) {
    log(`⚠️  ${message}`, colors.yellow);
}

function info(message) {
    log(`ℹ️  ${message}`, colors.blue);
}

async function testAutomation() {
    // Get test parameters from command line
    const matterId = process.argv[2];
    const referrerName = process.argv[3];
    const percentage = parseFloat(process.argv[4]) || 10.0;

    header('🧪 Automation System End-to-End Test');

    // Validate inputs
    if (!matterId || !referrerName) {
        error('Missing required parameters\n');
        console.log('Usage: node test-automation.js MATTER_ID "REFERRER_NAME" [PERCENTAGE]');
        console.log('\nExample:');
        console.log('  node test-automation.js 202660890 "Aboud, Deane Nicole (Staff)" 10\n');
        info('The referrer name must match EXACTLY as it appears in Actionstep dropdown');
        info('Include quotes around the name if it contains spaces\n');
        process.exit(1);
    }

    info(`Test Parameters:`);
    console.log(`  Matter ID: ${matterId}`);
    console.log(`  Referrer: ${referrerName}`);
    console.log(`  Percentage: ${percentage}%`);

    const sql = neon(process.env.DATABASE_URL);
    let testJobId = null;

    try {
        // ==========================================
        // STEP 1: Database Connection Test
        // ==========================================
        step(1, 'Testing Database Connection');

        const dbTest = await sql`SELECT NOW() as current_time`;
        success(`Connected to database`);
        info(`Current time: ${dbTest[0].current_time}`);

        // ==========================================
        // STEP 2: Create Test Job
        // ==========================================
        step(2, 'Creating Test Automation Job');

        const result = await sql`
            INSERT INTO automation_jobs (
                matter_id,
                client_participant_id,
                referrer_name,
                origination_percentage,
                status
            ) VALUES (
                ${matterId},
                'TEST_CLIENT_' || ${Date.now()},
                ${referrerName},
                ${percentage},
                'pending'
            )
            RETURNING id
        `;

        testJobId = result[0].id;
        success(`Created test job with ID: ${testJobId}`);

        // ==========================================
        // STEP 3: Initialize Bot
        // ==========================================
        step(3, 'Initializing Automation Bot');

        const bot = new ActionstepBot({
            username: process.env.ACTIONSTEP_USERNAME,
            password: process.env.ACTIONSTEP_PASSWORD,
            totpSecret: process.env.ACTIONSTEP_TOTP_SECRET,
            baseUrl: process.env.ACTIONSTEP_URL || 'https://go.actionstep.com',
            headless: false // Keep browser open to watch
        });

        info('Logging in to Actionstep...');
        await bot.init();
        success('Bot initialized and logged in');

        // ==========================================
        // STEP 4: Navigate to Matter
        // ==========================================
        step(4, 'Navigating to Matter Billing Page');

        await bot.navigateToMatter(matterId);
        success(`Loaded billing page for matter ${matterId}`);
        info('Screenshot saved: screenshots/matter-${matterId}-billing-page.png');

        // ==========================================
        // STEP 5: Set Origination Fee
        // ==========================================
        step(5, 'Setting Origination Fee');

        info('This will:');
        console.log('  1. Enable origination fee checkbox');
        console.log('  2. Select staff member from dropdown');
        console.log('  3. Enter percentage');
        console.log('  4. Click Save button\n');

        await bot.setOriginationFee(referrerName, percentage);
        success('Origination fee set successfully!');

        // ==========================================
        // STEP 6: Verify Changes
        // ==========================================
        step(6, 'Verifying Changes');

        info('Check the Actionstep page in the browser to verify:');
        console.log('  • Origination fee is enabled');
        console.log(`  • Staff member: ${referrerName}`);
        console.log(`  • Percentage: ${percentage}%`);
        console.log('');

        warning('Browser will stay open for 10 seconds for manual verification...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // ==========================================
        // STEP 7: Update Job Status
        // ==========================================
        step(7, 'Updating Job Status');

        await sql`
            UPDATE automation_jobs
            SET
                status = 'completed',
                completed_at = NOW()
            WHERE id = ${testJobId}
        `;
        success('Job marked as completed');

        // Log the action
        await sql`
            INSERT INTO automation_logs (
                job_id,
                matter_id,
                client_participant_id,
                action,
                status,
                message,
                triggered_by
            ) VALUES (
                ${testJobId},
                ${matterId},
                'TEST_CLIENT',
                'test_run',
                'success',
                ${`Test: Set origination fee to ${percentage}% for ${referrerName}`},
                'manual_test'
            )
        `;
        success('Action logged to database');

        // ==========================================
        // STEP 8: Cleanup
        // ==========================================
        step(8, 'Cleanup');

        await bot.close();
        success('Browser closed');

        // ==========================================
        // FINAL RESULTS
        // ==========================================
        header('✨ Test Complete');

        success('All steps completed successfully!\n');

        console.log('📸 Screenshots saved to automation-worker/screenshots/:');
        console.log(`  • matter-${matterId}-billing-page.png`);
        console.log('  • origination-enabled.png');
        console.log('  • origination-filled.png');
        console.log('  • origination-saved.png\n');

        console.log('📋 Database Records:');
        console.log(`  • Job ID: ${testJobId}`);
        console.log(`  • Status: completed\n`);

        info('Next Steps:');
        console.log('  1. Verify the changes in Actionstep manually');
        console.log('  2. Check automation logs: SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 5;');
        console.log('  3. Set up Zapier workflow to create jobs automatically\n');

        // Force exit immediately
        setTimeout(() => process.exit(0), 100);

    } catch (err) {
        header('❌ Test Failed');

        error(`Error: ${err.message}\n`);

        if (err.stack) {
            console.log('Stack trace:');
            console.log(err.stack);
        }

        console.log('\n📸 Check screenshots in automation-worker/screenshots/ for debugging\n');

        // Close browser if it's still open
        try {
            if (bot && bot.browser) {
                await bot.close();
                info('Browser closed');
            }
        } catch (e) {
            // Ignore cleanup errors
        }

        // Mark job as failed if it was created
        if (testJobId) {
            try {
                await sql`
                    UPDATE automation_jobs
                    SET
                        status = 'failed',
                        error_message = ${err.message},
                        completed_at = NOW()
                    WHERE id = ${testJobId}
                `;
                info(`Job ${testJobId} marked as failed in database`);
            } catch (e) {
                error('Could not update job status: ' + e.message);
            }
        }

        // Force exit immediately
        setTimeout(() => process.exit(1), 100);
    }
}

// Catch unhandled errors
process.on('unhandledRejection', (error) => {
    console.error('\n❌ Unhandled error:', error);
    process.exit(1);
});

// Run the test
testAutomation();
