const { requireAdmin, handleAuthError } = require('./lib/auth');

/**
 * Invite a new user via Netlify Identity
 *
 * POST body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Requires admin role
 */
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Require admin role
        requireAdmin(event);

        const body = JSON.parse(event.body);
        const { email } = body;

        if (!email || !email.includes('@')) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Valid email address required' }),
            };
        }

        // Get the Identity endpoint from context
        const identity = context.clientContext?.identity;
        if (!identity?.url) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Identity not configured',
                    message: 'Netlify Identity is not enabled for this site',
                }),
            };
        }

        // Get the admin token from the Authorization header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'No authorization token' }),
            };
        }

        // Call the Netlify Identity admin API to invite the user
        const response = await fetch(`${identity.url}/invite`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Identity API error:', response.status, errorData);

            if (response.status === 422) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'User already exists or invalid email',
                        details: errorData.msg || errorData.message,
                    }),
                };
            }

            return {
                statusCode: response.status,
                body: JSON.stringify({
                    error: 'Failed to invite user',
                    details: errorData.msg || errorData.message || 'Unknown error',
                }),
            };
        }

        const userData = await response.json();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: `Invitation sent to ${email}`,
                user: {
                    id: userData.id,
                    email: userData.email,
                },
            }),
        };

    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Invite user error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
