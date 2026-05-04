import { useRef, useEffect, useCallback, useState } from 'react';

interface AudioPipelineProps {
  micStream: MediaStream | null;
  musicElement?: HTMLAudioElement | null;
  videoElement?: HTMLVideoElement | null;
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  isMicMuted: boolean;
}

export const useAudioPipeline = (props: AudioPipelineProps) => {
  const { micStream, musicElement, videoElement, micVolume, musicVolume, videoVolume, isMicMuted } =
    props;

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);

  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  const videoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);

  const [levels, setLevels] = useState({ mic: 0, music: 0, video: 0 });
  const [combinedStreamState, setCombinedStreamState] = useState<MediaStream | null>(null);

  // Initialize Context
  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const dest = ctx.createMediaStreamDestination();
    audioDestRef.current = dest;

    // Setup Gains
    micGainRef.current = ctx.createGain();
    micGainRef.current.connect(dest);

    musicGainRef.current = ctx.createGain();
    musicGainRef.current.connect(dest);

    videoGainRef.current = ctx.createGain();
    videoGainRef.current.connect(dest);

    setCombinedStreamState(dest.stream);
    console.log('🔈 Audio Pipeline Initialized');
  }, []);

  // Sync Volumes
  useEffect(() => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = isMicMuted ? 0 : micVolume;
    }
  }, [micVolume, isMicMuted]);

  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    if (videoGainRef.current) {
      videoGainRef.current.gain.value = videoVolume;
    }
  }, [videoVolume]);

  // Connect Sources
  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    if (micStream && micStream.getAudioTracks().length > 0) {
      if (micSourceRef.current)
        try {
          micSourceRef.current.disconnect();
        } catch (e) {}
      try {
        micSourceRef.current = ctx.createMediaStreamSource(micStream);
        micSourceRef.current.connect(micGainRef.current!);
      } catch (e) {
        console.warn('Mic connect error', e);
      }
    }
  }, [micStream, audioContextRef.current]);

  useEffect(() => {
    if (!audioContextRef.current || !musicElement) return;
    const ctx = audioContextRef.current;
    if (musicSourceRef.current) return;

    try {
      musicSourceRef.current = ctx.createMediaElementSource(musicElement);
      musicSourceRef.current.connect(musicGainRef.current!);
    } catch (e) {
      console.warn('Music connect error', e);
    }
  }, [musicElement, audioContextRef.current]);

  useEffect(() => {
    if (!audioContextRef.current || !videoElement) return;
    const ctx = audioContextRef.current;
    if (videoSourceRef.current) return;

    try {
      videoSourceRef.current = ctx.createMediaElementSource(videoElement);
      videoSourceRef.current.connect(videoGainRef.current!);
    } catch (e) {
      console.warn('Video connect error', e);
    }
  }, [videoElement, audioContextRef.current]);

  return {
    initAudio,
    combinedStream: combinedStreamState,
    levels,
  };
};
