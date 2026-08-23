from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected patch anchor missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Server routes: AI Co-Host and private internal studio bridge.
replace_once(
    'server/app.js',
    "import publicCommercialRouter from './commercial/publicRouter.js';\n",
    "import publicCommercialRouter from './commercial/publicRouter.js';\n"
    "import aiModeratorRouter from './aiModerator/router.js';\n"
    "import { ingressRouter as internalStudioIngressRouter, adminRouter as internalStudioAdminRouter } from './internalBridge/router.js';\n",
)
replace_once(
    'server/app.js',
    "app.use('/api/cloud-v2', requireAuth, commercialRouter);\n",
    "app.use('/api/cloud-v2', requireAuth, commercialRouter);\n"
    "app.use('/api/ai-moderator', rateLimiter(60), requireAuth, aiModeratorRouter);\n"
    "app.use('/api/internal-studio/ingress', rateLimiter(60), internalStudioIngressRouter);\n"
    "app.use('/api/internal-studio/admin', rateLimiter(60), requireAuth, internalStudioAdminRouter);\n",
)

# Worker Python must declare mutable globals before first access.
replace_once(
    'infrastructure/aws/url-worker/worker.py',
    "def main():\n    signal.signal(signal.SIGTERM, handle_signal)\n",
    "def main():\n    global REGION, dynamodb\n    signal.signal(signal.SIGTERM, handle_signal)\n",
)
p = Path('infrastructure/aws/url-worker/worker.py')
text = p.read_text().replace(
    "    instance_id, detected_region = instance_identity()\n    global REGION, dynamodb\n",
    "    instance_id, detected_region = instance_identity()\n",
)
p.write_text(text)

# Cloud overage preference is durable/explicit before launching a worker.
replace_once(
    'services/cloudStreamingService.ts',
    "  recording?: boolean;\n}\n",
    "  recording?: boolean;\n  allowOverages?: boolean;\n}\n",
)
replace_once(
    'services/cloudStreamingService.ts',
    "// Reset cloud hours (called at billing period reset).\n",
    "export const setCloudOverages = async (enabled: boolean): Promise<boolean> => {\n"
    "  if (!hasToken()) return false;\n"
    "  try {\n"
    "    const response = await apiRequest<unknown>('/api/cloud-v2/overages', {\n"
    "      method: 'POST',\n"
    "      token: token(),\n"
    "      body: { enabled },\n"
    "    });\n"
    "    return asRecord(response).success !== false;\n"
    "  } catch (err) {\n"
    "    console.error('Error updating cloud overage preference:', err);\n"
    "    return false;\n"
    "  }\n"
    "};\n\n"
    "// Reset cloud hours (called at billing period reset).\n",
)
replace_once(
    'components/CloudBroadcastPanel.tsx',
    "  startCloudSession,\n  type CloudStreamingStatus,\n",
    "  startCloudSession,\n  setCloudOverages,\n  type CloudStreamingStatus,\n",
)
replace_once(
    'components/CloudBroadcastPanel.tsx',
    "    try {\n      const result = await startCloudSession(userId, userPlan, enabledDestinations.length, {\n",
    "    try {\n"
    "      const overageSaved = await setCloudOverages(allowOverages);\n"
    "      if (!overageSaved) {\n"
    "        setNotice('Could not save the cloud overage preference. No worker was started.');\n"
    "        return;\n"
    "      }\n"
    "      const result = await startCloudSession(userId, userPlan, enabledDestinations.length, {\n",
)
replace_once(
    'components/CloudBroadcastPanel.tsx',
    "        disabled={busy || !userId || (!active && !status?.canStream)}\n",
    "        disabled={busy || !userId || (!active && !status?.canStream && !allowOverages)}\n",
)

# Twitch OAuth must be reconnectable with chat write scopes for AI replies.
replace_once(
    'services/oauthService.ts',
    "          'user:read:email',\n          'channel:read:stream_key',\n",
    "          'user:read:email',\n          'chat:read',\n          'chat:edit',\n          'channel:read:stream_key',\n",
)

