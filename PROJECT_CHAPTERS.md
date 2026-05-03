# ChatScream — Project Chapters

> Browser-based multi-streaming studio. Stream without limits. Scream for attention.
> **Repo:** `patriotnewsactivism/ChatScream`
> **Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Node.js API + Postgres + FFmpeg

---

## Chapter 1: Foundation & App Shell

**Goal:** Application bootstrapping, routing, layout, and configuration.

| File | Purpose |
|------|---------|
| `index.tsx` | App entry point, router setup |
| `App.tsx` | Root component, route definitions, layout switching |
| `vite.config.ts` | Vite build configuration |
| `drizzle.config.ts` | Database ORM configuration |
| `types.ts` | Shared TypeScript type definitions |
| `metadata.json` | App metadata |
| `package.json` | Dependencies and scripts |
| `.env.example` | Environment variable template |
| `.env.production.example` | Production env template |

**Key Concepts:**
- React 18 with Vite for fast HMR development
- Drizzle ORM for type-safe database queries
- PWA-ready with service workers and manifest

---

## Chapter 2: Authentication & User Management

**Goal:** User registration, login, OAuth flows, and session management.

| File | Purpose |
|------|---------|
| `contexts/AuthContext.tsx` | Auth state provider — login, logout, token management |
| `pages/AuthPage.tsx` | Login/signup page |
| `pages/OAuthCallback.tsx` | OAuth redirect handler |
| `components/AuthStatusBanner.tsx` | Auth status indicator |
| `components/OAuthSetup.tsx` | OAuth provider configuration UI |
| `components/ProtectedRoute.tsx` | Route guard for authenticated pages |
| `services/oauthService.ts` | OAuth flow implementation |

**Key Concepts:**
- OAuth integration for streaming platform accounts (YouTube, Twitch, Facebook)
- Auth context provides global auth state
- Protected routes redirect unauthenticated users

---

## Chapter 3: Streaming Engine & Pipeline

**Goal:** Core streaming infrastructure — capture, encode, relay to multiple platforms.

| File | Purpose |
|------|---------|
| `services/streamingPipeline.ts` | Main streaming pipeline — capture → encode → relay |
| `services/RTMPSender.ts` | RTMP protocol sender to streaming platforms |
| `services/cloudStreamingService.ts` | Cloud-based encoding and relay |
| `services/bitrateAdaptation.ts` | Adaptive bitrate based on network conditions |
| `services/destinationRouter.ts` | Route streams to multiple platforms simultaneously |
| `services/streamHealthMonitor.ts` | Monitor stream quality, latency, dropped frames |
| `services/streamEnforcement.ts` | Stream rules and content enforcement |
| `services/streamScheduler.ts` | Schedule streams for future broadcast |
| `services/streamAnalytics.ts` | Real-time stream performance analytics |
| `components/DestinationManager.tsx` | UI for managing stream destinations |
| `components/VideoTransportBar.tsx` | Stream transport controls (start, stop, pause) |
| `components/ResourceHealthBar.tsx` | CPU/memory/bandwidth health indicator |

**Key Concepts:**
- Zero-bandwidth streaming: upload once to cloud, relay to all platforms at CBR
- Adaptive bitrate based on network quality
- Multi-destination simultaneous streaming (YouTube, Twitch, Facebook)
- FFmpeg on AWS EC2 Auto Scaling for server-side encoding

---

## Chapter 4: Studio Canvas & Visual Composition

**Goal:** Visual scene composition, overlays, backgrounds, and layouts.

| File | Purpose |
|------|---------|
| `components/CanvasCompositor.tsx` | Main canvas — composites video, overlays, graphics |
| `components/ProgramPreview.tsx` | Live program output preview |
| `components/SceneSelector.tsx` | Scene switching — different layouts and views |
| `components/LayoutSelector.tsx` | Choose stream layout (pip, side-by-side, etc.) |
| `components/BackgroundSelector.tsx` | Virtual background selection |
| `components/GraphicsOverlay.tsx` | Lower thirds, logos, text overlays |
| `components/BrandingPanel.tsx` | Brand customization — colors, logos, watermarks |
| `components/MediaBin.tsx` | Media asset library — images, videos, audio |
| `services/sceneManager.ts` | Scene state management and transitions |

