const { exchangeCodeForTokens, getAuthorizationUrl } = require('./lib/actionstep');

/**
 * Handle OAuth callback from Actionstep
 * Also handles initiating the OAuth flow via GET without code param
 */
exports.handler = async (event) => {
    try {
        const code = event.queryStringParameters?.code;
        const error = event.queryStringParameters?.error;
        
        // Handle OAuth errors
        if (error) {
            return {
                statusCode: 302,
                headers: {
                    Location: `/settings.html?auth_error=${encodeURIComponent(error)}`,
                },
                body: '',
            };
        }
        
        // If no code, redirect to Actionstep authorization
        if (!code) {
            const authUrl = getAuthorizationUrl();
            return {
                statusCode: 302,
                headers: {
                    Location: authUrl,
                },
                body: '',
            };
        }
        
        // Exchange code for tokens
        await exchangeCodeForTokens(code);
        
        // Redirect back to settings with success message
        return {
            statusCode: 302,
            headers: {
                Location: '/settings.html?auth_success=true',
            },
            body: '',
        };
        
    } catch (error) {
        console.error('Auth callback error:', error);
        
        return {
            statusCode: 302,
            headers: {
                Location: `/settings.html?auth_error=${encodeURIComponent(error.message)}`,
            },
            body: '',
        };
    }
};
