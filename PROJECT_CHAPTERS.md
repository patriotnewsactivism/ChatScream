# ChatScream — Project Chapters

> Browser-based multi-streaming studio. Stream without limits. Scream for attention.
> **Repo:** `patriotnewsactivism/ChatScream`
> **Stack:** React 18 + Vite + TypeScript + Tailwind CSS + Node.js/Express API + Postgres (Drizzle) + FFmpeg

---

## Chapter 1: Foundation & App Shell

**Goal:** Application bootstrapping, routing, layout, and configuration.

| File | Purpose |
|------|---------|
| `index.tsx` | App entry point, router setup |
| `App.tsx` | Root component, route definitions, layout switching |
| `types.ts` | Shared TypeScript type definitions |

**Configuration & Build:**

| File | Purpose |
|------|---------|
| `index.html` | HTML shell, Vite entry |
| `vite.config.ts` | Vite build configuration |
| `drizzle.config.ts` | Drizzle ORM database configuration |
| `playwright.config.ts` | Playwright E2E test config |
| `vitest.setup.ts` | Vitest test setup |
| `eslint.config.js` | ESLint rules |
| `metadata.json` | App metadata |
| `package.json` | Dependencies and scripts |
| `package-lock.json` | Dependency lock file |
| `.env.example` | Dev environment variable template |
| `.env.production.example` | Production env template |
| `.prettierrc` | Prettier formatting config |
| `.prettierignore` | Prettier ignore rules |
| `.gitignore` | Git ignore rules |
| `.gitattributes` | Git attributes |
| `README.md` | Project documentation |
| `AGENTS.md` | AI agent instructions |
| `GEMINI.md` | Gemini AI instructions |
| `TEST_COVERAGE_ANALYSIS.md` | Test coverage report |

**Key Concepts:**
- React 18 with Vite for fast HMR development
- Drizzle ORM for type-safe database queries
- PWA-ready with service workers

---

## Chapter 2: Authentication & User Management

**Goal:** User registration, login, OAuth, and session management.

| File | Purpose |
|------|---------|
| `contexts/AuthContext.tsx` | Auth state provider — login, logout, token management |
| `pages/AuthPage.tsx` | Login/signup page |
| `pages/OAuthCallback.tsx` | OAuth redirect handler |
| `components/AuthStatusBanner.tsx` | Auth status indicator banner |
| `components/ProtectedRoute.tsx` | Route guard for authenticated pages |
| `services/oauthService.ts` | OAuth flow implementation for streaming platforms |

**Key Concepts:**
- OAuth integration for YouTube, Twitch, Facebook accounts
- Auth context provides global auth state via React context
- Protected routes redirect unauthenticated users

---

## Chapter 3: Streaming Engine & Pipeline

**Goal:** Core streaming infrastructure — capture, encode, relay to multiple platforms.

| File | Purpose |
|------|---------|
| `services/streamingPipeline.ts` | Main pipeline — capture → encode → relay |
| `services/RTMPSender.ts` | RTMP protocol sender to streaming platforms |
| `services/cloudStreamingService.ts` | Cloud-based encoding and relay via AWS |
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
| `components/ChatStreamOverlay.tsx` | Chat overlay composited on stream canvas |
| `services/chatAggregator.ts` | Aggregate messages from YouTube, Twitch, etc. |
| `services/realtimeChat.ts` | WebSocket-based real-time chat connection |
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
| `hooks/useLocalRecording.ts` | Browser-based local recording via MediaRecorder |
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
| `hooks/useAutoCaption.ts` | Real-time auto-captioning on stream |
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
| `components/StreamAnalyticsDashboard.tsx` | Per-stream analytics deep dive |
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

## Chapter 12: Admin Panel

**Goal:** Admin tools for platform management and moderation.

| File | Purpose |
|------|---------|
| `pages/AdminPage.tsx` | Admin panel — user management, platform stats |

---

## Chapter 13: Backend Server

**Goal:** Node.js/Express API server for auth, AI, storage, and webhooks.

| File | Purpose |
|------|---------|
| `server/index.js` | Server entry point — starts Express |
| `server/app.js` | Express app setup — middleware, routes, CORS |
| `server/ai.js` | AI endpoint — proxies requests to AI models |
| `server/auth/passwordReset.js` | Password reset flow |
| `server/db/schema.js` | Database schema definition (Drizzle) |
| `server/storage.js` | File/media storage management |
| `server/store.js` | Session/data store |
| `server/webhooks/stripe.js` | Stripe webhook handler |
| `api/index.js` | Vercel API entry point |
| `api/all.js` | Catch-all API routes for serverless |
| `services/backend.ts` | Frontend → backend API client |
| `services/apiClient.ts` | HTTP client wrapper |
| `services/env.ts` | Environment variable management |
| `services/sanitize.ts` | Input sanitization utilities |
| `services/sentry.ts` | Sentry error tracking integration |

**Key Concepts:**
- Express API server with session auth
- Postgres database via Drizzle ORM
- AI endpoint proxies to Claude/Gemini
- Stripe webhooks for payment events
- Dual deployment: Cloud Run (server) + Vercel (frontend)

---

## Chapter 14: Infrastructure & Deployment

**Goal:** Containerization, CI/CD, cloud deployment, and ops.

