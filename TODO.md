# ChatScream â Post-Login Feature Audit & TODO

> **Created:** 2026-06-25  
> **Status:** Active â Methodical fix-list after full codebase deep-dive  
> **Goal:** Make every promised feature actually work end-to-end from the studio UI

---

## Legend

- `[ ]` â Not started
- `[/]` â In progress
- `[x]` â Complete
- ð´ **CRITICAL** â Blocks core streaming functionality
- ð¡ **HIGH** â Significantly degrades user experience
- ð¢ **MEDIUM** â Feature gap / polish item

---

## 1. ð´ STREAMING TO YOUTUBE â Broken End-to-End

The #1 promised feature. OAuth connects, but the "Go Live" button doesn't reliably push video to YouTube.

### Root Causes

- **DestinationManager calls `/api/destinations/twitch/stream-key`** â this endpoint **does not exist** on the server. The server only has `/api/oauth/stream-key` (which works for YouTube only).
- **DestinationRouter sends WebM chunks via WebSocket to FFmpeg** â the server spawns FFmpeg to re-encode and push RTMP. This works **only if FFmpeg is installed on the server host**. Railway/Cloud Run containers do not include FFmpeg by default.
- **No validation that FFmpeg exists** â `spawn('ffmpeg', args)` silently fails on hosts without it. No user-facing error.
- **MediaRecorder codec mismatch** â Browser records WebM (VP8/VP9+Opus), FFmpeg re-encodes to H.264+AAC for RTMP. The `-re` (read at native rate) flag on pipe input causes buffering/timing issues with live WebSocket ingest.
- **No server URL defaults** â YouTube requires `rtmp://a.rtmp.youtube.com/live2/` but when a destination is added via OAuth, the `serverUrl` comes from the API's `ingestUrl`. If empty, nothing connects.
- **WebSocket connects to wrong URL in production** â `destinationRouter.ts` converts the API base URL to `wss://` for the ingest WebSocket, but Vercel (frontend host) doesn't handle WebSocket. The backend (Railway) does, but the URL resolution may not match.

### Fixes

- [x] ð´ **Add FFmpeg to Docker/deployment** â Include `ffmpeg` in the Dockerfile and Railway nixpacks config
- [x] ð´ **Validate FFmpeg availability on server startup** â Check `which ffmpeg` at boot and log a clear error if missing
- [x] ð´ **Fix FFmpeg args for WebSocket ingest** â Remove `-re` flag (causes timing drift on pipe input), add `-fflags +nobuffer -flags low_delay` for low-latency live ingest
- [x] ð´ **Default RTMP server URLs per platform** â If `serverUrl` is empty, auto-fill the standard RTMP ingest URL for each platform (YouTube, Facebook, Twitch, etc.)
- [x] ð´ **Show user-facing error when FFmpeg spawn fails** â Catch `proc.on('error')` and send actionable WebSocket error message back to client
- [x] ð¡ **WebSocket URL resolution** â Ensure `destinationRouter.ts` always connects to the API server (Railway/Cloud Run), never to the Vercel frontend origin

---

## 2. ð´ STREAMING TO FACEBOOK â Missing Flow

- [x] ð´ **Facebook "Create Live" returns `streamUrl` but no `streamKey`** â (Verified: `DestinationManager.tsx` already parses this into `serverUrl` and `streamKey`).
- [ ] ð´ **Facebook tokens expire quickly** â No auto-refresh for Facebook tokens. YouTube has `refreshStoredYouTubeAccessToken`, but Facebook has nothing equivalent.
- [x] ð¡ **Facebook Page selection** â (Verified: Picker UI already exists and prompts user for Pages vs Personal Profile).

---

## 3. ð´ STREAMING TO TWITCH â Missing Backend Endpoint

