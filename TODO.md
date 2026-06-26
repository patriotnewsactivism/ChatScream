# ChatScream — Post-Login Feature Audit & TODO

> **Created:** 2026-06-25  
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

## 1. 🔴 STREAMING TO YOUTUBE — Broken End-to-End

The #1 promised feature. OAuth connects, but the "Go Live" button doesn't reliably push video to YouTube.

### Root Causes

- **DestinationManager calls `/api/destinations/twitch/stream-key`** — this endpoint **does not exist** on the server. The server only has `/api/oauth/stream-key` (which works for YouTube only).
- **DestinationRouter sends WebM chunks via WebSocket to FFmpeg** — the server spawns FFmpeg to re-encode and push RTMP. This works **only if FFmpeg is installed on the server host**. Railway/Cloud Run containers do not include FFmpeg by default.
- **No validation that FFmpeg exists** — `spawn('ffmpeg', args)` silently fails on hosts without it. No user-facing error.
- **MediaRecorder codec mismatch** — Browser records WebM (VP8/VP9+Opus), FFmpeg re-encodes to H.264+AAC for RTMP. The `-re` (read at native rate) flag on pipe input causes buffering/timing issues with live WebSocket ingest.
- **No server URL defaults** — YouTube requires `rtmp://a.rtmp.youtube.com/live2/` but when a destination is added via OAuth, the `serverUrl` comes from the API's `ingestUrl`. If empty, nothing connects.
- **WebSocket connects to wrong URL in production** — `destinationRouter.ts` converts the API base URL to `wss://` for the ingest WebSocket, but Vercel (frontend host) doesn't handle WebSocket. The backend (Railway) does, but the URL resolution may not match.

### Fixes

- [ ] 🔴 **Add FFmpeg to Docker/deployment** — Include `ffmpeg` in the Dockerfile and Railway nixpacks config
- [ ] 🔴 **Validate FFmpeg availability on server startup** — Check `which ffmpeg` at boot and log a clear error if missing
- [ ] 🔴 **Fix FFmpeg args for WebSocket ingest** — Remove `-re` flag (causes timing drift on pipe input), add `-fflags +nobuffer -flags low_delay` for low-latency live ingest
- [ ] 🔴 **Default RTMP server URLs per platform** — If `serverUrl` is empty, auto-fill the standard RTMP ingest URL for each platform (YouTube, Facebook, Twitch, etc.)
- [ ] 🔴 **Show user-facing error when FFmpeg spawn fails** — Catch `proc.on('error')` and send actionable WebSocket error message back to client
- [ ] 🟡 **WebSocket URL resolution** — Ensure `destinationRouter.ts` always connects to the API server (Railway/Cloud Run), never to the Vercel frontend origin

---

## 2. 🔴 STREAMING TO FACEBOOK — Missing Flow

- [ ] 🔴 **Facebook "Create Live" returns `streamUrl` but no `streamKey`** — The `/api/destinations/facebook/create-live` endpoint creates a live video and returns `stream_url`. But the DestinationManager sets `streamKey: ''` and `serverUrl: data.streamUrl`. The FFmpeg pipeline expects `serverUrl + streamKey` for RTMP push, so this fails silently.
- [ ] 🔴 **Facebook tokens expire quickly** — No auto-refresh for Facebook tokens. YouTube has `refreshStoredYouTubeAccessToken`, but Facebook has nothing equivalent.
- [ ] 🟡 **Facebook Page selection** — When user has multiple Pages, there's no picker UI. It always goes to the personal profile.

---

## 3. 🔴 STREAMING TO TWITCH — Missing Backend Endpoint

- [ ] 🔴 **`/api/destinations/twitch/stream-key` does not exist** — `DestinationManager.tsx` line ~372 calls this endpoint to fetch the Twitch stream key after OAuth. The server has no such route. Only `/api/oauth/stream-key` exists, and it returns 501 for non-YouTube platforms.
- [ ] 🔴 **Implement Twitch stream key retrieval** — Use the stored Twitch OAuth token + Twitch Helix API `GET /channels` to fetch the stream key, then add a server route for it
- [ ] 🟡 **Twitch ingest URL auto-detection** — Use Twitch Ingests API to find the nearest RTMP server rather than requiring manual entry

