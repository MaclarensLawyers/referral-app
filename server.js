/**
 * Local development server for Netlify app
 * Mimics Netlify's function routing and static file serving
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Load Netlify functions dynamically
const functionsDir = path.join(__dirname, 'netlify', 'functions');

// Map function files to their handlers
const loadFunction = (functionName) => {
    const functionPath = path.join(functionsDir, `${functionName}.js`);
    if (fs.existsSync(functionPath)) {
        // Clear require cache to allow hot reloading
        delete require.cache[require.resolve(functionPath)];
        return require(functionPath);
    }
    return null;
};

// Netlify function handler wrapper
const handleFunction = async (req, res, functionName) => {
    try {
        const func = loadFunction(functionName);
        if (!func || !func.handler) {
            return res.status(404).json({ error: 'Function not found' });
        }

        // Build Netlify-style event object
        const event = {
            httpMethod: req.method,
            headers: req.headers,
            body: req.method !== 'GET' && req.method !== 'HEAD'
                ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
                : null,
            queryStringParameters: req.query,
            path: req.path,
        };

        // Call the function handler
        const result = await func.handler(event);

        // Send response
        const statusCode = result.statusCode || 200;
        const headers = result.headers || {};

        // Set headers
        Object.keys(headers).forEach(key => {
            res.setHeader(key, headers[key]);
        });

        // Send response
        res.status(statusCode);

        if (result.body) {
            // Try to parse as JSON for pretty printing in logs
            try {
                const parsed = JSON.parse(result.body);
                res.json(parsed);
            } catch {
                res.send(result.body);
            }
        } else {
            res.end();
        }

    } catch (error) {
        console.error(`Function ${functionName} error:`, error);
        res.status(500).json({
            error: 'Function execution error',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// API routes - map to Netlify functions
app.all('/api/:functionName', (req, res) => {
    const functionName = req.params.functionName;
    handleFunction(req, res, functionName);
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
}));

// SPA fallback - serve index.html for unmatched routes (except API)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n╭─────────────────────────────────────────────╮');
    console.log('│                                             │');
    console.log(`│   Local dev server: http://localhost:${PORT}   │`);
    console.log('│                                             │');
    console.log('╰─────────────────────────────────────────────╯\n');
    console.log('Environment variables loaded:');
    console.log(`  ✓ DATABASE_URL: ${process.env.DATABASE_URL ? 'Set' : 'NOT SET'}`);
    console.log(`  ✓ AUTH0_DOMAIN: ${process.env.AUTH0_DOMAIN || 'NOT SET'}`);
    console.log(`  ✓ AUTH0_AUDIENCE: ${process.env.AUTH0_AUDIENCE || 'NOT SET'}`);
    console.log(`  ✓ ACTIONSTEP_CLIENT_ID: ${process.env.ACTIONSTEP_CLIENT_ID ? 'Set' : 'NOT SET'}`);
    console.log(`  ✓ ACTIONSTEP_API_URL: ${process.env.ACTIONSTEP_API_URL || 'NOT SET'}`);
    console.log('\nPress Ctrl+C to stop\n');
});