- [x] ð´ **`/api/destinations/twitch/stream-key` does not exist** â (Verified: It does exist and works properly).
- [x] ð´ **Implement Twitch stream key retrieval** â (Verified: Uses Twitch Helix API).
- [ ] ð¡ **Twitch ingest URL auto-detection** â Use Twitch Ingests API to find the nearest RTMP server rather than requiring manual entry

---

## 4. ð´ ONE-CLICK "GO LIVE" FLOW â Disconnected Pipeline

The promised "simple button click initiates connections" doesn't work because the pipeline is fragmented.

- [x] ð´ **Wire one-click flow: OAuth â Stream Key â Destination â Go Live** â (Verified: DestinationManager fetches keys when adding destination, and handleBroadcast uses them automatically).
- [x] ð´ **Pre-flight validation before Go Live** â Added destination checks and error reporting before starting `RTMPSender`.
- [ ] ð¡ **Destination status indicators** â Currently destinations show 'offline'/'connecting'/'live'/'error' but the status is set optimistically with a `setTimeout(1500)` â no real confirmation from FFmpeg/RTMP that the connection succeeded
- [ ] ð¡ **Error recovery** â If one destination fails, the entire FFmpeg process dies. Implement per-destination FFmpeg processes or use tee muxer for independent streams

---

## 5. ð¡ RECORDING / SAVING PRODUCTION â Quality Issues

- [ ] ð¡ **Recording uses `useLocalRecording` hook with browser MediaRecorder** â Output quality is limited by browser codec support. VP8/WebM is the most common fallback. Many browsers don't support H.264 in MediaRecorder.
- [ ] ð¡ **No server-side recording** â The `RecordingManager` service class exists but is **never used** in `App.tsx`. All recording is client-side only.
- [ ] ð¡ **Recording download is auto-triggered** â When recording stops, it immediately triggers a browser download. No preview, no confirmation, no choice of format/quality.
- [ ] ð¡ **No recording quality settings UI** â `useLocalRecording` accepts quality config but the UI has no settings panel for it.
- [ ] ð¡ **Large recordings crash mobile** â Even with chunking/IndexedDB, stitching all chunks into a single Blob for download can OOM on phones. Need streaming download or server-side assembly.
- [ ] ð¢ **MP4 preference not working** â `pickMimeType()` tries MP4 first but most browsers don't support `video/mp4` in MediaRecorder. Result is always WebM. Consider using `mp4-muxer` or `@aspect-build/mp4-muxer` for proper MP4 output.

---

## 6. ð¡ OAUTH SETUP & CONFIGURATION

- [ ] ð¡ **OAuth client IDs must be configured via Admin Portal** â New users have no idea where to get or paste client IDs. Need guided setup or pre-configured defaults for the hosted version.
- [ ] ð¡ **OAuth redirect URI mismatch** â Frontend uses `window.location.origin + '/oauth/callback'` but some server routes use `/api/auth/oauth/google/callback`. These are two completely different flows (frontend popup vs server-side redirect). The dual-path creates confusion.
- [ ] ð¡ **OAuth popup blocked on mobile** â `initiateOAuth()` opens a popup, which is blocked by default on mobile browsers. The fallback opens a new tab, which loses the postMessage connection.
- [ ] ð¢ **TikTok OAuth incomplete** â Only `user.info.basic` scope requested. TikTok LIVE requires `live.room.manage` scope + approved live access.

---

## 7. ð¡ CANVAS COMPOSITOR & VIDEO QUALITY

- [ ] ð¡ **Canvas is hardcoded to 1280Ã720** â No option for 1080p output. The canvas, watermark, and all layout calculations assume 720p.
- [ ] ð¡ **Canvas captureStream FPS not configurable** â `canvas.captureStream(30)` is hardcoded. Should match recording/streaming settings.
- [ ] ð¢ **No GPU acceleration** â Canvas 2D rendering loop uses `requestAnimationFrame` with CPU-bound `drawImage`. For complex scenes with overlays/graphics, this drops frames on mobile.

---

## 8. ð¡ SCENE MANAGEMENT

