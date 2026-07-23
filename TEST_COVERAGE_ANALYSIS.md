# Test Coverage Analysis

## Current State

The project uses **Vitest** for unit tests and **Playwright** for E2E tests.

### Tested (12 test files)

| Area | Tested files |
|---|---|
| `services/` | `aiClient`, `apiClient`, `env`, `backend` (config) |
| `contexts/` | `AuthContext` |
| `hooks/` | `useMobileLayout`, `useViralContent` |
| `components/` | `AuthStatusBanner`, `DestinationManager`, `ProtectedRoute` |
| `pages/` | `CreatorDashboard`, `StaticPages` |

### Not tested (significant source files)

**Services** (16 untested):
`sanitize`, `stripe`, `streamEnforcement`, `bitrateAdaptation`, `streamHealthMonitor`,
`streamAnalytics`, `sceneManager`, `destinationRouter`, `claudeService`, `geminiService`,
`realtimeChat`, `cloudStreamingService`, `recordingManager`, `oauthService`, `chatScreamer`,
`screamLeaderboard`, `streamScheduler`, `RTMPSender`, `sentry`

**Hooks** (2 untested): `useAudioPipeline`, `useRealtimeChat`

**Components** (15 untested): `ErrorBoundary`, `ChunkErrorBoundary`, `AudioMixer`, `ChatStream`,
`ChatStreamOverlay`, `CanvasCompositor`, `MediaBin`, `LayoutSelector`, `BackgroundSelector`,
`SceneSelector`, `MusicPlayer`, `BrandingPanel`, `BackendStatusCard`, `OAuthSetup`,
`StreamAnalyticsDashboard`, `AnalyticsDashboard`

**Pages** (3 untested): `AuthPage`, `OAuthCallback`, `AdminPage`

---

## Proposed Improvements (Priority Order)

### 1. `services/sanitize.ts` â **Critical priority**

Security-critical XSS protection used across the app. Every function is a pure utility with
no external dependencies, making this the easiest and highest-value file to test.

**What to test:**
- `escapeHtml`: all HTML entity characters (`& < > " ' / \` =`), empty/non-string inputs
- `stripHtml`: removes `<script>` and `<style>` blocks, inline tags, leaves plain text intact
- `sanitizeUrl`: blocks `javascript:`, `data:`, `vbscript:` â allows `http/https`, relative paths, `mailto`, `tel`; prepends `https://` to bare domains
- `sanitizeStreamKey`: strips non-alphanumeric/dash/underscore, enforces 200-char limit
- `sanitizeChatMessage`: strips HTML, collapses 3+ newlines to 2, enforces 500-char limit
- `isValidEmail`: valid/invalid email formats, edge cases (no @, multiple @, etc.)
- `sanitizeJson`: valid JSON, malformed JSON (uses fallback), type mismatch fallback
- `RateLimiter.canProceed`: allows requests within window, blocks when limit reached, resets correctly across time windows

---

### 2. `services/stripe.ts` â **Critical priority**

Core business logic that controls feature access, destination limits, and billing. Pure
functions with no network calls â entirely unit-testable.

**What to test:**
- `canAddDestination`: free (1 dest limit), pro (3), expert (5), enterprise (unlimited/-1), invalid plan
- `canUseCloudStreaming`: free plan blocked, pro/expert within hours, hours exhausted, unlimited
- `getRemainingCloudHours`: correct remaining/percentUsed calculation, zero-total plan
- `planHasWatermark`: free returns true, paid plans return false, unknown plan defaults to true
- `hasFeatureAccess`: at limit, under limit, unlimited (-1) plans
- `getScreamTier`: below $5 returns null, $5â$9.99 â standard, $10â$49.99 â loud, $50+ â maximum
- `calculateDiscountedPrice`: correct discount math, zero discount, 100% discount
- `formatPrice`: USD currency formatting, $0, fractional dollars

---

### 3. `services/streamEnforcement.ts` â **High priority**

`StreamEnforcementService` enforces subscription limits at runtime. It has complex branching
logic that combines results from `stripe.ts` functions. Bugs here would let users exceed
their plan limits.

**What to test:**
- `validateStreamRequest`: approved request (all within limits), destination violation, cloud hours violation, watermark flag set correctly for free plan, simultaneous violations
- `enforceDestinationAdd`: allowed when under limit, rejected when at/over limit, upgrade recommendation present on rejection
- `checkCloudHoursCutoff`: unlimited plan never cuts off, hours exhausted triggers cutoff, `<15 min` warning, invalid plan triggers cutoff
- `splitDestinationsByEnforcement`: correct allowed/rejected split for each plan tier
- `getAuditLogs`: returns only logs for given userId, respects limit parameter, log cap of 1000
- `getEnforcementStats`: correct totals across allowed/rejected/warning

---

### 4. `services/claudeService.ts` â **High priority**

Contains important pure logic that is currently untested, despite `useViralContent` being
tested (which calls this service via a mock).

