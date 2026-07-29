# QWEN.md — ChatScream Project Guide

> Instructional context for AI agents working in this repository. Read this before making changes.

## Project Overview

**ChatScream** is a browser-based multi-streaming studio. Creators broadcast from a phone or laptop; the backend relays RTMP to YouTube, Twitch, Facebook, and TikTok. The product USP is **Chat Screamer** — donation-triggered overlay alerts that get more obnoxious with higher donation tiers.

Cloud offload means the creator's upload bandwidth is not the bottleneck: the browser sends one stream to the server, which re-encodes via FFmpeg and pushes constant-bitrate RTMP to each platform.

**Tech stack:** React 19 + Vite (TypeScript) frontend · Express + WebSocket backend · Postgres (Drizzle ORM) + Redis for identity/sessions · Stripe billing · Anthropic Claude AI (server-side) · FFmpeg for RTMP relay · AWS EC2 Auto Scaling for stream workers.

**Production split:** Vercel hosts the Vite frontend (`dist/`); Railway runs `node server/index.js` (API + WebSockets + FFmpeg). See `DEPLOY.md` and `RAILWAY_DEPLOYMENT.md`.

## Architecture

### Frontend (`./`)

| Path                       | Role                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `index.tsx`                | App bootstrap, React Router, lazy routes, AuthProvider                  |
| `App.tsx`                  | Main studio UI (compositor, destinations, overlays, go-live)            |
| `pages/`                   | Route screens (landing, auth, dashboard, admin, guest, legal)           |
| `components/`              | Reusable studio/UI blocks (PascalCase)                                  |
| `hooks/`                   | Studio behavior hooks (audio, captions, recording, mobile layout)       |
| `contexts/AuthContext.tsx` | Session/auth state via backend APIs                                     |
| `services/`                | Client API + domain logic (OAuth, streaming, Stripe, AI, WebRTC guests) |
| `types.ts`                 | Shared frontend types (Platform enum, Destination, SceneSource, etc.)   |

### Backend (`server/`)

| Path                        | Role                                                                       |
| --------------------------- | -------------------------------------------------------------------------- |
| `server/index.js`           | HTTP + WebSocket entry point (port 8787)                                   |
| `server/app.js`             | Express API (~3900 lines — all REST routes)                                |
| `server/store.js`           | Identity storage abstraction (managed Postgres/Redis or local file)        |
| `server/db/schema.js`       | Drizzle schema: `users`, `sessions`, `passwordResetTokens`, `viralContent` |
| `server/ai.js`              | Server-side AI calls (Claude/Gemini)                                       |
| `server/webhooks/stripe.js` | Stripe webhook handler (`/api/webhooks/stripe`)                            |
| `server/auth/`              | Auth utilities                                                             |
| `server/data/runtime.json`  | Local-only runtime fallback (NOT production source of truth)               |

### Deployment shims (`api/`)

`api/index.js` and `api/all.js` are Vercel-compatible serverless shims that mount the Express app from `server/app.js`.

## Building and Running

**Requires Node.js 20+ and FFmpeg on PATH** (for RTMP relay).

```bash
npm install                 # deps (repo uses .npmrc legacy-peer-deps)
cp .env.example .env        # then fill keys
npm run dev                 # API + web concurrently (Vite 3000, API 8787)
npm run dev:web             # Vite only
npm run dev:api             # API only with --watch
npm run build               # production frontend → dist/
npm run start               # API only (serves dist/ if present)
npm run typecheck           # tsc --noEmit
npm run lint                # ESLint .ts/.tsx
npm run format              # Prettier write
npm run test                # Vitest (jsdom; unit/integration)
npm run test -- --run       # single Vitest pass (CI-style)
npm run test:e2e            # Playwright chromium
npm run test:e2e:full       # all Playwright projects (chromium, firefox, webkit, mobile)
npm run test:full           # lint + typecheck + unit + build + e2e
npm run db:push             # drizzle-kit push (managed identity schema)
npm run migrate:users       # one-shot runtime.json → Postgres migration
```

**Minimum before shipping behavior changes:** `npm run typecheck` and `npm run build`. Prefer `npm run test -- --run` for touched areas.

**Local ports:** Vite serves on `3000` and proxies `/api` → `8787`. The backend API + WebSocket server runs on `8787`.

## Key Architecture Invariants (do not break casually)

### Auth / Identity

- Default `IDENTITY_STORAGE_MODE=managed` — users/profiles in Postgres (`POSTGRES_URL`), sessions in Redis (`REDIS_URL`).
- Local-only override: `IDENTITY_STORAGE_MODE=local` (file store via `server/data/runtime.json`).
- Production requires SSL/TLS flags (`POSTGRES_SSL=true`, `REDIS_TLS=true`).
- Password reset tokens stored in a dedicated Drizzle table with expiry + single-use.

