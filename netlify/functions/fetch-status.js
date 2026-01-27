const { sql } = require('./lib/db');
const { verifyAuth, handleAuthError } = require('./lib/auth');

/**
 * Get fetch status for one or more matters
 * Used by frontend to poll for async fetch completion
 *
 * GET /api/fetch-status?matter_ids=12345,67890
 *
 * Returns latest snapshot status for each matter
 */
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Require authentication
        await verifyAuth(event);

        const matterIdsParam = event.queryStringParameters?.matter_ids;

        if (!matterIdsParam) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing matter_ids query parameter' }),
            };
        }

        // Parse comma-separated matter IDs
        const matterIds = matterIdsParam.split(',').map(id => id.trim()).filter(Boolean);

        if (matterIds.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No valid matter IDs provided' }),
            };
        }

        // Query latest snapshot for each matter using DISTINCT ON
        const snapshots = await sql`
            SELECT DISTINCT ON (matter_id)
                matter_id,
                fetch_status,
                correlation_id,
                error_message,
                fee_data,
                total_fees,
                fetched_at
            FROM fee_snapshots
            WHERE matter_id = ANY(${matterIds})
            ORDER BY matter_id, fetched_at DESC
        `;

        // Build result map
        const results = {};
        snapshots.forEach(snapshot => {
            results[snapshot.matter_id] = {
                matter_id: snapshot.matter_id,
                fetch_status: snapshot.fetch_status,
                correlation_id: snapshot.correlation_id,
                error_message: snapshot.error_message,
                fee_data: snapshot.fee_data,
                total_fees: snapshot.total_fees ? parseFloat(snapshot.total_fees) : null,
                fetched_at: snapshot.fetched_at,
            };
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results }),
        };

    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Fetch status error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                details: error.message,
            }),
        };
    }
};
