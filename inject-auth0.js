/**
 * Inject Auth0 configuration from .env into HTML files
 * Run this script to update the Auth0 config in all HTML files
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Get Auth0 config from environment
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// Check required values
if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_AUDIENCE) {
    console.error('❌ Missing required Auth0 environment variables:');
    if (!AUTH0_DOMAIN) console.error('   - AUTH0_DOMAIN');
    if (!AUTH0_CLIENT_ID) console.error('   - AUTH0_CLIENT_ID');
    if (!AUTH0_AUDIENCE) console.error('   - AUTH0_AUDIENCE');
    console.error('\nPlease add these to your .env file.');
    process.exit(1);
}

// HTML files to update
const htmlFiles = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'public', 'add-client.html'),
    path.join(__dirname, 'public', 'settings.html'),
    path.join(__dirname, 'public', 'login.html'),
    path.join(__dirname, 'public', 'callback.html'),
];

console.log('Injecting Auth0 configuration into HTML files...\n');

let successCount = 0;

htmlFiles.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipped: ${path.basename(filePath)} (file not found)`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace placeholders
        content = content
            .replace(/__AUTH0_DOMAIN__/g, AUTH0_DOMAIN)
            .replace(/__AUTH0_CLIENT_ID__/g, AUTH0_CLIENT_ID)
            .replace(/__AUTH0_AUDIENCE__/g, AUTH0_AUDIENCE);

        // Write back to file
        fs.writeFileSync(filePath, content, 'utf8');

        console.log(`✅ Updated: ${path.basename(filePath)}`);
        successCount++;
    } catch (error) {
        console.error(`❌ Error updating ${path.basename(filePath)}:`, error.message);
    }
});

console.log(`\n✅ Successfully updated ${successCount} file(s)`);
console.log('\nAuth0 configuration:');
console.log(`   Domain: ${AUTH0_DOMAIN}`);
console.log(`   Client ID: ${AUTH0_CLIENT_ID}`);
console.log(`   Audience: ${AUTH0_AUDIENCE}`);
