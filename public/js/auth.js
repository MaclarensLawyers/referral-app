/**
 * Authentication module using Auth0 SPA SDK
 *
 * This module initializes Auth0 and provides authentication utilities.
 * Include on all pages that need authentication.
 *
 * Required configuration (set via window.auth0Config before loading):
 * - domain: Auth0 tenant domain
 * - clientId: Auth0 application client ID
 * - audience: Auth0 API audience (optional)
 */

// Auth0 client instance
let auth0Client = null;
let isAuthenticated = false;
let user = null;

/**
 * Initialize Auth0 client
 */
async function initAuth0() {
    const config = window.auth0Config;
    if (!config || !config.domain || !config.clientId) {
        console.error('Auth0 configuration missing. Set window.auth0Config before loading auth.js');
        return null;
    }

    try {
        auth0Client = await window.auth0.createAuth0Client({
            domain: config.domain,
            clientId: config.clientId,
            authorizationParams: {
                redirect_uri: window.location.origin + '/callback.html',
                audience: config.audience,
            },
            cacheLocation: 'localstorage',
        });

        // Check if returning from redirect
        const query = window.location.search;
        if (query.includes('code=') && query.includes('state=')) {
            await auth0Client.handleRedirectCallback();
            // Remove query params from URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Check authentication status
        isAuthenticated = await auth0Client.isAuthenticated();
        if (isAuthenticated) {
            user = await auth0Client.getUser();
        }

        return auth0Client;
    } catch (error) {
        console.error('Error initializing Auth0:', error);
        return null;
    }
}

// Initialize on load
const authReady = initAuth0();

/**
 * Get the current authenticated user
 * @returns {Object|null} User object or null if not authenticated
 */
function getUser() {
    return user;
}

/**
 * Get the current user's access token
 * @returns {Promise<string|null>} Access token or null
 */
async function getToken() {
    if (!auth0Client || !isAuthenticated) return null;

    try {
        const token = await auth0Client.getTokenSilently();
        return token;
    } catch (error) {
        console.error('Error getting token:', error);
        // If token refresh failed, may need to re-authenticate
        if (error.error === 'login_required') {
            isAuthenticated = false;
            user = null;
        }
        return null;
    }
}

/**
 * Check if the current user has admin role
 * Uses Auth0 RBAC roles from the token namespace
 * @returns {boolean}
 */
function isAdmin() {
    if (!user) return false;

    // Auth0 roles are in a namespaced claim
    // Ensure namespace ends with / for proper claim key format
    const config = window.auth0Config || {};
    let namespace = config.audience || `https://${config.domain}`;
    if (!namespace.endsWith('/')) {
        namespace += '/';
    }

    const roles = user[`${namespace}roles`] || user.roles || [];
    return roles.includes('admin');
}

/**
 * Log out the current user
 * @param {Object} options - Logout options
 * @param {string} options.returnTo - URL to redirect to after logout
 */
function logout(options = {}) {
    if (!auth0Client) return;

    auth0Client.logout({
        logoutParams: {
            returnTo: options.returnTo || window.location.origin + '/login.html',
        },
    });
}

/**
 * Redirect to login
 * @param {string} [redirectUrl] - URL to redirect to after login
 */
async function login(redirectUrl) {
    if (!auth0Client) return;

    // Store intended destination
    const destination = redirectUrl || window.location.pathname;
    sessionStorage.setItem('authRedirect', destination);

    await auth0Client.loginWithRedirect({
        authorizationParams: {
            redirect_uri: window.location.origin + '/callback.html',
        },
    });
}

/**
 * Require authentication - redirect to login page if not authenticated
 * Call this at the top of protected page scripts
 * @param {string} [redirectUrl] - URL to redirect to after login (defaults to current page)
 * @returns {Promise<boolean>}
 */
async function requireAuth(redirectUrl) {
    await authReady;

    if (!isAuthenticated) {
        await login(redirectUrl);
        return false;
    }
    return true;
}

/**
 * Handle post-login redirect (call from callback page)
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

// Export functions globally
window.auth = {
    getUser,
    getToken,
    isAdmin,
    logout,
    login,
    requireAuth,
    handleLoginRedirect,
    getAuthHeaders,
    authFetch,
    updateHeaderWithUser,
    ready: authReady,
};

// Also export logout globally for onclick handlers
window.logout = logout;
