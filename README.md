<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ChatScream

Browser-based multi-streaming studio (Vite + React + Firebase) with donation-triggered “Chat Screamer” overlays and AI-assisted stream copy.

## Local dev

**Prereqs:** Node 20+, Firebase CLI

1. Install deps: `npm install`
2. Configure env: copy `.env.example` → `.env` and fill in `VITE_FIREBASE_*` (and optional Stripe/AI values)
3. Run: `npm run dev`

## Build

- `npm run build` (outputs `dist/`)
- `npm run preview`

## Docker

Build and run a production image using the included Dockerfile:

- `docker build -t chatscream .`
- `docker run -p 8080:80 chatscream`

## Deploy

### Hosting (recommended while Functions secrets are missing)

- `firebase deploy --only hosting:production --project wtp-apps`

### Full deploy (Firestore + Functions + Hosting)

Functions deployment requires these Secret Manager entries to exist (or deployment fails validation):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `CLAUDE_API_KEY` (for server-side AI generation)

Set secrets (example):
- `firebase functions:secrets:set STRIPE_SECRET_KEY --project wtp-apps`
- `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project wtp-apps`
- `firebase functions:secrets:set YOUTUBE_CLIENT_ID --project wtp-apps`
- `firebase functions:secrets:set YOUTUBE_CLIENT_SECRET --project wtp-apps`
- `firebase functions:secrets:set FACEBOOK_APP_ID --project wtp-apps`
- `firebase functions:secrets:set FACEBOOK_APP_SECRET --project wtp-apps`
- `firebase functions:secrets:set TWITCH_CLIENT_ID --project wtp-apps`
- `firebase functions:secrets:set TWITCH_CLIENT_SECRET --project wtp-apps`
- `firebase functions:secrets:set CLAUDE_API_KEY --project wtp-apps`

Then deploy:
- `firebase deploy --project wtp-apps`
