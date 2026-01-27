const { sql } = require('./lib/db');

/**
 * Zapier webhook callback endpoint
 * Receives Actionstep data from Zapier, calculates fees, and stores snapshot
 *
 * POST body:
 * {
 *   "matter_id": "12345",
 *   "correlation_id": "uuid",
 *   "actionstep_response": "{\"timeentries\":[...],\"linked\":{\"participants\":[...]}}"
 * }
 *
 * Only time entries from lawyers (based on occupation) are counted.
 * Support staff time entries are excluded as they are treated as disbursements.
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

        // Validate required fields
        if (!body.matter_id || !body.correlation_id || !body.actionstep_response) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Missing required fields: matter_id, correlation_id, actionstep_response',
                }),
            };
        }

        const { matter_id, correlation_id } = body;

        // Parse the raw Actionstep response
        let actionstepData;
        try {
            // If actionstep_response is a string, parse it; if it's already an object, use it
            actionstepData = typeof body.actionstep_response === 'string'
                ? JSON.parse(body.actionstep_response)
                : body.actionstep_response;
        } catch (parseError) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Invalid actionstep_response: must be valid JSON',
                    details: parseError.message,
                }),
            };
        }

        // Extract timeentries and linked from the Actionstep response
        const timeentries = actionstepData.timeentries || [];
        const linked = actionstepData.linked || {};

        if (!Array.isArray(timeentries)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Invalid actionstep_response: timeentries must be an array',
                }),
            };
        }

        // Find pending snapshot with matching matter_id and correlation_id
        const snapshots = await sql`
            SELECT id, matter_id, correlation_id, fetch_status
            FROM fee_snapshots
            WHERE matter_id = ${matter_id}
              AND correlation_id = ${correlation_id}
              AND fetch_status = 'pending'
            ORDER BY fetched_at DESC
            LIMIT 1
        `;

        if (snapshots.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: 'No pending fetch found for this matter_id and correlation_id',
                }),
            };
        }

        const snapshot = snapshots[0];

        // Update status to processing
        await sql`
            UPDATE fee_snapshots
            SET fetch_status = 'processing'
            WHERE id = ${snapshot.id}
        `;

        // Extract participants from linked data
        const participants = {};
        if (linked.participants && Array.isArray(linked.participants)) {
            linked.participants.forEach(participant => {
                participants[participant.id] = participant;
            });
        }

        console.log(`Zapier callback for matter ${matter_id}: Found ${timeentries.length} time entries`);
        console.log(`Zapier callback for matter ${matter_id}: Participants map has ${Object.keys(participants).length} entries`);

        // Helper function to check if participant is a lawyer
        const isLawyer = (participant) => {
            if (!participant || !participant.occupation) return false;
            const occupation = participant.occupation.toUpperCase();
            return occupation.includes('MANAGING PARTNER') ||
                   occupation.includes('PARTNER') ||
                   occupation.includes('SOLICITOR') ||
                   occupation.includes('ASSOCIATE') ||
                   occupation.includes('LAWYER');
        };

        // Get referral percentage and referrer name
        const settings = await sql`
            SELECT value FROM settings WHERE key = 'referral_percentage'
        `;
        const referralPercentage = parseFloat(settings[0]?.value || '10');

        const referrerData = await sql`
            SELECT referrer_name
            FROM referred_matters
            WHERE matter_id = ${matter_id}
        `;
        const referrerName = referrerData[0]?.referrer_name || 'Unknown';

        // Calculate totals by fee earner (only lawyers)
        const feeEarnerTotals = {};
        let totalFees = 0;
        let lawyerTimeEntryCount = 0;

        timeentries.forEach(entry => {
            // Use billableAmount directly from the API
            const amount = parseFloat(entry.billableAmount) || 0;

            // Get owner ID from links, then look up the participant
            const ownerId = entry.links?.owner;
            const owner = ownerId ? participants[ownerId] : null;

            // Skip non-lawyers (support staff time entries are excluded)
            if (!owner || !isLawyer(owner)) {
                console.log(`Skipping time entry from non-lawyer: ${owner?.firstName} ${owner?.lastName} (${owner?.occupation})`);
                return;
            }

            // Build name from firstName and lastName
            const ownerName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || `Participant ${ownerId}`;

            if (!feeEarnerTotals[ownerName]) {
                feeEarnerTotals[ownerName] = 0;
            }
            feeEarnerTotals[ownerName] += amount;
            totalFees += amount;
            lawyerTimeEntryCount++;
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
                name: referrerName,
                amount: Math.round(referralAmount * 100) / 100,
                percentage: referrerRoundedPercentage,
            },
            total: Math.round(totalFees * 100) / 100,
            adjusted_total: Math.round(adjustedTotal * 100) / 100,
            time_entry_count: lawyerTimeEntryCount,
        };

        // Update snapshot with completed status and fee data
        await sql`
            UPDATE fee_snapshots
            SET fetch_status = 'completed',
                total_fees = ${totalFees},
                fee_data = ${JSON.stringify(feeData)},
                error_message = NULL
            WHERE id = ${snapshot.id}
        `;

        console.log(`Zapier callback completed for matter ${matter_id}`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                matter_id,
                fee_data: feeData,
            }),
        };

    } catch (error) {
        console.error('Zapier callback error:', error);

        // Try to update snapshot status to failed if we have the correlation_id
        try {
            const body = JSON.parse(event.body);
            if (body.matter_id && body.correlation_id) {
                await sql`
                    UPDATE fee_snapshots
                    SET fetch_status = 'failed',
                        error_message = ${error.message}
                    WHERE matter_id = ${body.matter_id}
                      AND correlation_id = ${body.correlation_id}
                      AND fetch_status IN ('pending', 'processing')
                `;
            }
        } catch (updateError) {
            console.error('Failed to update snapshot status:', updateError);
        }

        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                details: error.message,
            }),
        };
    }
};
