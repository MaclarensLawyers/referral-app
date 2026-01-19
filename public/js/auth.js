/**
 * Authentication module using Netlify Identity
 *
 * This module must be loaded after the Netlify Identity widget script.
 * Include on all protected pages to handle authentication.
 */

// Wait for Netlify Identity to be ready
const authReady = new Promise((resolve) => {
    if (window.netlifyIdentity) {
        window.netlifyIdentity.on('init', (user) => resolve(user));
        window.netlifyIdentity.init();
    } else {
        // If widget not loaded, resolve with null
        resolve(null);
    }
});

/**
 * Get the current authenticated user
 * @returns {Object|null} User object or null if not authenticated
 */
function getUser() {
    return window.netlifyIdentity?.currentUser() || null;
}

/**
 * Get the current user's JWT token
 * @returns {Promise<string|null>} JWT token or null
 */
async function getToken() {
    const user = getUser();
    if (!user) return null;

    // Refresh token if needed and get current token
    try {
        const token = await user.jwt();
        return token;
    } catch (error) {
        console.error('Error getting token:', error);
        return null;
    }
}

/**
 * Check if the current user has admin role
 * @returns {boolean}
 */
function isAdmin() {
    const user = getUser();
    if (!user) return false;

    const roles = user.app_metadata?.roles || [];
    return roles.includes('admin');
}

/**
 * Log out the current user
 */
function logout() {
    window.netlifyIdentity?.logout();
}

/**
 * Open the login modal
 */
function openLogin() {
    window.netlifyIdentity?.open('login');
}

/**
 * Require authentication - redirect to login page if not authenticated
 * Call this at the top of protected page scripts
 * @param {string} [redirectUrl] - URL to redirect to after login (defaults to current page)
 */
async function requireAuth(redirectUrl) {
    await authReady;

    const user = getUser();
    if (!user) {
        // Store intended destination
        const destination = redirectUrl || window.location.pathname;
        sessionStorage.setItem('authRedirect', destination);
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

/**
 * Handle post-login redirect
 * Call this on the login page after successful login
 */
function handleLoginRedirect() {
    const redirect = sessionStorage.getItem('authRedirect') || '/';
    sessionStorage.removeItem('authRedirect');
    window.location.href = redirect;
}

/**
 * Create authorization headers for API calls
 * @returns {Promise<Object>} Headers object with Authorization
 */
async function getAuthHeaders() {
    const token = await getToken();
    if (!token) {
        throw new Error('Not authenticated');
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Make an authenticated fetch request
 * @param {string} url - The URL to fetch
 * @param {Object} [options] - Fetch options
 * @returns {Promise<Response>}
 */
async function authFetch(url, options = {}) {
    const headers = await getAuthHeaders();
    return fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
    });
}

/**
 * Update the page header with user info and logout button
 * Call this after auth is confirmed on protected pages
 */
function updateHeaderWithUser() {
    const user = getUser();
    if (!user) return;

    const nav = document.querySelector('header nav');
    if (!nav) return;

    // Remove existing user menu if present
    const existing = nav.querySelector('.user-menu');
    if (existing) existing.remove();

    // Create user menu
    const userMenu = document.createElement('div');
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
        <span class="user-email">${user.email}</span>
        ${isAdmin() ? '<span class="badge badge-admin">Admin</span>' : ''}
        <button class="btn btn-sm btn-logout" onclick="logout()">Log out</button>
    `;

    nav.appendChild(userMenu);
}

// Set up identity event handlers
if (window.netlifyIdentity) {
    window.netlifyIdentity.on('login', (user) => {
        // If on login page, redirect
        if (window.location.pathname === '/login.html') {
            handleLoginRedirect();
        } else {
            // Refresh the page to update UI
            window.location.reload();
        }
    });

    window.netlifyIdentity.on('logout', () => {
        window.location.href = '/login.html';
    });
}

// Export functions globally
window.auth = {
    getUser,
    getToken,
    isAdmin,
    logout,
    openLogin,
    requireAuth,
    handleLoginRedirect,
    getAuthHeaders,
    authFetch,
    updateHeaderWithUser,
    ready: authReady,
};

// Also export logout globally for onclick handlers
window.logout = logout;