# Main Studio imports.
replace_once(
    'App.tsx',
    "import ChatStream from './components/ChatStream';\n",
    "import ChatStream from './components/ChatStream';\n"
    "import AIModeratorPanel from './components/AIModeratorPanel';\n"
    "import CloudBroadcastPanel from './components/CloudBroadcastPanel';\n",
)
replace_once(
    'App.tsx',
    "import { chatAggregator, AggregatedMessage } from './services/chatAggregator';\n",
    "import { chatAggregator, AggregatedMessage } from './services/chatAggregator';\n"
    "import { isAdminEmail } from './services/stripe';\n"
    "import { getInternalStudioBridgeState } from './services/internalStudioBridge';\n"
    "import {\n"
    "  evaluateWithAIModerator,\n"
    "  generateAIModeratorEngagement,\n"
    "  getAIModeratorConfig,\n"
    "  getDefaultAIModeratorConfig,\n"
    "  saveAIModeratorConfig,\n"
    "  type AIModeratorUsage,\n"
    "} from './services/aiModeratorService';\n",
)

# Studio state, durable AI config and private bridge cursor.
replace_once(
    'App.tsx',
    "  const [liveMessages, setLiveMessages] = useState<AggregatedMessage[]>([]);\n\n  // auto-captions\n",
    "  const [liveMessages, setLiveMessages] = useState<AggregatedMessage[]>([]);\n"
    "  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);\n"
    "  const commentPreviousLowerThirdRef = useRef<GraphicsState['lowerThird'] | null>(null);\n"
    "  const [aiModeratorConfig, setAiModeratorConfig] = useState(getDefaultAIModeratorConfig);\n"
    "  const [aiModeratorUsage, setAiModeratorUsage] = useState<AIModeratorUsage | null>(null);\n"
    "  const [aiModeratorAvailable, setAiModeratorAvailable] = useState(false);\n"
    "  const [aiModeratorSaving, setAiModeratorSaving] = useState(false);\n"
    "  const processedModeratorMessageIdsRef = useRef<Set<string>>(new Set());\n"
    "  const aiReplyTimesRef = useRef<number[]>([]);\n"
    "  const lastAiActionAtRef = useRef(0);\n"
    "  const lastChatActivityAtRef = useRef(Date.now());\n"
    "  const lastInternalBridgeEventRef = useRef<string | null>(null);\n\n"
    "  useEffect(() => {\n"
    "    if (!sessionToken) return;\n"
    "    let active = true;\n"
    "    void getAIModeratorConfig(sessionToken)\n"
    "      .then((result) => {\n"
    "        if (!active) return;\n"
    "        setAiModeratorConfig(result.config);\n"
    "        setAiModeratorUsage(result.usage);\n"
    "        setAiModeratorAvailable(result.available);\n"
    "      })\n"
    "      .catch((error) => console.warn('AI Co-Host config load failed:', error));\n"
    "    return () => {\n"
    "      active = false;\n"
    "    };\n"
    "  }, [sessionToken]);\n\n"
    "  // auto-captions\n",
)

# Creator controls + StreamYard-style tap-to-air comment highlighting.
marker = "  // ── media actions ──────────────────────────────────────────────────────────\n"
injection = r'''  const saveAIModeratorSettings = async () => {
    if (!sessionToken) return;
    setAiModeratorSaving(true);
    try {
      const result = await saveAIModeratorConfig(sessionToken, aiModeratorConfig);
      setAiModeratorConfig(result.config);
      setAiModeratorAvailable(result.available);
      setMobileTip('AI Co-Host settings saved');
    } catch (error) {
      console.error('Failed to save AI Co-Host settings:', error);
      setMobileTip('Could not save AI Co-Host settings');
    } finally {
      setAiModeratorSaving(false);
    }
  };

  const handleHighlightComment = useCallback(
    (message: AggregatedMessage) => {
      if (highlightedCommentId === message.id) {
        setHighlightedCommentId(null);
        setGraphicsState((state) => ({
          ...state,
          lowerThird:
            commentPreviousLowerThirdRef.current || { ...state.lowerThird, visible: false },
        }));
        commentPreviousLowerThirdRef.current = null;
        return;
      }

      if (!highlightedCommentId) {
        commentPreviousLowerThirdRef.current = { ...graphicsState.lowerThird };
      }

      const accent =
        message.platform === 'youtube'
          ? '#ef4444'
          : message.platform === 'facebook'
            ? '#3b82f6'
            : message.platform === 'twitch'
              ? '#a855f7'
              : '#6366f1';
      setHighlightedCommentId(message.id);
      setGraphicsState((state) => ({
        ...state,
        lowerThird: {
          ...state.lowerThird,
          visible: true,
          name: `${message.platform.toUpperCase()} • ${message.displayName}`.slice(0, 54),
          title: message.content.replace(/\s+/g, ' ').trim().slice(0, 120),
          bgColor: '#0f172a',
          accentColor: accent,
        },
      }));
    },
    [graphicsState.lowerThird, highlightedCommentId],
  );

'''
p = Path('App.tsx')
text = p.read_text()
if 'const saveAIModeratorSettings = async () =>' not in text:
    if marker not in text:
        raise SystemExit('App media-actions anchor missing')
    p.write_text(text.replace(marker, injection + marker, 1))

