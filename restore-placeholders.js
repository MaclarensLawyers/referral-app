/**
 * Restore Auth0 placeholders in HTML files (reverse of inject-auth0.js)
 * Use this before committing to git
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Get Auth0 config from environment to know what to replace
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_AUDIENCE) {
    console.error('⚠️  Warning: Auth0 environment variables not found.');
    console.error('   Will attempt to restore placeholders anyway.\n');
}

// HTML files to update
const htmlFiles = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'public', 'add-client.html'),
    path.join(__dirname, 'public', 'settings.html'),
    path.join(__dirname, 'public', 'login.html'),
    path.join(__dirname, 'public', 'callback.html'),
];

console.log('Restoring Auth0 placeholders in HTML files...\n');

let successCount = 0;

htmlFiles.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipped: ${path.basename(filePath)} (file not found)`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace actual values with placeholders
        if (AUTH0_DOMAIN) {
            content = content.replace(new RegExp(AUTH0_DOMAIN, 'g'), '__AUTH0_DOMAIN__');
        }
        if (AUTH0_CLIENT_ID) {
            content = content.replace(new RegExp(AUTH0_CLIENT_ID, 'g'), '__AUTH0_CLIENT_ID__');
        }
        if (AUTH0_AUDIENCE) {
            content = content.replace(new RegExp(AUTH0_AUDIENCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '__AUTH0_AUDIENCE__');
        }

        // Write back to file
        fs.writeFileSync(filePath, content, 'utf8');

        console.log(`✅ Restored: ${path.basename(filePath)}`);
        successCount++;
    } catch (error) {
        console.error(`❌ Error restoring ${path.basename(filePath)}:`, error.message);
    }
});

console.log(`\n✅ Successfully restored ${successCount} file(s)`);
console.log('\n✨ HTML files are now safe to commit to git!');
console.log('\n💡 After committing, run "node inject-auth0.js" to restore for local dev.');
