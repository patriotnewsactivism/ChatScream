# Repository Guidelines

## Project Structure & Module Organization
- `index.tsx` boots the Vite/React app; `App.tsx` coordinates streaming UI, media layout, and routing.
- `components/` holds reusable UI blocks (CanvasCompositor, ChatStreamOverlay, MediaBin, DestinationManager, etc.); `pages/` contains route-level screens.
- `contexts/AuthContext.tsx` manages Firebase auth/session state; shared enums and types live in `types.ts`.
- `services/` wraps external SDKs (Firebase, Stripe checkout, Gemini/Claude prompts, RTMP sender, leaderboard helpers) to keep components lean.
- `functions/` hosts Firebase Cloud Functions (checkout sessions, scream donations, leaderboards); transpiled output is in `functions/lib/`.
- `infrastructure/` has deployment scripts for GCP/Firebase; `payments/` is a legacy functions package; keep it consistent if modified.
- Config and assets: `.env.example`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `metadata.json`, and built `dist/` artifacts.

## Build, Test, and Development Commands
- `npm install` (root) installs web dependencies; use Node 20+ for parity with CI.
- `npm run dev` starts the Vite dev server on :5173; `npm run build` outputs the production bundle to `dist/`; `npm run preview` serves the built app locally.
- Cloud functions: `cd functions && npm install && npm run build` to emit `lib/`; `npm run serve` to emulate functions; `npm run deploy` to publish (requires Firebase project access).

## Coding Style & Naming Conventions
- TypeScript + React functional components with hooks; prefer small, composable components and move side effects into `useEffect`.
- Use 2-space indentation, trailing semicolons (as in existing files), and keep imports grouped by third-party vs local.
- File naming: PascalCase for components, camelCase for functions/variables, PascalCase for types/interfaces (centralized in `types.ts` when shared).
- Use the `@/*` path alias for workspace imports; keep API/SDK calls inside `services/` rather than UI components.

## Testing Guidelines
- No automated web test runner is configured; minimally run `npm run build` before opening a PR.
- Manually verify auth flows, streaming start/stop, media uploads, and overlay rendering on desktop and mobile breakpoints.
- For backend changes, prefer adding `firebase-functions-test` unit/integ tests under `functions/` and run them against a test project or emulator.
- If you add a UI test harness, follow `<feature>.test.ts(x)` naming near the code and keep fixtures small.

## Commit & Pull Request Guidelines
- Existing history uses short, imperative messages; follow that pattern (e.g., `add overlay toggle`, `fix stripe webhook`).
- PRs should explain the problem/solution, how to verify (commands or paths clicked), and any env/index/rules changes.
- Link issues when available; include screenshots or clips for UI-facing changes and note schema or secret updates (`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- Keep changes scoped; avoid mixing frontend, functions, and infrastructure tweaks in one PR without rationale.

## Security & Configuration Tips
- Never commit `.env` or service accounts; mirror new variables in `.env.example` and use `firebase functions:secrets:set` for Stripe keys.
- CORS for functions is restricted to `wtp-apps` domains and localhost; update `ALLOWED_ORIGINS` in `functions/index.ts` when adding hosts.
- When altering Firestore data shapes, update `firestore.rules`, `firestore.indexes.json`, and any init scripts under `infrastructure/scripts/`.
