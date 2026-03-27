import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Destination,
  LayoutMode,
  AppState,
  MediaAsset,
  MediaType,
  BrandingSettings,
  Scene,
} from './types';
import { useAudioPipeline } from './hooks/useAudioPipeline';
import { useMobileLayout } from './hooks/useMobileLayout';
import { useAutoCaption } from './hooks/useAutoCaption';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import CanvasCompositor, { CanvasRef } from './components/CanvasCompositor';
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
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

const isMobileViewport = () => window.innerWidth < 768;

// ─── component ──────────────────────────────────────────────────────────────

const App: React.FC = () => {
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

  // sidebar / bottom-tab navigation
  const [activeTab, setActiveTab] = useState<'studio' | 'destinations' | 'branding' | 'media'>(
    'studio',
  );

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

  // auto-captions
  const { caption, isActive: captionsOn, isSupported: captionsSupported, toggle: toggleCaptions } =
    useAutoCaption();

  // guest cameras
  const [guestRoomId] = useState(() => generateRoomId());
  const [guestConnections, setGuestConnections] = useState<GuestConnection[]>([]);
  const [showGuestInvite, setShowGuestInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const guestServiceRef = useRef<GuestHostService | null>(null);

  // refs
  const canvasRef = useRef<CanvasRef>(null);
  const rtmpSenderRef = useRef<RTMPSender | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
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

  // ── media fetch ────────────────────────────────────────────────────────────

  const fetchMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/media/list');
      const data = await res.json();
      setAssets(data.assets || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

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

  const handleMediaUpload = async (file: File, type: MediaType) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.asset) setAssets((prev) => [...prev, data.asset]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMediaDelete = async (id: string) => {
    try {
      await fetch(`/api/media/${id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error(e);
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
        const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setAppState((prev) => ({ ...prev, isStreaming: false }));
    } else {
      const canvasStream = canvasRef.current?.getStream();
      if (!canvasStream || !combinedStream) return alert('Media not ready');

      const outputStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...combinedStream.getAudioTracks(),
      ]);

      if (!rtmpSenderRef.current) {
        rtmpSenderRef.current = new RTMPSender(
          (id, status) =>
            setDestinations((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d))),
          {
            userPlan: 'free',
            userId: user?.uid || 'guest',
            cloudHoursUsed: 0,
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
      }
    }
  };

  const toggleRecording = () => {
    if (appState.isRecording) {
      mediaRecorderRef.current?.stop();
      setAppState((prev) => ({ ...prev, isRecording: false }));
    } else {
      const canvasStream = canvasRef.current?.getStream();
      if (!canvasStream || !combinedStream) return;
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...combinedStream.getAudioTracks(),
      ]);
      const recorder = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp9' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.webm`;
        a.click();
        recordedChunks.current = [];
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
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
    onToggleFullscreen: toggleCamera,
  });

  // ── shared canvas preview + overlay ───────────────────────────────────────

  const canvasPreview = (
    <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
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
        activeScream={activeScream}
        nowPlaying={assets.find((a) => a.id === activeAudioId)?.name}
      />

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

        {/* Flip camera — only on mobile / touch devices */}
        {isMobile && cameraStream && (
          <button
            onClick={flipCamera}
            className="p-2 rounded-full bg-gray-800 text-gray-400"
            title="Flip Camera"
          >
            <Layers size={18} />
          </button>
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
          onClick={() => triggerScream('Patriot', 50, 'THIS IS A MAXIMUM SCREAM!!!')}
          className="p-2 rounded-full bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all"
          title="Test Scream Alert"
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
          <button onClick={() => setShowGuestInvite(false)} className="text-gray-400 hover:text-white">
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
        <div className="w-64 border-r border-gray-800 p-4 overflow-y-auto">
          <SceneSelector activeSceneId={activeScene?.id || null} onSceneSelect={setActiveScene} />
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
        {canvasPreview}

        {isMobile ? (
          // Mobile: compact single-column controls
          <div className="space-y-3">
            <LayoutSelector currentLayout={layout} onSelect={setLayout} />
          </div>
        ) : (
          // Desktop: two-column grid
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <LayoutSelector currentLayout={layout} onSelect={setLayout} />
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
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecording}
            className={`p-2 rounded-full border ${appState.isRecording ? 'bg-gray-800 border-red-500 text-red-500' : 'border-gray-600 text-gray-400'}`}
            title="Record (R)"
          >
            <Disc size={isMobile ? 18 : 20} className={appState.isRecording ? 'animate-pulse' : ''} />
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
          <button
            onClick={logout}
            className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white"
          >
            <Settings size={16} />
          </button>
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
          </nav>
        )}

        {/* Tab content */}
        <main className="flex-1 flex flex-col bg-dark-950 overflow-hidden">
          {activeTab === 'studio' && studioTabContent}

          {activeTab === 'media' && (
            <div className={`flex flex-1 overflow-hidden p-4 gap-4 ${isMobile ? 'flex-col' : ''}`}>
              <div className={isMobile ? 'w-full' : 'w-80'}>
                <MediaBin
                  assets={assets}
                  activeAssets={{ image: activeImageId, video: activeVideoId, audio: activeAudioId }}
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
            <div className="p-4 overflow-y-auto flex-1">
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
              />
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="p-4 overflow-y-auto max-w-4xl flex-1">
              <BrandingPanel settings={branding} onChange={setBranding} />
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
      />

      {guestInviteModal}
      {mobileTipToast}
    </div>
  );
};

export default App;
