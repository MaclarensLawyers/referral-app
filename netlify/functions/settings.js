const { sql } = require('./lib/db');
const { getTokens } = require('./lib/actionstep');
const { verifyAuth, requireAdmin, handleAuthError } = require('./lib/auth');

/**
 * Get or update app settings
 *
 * GET: Retrieve current settings (requires auth)
 * POST: Update settings (requires admin)
 */
exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'GET') {
            // Require authentication for viewing settings
            verifyAuth(event);
            // Get current settings
            const settings = await sql`
                SELECT key, value FROM settings 
                WHERE key IN ('referral_percentage')
            `;
            
            const settingsObj = {};
            settings.forEach(row => {
                settingsObj[row.key] = row.value;
            });
            
            // Check if Actionstep is connected
            const tokens = await getTokens();
            const isConnected = !!tokens.access_token;
            
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referral_percentage: parseFloat(settingsObj.referral_percentage || '10'),
                    actionstep_connected: isConnected,
                }),
            };
        }
        
        if (event.httpMethod === 'POST') {
            // Require admin for modifying settings
            requireAdmin(event);

            const body = JSON.parse(event.body);
            
            if (body.referral_percentage !== undefined) {
                const percentage = parseFloat(body.referral_percentage);
                
                if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error: 'Invalid percentage. Must be between 0 and 100.' }),
                    };
                }
                
                await sql`
                    INSERT INTO settings (key, value, updated_at)
                    VALUES ('referral_percentage', ${percentage.toString()}, NOW())
                    ON CONFLICT (key) DO UPDATE SET 
                        value = EXCLUDED.value,
                        updated_at = NOW()
                `;
            }
            
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true }),
            };
        }
        
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
        
    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Settings error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
