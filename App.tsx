import { useState, useEffect, useRef, useCallback, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Destination,
  LayoutMode,
  AppState,
  Platform,
  MediaAsset,
  MediaType,
  BrandingSettings,
  Scene,
} from './types';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { useMobileLayout } from './hooks/useMobileLayout';
import { useAutoCaption } from './hooks/useAutoCaption';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useResourceGuard } from './hooks/useResourceGuard';
import { useLocalRecording } from './hooks/useLocalRecording';
import { useEvidenceMarkers } from './hooks/useEvidenceMarkers';
import { useStreamTranscript } from './hooks/useStreamTranscript';
import CanvasCompositor, { CanvasRef, CanvasResolution } from './components/CanvasCompositor';
import ProgramPreview from './components/ProgramPreview';
import DestinationManager from './components/DestinationManager';
import LayoutSelector from './components/LayoutSelector';
import MediaBin from './components/MediaBin';
import AudioMixer from './components/AudioMixer';
import BrandingPanel from './components/BrandingPanel';
import BackgroundSelector from './components/BackgroundSelector';
import AuthStatusBanner from './components/AuthStatusBanner';
import ChatStream from './components/ChatStream';
import MusicPlayer from './components/MusicPlayer';
import SceneSelector from './components/SceneSelector';
import GraphicsOverlay, { defaultGraphicsState, GraphicsState } from './components/GraphicsOverlay';
import ResourceHealthBar from './components/ResourceHealthBar';
import VideoTransportBar from './components/VideoTransportBar';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import EvidenceMarkerPanel from './components/EvidenceMarkerPanel';
import LegalOverlays from './components/LegalOverlays';
import type { LegalCitation } from './components/LegalOverlays';
import PostStreamPanel from './components/PostStreamPanel';
import StreamScheduler from './components/StreamScheduler';
import { RTMPSender } from './services/RTMPSender';
import { ClipBuffer } from './services/clipBuffer';
import {
  GuestHostService,
  GuestConnection,
  generateRoomId,
  generateGuestInviteUrl,
} from './services/webrtcGuestService';
import { useAuth } from './contexts/AuthContext';
import { createScreamAlert, ScreamAlert, calculateScreamDuration } from './services/chatScreamer';
import ScreamOverlay from './components/ScreamOverlay';
import { apiRequest, ApiRequestError, buildApiUrl } from './services/apiClient';
import { chatAggregator, AggregatedMessage } from './services/chatAggregator';
import { getCurrentSessionToken } from './services/backend';
import {
  Settings,
  Layers,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Radio,
  Palette,
  Music,
  Disc,
  Play,
  Square,
  Zap,
  Scissors,
  Subtitles,
  Users,
  Copy,
  Check,
  X,
  SplitSquareVertical,
  Trophy,
  Pause,
  Circle,
  FlipHorizontal2,
  Eye,
  LogOut,
  ChevronDown,
  Bookmark,
  Scale,
  FileText,
  Calendar,
  ChevronUp,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

const isMobileViewport = () => window.innerWidth < 768;

// ─── component ──────────────────────────────────────────────────────────────

const App: FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, sessionToken, logout } = useAuth();

  // mobile layout detection
  const { isLandscape, isCompactLandscape, mobileTip, setMobileTip } = useMobileLayout();
  const [isMobile, setIsMobile] = useState(isMobileViewport);

  useEffect(() => {
    const onResize = () => setIsMobile(isMobileViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // camera / screen streams
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState(false);

  // sidebar / bottom-tab navigation
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'studio' | 'destinations' | 'branding' | 'media' | 'graphics' | 'chat'
  >('studio');

  // Switcher: program/preview multiview
  const [multiviewEnabled, setMultiviewEnabled] = useState(false);

  // Graphics/scoreboard overlay state
  const [graphicsState, setGraphicsState] = useState<GraphicsState>(defaultGraphicsState);

  // Resource guard — protects phones from freezing
  const resourceGuard = useResourceGuard(true);

  // canvas / media state
  const [layout, setLayout] = useState<LayoutMode>(LayoutMode.FULL_CAM);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [activeBackgroundUrl, setActiveBackgroundUrl] = useState<string | null>(null);
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [musicElement, setMusicElement] = useState<HTMLAudioElement | null>(null);
  const [activeScream, setActiveScream] = useState<ScreamAlert | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // audio mixer
  const [micVolume, setMicVolume] = useState(1.0);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isMicMuted, setIsMicMuted] = useState(false);

  // branding
  const [branding, setBranding] = useState<BrandingSettings>({
    primaryColor: '#6366f1',
    accentColor: '#818cf8',
    showLowerThird: false,
    showTicker: false,
    showNowPlaying: false,
    showLogo: false,
    logoPosition: 'top-right',
    logoOpacity: 1.0,
    tickerText: '',
    presenterName: user?.displayName || '',
    presenterTitle: 'Streamer',
  });

  // stream / recording state
  const [appState, setAppState] = useState<AppState & { streamDuration: number; bitrate: number }>({
    isStreaming: false,
    isRecording: false,
    streamDuration: 0,
    bitrate: 0,
  });

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [liveMessages, setLiveMessages] = useState<AggregatedMessage[]>([]);

  // auto-captions
  const {
    caption,
    isActive: captionsOn,
    isSupported: captionsSupported,
    toggle: toggleCaptions,
  } = useAutoCaption();

  // evidence markers & stream transcript
  const evidenceMarkers = useEvidenceMarkers(appState.streamDuration);
  const streamTranscript = useStreamTranscript();

  // guest cameras
  const [guestRoomId] = useState(() => generateRoomId());
  const [guestConnections, setGuestConnections] = useState<GuestConnection[]>([]);
  const [showGuestInvite, setShowGuestInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showRecordingStopConfirm, setShowRecordingStopConfirm] = useState(false);
  const [showScreamDemo, setShowScreamDemo] = useState(false);
  const [screamDemoName, setScreamDemoName] = useState('');
  const [screamDemoAmount, setScreamDemoAmount] = useState('50');

  // ── WebSocket scream room: listen for real donation alerts ────────────────
  const screamWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    // Connect to the scream WebSocket room for this streamer
    const apiBase = buildApiUrl('').replace(/\/$/, '');
    const wsBase = apiBase.replace(/^https?:/, 'wss:').replace(/^http:/, 'ws:');
    const screamWsUrl = `${wsBase}/ws/scream/${user.uid}`;

    try {
      const ws = new WebSocket(screamWsUrl);
      screamWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'scream_alert' && msg.alert) {
            const alert = createScreamAlert(
              msg.alert.donorName || 'Anonymous',
              Number(msg.alert.amount) || 5,
              msg.alert.message || '',
              user.uid,
            );
            if (alert) {
              setActiveScream(alert);
              // Play sound effect
              import('./services/chatScreamer').then(({ playScreamSound }) => {
                playScreamSound(alert.tier);
              });
            }
          }
        } catch {
          // Bad message — ignore
        }
      };

      ws.onclose = () => {
        // Reconnect after 5 seconds if still streaming
        setTimeout(() => {
          if (screamWsRef.current === ws && user?.uid) {
            try {
              screamWsRef.current = new WebSocket(screamWsUrl);
            } catch {
              // Give up silently
            }
          }
        }, 5000);
      };

      return () => {
        ws.close();
        screamWsRef.current = null;
      };
    } catch {
      // WebSocket not available
    }
  }, [user?.uid]);
  const [showPostStream, setShowPostStream] = useState(false);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<LegalCitation | null>(null);
  const guestServiceRef = useRef<GuestHostService | null>(null);

  // refs
  const canvasRef = useRef<CanvasRef>(null);
  const rtmpSenderRef = useRef<RTMPSender | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // Canvas output resolution
  const [canvasResolution, setCanvasResolution] = useState<CanvasResolution>('720p');

  // Safe local recording (chunked, memory-aware)
  const [recordingQuality, setRecordingQuality] = useState<'auto' | 'high' | 'medium' | 'low'>(
    'auto',
  );
  const localRecording = useLocalRecording({ quality: recordingQuality }, resourceGuard.level);
  const clipBufferRef = useRef<ClipBuffer | null>(null);

  // audio pipeline
  const { initAudio, combinedStream, levels } = useAudioPipeline({
    micStream: cameraStream,
    musicElement,
    videoElement: canvasRef.current?.getVideoElement(),
    micVolume,
    musicVolume,
    videoVolume,
    isMicMuted,
  });

  // Auto-initialize audio pipeline on studio load so combinedStream is ready
  useEffect(() => {
    initAudio();
  }, [initAudio]);

  // ── media fetch ────────────────────────────────────────────────────────────

  const fetchMedia = useCallback(async () => {
    try {
      const data = await apiRequest<{ assets?: MediaAsset[] }>('/api/media/list', {
        token: sessionToken,
      });
      setAssets(data.assets || []);
      setMediaError(null);
    } catch (e) {
      console.error(e);
      const message =
        e instanceof ApiRequestError ? e.message : 'Failed to load media assets. Please try again.';
      setMediaError(message);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // ── guest host service ─────────────────────────────────────────────────────

  useEffect(() => {
    const svc = new GuestHostService(
      guestRoomId,
      (guest) => setGuestConnections((prev) => [...prev, guest]),
      (id) => setGuestConnections((prev) => prev.filter((g) => g.id !== id)),
    );
    svc.connect();
    guestServiceRef.current = svc;
    return () => svc.disconnect();
  }, [guestRoomId]);

  const copyGuestInvite = async () => {
    const url = generateGuestInviteUrl(guestRoomId);
    await navigator.clipboard.writeText(url).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2500);
  };

  // ── scream handler ─────────────────────────────────────────────────────────

  const triggerScream = (donor: string, amount: number, message: string) => {
    const scream = createScreamAlert(donor, amount, message, user?.uid || 'demo');
    if (scream) {
      setActiveScream(scream);
      const duration = calculateScreamDuration(scream.tier, message.length);
      setTimeout(() => setActiveScream(null), duration);
    }
  };

  // ── media actions ──────────────────────────────────────────────────────────

  // Track local object URLs so we can revoke them on cleanup
  const localObjectUrlsRef = useRef<Map<string, string>>(new Map());

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      localObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleMediaUpload = async (file: File, type: MediaType) => {
    // For video and audio: play locally from device — no upload needed.
    // This avoids uploading large files during a live stream.
    if (type === 'video' || type === 'audio') {
      const localUrl = URL.createObjectURL(file);
      const localAsset: MediaAsset = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        url: localUrl,
        type,
      };
      localObjectUrlsRef.current.set(localAsset.id, localUrl);
      setAssets((prev) => [...prev, localAsset]);
      setMediaError(null);
      return;
    }

    // Images: upload to server (small files, needed for overlays/branding)
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`;
      }
      const res = await fetch(buildApiUrl('/api/media/upload'), {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        const message =
          errorData?.message || errorData?.error || `Failed to upload media (${res.status}).`;
        throw new Error(message);
      }
      const data = await res.json();
      if (data.asset) {
        setAssets((prev) => [...prev, data.asset]);
      } else {
        throw new Error('Upload succeeded but no asset was returned.');
      }
      setMediaError(null);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to upload media. Please try again.';
      setMediaError(message);
    }
  };

  const handleMediaDelete = async (id: string) => {
    // If it's a local object URL, reset active state before revoking to prevent stale playback
    const localUrl = localObjectUrlsRef.current.get(id);
    if (localUrl) {
      if (activeVideoId === id) {
        setActiveVideoId(null);
        setActiveVideoUrl(null);
      }
      if (activeImageId === id) {
        setActiveImageId(null);
        setActiveImageUrl(null);
      }
      if (activeAudioId === id) {
        setActiveAudioId(null);
      }
      URL.revokeObjectURL(localUrl);
      localObjectUrlsRef.current.delete(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setMediaError(null);
      return;
    }

    // Clear active states for server-side assets
    if (activeVideoId === id) {
      setActiveVideoUrl(null);
      setActiveVideoId(null);
    }
    if (activeImageId === id) {
      setActiveImageUrl(null);
      setActiveImageId(null);
    }
    if (activeAudioId === id) {
      setActiveAudioId(null);
    }

    try {
      await apiRequest(`/api/media/${id}`, {
        method: 'DELETE',
        token: sessionToken,
      });
      setAssets((prev) => prev.filter((a) => a.id !== id));
      setMediaError(null);
    } catch (e) {
      console.error(e);
      const message =
        e instanceof ApiRequestError ? e.message : 'Failed to delete media. Please try again.';
      setMediaError(message);
    }
  };

  const handleToggleMedia = (id: string, type: MediaType) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return;
    if (type === 'image') {
      setActiveImageUrl(activeImageId === id ? null : asset.url);
      setActiveImageId(activeImageId === id ? null : id);
    } else if (type === 'video') {
      setActiveVideoUrl(activeVideoId === id ? null : asset.url);
      setActiveVideoId(activeVideoId === id ? null : id);
    } else if (type === 'audio') {
      setActiveAudioId(activeAudioId === id ? null : id);
    }
  };

  // ── camera / screen ────────────────────────────────────────────────────────

  const toggleCamera = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        setCameraStream(s);
        initAudio();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const flipCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: next },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        setCameraStream(s);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleScreen = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
    } else {
      try {
        const s = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
          audio: true,
        });
        setScreenStream(s);
        initAudio();
      } catch (err) {
        console.error(err);
      }
    }
  };

  // ── clip buffer ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvasStream = canvasRef.current?.getStream();
    if (!canvasStream) return;
    if (!clipBufferRef.current) {
      clipBufferRef.current = new ClipBuffer(canvasStream);
    }
    clipBufferRef.current.start();
    return () => {
      clipBufferRef.current?.stop();
      clipBufferRef.current = null;
    };
  }, [cameraStream, screenStream]);

  const saveClip = () => {
    if (!clipBufferRef.current?.hasData) {
      setMobileTip('No clip data yet — start your camera first');
      return;
    }
    clipBufferRef.current.saveClip();
  };

  // ── broadcast / recording ──────────────────────────────────────────────────

  const handleBroadcast = async () => {
    if (appState.isStreaming) {
      await rtmpSenderRef.current?.disconnect();
      setAppState((prev) => ({ ...prev, isStreaming: false, streamDuration: 0 }));
    } else {
      // ── Pre-flight checks ──────────────────────────────────────────────
      const enabledDests = destinations.filter((d) => d.isEnabled);
      if (enabledDests.length === 0) {
        return alert(
          'No destinations enabled. Add at least one streaming destination (YouTube, Twitch, Facebook, etc.) and toggle it on.',
        );
      }

      // Validate each destination has the minimum required config
      const issues: string[] = [];
      for (const d of enabledDests) {
        if (!d.streamKey && d.authType !== 'oauth') {
          issues.push(`${d.name}: Missing stream key`);
        }
        if (d.streamKey === 'oauth-linked') {
          issues.push(
            `${d.name}: OAuth connected but stream key not yet fetched. Re-select this destination to fetch your stream key.`,
          );
        }
      }
      if (issues.length > 0) {
        return alert(
          `Some destinations are not ready:\n\n${issues.join('\n')}\n\nFix these issues, then try again.`,
        );
      }

      // Ensure audio pipeline is initialized (creates AudioContext + destination)
      initAudio();

      const canvasStream = canvasRef.current?.getStream();
      if (!canvasStream)
        return alert(
          'Media not ready — no video source. Enable your camera or share your screen first.',
        );

      // Build output: video always required, audio optional
      const tracks = [...canvasStream.getVideoTracks()];
      if (combinedStream && combinedStream.getAudioTracks().length > 0) {
        tracks.push(...combinedStream.getAudioTracks());
      } else {
        console.warn('⚠️ No audio tracks available — streaming video-only');
      }
      const outputStream = new MediaStream(tracks);

      if (!rtmpSenderRef.current) {
        rtmpSenderRef.current = new RTMPSender(
          (id, status) =>
            setDestinations((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d))),
          {
            userPlan: (userProfile?.subscription?.plan as any) || 'free',
            userId: user?.uid || 'guest',
            userEmail: user?.email || null,
            cloudHoursUsed: userProfile?.usage?.cloudHoursUsed || 0,
            streamingMode: 'local',
          },
          (stats) => setAppState((prev) => ({ ...prev, bitrate: stats.bitrate })),
        );
      }
      try {
        await rtmpSenderRef.current.connect(outputStream, destinations);
        setAppState((prev) => ({ ...prev, isStreaming: true }));
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Failed to start streaming';
        alert(`Streaming failed: ${message}`);
        // Reset destination statuses
        setDestinations((prev) => prev.map((d) => ({ ...d, status: 'offline' as const })));
      }
    }
  };

  const toggleRecording = () => {
    if (localRecording.isRecording) {
      setShowRecordingStopConfirm(true);
    } else {
      // Safety check for low-memory devices
      if (!resourceGuard.safeToEnable('recording')) {
        setMobileTip('⚠️ Device memory too low to record safely. Close other apps and try again.');
        return;
      }
      // Ensure audio pipeline is initialized
      initAudio();
      const canvasStream = canvasRef.current?.getStream();
      if (!canvasStream) return;
      const tracks = [...canvasStream.getVideoTracks()];
      if (combinedStream && combinedStream.getAudioTracks().length > 0) {
        tracks.push(...combinedStream.getAudioTracks());
      }
      const combined = new MediaStream(tracks);
      localRecording.startRecording(combined);
      setAppState((prev) => ({ ...prev, isRecording: true }));
    }
  };

  // ── stream duration timer ──────────────────────────────────────────────────

  useEffect(() => {
    let interval: any;
    if (appState.isStreaming || appState.isRecording) {
      interval = setInterval(
        () => setAppState((prev) => ({ ...prev, streamDuration: prev.streamDuration + 1 })),
        1000,
      );
    }
    return () => clearInterval(interval);
  }, [appState.isStreaming, appState.isRecording]);

  // Bridge auto-captions into transcript
  useEffect(() => {
    if (caption && captionsOn) {
      streamTranscript.addChunk(caption, appState.streamDuration);
    }
  }, [caption, captionsOn, appState.streamDuration]);

  // Auto-start/stop transcript capture with streaming
  const prevStreaming = useRef(false);
  useEffect(() => {
    if (appState.isStreaming && !prevStreaming.current) {
      streamTranscript.startCapture();
      if (captionsOn) streamTranscript.clearTranscript();

      // Start live chat aggregation — fetch credentials from server
      const facebookDest = destinations.find(
        (d) => d.platform === Platform.FACEBOOK && d.isEnabled,
      );
      const facebookLiveVideoId = facebookDest?.liveVideoId || '';
      const params = facebookLiveVideoId
        ? `?facebookLiveVideoId=${encodeURIComponent(facebookLiveVideoId)}`
        : '';
      const token = getCurrentSessionToken();
      if (token) {
        fetch(buildApiUrl(`/api/streaming/chat-config${params}`), {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then(({ config }) => {
            chatAggregator.clearHistory();
            chatAggregator.start({
              youtube: config?.youtube?.liveChatId
                ? { accessToken: config.youtube.accessToken, liveChatId: config.youtube.liveChatId }
                : undefined,
              twitch: config?.twitch?.channel
                ? {
                    accessToken: config.twitch.accessToken,
                    channel: config.twitch.channel,
                    username: config.twitch.username,
                  }
                : undefined,
              facebook:
                config?.facebook?.accessToken && config?.facebook?.liveVideoId
                  ? {
                      accessToken: config.facebook.accessToken,
                      liveVideoId: config.facebook.liveVideoId,
                    }
                  : undefined,
            });
          })
          .catch((err) => console.warn('Chat config fetch failed:', err));

        const unsubscribe = chatAggregator.subscribe((msgs) => setLiveMessages([...msgs]));
        // Store unsubscribe so we can clean up when streaming stops
        (prevStreaming as any)._unsubscribeChat = unsubscribe;
      }
    } else if (!appState.isStreaming && prevStreaming.current) {
      streamTranscript.stopCapture();
      // Stop chat aggregation
      chatAggregator.stop();
      if (typeof (prevStreaming as any)._unsubscribeChat === 'function') {
        (prevStreaming as any)._unsubscribeChat();
        (prevStreaming as any)._unsubscribeChat = null;
      }
      setLiveMessages([]);
      // Show post-stream panel if we have content
      if (streamTranscript.wordCount > 0 || evidenceMarkers.markers.length > 0) {
        setShowPostStream(true);
      }
    }
    prevStreaming.current = appState.isStreaming;
  }, [appState.isStreaming]);

  // Handle legal citation overlay activation
  const handleActivateCitation = useCallback(
    (citation: LegalCitation) => {
      if (!citation.id) {
        setActiveCitationId(null);
        setActiveCitation(null);
      } else if (activeCitationId === citation.id) {
        setActiveCitationId(null);
        setActiveCitation(null);
      } else {
        setActiveCitationId(citation.id);
        setActiveCitation(citation);
      }
    },
    [activeCitationId],
  );

  const formatTime = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // ── keyboard shortcuts ─────────────────────────────────────────────────────

  useKeyboardShortcuts({
    onToggleLive: handleBroadcast,
    onToggleMic: () => setIsMicMuted((m) => !m),
    onToggleRecord: toggleRecording,
    onSaveClip: saveClip,
    onToggleCaptions: captionsSupported ? toggleCaptions : undefined,
    onToggleFullscreen: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    },
  });

  // ── shared canvas preview + overlay ───────────────────────────────────────

  // Multiview TAKE handler — pushes preview layout → program (live)
  const handleMultiviewTake = useCallback((newLayout: LayoutMode, newScene: Scene | null) => {
    setLayout(newLayout);
    setActiveScene(newScene);
  }, []);

  const canvasPreview = multiviewEnabled ? (
    // ── Switcher-style Program / Preview split ──
    <div className="w-full space-y-2">
      <ProgramPreview
        programLayout={layout}
        programScene={activeScene || null}
        cameraStream={cameraStream}
        screenStream={screenStream}
        activeMediaUrl={activeImageUrl}
        activeVideoUrl={activeVideoUrl}
        backgroundUrl={activeBackgroundUrl}
        videoVolume={videoVolume}
        branding={branding}
        showWatermark={userProfile?.subscription?.plan === 'free'}
        activeScream={null}
        nowPlaying={assets.find((a) => a.id === activeAudioId)?.name}
        onTake={handleMultiviewTake}
        programCanvasRef={canvasRef}
        compact={isMobile}
        graphics={graphicsState}
        mirrorCamera={isMirrored}
      />
      {/* HTML/CSS Scream Overlay over multiview */}
      <ScreamOverlay alert={activeScream} onDismiss={() => setActiveScream(null)} />
      {/* Quick controls bar (below multiview) */}
      <div className="flex items-center justify-center gap-2 bg-dark-900/85 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700 shadow-xl mx-auto w-fit">
        <button
          onClick={toggleCamera}
          className={`p-2 rounded-full ${cameraStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
          title="Toggle Camera (F)"
        >
          {cameraStream ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        {cameraStream && (
          <>
            <button
              onClick={flipCamera}
              className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors"
              title="Swap Camera (Front/Back)"
            >
              <Layers size={18} />
            </button>
            <button
              onClick={() => setIsMirrored((m) => !m)}
              className={`p-2 rounded-full transition-colors ${isMirrored ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              title="Mirror Camera"
            >
              <FlipHorizontal2 size={18} />
            </button>
          </>
        )}
        <button
          onClick={toggleScreen}
          className={`p-2 rounded-full ${screenStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
          title="Share Screen"
        >
          <Monitor size={18} />
        </button>
        <button
          onClick={() => setIsMicMuted((m) => !m)}
          className={`p-2 rounded-full ${isMicMuted ? 'bg-red-600/30 text-red-400' : 'bg-gray-800 text-gray-400'}`}
          title="Mute / Unmute Mic (M)"
        >
          {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <div className="h-4 w-[1px] bg-gray-700 mx-1" />
        <button
          onClick={() => setCanvasResolution((r) => (r === '720p' ? '1080p' : '720p'))}
          className="px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-[11px] font-bold tabular-nums min-w-[44px] text-center transition-colors"
          title={`Canvas output: ${canvasResolution} — click to toggle`}
        >
          {canvasResolution}
        </button>
        <button
          onClick={saveClip}
          className="p-2 rounded-full bg-gray-800 text-gray-400 hover:bg-brand-600 hover:text-white transition-all"
          title="Save Last 30s Clip (C)"
        >
          <Scissors size={18} />
        </button>
        {captionsSupported && (
          <button
            onClick={toggleCaptions}
            className={`p-2 rounded-full ${captionsOn ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
            title="Toggle Captions (T)"
          >
            <Subtitles size={18} />
          </button>
        )}
        <button
          onClick={() => setShowGuestInvite((v) => !v)}
          className={`p-2 rounded-full ${guestConnections.length > 0 ? 'bg-green-600' : 'bg-gray-800 text-gray-400'}`}
          title="Invite Guest Camera"
        >
          <Users size={18} />
        </button>
        <button
          onClick={() => setShowScreamDemo(true)}
          className="p-2 rounded-full bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all"
          title="Demo Scream Alert"
        >
          <Zap size={18} />
        </button>
      </div>
    </div>
  ) : (
    // ── Single canvas (original behavior) ──
    <div
      className={`relative w-full ${isMobile ? 'shrink-0' : ''}`}
      style={{ aspectRatio: '16/9', maxHeight: isMobile ? '45vh' : undefined }}
    >
      <CanvasCompositor
        ref={canvasRef}
        layout={layout}
        cameraStream={cameraStream}
        screenStream={screenStream}
        activeMediaUrl={activeImageUrl}
        activeVideoUrl={activeVideoUrl}
        backgroundUrl={activeBackgroundUrl}
        videoVolume={videoVolume}
        branding={branding}
        showWatermark={userProfile?.subscription?.plan === 'free'}
        activeScene={activeScene}
        activeScream={null}
        nowPlaying={assets.find((a) => a.id === activeAudioId)?.name}
        graphics={graphicsState}
        mirrorCamera={isMirrored}
        resolution={canvasResolution}
      />

      {/* HTML/CSS Scream Overlay (replaces canvas-based rendering) */}
      <ScreamOverlay alert={activeScream} onDismiss={() => setActiveScream(null)} />

      {/* Legal citation lower-third overlay */}
      {activeCitation && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none px-4 animate-fade-in">
          <div className="bg-gradient-to-r from-blue-900/95 to-indigo-900/95 backdrop-blur-md border border-blue-400/30 text-white px-5 py-3 rounded-xl max-w-lg shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Scale size={14} className="text-blue-300" />
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wide">
                Know Your Rights
              </span>
            </div>
            <p className="text-sm font-bold leading-snug">{activeCitation.summary}</p>
            <p className="text-[10px] text-blue-300/80 mt-1 italic">{activeCitation.citation}</p>
          </div>
        </div>
      )}

      {/* Auto-caption overlay */}
      {captionsOn && caption && (
        <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none px-4">
          <div className="bg-black/75 text-white text-sm font-medium px-4 py-2 rounded-lg text-center max-w-xl leading-snug">
            {caption}
          </div>
        </div>
      )}

      {/* Quick controls bar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-dark-900/85 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700 shadow-2xl">
        <button
          onClick={toggleCamera}
          className={`p-2 rounded-full ${cameraStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
          title="Toggle Camera (F)"
        >
          {cameraStream ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        {/* Camera swap (front/back) + mirror toggle — always visible when camera active */}
        {cameraStream && (
          <>
            <button
              onClick={flipCamera}
              className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors"
              title="Swap Camera (Front/Back)"
            >
              <Layers size={18} />
            </button>
            <button
              onClick={() => setIsMirrored((m) => !m)}
              className={`p-2 rounded-full transition-colors ${isMirrored ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              title="Mirror Camera"
            >
              <FlipHorizontal2 size={18} />
            </button>
          </>
        )}

        <button
          onClick={toggleScreen}
          className={`p-2 rounded-full ${screenStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
          title="Share Screen"
        >
          <Monitor size={18} />
        </button>

        <button
          onClick={() => setIsMicMuted((m) => !m)}
          className={`p-2 rounded-full ${isMicMuted ? 'bg-red-600/30 text-red-400' : 'bg-gray-800 text-gray-400'}`}
          title="Mute / Unmute Mic (M)"
        >
          {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <div className="h-4 w-[1px] bg-gray-700 mx-1" />

        <button
          onClick={() => setCanvasResolution((r) => (r === '720p' ? '1080p' : '720p'))}
          className="px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-[11px] font-bold tabular-nums min-w-[44px] text-center transition-colors"
          title={`Canvas output: ${canvasResolution} — click to toggle`}
        >
          {canvasResolution}
        </button>

        <button
          onClick={saveClip}
          className="p-2 rounded-full bg-gray-800 text-gray-400 hover:bg-brand-600 hover:text-white transition-all"
          title="Save Last 30s Clip (C)"
        >
          <Scissors size={18} />
        </button>

        {captionsSupported && (
          <button
            onClick={toggleCaptions}
            className={`p-2 rounded-full ${captionsOn ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
            title="Toggle Captions (T)"
          >
            <Subtitles size={18} />
          </button>
        )}

        <button
          onClick={() => setShowGuestInvite((v) => !v)}
          className={`p-2 rounded-full ${guestConnections.length > 0 ? 'bg-green-600' : 'bg-gray-800 text-gray-400'}`}
          title="Invite Guest Camera"
        >
          <Users size={18} />
          {guestConnections.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full text-[9px] font-bold flex items-center justify-center">
              {guestConnections.length}
            </span>
          )}
        </button>

        <div className="h-4 w-[1px] bg-gray-700 mx-1" />

        <button
          onClick={() => setShowScreamDemo(true)}
          className="p-2 rounded-full bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all"
          title="Demo Scream Alert"
        >
          <Zap size={18} />
        </button>
      </div>
    </div>
  );

  // ── guest invite modal ─────────────────────────────────────────────────────

  const guestInviteModal = showGuestInvite && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Invite Guest Camera</h3>
          <button
            onClick={() => setShowGuestInvite(false)}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Share this link with your guest. They can join from any browser — no app needed.
        </p>
        <div className="flex gap-2 mb-4">
          <input
            readOnly
            value={generateGuestInviteUrl(guestRoomId)}
            className="flex-1 bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 truncate"
          />
          <button
            onClick={copyGuestInvite}
            className="p-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white shrink-0"
          >
            {inviteCopied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        {guestConnections.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Connected Guests</p>
            {guestConnections.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-gray-300">{g.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── recording stop confirmation ──────────────────────────────────────────
  const recordingStopModal = showRecordingStopConfirm && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <Disc size={20} className="text-red-500" />
          <h3 className="text-lg font-bold">Stop Recording?</h3>
        </div>
        <div className="text-sm text-gray-400 mb-4 space-y-1">
          <p>
            Duration:{' '}
            <span className="text-white font-mono">
              {Math.floor(localRecording.duration / 60)
                .toString()
                .padStart(2, '0')}
              :{(localRecording.duration % 60).toString().padStart(2, '0')}
            </span>
          </p>
          <p>
            File size: <span className="text-white">{localRecording.totalSizeMB} MB</span>
          </p>
          <p>
            Quality: <span className="text-white uppercase">{localRecording.currentQuality}</span>
          </p>
          <p className="pt-2 text-yellow-400">The recording will download to your device.</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setShowRecordingStopConfirm(false)}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Continue Recording
          </button>
          <button
            onClick={() => {
              localRecording.stopRecording();
              setAppState((prev) => ({ ...prev, isRecording: false }));
              setShowRecordingStopConfirm(false);
            }}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors"
          >
            Stop & Download
          </button>
        </div>
      </div>
    </div>
  );

  // ── scream demo modal ─────────────────────────────────────────────────────

  const screamDemoModal = showScreamDemo && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Zap size={18} className="text-red-400" /> Demo Scream Alert
          </h3>
          <button
            onClick={() => setShowScreamDemo(false)}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Simulate a donation scream to preview the overlay in action.
        </p>
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Donor Name</label>
            <input
              value={screamDemoName}
              onChange={(e) => setScreamDemoName(e.target.value)}
              placeholder="e.g. StreamFan99"
              className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Donation Amount ($)</label>
            <input
              type="number"
              min="1"
              value={screamDemoAmount}
              onChange={(e) => setScreamDemoAmount(e.target.value)}
              className="w-full bg-dark-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <button
          onClick={() => {
            const name = screamDemoName.trim() || 'Anonymous';
            const amount = Math.max(1, Number(screamDemoAmount) || 50);
            const msg =
              amount >= 50
                ? 'THIS IS A MAXIMUM SCREAM!!!'
                : amount >= 20
                  ? 'LOUD SCREAM!!!'
                  : 'Scream!';
            triggerScream(name, amount, msg);
            setShowScreamDemo(false);
          }}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 font-semibold text-white transition-all"
        >
          Fire Scream 🔥
        </button>
      </div>
    </div>
  );

  // ── mobile tip toast ───────────────────────────────────────────────────────

  const mobileTipToast = mobileTip && (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-dark-800 border border-gray-700 text-sm text-white px-4 py-2 rounded-full shadow-xl z-40 pointer-events-none">
      {mobileTip}
    </div>
  );

  // ── tab content ────────────────────────────────────────────────────────────

  const studioTabContent = (
    <div className={`flex flex-1 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
      {!isMobile && (
        <div className="w-64 border-r border-gray-800 p-4 overflow-y-auto space-y-4">
          <SceneSelector activeSceneId={activeScene?.id || null} onSceneSelect={setActiveScene} />
          {/* Graphics panel on desktop sidebar */}
          <div className="border-t border-gray-700 pt-3">
            <GraphicsOverlay state={graphicsState} onChange={setGraphicsState} />
          </div>
          {/* Evidence Markers */}
          <div className="border-t border-gray-700 pt-3">
            <EvidenceMarkerPanel
              markers={evidenceMarkers.markers}
              quickLabels={evidenceMarkers.quickMarkerLabels}
              streamDuration={appState.streamDuration}
              isStreaming={appState.isStreaming}
              onAddMarker={evidenceMarkers.addMarker}
              onRemoveMarker={evidenceMarkers.removeMarker}
              onClearMarkers={evidenceMarkers.clearMarkers}
              onExportLog={evidenceMarkers.exportLog}
            />
          </div>
          {/* Legal Citation Overlays */}
          <div className="border-t border-gray-700 pt-3">
            <LegalOverlays
              onActivateCitation={handleActivateCitation}
              activeCitationId={activeCitationId}
            />
          </div>
          {/* Stream Scheduling */}
          <div className="border-t border-gray-700 pt-3">
            <StreamScheduler onGoLive={handleBroadcast} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
        {/* Resource health bar — shows device status on all devices */}
        <ResourceHealthBar snapshot={resourceGuard} compact={isMobile} />

        {canvasPreview}

        {/* Video transport bar — seek, play/pause, volume for static video */}
        {activeVideoUrl && (
          <VideoTransportBar
            videoElement={canvasRef.current?.getVideoElement() ?? null}
            videoName={assets.find((a) => a.id === activeVideoId)?.name}
            volume={videoVolume}
            onVolumeChange={setVideoVolume}
            onStop={() => {
              setActiveVideoUrl(null);
              setActiveVideoId(null);
            }}
          />
        )}

        {/* Recording status bar when recording */}
        {localRecording.isRecording && (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2">
            <Circle size={12} className="text-red-500 animate-pulse fill-red-500" />
            <span className="text-xs text-red-300 font-mono">
              REC{' '}
              {Math.floor(localRecording.duration / 60)
                .toString()
                .padStart(2, '0')}
              :{(localRecording.duration % 60).toString().padStart(2, '0')}
            </span>
            <span className="text-[10px] text-gray-500">
              {localRecording.chunkCount} chunks · {localRecording.totalSizeMB} MB ·{' '}
              {localRecording.currentQuality}
            </span>
            {localRecording.isPaused && (
              <span className="text-[10px] text-yellow-400 font-bold uppercase">
                PAUSED (low memory)
              </span>
            )}
            <button
              onClick={localRecording.togglePause}
              className="ml-auto p-1 rounded bg-gray-800 text-gray-400 hover:text-white"
            >
              <Pause size={14} />
            </button>
          </div>
        )}

        {isMobile ? (
          // Mobile: simplified one-thumb field studio
          <div className="space-y-3 px-1">
            {/* Primary action buttons — big, finger-friendly */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={toggleCamera}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${cameraStream ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-dark-900 border-gray-700 text-gray-400'}`}
              >
                {cameraStream ? <Video size={22} /> : <VideoOff size={22} />}
                <span className="text-[10px] font-medium">Camera</span>
              </button>
              {cameraStream && (
                <button
                  onClick={flipCamera}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-gray-700 bg-dark-900 text-gray-400 active:scale-95 transition-all"
                >
                  <Layers size={22} />
                  <span className="text-[10px] font-medium">Flip</span>
                </button>
              )}
              <button
                onClick={() => setIsMicMuted((m) => !m)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${isMicMuted ? 'bg-red-600/20 border-red-500 text-red-400' : 'bg-dark-900 border-gray-700 text-gray-400'}`}
              >
                {isMicMuted ? <MicOff size={22} /> : <Mic size={22} />}
                <span className="text-[10px] font-medium">{isMicMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button
                onClick={saveClip}
                className="flex flex-col items-center gap-1 py-3 rounded-xl border border-gray-700 bg-dark-900 text-gray-400 hover:border-brand-500 hover:text-brand-400 active:scale-95 transition-all"
              >
                <Scissors size={22} />
                <span className="text-[10px] font-medium">Clip</span>
              </button>
              <button
                onClick={() => evidenceMarkers.addMarker()}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${evidenceMarkers.markers.length > 0 ? 'bg-red-600/20 border-red-500 text-red-400' : 'bg-dark-900 border-gray-700 text-gray-400'}`}
              >
                <Bookmark size={22} />
                <span className="text-[10px] font-medium">
                  Mark{' '}
                  {evidenceMarkers.markers.length > 0 ? `(${evidenceMarkers.markers.length})` : ''}
                </span>
              </button>
              {!cameraStream && (
                <button
                  onClick={toggleScreen}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${screenStream ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-dark-900 border-gray-700 text-gray-400'}`}
                >
                  <Monitor size={22} />
                  <span className="text-[10px] font-medium">Screen</span>
                </button>
              )}
            </div>

            {/* Slide-up drawer toggle */}
            <button
              onClick={() => setShowMobileDrawer(!showMobileDrawer)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-dark-900 border border-gray-700 text-gray-400 text-xs"
            >
              {showMobileDrawer ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {showMobileDrawer ? 'Hide advanced' : 'More controls'}
            </button>

            {/* Slide-up drawer — advanced controls */}
            {showMobileDrawer && (
              <div className="space-y-4 bg-dark-900 border border-gray-700 rounded-xl p-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <LayoutSelector currentLayout={layout} onSelect={setLayout} />
                  <button
                    onClick={() => {
                      if (!multiviewEnabled && !resourceGuard.safeToEnable('multiview')) {
                        setMobileTip('⚠️ Not enough memory for multiview. Close other apps.');
                        return;
                      }
                      setMultiviewEnabled((v) => !v);
                    }}
                    className={`p-2 rounded-lg border shrink-0 ${
                      multiviewEnabled
                        ? 'bg-brand-500 border-brand-400 text-white'
                        : 'border-gray-700 text-gray-400'
                    }`}
                    title="Program/Preview Multiview"
                  >
                    <SplitSquareVertical size={18} />
                  </button>
                  {captionsSupported && (
                    <button
                      onClick={toggleCaptions}
                      className={`p-2 rounded-lg border shrink-0 ${captionsOn ? 'bg-brand-500 border-brand-400 text-white' : 'border-gray-700 text-gray-400'}`}
                    >
                      <Subtitles size={18} />
                    </button>
                  )}
                </div>

                {/* Evidence Markers */}
                <EvidenceMarkerPanel
                  markers={evidenceMarkers.markers}
                  quickLabels={evidenceMarkers.quickMarkerLabels}
                  streamDuration={appState.streamDuration}
                  isStreaming={appState.isStreaming}
                  onAddMarker={evidenceMarkers.addMarker}
                  onRemoveMarker={evidenceMarkers.removeMarker}
                  onClearMarkers={evidenceMarkers.clearMarkers}
                  onExportLog={evidenceMarkers.exportLog}
                  compact
                />

                {/* Legal Overlays */}
                <LegalOverlays
                  onActivateCitation={handleActivateCitation}
                  activeCitationId={activeCitationId}
                  compact
                />

                {/* Stream Scheduler */}
                <StreamScheduler onGoLive={handleBroadcast} compact />

                {/* Guest Camera */}
                <button
                  onClick={() => setShowGuestInvite(true)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${guestConnections.length > 0 ? 'bg-green-600/20 border-green-500 text-green-400' : 'border-gray-700 text-gray-400'}`}
                >
                  <Users size={16} />
                  {guestConnections.length > 0
                    ? `${guestConnections.length} Guest(s) Connected`
                    : 'Invite Guest Camera'}
                </button>

                {/* Scream Demo */}
                <button
                  onClick={() => setShowScreamDemo(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-600/20"
                >
                  <Zap size={16} />
                  Demo Scream Alert
                </button>
              </div>
            )}
          </div>
        ) : (
          // Desktop: two-column grid
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <LayoutSelector currentLayout={layout} onSelect={setLayout} />
                <button
                  onClick={() => setMultiviewEnabled((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    multiviewEnabled
                      ? 'bg-brand-500 border-brand-400 text-white'
                      : 'border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                  title="Program/Preview Multiview"
                >
                  <SplitSquareVertical size={18} />
                  <span className="text-xs font-medium">Multiview</span>
                </button>
              </div>
              <BackgroundSelector
                currentBackgroundId={activeBackgroundId}
                onSelect={(url, id) => {
                  setActiveBackgroundUrl(url);
                  setActiveBackgroundId(id);
                }}
              />
            </div>
            <AudioMixer
              micVolume={micVolume}
              musicVolume={musicVolume}
              videoVolume={videoVolume}
              onMicVolumeChange={setMicVolume}
              onMusicVolumeChange={setMusicVolume}
              onVideoVolumeChange={setVideoVolume}
              micLevel={levels.mic}
              musicLevel={levels.music}
              videoLevel={levels.video}
              isMicMuted={isMicMuted}
              onMicMuteToggle={() => setIsMicMuted(!isMicMuted)}
            />
          </div>
        )}
      </div>
    </div>
  );

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-dark-950 text-white overflow-hidden">
      {/* ── header ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-dark-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center font-black text-lg italic">
              S
            </div>
            {!isMobile && <h1 className="text-lg font-black tracking-tighter">CHATSCREAM</h1>}
          </div>
          {(appState.isStreaming || appState.isRecording) && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/80 border border-gray-700 rounded-full font-mono text-xs">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${appState.isStreaming ? 'bg-red-500' : 'bg-brand-400'}`}
                />
                {formatTime(appState.streamDuration)}
              </div>
              {appState.isStreaming && !isMobile && (
                <div className="text-[10px] font-bold text-brand-400 uppercase tracking-tight">
                  {appState.bitrate} kbps
                </div>
              )}
              {appState.isStreaming && destinations.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {destinations
                    .filter((d) => d.isEnabled)
                    .map((d) => (
                      <div
                        key={d.id}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-bold ${
                          d.status === 'live'
                            ? 'bg-green-900/40 border-green-500/40 text-green-300'
                            : d.status === 'connecting'
                              ? 'bg-yellow-900/40 border-yellow-500/40 text-yellow-300'
                              : d.status === 'error'
                                ? 'bg-red-900/40 border-red-500/40 text-red-300'
                                : 'bg-gray-800 border-gray-700 text-gray-500'
                        }`}
                        title={`${d.platform}${d.name ? ` — ${d.name}` : ''}: ${d.status}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            d.status === 'live'
                              ? 'bg-green-400'
                              : d.status === 'connecting'
                                ? 'bg-yellow-400 animate-pulse'
                                : d.status === 'error'
                                  ? 'bg-red-400'
                                  : 'bg-gray-600'
                          }`}
                        />
                        {d.platform}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Recording quality selector */}
          {!appState.isRecording && (
            <select
              value={recordingQuality}
              onChange={(e) => setRecordingQuality(e.target.value as typeof recordingQuality)}
              className="text-xs bg-dark-800 border border-gray-700 rounded-lg px-1.5 py-1 text-gray-300 focus:outline-none focus:border-brand-500"
              title="Recording quality"
            >
              <option value="auto">Auto</option>
              <option value="high">4K</option>
              <option value="medium">HD</option>
              <option value="low">SD</option>
            </select>
          )}
          {appState.isRecording && localRecording.currentQuality && (
            <span className="text-[10px] font-bold text-red-400 uppercase">
              {localRecording.currentQuality}
            </span>
          )}
          <button
            onClick={toggleRecording}
            className={`p-2 rounded-full border ${appState.isRecording ? 'bg-gray-800 border-red-500 text-red-500' : 'border-gray-600 text-gray-400'}`}
            title="Record (R)"
          >
            <Disc
              size={isMobile ? 18 : 20}
              className={appState.isRecording ? 'animate-pulse' : ''}
            />
          </button>
          <button
            onClick={handleBroadcast}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 text-sm transition-all ${appState.isStreaming ? 'bg-red-600' : 'bg-brand-500 hover:bg-brand-600'}`}
            title="Go Live / Stop (Space)"
          >
            {appState.isStreaming ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            {appState.isStreaming ? 'STOP' : 'GO LIVE'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu((v) => !v)}
              className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white"
            >
              <Settings size={16} />
            </button>
            {showSettingsMenu && (
              <div className="absolute right-0 top-10 w-52 bg-dark-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 animate-fade-in">
                <div className="px-3 py-2 border-b border-gray-700">
                  <p className="text-xs text-gray-400">Signed in as</p>
                  <p className="text-sm text-white truncate">{user?.email || 'User'}</p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('destinations');
                    setShowSettingsMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                >
                  <Radio size={14} /> Destinations
                </button>
                <button
                  onClick={() => {
                    setActiveTab('branding');
                    setShowSettingsMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                >
                  <Palette size={14} /> Branding
                </button>
                <div className="border-t border-gray-700 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowSettingsMenu(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 flex items-center gap-2"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <AuthStatusBanner />

      {/* ── main body ── */}
      <div className={`flex flex-1 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
        {/* Desktop: left sidebar nav */}
        {!isMobile && (
          <nav className="w-16 bg-dark-900 border-r border-gray-800 flex flex-col items-center py-6 gap-6">
            <button
              onClick={() => setActiveTab('studio')}
              className={`p-3 rounded-xl ${activeTab === 'studio' ? 'bg-brand-500' : 'text-gray-500'}`}
              title="Studio"
            >
              <Video size={20} />
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`p-3 rounded-xl ${activeTab === 'media' ? 'bg-brand-500' : 'text-gray-500'}`}
              title="Media"
            >
              <Music size={20} />
            </button>
            <button
              onClick={() => setActiveTab('destinations')}
              className={`p-3 rounded-xl ${activeTab === 'destinations' ? 'bg-brand-500' : 'text-gray-500'}`}
              title="Destinations"
            >
              <Radio size={20} />
            </button>
            <button
              onClick={() => setActiveTab('branding')}
              className={`p-3 rounded-xl ${activeTab === 'branding' ? 'bg-brand-500' : 'text-gray-500'}`}
              title="Branding"
            >
              <Palette size={20} />
            </button>
            <button
              onClick={() => setActiveTab('graphics')}
              className={`p-3 rounded-xl ${activeTab === 'graphics' ? 'bg-brand-500' : 'text-gray-500'}`}
              title="Graphics & Scoreboards"
            >
              <Trophy size={20} />
            </button>
          </nav>
        )}

        {/* Tab content */}
        <main className="flex-1 flex flex-col bg-dark-950 overflow-hidden">
          {activeTab === 'studio' && studioTabContent}

          {activeTab === 'media' && (
            <div className={`flex flex-1 overflow-hidden p-4 gap-4 ${isMobile ? 'flex-col' : ''}`}>
              <div className={`space-y-3 ${isMobile ? 'w-full' : 'w-80'}`}>
                {mediaError && (
                  <div
                    className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
                    role="alert"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p>{mediaError}</p>
                      <button
                        type="button"
                        onClick={() => setMediaError(null)}
                        className="text-red-200 hover:text-white"
                        aria-label="Dismiss media error"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
                <MediaBin
                  assets={assets}
                  activeAssets={{
                    image: activeImageId,
                    video: activeVideoId,
                    audio: activeAudioId,
                  }}
                  onUpload={handleMediaUpload}
                  onDelete={handleMediaDelete}
                  onToggleAsset={handleToggleMedia}
                />
              </div>
              <div className="flex-1">
                <MusicPlayer
                  playlist={assets.filter((a) => a.type === 'audio')}
                  activeTrackId={activeAudioId}
                  onTrackSelect={(id) => handleToggleMedia(id!, 'audio')}
                  volume={musicVolume}
                  onVolumeChange={setMusicVolume}
                  onDeleteTrack={handleMediaDelete}
                  onAudioInit={setMusicElement}
                />
              </div>
            </div>
          )}

          {activeTab === 'destinations' && (
            <div className="p-4 overflow-y-auto flex-1 pb-24">
              <DestinationManager
                destinations={destinations}
                onAddDestination={(d) => setDestinations([...destinations, d])}
                onRemoveDestination={(id) =>
                  setDestinations(destinations.filter((dest) => dest.id !== id))
                }
                onToggleDestination={(id) =>
                  setDestinations(
                    destinations.map((dest) =>
                      dest.id === id ? { ...dest, isEnabled: !dest.isEnabled } : dest,
                    ),
                  )
                }
                isStreaming={appState.isStreaming}
                userId={user?.uid}
                userPlan={userProfile?.subscription?.plan}
                userEmail={user?.email}
              />
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="p-4 overflow-y-auto max-w-4xl flex-1 pb-24">
              <BrandingPanel settings={branding} onChange={setBranding} />
            </div>
          )}

          {activeTab === 'graphics' && (
            <div className="p-4 overflow-y-auto max-w-4xl flex-1 pb-24">
              <h2 className="text-sm font-bold text-gray-300 mb-3">Graphics & Overlays</h2>
              <GraphicsOverlay
                state={graphicsState}
                onChange={setGraphicsState}
                compact={isMobile}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile: bottom tab bar */}
      {isMobile && (
        <nav className="flex bg-dark-900 border-t border-gray-800 shrink-0">
          {(
            [
              { tab: 'studio', icon: <Video size={20} />, label: 'Studio' },
              { tab: 'media', icon: <Music size={20} />, label: 'Media' },
              { tab: 'destinations', icon: <Radio size={20} />, label: 'Dest.' },
              { tab: 'branding', icon: <Palette size={20} />, label: 'Brand' },
              { tab: 'graphics', icon: <Trophy size={20} />, label: 'GFX' },
            ] as const
          ).map(({ tab, icon, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex flex-col items-center py-2 gap-1 text-[10px] font-medium ${
                activeTab === tab ? 'text-brand-400' : 'text-gray-500'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
      )}

      <ChatStream
        streamTopic={activeScene?.name || 'General'}
        isStreaming={appState.isStreaming}
        onBroadcast={() => {}}
        authToken={sessionToken}
        liveMessages={liveMessages}
      />

      {guestInviteModal}
      {recordingStopModal}
      {screamDemoModal}
      {mobileTipToast}
      <PWAInstallPrompt />
      {showPostStream && (
        <PostStreamPanel
          transcript={streamTranscript.exportTranscript()}
          wordCount={streamTranscript.wordCount}
          evidenceMarkers={evidenceMarkers.markers}
          evidenceLog={evidenceMarkers.exportLog()}
          streamDuration={appState.streamDuration}
          onClose={() => setShowPostStream(false)}
          authToken={sessionToken}
        />
      )}
    </div>
  );
};

export default App;