**Key Concepts:**
- HTML5 Canvas compositing for real-time video mixing
- Scene-based workflow like OBS but browser-native
- Drag-and-drop media bin for assets
- Custom branding and overlay support

---

## Chapter 5: Audio Pipeline & Music

**Goal:** Audio mixing, music playback, and audio processing.

| File | Purpose |
|------|---------|
| `hooks/useAudioPipeline.ts` | Web Audio API pipeline — mix, process, output |
| `components/AudioMixer.tsx` | Multi-channel audio mixer UI |
| `components/MusicPlayer.tsx` | Background music player with volume control |

**Key Concepts:**
- Web Audio API for real-time audio processing
- Multi-source mixing: mic, desktop audio, music, alerts
- Volume control per channel

---

## Chapter 6: Chat Screamer & Donations

**Goal:** The USP — donation-triggered overlays that demand attention.

| File | Purpose |
|------|---------|
| `components/ScreamDonation.tsx` | Scream donation UI and configuration |
| `services/chatScreamer.ts` | Scream logic — tier detection, animation triggers |
| `services/screamLeaderboard.ts` | Weekly leaderboard tracking |
| `services/stripe.ts` | Stripe payment processing for donations |

**Key Concepts:**
- Tiered donation system:
  - Standard Scream ($5): Visual alert + TTS
  - Loud Scream ($10-20): Larger overlay, louder SFX
  - MAXIMUM SCREAM ($50+): Full screen takeover, chaotic visuals
- Weekly leaderboards tracking "Scream Quantity" for engagement
- Stripe Connect for payment processing

---

## Chapter 7: Live Chat Integration

**Goal:** Aggregate and display chat from all connected platforms.

| File | Purpose |
|------|---------|
| `components/ChatStream.tsx` | Unified chat display from all platforms |
| `components/ChatStreamOverlay.tsx` | Chat overlay on stream canvas |
| `services/chatAggregator.ts` | Aggregate chat messages from YouTube, Twitch, etc. |
| `services/realtimeChat.ts` | WebSocket-based real-time chat |
| `hooks/useRealtimeChat.ts` | Chat state management hook |

**Key Concepts:**
- Cross-platform chat aggregation into single unified view
- Chat overlay composited directly onto stream
- Real-time WebSocket connection for instant message delivery

---

## Chapter 8: Recording & Clips

**Goal:** Local recording and clip buffer for highlight capture.

| File | Purpose |
|------|---------|
| `hooks/useLocalRecording.ts` | Browser-based local recording |
| `services/recordingManager.ts` | Recording state, start/stop, file management |
| `services/clipBuffer.ts` | Rolling buffer for instant clip capture |

**Key Concepts:**
- MediaRecorder API for browser-native recording
- Rolling clip buffer — "clip that!" saves the last N seconds
- Local file download for recordings

---

## Chapter 9: AI Features & Content Tools

**Goal:** AI-powered stream copy, auto-captions, and content generation.

| File | Purpose |
|------|---------|
| `hooks/useAutoCaption.ts` | Real-time auto-captioning |
| `hooks/useViralContent.ts` | AI-generated viral content suggestions |
| `services/aiClient.ts` | AI API client wrapper |
| `services/claudeService.ts` | Anthropic Claude integration |
| `services/geminiService.ts` | Google Gemini integration |

**Key Concepts:**
- Real-time auto-captioning overlaid on stream
- AI-generated stream titles, descriptions, social posts
- Multiple AI provider support (Claude, Gemini)

---

## Chapter 10: Analytics & Dashboard

**Goal:** Stream performance metrics, viewer analytics, and creator insights.

| File | Purpose |
|------|---------|
| `components/AnalyticsDashboard.tsx` | Overview analytics dashboard |
| `components/StreamAnalyticsDashboard.tsx` | Per-stream analytics |
| `pages/CreatorDashboard.tsx` | Creator home — stats, recent streams, quick actions |
| `components/BackendStatusCard.tsx` | Server/backend health status |

**Key Concepts:**
- Real-time viewer count, chat rate, donation totals
- Per-stream breakdown: peak viewers, engagement rate, revenue
- Server health monitoring for uptime awareness

