# ChatScream â Full Feature Wiring Plan

## Overview

This plan covers wiring up every feature of ChatScream: the multi-platform streaming studio, ChatScream donation alerts, the creator dashboard, and backend production readiness. The codebase has extensive scaffolding but has gaps in missing API endpoints, inconsistent auth patterns, and no payment â scream processing pipeline.

---

## Phase 1: Backend Foundation (server/)

### 1.1 Add Scream Payment Processing

**Missing:** `ScreamDonation.tsx` calls `POST /api/scream/checkout` but no such route exists in `server/app.js`.

**Work:**

- Add `POST /api/scream/checkout` in `server/app.js`:
  - Validates input (streamerUid, donorName, message, amount)
  - Computes tier from `getScreamTier(amount)` (already in `services/stripe.ts`)
  - Creates a Stripe Checkout session with `mode: 'payment'`
  - On successful payment, stores scream event and notifies stream (via WebSocket or polling)
- Add `POST /api/scream/webhook` (Stripe webhook):
  - Processes `checkout.session.completed` events
  - Creates a `ScreamAlert` record in the store
  - Pushes the alert to the active streaming WebSocket room
  - Updates leaderboard stats

### 1.2 Add Leaderboard API

**Missing:** `screamLeaderboard.ts` has full logic but no API endpoints.

**Work:**

- Add `GET /api/leaderboard` â returns current weekly leaderboard entries
- Add `GET /api/leaderboard/stats` â returns stats for a given streamer
- Add `POST /api/leaderboard/reset` (admin) â resets weekly leaderboard
- Wire to `server/store.js` `updateLeaderboardEntry`, `getWeeklyWinners`, `resetWeeklyLeaderboard`

### 1.3 Add Cloud Streaming Session Management

**Existing but needs verification:** `POST /api/cloud-streaming/sessions/start` and `POST /api/cloud-streaming/sessions/end` exist but are disconnected from actual VM orchestration.

**Work:**

- Ensure `startCloudSession` in `services/cloudStreamingService.ts` triggers the AWS auto-scaling workflow via `infrastructure/` scripts
- Add `PUT /api/cloud-streaming/sessions/:id` for session metadata updates

### 1.4 Fix Auth Provider Screen/UX

**Issue:** `AuthContext.tsx` mixes Firebase-style API names (`onIdTokenChange`, `getIdTokenResult`) with a custom session backend (`services/backend.ts`). This works but is confusing.

**Work:**

- Rename `onIdTokenChange` â `onAuthStateChange` in `backend.ts` to avoid confusion
- Ensure `completeRedirectSignIn` is called from the `OAuthCallback` page properly
- Test full OAuth redirect flow end-to-end: Google â YouTube â stream key

### 1.5 Add Missing CORS + Security Middleware

**Work:**

- Confirm `helmet` or CSP headers are applied (currently missing)
- Add rate limiting on auth routes, scream payments, and media uploads
- Validate Stripe webhook signatures

---

## Phase 2: Studio (App.tsx + components/)

### 2.1 Fix Video Playback â Stream Compositing

**Current behavior:** `CanvasCompositor` renders a hidden `mediaVideoRef.current` for `activeVideoUrl`. `VideoTransportBar` controls this element.

**Issues found:**

- `VideoTransportBar` calls `canvasRef.current?.getVideoElement()` which returns `mediaVideoRef.current` â correct
- But `mediaVideoRef.current` is created in `CanvasCompositor` as `document.createElement('video')`, and its `src` is set by `activeVideoUrl` prop via `useEffect`
- Audio from video goes through `useAudioPipeline` which connects `videoElement` to the audio graph

**Fixes needed:**

- If `mediaVideoRef.current` isn't initialized yet when `VideoTransportBar` mounts, `duration` will be 0 and bar returns `null`. Add a retry/wait mechanism or pass `duration` as a separate prop.
- Ensure video auto-play is permitted (user gesture requirement) â add a "Play video" button if auto-play fails
- When video ends, provide visual feedback and auto-loop or stop

### 2.2 CanvasCompositor Scene Mode â Video Context Fix

**Issue:** In Scene Mode (activeScene), video sources from `videoCacheRef` are drawn to canvas. These pre-loaded video elements don't get their volume controlled by `useAudioPipeline`.

**Work:**

- Ensure scene video sources are connected to `useAudioPipeline` video input, or give them their own gain nodes
- Add volume control per scene video source

### 2.3 Program Preview (Multiview) Audio Fix

**Issue:** `ProgramPreview.tsx` sets `videoVolume={0}` on the Preview canvas, which is correct (preview is muted). But the program canvas should play audio. Currently the audio context isn't duplicated for two canvases.

**Work:**

