const { verifyAuth, handleAuthError } = require('./lib/auth');
const { sql } = require('./lib/db');

/**
 * Submit a new referred client to Zapier Tables
 *
 * POST: Submit client data to Zapier webhook
 */
exports.handler = async (event) => {
    try {
        // Require authentication
        await verifyAuth(event);

        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Method not allowed' }),
            };
        }

        // Parse request body
        const { client_participant_id, client_name, referrer_name } = JSON.parse(event.body);

        // Validate required fields
        if (!client_participant_id || !client_name || !referrer_name) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Missing required fields: client_participant_id, client_name, and referrer_name are required'
                }),
            };
        }

        // Get Zapier webhook URL from settings
        const settings = await sql`
            SELECT value FROM settings
            WHERE key = 'zapier_add_client_url'
        `;

        if (!settings.length || !settings[0].value) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Zapier webhook URL not configured. Please add it in Settings.'
                }),
            };
        }

        const zapierUrl = settings[0].value;

        // Submit to Zapier
        const zapierResponse = await fetch(zapierUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_participant_id,
                client_name,
                referrer_name,
            }),
        });

        if (!zapierResponse.ok) {
            const errorText = await zapierResponse.text();
            console.error('Zapier submission failed:', errorText);

            return {
                statusCode: 502,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Failed to submit to Zapier',
                    details: errorText,
                }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Client submitted successfully',
            }),
        };

    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Add client error:', error);

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal server error',
                details: error.message
            }),
        };
    }
};
