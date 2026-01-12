const { neon } = require('@neondatabase/serverless');

// Initialize database connection
// Set DATABASE_URL in Netlify environment variables
const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
