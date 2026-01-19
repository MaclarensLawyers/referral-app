const { requireAdmin, handleAuthError } = require('./lib/auth');

/**
 * Invite a new user via Auth0 Management API
 *
 * POST body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Requires admin role
 *
 * Environment variables required:
 * - AUTH0_DOMAIN: Auth0 tenant domain
 * - AUTH0_MGMT_CLIENT_ID: Auth0 Management API client ID
 * - AUTH0_MGMT_CLIENT_SECRET: Auth0 Management API client secret
 * - AUTH0_CONNECTION: Auth0 database connection name (default: 'Username-Password-Authentication')
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID;
const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET;
const AUTH0_CONNECTION = process.env.AUTH0_CONNECTION || 'Username-Password-Authentication';

// Cache management API token
let mgmtToken = null;
let mgmtTokenExpiry = 0;

/**
 * Get Auth0 Management API access token
 */
async function getManagementToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (mgmtToken && Date.now() < mgmtTokenExpiry - 300000) {
        return mgmtToken;
    }

    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: AUTH0_MGMT_CLIENT_ID,
            client_secret: AUTH0_MGMT_CLIENT_SECRET,
            audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Failed to get management token: ${error.error_description || response.status}`);
    }

    const data = await response.json();
    mgmtToken = data.access_token;
    mgmtTokenExpiry = Date.now() + (data.expires_in * 1000);
    return mgmtToken;
}

/**
 * Create a user in Auth0 and send password reset email
 */
async function createUserAndInvite(email) {
    const token = await getManagementToken();

    // Generate a random password (user will reset via email)
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    // Create the user
    const createResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email,
            password: tempPassword + 'Aa1!', // Ensure password meets complexity
            connection: AUTH0_CONNECTION,
            email_verified: false,
        }),
    });

    if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}));
        if (createResponse.status === 409 || error.code === 'user_exists') {
            throw new Error('User already exists');
        }
        throw new Error(error.message || `Failed to create user: ${createResponse.status}`);
    }

    const user = await createResponse.json();

    // Send password change email as invitation
    const ticketResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/tickets/password-change`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_id: user.user_id,
            mark_email_as_verified: true,
            includeEmailInRedirect: false,
        }),
    });

    if (!ticketResponse.ok) {
        const error = await ticketResponse.json().catch(() => ({}));
        console.error('Failed to send password reset:', error);
        // User was created but email failed - still return success
    }

    return user;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Require admin role
        await requireAdmin(event);

        // Check Auth0 configuration
        if (!AUTH0_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Auth0 not configured',
                    message: 'Auth0 Management API credentials are not set',
                }),
            };
        }

        const body = JSON.parse(event.body);
        const { email } = body;

        if (!email || !email.includes('@')) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Valid email address required' }),
            };
        }

        const user = await createUserAndInvite(email);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: `Invitation sent to ${email}`,
                user: {
                    id: user.user_id,
                    email: user.email,
                },
            }),
        };

    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Invite user error:', error);

        // Handle specific error cases
        if (error.message === 'User already exists') {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'User already exists',
                    details: 'An account with this email already exists',
                }),
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