- Share a single `AudioContext` (already done via `useAudioPipeline`'s `combinedStream`)
- The program canvas output is what gets streamed â audio goes via `combinedStream` not from canvas capture
- Verify this is correct: `handleBroadcast` uses `combinedStream` for audio, `canvasStream.getVideoTracks()` for video. This is correct.

### 2.4 Stream Transport Recording UI

**Current behavior:** Recording uses `useLocalRecording` hook which writes indexedDB chunks and downloads on stop.

**Work:**

- Add recording status indicator with elapsed time and estimated file size
- Add pause/resume recording button visible during recording
- Fix: Recording hasn't been tested end-to-end with audio pipeline
- Add recording quality auto-downgrade indicator to UI

### 2.5 Scream Alert in CanvasCompositor

**Current behavior:** Scream alerts already render in the canvas compositor (`activeScream` prop). A demo button triggers it.

**Missing:**

- Real scream data must come from the server (WebSocket push or polling)
- Add WebSocket room for scream events in `server/index.js`
- In `App.tsx`, connect to the scream WebSocket when streaming is active
- Trigger `playScreamSound()` from `chatScreamer.ts` on real scream events
- Add scream settings panel to `BrandingPanel` or `GraphicsOverlay`

### 2.6 Scream Alert Overlay (HTML/CSS layer)

**Current behavior:** Canvas draw (can't do CSS animations). Consider adding a pure CSS/HTML overlay for scream alerts that can do rich animations (shake, explode particles, TTS).

**Work:**

- Add a `ScreamOverlay` component that renders on top of the canvas (absolute positioned)
- Use CSS keyframes for bounce/shake/explode animations (HTML divs animate better than canvas)
- Remove the canvas-based scream rendering or keep as fallback
- Integrate `chatScreamer.ts` `generateScreamTTS()` for text-to-speech

---

## Phase 3: Creator Dashboard (pages/CreatorDashboard.tsx)

### 3.1 Add Real Analytics Data

**Current:** Dashboard shows static mock data (Q&A broadcast, Product drop teaser).

**Work:**

- Add API endpoint `GET /api/analytics/overview` returning:
  - Total stream hours (local + cloud)
  - Total screams received
  - Total donations amount
  - Number of streams this month
  - Top scream donors
- Wire dashboard cards to real data
- Add weekly leaderboard section showing current rank and weekly stats

### 3.2 Upgrade Flow

**Current:** `CreatorDashboard.tsx` has upgrade button that calls `createCheckoutSession`.

**Issues:**

- After upgrade, user must do something to refresh their profile (currently manual)
- Add auto-redirect to studio with fresh session after successful checkout
- Handle `?checkout=success` query param on dashboard

### 3.3 Destination Status Cards

**Current:** Shows static "Connected â channelName" or "Not connected" based on `connectedPlatforms` from profile.

**Work:**

- Add "Manage Platform Connection" inline button that opens OAuth setup
- Show live/offline status for each connected platform
- Add disconnect button with confirmation

### 3.4 Affiliate Section Polish

**Current:** Works but looks minimal.

**Work:**

- Add referral stats (clicks, signups, commissions)
- Add payout account configuration (Stripe Connect)
- Add history of referred users

---

## Phase 4: Studio UX Polish

### 4.1 Scene Selector

**Current:** `SceneSelector` exists but scenes aren't persisted to backend.

**Work:**

- Add `POST /api/scenes`, `GET /api/scenes`, `PUT /api/scenes/:id` endpoints
- Persist scene configurations (source positions, z-index, visibility)
- Load scenes from API on studio mount

### 4.2 Stream Scheduler

**Current:** `StreamScheduler` exists but likely doesn't connect to backend.

**Work:**

- Verify endpoints `GET /api/schedules`, `PUT /api/schedule`, `DELETE /api/schedule/:id` are functional in `store.js`
- Wire scheduler UI to backend
- Add "Countdown to scheduled stream" banner on dashboard

### 4.3 Mobile Studio

**Current:** Mobile layout exists with slide-up drawer.

**Work:**

- Test mobile recording (chunked writing to IndexedDB)
- Ensure camera flip works on mobile (current/back camera switch)
- Verify PWA install prompt works on iOS/Android
- Test screen share on mobile (getDisplayMedia limited on iOS)

### 4.4 Guest Camera Integration

**Current:** WebRTC guest camera exists (`webrtcGuestService.ts`) with signaling server in `server/index.js`.

**Work:**

- Ensure guest video is composited into canvas
- Test multi-guest (up to 4) performance
- Add guest video position/size controls in Scene Selector

---

## Phase 5: Infrastructure & Deployment

### 5.1 Local Development Testing

- Run `npm run typecheck` and fix all TypeScript errors
- Run `npm run build` and verify production build
- Run `npm run test` and fix failing tests
- Add tests for new scream/checkout API endpoints

### 5.2 Environment Configuration

- Create working `.env` file from `.env.example`
- Ensure OAuth secrets are loadable via railway.json or env vars
- Document missing env vars in `.env.example`

### 5.3 Docker/FFmpeg

- Ensure FFmpeg is bundled in Dockerfile or install script
- Document FFmpeg version requirements
- Add health check for FFmpeg availability

---

## Phase 6: Testing Strategy

### 6.1 Unit Tests to Write

| Test                            | File                        |
| ------------------------------- | --------------------------- |
| ScreamTier calculation          | `chatScreamer.test.ts`      |
| Destination enforcer limits     | `streamEnforcement.test.ts` |
| Auth session management         | `backend.test.ts`           |
| Cloud streaming cost estimation | `app.test.js`               |
| Media upload/list/delete        | `app.test.js`               |

### 6.2 Integration Tests

| Test                                           | What it covers      |
| ---------------------------------------------- | ------------------- |
| E2E: Sign up â create destination â go live    | Full streaming loop |
| E2E: OAuth YouTube connect â fetch stream key  | OAuth integration   |
| E2E: Send scream â webhook â overlay           | Scream payment flow |
| Component: CanvasCompositor renders with video | Studio rendering    |
| Component: VideoTransportBar controls playback | Video playback      |

### 6.3 Manual Testing Checklist

- [ ] Full OAuth flow: Google sign-in â YouTube channel picker â stream key
- [ ] Test record â download via IndexedDB
- [ ] Test multiview TAKE with video + camera â verify stream output
- [ ] Test scream demo â verify canvas overlay and sound
- [ ] Test mobile studio: camera flip, recording, PWA
- [ ] Test guest camera invite via room ID
- [ ] Test destination limit enforcement (add 2 destinations on free plan â should reject)
- [ ] Test cloud hours cutoff (start cloud stream â hours exhausted â should auto-stop)
