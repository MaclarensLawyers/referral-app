/**
 * Job Processor
 * Polls database for pending jobs and processes them
 */

const { neon } = require('@neondatabase/serverless');
const ActionstepBot = require('./actionstep-bot');

class JobProcessor {
    constructor(config) {
        this.sql = neon(config.databaseUrl);
        this.bot = new ActionstepBot({
            username: config.actionstepUsername,
            password: config.actionstepPassword,
            totpSecret: config.actionstepTotpSecret, // Add TOTP secret
            baseUrl: config.actionstepUrl,
            headless: config.headless
        });
        this.pollInterval = config.pollInterval || 30000; // Default 30 seconds
        this.maxConcurrent = config.maxConcurrent || 1;
        this.isRunning = false;
        this.isProcessing = false;
    }

    /**
     * Start the job processor
     */
    async start() {
        console.log('[Processor] Starting automation worker...');
        console.log(`[Processor] Poll interval: ${this.pollInterval / 1000}s`);
        console.log(`[Processor] Max concurrent jobs: ${this.maxConcurrent}`);

        // Initialize bot (login to Actionstep)
        try {
            await this.bot.init();
        } catch (error) {
            console.error('[Processor] Failed to initialize bot:', error.message);
            throw error;
        }

        this.isRunning = true;

        // Start polling loop
        this.poll();

        console.log('[Processor] Worker started successfully');
    }

    /**
     * Polling loop
     */
    async poll() {
        while (this.isRunning) {
            try {
                if (!this.isProcessing) {
                    await this.processNextJob();
                }
            } catch (error) {
                console.error('[Processor] Error in polling loop:', error.message);
            }

            // Wait before next poll
            await this.sleep(this.pollInterval);
        }
    }

    /**
     * Process the next pending job
     */
    async processNextJob() {
        try {
            // Get next pending job
            const jobs = await this.sql`
                SELECT
                    id,
                    matter_id,
                    client_participant_id,
                    referrer_name,
                    origination_percentage,
                    attempts,
                    max_attempts
                FROM automation_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
            `;

            if (jobs.length === 0) {
                // No pending jobs
                return;
            }

            const job = jobs[0];
            console.log(`\n[Processor] Processing job ${job.id} for matter ${job.matter_id}...`);

            // Mark as processing
            this.isProcessing = true;
            await this.updateJobStatus(job.id, 'processing');

            try {
                // Process the job
                await this.processJob(job);

                // Mark as completed
                await this.updateJobStatus(job.id, 'completed');
                await this.logSuccess(job);

                console.log(`[Processor] Job ${job.id} completed successfully`);

            } catch (error) {
                console.error(`[Processor] Job ${job.id} failed:`, error.message);

                // Check if browser crashed
                if (error.message.includes('Target closed') ||
                    error.message.includes('Session closed') ||
                    error.message.includes('Browser closed')) {
                    console.error('[Processor] Browser crashed or closed, restarting...');
                    try {
                        await this.bot.close();
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                    await this.bot.init();
                    console.log('[Processor] Browser restarted successfully');
                }

                // Increment attempts
                const newAttempts = job.attempts + 1;

                if (newAttempts >= job.max_attempts) {
                    // Max attempts reached, mark as failed
                    await this.updateJobStatus(job.id, 'failed', error.message);
                    await this.logError(job, error);
                    console.log(`[Processor] Job ${job.id} failed permanently after ${newAttempts} attempts`);
                } else {
                    // Retry later
                    await this.sql`
                        UPDATE automation_jobs
                        SET
                            status = 'pending',
                            attempts = ${newAttempts},
                            error_message = ${error.message}
                        WHERE id = ${job.id}
                    `;
                    await this.logWarning(job, `Attempt ${newAttempts} failed, will retry: ${error.message}`);
                    console.log(`[Processor] Job ${job.id} will retry (attempt ${newAttempts}/${job.max_attempts})`);
                }
            }

        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single job
     */
    async processJob(job) {
        // Check session is still valid (re-login if expired)
        await this.bot.ensureLoggedIn();

        // Navigate to matter
        await this.bot.navigateToMatter(job.matter_id);

        // Take a screenshot for debugging
        await this.bot.screenshot(`screenshots/matter-${job.matter_id}-before.png`);

        // Set origination fee
        const percentage = parseFloat(job.origination_percentage);
        await this.bot.setOriginationFee(job.referrer_name, percentage);

        // Take another screenshot
        await this.bot.screenshot(`screenshots/matter-${job.matter_id}-after.png`);

        // Wait a moment to ensure save completes
        await this.sleep(2000);
    }

    /**
     * Update job status
     */
    async updateJobStatus(jobId, status, errorMessage = null) {
        if (status === 'completed') {
            await this.sql`
                UPDATE automation_jobs
                SET
                    status = ${status},
                    completed_at = NOW(),
                    error_message = NULL
                WHERE id = ${jobId}
            `;
        } else if (status === 'processing') {
            await this.sql`
                UPDATE automation_jobs
                SET
                    status = ${status},
                    started_at = NOW()
                WHERE id = ${jobId}
            `;
        } else {
            await this.sql`
                UPDATE automation_jobs
                SET
                    status = ${status},
                    error_message = ${errorMessage},
                    completed_at = ${status === 'failed' ? 'NOW()' : null}
                WHERE id = ${jobId}
            `;
        }
    }

    /**
     * Log success
     */
    async logSuccess(job) {
        await this.sql`
            INSERT INTO automation_logs (
                job_id,
                matter_id,
                client_participant_id,
                action,
                status,
                message,
                triggered_by
            ) VALUES (
                ${job.id},
                ${job.matter_id},
                ${job.client_participant_id},
                'origination_fee_set',
                'success',
                ${`Origination fee set to ${job.origination_percentage}% for ${job.referrer_name}`},
                'automation'
            )
        `;
    }

    /**
     * Log error
     */
    async logError(job, error) {
        await this.sql`
            INSERT INTO automation_logs (
                job_id,
                matter_id,
                client_participant_id,
                action,
                status,
                message,
                error_details,
                triggered_by
            ) VALUES (
                ${job.id},
                ${job.matter_id},
                ${job.client_participant_id},
                'failed',
                'error',
                'Failed to set origination fee',
                ${error.message},
                'automation'
            )
        `;
    }

    /**
     * Log warning
     */
    async logWarning(job, message) {
        await this.sql`
            INSERT INTO automation_logs (
                job_id,
                matter_id,
                client_participant_id,
                action,
                status,
                message,
                triggered_by
            ) VALUES (
                ${job.id},
                ${job.matter_id},
                ${job.client_participant_id},
                'retry',
                'warning',
                ${message},
                'automation'
            )
        `;
    }

    /**
     * Stop the processor
     */
    async stop() {
        console.log('[Processor] Stopping worker...');
        this.isRunning = false;

        // Wait for current job to finish
        while (this.isProcessing) {
            await this.sleep(1000);
        }

        // Close browser
        await this.bot.close();

        console.log('[Processor] Worker stopped');
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = JobProcessor;