# AI live audience agent.
marker = "  // Handle legal citation overlay activation\n"
injection = r'''  useEffect(() => {
    if (!appState.isStreaming || !sessionToken || !aiModeratorConfig.enabled) return;

    const candidate = [...liveMessages]
      .reverse()
      .find(
        (message) =>
          message.platform !== 'local' &&
          !processedModeratorMessageIdsRef.current.has(message.id) &&
          !message.content.startsWith('[AI Co-Host]'),
      );
    if (!candidate) return;

    processedModeratorMessageIdsRef.current.add(candidate.id);
    if (processedModeratorMessageIdsRef.current.size > 1000) {
      processedModeratorMessageIdsRef.current = new Set([candidate.id]);
    }
    lastChatActivityAtRef.current = Date.now();

    const isQuestion = /\?|^(who|what|when|where|why|how|can|could|is|are|do|does|did|will|would)\b/i.test(
      candidate.content.trim(),
    );
    const isMention = /chat\s?scream|ai\s?co-?host|@chatscream/i.test(candidate.content);
    if ((!isQuestion || !aiModeratorConfig.autoReplyQuestions) && (!isMention || !aiModeratorConfig.respondToMentions)) {
      return;
    }

    const now = Date.now();
    aiReplyTimesRef.current = aiReplyTimesRef.current.filter((value) => now - value < 60_000);
    if (now - lastAiActionAtRef.current < aiModeratorConfig.cooldownSeconds * 1000) return;
    if (aiReplyTimesRef.current.length >= aiModeratorConfig.maxRepliesPerMinute) return;

    const recentChat = liveMessages.slice(-12).map((message) => ({
      displayName: message.displayName,
      content: message.content,
    }));
    const streamContext = [
      activeScene?.name ? `Scene: ${activeScene.name}` : '',
      branding.tickerText ? `Ticker: ${branding.tickerText}` : '',
      branding.presenterName ? `Host: ${branding.presenterName}` : '',
    ]
      .filter(Boolean)
      .join(' | ') || 'Live stream';
    const transcript = streamTranscript.exportTranscript().slice(-5000);

    void (async () => {
      try {
        const decision = await evaluateWithAIModerator(sessionToken, {
          message: candidate.content,
          viewerName: candidate.displayName,
          platform: candidate.platform,
          streamContext,
          transcript,
          recentChat,
        });
        if (decision.usage) setAiModeratorUsage(decision.usage);

        if (decision.action === 'flag') {
          chatAggregator.injectMessage({
            id: `ai_flag_${candidate.id}`,
            platform: 'local',
            displayName: 'AI Moderator',
            content: `Flagged ${candidate.displayName}: ${decision.reason || 'Review this message.'}`,
            createdAt: new Date(),
          });
          return;
        }
        if (!decision.reply) return;

        if (decision.action === 'suggest' || decision.confidence < 0.62 || !aiModeratorConfig.publicReplies) {
          chatAggregator.injectMessage({
            id: `ai_suggest_${candidate.id}`,
            platform: 'local',
            displayName: 'AI Suggestion',
            content: `Reply to ${candidate.displayName}: ${decision.reply}`,
            createdAt: new Date(),
          });
          return;
        }

        if (decision.action === 'reply') {
          const publicReply = `[AI Co-Host] @${candidate.displayName} ${decision.reply}`.slice(0, 450);
          const sent = await chatAggregator.sendMessage(candidate.platform, publicReply);
          if (sent) {
            const sentAt = Date.now();
            lastAiActionAtRef.current = sentAt;
            aiReplyTimesRef.current.push(sentAt);
            chatAggregator.injectMessage({
              id: `ai_sent_${candidate.id}`,
              platform: 'local',
              displayName: 'AI Co-Host',
              content: `Sent to ${candidate.platform}: ${publicReply}`,
              createdAt: new Date(),
            });
          }
        }
      } catch (error) {
        console.warn('AI Co-Host evaluation failed:', error);
      }
    })();
  }, [
    liveMessages,
    appState.isStreaming,
    sessionToken,
    aiModeratorConfig,
    activeScene?.name,
    branding.tickerText,
    branding.presenterName,
  ]);

  useEffect(() => {
    if (
      !appState.isStreaming ||
      !sessionToken ||
      !aiModeratorConfig.enabled ||
      aiModeratorConfig.mode !== 'autopilot' ||
      !aiModeratorConfig.engageQuietChat ||
      !aiModeratorConfig.publicReplies
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastChatActivityAtRef.current < aiModeratorConfig.quietAfterSeconds * 1000) return;
      aiReplyTimesRef.current = aiReplyTimesRef.current.filter((value) => now - value < 60_000);
      if (now - lastAiActionAtRef.current < aiModeratorConfig.cooldownSeconds * 1000) return;
      if (aiReplyTimesRef.current.length >= aiModeratorConfig.maxRepliesPerMinute) return;
      if (chatAggregator.getActivePlatforms().length === 0) return;

      lastChatActivityAtRef.current = now;
      const recentChat = liveMessages.slice(-12).map((message) => ({
        displayName: message.displayName,
        content: message.content,
      }));
      const streamContext = activeScene?.name || branding.tickerText || 'Live stream';
      const transcript = streamTranscript.exportTranscript().slice(-5000);

      void (async () => {
        try {
          const result = await generateAIModeratorEngagement(sessionToken, {
            streamContext,
            transcript,
            recentChat,
          });
          if (result.usage) setAiModeratorUsage(result.usage);
          if (!result.message) return;
          const publicMessage = `[AI Co-Host] ${result.message}`.slice(0, 450);
          const platforms = await chatAggregator.sendToActivePlatforms(publicMessage);
          if (platforms.length > 0) {
            const sentAt = Date.now();
            lastAiActionAtRef.current = sentAt;
            aiReplyTimesRef.current.push(sentAt);
            chatAggregator.injectMessage({
              id: `ai_engage_${sentAt}`,
              platform: 'local',
              displayName: 'AI Co-Host',
              content: `Sent engagement prompt to ${platforms.join(', ')}: ${publicMessage}`,
              createdAt: new Date(),
            });
          }
        } catch (error) {
          console.warn('AI Co-Host engagement failed:', error);
        }
      })();
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [
    appState.isStreaming,
    sessionToken,
    aiModeratorConfig,
    liveMessages,
    activeScene?.name,
    branding.tickerText,
  ]);

'''
p = Path('App.tsx')
text = p.read_text()
if 'AI Co-Host evaluation failed:' not in text:
    if marker not in text:
        raise SystemExit('App legal-citation anchor missing')
    p.write_text(text.replace(marker, injection + marker, 1))

