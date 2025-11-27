import React, { useState, useEffect, useRef } from 'react';
import { 
  Destination, 
  LayoutMode, 
  Platform, 
  AppState,
  MediaAsset,
  MediaType,
  BrandingSettings
} from './types';
import CanvasCompositor, { CanvasRef } from './components/CanvasCompositor';
import DestinationManager from './components/DestinationManager';
import LayoutSelector from './components/LayoutSelector';
import MediaBin from './components/MediaBin';
import AudioMixer from './components/AudioMixer';
import BackgroundSelector, { PRESET_BACKGROUNDS } from './components/BackgroundSelector';
import BrandingPanel from './components/BrandingPanel';
import { generateStreamMetadata } from './services/geminiService';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Sparkles, Play, Square, AlertCircle, Camera, Sliders, ArrowRight, Layers, Palette, FolderOpen, Disc } from 'lucide-react';

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

  // Backgrounds & Branding
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(null);
  const [activeBackgroundUrl, setActiveBackgroundUrl] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingSettings>({
      showLowerThird: true,
      showTicker: true,
      primaryColor: '#0284c7', // Brand 600
      accentColor: '#ef4444', // Red 500
      presenterName: 'Alex Streamer',
      presenterTitle: 'Live Host',
      tickerText: 'Welcome to the live stream! Don\'t forget to like and subscribe for more content.'
  });

  // UI State
  const [leftSidebarTab, setLeftSidebarTab] = useState<'media' | 'graphics'>('media');

  // AI Content
  const [streamTopic, setStreamTopic] = useState('');
  const [generatedInfo, setGeneratedInfo] = useState<{title: string, description: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canvasRef = useRef<CanvasRef>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(new Audio());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

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
    if (appState.isStreaming || appState.isRecording) {
      interval = setInterval(() => {
        setAppState(prev => ({ ...prev, streamDuration: prev.streamDuration + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState.isStreaming, appState.isRecording]);

  // Initial Camera Load with Error Handling
  const initCam = async () => {
    setPermissionError(null);
    
    // Check if API is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("MediaDevices API not supported. Starting in No-Camera mode.");
        setCameraStream(null);
        setIsMicMuted(true);
        setIsCamMuted(true);
        return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (stream.getTracks().length > 0) {
        setCameraStream(stream);
        setIsMicMuted(false);
        setIsCamMuted(false);
      } else {
        throw new Error("Stream started but has no tracks.");
      }
    } catch (err: any) {
      console.warn("Camera initialization failed:", err);
      
      // If hardware is missing (NotFoundError), we silently fallback to "No Camera" mode
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('no tracks')) {
          setCameraStream(null);
          setIsMicMuted(true);
          setIsCamMuted(true);
          return;
      }

      // If Permission was denied, we DO want to show the overlay so they can fix it.
      let msg = "Could not access camera/microphone.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = "Permission denied. Please check your browser settings.";
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
      setAppState({ ...appState, isStreaming: false, streamDuration: appState.isRecording ? appState.streamDuration : 0 });
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

  const toggleRecording = () => {
    if (appState.isRecording) {
      // STOP Recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setAppState(prev => ({ ...prev, isRecording: false, streamDuration: prev.isStreaming ? prev.streamDuration : 0 }));
    } else {
      // START Recording
      try {
        if (!canvasRef.current) return;
        
        // 1. Get Visual Stream from Canvas
        const canvasStream = canvasRef.current.getStream();
        
        // 2. Mix in Audio (Ideally use Web Audio API for mix, but for MVP we use Camera Mic)
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...(cameraStream ? cameraStream.getAudioTracks() : [])
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
        
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.current.push(event.data);
          }
        };
        
        recorder.onstop = () => {
          const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `recording-${new Date().toISOString()}.webm`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          recordedChunks.current = []; // Reset
        };
        
        recorder.start(1000); // 1s chunks
        mediaRecorderRef.current = recorder;
        setAppState(prev => ({ ...prev, isRecording: true }));
        
      } catch (e) {
        console.error("Recording failed", e);
        alert("Could not start recording. Browser might not support this format.");
      }
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
            {(appState.isStreaming || appState.isRecording) && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 border border-gray-600 rounded font-mono">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${appState.isStreaming ? 'bg-red-500' : 'bg-brand-400'}`} />
                    {formatTime(appState.streamDuration)}
                </div>
            )}
            
            <div className="flex items-center gap-2">
                {/* RECORD BUTTON */}
                <button 
                  onClick={toggleRecording}
                  className={`px-4 py-2 rounded-full font-bold transition-all border flex items-center gap-2
                    ${appState.isRecording
                      ? 'bg-gray-700 border-red-500 text-red-500' 
                      : 'bg-dark-900 border-gray-600 text-gray-300 hover:border-gray-400'
                    }`}
                >
                  <Disc size={18} className={appState.isRecording ? 'animate-pulse' : ''} />
                  {appState.isRecording ? 'REC' : 'REC'}
                </button>

                {/* STREAM BUTTON */}
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
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Assets & Templates */}
        <aside className="w-80 border-r border-gray-800 bg-dark-900 flex flex-col overflow-hidden">
            
            {/* Tab Switcher */}
            <div className="flex border-b border-gray-800 bg-dark-800">
               <button 
                  onClick={() => setLeftSidebarTab('media')}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${leftSidebarTab === 'media' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}
                >
                  <FolderOpen size={14} /> MEDIA
               </button>
               <button 
                  onClick={() => setLeftSidebarTab('graphics')}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${leftSidebarTab === 'graphics' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}
                >
                  <Palette size={14} /> GRAPHICS
               </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {leftSidebarTab === 'media' ? (
                  <>
                     <div className="flex-1 overflow-hidden">
                        <MediaBin 
                            assets={mediaAssets}
                            activeAssets={{ image: activeImageId, video: activeVideoId, audio: activeAudioId }}
                            onUpload={handleMediaUpload}
                            onDelete={(id) => setMediaAssets(mediaAssets.filter(a => a.id !== id))}
                            onToggleAsset={handleToggleAsset}
                        />
                     </div>
                     <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-gray-800 bg-dark-900">
                        <BackgroundSelector 
                            currentBackgroundId={activeBackgroundId}
                            onSelect={handleBackgroundSelect}
                        />
                     </div>
                  </>
                ) : (
                  <BrandingPanel settings={branding} onChange={setBranding} />
                )}
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
                    branding={branding}
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