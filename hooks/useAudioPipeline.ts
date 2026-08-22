import { useRef, useEffect, useCallback, useState } from 'react';

interface AudioPipelineProps {
  micStream: MediaStream | null;
  screenStream?: MediaStream | null;
  musicElement?: HTMLAudioElement | null;
  videoElement?: HTMLVideoElement | null;
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  isMicMuted: boolean;
}

export const useAudioPipeline = (props: AudioPipelineProps) => {
  const {
    micStream,
    screenStream,
    musicElement,
    videoElement,
    micVolume,
    musicVolume,
    videoVolume,
    isMicMuted,
  } = props;

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const monitorAudioRef = useRef<HTMLAudioElement | null>(null);

  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenGainRef = useRef<GainNode | null>(null);
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const videoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);

  const [levels] = useState({ mic: 0, music: 0, video: 0 });
  const [combinedStreamState, setCombinedStreamState] = useState<MediaStream | null>(null);
  const [audienceMonitorEnabled, setAudienceMonitorEnabled] = useState(false);

  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    audioContextRef.current = ctx;

    const dest = ctx.createMediaStreamDestination();
    audioDestRef.current = dest;

    micGainRef.current = ctx.createGain();
    micGainRef.current.connect(dest);

    screenGainRef.current = ctx.createGain();
    screenGainRef.current.connect(dest);

    musicGainRef.current = ctx.createGain();
    musicGainRef.current.connect(dest);

    videoGainRef.current = ctx.createGain();
    videoGainRef.current.connect(dest);

    setCombinedStreamState(dest.stream);
    console.log('🔈 Audio Pipeline Initialized (interactive latency mode)');
  }, []);

  useEffect(() => {
    if (micGainRef.current) micGainRef.current.gain.value = isMicMuted ? 0 : micVolume;
  }, [micVolume, isMicMuted]);

  useEffect(() => {
    if (screenGainRef.current) screenGainRef.current.gain.value = 1;
  }, []);

  useEffect(() => {
    if (musicGainRef.current) musicGainRef.current.gain.value = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    if (videoGainRef.current) videoGainRef.current.gain.value = videoVolume;
  }, [videoVolume]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch {}
      micSourceRef.current = null;
    }
    if (micStream && micStream.getAudioTracks().length > 0) {
      try {
        micSourceRef.current = ctx.createMediaStreamSource(micStream);
        micSourceRef.current.connect(micGainRef.current!);
      } catch (e) {
        console.warn('Mic connect error', e);
      }
    }
  }, [micStream]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (screenSourceRef.current) {
      try { screenSourceRef.current.disconnect(); } catch {}
      screenSourceRef.current = null;
    }
    if (screenStream && screenStream.getAudioTracks().length > 0) {
      try {
        screenSourceRef.current = ctx.createMediaStreamSource(screenStream);
        screenSourceRef.current.connect(screenGainRef.current!);
      } catch (e) {
        console.warn('Screen-share audio connect error', e);
      }
    }
  }, [screenStream]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !musicElement || musicSourceRef.current) return;
    try {
      musicSourceRef.current = ctx.createMediaElementSource(musicElement);
      musicSourceRef.current.connect(musicGainRef.current!);
    } catch (e) {
      console.warn('Music connect error', e);
    }
  }, [musicElement]);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !videoElement || videoSourceRef.current) return;
    try {
      videoSourceRef.current = ctx.createMediaElementSource(videoElement);
      videoSourceRef.current.connect(videoGainRef.current!);
    } catch (e) {
      console.warn('Video connect error', e);
    }
  }, [videoElement]);

  const toggleAudienceMonitor = useCallback(async () => {
    initAudio();
    const ctx = audioContextRef.current;
    const stream = audioDestRef.current?.stream;
    if (!ctx || !stream) return;

    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    let audio = monitorAudioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.preload = 'auto';
      monitorAudioRef.current = audio;
    }

    if (audienceMonitorEnabled) {
      audio.pause();
      audio.srcObject = null;
      setAudienceMonitorEnabled(false);
      return;
    }

    audio.srcObject = stream;
    audio.volume = 1;
    await audio.play();
    setAudienceMonitorEnabled(true);
  }, [audienceMonitorEnabled, initAudio]);

  useEffect(() => {
    return () => {
      const audio = monitorAudioRef.current;
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
    };
  }, []);

  return {
    initAudio,
    combinedStream: combinedStreamState,
    levels,
    audienceMonitorEnabled,
    toggleAudienceMonitor,
  };
};