# Hidden internal studio bridge: root-admin only, env-flagged, no visible UI.
marker = "  // ── keyboard shortcuts ─────────────────────────────────────────────────────\n"
injection = r'''  useEffect(() => {
    const enabled = import.meta.env.VITE_INTERNAL_STUDIO_BRIDGE === 'true';
    if (!enabled || !sessionToken || !isAdminEmail(user?.email)) return;

    let cancelled = false;
    const applyState = (state: Awaited<ReturnType<typeof getInternalStudioBridgeState>>) => {
      if (!state || !state.eventId || state.eventId === lastInternalBridgeEventRef.current) return;
      lastInternalBridgeEventRef.current = state.eventId;
      const payload = state.payload || {};

      if (state.command === 'lower-third') {
        setGraphicsState((current) => ({
          ...current,
          lowerThird: {
            ...current.lowerThird,
            visible: payload.visible !== false,
            name: String(payload.name || '').slice(0, 80),
            title: String(payload.title || '').slice(0, 180),
            bgColor: String(payload.bgColor || '#0f172a').slice(0, 20),
            accentColor: String(payload.accentColor || '#ef4444').slice(0, 20),
          },
        }));
      } else if (state.command === 'ticker') {
        setBranding((current) => ({
          ...current,
          showTicker: payload.visible !== false,
          tickerText: String(payload.text || '').slice(0, 500),
        }));
      } else if (state.command === 'program-media') {
        const url = String(payload.url || '');
        if (url.startsWith('https://')) {
          setActiveVideoUrl(url);
          setActiveVideoId(null);
          if (payload.fullscreen === true) setLayout(LayoutMode.FULL_SCREEN);
        }
      } else if (state.command === 'clear') {
        setGraphicsState((current) => ({
          ...current,
          lowerThird:
            payload.lowerThird === false ? current.lowerThird : { ...current.lowerThird, visible: false },
        }));
        if (payload.ticker !== false) {
          setBranding((current) => ({ ...current, showTicker: false }));
        }
        if (payload.programMedia !== false) {
          setActiveVideoUrl(null);
          setActiveVideoId(null);
        }
      } else if (state.command === 'note') {
        const note = String(payload.text || '').trim();
        if (note) {
          chatAggregator.injectMessage({
            id: `internal_note_${state.eventId}`,
            platform: 'local',
            displayName: 'Producer Note',
            content: note.slice(0, 1000),
            createdAt: new Date(),
          });
        }
      }
    };

    const poll = async () => {
      try {
        const state = await getInternalStudioBridgeState(sessionToken);
        if (!cancelled) applyState(state);
      } catch (error) {
        const status = error instanceof ApiRequestError ? error.status : 0;
        if (status !== 404 && status !== 401) {
          console.warn('Internal studio bridge poll failed:', error);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionToken, user?.email]);

'''
p = Path('App.tsx')
text = p.read_text()
if 'Internal studio bridge poll failed:' not in text:
    if marker not in text:
        raise SystemExit('App keyboard-shortcut anchor missing')
    p.write_text(text.replace(marker, injection + marker, 1))

