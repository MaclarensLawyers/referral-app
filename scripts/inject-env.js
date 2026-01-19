/**
 * Build script to inject environment variables into HTML files
 *
 * Replaces placeholders with actual values from environment variables:
 * - __AUTH0_DOMAIN__ -> AUTH0_DOMAIN
 * - __AUTH0_CLIENT_ID__ -> AUTH0_CLIENT_ID
 * - __AUTH0_AUDIENCE__ -> AUTH0_AUDIENCE
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const replacements = {
    '__AUTH0_DOMAIN__': process.env.AUTH0_DOMAIN || '',
    '__AUTH0_CLIENT_ID__': process.env.AUTH0_CLIENT_ID || '',
    '__AUTH0_AUDIENCE__': process.env.AUTH0_AUDIENCE || '',
};

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    for (const [placeholder, value] of Object.entries(replacements)) {
        if (content.includes(placeholder)) {
            if (!value) {
                console.warn(`Warning: ${placeholder} found but environment variable not set`);
            }
            content = content.split(placeholder).join(value);
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Processed: ${filePath}`);
    }
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            processDirectory(filePath);
        } else if (file.endsWith('.html')) {
            processFile(filePath);
        }
    }
}

console.log('Injecting environment variables into HTML files...');
console.log('AUTH0_DOMAIN:', process.env.AUTH0_DOMAIN ? 'set' : 'NOT SET');
console.log('AUTH0_CLIENT_ID:', process.env.AUTH0_CLIENT_ID ? 'set' : 'NOT SET');
console.log('AUTH0_AUDIENCE:', process.env.AUTH0_AUDIENCE ? 'set' : 'NOT SET');

processDirectory(PUBLIC_DIR);

console.log('Done.');
