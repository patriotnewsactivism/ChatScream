# ChatScream — Post-Login Feature Audit & TODO

> **Created:** 2026-06-25
> **Last audited:** 2026-08-09 — re-verified every item against the actual code (not just prior notes) and fixed what was found broken.
> **Status:** Active — Methodical fix-list after full codebase deep-dive
> **Goal:** Make every promised feature actually work end-to-end from the studio UI

---

## Legend

- `[ ]` — Not started
- `[/]` — In progress
- `[x]` — Complete
- 🔴 **CRITICAL** — Blocks core streaming functionality
- 🟡 **HIGH** — Significantly degrades user experience
- 🟢 **MEDIUM** — Feature gap / polish item

---

## 2026-08-09 session — what changed

Re-verified this whole document against `server/index.js`, `server/app.js`,
`services/destinationRouter.ts`, and `services/oauthService.ts`. Most of
Sections 1–3 below were already fixed in earlier work but never checked off
here — corrected that. Two real bugs were found and fixed:

- **`retry_destination` was a no-op.** `destinationRouter.ts` sends
  `{type: 'retry_destination', destId}` after a destination errors, but
  `server/index.js` never handled that message type — a failed destination
  could never recover without the user removing and re-adding it (which used
  to restart *every* destination, see next point).
- **One shared FFmpeg process for all destinations.** `server/index.js`
  multiplexed every RTMP output through a single `ffmpeg` invocation. A bad
  stream key on one platform, or any hot-swap of destinations, could take
  down (or glitch) the connection to every other platform. Refactored to one
  FFmpeg process per destination, diffed on `update_destinations` so only
  what actually changed respawns, with the WebM init segment cached so a
  destination added or retried mid-stream still gets a decodable stream.
- **`destinationRouter.removeDestination` dropped the `id`/`platform`/`name`
  fields** when sending the updated destination list to the server — only
  `serverUrl`/`streamKey` were included. Harmless under the old shared-process
  design, but would have broken destination identification under the new
  per-destination design. Fixed to match `addDestination`'s payload shape.
- **Cloud Streaming (VM-based) UI overstatement.** The landing page's "Cloud
  Power" section and the dashboard's "Cloud VM hours" tile presented an
  EC2-backed, always-on cloud encoding feature as if it were live (0%
  bandwidth, 4K, global edge network). The backend for it is mock-only (see
  §11) and no UI component even calls it. Reworked both to honest "Coming
  Soon" framing — the feature is still on the roadmap and actively wanted,
  just not implemented yet.

**Second pass, same day — the Chat Screamer (donation) pipeline:**

- **Scream alerts never reached the actual broadcast.** `App.tsx` hardcoded
  `activeScream={null}` into both canvas render paths, so the working
  canvas-drawing code for donation alerts in `CanvasCompositor.tsx` never
  received real data — alerts only ever appeared in the streamer's own
  browser (a separate HTML/CSS `ScreamOverlay`), never in the pixels
  actually sent to YouTube/Twitch/Facebook. Fixed by wiring the real
  `activeScream` state through.
- **No public page for viewers to actually pay.** `ScreamDonation.tsx` is a
  complete, real Stripe Checkout flow calling a working backend
  (`/api/billing/chatscream` → webhook → WebSocket broadcast), but no route
  ever rendered it. Added `/scream/:streamerUid` and `/thank-you` pages, plus
  a "Your ChatScream Link" card on the dashboard so streamers can find it.

See §9 for full details.

---

## 1. 🔴 STREAMING TO YOUTUBE — Working

The #1 promised feature. OAuth connects and "Go Live" pushes video to YouTube.

- [x] 🔴 **FFmpeg in Docker/deployment** — Included in the Dockerfile and Railway nixpacks config.
- [x] 🔴 **Validate FFmpeg availability on server startup** — `checkFfmpeg()` in `server/index.js` logs a clear warning if missing.
- [x] 🔴 **FFmpeg args for WebSocket ingest** — No `-re` flag; `-fflags +nobuffer+flush_packets -flags low_delay` for low-latency live ingest.
- [x] 🔴 **Default RTMP server URLs per platform** — `DEFAULT_RTMP_URLS` in `server/index.js` fills in the standard ingest URL when `serverUrl` is empty.
- [x] 🔴 **User-facing error when FFmpeg spawn fails** — `proc.on('error')` sends an actionable `destination_error` back to the client.
- [x] 🟡 **WebSocket URL resolution** — `destinationRouter.ts` always connects to the API server (via `getApiBaseUrl()`), never the frontend origin.

---

## 2. 🔴 STREAMING TO FACEBOOK — Working

- [x] 🔴 **Facebook "Create Live" returns `streamUrl` but no `streamKey`** — `DestinationManager.tsx` parses this into `serverUrl`/`streamKey`.
- [x] 🔴 **Facebook tokens auto-refresh** — `refreshFacebookTokenIfNeeded()` in `server/app.js` extends the token before any Graph API call needs it (create-live, pages list, ingest config).
- [x] 🟡 **Facebook Page selection** — Picker UI prompts for Pages vs Personal Profile.

---

## 3. 🔴 STREAMING TO TWITCH — Working