# Desktop + mobile AI controls.
replace_once(
    'App.tsx',
    "          <div className=\"border-t border-gray-700 pt-3\">\n            <StreamScheduler onGoLive={handleBroadcast} />\n          </div>\n",
    "          <div className=\"border-t border-gray-700 pt-3\">\n"
    "            <StreamScheduler onGoLive={handleBroadcast} />\n"
    "          </div>\n"
    "          <div className=\"border-t border-gray-700 pt-3\">\n"
    "            <AIModeratorPanel\n"
    "              config={aiModeratorConfig}\n"
    "              usage={aiModeratorUsage}\n"
    "              available={aiModeratorAvailable}\n"
    "              saving={aiModeratorSaving}\n"
    "              onChange={setAiModeratorConfig}\n"
    "              onSave={saveAIModeratorSettings}\n"
    "            />\n"
    "          </div>\n",
)
replace_once(
    'App.tsx',
    "                {/* Guest Camera */}\n",
    "                <AIModeratorPanel\n"
    "                  config={aiModeratorConfig}\n"
    "                  usage={aiModeratorUsage}\n"
    "                  available={aiModeratorAvailable}\n"
    "                  saving={aiModeratorSaving}\n"
    "                  onChange={setAiModeratorConfig}\n"
    "                  onSave={saveAIModeratorSettings}\n"
    "                />\n\n"
    "                {/* Guest Camera */}\n",
)

# Cloud Broadcast sits with destinations rather than cluttering the main studio.
replace_once(
    'App.tsx',
    "          {activeTab === 'destinations' && (\n            <div className=\"p-4 overflow-y-auto flex-1 pb-24\">\n              <DestinationManager\n",
    "          {activeTab === 'destinations' && (\n"
    "            <div className=\"p-4 overflow-y-auto flex-1 pb-24 space-y-4\">\n"
    "              <CloudBroadcastPanel\n"
    "                userId={user?.uid}\n"
    "                userPlan={userProfile?.subscription?.plan}\n"
    "                destinations={destinations}\n"
    "                compact={isMobile}\n"
    "              />\n"
    "              <DestinationManager\n",
)

# Live comments are one tap from the actual encoded lower-third.
replace_once(
    'App.tsx',
    "        liveMessages={liveMessages}\n      />\n",
    "        liveMessages={liveMessages}\n"
    "        highlightedCommentId={highlightedCommentId}\n"
    "        onHighlightComment={handleHighlightComment}\n"
    "      />\n",
)

# Paid-plan value props for bounded AI usage.
plan_file = Path('services/stripe.ts')
plan_text = plan_file.read_text()
feature_insertions = {
    "      '25 GB DVR storage',": "      '25 GB DVR storage',\n      'AI Co-Host — 500 decisions / month',",
    "      '100 GB DVR storage',": "      '100 GB DVR storage',\n      'AI Co-Host — 3,000 decisions / month',",
    "      '250 GB DVR storage',": "      '250 GB DVR storage',\n      'AI Co-Host — 12,000 decisions / month',",
    "      '500 GB DVR storage',": "      '500 GB DVR storage',\n      'AI Co-Host — 50,000 decisions / month',",
}
for old, new in feature_insertions.items():
    if new not in plan_text:
        if old not in plan_text:
            raise SystemExit(f'Pricing feature anchor missing: {old}')
        plan_text = plan_text.replace(old, new, 1)
plan_file.write_text(plan_text)

print('Next-generation ChatScream wiring applied successfully.')
