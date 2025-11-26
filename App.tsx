import React, { useState, useEffect, useRef } from 'react';
import { 
  Destination, 
  LayoutMode, 
  Platform, 
  AppState,
  MediaAsset,
  MediaType
} from './types';
import CanvasCompositor, { CanvasRef } from './components/CanvasCompositor';
import DestinationManager from './components/DestinationManager';
import LayoutSelector from './components/LayoutSelector';
import MediaBin from './components/MediaBin';
import AudioMixer from './components/AudioMixer';
import BackgroundSelector, { PRESET_BACKGROUNDS } from './components/BackgroundSelector';
import { generateStreamMetadata } from './services/geminiService';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Sparkles, Play, Square, AlertCircle, Camera, Sliders, ArrowRight } from 'lucide-react';

const App = () => {
  // --- State ---
  const [destinations, setDestinations] = useState<Destination[]>([
    { id: '1', platform: Platform.YOUTUBE, name: 'Main Channel', streamKey: '****', isEnabled: true, status: 'offline' },
    { id: '2', platform: Platform.FACEBOOK, name: 'Personal FB', streamKey: '****', isEnabled: false, status: 'offline' }
  ]);
  
  const [layout, setLayout] = useState<LayoutMode>(LayoutMode.FULL_CAM);
  const [appState, setAppState] = useState<AppState>({
    isStreaming: false,
    isRecording: false,
    streamDuration: 0
  });

  // Media Streams
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamMuted, setIsCamMuted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Audio Mixer State
  const [micVolume, setMicVolume] = useState(1.0);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [showMixer, setShowMixer] = useState(false);

  // Media Bin Assets
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  // Backgrounds
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(null);
  const [activeBackgroundUrl, setActiveBackgroundUrl] = useState<string | null>(null);

  // AI Content
  const [streamTopic, setStreamTopic] = useState('');
  const [generatedInfo, setGeneratedInfo] = useState<{title: string, description: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canvasRef = useRef<CanvasRef>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(new Audio());

  // --- Effects ---

  // Audio Player Logic (Background Music)
  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (activeAudioId) {
        const asset = mediaAssets.find(a => a.id === activeAudioId);
        if (asset) {
            // Only update src if it changed to prevent restart on volume change
            const path = asset.url;
            if (!audio.src.includes(path)) {
                audio.src = path;
                audio.loop = true;
                audio.play().catch(e => console.error("Audio play failed", e));
            }
        }
    } else {
        audio.pause();
        audio.src = '';
    }
  }, [activeAudioId, mediaAssets]);

  // Sync Volume to Audio Player
  useEffect(() => {
      if (audioPlayerRef.current) {
          audioPlayerRef.current.volume = musicVolume;
      }
  }, [musicVolume]);

  // Timer for stream duration
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (appState.isStreaming) {
      interval = setInterval(() => {
        setAppState(prev => ({ ...prev, streamDuration: prev.streamDuration + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState.isStreaming]);

  // Initial Camera Load with Error Handling
  const initCam = async () => {
    setPermissionError(null);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionError("Media devices API is not supported in this browser.");
        return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraStream(stream);
      setIsMicMuted(false);
      setIsCamMuted(false);
    } catch (err: any) {
      console.error("Camera access denied", err);
      let msg = "Could not access camera/microphone.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = "Permission denied. Please allow camera access in your browser settings (usually in the address bar).";
      } else if (err.name === 'NotFoundError') {
          msg = "No camera or microphone found on this device.";
      } else if (err.name === 'NotReadableError') {
          msg = "Camera/Mic is currently in use by another application.";
      }
      setPermissionError(msg);
    }
  };

  useEffect(() => {
    initCam();
  }, []);

  // --- Handlers ---

  const handleContinueWithoutCam = () => {
      setPermissionError(null);
      setCameraStream(null);
      // Set muted states to true so UI reflects disabled state
      setIsMicMuted(true);
      setIsCamMuted(true);
  };

  const toggleStream = () => {
    if (appState.isStreaming) {
      // Stop Stream
      setAppState({ ...appState, isStreaming: false, streamDuration: 0 });
      setDestinations(prev => prev.map(d => ({ ...d, status: 'offline' })));
    } else {
      // Start Stream (Simulated)
      const enabled = destinations.filter(d => d.isEnabled);
      if (enabled.length === 0) {
        alert("Please enable at least one destination!");
        return;
      }
      setAppState({ ...appState, isStreaming: true });
      // Simulate connection latency
      setDestinations(prev => prev.map(d => d.isEnabled ? { ...d, status: 'connecting' } : d));
      setTimeout(() => {
        setDestinations(prev => prev.map(d => d.isEnabled ? { ...d, status: 'live' } : d));
      }, 2000);
    }
  };

  const toggleScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      setScreenStream(null);
    } else {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          alert("Screen sharing is not supported on this device/browser.");
          return;
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        
        // Auto switch if currently in Solo view to make sure screen is visible
        if (layout === LayoutMode.FULL_CAM) {
            setLayout(LayoutMode.PIP);
        }
        
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
        };
      } catch (err: any) {
        console.error("Screen share error", err);
        // Only alert if it's not a user cancellation
        if (err.name !== 'NotAllowedError') {
            if (err.message.includes('denied by permission policy')) {
               alert("Screen sharing is blocked by the browser's permission policy.");
            } else {
               alert("Failed to start screen share: " + err.message);
            }
        }
      }
    }
  };

  const toggleMic = () => {
    if (cameraStream) {
      cameraStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleCam = () => {
    if (cameraStream) {
      cameraStream.getVideoTracks().forEach(track => track.enabled = !isCamMuted);
      setIsCamMuted(!isCamMuted);
    }
  };

  const handleGenerateAI = async () => {
    if (!streamTopic) return;
    setIsGenerating(true);
    const result = await generateStreamMetadata(streamTopic);
    setGeneratedInfo(result);
    setIsGenerating(false);
  };

  const handleMediaUpload = (file: File, type: MediaType) => {
      const url = URL.createObjectURL(file);
      const newAsset: MediaAsset = {
          id: Date.now().toString(),
          type,
          url,
          name: file.name
      };
      setMediaAssets(prev => [...prev, newAsset]);
      
      // Auto-play/show if first one
      if (type === 'image' && !activeImageId) setActiveImageId(newAsset.id);
      if (type === 'video' && !activeVideoId) setActiveVideoId(newAsset.id);
  };

  const handleToggleAsset = (id: string, type: MediaType) => {
      if (type === 'image') {
          setActiveImageId(prev => prev === id ? null : id);
      } else if (type === 'video') {
          setActiveVideoId(prev => prev === id ? null : id);
          if (activeVideoId !== id && layout === LayoutMode.FULL_CAM) {
               setLayout(LayoutMode.FULL_SCREEN);
          }
      } else if (type === 'audio') {
          setActiveAudioId(prev => prev === id ? null : id);
      }
  };

  const handleBackgroundSelect = (url: string | null, id: string) => {
      setActiveBackgroundUrl(url);
      setActiveBackgroundId(id);
      // If user picks a background, suggest a layout that shows it off (like Newsroom) if they are in basic solo
      if (id !== 'default' && layout === LayoutMode.FULL_CAM) {
          setLayout(LayoutMode.NEWSROOM);
      }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // derived active URLs
  const activeImageUrl = activeImageId ? mediaAssets.find(a => a.id === activeImageId)?.url || null : null;
  const activeVideoUrl = activeVideoId ? mediaAssets.find(a => a.id === activeVideoId)?.url || null : null;

  return (
    <div className="h-screen w-screen bg-dark-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-dark-800 shrink-0">
        <div className="flex items-center gap-2">
            <div className="bg-brand-600 p-2 rounded-lg">
                <Monitor size={20} className="text-white"/>
            </div>
            <h1 className="text-xl font-bold tracking-tight">StreamHub<span className="text-brand-500">Pro</span></h1>
        </div>
        
        <div className="flex items-center gap-6">
            {appState.isStreaming && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/50 rounded text-red-500 font-mono">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {formatTime(appState.streamDuration)}
                </div>
            )}
            <button 
                onClick={toggleStream}
                className={`px-6 py-2 rounded-full font-bold transition-all shadow-lg flex items-center gap-2
                    ${appState.isStreaming 
                        ? 'bg-red-600 hover:bg-red-700 shadow-red-900/50' 
                        : 'bg-brand-600 hover:bg-brand-500 shadow-brand-900/50'
                    }`}
            >
                {appState.isStreaming ? <Square size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" />}
                {appState.isStreaming ? 'END STREAM' : 'GO LIVE'}
            </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Assets & Templates */}
        <aside className="w-80 border-r border-gray-800 bg-dark-900 flex flex-col overflow-hidden">
            
            {/* Media Bin */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="px-4 py-2 bg-dark-800 border-b border-gray-700 font-bold text-xs text-gray-400 uppercase">
                    Media & Overlays
                </div>
                <MediaBin 
                    assets={mediaAssets}
                    activeAssets={{ image: activeImageId, video: activeVideoId, audio: activeAudioId }}
                    onUpload={handleMediaUpload}
                    onDelete={(id) => setMediaAssets(mediaAssets.filter(a => a.id !== id))}
                    onToggleAsset={handleToggleAsset}
                />
            </div>

            {/* Backgrounds */}
            <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-gray-800 bg-dark-900">
                 <BackgroundSelector 
                    currentBackgroundId={activeBackgroundId}
                    onSelect={handleBackgroundSelect}
                 />
            </div>
        </aside>

        {/* Center: Stage */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
            {/* Viewport */}
            <div className="flex-1 p-8 flex items-center justify-center relative bg-[#0a0a0a]">
                 <CanvasCompositor 
                    ref={canvasRef}
                    layout={layout}
                    cameraStream={cameraStream}
                    screenStream={screenStream}
                    activeMediaUrl={activeImageUrl}
                    activeVideoUrl={activeVideoUrl}
                    backgroundUrl={activeBackgroundUrl}
                    videoVolume={videoVolume}
                 />

                 {/* Permission Error Overlay */}
                 {(!cameraStream && permissionError) && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-dark-800 p-6 rounded-xl border border-red-500/50 max-w-md w-full text-center shadow-2xl">
                            <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="text-red-500" size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Camera Access Required</h3>
                            <p className="text-gray-400 mb-6 text-sm">{permissionError}</p>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={initCam}
                                    className="w-full bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    <Camera size={18} />
                                    Try Again
                                </button>
                                <button 
                                    onClick={handleContinueWithoutCam}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    Continue without Camera
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                 )}
            </div>

            {/* Bottom Control Deck */}
            <div className="h-24 bg-dark-800 border-t border-gray-700 px-8 flex items-center justify-between gap-8 z-10 shrink-0 relative">
                {/* Source Controls */}
                <div className="flex items-center gap-4 border-r border-gray-700 pr-8">
                    <button 
                        onClick={toggleMic}
                        disabled={!cameraStream}
                        className={`p-4 rounded-full transition-all ${isMicMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50 cursor-not-allowed'}`}
                        title="Toggle Mic"
                    >
                        {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    <button 
                        onClick={toggleCam}
                        disabled={!cameraStream}
                        className={`p-4 rounded-full transition-all ${isCamMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50 cursor-not-allowed'}`}
                        title="Toggle Camera"
                    >
                        {isCamMuted ? <VideoOff size={24} /> : <Video size={24} />}
                    </button>
                     <button 
                        onClick={toggleScreenShare}
                        className={`p-4 rounded-full transition-all ${screenStream ? 'bg-brand-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        title="Share Screen"
                    >
                        {screenStream ? <MonitorOff size={24} /> : <Monitor size={24} />}
                    </button>
                </div>

                {/* Mixer Toggle */}
                <div className="relative">
                    <button 
                        onClick={() => setShowMixer(!showMixer)}
                        className={`p-4 rounded-full transition-all flex flex-col items-center gap-1 ${showMixer ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300 hover:text-white'}`}
                        title="Audio Mixer"
                    >
                        <Sliders size={24} />
                    </button>
                    
                    {/* Mixer Popover */}
                    {showMixer && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 animate-fade-in">
                            <AudioMixer 
                                micVolume={micVolume}
                                musicVolume={musicVolume}
                                videoVolume={videoVolume}
                                onMicVolumeChange={setMicVolume}
                                onMusicVolumeChange={setMusicVolume}
                                onVideoVolumeChange={setVideoVolume}
                            />
                            {/* Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-dark-800" />
                        </div>
                    )}
                </div>

                {/* Layouts */}
                <div className="flex-1 flex justify-center">
                    <LayoutSelector currentLayout={layout} onSelect={setLayout} />
                </div>

                <div className="w-16"></div> {/* Spacer balance */}
            </div>
        </main>
        
        {/* Right Sidebar: Destinations & AI */}
        <aside className="w-80 border-l border-gray-800 bg-dark-900 flex flex-col overflow-hidden">
             {/* AI Assistant - Moved to right for balance */}
             <div className="p-4 border-b border-gray-800 shrink-0 bg-gradient-to-br from-indigo-900/20 to-transparent">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase flex items-center gap-2">
                    <Sparkles size={14} className="text-brand-400"/> AI Studio Assistant
                </h3>
                <div className="space-y-3">
                    <input 
                        className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none"
                        placeholder="What's your stream about?"
                        value={streamTopic}
                        onChange={(e) => setStreamTopic(e.target.value)}
                    />
                    <button 
                        onClick={handleGenerateAI}
                        disabled={isGenerating || !streamTopic}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isGenerating ? 'Generating...' : 'Generate Metadata'}
                    </button>
                    {generatedInfo && (
                        <div className="bg-indigo-900/20 p-3 rounded border border-indigo-500/30 text-sm animate-fade-in">
                            <div className="font-bold text-indigo-300 mb-1">{generatedInfo.title}</div>
                            <div className="text-xs text-gray-400">{generatedInfo.description}</div>
                        </div>
                    )}
                </div>
            </div>

            <DestinationManager 
                destinations={destinations}
                onAddDestination={(d) => setDestinations([...destinations, d])}
                onRemoveDestination={(id) => setDestinations(destinations.filter(d => d.id !== id))}
                onToggleDestination={(id) => setDestinations(destinations.map(d => d.id === id ? {...d, isEnabled: !d.isEnabled} : d))}
                isStreaming={appState.isStreaming}
            />
        </aside>
      </div>
    </div>
  );
};

export default App;