# ChatScream Wiring TODO

## Priority Legend

- ð´ **BLOCKER** â must fix before anything works
- ð¡ **HIGH** â core feature, users will notice
- ð¢ **MEDIUM** â important but not blocking
- ðµ **LOW** â nice to have

---

## ð´ Phase 1: Backend â Missing APIs

- [ ] Add `POST /api/scream/checkout` endpoint in `server/app.js` (ScreamDonation.tsx depends on it)
- [ ] Add `POST /api/scream/webhook` for Stripe event processing
- [ ] Verify Stripe webhook secret is validated properly
- [ ] Add scream event broadcasting via WebSocket rooms
- [ ] Run `npm run typecheck` and fix all TypeScript errors

## ð¡ Phase 2: Backend â Data & Integration

- [ ] Add `GET /api/leaderboard` endpoint
- [ ] Add `GET /api/leaderboard/stats` endpoint
- [ ] Add `POST /api/leaderboard/reset` (admin only)
- [ ] Wire store.js `updateLeaderboardEntry` to scream creation
- [ ] Verify `GET /api/schedules`, `PUT /api/schedule`, `DELETE /api/schedule/:id` endpoints in store.js
- [ ] Add `POST /api/scenes` / `GET /api/scenes` / `PUT /api/scenes/:id` endpoints
- [ ] Add `GET /api/analytics/overview` endpoint for dashboard

## ð¡ Phase 3: Studio â Streaming & Compositing

- [ ] Fix `VideoTransportBar` null-duration issue (bar disappears on mount)
- [ ] Ensure video auto-play fallback UI (user gesture requirement)
- [ ] Connect scene video sources to `useAudioPipeline` gain nodes
- [ ] Verify `combinedStream` audio â `MediaStream` tracks in `handleBroadcast`
- [ ] Test WebSocket RTMP ingest end-to-end (browser â FFmpeg â YouTube)
- [ ] Fix `ProgramPreview` multiview audio routing (preview muted, program live)

## ð´ Phase 4: Studio â Scream Alerts

- [ ] Wire scream WebSocket room in `server/index.js` for real scream events
- [ ] Create `ScreamOverlay` HTML/CSS component with CSS keyframe animations
- [ ] Remove or deprecate canvas-based scream rendering in `CanvasCompositor`
- [ ] Connect `playScreamSound()` to real scream events from server
- [ ] Add `generateScreamTTS()` integration for text-to-speech

## ð¡ Phase 5: Creator Dashboard

- [ ] Replace static mock broadcast cards with real API data
- [ ] Wire `GET /api/analytics/overview` data to dashboard charts
- [ ] Add auto-profile-refresh after Stripe checkout success
- [ ] Handle `?checkout=success` query param on dashboard redirect
- [ ] Add weekly leaderboard section to dashboard
- [ ] Add "Manage Platform Connection" action buttons on destination cards

## ð¢ Phase 6: Studio UX

- [ ] Add recording status bar with elapsed time and file size
- [ ] Test recording pause/resume end-to-end
- [ ] Persist scenes to backend API
- [ ] Wire stream scheduler to backend schedules
- [ ] Test mobile: camera flip, recording, PWA install
- [ ] Test guest camera: invite link â WebRTC â compositing

## ðµ Phase 7: Infrastructure & Quality

- [ ] Run `npm run build` and verify production output
- [ ] Run `npm run test -- --run` and fix failures
- [ ] Add tests for new scream/checkout API
- [ ] Create working `.env` from `.env.example`
- [ ] Ensure FFmpeg install script works for deployment
- [ ] Add rate limiting to auth and scream endpoints
- [ ] Validate Stripe webhook signatures with `stripe.webhooks.constructEvent`
- [ ] Run full manual test checklist (see plan.md Â§6.3)
