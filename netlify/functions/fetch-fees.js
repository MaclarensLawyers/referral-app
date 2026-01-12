const { sql } = require('./lib/db');
const { getTimeEntriesForMatter } = require('./lib/actionstep');

/**
 * Fetch fee data from Actionstep for specified matters
 * 
 * POST body:
 * {
 *   "matter_ids": ["12345", "67890"]
 * }
 * 
 * Or fetch for a single matter:
 * {
 *   "matter_id": "12345"
 * }
 */
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
    
    try {
        const body = JSON.parse(event.body);
        
        // Handle single matter_id or array of matter_ids
        let matterIds = body.matter_ids || (body.matter_id ? [body.matter_id] : []);
        
        if (matterIds.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No matter IDs provided' }),
            };
        }
        
        // Get referral percentage
        const settings = await sql`
            SELECT value FROM settings WHERE key = 'referral_percentage'
        `;
        const referralPercentage = parseFloat(settings[0]?.value || '10');
        
        // Get referrer names for these matters
        const referrerData = await sql`
            SELECT matter_id, referrer_name 
            FROM referred_matters 
            WHERE matter_id = ANY(${matterIds})
        `;
        const referrerMap = {};
        referrerData.forEach(row => {
            referrerMap[row.matter_id] = row.referrer_name;
        });
        
        const results = [];
        const errors = [];
        
        for (const matterId of matterIds) {
            try {
                // Fetch time entries from Actionstep
                const timeEntries = await getTimeEntriesForMatter(matterId);
                
                // Calculate totals by fee earner
                const feeEarnerTotals = {};
                let totalFees = 0;
                
                timeEntries.forEach(entry => {
                    // Use billable amount if available, otherwise calculate from rate and hours
                    const amount = entry.billableAmount || 
                                   (entry.billableHours * entry.rate) || 
                                   entry.amount || 0;
                    
                    const ownerName = entry.ownerName || entry.owner || 'Unknown';
                    
                    if (!feeEarnerTotals[ownerName]) {
                        feeEarnerTotals[ownerName] = 0;
                    }
                    feeEarnerTotals[ownerName] += parseFloat(amount);
                    totalFees += parseFloat(amount);
                });
                
                // Calculate referral amount
                const referralAmount = totalFees * (referralPercentage / 100);
                const adjustedTotal = totalFees - referralAmount;
                
                // Build fee earner breakdown (adjusted proportionally)
                const feeEarners = Object.entries(feeEarnerTotals).map(([name, amount]) => {
                    const originalPercentage = totalFees > 0 ? (amount / totalFees) * 100 : 0;
                    const adjustedAmount = totalFees > 0 ? (amount / totalFees) * adjustedTotal : 0;
                    
                    return {
                        name,
                        originalAmount: Math.round(amount * 100) / 100,
                        adjustedAmount: Math.round(adjustedAmount * 100) / 100,
                        percentage: Math.round(originalPercentage * 100) / 100,
                    };
                });
                
                const feeData = {
                    fee_earners: feeEarners,
                    referrer: {
                        name: referrerMap[matterId] || 'Unknown',
                        amount: Math.round(referralAmount * 100) / 100,
                        percentage: referralPercentage,
                    },
                    total: Math.round(totalFees * 100) / 100,
                    adjusted_total: Math.round(adjustedTotal * 100) / 100,
                };
                
                // Store snapshot in database
                await sql`
                    INSERT INTO fee_snapshots (matter_id, total_fees, fee_data)
                    VALUES (${matterId}, ${totalFees}, ${JSON.stringify(feeData)})
                `;
                
                results.push({
                    matter_id: matterId,
                    success: true,
                    fee_data: feeData,
                });
                
            } catch (matterError) {
                console.error(`Error fetching fees for matter ${matterId}:`, matterError);
                errors.push({
                    matter_id: matterId,
                    error: matterError.message,
                });
            }
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                results,
                errors,
                referralPercentage,
            }),
        };
        
    } catch (error) {
        console.error('Fetch fees error:', error);
        
        // Check if it's an auth error
        if (error.message.includes('No access token') || error.message.includes('re-authenticate')) {
            return {
                statusCode: 401,
                body: JSON.stringify({ 
                    error: 'Authentication required', 
                    message: 'Please connect to Actionstep in Settings',
                }),
            };
        }
        
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
