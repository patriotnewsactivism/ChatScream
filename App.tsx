import React, { useState, useEffect, useRef } from 'react';
import {
  Destination,
  LayoutMode,
  Platform,
  AppState,
  MediaAsset,
  MediaType,
  BrandingSettings,
  Scene
} from './types';
import CanvasCompositor, { CanvasRef } from './components/CanvasCompositor';
import DestinationManager from './components/DestinationManager';
import LayoutSelector from './components/LayoutSelector';
import MediaBin from './components/MediaBin';
import AudioMixer from './components/AudioMixer';
import BackgroundSelector, { PRESET_BACKGROUNDS } from './components/BackgroundSelector';
import BrandingPanel from './components/BrandingPanel';
import SceneManager from './components/SceneManager';
import { generateStreamMetadata } from './services/geminiService';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Sparkles,
  Play, Square, AlertCircle, Camera, Sliders, ArrowRight,
  FolderOpen, Palette, Radio, X, Menu, Settings, Disc, Globe, ChevronDown, Pause
} from 'lucide-react';

type MobilePanel = 'none' | 'media' | 'graphics' | 'destinations' | 'mixer';

const App = () => {
  // --- State ---
  const [destinations, setDestinations] = useState<Destination[]>(() => {
    try {
      const saved = localStorage.getItem('streamhub_destinations');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: '1', platform: Platform.YOUTUBE, name: 'Main Channel', streamKey: '****', isEnabled: true, status: 'offline' },
      { id: '2', platform: Platform.FACEBOOK, name: 'Personal FB', streamKey: '****', isEnabled: false, status: 'offline' }
    ];
  });
  
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
  const [micVolume, setMicVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('streamhub_volumes');
      if (saved) return JSON.parse(saved).micVolume ?? 1.0;
    } catch {}
    return 1.0;
  });
  const [musicVolume, setMusicVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('streamhub_volumes');
      if (saved) return JSON.parse(saved).musicVolume ?? 0.3;
    } catch {}
    return 0.3;
  });
  const [videoVolume, setVideoVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('streamhub_volumes');
      if (saved) return JSON.parse(saved).videoVolume ?? 0.8;
    } catch {}
    return 0.8;
  });
  const [showMixerDesktop, setShowMixerDesktop] = useState(false);

  // Recording Quality
  const [recordingQuality, setRecordingQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>(() => {
    try {
      const saved = localStorage.getItem('streamhub_recordingQuality');
      if (saved) return saved as any;
    } catch {}
    return 'high';
  });
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);

  // Media Bin Assets
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  // Backgrounds & Branding
  const [activeBackgroundId, setActiveBackgroundId] = useState<string | null>(null);
  const [activeBackgroundUrl, setActiveBackgroundUrl] = useState<string | null>(null);
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    try {
      const saved = localStorage.getItem('streamhub_branding');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      showLowerThird: true,
      showTicker: true,
      primaryColor: '#0284c7',
      accentColor: '#ef4444',
      presenterName: 'Alex Streamer',
      presenterTitle: 'Live Host',
      tickerText: 'Welcome to the live stream! Don\'t forget to like and subscribe for more content.'
    };
  });

  // UI State
  const [leftSidebarTab, setLeftSidebarTab] = useState<'media' | 'graphics'>('media');
  
  // Mobile Specific UI State
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');

  // AI Content
  const [streamTopic, setStreamTopic] = useState('');
  const [generatedInfo, setGeneratedInfo] = useState<{title: string, description: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Scene Management
  const [scenes, setScenes] = useState<Scene[]>(() => {
    try {
      const saved = localStorage.getItem('streamhub_scenes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);

  const canvasRef = useRef<CanvasRef>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(new Audio());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  
  // Audio Mixer Refs (Web Audio API) - Persistent for real-time mixing
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const musicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Audio level monitoring
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const videoAnalyserRef = useRef<AnalyserNode | null>(null);
  const [audioLevels, setAudioLevels] = useState({ mic: 0, music: 0, video: 0 });
  const audioLevelInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // --- Effects ---

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
                audio.play().catch(e => console.error("Audio play failed", e));
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
  }, [musicVolume]);

  // Initialize persistent audio context for real-time mixing
  useEffect(() => {
      const initAudioContext = () => {
          try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              audioContextRef.current = audioCtx;

              // Create destination for mixed audio
              const dest = audioCtx.createMediaStreamDestination();
              audioDestRef.current = dest;

              // Create gain nodes for each source
              micGainRef.current = audioCtx.createGain();
              musicGainRef.current = audioCtx.createGain();
              videoGainRef.current = audioCtx.createGain();

              // Create analysers for level monitoring
              micAnalyserRef.current = audioCtx.createAnalyser();
              musicAnalyserRef.current = audioCtx.createAnalyser();
              videoAnalyserRef.current = audioCtx.createAnalyser();

              // Configure analysers
              [micAnalyserRef.current, musicAnalyserRef.current, videoAnalyserRef.current].forEach(analyser => {
                  if (analyser) {
                      analyser.fftSize = 256;
                      analyser.smoothingTimeConstant = 0.8;
                  }
              });

              // Set initial volumes
              micGainRef.current.gain.value = micVolume;
              musicGainRef.current.gain.value = musicVolume;
              videoGainRef.current.gain.value = videoVolume;

              console.log('✅ Audio context initialized for real-time mixing');
          } catch (e) {
              console.error('Failed to initialize audio context:', e);
          }
      };

      initAudioContext();

      // Cleanup
      return () => {
          if (audioLevelInterval.current) {
              clearInterval(audioLevelInterval.current);
          }
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
              audioContextRef.current.close();
          }
      };
  }, []);

  // Start audio level monitoring
  useEffect(() => {
      const monitorAudioLevels = () => {
          const getLevel = (analyser: AnalyserNode | null): number => {
              if (!analyser) return 0;
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              return Math.min(100, (average / 255) * 100);
          };

          setAudioLevels({
              mic: getLevel(micAnalyserRef.current),
              music: getLevel(musicAnalyserRef.current),
              video: getLevel(videoAnalyserRef.current)
          });
      };

      audioLevelInterval.current = setInterval(monitorAudioLevels, 100);

      return () => {
          if (audioLevelInterval.current) {
              clearInterval(audioLevelInterval.current);
          }
      };
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyPress = (e: KeyboardEvent) => {
          // Ignore if user is typing in an input field
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
              return;
          }

          // Ctrl/Cmd + S: Save scene (prevent default browser save)
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              const sceneName = prompt('Enter scene name:');
              if (sceneName) handleSaveScene(sceneName);
              return;
          }

          // Prevent default for other shortcuts
          const shortcuts = ['m', 'v', 'r', 'p', 'l', ' ', '1', '2', '3', '4', '5'];
          if (shortcuts.includes(e.key.toLowerCase())) {
              e.preventDefault();
          }

          switch (e.key.toLowerCase()) {
              case 'm': // Toggle mic
                  toggleMic();
                  break;
              case 'v': // Toggle camera
                  toggleCam();
                  break;
              case 'r': // Toggle recording
                  toggleRecording();
                  break;
              case 'p': // Pause/Resume recording
                  if (appState.isRecording) pauseResumeRecording();
                  break;
              case 'l': // Toggle streaming (Live)
                  toggleStream();
                  break;
              case ' ': // Space: Toggle mic (quick mute)
                  toggleMic();
                  break;
              case '1': // Layout: Full Cam
                  setLayout(LayoutMode.FULL_CAM);
                  break;
              case '2': // Layout: Full Screen
                  setLayout(LayoutMode.FULL_SCREEN);
                  break;
              case '3': // Layout: PIP
                  setLayout(LayoutMode.PIP);
                  break;
              case '4': // Layout: Split
                  setLayout(LayoutMode.SPLIT);
                  break;
              case '5': // Layout: Newsroom
                  setLayout(LayoutMode.NEWSROOM);
                  break;
          }
      };

      window.addEventListener('keydown', handleKeyPress);

      return () => {
          window.removeEventListener('keydown', handleKeyPress);
      };
  }, [cameraStream, isMicMuted, isCamMuted, appState.isRecording, appState.isStreaming]);

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

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('streamhub_scenes', JSON.stringify(scenes));
  }, [scenes]);

  useEffect(() => {
    localStorage.setItem('streamhub_branding', JSON.stringify(branding));
  }, [branding]);

  useEffect(() => {
    localStorage.setItem('streamhub_destinations', JSON.stringify(destinations));
  }, [destinations]);

  useEffect(() => {
    localStorage.setItem('streamhub_volumes', JSON.stringify({ micVolume, musicVolume, videoVolume }));
  }, [micVolume, musicVolume, videoVolume]);

  useEffect(() => {
    localStorage.setItem('streamhub_recordingQuality', recordingQuality);
  }, [recordingQuality]);

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

  // Connect microphone to audio mixer
  useEffect(() => {
      if (!cameraStream || !audioContextRef.current || !micGainRef.current || !audioDestRef.current) return;

      try {
          // Disconnect previous source if exists
          if (micSourceRef.current) {
              micSourceRef.current.disconnect();
          }

          const micSource = audioContextRef.current.createMediaStreamSource(cameraStream);
          micSourceRef.current = micSource;

          // Connect: mic → analyser → gain → destination
          micSource.connect(micAnalyserRef.current!);
          micAnalyserRef.current!.connect(micGainRef.current);
          micGainRef.current.connect(audioDestRef.current);

          console.log('🎤 Microphone connected to audio mixer');
      } catch (e) {
          console.error('Failed to connect microphone:', e);
      }

      return () => {
          if (micSourceRef.current) {
              try {
                  micSourceRef.current.disconnect();
              } catch (e) {}
          }
      };
  }, [cameraStream]);

  // Connect music/audio player to audio mixer
  useEffect(() => {
      if (!activeAudioId || !audioPlayerRef.current || !audioContextRef.current || !musicGainRef.current || !audioDestRef.current) return;

      try {
          // Disconnect previous source if exists
          if (musicSourceRef.current) {
              musicSourceRef.current.disconnect();
          }

          // @ts-ignore - captureStream is available on HTMLMediaElement
          const musicStream = audioPlayerRef.current.captureStream ? audioPlayerRef.current.captureStream() : audioPlayerRef.current.mozCaptureStream();

          if (musicStream) {
              const musicSource = audioContextRef.current.createMediaStreamSource(musicStream);
              musicSourceRef.current = musicSource;

              // Connect: music → analyser → gain → destination
              musicSource.connect(musicAnalyserRef.current!);
              musicAnalyserRef.current!.connect(musicGainRef.current);
              musicGainRef.current.connect(audioDestRef.current);

              console.log('🎵 Music connected to audio mixer');
          }
      } catch (e) {
          console.error('Failed to connect music:', e);
      }

      return () => {
          if (musicSourceRef.current) {
              try {
                  musicSourceRef.current.disconnect();
              } catch (e) {}
          }
      };
  }, [activeAudioId]);

  // Update mic gain in real-time
  useEffect(() => {
      if (micGainRef.current) {
          micGainRef.current.gain.value = isMicMuted ? 0 : micVolume;
      }
  }, [micVolume, isMicMuted]);

  // Update music gain in real-time
  useEffect(() => {
      if (musicGainRef.current) {
          musicGainRef.current.gain.value = musicVolume;
      }
  }, [musicVolume]);

  // Update video gain in real-time
  useEffect(() => {
      if (videoGainRef.current) {
          videoGainRef.current.gain.value = videoVolume;
      }
  }, [videoVolume]);

  // --- Handlers ---

  const handleContinueWithoutCam = () => {
      setPermissionError(null);
      setCameraStream(null);
      setIsMicMuted(true);
      setIsCamMuted(true);
  };

  const toggleStream = () => {
    if (appState.isStreaming) {
      setAppState({ ...appState, isStreaming: false, streamDuration: appState.isRecording ? appState.streamDuration : 0 });
      setDestinations(prev => prev.map(d => ({ ...d, status: 'offline' })));
    } else {
      const enabled = destinations.filter(d => d.isEnabled);
      if (enabled.length === 0) {
        alert("Please enable at least one destination!");
        return;
      }
      setAppState({ ...appState, isStreaming: true });
      setDestinations(prev => prev.map(d => d.isEnabled ? { ...d, status: 'connecting' } : d));
      setTimeout(() => {
        setDestinations(prev => prev.map(d => d.isEnabled ? { ...d, status: 'live' } : d));
      }, 2000);
    }
  };

  const getRecordingBitrate = () => {
    switch (recordingQuality) {
      case 'low': return 2500000; // 2.5 Mbps
      case 'medium': return 5000000; // 5 Mbps
      case 'high': return 8000000; // 8 Mbps
      case 'ultra': return 15000000; // 15 Mbps
      default: return 5000000;
    }
  };

  const toggleRecording = () => {
    if (appState.isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setAppState(prev => ({ ...prev, isRecording: false, streamDuration: prev.isStreaming ? prev.streamDuration : 0 }));
      setIsRecordingPaused(false);
    } else {
      try {
        if (!canvasRef.current || !audioDestRef.current) {
            alert("Audio mixer not ready. Please wait a moment and try again.");
            return;
        }

        // Get canvas video stream
        const canvasStream = canvasRef.current.getStream();

        // Use the already-mixed audio from our persistent audio context!
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDestRef.current.stream.getAudioTracks()
        ]);

        // Create recorder with quality settings
        const options = {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: getRecordingBitrate()
        };

        // Fallback to default if not supported
        const recorder = MediaRecorder.isTypeSupported(options.mimeType)
            ? new MediaRecorder(combinedStream, options)
            : new MediaRecorder(combinedStream);

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
          a.download = `streamhub-${recordingQuality}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          recordedChunks.current = []; // Reset
          console.log(`✅ Recording saved successfully (${recordingQuality} quality)`);
        };

        recorder.start(1000); // Capture in 1-second chunks
        mediaRecorderRef.current = recorder;
        setAppState(prev => ({ ...prev, isRecording: true }));
        console.log(`🔴 Recording started with mixed audio (${recordingQuality} quality, ${getRecordingBitrate() / 1000000}Mbps)`);

      } catch (e) {
        console.error("Recording failed", e);
        alert("Could not start recording. Browser might not support this format.");
      }
    }
  };

  const pauseResumeRecording = () => {
    if (!mediaRecorderRef.current) return;

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecordingPaused(true);
      console.log('⏸️ Recording paused');
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
      console.log('▶️ Recording resumed');
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
        
        if (layout === LayoutMode.FULL_CAM) {
            setLayout(LayoutMode.PIP);
        }
        
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null);
        };
      } catch (err: any) {
        console.error("Screen share error", err);
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

  // Scene Management Handlers
  const handleSaveScene = (name: string) => {
    const newScene: Scene = {
      id: Date.now().toString(),
      name,
      createdAt: Date.now(),
      layout,
      branding: { ...branding },
      activeBackgroundId,
      activeBackgroundUrl,
      micVolume,
      musicVolume,
      videoVolume,
      activeImageId,
      activeVideoId,
      activeAudioId
    };

    setScenes(prev => [...prev, newScene]);
    setCurrentSceneId(newScene.id);
    console.log('✅ Scene saved:', name);
  };

  const handleLoadScene = (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setLayout(scene.layout);
    setBranding({ ...scene.branding });
    setActiveBackgroundId(scene.activeBackgroundId);
    setActiveBackgroundUrl(scene.activeBackgroundUrl);
    setMicVolume(scene.micVolume);
    setMusicVolume(scene.musicVolume);
    setVideoVolume(scene.videoVolume);
    setActiveImageId(scene.activeImageId);
    setActiveVideoId(scene.activeVideoId);
    setActiveAudioId(scene.activeAudioId);
    setCurrentSceneId(sceneId);

    console.log('✅ Scene loaded:', scene.name);
  };

  const handleDeleteScene = (sceneId: string) => {
    setScenes(prev => prev.filter(s => s.id !== sceneId));
    if (currentSceneId === sceneId) {
      setCurrentSceneId(null);
    }
    console.log('✅ Scene deleted');
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
        {/* AI Assistant */}
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

  return (
    <div className="h-[100dvh] w-full bg-dark-900 text-gray-100 flex flex-col overflow-hidden">
      
      {/* --- HEADER --- */}
      <header className="h-14 md:h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-dark-800 shrink-0 z-30">
        <div className="flex items-center gap-2">
            <div className="bg-brand-600 p-1.5 rounded-lg">
                <Monitor size={18} className="text-white"/>
            </div>
            <h1 className="text-lg font-bold tracking-tight hidden xs:block">StreamHub<span className="text-brand-500">Pro</span></h1>
        </div>
        
        <div className="flex items-center gap-3">
            {(appState.isStreaming || appState.isRecording) && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 border border-gray-700 rounded-full font-mono text-xs shadow-inner">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${appState.isStreaming ? 'bg-red-500' : 'bg-brand-400'}`} />
                    {formatTime(appState.streamDuration)}
                </div>
            )}
            
            <div className="flex items-center gap-2">
                {/* Recording Quality Indicator (desktop) */}
                {appState.isRecording && (
                  <div className="hidden lg:flex items-center gap-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-400">
                    <span className="text-brand-400 font-bold uppercase">{recordingQuality}</span>
                  </div>
                )}

                {/* Pause/Resume Button (only shown when recording) */}
                {appState.isRecording && (
                  <button
                    onClick={pauseResumeRecording}
                    className={`w-9 h-9 md:w-10 md:h-10 rounded-full font-bold transition-all border flex items-center justify-center
                      ${isRecordingPaused
                        ? 'bg-yellow-600 border-yellow-500 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
                      }`}
                    title="Pause/Resume Recording (P)"
                  >
                    <Pause size={18} />
                  </button>
                )}

                <button
                  onClick={toggleRecording}
                  className={`w-9 h-9 md:w-auto md:h-auto md:px-4 md:py-2 rounded-full font-bold transition-all border flex items-center justify-center gap-2
                    ${appState.isRecording
                      ? 'bg-gray-800 border-red-500 text-red-500'
                      : 'bg-dark-900 border-gray-600 text-gray-300 hover:border-gray-400'
                    }`}
                  title="Start/Stop Recording (R)"
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
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* DESKTOP SIDEBAR (LEFT) */}
        <aside className="hidden md:flex w-80 border-r border-gray-800 bg-dark-900 flex-col overflow-hidden">
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
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {leftSidebarTab === 'media' ? renderMediaPanel() : renderGraphicsPanel()}
            </div>
        </aside>

        {/* CANVAS AREA */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">

            {/* Scene Manager */}
            <SceneManager
              scenes={scenes}
              currentSceneId={currentSceneId}
              onSaveScene={handleSaveScene}
              onLoadScene={handleLoadScene}
              onDeleteScene={handleDeleteScene}
              recordingQuality={recordingQuality}
              onRecordingQualityChange={setRecordingQuality}
            />

            {/* Viewport */}
            <div className="flex-1 flex items-center justify-center relative bg-[#0a0a0a] p-0 md:p-8">
                 {/* Canvas maintains aspect ratio */}
                 <div className="w-full max-w-full aspect-video md:rounded-lg overflow-hidden border-y md:border border-gray-800 shadow-2xl relative">
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

                 {/* Permission Error Overlay */}
                 {(!cameraStream && permissionError) && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-dark-800 p-6 rounded-xl border border-red-500/50 max-w-sm w-full text-center shadow-2xl">
                            <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="text-red-500" size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Camera Access Required</h3>
                            <p className="text-gray-400 mb-6 text-sm">{permissionError}</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={initCam} className="w-full bg-brand-600 text-white px-4 py-3 rounded-lg font-bold">
                                    Try Again
                                </button>
                                <button onClick={handleContinueWithoutCam} className="w-full bg-gray-700 text-gray-200 px-4 py-3 rounded-lg font-semibold">
                                    Continue without Camera
                                </button>
                            </div>
                        </div>
                    </div>
                 )}
            </div>

            {/* MOBILE BOTTOM SHEETS (Slide Up) */}
            {mobilePanel !== 'none' && (
              <div className="absolute inset-x-0 bottom-0 top-auto h-[60%] md:hidden z-40 bg-dark-900 border-t border-gray-700 flex flex-col rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-slide-up">
                 
                 {/* Drag Handle / Header */}
                 <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-dark-800 rounded-t-2xl shrink-0 cursor-pointer" onClick={() => setMobilePanel('none')}>
                    <div className="flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); setMobilePanel('none'); }} className="p-1 rounded-full bg-gray-700 text-gray-300">
                           <ChevronDown size={20} />
                        </button>
                        <h3 className="text-sm font-bold uppercase text-gray-200 flex items-center gap-2">
                           {mobilePanel === 'media' && <><FolderOpen size={16}/> Media Library</>}
                           {mobilePanel === 'graphics' && <><Palette size={16}/> Stream Graphics</>}
                           {mobilePanel === 'destinations' && <><Globe size={16}/> Destinations</>}
                           {mobilePanel === 'mixer' && <><Sliders size={16}/> Audio Mixer</>}
                        </h3>
                    </div>
                 </div>

                 {/* Content */}
                 <div className="flex-1 overflow-hidden relative bg-dark-900">
                    {mobilePanel === 'media' && renderMediaPanel()}
                    {mobilePanel === 'graphics' && renderGraphicsPanel()}
                    {mobilePanel === 'destinations' && renderDestinationsPanel()}
                    {mobilePanel === 'mixer' && (
                        <div className="p-6 flex items-center justify-center h-full">
                             <AudioMixer
                                micVolume={micVolume}
                                musicVolume={musicVolume}
                                videoVolume={videoVolume}
                                onMicVolumeChange={setMicVolume}
                                onMusicVolumeChange={setMusicVolume}
                                onVideoVolumeChange={setVideoVolume}
                                audioLevels={audioLevels}
                            />
                        </div>
                    )}
                 </div>
              </div>
            )}

            {/* BOTTOM DECK */}
            <div className="bg-dark-800 border-t border-gray-700 z-30 shrink-0 flex flex-col pb-safe">
                
                {/* Control Row */}
                <div className="h-16 md:h-20 flex items-center px-4 md:px-8 gap-3 overflow-x-auto no-scrollbar">
                   {/* Main Toggles */}
                   <div className="flex items-center gap-3 pr-4 border-r border-gray-700 shrink-0">
                        <button 
                            onClick={toggleMic}
                            disabled={!cameraStream}
                            className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isMicMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50'}`}
                        >
                            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                        <button 
                            onClick={toggleCam}
                            disabled={!cameraStream}
                            className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isCamMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'} ${!cameraStream && 'opacity-50'}`}
                        >
                            {isCamMuted ? <VideoOff size={20} /> : <Video size={20} />}
                        </button>
                   </div>

                   {/* Mixer Toggle */}
                   <div className="relative shrink-0">
                        <button 
                            onClick={() => {
                                if (window.innerWidth < 768) {
                                    setMobilePanel(mobilePanel === 'mixer' ? 'none' : 'mixer');
                                } else {
                                    setShowMixerDesktop(!showMixerDesktop);
                                }
                            }}
                            className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${mobilePanel === 'mixer' || showMixerDesktop ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                        >
                            <Sliders size={20} />
                        </button>
                        
                        {/* Desktop Popover Mixer */}
                        {showMixerDesktop && (
                            <div className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50 animate-fade-in shadow-2xl">
                                <AudioMixer
                                    micVolume={micVolume}
                                    musicVolume={musicVolume}
                                    videoVolume={videoVolume}
                                    onMicVolumeChange={setMicVolume}
                                    onMusicVolumeChange={setMusicVolume}
                                    onVideoVolumeChange={setVideoVolume}
                                    audioLevels={audioLevels}
                                />
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
                <div className="md:hidden flex border-t border-gray-700 bg-dark-900">
                   <button 
                      onClick={() => setMobilePanel(mobilePanel === 'media' ? 'none' : 'media')}
                      className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${mobilePanel === 'media' ? 'text-brand-400 bg-gray-800' : 'text-gray-400 active:bg-gray-800'}`}
                   >
                      <FolderOpen size={20} />
                      <span className="text-[10px] font-bold">MEDIA</span>
                   </button>
                   <button 
                      onClick={() => setMobilePanel(mobilePanel === 'graphics' ? 'none' : 'graphics')}
                      className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${mobilePanel === 'graphics' ? 'text-brand-400 bg-gray-800' : 'text-gray-400 active:bg-gray-800'}`}
                   >
                      <Palette size={20} />
                      <span className="text-[10px] font-bold">STYLE</span>
                   </button>
                   <button 
                      onClick={() => setMobilePanel(mobilePanel === 'destinations' ? 'none' : 'destinations')}
                      className={`flex-1 py-3 flex flex-col items-center justify-center gap-1 ${mobilePanel === 'destinations' ? 'text-brand-400 bg-gray-800' : 'text-gray-400 active:bg-gray-800'}`}
                   >
                      <Globe size={20} />
                      <span className="text-[10px] font-bold">STREAM</span>
                   </button>
                </div>
            </div>
        </main>
        
        {/* DESKTOP SIDEBAR (RIGHT) */}
        <aside className="hidden md:flex w-80 border-l border-gray-800 bg-dark-900 flex-col overflow-hidden">
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

            <div className="flex-1 overflow-y-auto">
              <DestinationManager 
                  destinations={destinations}
                  onAddDestination={(d) => setDestinations([...destinations, d])}
                  onRemoveDestination={(id) => setDestinations(destinations.filter(d => d.id !== id))}
                  onToggleDestination={(id) => setDestinations(destinations.map(d => d.id === id ? {...d, isEnabled: !d.isEnabled} : d))}
                  isStreaming={appState.isStreaming}
              />
            </div>
        </aside>
      </div>
    </div>
  );
};

export default App;