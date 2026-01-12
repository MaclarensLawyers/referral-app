const { sql } = require('./lib/db');

/**
 * Get referred matters with optional date filtering
 * 
 * Query params:
 * - period: 'current_month' (default) or 'all'
 */
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
    
    try {
        const period = event.queryStringParameters?.period || 'current_month';
        
        let matters;
        
        if (period === 'all') {
            // Get all matters with their latest fee snapshot if available
            matters = await sql`
                SELECT 
                    rm.matter_id,
                    rm.matter_name,
                    rm.referrer_name,
                    rm.created_at,
                    fs.total_fees,
                    fs.fee_data,
                    fs.fetched_at
                FROM referred_matters rm
                LEFT JOIN LATERAL (
                    SELECT total_fees, fee_data, fetched_at
                    FROM fee_snapshots
                    WHERE matter_id = rm.matter_id
                    ORDER BY fetched_at DESC
                    LIMIT 1
                ) fs ON true
                ORDER BY rm.created_at DESC
            `;
        } else {
            // Get current month's matters
            matters = await sql`
                SELECT 
                    rm.matter_id,
                    rm.matter_name,
                    rm.referrer_name,
                    rm.created_at,
                    fs.total_fees,
                    fs.fee_data,
                    fs.fetched_at
                FROM referred_matters rm
                LEFT JOIN LATERAL (
                    SELECT total_fees, fee_data, fetched_at
                    FROM fee_snapshots
                    WHERE matter_id = rm.matter_id
                    ORDER BY fetched_at DESC
                    LIMIT 1
                ) fs ON true
                WHERE rm.created_at >= date_trunc('month', CURRENT_DATE)
                ORDER BY rm.created_at DESC
            `;
        }
        
        // Get referral percentage from settings
        const settings = await sql`
            SELECT value FROM settings WHERE key = 'referral_percentage'
        `;
        const referralPercentage = settings[0]?.value || '10';
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                matters,
                referralPercentage: parseFloat(referralPercentage),
                period,
            }),
        };
        
    } catch (error) {
        console.error('Get matters error:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
