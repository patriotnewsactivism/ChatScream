# ChatScream Technical Context

## Project Overview

ChatScream is a browser-based multi-streaming studio. The web app captures media/layout, while backend APIs handle auth/session, access control, OAuth platform links, chat, analytics, billing endpoints, and cloud-streaming usage.

## Current Stack

- Frontend: React 19, Vite, TypeScript
- Backend: Node.js + Express (`server/index.js`)
- Data (current local/dev): file-backed runtime store (`server/store.js`)
- Infrastructure: Google Cloud (Cloud Run for app/API, Compute Engine VM for RTMP/HLS media plane)
- Payments: Stripe
- AI: Anthropic Claude + Google Gemini integrations via service wrappers
- Testing: Vitest + Playwright

## Project Layout

- `App.tsx`, `index.tsx`: app entry and routing
- `components/`: reusable UI (studio, overlays, auth, admin)
- `pages/`: route-level pages
- `contexts/`: app-wide context providers
- `services/`: API clients and domain services
- `server/`: API server + local data store
- `infrastructure/`: cloud setup and deployment scripts

## Development Commands

- Install: `npm install`
- Full dev (API + web): `npm run dev`
- API only: `npm run dev:api`
- Web only: `npm run dev:web`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Start production server: `npm run start`

## Deployment Model

- Cloud Run hosts the Node server and serves built frontend assets.
- Compute Engine VM hosts RTMP/HLS media services.
- Secrets are managed through Google Secret Manager.
