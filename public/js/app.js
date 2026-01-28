/**
 * Referral App Frontend
 */

// State
let currentPeriod = 'current_month';
let matters = [];
let filteredMatters = [];
let referralPercentage = 10;
let fetchMethod = 'direct'; // 'direct' or 'zapier'
const pollingIntervals = new Map(); // Track active polls per matter

// Pagination state
let currentPage = 1;
const itemsPerPage = 15;

// Filter state
let selectedFeeEarner = '';
let selectedReferrer = '';

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
 * Apply filters to matters
 */
function applyFilters() {
    filteredMatters = matters.filter(matter => {
        // Filter by referrer
        if (selectedReferrer && matter.referrer_name !== selectedReferrer) {
            return false;
        }

        // Filter by fee earner
        if (selectedFeeEarner && matter.fee_data) {
            const hasFeeEarner = matter.fee_data.fee_earners?.some(
                earner => earner.name === selectedFeeEarner
            );
            if (!hasFeeEarner) return false;
        } else if (selectedFeeEarner && !matter.fee_data) {
            return false;
        }

        return true;
    });

    // Reset to page 1 when filters change
    currentPage = 1;
}

/**
 * Get unique referrers from matters
 */
function getUniqueReferrers() {
    const referrers = new Set();
    matters.forEach(matter => {
        if (matter.referrer_name) {
            referrers.add(matter.referrer_name);
        }
    });
    return Array.from(referrers).sort();
}

/**
 * Get unique fee earners from matters
 */
function getUniqueFeeEarners() {
    const feeEarners = new Set();
    matters.forEach(matter => {
        if (matter.fee_data?.fee_earners) {
            matter.fee_data.fee_earners.forEach(earner => {
                if (earner.name) {
                    feeEarners.add(earner.name);
                }
            });
        }
    });
    return Array.from(feeEarners).sort();
}

/**
 * Render filter controls
 */
function renderFilters() {
    const referrers = getUniqueReferrers();
    const feeEarners = getUniqueFeeEarners();

    const referrerSelect = document.getElementById('filter-referrer');
    const feeEarnerSelect = document.getElementById('filter-fee-earner');

    // Render referrer options
    referrerSelect.innerHTML = `
        <option value="">All Referrers</option>
        ${referrers.map(ref => `
            <option value="${ref}" ${selectedReferrer === ref ? 'selected' : ''}>${ref}</option>
        `).join('')}
    `;

    // Render fee earner options
    feeEarnerSelect.innerHTML = `
        <option value="">All Fee Earners</option>
        ${feeEarners.map(earner => `
            <option value="${earner}" ${selectedFeeEarner === earner ? 'selected' : ''}>${earner}</option>
        `).join('')}
    `;
}

/**
 * Render pagination controls
 */
function renderPagination() {
    const totalPages = Math.ceil(filteredMatters.length / itemsPerPage);
    const paginationEl = document.getElementById('pagination');

    if (totalPages <= 1) {
        paginationEl.style.display = 'none';
        return;
    }

    paginationEl.style.display = 'flex';

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
    }

    paginationEl.innerHTML = `
        <button class="btn btn-sm" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            Previous
        </button>
        <div style="display: flex; gap: 0.25rem; align-items: center;">
            ${pages.map(page => `
                <button
                    class="btn btn-sm ${page === currentPage ? 'btn-primary' : ''}"
                    onclick="changePage(${page})"
                    style="min-width: 2.5rem;"
                >
                    ${page}
                </button>
            `).join('')}
        </div>
        <button class="btn btn-sm" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Next
        </button>
    `;
}

/**
 * Change page
 */
function changePage(page) {
    const totalPages = Math.ceil(filteredMatters.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;

    currentPage = page;
    renderTable();
}

/**
 * Render table
 */
function renderTable() {
    if (matters.length === 0) {
        mattersTable.style.display = 'none';
        emptyState.style.display = 'block';
        fetchAllBtn.disabled = true;
        document.getElementById('download-csv-btn').disabled = true;
        return;
    }

    fetchAllBtn.disabled = false;
    document.getElementById('download-csv-btn').disabled = false;

    // Apply filters
    applyFilters();

    // Render filters
    renderFilters();

    if (filteredMatters.length === 0) {
        mattersTable.style.display = 'none';
        emptyState.innerHTML = '<h3>No matches found</h3><p>Try adjusting your filters.</p>';
        emptyState.style.display = 'block';
        return;
    }

    mattersTable.style.display = 'block';
    emptyState.style.display = 'none';

    // Calculate pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageMatters = filteredMatters.slice(startIndex, endIndex);

    // Render table rows
    tableBody.innerHTML = pageMatters.map(matter => `
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

    // Render pagination
    renderPagination();

    // Update record count
    document.getElementById('record-count').textContent =
        `Showing ${startIndex + 1}-${Math.min(endIndex, filteredMatters.length)} of ${filteredMatters.length} matters`;
}

/**
 * Download table as CSV
 */
function downloadCSV() {
    if (filteredMatters.length === 0) return;

    // CSV headers
    const headers = ['Matter ID', 'Matter Name', 'Referrer', 'Created', 'Total Fees', 'Fee Breakdown'];

    // CSV rows
    const rows = filteredMatters.map(matter => {
        const feeBreakdown = matter.fee_data
            ? matter.fee_data.fee_earners?.map(e => `${e.name}: ${formatCurrency(e.adjustedAmount)}`).join('; ') || ''
            : '';

        return [
            matter.matter_id,
            `"${(matter.matter_name || '').replace(/"/g, '""')}"`,
            `"${matter.referrer_name.replace(/"/g, '""')}"`,
            formatDate(matter.created_at),
            matter.total_fees || '',
            `"${feeBreakdown.replace(/"/g, '""')}"`
        ];
    });

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `referral-matters-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV file downloaded');
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

            // Reset pagination and filters when loading new data
            currentPage = 1;
            selectedFeeEarner = '';
            selectedReferrer = '';

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