---

## 4. 🔴 ONE-CLICK "GO LIVE" FLOW — Disconnected Pipeline

The promised "simple button click initiates connections" doesn't work because the pipeline is fragmented.

- [ ] 🔴 **Wire one-click flow: OAuth → Stream Key → Destination → Go Live** — When user clicks "Go Live" with an OAuth-connected platform, automatically: (1) refresh token if expired, (2) fetch/create stream key, (3) populate destination with correct `serverUrl` + `streamKey`, (4) start RTMP via WebSocket→FFmpeg pipeline
- [ ] 🔴 **Pre-flight validation before Go Live** — Check all enabled destinations have valid `streamKey` + `serverUrl` before starting. Show specific errors per destination (e.g. "YouTube: No stream key — click to set up")
- [ ] 🟡 **Destination status indicators** — Currently destinations show 'offline'/'connecting'/'live'/'error' but the status is set optimistically with a `setTimeout(1500)` — no real confirmation from FFmpeg/RTMP that the connection succeeded
- [ ] 🟡 **Error recovery** — If one destination fails, the entire FFmpeg process dies. Implement per-destination FFmpeg processes or use tee muxer for independent streams

---

## 5. 🟡 RECORDING / SAVING PRODUCTION — Quality Issues

- [ ] 🟡 **Recording uses `useLocalRecording` hook with browser MediaRecorder** — Output quality is limited by browser codec support. VP8/WebM is the most common fallback. Many browsers don't support H.264 in MediaRecorder.
- [ ] 🟡 **No server-side recording** — The `RecordingManager` service class exists but is **never used** in `App.tsx`. All recording is client-side only.
- [ ] 🟡 **Recording download is auto-triggered** — When recording stops, it immediately triggers a browser download. No preview, no confirmation, no choice of format/quality.
- [ ] 🟡 **No recording quality settings UI** — `useLocalRecording` accepts quality config but the UI has no settings panel for it.
- [ ] 🟡 **Large recordings crash mobile** — Even with chunking/IndexedDB, stitching all chunks into a single Blob for download can OOM on phones. Need streaming download or server-side assembly.
- [ ] 🟢 **MP4 preference not working** — `pickMimeType()` tries MP4 first but most browsers don't support `video/mp4` in MediaRecorder. Result is always WebM. Consider using `mp4-muxer` or `@aspect-build/mp4-muxer` for proper MP4 output.

---

## 6. 🟡 OAUTH SETUP & CONFIGURATION

- [ ] 🟡 **OAuth client IDs must be configured via Admin Portal** — New users have no idea where to get or paste client IDs. Need guided setup or pre-configured defaults for the hosted version.
- [ ] 🟡 **OAuth redirect URI mismatch** — Frontend uses `window.location.origin + '/oauth/callback'` but some server routes use `/api/auth/oauth/google/callback`. These are two completely different flows (frontend popup vs server-side redirect). The dual-path creates confusion.
- [ ] 🟡 **OAuth popup blocked on mobile** — `initiateOAuth()` opens a popup, which is blocked by default on mobile browsers. The fallback opens a new tab, which loses the postMessage connection.
- [ ] 🟢 **TikTok OAuth incomplete** — Only `user.info.basic` scope requested. TikTok LIVE requires `live.room.manage` scope + approved live access.

---

## 7. 🟡 CANVAS COMPOSITOR & VIDEO QUALITY

- [ ] 🟡 **Canvas is hardcoded to 1280×720** — No option for 1080p output. The canvas, watermark, and all layout calculations assume 720p.
- [ ] 🟡 **Canvas captureStream FPS not configurable** — `canvas.captureStream(30)` is hardcoded. Should match recording/streaming settings.
- [ ] 🟢 **No GPU acceleration** — Canvas 2D rendering loop uses `requestAnimationFrame` with CPU-bound `drawImage`. For complex scenes with overlays/graphics, this drops frames on mobile.

