/**
 * Setup Verification Script
 * Quickly checks that everything is configured correctly before running tests
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const OTPAuth = require('otpauth');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function success(msg) { console.log(`${colors.green}✅ ${msg}${colors.reset}`); }
function error(msg) { console.log(`${colors.red}❌ ${msg}${colors.reset}`); }
function warning(msg) { console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`); }
function info(msg) { console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`); }

async function verifySetup() {
    console.log('\n╭────────────────────────────────────────────╮');
    console.log('│  🔍 Setup Verification                     │');
    console.log('╰────────────────────────────────────────────╯\n');

    let allGood = true;

    // Check environment variables
    console.log('Environment Variables:');
    console.log('─'.repeat(50));

    const requiredVars = {
        'DATABASE_URL': process.env.DATABASE_URL,
        'ACTIONSTEP_USERNAME': process.env.ACTIONSTEP_USERNAME,
        'ACTIONSTEP_PASSWORD': process.env.ACTIONSTEP_PASSWORD,
        'ACTIONSTEP_TOTP_SECRET': process.env.ACTIONSTEP_TOTP_SECRET,
    };

    for (const [name, value] of Object.entries(requiredVars)) {
        if (value) {
            if (name === 'DATABASE_URL') {
                success(`${name}: ${value.substring(0, 30)}...`);
            } else if (name.includes('PASSWORD') || name.includes('SECRET')) {
                success(`${name}: ${'*'.repeat(10)} (hidden)`);
            } else {
                success(`${name}: ${value}`);
            }
        } else {
            error(`${name}: NOT SET`);
            allGood = false;
        }
    }

    // Check optional vars
    const optionalVars = {
        'ACTIONSTEP_URL': process.env.ACTIONSTEP_URL || 'https://go.actionstep.com (default)',
        'POLL_INTERVAL': process.env.POLL_INTERVAL || '30 (default)',
        'HEADLESS': process.env.HEADLESS || 'true (default)'
    };

    console.log('\nOptional Variables:');
    for (const [name, value] of Object.entries(optionalVars)) {
        info(`${name}: ${value}`);
    }

    // Test database connection
    console.log('\n\nDatabase Connection:');
    console.log('─'.repeat(50));

    try {
        const sql = neon(process.env.DATABASE_URL);
        const result = await sql`SELECT NOW() as time`;
        success(`Connected to database`);
        info(`Server time: ${result[0].time}`);

        // Check if tables exist
        const tables = await sql`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('automation_jobs', 'automation_logs', 'referred_clients')
            ORDER BY table_name
        `;

        if (tables.length === 3) {
            success('All required tables exist');
            tables.forEach(t => info(`  • ${t.table_name}`));
        } else {
            warning(`Only ${tables.length}/3 tables found`);
            if (tables.length > 0) {
                tables.forEach(t => info(`  • ${t.table_name}`));
            }
            error('Run schema-automation.sql in Neon SQL Editor');
            allGood = false;
        }

        // Check for any pending jobs
        const pendingJobs = await sql`
            SELECT COUNT(*) as count
            FROM automation_jobs
            WHERE status = 'pending'
        `;
        const pending = parseInt(pendingJobs[0].count);
        if (pending > 0) {
            warning(`${pending} pending job(s) in queue`);
        } else {
            info('No pending jobs in queue');
        }

    } catch (err) {
        error('Database connection failed');
        console.log(`   ${err.message}`);
        allGood = false;
    }

    // Test TOTP generation
    console.log('\n\nTOTP Generation:');
    console.log('─'.repeat(50));

    try {
        const totp = new OTPAuth.TOTP({
            secret: OTPAuth.Secret.fromBase32(process.env.ACTIONSTEP_TOTP_SECRET),
            digits: 6,
            period: 30,
        });
        const code = totp.generate();
        success('TOTP code generated successfully');
        info(`Current code: ${code}`);
        info('Compare with your Authenticator app to verify');
    } catch (err) {
        error('TOTP generation failed');
        console.log(`   ${err.message}`);
        allGood = false;
    }

    // Check Node.js version
    console.log('\n\nNode.js Version:');
    console.log('─'.repeat(50));
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion >= 18) {
        success(`Node.js ${nodeVersion} (compatible)`);
    } else {
        warning(`Node.js ${nodeVersion} (recommend v18 or higher)`);
    }

    // Check for screenshots directory
    console.log('\n\nScreenshots Directory:');
    console.log('─'.repeat(50));
    const fs = require('fs');
    const path = require('path');
    const screenshotsDir = path.join(__dirname, 'screenshots');

    if (fs.existsSync(screenshotsDir)) {
        success('screenshots/ directory exists');
        const files = fs.readdirSync(screenshotsDir);
        if (files.length > 0) {
            info(`${files.length} screenshot(s) found`);
        }
    } else {
        info('screenshots/ directory will be created on first run');
    }

    // Final result
    console.log('\n\n' + '═'.repeat(50));
    if (allGood) {
        success('✨ All checks passed! System is ready.\n');
        console.log('Next steps:');
        console.log('  1. Run test: node test-automation.js MATTER_ID "REFERRER_NAME"');
        console.log('  2. Or start worker: npm start\n');
        process.exit(0);
    } else {
        error('⚠️  Some checks failed. Fix the issues above before proceeding.\n');
        process.exit(1);
    }
}

verifySetup().catch(err => {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
});
