/**
 * Actionstep Automation Worker
 * Main entry point
 */

require('dotenv').config();
const JobProcessor = require('./job-processor');
const fs = require('fs');
const path = require('path');

// Validate environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'ACTIONSTEP_USERNAME',
    'ACTIONSTEP_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\nPlease add these to your .env file');
    process.exit(1);
}

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

// Configuration
const config = {
    databaseUrl: process.env.DATABASE_URL,
    actionstepUsername: process.env.ACTIONSTEP_USERNAME,
    actionstepPassword: process.env.ACTIONSTEP_PASSWORD,
    actionstepTotpSecret: process.env.ACTIONSTEP_TOTP_SECRET, // Optional 2FA secret
    actionstepUrl: process.env.ACTIONSTEP_URL || 'https://go.actionstepstaging.com',
    pollInterval: (parseInt(process.env.POLL_INTERVAL) || 30) * 1000,
    headless: process.env.HEADLESS !== 'false',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS) || 1
};

console.log('╭────────────────────────────────────────────╮');
console.log('│                                            │');
console.log('│   Actionstep Automation Worker             │');
console.log('│   Origination Fee Automation               │');
console.log('│                                            │');
console.log('╰────────────────────────────────────────────╯\n');

console.log('Configuration:');
console.log(`  Database: ${config.databaseUrl.substring(0, 30)}...`);
console.log(`  Actionstep URL: ${config.actionstepUrl}`);
console.log(`  Username: ${config.actionstepUsername}`);
console.log(`  Poll interval: ${config.pollInterval / 1000}s`);
console.log(`  Headless mode: ${config.headless}`);
console.log(`  Max concurrent: ${config.maxConcurrent}`);
console.log('');

// Create processor
const processor = new JobProcessor(config);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Main] Received SIGINT, shutting down gracefully...');
    await processor.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Main] Received SIGTERM, shutting down gracefully...');
    await processor.stop();
    process.exit(0);
});

// Start the processor
(async () => {
    try {
        await processor.start();
    } catch (error) {
        console.error('❌ Failed to start worker:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