---

## Chapter 11: Guest & WebRTC

**Goal:** Invite guests to join the stream via browser.

| File | Purpose |
|------|---------|
| `pages/GuestPage.tsx` | Guest join page — camera/mic check, enter stream |
| `services/webrtcGuestService.ts` | WebRTC peer connection for guest video/audio |

**Key Concepts:**
- WebRTC for low-latency guest connections
- Guest page with pre-join device check
- Composited into main canvas alongside host

---

## Chapter 12: Admin & Platform Management

**Goal:** Admin tools for platform management and moderation.

| File | Purpose |
|------|---------|
| `pages/AdminPage.tsx` | Admin panel — user management, platform stats |

---

## Chapter 13: Backend API

**Goal:** Server-side API for streaming, auth, and data.

| File | Purpose |
|------|---------|
| `api/index.js` | API entry point |
| `api/all.js` | Catch-all API routes |
| `services/backend.ts` | Backend API client |
| `services/apiClient.ts` | HTTP client wrapper |
| `services/env.ts` | Environment variable management |
| `services/sanitize.ts` | Input sanitization |
| `services/sentry.ts` | Error tracking (Sentry) |

**Key Concepts:**
- Node.js API server
- Postgres database via Drizzle ORM
- Redis for caching and session management

---

## Chapter 14: Infrastructure & Deployment

**Goal:** Containerization, CI/CD, and cloud deployment.

| File | Purpose |
|------|---------|
| `Dockerfile` | Container build definition |
| `.dockerignore` | Docker build exclusions |
| `chatscream.service` | Systemd service definition |
| `RAILWAY_DEPLOYMENT.md` | Railway deployment guide |
| `infrastructure/` | AWS infrastructure configs |
| `.vercel-trigger` | Vercel deployment trigger |

**Key Concepts:**
- Docker containerization for consistent deployments
- AWS EC2 Auto Scaling for streaming workers
- Railway or Vercel for frontend deployment

---

## Chapter 15: Public Pages & Marketing

**Goal:** Landing page, about, legal, and marketing content.

| File | Purpose |
|------|---------|
| `pages/LandingPage.tsx` | Main landing/marketing page |
| `pages/AboutPage.tsx` | About ChatScream |
| `pages/BlogPage.tsx` | Blog/content page |
| `pages/CareersPage.tsx` | Careers page |
| `pages/ContactPage.tsx` | Contact form |
| `pages/TermsPage.tsx` | Terms of service |
| `pages/PrivacyPolicyPage.tsx` | Privacy policy |
| `pages/CookiePolicyPage.tsx` | Cookie policy |
| `pages/NotFoundPage.tsx` | 404 page |
| `components/PWAInstallPrompt.tsx` | PWA install prompt |

---

## Chapter 16: Keyboard Shortcuts & UX

**Goal:** Power-user features and mobile responsiveness.

| File | Purpose |
|------|---------|
| `hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handler |
| `hooks/useMobileLayout.ts` | Mobile-responsive layout management |
| `hooks/useResourceGuard.ts` | Resource usage monitoring |
| `components/ChunkErrorBoundary.tsx` | Lazy-load error boundary |
| `components/ErrorBoundary.tsx` | Global error boundary |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│              Frontend (React + Vite)                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │
│  │ Landing  │  │ Studio   │  │ Creator         │   │
│  │ Pages    │  │ Canvas   │  │ Dashboard       │   │
│  │ Ch. 15   │  │ Ch. 3-9  │  │ Ch. 10          │   │
│  └──────────┘  └──────────┘  └─────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────┐
│             Backend API (Node.js)                    │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │
│  │ Auth/    │  │ Stream   │  │ Payments        │   │
│  │ OAuth    │  │ Relay    │  │ (Stripe)        │   │
│  │ Ch. 2    │  │ Ch. 3    │  │ Ch. 6           │   │
│  └──────────┘  └──────────┘  └─────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────┐
│         Infrastructure (AWS + Docker)                │
│  ┌──────────────────────────────────────────────┐   │
│  │ EC2 Auto Scaling Workers (FFmpeg + RTMP)     │   │
│  │ Postgres + Redis                              │   │
│  │ Ch. 14                                        │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```
