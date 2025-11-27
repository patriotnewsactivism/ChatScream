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
import { RTMPSender } from './services/RTMPSender';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Sparkles, 
  Play, Square, AlertCircle, Camera, Sliders, ArrowRight, 
  FolderOpen, Palette, Radio, X, Menu, Settings, Disc, Globe, ChevronDown, ChevronUp
} from 'lucide-react';

type MobilePanel = 'none' | 'media' | 'graphics' | 'destinations' | 'mixer';

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
  const [showMixerDesktop, setShowMixerDesktop] = useState(false);

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
  
  // Mobile Specific UI State
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');
  const [isLandscape, setIsLandscape] = useState(false);

  // AI Content
  const [streamTopic, setStreamTopic] = useState('');
  const [generatedInfo, setGeneratedInfo] = useState<{title: string, description: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canvasRef = useRef<CanvasRef>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(new Audio());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const rtmpSenderRef = useRef<RTMPSender | null>(null);
  
  // Audio Mixer Refs (Web Audio API)
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  // Source & Gain Nodes
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  
  const musicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  
  const videoSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const videoAnalyserRef = useRef<AnalyserNode | null>(null); // For future visualizers

  // --- Effects ---

  // Handle Orientation Changes
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
    };
    handleResize(); // Init
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize RTMPSender
  useEffect(() => {
    const statusUpdater = (id: string, status: Destination['status']) => {
        setDestinations(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    };
    
    rtmpSenderRef.current = new RTMPSender(statusUpdater);
    
    return () => {
        rtmpSenderRef.current?.disconnect();
    };
  }, []);

  // Audio Player Logic (Background Music)
  useEffect(() => {
    const audio = audioPlayerRef.current;
    audio.crossOrigin = "anonymous";
    
    if (activeAudioId) {
        const asset = mediaAssets.find(a => a.id === activeAudioId);
        if (asset) {
            const path = asset.url;
            if (!audio.src.includes(path)) {
                audio.src = path;
                audio.loop = true;
                // Attempt play, but might fail if no user interaction yet
                audio.play().catch(e => console.debug("Audio autoplay deferred", e));
            }
        }
    } else {
        audio.pause();
        audio.src = '';
    }
  }, [activeAudioId, mediaAssets]);

  // Sync Volume to Audio Player (Direct playback volume)
  useEffect(() => {
      if (audioPlayerRef.current) {
          audioPlayerRef.current.volume = musicVolume;
      }
      if (musicGainRef.current) {
          musicGainRef.current.gain.value = 1.0; 
      }
  }, [musicVolume]);

  useEffect(() => {
      if (micGainRef.current) {
          micGainRef.current.gain.value = micVolume;
      }
  }, [micVolume]);

  useEffect(() => {
      if (videoGainRef.current) {
          videoGainRef.current.gain.value = 1.0; // Volume controlled by element in compositor, gain is unity
      }
  }, [videoVolume]);

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
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('no tracks')) {
          setCameraStream(null);
          setIsMicMuted(true);
          setIsCamMuted(true);
          return;
      }
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

  // Initialize/Connect Audio Graph
  const ensureAudioContext = () => {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
          ctx.resume();
      }

      if (audioDestRef.current) return; // Already setup

      const dest = ctx.createMediaStreamDestination();
      audioDestRef.current = dest;

      // Mic Node
      const micGain = ctx.createGain();
      micGain.gain.value = micVolume;
      micGain.connect(dest);
      micGainRef.current = micGain;

      if (cameraStream) {
          try {
              const micSrc = ctx.createMediaStreamSource(cameraStream);
              micSrc.connect(micGain);
              micSourceRef.current = micSrc;
          } catch(e) { console.warn("Could not connect mic source", e); }
      }

      // Music Node
      const musicGain = ctx.createGain();
      musicGain.gain.value = 1.0; 
      musicGain.connect(dest);
      musicGainRef.current = musicGain;

      if (audioPlayerRef.current) {
          try {
              // @ts-ignore
              const musicSrc = ctx.createMediaElementSource(audioPlayerRef.current);
              musicSrc.connect(musicGain);
              musicSourceRef.current = musicSrc;
          } catch (e) { console.warn("Could not connect music source", e); }
      }

      // Video Node
      const vidGain = ctx.createGain();
      vidGain.gain.value = 1.0; 
      vidGain.connect(dest);
      videoGainRef.current = vidGain;
      
      const vidAnalyser = ctx.createAnalyser();
      vidAnalyser.fftSize = 256;
      videoAnalyserRef.current = vidAnalyser;
  };

  // Connect video player audio to audio mixer dynamically
  useEffect(() => {
    const videoElement = canvasRef.current?.getVideoElement();
    const isPlayingVideo = activeVideoId && videoElement && videoElement.src;

    if (!audioContextRef.current || !videoGainRef.current || !audioDestRef.current || !videoAnalyserRef.current) return;

    // Disconnect previous video source if exists
    if (videoSourceRef.current) {
        try {
            videoSourceRef.current.disconnect();
            videoSourceRef.current = null;
        } catch (e) {
            console.error('Failed to disconnect previous video source:', e);
        }
    }

    if (isPlayingVideo) {
        try {
            // @ts-ignore - captureStream is available on HTMLMediaElement
            const videoStream = videoElement.captureStream ? videoElement.captureStream() : videoElement.mozCaptureStream();

            if (videoStream.getAudioTracks().length > 0) {
                const videoSource = audioContextRef.current.createMediaStreamSource(videoStream);
                videoSourceRef.current = videoSource;

                // Connect: video → analyser → gain → destination
                videoSource.connect(videoAnalyserRef.current);
                videoAnalyserRef.current.connect(videoGainRef.current);
                videoGainRef.current.connect(audioDestRef.current);

                console.log('🎬 Video Clip audio connected to mixer');
            } else {
                 console.log('🎬 Video Clip has no audio track.');
            }
        } catch (e) {
            console.error('Failed to connect video audio track:', e);
        }
    }

    return () => {
        if (videoSourceRef.current) {
            try {
                videoSourceRef.current.disconnect();
                videoSourceRef.current = null;
            } catch (e) {}
        }
    };
  }, [activeVideoId]);

  // Re-connect mic if camera stream changes
  useEffect(() => {
      if (audioContextRef.current && micGainRef.current && cameraStream) {
          if (micSourceRef.current) {
              micSourceRef.current.disconnect();
          }
          try {
              const micSrc = audioContextRef.current.createMediaStreamSource(cameraStream);
              micSrc.connect(micGainRef.current);
              micSourceRef.current = micSrc;
          } catch(e) { console.warn("Could not reconnect mic", e); }
      }
  }, [cameraStream]);

  // --- Handlers ---

  const handleInteraction = () => {
      // Ensure AudioContext is resumed on first interaction
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
      }
  };

  const handleContinueWithoutCam = () => {
      setPermissionError(null);
      setCameraStream(null);
      setIsMicMuted(true);
      setIsCamMuted(true);
      handleInteraction();
  };

  const toggleStream = () => {
    handleInteraction();
    if (!rtmpSenderRef.current) return;
    ensureAudioContext();

    if (appState.isStreaming) {
      rtmpSenderRef.current.disconnect();
      setAppState({ ...appState, isStreaming: false, streamDuration: appState.isRecording ? appState.streamDuration : 0 });
    } else {
      const enabled = destinations.filter(d => d.isEnabled);
      if (enabled.length === 0) {
        alert("Please enable at least one destination!");
        return;
      }

      const canvasStream = canvasRef.current?.getStream();
      const combinedAudioStream = audioDestRef.current?.stream;
      
      if (!canvasStream || !combinedAudioStream) {
          alert("Cannot start stream: Canvas or Audio Mixer not ready.");
          return;
      }

      const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...combinedAudioStream.getAudioTracks()
      ]);

      rtmpSenderRef.current.connect(combinedStream, enabled);
      setAppState({ ...appState, isStreaming: true });
    }
  };

  const toggleRecording = () => {
    handleInteraction();
    if (appState.isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setAppState(prev => ({ ...prev, isRecording: false, streamDuration: prev.isStreaming ? prev.streamDuration : 0 }));
    } else {
      try {
        if (!canvasRef.current) return;
        ensureAudioContext();
        
        const canvasStream = canvasRef.current.getStream();
        const combinedAudioStream = audioDestRef.current?.stream;
        
        if (!combinedAudioStream) {
            alert("Audio mixer not ready.");
            return;
        }

        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...combinedAudioStream.getAudioTracks()
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
          recordedChunks.current = [];
        };
        
        recorder.start(1000); 
        mediaRecorderRef.current = recorder;
        setAppState(prev => ({ ...prev, isRecording: true }));
        
      } catch (e) {
        console.error("Recording failed", e);
        alert("Could not start recording. Browser might not support this format.");
      }
    }
  };

  const toggleScreenShare = async () => {
    handleInteraction();
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
        if (layout === LayoutMode.FULL_CAM) setLayout(LayoutMode.PIP);
        
        stream.getVideoTracks()[0].onended = () => setScreenStream(null);
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
             alert(err.message.includes('permission') ? "Screen sharing blocked by permission policy." : "Failed to start screen share.");
        }
      }
    }
  };

  const toggleMic = () => {
    handleInteraction();
    if (cameraStream) {
      cameraStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleCam = () => {
    handleInteraction();
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
      const newAsset: MediaAsset = { id: Date.now().toString(), type, url, name: file.name };
      setMediaAssets(prev => [...prev, newAsset]);
      if (type === 'image' && !activeImageId) setActiveImageId(newAsset.id);
      if (type === 'video' && !activeVideoId) setActiveVideoId(newAsset.id);
  };

  const handleToggleAsset = (id: string, type: MediaType) => {
      handleInteraction();
      if (type === 'image') {
          setActiveImageId(prev => prev === id ? null : id);
      } else if (type === 'video') {
          setActiveVideoId(prev => prev === id ? null : id);
          if (activeVideoId !== id && layout === LayoutMode.FULL_CAM) setLayout(LayoutMode.FULL_SCREEN);
      } else if (type === 'audio') {
          setActiveAudioId(prev => prev === id ? null : id);
      }
  };

  const handleBackgroundSelect = (url: string | null, id: string) => {
      setActiveBackgroundUrl(url);
      setActiveBackgroundId(id);
      if (id !== 'default' && layout === LayoutMode.FULL_CAM) setLayout(LayoutMode.NEWSROOM);
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

  // --- Render Components ---

  const renderMediaPanel = () => (
    <div className="flex flex-col h-full bg-dark-900">
        <div className="flex-1 overflow-hidden">
            <MediaBin 
                assets={mediaAssets}
                activeAssets={{ image: activeImageId, video: activeVideoId, audio: activeAudioId }}
                onUpload={handleMediaUpload}
                onDelete={(id) => setMediaAssets(mediaAssets.filter(a => a.id !== id))}
                onToggleAsset={handleToggleAsset}
            />
        </div>
        <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-gray-800 bg-dark-900 pb-safe">
            <BackgroundSelector 
                currentBackgroundId={activeBackgroundId}
                onSelect={handleBackgroundSelect}
            />
        </div>
    </div>
  );

  const renderGraphicsPanel = () => (
      <BrandingPanel settings={branding} onChange={setBranding} />
  );

  const renderDestinationsPanel = () => (
    <div className="flex flex-col h-full bg-dark-900">
        <div className="p-4 border-b border-gray-800 shrink-0 bg-gradient-to-br from-indigo-900/20 to-transparent">
            <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase flex items-center gap-2">
                <Sparkles size={14} className="text-brand-400"/> AI Assistant
            </h3>
            <div className="space-y-3">
                <input 
                    className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none"
                    placeholder="Stream Topic (e.g. Gaming)"
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
        <div className="flex-1 overflow-y-auto pb-safe">
            <DestinationManager 
                destinations={destinations}
                onAddDestination={(d) => setDestinations([...destinations, d])}
                onRemoveDestination={(id) => setDestinations(destinations.filter(d => d.id !== id))}
                onToggleDestination={(id) => setDestinations(destinations.map(d => d.id === id ? {...d, isEnabled: !d.isEnabled} : d))}
                isStreaming={appState.isStreaming}
            />
        </div>
    </div>
  );

  // --- Main Render ---
  return (
    <div className="h-[100dvh] w-full bg-dark-900 text-gray-100 flex flex-col overflow-hidden" onClick={handleInteraction}>
      
      {/* --- HEADER --- */}
      <header className="h-14 md:h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-dark-800/90 backdrop-blur-md shrink-0 z-30 transition-all">
        <div className="flex items-center gap-2">
            <div className="bg-brand-600 p-1.5 rounded-lg shadow-lg shadow-brand-900/50">
                <Monitor size={18} className="text-white"/>
            </div>
            <h1 className="text-lg font-bold tracking-tight hidden xs:block">StreamHub<span className="text-brand-500">Pro</span></h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3">
            {(appState.isStreaming || appState.isRecording) && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-900/80 border border-gray-700 rounded-full font-mono text-xs shadow-inner">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${appState.isStreaming ? 'bg-red-500' : 'bg-brand-400'}`} />
                    {formatTime(appState.streamDuration)}
                </div>
            )}
            
            <button 
                onClick={toggleRecording}
                className={`w-9 h-9 md:w-auto md:h-auto md:px-4 md:py-2 rounded-full font-bold transition-all border flex items-center justify-center gap-2
                ${appState.isRecording
                    ? 'bg-gray-800 border-red-500 text-red-500' 
                    : 'bg-dark-900/50 border-gray-600 text-gray-300 hover:border-gray-400 hover:bg-gray-800'
                }`}
            >
                <Disc size={18} className={appState.isRecording ? 'animate-pulse' : ''} />
                <span className="hidden md:inline">REC</span>
            </button>

            <button 
                onClick={toggleStream}
                className={`px-4 md:px-6 py-2 rounded-full font-bold transition-all shadow-lg flex items-center gap-2 text-sm
                    ${appState.isStreaming 
                        ? 'bg-red-600 hover:bg-red-700 shadow-red-900/50' 
                        : 'bg-brand-600 hover:bg-brand-500 shadow-brand-900/50'
                    }`}
            >
                {appState.isStreaming ? <Square size={16} fill="currentColor"/> : <Play size={16} fill="currentColor" />}
                <span className="hidden md:inline">{appState.isStreaming ? 'END STREAM' : 'GO LIVE'}</span>
                <span className="md:hidden">{appState.isStreaming ? 'STOP' : 'LIVE'}</span>
            </button>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden lg:flex w-80 border-r border-gray-800 bg-dark-900 flex-col overflow-hidden z-20">
            <div className="flex border-b border-gray-800 bg-dark-800">
               <button onClick={() => setLeftSidebarTab('media')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${leftSidebarTab === 'media' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}>
                  <FolderOpen size={14} /> MEDIA
               </button>
               <button onClick={() => setLeftSidebarTab('graphics')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${leftSidebarTab === 'graphics' ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-white'}`}>
                  <Palette size={14} /> GRAPHICS
               </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {leftSidebarTab === 'media' ? renderMediaPanel() : renderGraphicsPanel()}
            </div>
        </aside>

        {/* CANVAS & CENTRAL AREA */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
            <div className="flex-1 flex items-center justify-center relative bg-[#0a0a0a] p-0 md:p-8 overflow-hidden">
                 
                 {/* Video Container */}
                 <div className={`transition-all duration-300 relative shadow-2xl border-gray-800 overflow-hidden bg-black
                    ${isLandscape && window.innerHeight < 500 ? 'h-full aspect-video border-none' : 'w-full max-w-full aspect-video md:rounded-lg border-y md:border'}
                 `}>
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
                 </div>

                 {/* Error Overlay */}
                 {(!cameraStream && permissionError) && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
                        <div className="bg-dark-800 p-6 rounded-xl border border-red-500/50 max-w-sm w-full text-center shadow-2xl animate-fade-in">
                            <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="text-red-500" size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Camera Access Required</h3>
                            <p className="text-gray-400 mb-6 text-sm">{permissionError}</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={initCam} className="w-full bg-brand-600 text-white px-4 py-3 rounded-lg font-bold">Try Again</button>
                                <button onClick={handleContinueWithoutCam} className="w-full bg-gray-700 text-gray-200 px-4 py-3 rounded-lg font-semibold">Continue without Camera</button>
                            </div>
                        </div>
                    </div>
                 )}
            </div>

            {/* MOBILE: Landscape Side Panel Logic (Hidden in Portrait) */}
            {isLandscape && mobilePanel !== 'none' && (
                <div className="absolute top-0 right-0 bottom-0 w-[40%] bg-dark-900/95 backdrop-blur border-l border-gray-700 z-40 animate-slide-up flex flex-col">
                    <div className="flex items-center justify-between p-3 border-b border-gray-700">
                         <h3 className="text-xs font-bold uppercase">
                           {mobilePanel === 'media' && 'Media'}
                           {mobilePanel === 'graphics' && 'Graphics'}
                           {mobilePanel === 'destinations' && 'Stream'}
                           {mobilePanel === 'mixer' && 'Audio'}
                         </h3>
                         <button onClick={() => setMobilePanel('none')}><X size={18}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {mobilePanel === 'media' && renderMediaPanel()}
                        {mobilePanel === 'graphics' && renderGraphicsPanel()}
                        {mobilePanel === 'destinations' && renderDestinationsPanel()}
                        {mobilePanel === 'mixer' && <AudioMixer micVolume={micVolume} musicVolume={musicVolume} videoVolume={videoVolume} onMicVolumeChange={setMicVolume} onMusicVolumeChange={setMusicVolume} onVideoVolumeChange={setVideoVolume} />}
                    </div>
                </div>
            )}

            {/* MOBILE: Portrait Bottom Sheet */}
            {!isLandscape && mobilePanel !== 'none' && (
              <div className="absolute inset-x-0 bottom-0 top-auto h-[60%] md:hidden z-40 bg-dark-900 border-t border-gray-700 flex flex-col rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-slide-up">
                 <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-dark-800 rounded-t-2xl shrink-0 cursor-pointer" onClick={() => setMobilePanel('none')}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-1 bg-gray-600 rounded-full mx-auto absolute left-0 right-0 top-2" />
                        <h3 className="text-sm font-bold uppercase text-gray-200 flex items-center gap-2 mt-2">
                           {mobilePanel === 'media' && <><FolderOpen size={16}/> Media Library</>}
                           {mobilePanel === 'graphics' && <><Palette size={16}/> Stream Graphics</>}
                           {mobilePanel === 'destinations' && <><Globe size={16}/> Destinations</>}
                           {mobilePanel === 'mixer' && <><Sliders size={16}/> Audio Mixer</>}
                        </h3>
                    </div>
                    <button className="mt-2 p-1 bg-gray-700 rounded-full"><ChevronDown size={16}/></button>
                 </div>
                 <div className="flex-1 overflow-hidden bg-dark-900 relative">
                    {mobilePanel === 'media' && renderMediaPanel()}
                    {mobilePanel === 'graphics' && renderGraphicsPanel()}
                    {mobilePanel === 'destinations' && renderDestinationsPanel()}
                    {mobilePanel === 'mixer' && (
                        <div className="p-6 flex items-center justify-center h-full">
                             <AudioMixer micVolume={micVolume} musicVolume={musicVolume} videoVolume={videoVolume} onMicVolumeChange={setMicVolume} onMusicVolumeChange={setMusicVolume} onVideoVolumeChange={setVideoVolume} />
                        </div>
                    )}
                 </div>
              </div>
            )}

            {/* CONTROL DECK */}
            <div className="bg-dark-800 border-t border-gray-700 z-30 shrink-0 flex flex-col pb-safe shadow-2xl">
                {/* Control Row */}
                <div className="h-16 md:h-20 flex items-center px-4 md:px-8 gap-3 overflow-x-auto no-scrollbar">
                   {/* Main Toggles */}
                   <div className="flex items-center gap-3 pr-4 border-r border-gray-700 shrink-0">
                        <button 
                            onClick={toggleMic}
                            disabled={!cameraStream}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isMicMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50'}`}
                        >
                            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                        <button 
                            onClick={toggleCam}
                            disabled={!cameraStream}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${isCamMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50'}`}
                        >
                            {isCamMuted ? <VideoOff size={20} /> : <Video size={20} />}
                        </button>
                   </div>

                   {/* Mixer Toggle */}
                   <div className="relative shrink-0">
                        <button 
                            onClick={() => {
                                if (window.innerWidth < 1024) {
                                    setMobilePanel(mobilePanel === 'mixer' ? 'none' : 'mixer');
                                } else {
                                    setShowMixerDesktop(!showMixerDesktop);
                                }
                            }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${mobilePanel === 'mixer' || showMixerDesktop ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                            <Sliders size={20} />
                        </button>
                        
                        {showMixerDesktop && (
                            <div className="hidden lg:block absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50 animate-fade-in shadow-2xl">
                                <AudioMixer micVolume={micVolume} musicVolume={musicVolume} videoVolume={videoVolume} onMicVolumeChange={setMicVolume} onMusicVolumeChange={setMusicVolume} onVideoVolumeChange={setVideoVolume} />
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-dark-800" />
                            </div>
                        )}
                   </div>

                   {/* Layout Selector */}
                   <div className="flex-1 min-w-0 flex justify-end">
                      <LayoutSelector currentLayout={layout} onSelect={setLayout} />
                   </div>
                </div>

                {/* Mobile Tab Bar */}
                <div className="lg:hidden flex border-t border-gray-700 bg-dark-900">
                   <button onClick={() => setMobilePanel(mobilePanel === 'media' ? 'none' : 'media')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${mobilePanel === 'media' ? 'text-brand-400 bg-gray-800' : 'text-gray-400'}`}>
                      <FolderOpen size={20} /> <span className="text-[10px] font-bold">MEDIA</span>
                   </button>
                   <button onClick={() => setMobilePanel(mobilePanel === 'graphics' ? 'none' : 'graphics')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${mobilePanel === 'graphics' ? 'text-brand-400 bg-gray-800' : 'text-gray-400'}`}>
                      <Palette size={20} /> <span className="text-[10px] font-bold">STYLE</span>
                   </button>
                   <button onClick={() => setMobilePanel(mobilePanel === 'destinations' ? 'none' : 'destinations')} className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform ${mobilePanel === 'destinations' ? 'text-brand-400 bg-gray-800' : 'text-gray-400'}`}>
                      <Globe size={20} /> <span className="text-[10px] font-bold">STREAM</span>
                   </button>
                </div>
            </div>
        </main>
        
        {/* DESKTOP RIGHT SIDEBAR */}
        <aside className="hidden lg:flex w-80 border-l border-gray-800 bg-dark-900 flex-col overflow-hidden z-20">
             <div className="p-4 border-b border-gray-800 shrink-0 bg-gradient-to-br from-indigo-900/20 to-transparent">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase flex items-center gap-2">
                    <Sparkles size={14} className="text-brand-400"/> AI Studio Assistant
                </h3>
                <div className="space-y-3">
                    <input className="w-full bg-dark-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-brand-500 outline-none" placeholder="What's your stream about?" value={streamTopic} onChange={(e) => setStreamTopic(e.target.value)} />
                    <button onClick={handleGenerateAI} disabled={isGenerating || !streamTopic} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded flex items-center justify-center gap-2 disabled:opacity-50">
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
            <div className="flex-1 overflow-y-auto">
              <DestinationManager destinations={destinations} onAddDestination={(d) => setDestinations([...destinations, d])} onRemoveDestination={(id) => setDestinations(destinations.filter(d => d.id !== id))} onToggleDestination={(id) => setDestinations(destinations.map(d => d.id === id ? {...d, isEnabled: !d.isEnabled} : d))} isStreaming={appState.isStreaming} />
            </div>
        </aside>
      </div>
    </div>
  );
};

export default App;