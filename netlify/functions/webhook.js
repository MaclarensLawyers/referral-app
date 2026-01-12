const { sql } = require('./lib/db');

/**
 * Webhook endpoint to receive new referred matters from Zapier
 * 
 * Expected POST body:
 * {
 *   "matter_id": "12345",
 *   "matter_name": "Smith v Jones",
 *   "referrer_name": "Sarah Jones"
 * }
 */
exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
    
    try {
        const body = JSON.parse(event.body);
        
        // Validate required fields
        if (!body.matter_id || !body.referrer_name) {
            return {
                statusCode: 400,
                body: JSON.stringify({ 
                    error: 'Missing required fields: matter_id and referrer_name are required' 
                }),
            };
        }
        
        // Insert into database (upsert to handle duplicates)
        await sql`
            INSERT INTO referred_matters (matter_id, matter_name, referrer_name)
            VALUES (${body.matter_id}, ${body.matter_name || null}, ${body.referrer_name})
            ON CONFLICT (matter_id) DO UPDATE SET
                matter_name = EXCLUDED.matter_name,
                referrer_name = EXCLUDED.referrer_name
        `;
        
        console.log(`Stored referred matter: ${body.matter_id} (referrer: ${body.referrer_name})`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                message: `Matter ${body.matter_id} stored successfully` 
            }),
        };
        
    } catch (error) {
        console.error('Webhook error:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
