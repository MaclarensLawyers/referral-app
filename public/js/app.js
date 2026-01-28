/**
 * Referral App Frontend
 */

// State
let currentPeriod = 'current_month';
let matters = [];
let referralPercentage = 10;
let fetchMethod = 'direct'; // 'direct' or 'zapier'
const pollingIntervals = new Map(); // Track active polls per matter

// DOM Elements
const mattersTable = document.getElementById('matters-table');
const tableBody = document.getElementById('table-body');
const emptyState = document.getElementById('empty-state');
const fetchAllBtn = document.getElementById('fetch-all-btn');
const periodToggle = document.querySelectorAll('.toggle-group button');
const loadingIndicator = document.getElementById('loading');

/**
 * Format currency
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
    }).format(amount);
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Poll fetch status for a matter (used in Zapier mode)
 */
async function pollFetchStatus(matterId, button) {
    const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds
    let attempts = 0;

    const pollInterval = setInterval(async () => {
        attempts++;

        try {
            const headers = await auth.getAuthHeaders();
            const response = await fetch(`/api/fetch-status?matter_ids=${matterId}`, { headers });

            if (!response.ok) {
                throw new Error('Failed to fetch status');
            }

            const data = await response.json();
            const status = data.results?.[matterId];

            if (!status) {
                console.warn('No status found for matter:', matterId);
                return;
            }

            if (status.fetch_status === 'completed') {
                // Stop polling
                clearInterval(pollInterval);
                pollingIntervals.delete(matterId);

                // Update matter data
                const matterIndex = matters.findIndex(m => m.matter_id === matterId);
                if (matterIndex !== -1) {
                    matters[matterIndex].fee_data = status.fee_data;
                    matters[matterIndex].total_fees = status.total_fees;
                }

                // Re-render table
                renderTable();

                console.log('Fetch completed for matter:', matterId);
            } else if (status.fetch_status === 'failed') {
                // Stop polling
                clearInterval(pollInterval);
                pollingIntervals.delete(matterId);

                // Reset button
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Fetch';
                }

                // Show error
                toast.error(`Failed to fetch fees: ${status.error_message || 'Unknown error'}`);
            } else if (attempts >= maxAttempts) {
                // Timeout
                clearInterval(pollInterval);
                pollingIntervals.delete(matterId);

                // Reset button to retry
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Retry';
                }

                toast.error('Fetch timed out. Please try again.');
            }
        } catch (error) {
            console.error('Error polling status:', error);

            // Stop polling on error
            if (attempts >= 3) {
                clearInterval(pollInterval);
                pollingIntervals.delete(matterId);

                if (button) {
                    button.disabled = false;
                    button.textContent = 'Fetch';
                }
            }
        }
    }, 2000); // Poll every 2 seconds

    // Store interval reference
    pollingIntervals.set(matterId, pollInterval);
}

/**
 * Render fee breakdown HTML
 */
