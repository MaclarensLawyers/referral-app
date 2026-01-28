# Local Development Setup

This guide shows you how to run the app locally without deploying to Netlify.

## First Time Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Environment File

Copy the example environment file and fill in your values:

```bash
copy .env.example .env
```

Then edit `.env` with your actual credentials:

- **DATABASE_URL**: Your Neon PostgreSQL connection string
- **ACTIONSTEP_CLIENT_ID**: From Actionstep OAuth app
- **ACTIONSTEP_CLIENT_SECRET**: From Actionstep OAuth app
- **ACTIONSTEP_API_URL**: e.g., `https://api.actionstepstaging.com/api/rest`
- **AUTH0_DOMAIN**: Your Auth0 tenant (e.g., `your-tenant.auth0.com`)
- **AUTH0_AUDIENCE**: Your Auth0 API identifier
- **AUTH0_MGMT_CLIENT_ID**: Auth0 Management API client ID
- **AUTH0_MGMT_CLIENT_SECRET**: Auth0 Management API client secret

### 3. Inject Auth0 Configuration into HTML Files

Run the injection script to automatically update all HTML files with your Auth0 config from `.env`:

```bash
node inject-auth0.js
```

This replaces placeholders (`__AUTH0_DOMAIN__`, `__AUTH0_CLIENT_ID__`, `__AUTH0_AUDIENCE__`) with your actual values.

**IMPORTANT - Git Workflow:**
- After running this script, git will show HTML files as modified
- **DO NOT COMMIT THESE CHANGES**
- The modified HTML files are for local development only
- Keep the placeholders in git for production deployment
- Netlify's build process will inject production values automatically

## Running the Dev Server

```bash
npm run dev
```

The server will start at **http://localhost:8888**

You'll see:
- ✓ Which environment variables are loaded
- ✓ The local URL to access the app

## How It Works

- **Static files** are served from the `public/` directory
- **API requests** to `/api/*` are routed to Netlify functions in `netlify/functions/`
- **Environment variables** are loaded from `.env` file
- **Hot reloading**: Functions are reloaded on each request (no need to restart)

## Differences from Production

- Uses Express instead of Netlify's serverless infrastructure
- All functions run in the same Node process (not separate Lambda instances)
- No cold starts - functions are always warm
- Environment variables from `.env` instead of Netlify dashboard

## Troubleshooting

### "Function not found" errors
Make sure the function file exists in `netlify/functions/` and exports a `handler` function.

### Database connection errors
Check that your `DATABASE_URL` is correct and the database is accessible from your network.

### Auth0 errors
- Make sure you've updated the Auth0 config in the HTML files
- Check that your Auth0 domain, client ID, and audience are correct
- Verify you've added `http://localhost:8888` to your Auth0 allowed callback URLs

### Port already in use
If port 8888 is already in use, you can change it:

```bash
PORT=3000 npm run dev
```

## Alternative: Netlify CLI

If you prefer to use Netlify's official dev server:

```bash
npm run dev:netlify
```

This uses `netlify dev` but requires more setup and may be slower.
