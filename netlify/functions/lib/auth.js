/**
 * Authentication middleware for Auth0
 *
 * Verifies Auth0 JWT tokens and extracts user information.
 * Tokens are validated using the Auth0 JWKS endpoint.
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Auth0 configuration from environment variables
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// JWKS client for fetching Auth0 public keys
let client = null;

function getJwksClient() {
    if (!client && AUTH0_DOMAIN) {
        client = jwksClient({
            jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 600000, // 10 minutes
        });
    }
    return client;
}

class AuthError extends Error {
    constructor(message, statusCode = 401) {
        super(message);
        this.statusCode = statusCode;
    }
}

/**
 * Get signing key from Auth0 JWKS
 */
function getKey(header, callback) {
    const jwks = getJwksClient();
    if (!jwks) {
        callback(new Error('Auth0 not configured'));
        return;
    }
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

/**
 * Verify JWT token and return decoded payload
 */
function verifyToken(token) {
    return new Promise((resolve, reject) => {
        if (!AUTH0_DOMAIN) {
            reject(new AuthError('Auth0 not configured'));
            return;
        }

        const options = {
            algorithms: ['RS256'],
            issuer: `https://${AUTH0_DOMAIN}/`,
        };

        // Add audience verification if configured
        if (AUTH0_AUDIENCE) {
            options.audience = AUTH0_AUDIENCE;
        }

        jwt.verify(token, getKey, options, (err, decoded) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    reject(new AuthError('Token expired'));
                } else if (err.name === 'JsonWebTokenError') {
                    reject(new AuthError('Invalid token'));
                } else {
                    reject(new AuthError(`Token verification failed: ${err.message}`));
                }
                return;
            }
            resolve(decoded);
        });
    });
}

/**
 * Extract bearer token from Authorization header
 */
function extractToken(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
        return null;
    }

    return parts[1];
}

/**
 * Verify the request has a valid authenticated user
 * @param {Object} event - Netlify function event object
 * @returns {Promise<Object>} User object with sub, email, roles, metadata
 * @throws {AuthError} If not authenticated
 */
async function verifyAuth(event) {
    const token = extractToken(event);

    if (!token) {
        throw new AuthError('Authentication required');
    }

    const decoded = await verifyToken(token);

    // Extract user info from Auth0 token
    // Auth0 tokens use different claim namespaces
    // Ensure namespace ends with / for proper claim key format
    let namespace = AUTH0_AUDIENCE || `https://${AUTH0_DOMAIN}`;
    if (!namespace.endsWith('/')) {
        namespace += '/';
    }

    return {
        id: decoded.sub,
        email: decoded.email || decoded[`${namespace}email`],
        roles: decoded[`${namespace}roles`] || decoded.roles || [],
        metadata: decoded[`${namespace}user_metadata`] || decoded.user_metadata || {},
    };
}

/**
 * Verify the request has a valid admin user
 * @param {Object} event - Netlify function event object
 * @returns {Promise<Object>} User object
 * @throws {AuthError} If not authenticated or not an admin
 */
async function requireAdmin(event) {
    const user = await verifyAuth(event);

    if (!user.roles.includes('admin')) {
        throw new AuthError('Admin access required', 403);
    }

    return user;
}

/**
 * Check if user has admin role (non-throwing version)
 * @param {Object} event - Netlify function event object
 * @returns {Promise<boolean>}
 */
async function isAdmin(event) {
    try {
        const user = await verifyAuth(event);
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
