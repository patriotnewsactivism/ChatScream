# ChatScream production deployment

ChatScream uses a split production architecture:

- **Vercel:** Vite/React frontend at `https://www.chatscream.live`
- **Google Cloud Run:** Express API, WebSockets, FFmpeg, OAuth token exchange at `https://api.chatscream.live`
- **Google Secret Manager:** backend OAuth/client secrets
- **Postgres/Neon:** durable users, sessions, reset tokens, and viral-content schema
- **Redis:** optional session cache; Postgres remains the fallback
- **GitHub Actions + Google Workload Identity Federation:** keyless production administration

The frontend must never point API or WebSocket traffic at the Vercel origin. Production uses
`VITE_API_BASE_URL=https://api.chatscream.live`.

## Google Cloud production identity

No downloadable Google service-account key is required. GitHub exchanges its short-lived OIDC token
for the limited service account below:

```text
Workload Identity Provider:
projects/584450564662/locations/global/workloadIdentityPools/chatscream-github/providers/chatscream-main

Service account:
chatscream-cloud-ops@chat-scream.iam.gserviceaccount.com

Control/OAuth project:
chat-scream (584450564662)

Production Cloud Run project:
chatscream (288776423417)

Service / region:
chatscream-backend / us-central1
```

Do not recreate `GCP_SA_KEY`. The old static-key deployment path has been retired.

## Phone/manual deployment

Use **Deploy backend to Cloud Run** in GitHub Actions, type `deploy`, and run the workflow. It:

1. authenticates to Google with short-lived OIDC;
2. builds the Dockerfile `backend` target;
3. pushes the image to Artifact Registry;
4. deploys `chatscream-backend`;
5. verifies `/api/health`, `/api/ready`, and the YouTube destination callback.

## Chat-driven cloud operations

`ops/control-plane/request.json` is the command queue for the allowlisted **Cloud Ops Controller**.
A request committed to `main` authenticates to Google using OIDC, performs the approved action, and
writes a sanitized result to `ops/control-plane/result.json`. Secret values and raw Cloud Run logs
are never written to the public repository.

Supported actions:

- `status`
- `health_check`
- `oauth_verify`
- `secret_audit`
- `cost_guard`
- `restart_backend`
- `set_traffic_latest`
- `deploy_backend`

The production controller runs only from `main`; pull-request workflows must not receive
`id-token: write`.

## Database migrations

The backend runs versioned, advisory-locked migrations during startup before accepting traffic. A
failed migration prevents the Cloud Run revision from becoming ready.

For manual validation:

```bash
npm run db:migrate
npm run db:verify
```

Both commands require `POSTGRES_URL` (or `DATABASE_URL`). Set `POSTGRES_SSL=true` where required.
`npm run migrate:users` is only for importing the legacy `server/data/runtime.json` source.

## OAuth configuration

Google account sign-in and YouTube destination OAuth use separate credential pairs.

Cloud Run contains the public IDs as normal environment variables:

```text
GOOGLE_CLIENT_ID
YOUTUBE_CLIENT_ID
```

Their matching secrets are Secret Manager references:

```text
GOOGLE_CLIENT_SECRET  -> chatscream-google-client-secret
YOUTUBE_CLIENT_SECRET -> chatscream-youtube-client-secret
```

Client secrets must never be placed in Vercel `VITE_*` variables or committed to GitHub.

The YouTube destination callback is:

```text
https://api.chatscream.live/api/auth/oauth/google/callback
```

The frontend callback page is:

```text
https://www.chatscream.live/oauth/callback
```

## Production verification

After a deployment verify:

- `GET https://api.chatscream.live/api/health`
- `GET https://api.chatscream.live/api/ready`
- `GET https://api.chatscream.live/api/public/capabilities`
- Google sign-in uses the dedicated Google credential pair.
- YouTube connection uses the dedicated YouTube credential pair.
- Facebook quick-connect is enabled only when its backend credentials and permissions are valid.
- A short private stream reaches each provider before a public event.