- [x] 🔴 **`/api/destinations/twitch/stream-key`** — Implemented, refreshes the Twitch token if it's within 5 minutes of expiry, then calls the Helix API.
- [x] 🟡 **Twitch ingest URL auto-detection** — Queries `https://ingest.twitch.tv/ingests` for the lowest-priority server and falls back to `rtmp://live.twitch.tv/app` if that lookup fails.

---

## 4. 🔴 ONE-CLICK "GO LIVE" FLOW — Working, now more resilient

- [x] 🔴 **Wire one-click flow: OAuth → Stream Key → Destination → Go Live** — `DestinationManager` fetches keys when adding a destination; `handleBroadcast` uses them automatically.
- [x] 🔴 **Pre-flight validation before Go Live** — Destination checks and error reporting before starting the router.
- [x] 🟡 **Destination status indicators** — `destination_connected`/`destination_error` events come from real FFmpeg stderr parsing per destination, not an optimistic timer.
- [x] 🟡 **Error recovery** — Fixed 2026-08-09: one FFmpeg process per destination (see session notes above). A dead stream key on Twitch no longer disturbs YouTube/Facebook, and `retry_destination` actually retries now.

---

## 5. 🟡 RECORDING / SAVING PRODUCTION — Quality Issues (open)

- [ ] 🟡 **Recording uses `useLocalRecording` hook with browser MediaRecorder** — Output quality is limited by browser codec support. VP8/WebM is the most common fallback.
- [ ] 🟡 **No server-side recording** — `RecordingManager` service class exists but is not used in `App.tsx`. All recording is client-side only.
- [ ] 🟡 **Recording download is auto-triggered** — No preview, no confirmation, no choice of format/quality.
- [ ] 🟡 **No recording quality settings UI**.
- [ ] 🟡 **Large recordings can crash mobile** — Stitching chunked IndexedDB blobs into one Blob for download can OOM on phones.
- [ ] 🟢 **MP4 preference not working** — `pickMimeType()` tries MP4 first but most browsers don't support `video/mp4` in `MediaRecorder`.

---

## 6. 🟡 OAUTH SETUP & CONFIGURATION

- [ ] 🟡 **OAuth client IDs must be configured via Admin Portal** — New users have no guided setup or pre-configured defaults for the hosted version.
- [x] 🟡 **OAuth redirect URI consistency** — `oauthService.ts` always derives `redirect_uri` from `window.location.origin`, so it matches whichever domain the user is on.
- [x] 🟡 **OAuth popup blocked on mobile** — Mobile skips the popup entirely and opens a new tab synchronously on the user gesture; desktop uses a centered popup.
- [/] 🟢 **TikTok OAuth** — Requests `live.room.manage` + `video.upload` scopes correctly, but TikTok LIVE access still requires TikTok's own partner/API approval process before those scopes actually grant streaming rights. This is an external approval gate, not something fixable in this codebase alone.

---

## 7. 🟡 CANVAS COMPOSITOR & VIDEO QUALITY (open)

- [ ] 🟡 **Canvas is hardcoded to 1280×720** — No 1080p output option.
- [ ] 🟡 **Canvas captureStream FPS not configurable** — `canvas.captureStream(30)` is hardcoded.
- [ ] 🟢 **No GPU acceleration** — CPU-bound `drawImage` loop drops frames on mobile with complex overlays.

---

## 8. 🟡 SCENE MANAGEMENT (open)

- [ ] 🟡 **Scenes are not persisted** — In-memory only; refresh loses all scene setups.
- [ ] 🟡 **Scene transitions** — No cross-fade/cut effects, just an instant swap.
- [ ] 🟢 **Scene presets** — No built-in layout presets.

---

## 9. 🟡 CHAT / CHAT SCREAMER

The Chat Screamer donation pipeline was **not demo-only** — it was real
end-to-end (Stripe Checkout → webhook → leaderboard → WebSocket broadcast)
but disconnected at both ends: nothing let a viewer reach the payment form,
and the alert never made it into the actual broadcast frame. Fixed
2026-08-09.

- [x] 🔴 **Scream alerts never appeared in the actual stream** — `App.tsx` hardcoded `activeScream={null}` when rendering both `CanvasCompositor` and `ProgramPreview`'s program canvas, so the alert only ever showed in the streamer's local browser (`ScreamOverlay`, an HTML/CSS layer) and never in the pixels `canvas.captureStream()` sends to YouTube/Twitch/Facebook. `CanvasCompositor` already had working canvas-drawing code for `activeScream` (tier styling, shake/explode effects, donor/message text) — it just never received real data. Fixed by passing the real `activeScream` state through both render paths.
- [x] 🔴 **No public page for viewers to actually send a scream** — `components/ScreamDonation.tsx` is a fully built Stripe Checkout flow that calls a real, working backend (`POST /api/billing/chatscream` → `checkout.session.completed` webhook → `broadcastScreamAlert` → `/ws/scream/:uid`), but it was never rendered by any route. Added a public `/scream/:streamerUid` page (`pages/ScreamPage.tsx`) and a `/thank-you` post-checkout confirmation page (`pages/ThankYouPage.tsx`, matching the `successUrl` `ScreamDonation` already builds). Added a "Your ChatScream Link" card to the creator dashboard so streamers can find and copy their link (mirrors the existing referral-link card).
- [ ] 🟡 **Chat aggregation only works with manual API polling** — `chatAggregator.ts` isn't integrated with live platform chats (YouTube Live Chat API, Twitch IRC, etc.), so a scream can only be triggered by paying through the new `/scream/:uid` page, not by typing in platform chat.
- [ ] 🟢 **Chat overlay on stream** — Integration between `ChatStreamOverlay.tsx` (regular chat, not screams) and the canvas compositor is still unclear/unverified.
- [ ] 🟢 **No Stripe Connect payout flow** — Donation money currently flows into the platform's own Stripe account; there's no per-streamer Connect onboarding, so streamers aren't actually paid out from these donations yet. This is a substantial feature on its own (KYC, account links, transfers) and wasn't attempted here.

