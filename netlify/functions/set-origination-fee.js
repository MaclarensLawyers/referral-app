/**
 * Queue an automation job to set origination fee in Actionstep
 * Called by Zapier when a new referred matter is created
 *
 * POST /api/set-origination-fee
 * Body:
 * {
 *   "matter_id": "12345",
 *   "client_participant_id": "67890",
 *   "referrer_staff_id": "789",
 *   "percentage": 10.00
 * }
 *
 * Returns:
 * {
 *   "success": true,
 *   "job_id": 123,
 *   "message": "Automation job queued"
 * }
 */

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
    // Allow POST requests only
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    const { matter_id, client_participant_id, referrer_name, percentage } = body;

    // Validate required fields
    if (!matter_id || !client_participant_id || !referrer_name || !percentage) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: 'Missing required fields',
                required: ['matter_id', 'client_participant_id', 'referrer_name', 'percentage']
            })
        };
    }

    // Validate percentage
    const percentageNum = parseFloat(percentage);
    if (isNaN(percentageNum) || percentageNum <= 0 || percentageNum > 100) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid percentage (must be between 0 and 100)' })
        };
    }

    try {
        const sql = neon(process.env.DATABASE_URL);

        // Check if job already exists for this matter
        const existing = await sql`
            SELECT id, status
            FROM automation_jobs
            WHERE matter_id = ${matter_id}
            ORDER BY created_at DESC
            LIMIT 1
        `;

        // If there's already a completed job, skip
        if (existing.length > 0 && existing[0].status === 'completed') {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    job_id: existing[0].id,
                    message: 'Origination fee already set for this matter',
                    skipped: true
                })
            };
        }

        // If there's a pending job, return existing
        if (existing.length > 0 && existing[0].status === 'pending') {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    job_id: existing[0].id,
                    message: 'Automation job already queued',
                    existing: true
                })
            };
        }

        // Create new automation job
        const result = await sql`
            INSERT INTO automation_jobs (
                matter_id,
                client_participant_id,
                referrer_name,
                origination_percentage,
                status
            ) VALUES (
                ${matter_id},
                ${client_participant_id},
                ${referrer_name},
                ${percentageNum},
                'pending'
            )
            RETURNING id
        `;

        const jobId = result[0].id;

        // Log the job creation
        await sql`
            INSERT INTO automation_logs (
                job_id,
                matter_id,
                client_participant_id,
                action,
                status,
                message,
                triggered_by
            ) VALUES (
                ${jobId},
                ${matter_id},
                ${client_participant_id},
                'job_queued',
                'success',
                'Automation job created and queued for processing',
                'zapier'
            )
        `;

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                job_id: jobId,
                message: 'Automation job queued successfully'
            })
        };

    } catch (error) {
        console.error('Error creating automation job:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to queue automation job',
                details: error.message
            })
        };
    }
};