function renderFeeBreakdown(feeData) {
    if (!feeData) return '<span class="cell-empty">Not fetched</span>';
    
    let html = '<div class="fee-breakdown">';
    
    // Fee earners
    if (feeData.fee_earners && feeData.fee_earners.length > 0) {
        feeData.fee_earners.forEach(earner => {
            // Use adjustedPercentage if available (new format), fallback to percentage (old format)
            const percentage = earner.adjustedPercentage !== undefined ? earner.adjustedPercentage : earner.percentage;
            html += `
                <div class="fee-earner">
                    <span>${earner.name}</span>
                    <span>${formatCurrency(earner.adjustedAmount)} (${Math.round(percentage)}%)</span>
                </div>
            `;
        });
    }
    
    // Referrer
    if (feeData.referrer) {
        html += `
            <div class="fee-referrer">
                <span>${feeData.referrer.name} (Referrer)</span>
                <span>${formatCurrency(feeData.referrer.amount)} (${Math.round(feeData.referrer.percentage)}%)</span>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

/**
 * Render table
 */
function renderTable() {
    if (matters.length === 0) {
        mattersTable.style.display = 'none';
        emptyState.style.display = 'block';
        fetchAllBtn.disabled = true;
        return;
    }
    
    mattersTable.style.display = 'block';
    emptyState.style.display = 'none';
    fetchAllBtn.disabled = false;
    
    tableBody.innerHTML = matters.map(matter => `
        <tr data-matter-id="${matter.matter_id}">
            <td class="cell-mono">${matter.matter_id}</td>
            <td>${matter.matter_name || '<span class="cell-muted">—</span>'}</td>
            <td>${matter.referrer_name}</td>
            <td class="cell-muted">${formatDate(matter.created_at)}</td>
            <td class="cell-amount">${matter.total_fees ? formatCurrency(matter.total_fees) : '<span class="cell-empty">—</span>'}</td>
            <td>${renderFeeBreakdown(matter.fee_data)}</td>
            <td>
                <button class="btn btn-sm" onclick="fetchFeesForMatter('${matter.matter_id}')" ${matter.fee_data ? 'title="Refresh"' : ''}>
                    ${matter.fee_data ? 'Refresh' : 'Fetch'}
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Load matters from API
 */
async function loadMatters() {
    loadingIndicator.style.display = 'flex';

    try {
        const headers = await auth.getAuthHeaders();

        // Fetch both matters and settings in parallel
        const [mattersResponse, settingsResponse] = await Promise.all([
            fetch(`/api/get-matters?period=${currentPeriod}`, { headers }),
            fetch('/api/settings', { headers })
        ]);

        if (mattersResponse.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        const mattersData = await mattersResponse.json();
        const settingsData = await settingsResponse.json();

        if (mattersResponse.ok) {
            matters = mattersData.matters;
            referralPercentage = mattersData.referralPercentage;

            // Store fetch method from settings
            fetchMethod = settingsData.fetch_method || 'direct';

            renderTable();
        } else {
            console.error('Error loading matters:', mattersData.error);
            toast.error('Failed to load matters: ' + mattersData.error);
        }
    } catch (error) {
        console.error('Error loading matters:', error);
        toast.error('Failed to load matters. Please check your connection.');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

/**
 * Fetch fees for a single matter
 */
async function fetchFeesForMatter(matterId) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        const headers = await auth.getAuthHeaders();
        const response = await fetch('/api/fetch-fees', {
            method: 'POST',
            headers,
            body: JSON.stringify({ matter_id: matterId }),
        });

        const data = await response.json();

        if (response.status === 401) {
            // Check if it's user auth or Actionstep auth
            if (data.error === 'Authentication required') {
                window.location.href = '/login.html';
            } else {
                toast.error('Please connect to Actionstep first. Go to Settings to authenticate.');
            }
            return;
        }

        if (response.ok && data.results && data.results.length > 0) {
            const result = data.results[0];

            // Check if this is a pending Zapier fetch
            if (result.status === 'pending') {
                // Keep button disabled and show fetching state
                btn.textContent = 'Fetching...';
                // Start polling for status
                pollFetchStatus(matterId, btn);
                return; // Don't reset button yet
            }

            // Direct mode - update immediately
            const matterIndex = matters.findIndex(m => m.matter_id === matterId);
            if (matterIndex !== -1) {
                matters[matterIndex].fee_data = result.fee_data;
                matters[matterIndex].total_fees = result.fee_data.total;
            }
            renderTable();
        } else if (data.errors && data.errors.length > 0) {
            toast.error('Error fetching fees: ' + data.errors[0].error);
        }
    } catch (error) {
        console.error('Error fetching fees:', error);
        toast.error('Failed to fetch fees. Please try again.');
    } finally {
        // Only reset button if not in pending state (for Zapier mode)
        if (btn.textContent !== 'Fetching...') {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

/**
 * Fetch fees for all matters
 */
async function fetchAllFees() {
    if (matters.length === 0) return;

    fetchAllBtn.disabled = true;
    fetchAllBtn.innerHTML = '<span class="spinner"></span> Fetching...';

    try {
        const matterIds = matters.map(m => m.matter_id);

        const headers = await auth.getAuthHeaders();
        const response = await fetch('/api/fetch-fees', {
            method: 'POST',
            headers,
            body: JSON.stringify({ matter_ids: matterIds }),
        });

        const data = await response.json();

        if (response.status === 401) {
            if (data.error === 'Authentication required') {
                window.location.href = '/login.html';
            } else {
                toast.error('Please connect to Actionstep first. Go to Settings to authenticate.');
            }
            return;
        }

        if (response.ok) {
            // Update local state with results
            data.results.forEach(result => {
                const matterIndex = matters.findIndex(m => m.matter_id === result.matter_id);
                if (matterIndex !== -1) {
                    matters[matterIndex].fee_data = result.fee_data;
                    matters[matterIndex].total_fees = result.fee_data.total;
                }
            });

            renderTable();

            if (data.errors && data.errors.length > 0) {
                toast.info(`Fetched ${data.results.length} matters. ${data.errors.length} failed.`);
            } else {
                toast.success(`Successfully fetched fees for ${data.results.length} matters.`);
            }
        }
    } catch (error) {
        console.error('Error fetching all fees:', error);
        toast.error('Failed to fetch fees. Please try again.');
    } finally {
        fetchAllBtn.disabled = false;
        fetchAllBtn.innerHTML = 'Fetch All Fees';
    }
}

/**
 * Handle period toggle
 */
function handlePeriodChange(period) {
    currentPeriod = period;
    
    periodToggle.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    
    loadMatters();
}

/**
 * Initialize
 */
document.addEventListener('DOMContentLoaded', () => {
    // Set up period toggle
    periodToggle.forEach(btn => {
        btn.addEventListener('click', () => handlePeriodChange(btn.dataset.period));
    });

    // Set up fetch all button
    fetchAllBtn.addEventListener('click', fetchAllFees);

    // Load initial data
    loadMatters();
});

/**
 * Cleanup polling intervals on page unload
 */
window.addEventListener('beforeunload', () => {
    pollingIntervals.forEach((interval, matterId) => {
        clearInterval(interval);
    });
    pollingIntervals.clear();
});

// Export for inline onclick handlers
window.fetchFeesForMatter = fetchFeesForMatter;