---

## 10. 🟡 POST-STREAM ANALYTICS (open)

- [ ] 🟡 **PostStreamPanel** shows transcript/evidence markers, but real engagement analytics are empty — no live data feed from platforms.
- [ ] 🟡 **StreamAnalyticsDashboard** — Local metrics only; no YouTube Analytics/Twitch analytics integration.
- [ ] 🟢 **Analytics data not persisted** — Lost on page refresh.

---

## 11. 🟢 CLOUD STREAMING (VM-based) — Not implemented, actively wanted

This is a separate feature from the multi-destination relay in §1–4 above
(which *is* real and working): an always-on, browser-independent cloud
encoding session (EC2-backed) so a stream can keep running without a live
browser tab, with true zero-bandwidth encoding.

- [ ] 🟢 **Entire cloud streaming backend is mock** — `cloudStreamingService.ts` and the `/api/cloud-streaming/*` routes in `server/app.js` return seeded/mock data; no EC2 instance is ever provisioned. Neither is currently wired into any UI component (`cloudStreamingService.ts` and `services/streamEnforcement.ts` are unused today), so this poses no risk of a user hitting a fake "live" cloud session — but the UI previously implied otherwise (fixed 2026-08-09, see session notes).
- [ ] 🟢 **Cloud streaming session start/end APIs return mock data** — Works for UI display but doesn't provision any cloud resources.
- [ ] 🟢 **Cost estimation is local-only** — Hardcoded rates, no real AWS pricing API integration.

**Status:** This is a real roadmap item the team is adamantly working toward,
not abandoned — it's just not ready. The landing page and dashboard now say
so explicitly ("Coming Soon" badges) instead of claiming it works today.

---

## 12. 🟢 ADDITIONAL GAPS (open)

- [ ] 🟢 **Stream scheduler** — `StreamScheduler`/`streamScheduler.ts` exist but scheduling doesn't auto-trigger a stream start.
- [ ] 🟢 **Bitrate adaptation** — `bitrateAdaptation.ts` is fully implemented but never wired into the streaming pipeline.
- [ ] 🟢 **Stream health monitor** — `streamHealthMonitor.ts` exists but isn't displayed in the studio UI during streaming.
- [ ] 🟢 **WebRTC guest cameras** — `webrtcGuestService.ts` creates signaling rooms but the guest video feed isn't composited into the canvas output.
- [ ] 🟢 **Music player audio routing** — Needs verification that `useAudioPipeline` receives the `musicElement` ref correctly.
- [ ] 🟢 **Keyboard shortcuts** — Some mappings (e.g. fullscreen = toggleCamera) are incorrect.

---

## 13. ⚠️ Known test-suite gap (unrelated to streaming, flagged for visibility)

Running `npx vitest run` currently fails ~33 of 44 test files with module
resolution errors — they import packages that were never added to
`package.json` (`@reduxjs/toolkit`, `react-redux`, `@testing-library/dom`,
`@testing-library/react-hooks`, plus a few source modules like
`chatFiltersSlice`/`chatHelpers` that don't exist). This looks like leftover
scaffolding from an abandoned Redux migration / caption feature branch that
got merged in a broken state. `typecheck`, `build`, and the server/OAuth
tests that do run (80 tests, all green) are unaffected. Worth a dedicated
cleanup pass, but out of scope for the streaming work in this session.

---

## Fix Priority Order (remaining)

1. **Stripe Connect payouts** — streamers aren't actually paid from ChatScream donations yet; the money has nowhere to go but the platform account.
2. **Live chat integration** — YouTube Live Chat API / Twitch IRC, so Screams can trigger from real chat, not just the `/scream/:uid` payment page.
3. **Server-side recording** — wire up `RecordingManager`, add quality settings UI.
4. **Scene persistence** — save scene configs so refresh doesn't wipe them.
5. **Cloud Streaming (VM-based)** — build the real EC2-backed encoding path; currently mock-only and clearly labeled "Coming Soon" in the UI.
6. **1080p canvas output** — lift the 720p hardcode.
7. **Test suite dependency cleanup** — restore or remove the ~33 broken test files.

---

_This document is a living TODO. Items will be checked off as they are fixed and verified._
