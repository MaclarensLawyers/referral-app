/**
 * View automation logs and job status
 *
 * GET /api/automation-logs
 * Query params:
 *   - limit: number of logs to return (default 100)
 *   - status: filter by status (success, error, warning)
 *   - matter_id: filter by matter ID
 */

const { neon } = require('@neondatabase/serverless');
const { verifyToken } = require('./lib/auth');

exports.handler = async (event) => {
    // Verify authentication
    const authResult = verifyToken(event);
    if (!authResult.valid) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: authResult.error })
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const sql = neon(process.env.DATABASE_URL);

    try {
        const limit = parseInt(event.queryStringParameters?.limit) || 100;
        const status = event.queryStringParameters?.status;
        const matterId = event.queryStringParameters?.matter_id;

        // Build query based on filters
        let logs;
        if (matterId) {
            logs = await sql`
                SELECT * FROM automation_logs
                WHERE matter_id = ${matterId}
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
        } else if (status) {
            logs = await sql`
                SELECT * FROM automation_logs
                WHERE status = ${status}
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
        } else {
            logs = await sql`
                SELECT * FROM automation_logs
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
        }

        // Get job statistics
        const stats = await sql`
            SELECT
                status,
                COUNT(*) as count
            FROM automation_jobs
            GROUP BY status
        `;

        const statsMap = {};
        stats.forEach(s => {
            statsMap[s.status] = parseInt(s.count);
        });

        // Get recent jobs
        const recentJobs = await sql`
            SELECT
                j.id,
                j.matter_id,
                j.client_participant_id,
                j.referrer_name,
                j.origination_percentage,
                j.status,
                j.error_message,
                j.attempts,
                j.created_at,
                j.completed_at,
                c.client_name
            FROM automation_jobs j
            LEFT JOIN referred_clients c ON j.client_participant_id = c.client_participant_id
            ORDER BY j.created_at DESC
            LIMIT 50
        `;

        return {
            statusCode: 200,
            body: JSON.stringify({
                logs,
                stats: {
                    pending: statsMap.pending || 0,
                    processing: statsMap.processing || 0,
                    completed: statsMap.completed || 0,
                    failed: statsMap.failed || 0,
                    total: Object.values(statsMap).reduce((sum, count) => sum + count, 0)
                },
                recent_jobs: recentJobs.map(job => ({
                    ...job,
                    origination_percentage: parseFloat(job.origination_percentage)
                }))
            })
        };

    } catch (error) {
        console.error('Error fetching automation logs:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to fetch logs',
                details: error.message
            })
        };
    }
};
