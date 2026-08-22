/**
 * ProgramPreview — Switcher-style dual-canvas multiview.
 * Program is the exact composed output that goes to the audience.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutMode, Scene, BrandingSettings } from '../types';
import { ScreamAlert } from '../services/chatScreamer';
import CanvasCompositor, { CanvasRef } from './CanvasCompositor';
import type { GraphicsState } from './GraphicsOverlay';
import { ArrowRight, Zap, Blend, PictureInPicture2 } from 'lucide-react';

export type TransitionType = 'cut' | 'mix';

interface ProgramPreviewProps {
  programLayout: LayoutMode;
  programScene: Scene | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  activeMediaUrl: string | null;
  activeVideoUrl: string | null;
  backgroundUrl: string | null;
  videoVolume: number;
  branding: BrandingSettings;
  showWatermark: boolean;
  activeScream: ScreamAlert | null;
  nowPlaying?: string | null;
  onTake: (layout: LayoutMode, scene: Scene | null) => void;
  programCanvasRef: React.RefObject<CanvasRef | null>;
  compact?: boolean;
  graphics?: GraphicsState | null;
  mirrorCamera?: boolean;
}

const ProgramPreview: React.FC<ProgramPreviewProps> = ({
  programLayout,
  programScene,
  cameraStream,
  screenStream,
  activeMediaUrl,
  activeVideoUrl,
  backgroundUrl,
  videoVolume,
  branding,
  showWatermark,
  activeScream,
  nowPlaying,
  onTake,
  programCanvasRef,
  compact = false,
  graphics,
  mirrorCamera = false,
}) => {
  const previewCanvasRef = useRef<CanvasRef | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [previewLayout, setPreviewLayout] = useState<LayoutMode>(programLayout);
  const [previewScene, setPreviewScene] = useState<Scene | null>(programScene);
  const [transition, setTransition] = useState<TransitionType>('cut');
  const [transitioning, setTransitioning] = useState(false);
  const [pipActive, setPipActive] = useState(false);

  useEffect(() => {
    setPreviewLayout(programLayout);
    setPreviewScene(programScene);
  }, [programLayout, programScene]);

  useEffect(() => {
    return () => {
      const video = pipVideoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, []);

  const handleTake = useCallback(() => {
    if (transitioning) return;
    if (transition === 'mix') {
      setTransitioning(true);
      setTimeout(() => {
        onTake(previewLayout, previewScene);
        setTransitioning(false);
      }, 500);
    } else {
      onTake(previewLayout, previewScene);
    }
  }, [transition, previewLayout, previewScene, onTake, transitioning]);

  const toggleProgramPip = useCallback(async () => {
    const doc = document as Document & { pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> };
    if (doc.pictureInPictureElement && doc.exitPictureInPicture) {
      await doc.exitPictureInPicture();
      return;
    }

    const stream = programCanvasRef.current?.getStream();
    if (!stream) return;

    let video = pipVideoRef.current;
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      pipVideoRef.current = video;
      video.addEventListener('enterpictureinpicture', () => setPipActive(true));
      video.addEventListener('leavepictureinpicture', () => setPipActive(false));
    }

    video.srcObject = stream;
    await video.play();
    const pipVideo = video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
    if (pipVideo.requestPictureInPicture) {
      await pipVideo.requestPictureInPicture();
    }
  }, [programCanvasRef]);

  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;
  const labelClass = 'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-t-md';

  return (
    <div className={`flex ${compact ? 'flex-col gap-2' : 'gap-3'} w-full`}>
      <div className={`flex-1 flex flex-col ${compact ? '' : 'min-w-0'}`}>
        <div className={`${labelClass} bg-yellow-600/80 text-white self-start`}>PREVIEW</div>
        <div
          className={`relative border-2 border-yellow-500/50 rounded-b-lg rounded-tr-lg overflow-hidden bg-black ${transitioning ? 'opacity-60' : ''}`}
          style={{ aspectRatio: '16/9' }}
        >
          <CanvasCompositor
            ref={previewCanvasRef}
            layout={previewLayout}
            cameraStream={cameraStream}
            screenStream={screenStream}
            activeMediaUrl={activeMediaUrl}
            activeVideoUrl={activeVideoUrl}
            backgroundUrl={backgroundUrl}
            videoVolume={0}
            branding={branding}
            showWatermark={false}
            activeScene={previewScene}
            activeScream={null}
            nowPlaying={nowPlaying}
            graphics={graphics}
            mirrorCamera={mirrorCamera}
          />
        </div>
      </div>

      <div className={`flex ${compact ? 'flex-row justify-center' : 'flex-col justify-center'} items-center gap-2 shrink-0`}>
        <button
          onClick={handleTake}
          disabled={transitioning}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            transitioning
              ? 'bg-gray-700 text-gray-500 cursor-wait'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40 active:scale-95'
          }`}
        >
          <ArrowRight size={16} />
          {transition === 'cut' ? 'CUT' : 'MIX'}
        </button>

        <div className="flex gap-1">
          <button onClick={() => setTransition('cut')} className={`p-1.5 rounded ${transition === 'cut' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'}`} title="Instant cut">
            <Zap size={14} />
          </button>
          <button onClick={() => setTransition('mix')} className={`p-1.5 rounded ${transition === 'mix' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'}`} title="Crossfade mix">
            <Blend size={14} />
          </button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${compact ? '' : 'min-w-0'}`}>
        <div className="flex items-end justify-between gap-2">
          <div className={`${labelClass} bg-red-600 text-white`}>
            PROGRAM <span className="inline-block w-2 h-2 bg-white rounded-full ml-1 animate-pulse" />
          </div>
          {pipSupported && (
            <button
              type="button"
              onClick={() => void toggleProgramPip()}
              className={`mb-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${
                pipActive
                  ? 'bg-green-950/70 border-green-500/70 text-green-300'
                  : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-brand-400 hover:text-white'
              }`}
              title="Float the exact Program output over other apps/tabs while you stay live"
            >
              <PictureInPicture2 size={13} /> {pipActive ? 'Floating' : 'Float Program'}
            </button>
          )}
        </div>
        <div className="relative border-2 border-red-500/60 rounded-b-lg rounded-tr-lg overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
          <CanvasCompositor
            ref={programCanvasRef}
            layout={programLayout}
            cameraStream={cameraStream}
            screenStream={screenStream}
            activeMediaUrl={activeMediaUrl}
            activeVideoUrl={activeVideoUrl}
            backgroundUrl={backgroundUrl}
            videoVolume={videoVolume}
            branding={branding}
            showWatermark={showWatermark}
            activeScene={programScene}
            activeScream={activeScream}
            nowPlaying={nowPlaying}
            graphics={graphics}
            mirrorCamera={mirrorCamera}
          />
        </div>
      </div>
    </div>
  );
};

export default ProgramPreview;
