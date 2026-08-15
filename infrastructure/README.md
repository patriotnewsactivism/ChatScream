# ChatScream Infrastructure

This directory has **two separate, unrelated AWS deployments** — pick the
right one, they don't substitute for each other.

## 1. App backend — start here

`infrastructure/aws/app-backend/` — a single EC2 instance running the actual
ChatScream server (auth, OAuth token exchange, and the WebSocket RTMP relay
that pushes to YouTube/Facebook/Twitch). **This is required for streaming to
work at all.** See `infrastructure/aws/app-backend/README.md`.

```bash
cp infrastructure/aws/app-backend/.env.aws.app.example infrastructure/aws/app-backend/.env.aws.app
# edit it, then:
./infrastructure/aws/app-backend/deploy-app-backend.sh
```

## 2. Stream worker fleet — optional, not built yet

`infrastructure/aws/deploy-stream-fleet.sh` — an autoscaling fleet of
standalone Nginx-RTMP/FFmpeg EC2 workers for the **Cloud Streaming
(VM-based)** feature: always-on, browser-independent encoding sessions. This
is on the roadmap but not implemented yet (see `TODO.md` §11) — the app
doesn't call any of this today. Deploying it will not make YouTube/Facebook
streaming work; only the app backend above does that.

```bash
cp infrastructure/aws/.env.aws.example infrastructure/aws/.env.aws
# edit it, then:
./infrastructure/aws/deploy-stream-fleet.sh
```

Full guide: `infrastructure/aws/README.md`