### API Client

- Frontend network calls go through `services/apiClient.ts` / `services/backend.ts`, not ad-hoc `fetch` in components.

### AI

- Server-side only (`server/ai.js`). **Never** put provider secrets in Vite client bundles; client uses `services/aiClient.ts` → backend routes.

### Streaming Pipeline

- Browser MediaRecorder → WebSocket ingest → server FFmpeg → platform RTMP.
- WebSocket signaling: `/ws/signal/:roomId` for WebRTC guest cameras.
- Scream alerts use per-streamer rooms (keyed by `streamerUid`); the Stripe webhook broadcasts to these rooms when a donation is paid.
- **Client WebSocket base must target the API host (Railway), never the Vercel static origin.**

### OAuth

- Platform connect flows live in `services/oauthService.ts` + `server/app.js` (`/api/auth/oauth/*`).
- Secrets stay server-side; public client IDs may appear in env for start flows.
- `AUTH_STATE_SECRET` signs OAuth state parameters for CSRF protection.
- Supported platforms: YouTube (Google), Facebook, Twitch, TikTok.

### Billing

- Stripe Connect / subscriptions via `services/stripe.ts` and `server/webhooks/stripe.js`.
- Webhook path: `/api/webhooks/stripe`.
- **Plans:** Canonical names `free`, `starter`, `creator`, `pro`. Older env names `expert`/`enterprise` are mapped in Vite config for back-compat.

## Coding Style & Conventions

- **TypeScript + React functional components and hooks**; 2-space indent; trailing semicolons.
- **Files:** PascalCase components/pages; camelCase hooks/services/utils; shared types in `types.ts` (PascalCase type names).
- **Imports:** prefer `@/*` path alias (workspace root, configured in `tsconfig.json` and `vite.config.ts`).
- **Colocate tests:** `*.test.ts(x)` next to code or under `__tests__/` in the same package area; e2e under `tests/e2e/`.
- Keep side effects and HTTP in `services/` or `server/`; UI components stay presentational where practical.
- Match existing patterns in the file you edit (Tailwind utility classes, Lucide icons, lazy routes).
- **Comments:** default to none. Only add a comment when the _why_ cannot be conveyed through naming or structure.
- Husky pre-commit hooks + lint-staged enforce ESLint/Prettier on staged `.ts/.tsx` files.

## Testing

- **Unit/integration:** Vitest + Testing Library; `vitest.setup.ts`; jsdom environment; timeout 15s (bcrypt/auth server tests). Excludes `tests/e2e/**` and `dist/**`.
- **E2E:** Playwright; default base URL `http://127.0.0.1:4173` (override with `E2E_BASE_URL`). Projects: chromium, firefox, webkit, Mobile Chrome, Mobile Safari. CI: `forbidOnly`, 2 retries, 1 worker.
- For streaming/auth/OAuth/billing changes, manually verify: login/signup/reset, OAuth connect/disconnect, start/stop stream, scream overlay, desktop + mobile layout.
- Do not add flaky network-dependent e2e without mocks or stable fixtures.

## Environment Configuration

Copy `.env.example` → `.env`. Key groups:

- **OAuth credentials** (Google/YouTube, Facebook, Twitch, TikTok) — both public IDs and backend secrets.
- **Managed identity:** `POSTGRES_URL`, `REDIS_URL`, `IDENTITY_STORAGE_MODE=managed`.
- **Stripe:** publishable key + secret key + webhook secret + price IDs per plan.
- **AI:** `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` (server-side); `GEMINI_API_KEY` (legacy backup).
- **S3-compatible media storage** (optional but recommended in production).
- Never commit `.env`. Mirror new vars in `.env.example` (and `.env.production.example` when production-only).

## Security & Configuration Tips

- Restrict `CORS_ORIGINS` / `APP_BASE_URL` to trusted frontend origins (www variants are auto-added server-side).
- OAuth needs matching redirect URIs on each platform console and `AUTH_STATE_SECRET` for CSRF state.
- Media uploads: prefer S3-compatible storage in production; local `uploads/` is ephemeral on deploy.
- Rate limits apply on auth, scream, billing, and upload routes — preserve them when adding endpoints.
- Health: `GET /api/health`, readiness `GET /api/ready` (used by Railway).

## Known Gaps & Active Work

- `TODO.md` is a living audit of post-login feature gaps and streaming fixes — check it before reinventing fixed work.
- Branch context often tracks live-testing fixes (`fix/*`); keep changes scoped to the reported issue.
- Notable incomplete areas: Facebook token refresh, per-destination FFmpeg error recovery, server-side recording, scene persistence, real platform chat integration, cloud streaming backend (currently mock).