- [ ] ð¡ **Scenes are not persisted** â Scene configurations exist in-memory only. Refreshing the page loses all scene setups.
- [ ] ð¡ **Scene transitions** â No cross-fade, cut, or transition effects between scenes. Just an instant swap.
- [ ] ð¢ **Scene presets** â No built-in presets for common layouts (interview, gaming, presentation).

---

## 9. ð¡ CHAT / CHAT SCREAMER

- [ ] ð¡ **Chat aggregation only works with manual API polling** â `chatAggregator.ts` exists but isn't integrated with live platform chats (YouTube Live Chat API, Twitch IRC, etc.)
- [ ] ð¡ **Scream donations are demo-only** â `ScreamDonation` component triggers demo alerts but has no real Stripe payment flow connected for viewer donations
- [ ] ð¢ **Chat overlay on stream** â `ChatStreamOverlay.tsx` exists but the integration with the canvas compositor to actually render chat on the output stream is unclear

---

## 10. ð¡ POST-STREAM ANALYTICS

- [ ] ð¡ **PostStreamPanel shows transcript and evidence markers** â But actual stream analytics (viewer count, engagement, chat volume) are empty because there's no live data feed from platforms
- [ ] ð¡ **StreamAnalyticsDashboard** â Relies on `streamAnalytics.ts` which tracks local metrics only. No YouTube Analytics API or Twitch analytics integration
- [ ] ð¢ **Analytics data not persisted** â All analytics are lost on page refresh

---

## 11. ð¢ CLOUD STREAMING (VM-BASED)

- [ ] ð¢ **Entire cloud streaming backend is mock** â As stated in `cloudStreamingService.ts` header: "EC2 Backend: NOT YET DEPLOYED â server routes return mock/seeded data"
- [ ] ð¢ **Cloud streaming session start/end APIs return mock data** â Works for UI display but doesn't actually provision any cloud resources
- [ ] ð¢ **Cost estimation is local-only** â Uses hardcoded rates, no real AWS pricing API integration

---

## 12. ð¢ ADDITIONAL GAPS

- [ ] ð¢ **Stream scheduler** â `StreamScheduler` component + `streamScheduler.ts` service exist but scheduling doesn't auto-trigger a stream start
- [ ] ð¢ **Bitrate adaptation** â `bitrateAdaptation.ts` is fully implemented but never wired into the streaming pipeline
- [ ] ð¢ **Stream health monitor** â `streamHealthMonitor.ts` exists but isn't displayed in the studio UI during streaming
- [ ] ð¢ **WebRTC guest cameras** â `webrtcGuestService.ts` creates signaling rooms but the guest video feed isn't composited into the canvas output
- [ ] ð¢ **Music player audio routing** â MusicPlayer plays audio but the audio pipeline integration depends on `useAudioPipeline` receiving the `musicElement` ref correctly â needs verification
- [ ] ð¢ **Keyboard shortcuts** â Defined in `useKeyboardShortcuts` but some mappings (e.g., fullscreen = toggleCamera) are incorrect

---

## Fix Priority Order

1. **FFmpeg in deployment** â Nothing works without it
2. **Fix FFmpeg args** â Remove `-re`, add low-latency flags
3. **Default RTMP URLs** â So YouTube/Facebook destinations have valid server URLs
4. **Twitch stream key endpoint** â Implement `/api/destinations/twitch/stream-key`
5. **Facebook stream URL handling** â Parse `stream_url` into `serverUrl` + `streamKey`
6. **Pre-flight validation** â Check destinations before Go Live
7. **One-click Go Live flow** â Auto-fetch stream keys, validate, then start
8. **Recording quality** â MP4 output, quality settings UI
9. **WebSocket URL fix** â Ensure production connects to correct backend
10. **User-facing errors** â Replace silent failures with actionable messages

---

_This document is a living TODO. Items will be checked off as they are fixed and verified._
