import { useRef, useEffect, useCallback, useState } from 'react';

interface AudioPipelineProps {
  micStream: MediaStream | null;
  musicStream?: MediaStream | null; // e.g. from background music player
  videoStream?: MediaStream | null; // e.g. from compositor's video element
  micVolume: number;
  musicVolume: number;
  videoVolume: number;
  isMicMuted: boolean;
}

export const useAudioPipeline = (props: AudioPipelineProps) => {
  const { micStream, musicStream, videoStream, micVolume, musicVolume, videoVolume, isMicMuted } =
    props;

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);

  const musicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  const videoSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);

  const [levels, setLevels] = useState({ mic: 0, music: 0, video: 0 });

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
      if (micSourceRef.current) micSourceRef.current.disconnect();
      try {
        micSourceRef.current = ctx.createMediaStreamSource(micStream);
        micSourceRef.current.connect(micGainRef.current!);
      } catch (e) {
        console.warn('Failed to connect mic stream', e);
      }
    }
  }, [micStream]);

  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    if (musicStream && musicStream.getAudioTracks().length > 0) {
      if (musicSourceRef.current) musicSourceRef.current.disconnect();
      try {
        musicSourceRef.current = ctx.createMediaStreamSource(musicStream);
        musicSourceRef.current.connect(musicGainRef.current!);
      } catch (e) {
        console.warn('Failed to connect music stream', e);
      }
    }
  }, [musicStream]);

  useEffect(() => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    if (videoStream && videoStream.getAudioTracks().length > 0) {
      if (videoSourceRef.current) videoSourceRef.current.disconnect();
      try {
        videoSourceRef.current = ctx.createMediaStreamSource(videoStream);
        videoSourceRef.current.connect(videoGainRef.current!);
      } catch (e) {
        console.warn('Failed to connect video stream', e);
      }
    }
  }, [videoStream]);

  return {
    initAudio,
    combinedStream: audioDestRef.current?.stream || null,
    levels,
  };
};
