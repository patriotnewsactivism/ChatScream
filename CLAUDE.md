# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatScream is a browser-based multi-streaming studio built with React 19, TypeScript, and Vite. It enables creators to broadcast to multiple platforms (YouTube, Facebook, Twitch) with canvas-composited video, donation alerts ("Chat Screamer"), and AI-generated content. The backend uses Firebase (Firestore, Auth, Hosting, Cloud Functions) with Stripe for payments.

## Common Commands

```bash
# Development
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:3000

# Build & Preview
npm run build        # Build to dist/
npm run preview      # Preview production build

# Testing
npm test             # Run unit tests with Vitest
npm run test:e2e     # Run E2E tests with Playwright
npm run test:e2e:ui  # Run E2E tests with UI
npm run test:e2e:headed  # Run E2E tests in headed mode

# Linting & Formatting
npm run lint         # Lint TypeScript files
npm run typecheck    # Type-check without emitting
npm run format       # Format all files with Prettier

# Firebase Functions (from functions/ directory)
cd functions
npm install
npm run build        # Compile TypeScript to lib/
npm run serve        # Run functions emulator
npm test             # Run functions unit tests
firebase deploy --only functions --project wtp-apps

# Deploy
firebase deploy --only hosting:production --project wtp-apps  # Hosting only (recommended)
firebase deploy --project wtp-apps                             # Full deploy (requires secrets)
```

## Architecture

### Frontend Stack
- **React 19** with functional components and hooks
- **Vite** for bundling (vite.config.ts configures env vars and path aliases)
- **react-router-dom v7** for routing
- **lucide-react** for icons
- **Vitest** for unit tests, **Playwright** for E2E tests
- Path alias: `@/*` maps to project root
- Code splitting via lazy loading for heavy components (Studio, Dashboard, etc.)

### Key Entry Points
- `index.tsx` - App root with BrowserRouter, AuthProvider, route definitions, and lazy-loaded components
- `App.tsx` - Main studio interface (the protected `/studio` route)
- `pages/LandingPage.tsx` - Public landing page
- `pages/AuthPage.tsx` - Login/signup/reset-password (shares same component)

### Core Components (`components/`)
- `CanvasCompositor.tsx` - Real-time canvas rendering with layout modes (FULL_CAM, PIP, SPLIT, NEWSROOM, FULL_SCREEN). Uses requestAnimationFrame for 30fps output with `captureStream()` for RTMP/recording
- `ChatStream.tsx` / `ChatStreamOverlay.tsx` - Live chat display overlaid on stream
- `DestinationManager.tsx` - Multi-destination stream key management
- `AudioMixer.tsx` - Web Audio API mixer for mic, music, and video sources
- `MediaBin.tsx` - Asset library for uploaded images/videos/audio
- `BrandingPanel.tsx` - Lower-third and ticker customization
- `ProtectedRoute.tsx` - Authentication guard for protected routes
- `ErrorBoundary.tsx` / `ChunkErrorBoundary.tsx` - Error handling for app crashes and code-split chunks

### Services (`services/`)
- `firebase.ts` - Firebase Auth, Firestore init, user profile CRUD, affiliate code logic
- `stripe.ts` - Pricing plans definition, checkout/portal session creation, scream tier config
- `claudeService.ts` - Claude API integration for stream metadata generation, chat responses, moderation
- `geminiService.ts` - Gemini API fallback for metadata generation
- `chatScreamer.ts` - Donation alert logic (tiers, overlays, TTS, profanity filter)
- `screamLeaderboard.ts` - Weekly leaderboard tracking
- `oauthService.ts` - OAuth flow for YouTube, Facebook, Twitch
- `cloudStreamingService.ts` / `streamingPipeline.ts` - Cloud-based streaming pipeline
- `RTMPSender.ts` - RTMP connection placeholder (actual streaming requires server-side relay)
- `sentry.ts` - Error tracking and monitoring

### Backend (`functions/`)

**Dual Functions Setup**: The project has two Firebase Functions codebases:
1. `functions/` - Main Cloud Functions (Stripe, OAuth, admin endpoints)
2. `chatscream/` - App Hosting backend (secondary codebase)

Main functions in `functions/index.ts`:
- `createCheckoutSession` / `createPortalSession` - Stripe billing
- `createScreamDonation` / `stripeWebhook` - Chat Screamer payments and subscription lifecycle
- `oauthExchange` / `oauthRefresh` / `oauthStreamKey` / `oauthChannels` - OAuth flow handlers
- `accessSync` / `accessSetList` - Admin access control
- `awardWeeklyPrize` - Scheduled function (Sundays) for leaderboard rewards
- `getLeaderboard` - Public leaderboard API

All functions require these Secret Manager values (set via `firebase functions:secrets:set`):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `CLAUDE_API_KEY`

### State Management
- React Context for auth (`contexts/AuthContext.tsx`)
- Local state with useState/useRef for streaming state, media assets, branding
- Firestore for persistent user data and subscription status

### Type Definitions (`types.ts`)
Core types: `Platform`, `LayoutMode`, `Destination`, `MediaAsset`, `BrandingSettings`, `AppState`

## Environment Variables

Required in `.env` (copy from `.env.example`):
```
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# OAuth (public client IDs)
VITE_OAUTH_REDIRECT_URI=
VITE_YOUTUBE_CLIENT_ID=
VITE_FACEBOOK_APP_ID=
VITE_TWITCH_CLIENT_ID=

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_STARTER_PRICE_ID=
VITE_STRIPE_CREATOR_PRICE_ID=
VITE_STRIPE_PRO_PRICE_ID=

# AI
VITE_CLAUDE_API_KEY=       # Primary AI provider
VITE_GEMINI_API_KEY=       # Legacy/backup
```

For Cloud Functions secrets (set via `firebase functions:secrets:set <KEY> --project wtp-apps`):
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- YOUTUBE_CLIENT_SECRET, FACEBOOK_APP_SECRET, TWITCH_CLIENT_SECRET
- CLAUDE_API_KEY (server-side)

## Infrastructure

GCP deployment scripts in `infrastructure/scripts/`:
- `init-firestore.js` - Initialize Firestore collections
- `set-access-list.js` - Configure admin/beta tester access
- `assign-roles.js` - Assign Firebase roles
- `vm-startup.sh` - VM setup for RTMP/HLS server

Firestore collections: `users`, `affiliates`, `screams`, `scream_alerts`, `scream_leaderboard`, `notifications`, `config`

## Key Patterns

### Code Splitting
Heavy components (Studio, Dashboard, Admin, etc.) are lazy-loaded using React.lazy() and Suspense in index.tsx. Landing and Auth pages load immediately for fast initial render.

### Canvas Compositing
The `CanvasCompositor` uses refs for all video elements and persistent animation state to avoid re-mounting the draw loop. Props are accessed via `propsRef` inside `requestAnimationFrame` callback.

### Audio Routing
Web Audio API creates a unified `MediaStreamAudioDestinationNode` that combines mic, music player, and video audio. This mixed stream is then combined with canvas video for recording/streaming.

### OAuth Flow
Three-step OAuth flow via cloud functions: exchange (code → tokens), refresh (refresh token → access token), stream-key (platform-specific API call to fetch stream keys/channels).

### Subscription Tiers
Plans: free, starter, creator, pro. Chat Screamer donation tiers: standard ($5-9.99), loud ($10-49.99), maximum ($50+).

### Access Control
Admin and beta tester email lists stored in Firestore `config/access` doc. Master emails hardcoded in functions/index.ts. User roles synced via `accessSync` function on auth events.
