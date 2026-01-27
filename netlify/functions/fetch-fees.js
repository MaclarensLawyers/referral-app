const { sql } = require('./lib/db');
const { getTimeEntriesForMatter } = require('./lib/actionstep');
const { verifyAuth, handleAuthError } = require('./lib/auth');

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
        // Require authentication
        await verifyAuth(event);

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
                // Fetch time entries from Actionstep (includes owner/user data)
                const { timeentries, users, _linkedRaw } = await getTimeEntriesForMatter(matterId);
                
                // Debug logging
                console.log(`Matter ${matterId}: Found ${timeentries.length} time entries`);
                console.log(`Matter ${matterId}: Users map has ${Object.keys(users).length} entries`);
                if (timeentries.length > 0) {
                    console.log(`Matter ${matterId}: Sample entry:`, JSON.stringify(timeentries[0], null, 2));
                }
                if (_linkedRaw) {
                    console.log(`Matter ${matterId}: Linked data:`, JSON.stringify(_linkedRaw, null, 2));
                }
                
                // Calculate totals by fee earner
                const feeEarnerTotals = {};
                let totalFees = 0;
                
                timeentries.forEach(entry => {
                    // Use billableAmount directly from the API
                    const amount = parseFloat(entry.billableAmount) || 0;
                    
                    // Get owner ID from links, then look up the name
                    const ownerId = entry.links?.owner;
                    const ownerUser = ownerId ? users[ownerId] : null;
                    // User object typically has 'name' or 'firstName'/'lastName'
                    const ownerName = ownerUser 
                        ? (ownerUser.name || `${ownerUser.firstName || ''} ${ownerUser.lastName || ''}`.trim() || `User ${ownerId}`)
                        : 'Unknown';
                    
                    if (!feeEarnerTotals[ownerName]) {
                        feeEarnerTotals[ownerName] = 0;
                    }
                    feeEarnerTotals[ownerName] += amount;
                    totalFees += amount;
                });
                
                // Calculate referral amount
                const referralAmount = totalFees * (referralPercentage / 100);
                const adjustedTotal = totalFees - referralAmount;
                
                // Build fee earner breakdown (adjusted proportionally)
                const feeEarners = Object.entries(feeEarnerTotals).map(([name, amount]) => {
                    const originalPercentage = totalFees > 0 ? (amount / totalFees) * 100 : 0;
                    const adjustedAmount = totalFees > 0 ? (amount / totalFees) * adjustedTotal : 0;
                    // Calculate adjusted percentage (percentage of original total, so all percentages add to 100%)
                    const adjustedPercentage = totalFees > 0 ? (adjustedAmount / totalFees) * 100 : 0;

                    return {
                        name,
                        originalAmount: Math.round(amount * 100) / 100,
                        adjustedAmount: Math.round(adjustedAmount * 100) / 100,
                        originalPercentage: Math.round(originalPercentage * 100) / 100,
                        adjustedPercentage: Math.round(adjustedPercentage * 100) / 100,
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
                    time_entry_count: timeentries.length,
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
        // Handle user auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Fetch fees error:', error);

        // Check if it's an Actionstep auth error
        if (error.message.includes('No access token') || error.message.includes('re-authenticate')) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    error: 'Actionstep authentication required',
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