| File | Purpose |
|------|---------|
| `Dockerfile` | Container build definition |
| `.dockerignore` | Docker build exclusions |
| `docker-compose.yml` | Multi-container local development |
| `chatscream.service` | Systemd service definition for Linux servers |
| `vercel.json` | Vercel deployment config |
| `.vercel-trigger` | Vercel deployment trigger |
| `infrastructure/README.md` | Infrastructure overview |
| `infrastructure/aws/README.md` | AWS streaming fleet docs |
| `infrastructure/aws/.env.aws.example` | AWS env template |
| `infrastructure/aws/deploy-stream-fleet.sh` | Deploy EC2 streaming fleet (Linux) |
| `infrastructure/aws/deploy-stream-fleet.ps1` | Deploy EC2 streaming fleet (Windows) |
| `infrastructure/aws/scripts/ec2-user-data.sh` | EC2 instance bootstrap script |
| `scripts/deploy-production.sh` | Production deployment script |
| `scripts/setup-production-env.sh` | Production env setup |
| `scripts/setup-autostart.sh` | Auto-start service setup |
| `scripts/generate-icons.js` | PWA icon generation |
| `scripts/migrate-users-to-postgres.mjs` | User migration to Postgres |

**Key Concepts:**
- Docker containerization for consistent deployments
- AWS EC2 Auto Scaling for streaming FFmpeg workers
- Cloud Run for backend, Vercel for frontend
- Systemd service for bare-metal Linux deployment

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

**Goal:** Power-user features, mobile responsiveness, and error handling.

| File | Purpose |
|------|---------|
| `hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handler |
| `hooks/useMobileLayout.ts` | Mobile-responsive layout management |
| `hooks/useResourceGuard.ts` | Resource usage monitoring (CPU, memory) |
| `components/ChunkErrorBoundary.tsx` | Lazy-load error boundary |
| `components/ErrorBoundary.tsx` | Global error boundary |

---

## Chapter 17: Test Suite

**Goal:** Unit, integration, and E2E tests.

**Unit & Integration Tests:**

| File | Purpose |
|------|---------|
| `App.test.tsx` | Root app component tests |
| `components/__tests__/AuthStatusBanner.test.tsx` | Auth banner tests |
| `components/__tests__/DestinationManager.test.tsx` | Destination manager tests |
| `components/__tests__/ProtectedRoute.test.tsx` | Route guard tests |
| `pages/__tests__/AuthPage.test.tsx` | Auth page tests |
| `pages/__tests__/CreatorDashboard.test.tsx` | Creator dashboard tests |
| `pages/__tests__/LandingPage.test.tsx` | Landing page tests |
| `pages/__tests__/StaticPages.test.tsx` | Static page rendering tests |
| `contexts/__tests__/AuthContext.test.tsx` | Auth context tests |
| `hooks/__tests__/useMobileLayout.test.tsx` | Mobile layout hook tests |
| `hooks/__tests__/useViralContent.test.tsx` | Viral content hook tests |
| `services/__tests__/aiClient.test.ts` | AI client tests |
| `services/__tests__/apiClient.test.ts` | API client tests |
| `services/__tests__/backendConfig.test.ts` | Backend config tests |
| `services/__tests__/env.test.ts` | Env management tests |
| `services/__tests__/sanitize.test.ts` | Input sanitization tests |
| `services/__tests__/stripe.test.ts` | Stripe integration tests |
| `server/__tests__/ai.test.ts` | Server AI endpoint tests |
| `server/__tests__/auth-password-upgrade.test.ts` | Password upgrade tests |
| `server/__tests__/auth-reset-password.test.ts` | Password reset tests |
| `server/__tests__/cors.test.ts` | CORS policy tests |
| `server/__tests__/identity-storage.test.ts` | Identity storage tests |
| `server/__tests__/oauth-authorization.test.ts` | OAuth auth tests |
| `server/__tests__/user-update-authz.test.ts` | User update authorization tests |

**E2E Tests (Playwright):**

| File | Purpose |
|------|---------|
| `tests/e2e/auth.spec.ts` | Authentication E2E flow |
| `tests/e2e/landing.spec.ts` | Landing page E2E tests |
| `tests/e2e/studio.spec.ts` | Studio workspace E2E tests |

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
│         Backend API (Node.js/Express)                │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │
│  │ Auth/    │  │ AI       │  │ Payments        │   │
│  │ OAuth    │  │ Proxy    │  │ (Stripe)        │   │
│  │ Ch. 2    │  │ Ch. 9,13 │  │ Ch. 6, 13       │   │
│  └──────────┘  └──────────┘  └─────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────┐
│         Infrastructure (AWS + Docker)                │
│  ┌──────────────────────────────────────────────┐   │
│  │ EC2 Auto Scaling Workers (FFmpeg + RTMP)     │   │
│  │ Postgres + pgvector                           │   │
│  │ Ch. 14                                        │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## File Counts by Chapter

| Chapter | Files |
|---------|-------|
| Ch. 1: Foundation | 3 source + 20 config |
| Ch. 2: Auth | 7 |
| Ch. 3: Streaming Engine | 12 |
| Ch. 4: Studio Canvas | 9 |
| Ch. 5: Audio | 3 |
| Ch. 6: Chat Screamer | 4 |
| Ch. 7: Live Chat | 5 |
| Ch. 8: Recording | 3 |
| Ch. 9: AI Features | 5 |
| Ch. 10: Analytics | 4 |
| Ch. 11: WebRTC | 2 |
| Ch. 12: Admin | 1 |
| Ch. 13: Backend Server | 17 |
| Ch. 14: Infrastructure | 20 |
| Ch. 15: Public Pages | 10 |
| Ch. 16: UX/Shortcuts | 5 |
| Ch. 17: Tests | 27 |
| **Total** | **~137 source + 20 config** |
