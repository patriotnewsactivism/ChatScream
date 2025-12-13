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

# Firebase Functions (from functions/ directory)
cd functions
npm install
npm run build        # Compile TypeScript
firebase deploy --only functions

# Deploy All
firebase deploy      # Deploy hosting + functions + rules
```

## Architecture

### Frontend Stack
- **React 19** with functional components and hooks
- **Vite** for bundling (vite.config.ts configures env vars and path aliases)
- **react-router-dom v7** for routing
- **lucide-react** for icons
- Path alias: `@/*` maps to project root

### Key Entry Points
- `index.tsx` - App root with BrowserRouter, AuthProvider, and route definitions
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

### Services (`services/`)
- `firebase.ts` - Firebase Auth, Firestore init, user profile CRUD, affiliate code logic
- `stripe.ts` - Pricing plans definition, checkout/portal session creation, scream tier config
- `claudeService.ts` - Claude API integration for stream metadata generation, chat responses, moderation
- `geminiService.ts` - Gemini API fallback for metadata generation
- `chatScreamer.ts` - Donation alert logic (tiers, overlays, TTS, profanity filter)
- `screamLeaderboard.ts` - Weekly leaderboard tracking
- `RTMPSender.ts` - RTMP connection placeholder (actual streaming requires server-side relay)

### Backend (`functions/`)
- Single `index.ts` with Cloud Functions for:
  - `createCheckoutSession` / `createPortalSession` - Stripe billing
  - `createScreamDonation` / `screamWebhook` - Chat Screamer payments
  - `stripeWebhook` - Subscription lifecycle handling
  - `awardWeeklyPrize` - Scheduled function (Sundays) for leaderboard rewards
  - `getLeaderboard` - Public leaderboard API

### State Management
- React Context for auth (`contexts/AuthContext.tsx`)
- Local state with useState/useRef for streaming state, media assets, branding
- Firestore for persistent user data and subscription status

### Type Definitions (`types.ts`)
Core types: `Platform`, `LayoutMode`, `Destination`, `MediaAsset`, `BrandingSettings`, `AppState`

## Environment Variables

Required in `.env.local`:
```
GEMINI_API_KEY=           # For AI metadata generation
VITE_CLAUDE_API_KEY=      # Optional: Claude API for enhanced AI features
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_STARTER_PRICE_ID=
VITE_STRIPE_PRO_PRICE_ID=
```

For Cloud Functions (set via `firebase functions:config:set`):
```
stripe.secret_key
stripe.webhook_secret
stripe.starter_price
stripe.creator_price
stripe.pro_price
```

## Infrastructure

GCP deployment scripts in `infrastructure/`:
- `setup-gcloud-project.sh` - Project creation, API enablement
- `create-vm.sh` - Compute Engine VM for RTMP/HLS (Nginx-based)
- `setup-firebase.sh` - Firebase project configuration
- `deploy.sh` - Deployment orchestration

Firestore collections: `users`, `affiliates`, `screams`, `scream_alerts`, `scream_leaderboard`, `notifications`

## Key Patterns

### Canvas Compositing
The `CanvasCompositor` uses refs for all video elements and persistent animation state to avoid re-mounting the draw loop. Props are accessed via `propsRef` inside `requestAnimationFrame` callback.

### Audio Routing
Web Audio API creates a unified `MediaStreamAudioDestinationNode` that combines mic, music player, and video audio. This mixed stream is then combined with canvas video for recording/streaming.

### Subscription Tiers
Plans: free, starter, creator, pro. Chat Screamer donation tiers: standard ($5-9.99), loud ($10-49.99), maximum ($50+).
