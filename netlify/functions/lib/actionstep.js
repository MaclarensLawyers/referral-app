const { sql } = require('./db');

// Actionstep API configuration
// Set these in Netlify environment variables:
// - ACTIONSTEP_CLIENT_ID
// - ACTIONSTEP_CLIENT_SECRET
// - ACTIONSTEP_API_URL (e.g., https://ap-southeast-2.actionstep.com/api/rest)
// - ACTIONSTEP_AUTH_DOMAIN (e.g., go.actionstep.com or go.actionstepstaging.com)
// - APP_URL (your Netlify app URL for OAuth callback)

// Default to production, but allow override for staging
const AUTH_DOMAIN = process.env.ACTIONSTEP_AUTH_DOMAIN || 'go.actionstep.com';
const ACTIONSTEP_AUTH_URL = `https://${AUTH_DOMAIN}/api/oauth/authorize`;
const ACTIONSTEP_TOKEN_URL = `https://${AUTH_DOMAIN}/api/oauth/token`;

/**
 * Get stored OAuth tokens from database
 */
async function getTokens() {
    const result = await sql`
        SELECT key, value FROM settings 
        WHERE key IN ('access_token', 'refresh_token', 'token_expires_at')
    `;
    
    const tokens = {};
    result.forEach(row => {
        tokens[row.key] = row.value;
    });
    
    return tokens;
}

/**
 * Store OAuth tokens in database
 */
async function storeTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
    
    await sql`
        INSERT INTO settings (key, value, updated_at) VALUES 
            ('access_token', ${accessToken}, NOW()),
            ('refresh_token', ${refreshToken}, NOW()),
            ('token_expires_at', ${expiresAt}, NOW())
        ON CONFLICT (key) DO UPDATE SET 
            value = EXCLUDED.value,
            updated_at = NOW()
    `;
}

/**
 * Check if access token is expired (with 5 min buffer)
 */
function isTokenExpired(expiresAt) {
    if (!expiresAt) return true;
    const expiry = new Date(expiresAt);
    const buffer = 5 * 60 * 1000; // 5 minutes
    return Date.now() > (expiry.getTime() - buffer);
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
    const response = await fetch(ACTIONSTEP_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: process.env.ACTIONSTEP_CLIENT_ID,
            client_secret: process.env.ACTIONSTEP_CLIENT_SECRET,
            refresh_token: refreshToken,
        }),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token refresh failed: ${error}`);
    }
    
    const data = await response.json();
    await storeTokens(data.access_token, data.refresh_token, data.expires_in);
    
    return data.access_token;
}

/**
 * Get a valid access token (refreshing if necessary)
 */
async function getValidAccessToken() {
    const tokens = await getTokens();
    
    if (!tokens.access_token) {
        throw new Error('No access token found. Please authenticate with Actionstep first.');
    }
    
    if (isTokenExpired(tokens.token_expires_at)) {
        if (!tokens.refresh_token) {
            throw new Error('Token expired and no refresh token available. Please re-authenticate.');
        }
        return await refreshAccessToken(tokens.refresh_token);
    }
    
    return tokens.access_token;
}

/**
 * Make an authenticated request to Actionstep API
 */
async function actionstepRequest(endpoint, options = {}) {
    const accessToken = await getValidAccessToken();
    const baseUrl = process.env.ACTIONSTEP_API_URL;
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Actionstep API error: ${response.status} - ${error}`);
    }
    
    return response.json();
}

/**
 * Get time entries for a specific matter with owner details
 * Returns { timeentries: [], users: {} } where users is a map of id -> user object
 */
async function getTimeEntriesForMatter(matterId) {
    // Actionstep API filtering uses the format: field_comparator=value
    // For action (matter) ID, use action_eq
    // Include 'owner' to get user details for fee earner names
    // Filter to only billable entries
    const data = await actionstepRequest(
        `/timeentries?action_eq=${matterId}&include=owner&isBillable_eq=T`
    );
    
    // Log the response structure for debugging (remove in production)
    console.log('Actionstep response keys:', Object.keys(data));
    if (data.linked) {
        console.log('Linked data keys:', Object.keys(data.linked));
    }
    
    // Build a map of user IDs to user objects from the linked data
    // Actionstep may return users under 'linked.users' or 'linked.participants'
    const users = {};
    const linkedUsers = data.linked?.users || data.linked?.participants || [];
    
    if (Array.isArray(linkedUsers)) {
        linkedUsers.forEach(user => {
            users[user.id] = user;
        });
    }
    
    return {
        timeentries: data.timeentries || [],
        users,
        // Include raw linked data for debugging
        _linkedRaw: data.linked
    };
}

/**
 * Get action/matter details
 */
async function getMatter(matterId) {
    const data = await actionstepRequest(`/actions/${matterId}`);
    return data.actions ? data.actions[0] : null;
}

/**
 * Generate OAuth authorization URL
 */
function getAuthorizationUrl() {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.ACTIONSTEP_CLIENT_ID,
        redirect_uri: `${process.env.APP_URL}/api/auth-callback`,
        scope: 'all',
    });
    
    return `${ACTIONSTEP_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
    const response = await fetch(ACTIONSTEP_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: process.env.ACTIONSTEP_CLIENT_ID,
            client_secret: process.env.ACTIONSTEP_CLIENT_SECRET,
            redirect_uri: `${process.env.APP_URL}/api/auth-callback`,
            code: code,
        }),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }
    
    const data = await response.json();
    await storeTokens(data.access_token, data.refresh_token, data.expires_in);
    
    return data;
}

module.exports = {
    getTokens,
    storeTokens,
    getValidAccessToken,
    actionstepRequest,
    getTimeEntriesForMatter,
    getMatter,
    getAuthorizationUrl,
    exchangeCodeForTokens,
};
