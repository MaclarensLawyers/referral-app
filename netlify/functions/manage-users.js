const { requireAdmin, handleAuthError } = require('./lib/auth');

/**
 * User management endpoint - list, update roles, delete users
 *
 * GET: List all users
 * PATCH: Update user roles (add/remove admin)
 * DELETE: Delete/block user
 *
 * All operations require admin role
 */

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID;
const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET;

// Cache management API token
let mgmtToken = null;
let mgmtTokenExpiry = 0;

/**
 * Get Auth0 Management API access token
 */
async function getManagementToken() {
    // Return cached token if still valid (with 5 min buffer)
    if (mgmtToken && Date.now() < mgmtTokenExpiry - 300000) {
        return mgmtToken;
    }

    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: AUTH0_MGMT_CLIENT_ID,
            client_secret: AUTH0_MGMT_CLIENT_SECRET,
            audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Failed to get management token: ${error.error_description || response.status}`);
    }

    const data = await response.json();
    mgmtToken = data.access_token;
    mgmtTokenExpiry = Date.now() + (data.expires_in * 1000);
    return mgmtToken;
}

/**
 * Get user roles from Auth0
 */
async function getUserRoles(userId, token) {
    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/roles`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        return [];
    }

    return await response.json();
}

/**
 * Get all users from Auth0
 */
async function getAllUsers() {
    const token = await getManagementToken();

    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users?per_page=100&fields=user_id,email,name,created_at,last_login,blocked,email_verified`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Failed to fetch users: ${response.status}`);
    }

    const users = await response.json();

    // Get roles for each user
    const usersWithRoles = await Promise.all(
        users.map(async (user) => {
            const roles = await getUserRoles(user.user_id, token);
            return {
                ...user,
                roles: roles.map(r => r.name),
                is_admin: roles.some(r => r.name === 'admin'),
            };
        })
    );

    return usersWithRoles;
}

/**
 * Get role ID for admin role
 */
async function getAdminRoleId(token) {
    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/roles?name_filter=admin`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch admin role');
    }

    const roles = await response.json();
    const adminRole = roles.find(r => r.name === 'admin');

    if (!adminRole) {
        throw new Error('Admin role not found in Auth0. Please create it first.');
    }

    return adminRole.id;
}

/**
 * Add admin role to user
 */
async function makeAdmin(userId) {
    const token = await getManagementToken();
    const roleId = await getAdminRoleId(token);

    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/roles`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            roles: [roleId],
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to add admin role');
    }
}

/**
 * Remove admin role from user
 */
async function removeAdmin(userId) {
    const token = await getManagementToken();
    const roleId = await getAdminRoleId(token);

    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/roles`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            roles: [roleId],
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to remove admin role');
    }
}

/**
 * Delete user from Auth0
 */
async function deleteUser(userId) {
    const token = await getManagementToken();

    const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to delete user');
    }
}

exports.handler = async (event) => {
    try {
        // Require admin role for all operations
        const currentUser = await requireAdmin(event);

        // Check Auth0 configuration
        if (!AUTH0_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Auth0 not configured',
                }),
            };
        }

        // GET: List all users
        if (event.httpMethod === 'GET') {
            const users = await getAllUsers();

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users }),
            };
        }

        // PATCH: Update user roles
        if (event.httpMethod === 'PATCH') {
            const body = JSON.parse(event.body);
            const { user_id, action } = body;

            if (!user_id || !action) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'user_id and action required' }),
                };
            }

            // Prevent user from removing their own admin role
            if (action === 'remove_admin' && user_id === currentUser.id) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Cannot remove your own admin privileges' }),
                };
            }

            if (action === 'make_admin') {
                await makeAdmin(user_id);
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, message: 'User promoted to admin' }),
                };
            } else if (action === 'remove_admin') {
                await removeAdmin(user_id);
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, message: 'Admin privileges removed' }),
                };
            } else {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Invalid action. Must be "make_admin" or "remove_admin"' }),
                };
            }
        }

        // DELETE: Delete user
        if (event.httpMethod === 'DELETE') {
            const body = JSON.parse(event.body);
            const { user_id } = body;

            if (!user_id) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'user_id required' }),
                };
            }

            // Prevent user from deleting themselves
            if (user_id === currentUser.id) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Cannot delete your own account' }),
                };
            }

            await deleteUser(user_id);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: 'User deleted' }),
            };
        }

        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };

    } catch (error) {
        // Handle auth errors
        if (error.statusCode === 401 || error.statusCode === 403) {
            return handleAuthError(error);
        }

        console.error('Manage users error:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error', details: error.message }),
        };
    }
};
