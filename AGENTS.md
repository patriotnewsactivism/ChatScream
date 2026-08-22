# Repository Guidelines

ChatScream is a browser-based multi-streaming studio. Creators broadcast from a phone or laptop; the backend relays RTMP to YouTube/Twitch/Facebook/TikTok. The product USP is **Chat Screamer** donation overlays. Stack: React + Vite frontend, Express + WebSocket backend, Postgres/Redis identity, Stripe billing, Claude AI, optional AWS FFmpeg stream workers.

## Project Structure & Module Organization

| Path                       | Role                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ |
| `index.tsx`                | App bootstrap, React Router, lazy routes, auth provider                        |
| `App.tsx`                  | Main studio UI (compositor, destinations, overlays, go-live)                   |
| `pages/`                   | Route screens (landing, auth, dashboard, admin, guest, legal)                  |
| `components/`              | Reusable studio/UI blocks (PascalCase)                                         |
| `hooks/`                   | Studio behavior hooks (audio, captions, recording, mobile layout)              |
| `contexts/AuthContext.tsx` | Session/auth state via backend APIs                                            |
| `services/`                | Client API + domain logic (OAuth, streaming, Stripe, AI, WebRTC guests)        |
| `server/`                  | Express API (`app.js`), HTTP/WS entry (`index.js`), store, AI, Stripe webhooks |
| `server/db/schema.js`      | Drizzle schema for managed identity                                            |
| `server/data/runtime.json` | Local-only runtime fallback (not production source of truth)                   |
| `types.ts`                 | Shared frontend types                                                          |
| `api/`                     | Lightweight Vercel-compatible API shims (`index.js`, `all.js`)                 |
| `infrastructure/aws/`      | Stream-worker ASG deploy scripts (FFmpeg fleet)                                |
| `tests/e2e/`               | Playwright specs                                                               |
| `public/`                  | PWA manifest, service worker, icons                                            |
| `scripts/`                 | Deploy, migrate, autostart helpers                                             |

**Production split:** Vercel hosts the Vite frontend (`dist/`); Google Cloud Run runs `node server/index.js` (API + WebSockets + FFmpeg). See `DEPLOY.md`.

**Local ports:** Vite `3000` (proxies `/api` → `8787`); API/WebSocket `8787`.

## Build, Test, and Development Commands

Use **Node 20+**. FFmpeg must be on PATH for RTMP relay.

```bash
npm install                 # deps (repo may use .npmrc legacy-peer-deps)
cp .env.example .env       # then fill keys
npm run dev                # API + web (concurrently)
npm run dev:web            # Vite only
npm run dev:api            # API with --watch
npm run build              # production frontend → dist/
npm run start              # API only (serves dist/ if present)
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint .ts/.tsx
npm run test               # Vitest (jsdom; unit/integration)
npm run test -- --run      # single Vitest pass (CI-style)
npm run test:e2e           # Playwright chromium
npm run test:e2e:full      # all Playwright projects
npm run test:full          # lint + typecheck + unit + build + e2e
npm run db:push            # drizzle-kit push (managed identity schema)
npm run migrate:users      # one-shot runtime.json → Postgres
```

Minimum before shipping behavior changes: `npm run typecheck` and `npm run build`. Prefer `npm run test -- --run` for touched areas.

## Architecture Notes (do not break casually)

- **Auth / identity:** Default `IDENTITY_STORAGE_MODE=managed` — users/profiles in Postgres (`POSTGRES_URL`), sessions in Redis (`REDIS_URL`). Local-only override: `IDENTITY_STORAGE_MODE=local` (file store). Production needs SSL/TLS flags as in `.env.production.example`.
- **API client:** Frontend network calls go through `services/apiClient.ts` / `services/backend.ts`, not ad-hoc `fetch` in components.
- **AI:** Server-side only (`server/ai.js`). Do not put provider secrets in Vite client bundles; client uses `services/aiClient.ts` → backend routes.
- **Streaming path:** Browser MediaRecorder → WebSocket ingest → server FFmpeg → platform RTMP. WebSocket signaling: `/ws/signal/:roomId`; scream alerts use streamer rooms. Client WebSocket base must target the **API host** (Cloud Run), never the Vercel static origin.
- **OAuth:** Platform connect flows live in `services/oauthService.ts` + `server/app.js` (`/api/auth/oauth/*`). Secrets stay server-side; public client IDs may appear in env for start flows.
- **Billing:** Stripe Connect / subscriptions via `services/stripe.ts` and `server/webhooks/stripe.js`. Webhook path: `/api/webhooks/stripe`.
- **Plans:** Canonical names `free`, `starter`, `creator`, `pro` (older env names `expert`/`enterprise` still mapped in Vite config for back-compat).

## Coding Style & Naming Conventions

- TypeScript + React **functional components** and hooks; 2-space indent; trailing semicolons.
- **Files:** PascalCase components/pages; camelCase hooks/services/utils; shared types in `types.ts` (PascalCase type names).
- **Imports:** prefer `@/*` path alias (workspace root).
- **Colocate tests:** `*.test.ts(x)` next to code or under `__tests__/` in the same package area; e2e under `tests/e2e/`.
- Keep side effects and HTTP in `services/` or `server/`; UI components stay presentational where practical.
- Match existing patterns in the file you edit (Tailwind utility classes, Lucide icons, lazy routes).

## Testing Guidelines

- **Unit/integration:** Vitest + Testing Library; `vitest.setup.ts`; timeout 15s (bcrypt/auth server tests).
- **E2E:** Playwright; default base URL `http://127.0.0.1:4173` (override with `E2E_BASE_URL`).
- For streaming/auth/OAuth/billing changes, manually verify: login/signup/reset, OAuth connect/disconnect, start/stop stream, scream overlay, desktop + mobile layout.
- Do not add flaky network-dependent e2e without mocks or stable fixtures.

## Commit & Pull Request Guidelines

- Short imperative subjects: `fix oauth redirect`, `add api health check`.
- PRs: problem, solution, verification steps, env/deploy impact. UI changes: screenshots or short clips.
- Never commit `.env`, credentials, service account keys, or live secrets. Mirror new vars in `.env.example` (and `.env.production.example` when production-only).

## Security & Configuration Tips

- Restrict `CORS_ORIGINS` / `APP_BASE_URL` to trusted frontend origins (www variants are auto-added server-side).
- OAuth needs matching redirect URIs on each platform console and `AUTH_STATE_SECRET` for CSRF state.
- Media uploads: prefer S3-compatible storage in production; local `uploads/` is ephemeral on deploy.
- Health: `GET /api/health`, readiness `GET /api/ready` (used by Cloud Run).
- Rate limits apply on auth, scream, billing, and upload routes — preserve them when adding endpoints.

## Agent Working Notes

- Prefer editing existing modules over new abstractions; avoid drive-by refactors and unsolicited markdown docs.
- When changing deploy behavior, update `DEPLOY.md` / `vercel.json` / `Dockerfile` only as needed.
- Active product debt and streaming fix checklist live in `TODO.md` — check it before reinventing fixed work.
- Branch context often tracks live-testing fixes (`fix/*`); keep changes scoped to the reported issue.
  )