**What to test:**
- `fallbackViralPackage`: generates correct hashtag from topic slug, handles special characters, enforces title length â¤60, description â¤220, max 12 hashtags and 15 tags
- `requireAuthToken`: throws on null/empty token, returns token when present
- `generateAutoResponse` (FAQ matching): returns matched FAQ answer when keyword found, falls back to default message when no match
- `generateViralStreamPackage`: uses fallback when API call throws, merges API response with fallback when arrays are empty
- `generateEngagementPrompt`: includes topic prefix when provided, includes viewer count hint

---

### 5. `services/bitrateAdaptation.ts` â **Medium priority**

Complex algorithmic code that directly affects stream quality decisions. The calculation
logic is deterministic and fully unit-testable without browser APIs.

**What to test:**
- `selectProfile` (via `getCurrentProfile()`): 480p for low bitrate, 720p, 1080p30, 1080p60 thresholds
- `calculateOptimalBitrate` (indirectly via `updateNetworkConditions` + adaptation): packet loss penalty, RTT penalty, min/max clamp
- `getSafetyMargin`: conservative (0.4), balanced (0.25), aggressive (0.15)
- `calculateStabilityScore`: 100 for <2 samples, scores drop with high bandwidth variance
- `predictNextBitrate`: requires â¥5 history samples, linear trend extrapolation
- `setManualBitrate`: disables adaptation, updates profile, fires callback
- `updateConfig`: merges partial config correctly

---

### 6. `services/streamHealthMonitor.ts` â **Medium priority**

`analyzeHealth` has deterministic threshold comparisons that are good unit test targets.
`getOverallStatus` aggregates health across multiple destinations.

**What to test:**
- `analyzeHealth`: bitrate below threshold â warning; bitrate < 50% of target â critical; FPS, dropped frames, RTT, packet loss, CPU, memory, encoder thresholds all fire correct severity
- `isHealthy`: false when any critical warning present, true otherwise
- `getOverallStatus`: excellent (no warnings), good (some warnings), fair (>50% with warnings), poor (any critical), critical (>50% critical)
- `addDestination` / `removeDestination`: health map updated correctly
- `updateTargetBitrate` / `updateTargetFps`: reflected in subsequent health checks

---

### 7. `components/ErrorBoundary.tsx` and `ChunkErrorBoundary.tsx` â **Medium priority**

Error boundaries are often forgotten in test suites. They need to correctly catch render
errors and display fallback UIs rather than crashing the application.

**What to test:**
- Renders children normally when no error occurs
- Catches a render error from a child component and displays fallback UI (not re-throwing)
- Fallback UI contains actionable text (e.g. reload button)
- Error is not propagated to the parent tree

---

### 8. `hooks/useRealtimeChat.ts` â **Medium priority**

Manages live chat state â connection status, message list, error handling, send throttling.
Fully testable by mocking `subscribeToChat` and `sendChatMessage` from `realtimeChat.ts`.

**What to test:**
- Does not subscribe when `enabled=false` or `streamId` is empty
- Sets `isConnected=true` and populates `messages` on successful subscription
- Sets `isConnected=false` and `error` when subscription error fires
- `sendMessage`: trims whitespace, guards against empty content, sets `isSending` during send, returns `true` on success / `false` on error
- Unsubscribes and resets `isConnected` on unmount

---

### 9. `pages/AuthPage.tsx` and `pages/OAuthCallback.tsx` â **Medium priority**

Authentication entry points have zero tests. `OAuthCallback` in particular handles token
exchange and redirect logic that is easy to break silently.

**What to test for `AuthPage`:**
- Renders sign-in form by default, toggles to sign-up form
- Calls the correct auth method (`signInWithEmail`, `signInWithGoogle`, etc.)
- Displays error message on failed sign-in
- Redirects on successful login

**What to test for `OAuthCallback`:**
- Calls `completeRedirectSignIn` on mount
- Shows loading state while processing
- Redirects to dashboard on success
- Displays error message when redirect sign-in fails

---

## Summary Table

| File | Priority | Reason |
|---|---|---|
| `services/sanitize.ts` | Critical | Security (XSS), pure functions, zero effort |
| `services/stripe.ts` | Critical | Business rules (billing/limits), pure functions |
| `services/streamEnforcement.ts` | High | Subscription limit enforcement, complex branching |
| `services/claudeService.ts` | High | Fallback logic, auth gating, FAQ matching |
| `services/bitrateAdaptation.ts` | Medium | Complex algorithm, no browser API needed |
| `services/streamHealthMonitor.ts` | Medium | Threshold logic, deterministic |
| `components/ErrorBoundary.tsx` | Medium | Crash prevention, commonly missed |
| `hooks/useRealtimeChat.ts` | Medium | Chat state management |
| `pages/AuthPage.tsx` | Medium | Auth entry point |
| `pages/OAuthCallback.tsx` | Medium | OAuth flow correctness |
