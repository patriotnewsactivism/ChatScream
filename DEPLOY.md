# ChatScream production deployment

ChatScream uses a split production architecture:

- **Vercel:** Vite/React frontend at `https://www.chatscream.live`
- **Google Cloud Run:** Express API, WebSockets, FFmpeg, and OAuth token exchange at `https://api.chatscream.live`
- **Postgres/Neon:** durable users, sessions, reset tokens, and viral-content schema
- **Redis:** optional session cache; Postgres remains the fallback

The frontend must never point its WebSocket or API traffic at the Vercel origin. Set
`VITE_API_BASE_URL=https://api.chatscream.live` for the Vercel production environment.

## Database migrations

The backend runs versioned, advisory-locked migrations during startup before it accepts traffic. A
failed migration prevents the Cloud Run revision from becoming ready.

Run the same migrations manually when validating a database:

```bash
npm run db:migrate
npm run db:verify
```

Both commands require `POSTGRES_URL` (or `DATABASE_URL`). Set `POSTGRES_SSL=true` for hosted
Postgres providers that require TLS.

`npm run migrate:users` is only for importing the legacy
`server/data/runtime.json` user file. It is idempotent, but it should only be run where that source
file exists.

## Cloud Run backend

Build the Dockerfile's `backend` target and deploy it to the existing Cloud Run service. The
container listens on the Cloud Run-provided `PORT` and includes FFmpeg.

Required production configuration:

```dotenv
NODE_ENV=production
IDENTITY_STORAGE_MODE=managed
POSTGRES_URL=<secret>
POSTGRES_SSL=true
REDIS_URL=<secret>
REDIS_TLS=true

APP_BASE_URL=https://www.chatscream.live
VITE_OAUTH_REDIRECT_URI=https://www.chatscream.live/oauth/callback
CORS_ORIGINS=https://chatscream.live,https://www.chatscream.live

YOUTUBE_CLIENT_ID=<secret-or-env>
YOUTUBE_CLIENT_SECRET=<secret>
FACEBOOK_APP_ID=<secret-or-env>
FACEBOOK_APP_SECRET=<secret>
FACEBOOK_GRAPH_API_VERSION=v26.0

AUTH_STATE_SECRET=<secret>
SESSION_SECRET=<secret>
```

Store secrets in Google Secret Manager and expose them to the Cloud Run revision. Do not commit
`.env` files.

After deployment, verify:

- `GET https://api.chatscream.live/api/health`
- `GET https://api.chatscream.live/api/ready`
- `GET https://api.chatscream.live/api/public/capabilities`

Readiness must report a usable identity store. Capabilities must show both YouTube and Facebook as
configured before the frontend enables their quick-connect actions.

## OAuth provider setup

Use this exact redirect URI for both providers:

```text
https://www.chatscream.live/oauth/callback
```

### Google / YouTube

1. Enable YouTube Data API v3 in the Google Cloud project.
2. Create a Web application OAuth client.
3. Add the exact redirect URI above.
4. Put the client ID and client secret in the Cloud Run service.
5. If the consent screen is in testing, add the intended broadcaster as a test user.

### Meta / Facebook Live

1. Configure Facebook Login on the Meta app and add the exact redirect URI above.
2. Configure the Live Video API product/feature.
3. Request the permissions used by ChatScream:
   `public_profile`, `email`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `pages_manage_metadata`, and `publish_video`.
4. Complete App Review / Live Video API access for accounts outside the app's developer roles.
5. Keep `FACEBOOK_GRAPH_API_VERSION` on a currently supported Graph API version.
6. Confirm the destination account or Page meets Meta's current Facebook Live eligibility rules.

ChatScream prefers Meta's `secure_stream_url` and splits that RTMPS URL into the FFmpeg server URL
and stream key on the backend.

## Vercel frontend

Configure the production environment and redeploy:

```dotenv
VITE_API_BASE_URL=https://api.chatscream.live
VITE_OAUTH_REDIRECT_URI=https://www.chatscream.live/oauth/callback
```

OAuth client secrets do not belong in Vercel's `VITE_*` variables. Token exchange happens only on
Cloud Run.

## Release checklist

- Database migrations and verification pass.
- Cloud Run revision is ready and FFmpeg is available.
- `/api/public/capabilities` reports YouTube and Facebook configured.
- Vercel's production bundle contains `https://api.chatscream.live`.
- YouTube connection opens a channel picker and creates a destination with a real ingest URL/key.
- Facebook connection opens the Page picker and creates a destination from an RTMPS URL.
- A short private test stream reaches each provider before a public event.
