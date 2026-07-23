# ChatScream â Deployment Guide

**Architecture:** Vercel (React frontend) + Railway (Express/WebSocket backend + FFmpeg)

---

## 1. Railway â Backend

### One-time setup

1. Create a new Railway project and connect your GitHub repo.
2. Railway auto-detects Node.js via `nixpacks.toml` (FFmpeg included).
3. Set the following environment variables in **Railway â Variables**:

```
# ââ Required ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
NODE_ENV=production
PORT=8787

# Postgres (Railway â Add Plugin â PostgreSQL, then copy the URL)
POSTGRES_URL=postgresql://...
POSTGRES_SSL=true

# Redis (Railway â Add Plugin â Redis, then copy the URL)
REDIS_URL=redis://...
REDIS_TLS=true

# The public URL of your Vercel frontend (used for CORS + OAuth redirects)
APP_BASE_URL=https://chatscream.live
CORS_ORIGINS=https://chatscream.live,https://www.chatscream.live

# AI
ANTHROPIC_API_KEY=sk-ant-...

# ââ OAuth Secrets (backend only â never expose these to the frontend) ââ
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
AUTH_STATE_SECRET=<random 32+ char string>

# ââ Stripe (optional â leave blank to disable billing) ââ
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PRO_PRICE_ID=price_...
VITE_STRIPE_EXPERT_PRICE_ID=price_...
VITE_STRIPE_ENTERPRISE_PRICE_ID=price_...
```

4. **Deploy.** Railway runs `npm install --omit=dev` then `node server/index.js`.
5. After deploy, note your Railway public URL (e.g. `https://chatscream-production.up.railway.app`).

### WebSocket support

Railway supports WebSocket connections on the same port as HTTP â no extra config needed.

### Stripe webhook

In Stripe Dashboard â Developers â Webhooks, add an endpoint:

- URL: `https://<your-railway-url>/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## 2. Vercel â Frontend

### One-time setup

1. Import your repo in Vercel. Framework preset: **Vite**.
2. Build command: `npm run build` â Output dir: `dist`
3. Set the following environment variables in **Vercel â Settings â Environment Variables**:

```
# ââ Required ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
VITE_APP_ENV=production
VITE_DEBUG=false

# Your Railway backend URL (no trailing slash)
VITE_API_BASE_URL=https://chatscream-production.up.railway.app

# OAuth Public Client IDs (safe to expose â secrets stay on Railway)
VITE_YOUTUBE_CLIENT_ID=...
VITE_FACEBOOK_APP_ID=...
VITE_TWITCH_CLIENT_ID=...
VITE_TIKTOK_CLIENT_KEY=...

# Must match the redirect URI registered in each OAuth console (see Â§3)
VITE_OAUTH_REDIRECT_URI=https://chatscream.live/oauth/callback

# Stripe publishable key (safe to expose)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRO_PRICE_ID=price_...
VITE_STRIPE_EXPERT_PRICE_ID=price_...
VITE_STRIPE_ENTERPRISE_PRICE_ID=price_...
```

4. `vercel.json` is already configured with SPA rewrites and cache headers â no changes needed.

---

## 3. OAuth Console Setup

Register `https://chatscream.live/oauth/callback` as an authorized redirect URI in each platform's developer console:

| Platform         | Console URL                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Google / YouTube | [console.cloud.google.com](https://console.cloud.google.com) â APIs & Services â Credentials â OAuth 2.0 Client          |
| Facebook         | [developers.facebook.com](https://developers.facebook.com) â App â Facebook Login â Settings â Valid OAuth Redirect URIs |
| Twitch           | [dev.twitch.tv/console](https://dev.twitch.tv/console) â Your App â OAuth Redirect URLs                                  |
| TikTok           | [developers.tiktok.com](https://developers.tiktok.com) â App â Login Kit â Redirect URI                                  |

**Scopes required:**

- **YouTube:** `youtube`, `youtube.force-ssl`, `youtube.readonly`, `profile`, `email`
- **Facebook:** `public_profile`, `pages_show_list`, `pages_manage_posts`, `live_video`, `publish_video`
- **Twitch:** `user:read:email`, `channel:read:stream_key`, `channel:manage:broadcast`
- **TikTok:** `user.info.basic`, `live.room.manage`, `video.upload`

---

## 4. Custom Domain (optional)

1. In Vercel â Domains, add `chatscream.live` and `www.chatscream.live`.
2. Update Railway â Settings â Networking to add a custom domain for the API (e.g. `api.chatscream.live`).
3. Update `VITE_API_BASE_URL` in Vercel to `https://api.chatscream.live`.
4. Update `CORS_ORIGINS` on Railway to include your Vercel preview domains if needed.

---

## 5. First-Deploy Checklist

- [ ] Railway deploy succeeds â check `/api/health` returns `{"ok":true}`
- [ ] Railway deploy succeeds â check `/api/ready` returns `{"ok":true}` (Postgres + Redis connected)
- [ ] Vercel build succeeds (Vite output in `dist/`)
- [ ] Frontend loads and can reach the backend (`/api/health` call in Network tab)
- [ ] Sign up / sign in works
- [ ] OAuth flow works for at least one platform (YouTube recommended)
- [ ] WebSocket connects when clicking Go Live (check browser Console)
- [ ] FFmpeg spawns and stream reaches destination (check Railway logs)
- [ ] Stripe webhook test event delivers successfully

---

## 6. Local Development

```bash
# Copy and fill in env vars
cp .env.example .env

# Install deps
npm install

# Start backend (port 8787) + frontend (port 5173) together
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to `localhost:8787` automatically via `vite.config.ts`.

---

## 7. Single-Server Deploy (VPS / Fly.io / Render)

If you want one container instead of Railway + Vercel:

```bash
# Build the fullstack Docker image
docker build \
  --target fullstack \
  --build-arg VITE_API_BASE_URL="" \
  -t chatscream .

# Run it (replace env vars as needed)
docker run -p 8787:8787 \
  -e NODE_ENV=production \
  -e POSTGRES_URL=... \
  -e REDIS_URL=... \
  chatscream
```

Express will serve the built frontend from `dist/` and fall back to `index.html` for SPA routing.
