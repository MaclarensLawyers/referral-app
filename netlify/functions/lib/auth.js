/**
 * Authentication middleware for Netlify Identity
 *
 * Verifies JWT tokens and extracts user information.
 * When Netlify Identity is enabled, valid JWTs are automatically decoded
 * and available via event.clientContext.user
 */

class AuthError extends Error {
    constructor(message, statusCode = 401) {
        super(message);
        this.statusCode = statusCode;
    }
}

/**
 * Verify the request has a valid authenticated user
 * @param {Object} event - Netlify function event object
 * @returns {Object} User object with sub, email, app_metadata, user_metadata
 * @throws {AuthError} If not authenticated
 */
function verifyAuth(event) {
    // Netlify automatically decodes valid JWTs and populates clientContext.user
    const user = event.clientContext?.user;

    if (!user) {
        throw new AuthError('Authentication required');
    }

    return {
        id: user.sub,
        email: user.email,
        roles: user.app_metadata?.roles || [],
        metadata: user.user_metadata || {},
    };
}

/**
 * Verify the request has a valid admin user
 * @param {Object} event - Netlify function event object
 * @returns {Object} User object
 * @throws {AuthError} If not authenticated or not an admin
 */
function requireAdmin(event) {
    const user = verifyAuth(event);

    if (!user.roles.includes('admin')) {
        throw new AuthError('Admin access required', 403);
    }

    return user;
}

/**
 * Check if user has admin role (non-throwing version)
 * @param {Object} event - Netlify function event object
 * @returns {boolean}
 */
function isAdmin(event) {
    try {
        const user = verifyAuth(event);
        return user.roles.includes('admin');
    } catch {
        return false;
    }
}

/**
 * Handle auth errors and return appropriate HTTP response
 * @param {Error} error
 * @returns {Object} Netlify function response
 */
function handleAuthError(error) {
    if (error instanceof AuthError) {
        return {
            statusCode: error.statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message }),
        };
    }
    throw error;
}

module.exports = {
    AuthError,
    verifyAuth,
    requireAdmin,
    isAdmin,
    handleAuthError,
};
