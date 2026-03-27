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
import { useAuth } from './contexts/AuthContext';
import { createScreamAlert, ScreamAlert, calculateScreamDuration } from './services/chatScreamer';
import {
  Settings,
  Layers,
  Mic,
  Video,
  Monitor,
  Radio,
  Palette,
  Music,
  Disc,
  Play,
  Square,
  Zap,
} from 'lucide-react';

const App: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, sessionToken, logout } = useAuth();

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [activeTab, setActiveTab] = useState<'studio' | 'destinations' | 'branding' | 'media'>(
    'studio',
  );
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

  const [micVolume, setMicVolume] = useState(1.0);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isMicMuted, setIsMicMuted] = useState(false);

  // --- Scream Handler ---
  const triggerScream = (donor: string, amount: number, message: string) => {
    const scream = createScreamAlert(donor, amount, message, user?.uid || 'demo');
    if (scream) {
      setActiveScream(scream);
      const duration = calculateScreamDuration(scream.tier, message.length);
      setTimeout(() => setActiveScream(null), duration);
    }
  };

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

  const [appState, setAppState] = useState<AppState & { streamDuration: number; bitrate: number }>({
    isStreaming: false,
    isRecording: false,
    streamDuration: 0,
    bitrate: 0,
  });

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);

  const canvasRef = useRef<CanvasRef>(null);
  const rtmpSenderRef = useRef<RTMPSender | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  const { initAudio, combinedStream, levels } = useAudioPipeline({
    micStream: cameraStream,
    musicElement,
    videoElement: canvasRef.current?.getVideoElement(),
    micVolume,
    musicVolume,
    videoVolume,
    isMicMuted,
  });

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

  const toggleCamera = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setCameraStream(s);
        initAudio();
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
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-dark-950 text-white overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 bg-dark-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center font-black text-xl italic">
              S
            </div>
            <h1 className="text-xl font-black tracking-tighter">CHATSCREAM</h1>
          </div>
          {(appState.isStreaming || appState.isRecording) && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/80 border border-gray-700 rounded-full font-mono text-xs">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${appState.isStreaming ? 'bg-red-500' : 'bg-brand-400'}`}
                />
                {formatTime(appState.streamDuration)}
              </div>
              {appState.isStreaming && (
                <div className="text-[10px] font-bold text-brand-400 uppercase tracking-tight">
                  {appState.bitrate} kbps
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleRecording}
            className={`p-2 rounded-full border ${appState.isRecording ? 'bg-gray-800 border-red-500 text-red-500' : 'border-gray-600 text-gray-400'}`}
          >
            <Disc size={20} className={appState.isRecording ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={handleBroadcast}
            className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${appState.isStreaming ? 'bg-red-600' : 'bg-brand-500 hover:bg-brand-600'}`}
          >
            {appState.isStreaming ? (
              <Square size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
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

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-16 bg-dark-900 border-r border-gray-800 flex flex-col items-center py-6 gap-6">
          <button
            onClick={() => setActiveTab('studio')}
            className={`p-3 rounded-xl ${activeTab === 'studio' ? 'bg-brand-500' : 'text-gray-500'}`}
          >
            <Video size={20} />
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`p-3 rounded-xl ${activeTab === 'media' ? 'bg-brand-500' : 'text-gray-500'}`}
          >
            <Music size={20} />
          </button>
          <button
            onClick={() => setActiveTab('destinations')}
            className={`p-3 rounded-xl ${activeTab === 'destinations' ? 'bg-brand-500' : 'text-gray-500'}`}
          >
            <Radio size={20} />
          </button>
          <button
            onClick={() => setActiveTab('branding')}
            className={`p-3 rounded-xl ${activeTab === 'branding' ? 'bg-brand-500' : 'text-gray-500'}`}
          >
            <Palette size={20} />
          </button>
        </nav>

        <main className="flex-1 flex flex-col bg-dark-950 overflow-hidden">
          {activeTab === 'studio' && (
            <div className="flex flex-1 overflow-hidden">
              <div className="w-64 border-r border-gray-800 p-4 overflow-y-auto">
                <SceneSelector
                  activeSceneId={activeScene?.id || null}
                  onSceneSelect={setActiveScene}
                />
              </div>

              <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto">
                <div className="relative">
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
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-dark-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700 shadow-2xl">
                    <button
                      onClick={toggleCamera}
                      className={`p-2 rounded-full ${cameraStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
                      title="Toggle Camera"
                    >
                      <Video size={18} />
                    </button>
                    <button
                      onClick={toggleScreen}
                      className={`p-2 rounded-full ${screenStream ? 'bg-brand-500' : 'bg-gray-800 text-gray-400'}`}
                      title="Share Screen"
                    >
                      <Monitor size={18} />
                    </button>
                    <div className="h-4 w-[1px] bg-gray-700 mx-1" />
                    <button
                      onClick={() => triggerScream('Patriot', 50, 'THIS IS A MAXIMUM SCREAM!!!')}
                      className="p-2 rounded-full bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all"
                      title="Test Maximum Scream"
                    >
                      <Zap size={18} />
                    </button>
                  </div>
                </div>

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
              </div>
            </div>
          )}

          {activeTab === 'media' && (
            <div className="flex flex-1 overflow-hidden p-6 gap-6">
              <div className="w-80">
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
            <div className="p-8 overflow-y-auto">
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
            <div className="p-8 overflow-y-auto max-w-4xl">
              <BrandingPanel settings={branding} onChange={setBranding} />
            </div>
          )}
        </main>
      </div>

      <ChatStream
        streamTopic={activeScene?.name || 'General'}
        isStreaming={appState.isStreaming}
        onBroadcast={() => {}}
        authToken={sessionToken}
      />
    </div>
  );
};

export default App;
