# Railway Deployment Guide

Deploy ChatScream backend to Railway with full WebSocket support.

## Quick Start (Web UI)

1. Go to [railway.app](https://railway.app)
2. Click "New Project" â "Deploy from GitHub repo"
3. Select your `ChatScream` repository
4. Railway will auto-detect the `railway.json` configuration
5. Click "Deploy"
6. **IMPORTANT:** Add environment variables (see below) before deployment or redeploy after adding them

## Manual Setup (CLI)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

## Configure Environment Variables

After deployment, add these environment variables in Railway Dashboard:

### Required (Copy from your `.env.production`):

```bash
# Identity Storage
POSTGRES_URL=your_neon_connection_string
POSTGRES_SSL=true
REDIS_URL=your_upstash_connection_string
REDIS_TLS=true

# OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AUTH_STATE_SECRET=generate_a_random_secret

# Stripe (if using payments)
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Claude AI (optional)
CLAUDE_API_KEY=your_anthropic_api_key
```

### Optional:

```bash
IDENTITY_STORAGE_MODE=postgres  # Use Postgres instead of local files
```

## Get Your Railway URL

After deployment, Railway will provide a URL like:

```
https://chatscream-api.railway.app
```

## Update Frontend Config

1. Copy the Railway URL
2. Update `.env.production`:
   ```bash
   VITE_API_BASE_URL=https://chatscream-api.railway.app
   ```
3. Redeploy frontend to Vercel

## Custom Domain (Optional)

1. Go to Railway project â Settings â Domains
2. Add your custom domain: `api.chatscream.live`
3. Update DNS (Railway will provide instructions)
4. Update `.env.production`:
   ```bash
   VITE_API_BASE_URL=https://api.chatscream.live
   ```

## Verify Deployment

```bash
# Test health endpoint
curl https://your-app.railway.app/api/health

# Test WebSocket (guest signaling)
wscat -c wss://your-app.railway.app/ws/signal/test-room
```

## Features Enabled

â HTTP API (auth, users, payments)
â WebSockets (guest cameras, signaling)
â Long-running processes (FFmpeg, RTMP)
â Auto-SSL
â Auto-scaling
