const { sql } = require('./lib/db');
const { getTimeEntriesForMatter } = require('./lib/actionstep');
const { verifyAuth, handleAuthError } = require('./lib/auth');
const crypto = require('crypto');

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
        
        // Get referral percentage and fetch method settings
        const settings = await sql`
            SELECT key, value FROM settings
            WHERE key IN ('referral_percentage', 'fetch_method', 'zapier_fetch_url')
        `;
        const settingsMap = {};
        settings.forEach(row => {
            settingsMap[row.key] = row.value;
        });
        const referralPercentage = parseFloat(settingsMap.referral_percentage || '10');
        const fetchMethod = settingsMap.fetch_method || 'direct';
        const zapierFetchUrl = settingsMap.zapier_fetch_url || '';
        
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
                // Check if using Zapier mode
                if (fetchMethod === 'zapier') {
                    // Validate Zapier URL is configured
                    if (!zapierFetchUrl) {
                        errors.push({
                            matter_id: matterId,
                            error: 'Zapier fetch URL not configured in Settings',
                        });
                        continue;
                    }

                    // Generate correlation ID for tracking this request
                    const correlationId = crypto.randomUUID();

                    // Insert pending snapshot
                    await sql`
                        INSERT INTO fee_snapshots (matter_id, fetch_status, correlation_id, total_fees, fee_data)
                        VALUES (${matterId}, 'pending', ${correlationId}, 0, '{}')
                    `;

                    // Prepare callback URL
                    const callbackUrl = `${process.env.APP_URL}/.netlify/functions/zapier-fetch-callback`;

                    // POST to Zapier webhook
                    try {
                        const zapierResponse = await fetch(zapierFetchUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                matter_id: matterId,
                                correlation_id: correlationId,
                                callback_url: callbackUrl,
                            }),
                        });

                        if (!zapierResponse.ok) {
                            throw new Error(`Zapier webhook returned ${zapierResponse.status}`);
                        }

                        results.push({
                            matter_id: matterId,
                            status: 'pending',
                            correlation_id: correlationId,
                        });

                    } catch (zapierError) {
                        console.error(`Error posting to Zapier for matter ${matterId}:`, zapierError);

                        // Mark snapshot as failed
                        await sql`
                            UPDATE fee_snapshots
                            SET fetch_status = 'failed',
                                error_message = ${zapierError.message}
                            WHERE matter_id = ${matterId}
                              AND correlation_id = ${correlationId}
                        `;

                        errors.push({
                            matter_id: matterId,
                            error: `Failed to trigger Zapier webhook: ${zapierError.message}`,
                        });
                    }

                    continue; // Skip to next matter
                }

                // Direct mode - fetch time entries from Actionstep (includes owner/user data)
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
                const feeEarnersData = Object.entries(feeEarnerTotals).map(([name, amount]) => {
                    const originalPercentage = totalFees > 0 ? (amount / totalFees) * 100 : 0;
                    const adjustedAmount = totalFees > 0 ? (amount / totalFees) * adjustedTotal : 0;
                    // Calculate adjusted percentage (percentage of original total, so all percentages add to 100%)
                    const adjustedPercentage = totalFees > 0 ? (adjustedAmount / totalFees) * 100 : 0;

                    return {
                        name,
                        originalAmount: Math.round(amount * 100) / 100,
                        adjustedAmount: Math.round(adjustedAmount * 100) / 100,
                        originalPercentage: Math.round(originalPercentage * 100) / 100,
                        adjustedPercentageExact: adjustedPercentage,
                    };
                });

                // Round percentages so they sum to 100% using largest remainder method
                const allItems = [
                    ...feeEarnersData.map((fe, idx) => ({
                        type: 'feeEarner',
                        index: idx,
                        percentage: fe.adjustedPercentageExact
                    })),
                    { type: 'referrer', percentage: referralPercentage }
                ];

                // Calculate floor values and remainders
                allItems.forEach(item => {
                    item.floor = Math.floor(item.percentage);
                    item.remainder = item.percentage - item.floor;
                });

                // Calculate how many 1% increments we need to distribute
                const sumFloor = allItems.reduce((sum, item) => sum + item.floor, 0);
                const diff = 100 - sumFloor;

                // Sort by remainder descending and distribute the difference
                allItems.sort((a, b) => b.remainder - a.remainder);
                for (let i = 0; i < diff && i < allItems.length; i++) {
                    allItems[i].rounded = allItems[i].floor + 1;
                }
                for (let i = diff; i < allItems.length; i++) {
                    allItems[i].rounded = allItems[i].floor;
                }

                // Apply rounded percentages back to fee earners
                const feeEarners = feeEarnersData.map((fe, idx) => {
                    const item = allItems.find(item => item.type === 'feeEarner' && item.index === idx);
                    return {
                        ...fe,
                        adjustedPercentage: item.rounded,
                    };
                });

                // Get rounded referrer percentage
                const referrerItem = allItems.find(item => item.type === 'referrer');
                const referrerRoundedPercentage = referrerItem.rounded;
                
                const feeData = {
                    fee_earners: feeEarners,
                    referrer: {
                        name: referrerMap[matterId] || 'Unknown',
                        amount: Math.round(referralAmount * 100) / 100,
                        percentage: referrerRoundedPercentage,
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