---

## 8. 🟡 SCENE MANAGEMENT

- [ ] 🟡 **Scenes are not persisted** — Scene configurations exist in-memory only. Refreshing the page loses all scene setups.
- [ ] 🟡 **Scene transitions** — No cross-fade, cut, or transition effects between scenes. Just an instant swap.
- [ ] 🟢 **Scene presets** — No built-in presets for common layouts (interview, gaming, presentation).

---

## 9. 🟡 CHAT / CHAT SCREAMER

- [ ] 🟡 **Chat aggregation only works with manual API polling** — `chatAggregator.ts` exists but isn't integrated with live platform chats (YouTube Live Chat API, Twitch IRC, etc.)
- [ ] 🟡 **Scream donations are demo-only** — `ScreamDonation` component triggers demo alerts but has no real Stripe payment flow connected for viewer donations
- [ ] 🟢 **Chat overlay on stream** — `ChatStreamOverlay.tsx` exists but the integration with the canvas compositor to actually render chat on the output stream is unclear

---

## 10. 🟡 POST-STREAM ANALYTICS

- [ ] 🟡 **PostStreamPanel shows transcript and evidence markers** — But actual stream analytics (viewer count, engagement, chat volume) are empty because there's no live data feed from platforms
- [ ] 🟡 **StreamAnalyticsDashboard** — Relies on `streamAnalytics.ts` which tracks local metrics only. No YouTube Analytics API or Twitch analytics integration
- [ ] 🟢 **Analytics data not persisted** — All analytics are lost on page refresh

---

## 11. 🟢 CLOUD STREAMING (VM-BASED)

- [ ] 🟢 **Entire cloud streaming backend is mock** — As stated in `cloudStreamingService.ts` header: "EC2 Backend: NOT YET DEPLOYED — server routes return mock/seeded data"
- [ ] 🟢 **Cloud streaming session start/end APIs return mock data** — Works for UI display but doesn't actually provision any cloud resources
- [ ] 🟢 **Cost estimation is local-only** — Uses hardcoded rates, no real AWS pricing API integration

---

## 12. 🟢 ADDITIONAL GAPS

- [ ] 🟢 **Stream scheduler** — `StreamScheduler` component + `streamScheduler.ts` service exist but scheduling doesn't auto-trigger a stream start
- [ ] 🟢 **Bitrate adaptation** — `bitrateAdaptation.ts` is fully implemented but never wired into the streaming pipeline
- [ ] 🟢 **Stream health monitor** — `streamHealthMonitor.ts` exists but isn't displayed in the studio UI during streaming
- [ ] 🟢 **WebRTC guest cameras** — `webrtcGuestService.ts` creates signaling rooms but the guest video feed isn't composited into the canvas output
- [ ] 🟢 **Music player audio routing** — MusicPlayer plays audio but the audio pipeline integration depends on `useAudioPipeline` receiving the `musicElement` ref correctly — needs verification
- [ ] 🟢 **Keyboard shortcuts** — Defined in `useKeyboardShortcuts` but some mappings (e.g., fullscreen = toggleCamera) are incorrect

---

## Fix Priority Order

1. **FFmpeg in deployment** — Nothing works without it
2. **Fix FFmpeg args** — Remove `-re`, add low-latency flags
3. **Default RTMP URLs** — So YouTube/Facebook destinations have valid server URLs
4. **Twitch stream key endpoint** — Implement `/api/destinations/twitch/stream-key`
5. **Facebook stream URL handling** — Parse `stream_url` into `serverUrl` + `streamKey`
6. **Pre-flight validation** — Check destinations before Go Live
7. **One-click Go Live flow** — Auto-fetch stream keys, validate, then start
8. **Recording quality** — MP4 output, quality settings UI
9. **WebSocket URL fix** — Ensure production connects to correct backend
10. **User-facing errors** — Replace silent failures with actionable messages

---

_This document is a living TODO. Items will be checked off as they are fixed and verified._
