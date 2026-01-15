# ChatScream - AI Context & Documentation

## Project Overview
**ChatScream** (formerly likely "StreamHub Pro") is a browser-based multi-streaming studio designed to disrupt the live-streaming market. It allows users to stream to multiple platforms (YouTube, Twitch, Facebook) simultaneously with cloud-offloaded encoding. Key differentiators include "Chat Screamer" (aggressive donation alerts) and AI-driven content generation.

## Tech Stack
*   **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, Lucide React, React Router v7.
*   **Backend:** Firebase Ecosystem (Auth, Firestore, Hosting, Cloud Functions), Node.js 20.
*   **Infrastructure:** Google Cloud Platform (Compute Engine for FFMPEG/RTMP), Firebase App Hosting.
*   **Payments:** Stripe Connect (Custom Accounts) & Checkout.
*   **AI:** Anthropic Claude (Primary), Google Gemini (Backup/Legacy).
*   **Testing:** Vitest (Unit), Playwright (E2E).

## Project Structure & Architecture
**Note:** This project follows a non-standard structure where source directories reside at the **root level** rather than inside a `src/` directory (except for `dataconnect-generated`).

### Key Directories
*   `App.tsx` & `index.tsx`: Application entry points.
*   `components/`: Reusable UI components.
    *   `CanvasCompositor.tsx`: Core streaming engine (canvas manipulation).
    *   `AudioMixer.tsx`: Web Audio API logic.
    *   `ChatStream*.tsx`: Overlay and chat logic.
*   `pages/`: Route-level components (`Studio`, `Dashboard`, `Landing`, etc.).
*   `contexts/`: React Context definitions (Auth, etc.).
*   `hooks/`: Custom React hooks (`useRealtimeChat`, `useViralContent`).
*   `services/`: Integrations with external APIs (Firebase, Stripe, AI, RTMP).
*   `functions/`: **Primary** Firebase Cloud Functions (Stripe, OAuth, Admin).
*   `chatscream/`: **Secondary** App Hosting backend (Dual functions setup).
*   `infrastructure/`: GCP deployment and setup scripts.
*   `types.ts`: Centralized TypeScript definitions.

### Architecture Highlights
*   **Dual Functions Setup:**
    *   `functions/`: Main backend logic deployed via `firebase deploy --only functions`.
    *   `chatscream/`: App Hosting specific backend.
*   **Canvas Compositing:** Video compositing happens on a canvas using `requestAnimationFrame`, captured via `captureStream()` for RTMP.
*   **Audio Routing:** Unified `MediaStreamAudioDestinationNode` combines microphone, system audio, and media assets.

## Development Workflow

### Prerequisites
*   Node.js 20+
*   Firebase CLI: `npm install -g firebase-tools`
*   Environment Variables: Copy `.env.example` to `.env`.

### Core Commands
| Action | Command | Description |
| :--- | :--- | :--- |
| **Install** | `npm install` | Install frontend dependencies |
| **Dev Server** | `npm run dev` | Start Vite dev server (localhost:5173) |
| **Build** | `npm run build` | Build frontend for production (`dist/`) |
| **Preview** | `npm run preview` | Preview production build locally |
| **Test (Unit)** | `npm test` | Run Vitest unit tests |
| **Test (E2E)** | `npm run test:e2e` | Run Playwright E2E tests |
| **Lint** | `npm run lint` | Run ESLint |
| **Typecheck** | `npm run typecheck` | Run TypeScript compiler check |

### Backend Development (`functions/`)
| Action | Command | Description |
| :--- | :--- | :--- |
| **Install** | `cd functions && npm install` | Install backend dependencies |
| **Build** | `npm run build` | Transpile TypeScript to `lib/` |
| **Emulate** | `npm run serve` | Run Firebase Functions emulator |
| **Deploy** | `firebase deploy --only functions` | Deploy to production |

## Conventions & Standards
*   **Path Aliases:** Uses `@/` to map to the project root.
*   **Styling:** Tailwind CSS utility classes.
*   **State:** Prefer React Context for global state, local state for component-specific logic.
*   **Naming:** PascalCase for components/types, camelCase for functions/vars.
*   **Comments:** Focus on *why*, not *what*.
*   **Testing:** E2E tests for critical user flows (Auth, Streaming). Unit tests for utilities/hooks.

## Deployment Information
*   **Frontend:** Hosted on Firebase Hosting (`wtp-apps` project).
*   **Environment:** Production builds use `.env` (or `.env.production` in CI).
*   **Secrets:** Managed via Google Secret Manager. Set using `firebase functions:secrets:set <KEY>`.
*   **Critical Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, OAuth Client Secrets (`YOUTUBE`, `FACEBOOK`, `TWITCH`).

## Important Files
*   `CLAUDE.md`: Detailed AI instructions and architectural deep-dives.
*   `DEPLOYMENT.md`: Production checklist and deployment procedures.
*   `firebase.json`: Firebase configuration (rewrites, hosting setup).
*   `firestore.rules`: Database security rules.
*   `vite.config.ts`: Vite configuration (proxies, plugins).
