# Repository Guidelines

## Project Structure & Module Organization

- `index.tsx` boots the Vite/React app; `App.tsx` coordinates studio UI and routing.
- `components/` contains reusable UI blocks; `pages/` contains route-level screens.
- `contexts/AuthContext.tsx` manages session/auth state via backend APIs.
- `services/` contains API clients and domain helpers (auth, OAuth, AI, streaming, billing).
- `server/` contains the Node/Express backend (`index.js`) and local runtime store (`store.js`).
- `infrastructure/` contains AWS scripts for stream-worker autoscaling deployment.
- Config/assets: `.env.example`, `.env.production.example`, `metadata.json`, and built `dist/` artifacts.

## Build, Test, and Development Commands

- `npm install` (root) installs dependencies; use Node 20+.
- `npm run dev` starts API + web in parallel (`server/index.js` + Vite).
- `npm run dev:web` starts only Vite.
- `npm run dev:api` starts only API with file watching.
- `npm run build` outputs production frontend assets to `dist/`.
- `npm run start` starts the backend server (serves API + static `dist/` if present).

## Coding Style & Naming Conventions

- TypeScript + React functional components with hooks.
- Use 2-space indentation and trailing semicolons.
- File naming: PascalCase for components, camelCase for functions/variables, PascalCase for shared types.
- Use the `@/*` path alias for workspace imports.
- Keep network/API access logic in `services/` instead of components.

## Testing Guidelines

- Run at minimum: `npm run typecheck` and `npm run build`.
- For behavior changes, manually verify auth flows, start/stop streaming, OAuth connect/disconnect, and overlay rendering on desktop/mobile.
- If adding tests, use `<feature>.test.ts(x)` near the code.

## Commit & Pull Request Guidelines

- Use short imperative commit messages (e.g., `fix oauth redirect`, `add api health check`).
- PRs should include: problem, solution, verification steps, and env/deploy impact.
- Include screenshots/clips for UI changes.

## Security & Configuration Tips

- Never commit `.env`, credentials, or service account keys.
- Mirror new environment variables in `.env.example`.
- Store production secrets in AWS Secrets Manager (or equivalent) and inject at deploy/runtime.
- Keep CORS restricted to trusted origins and localhost in backend config.
