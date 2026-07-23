/**
 * ProgramPreview â Switcher-style dual-canvas multiview.
 *
 * Shows a "Preview" canvas (what you're building) and a "Program" canvas
 * (what's actually going out live). Tap/click "TAKE" or "CUT" to push
 * preview â program. Transitions: cut (instant) or mix (500 ms crossfade).
 *
 * The Program canvas is what CanvasCompositor renders into (the stream).
 * The Preview canvas shows a second CanvasCompositor at reduced resolution
 * with the *next* layout/scene you're cueing up.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LayoutMode, Scene, BrandingSettings } from '../types';
import { ScreamAlert } from '../services/chatScreamer';
import CanvasCompositor, { CanvasRef } from './CanvasCompositor';
import type { GraphicsState } from './GraphicsOverlay';
import { ArrowRight, Zap, Blend } from 'lucide-react';

export type TransitionType = 'cut' | 'mix';

interface ProgramPreviewProps {
  /* Current live state */
  programLayout: LayoutMode;
  programScene: Scene | null;
  /* Shared streams */
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  /* Media & branding */
  activeMediaUrl: string | null;
  activeVideoUrl: string | null;
  backgroundUrl: string | null;
  videoVolume: number;
  branding: BrandingSettings;
  showWatermark: boolean;
  activeScream: ScreamAlert | null;
  nowPlaying?: string | null;
  /* Callbacks */
  onTake: (layout: LayoutMode, scene: Scene | null) => void;
  programCanvasRef: React.RefObject<CanvasRef | null>;
  /* Compact mode for small screens */
  compact?: boolean;
  /* Graphics overlays */
  graphics?: GraphicsState | null;
  /* Mirror camera feed */
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

  // Preview state â starts matching program
  const [previewLayout, setPreviewLayout] = useState<LayoutMode>(programLayout);
  const [previewScene, setPreviewScene] = useState<Scene | null>(programScene);
  const [transition, setTransition] = useState<TransitionType>('cut');
  const [transitioning, setTransitioning] = useState(false);

  // Sync preview if program changes externally
  useEffect(() => {
    setPreviewLayout(programLayout);
    setPreviewScene(programScene);
  }, [programLayout, programScene]);

  // TAKE â push preview â program
  const handleTake = useCallback(() => {
    if (transitioning) return;

    if (transition === 'mix') {
      setTransitioning(true);
      // Crossfade animation (CSS driven)
      setTimeout(() => {
        onTake(previewLayout, previewScene);
        setTransitioning(false);
      }, 500);
    } else {
      // Instant cut
      onTake(previewLayout, previewScene);
    }
  }, [transition, previewLayout, previewScene, onTake, transitioning]);

  const labelClass = 'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-t-md';

  return (
    <div className={`flex ${compact ? 'flex-col gap-2' : 'gap-3'} w-full`}>
      {/* Preview pane */}
      <div className={`flex-1 flex flex-col ${compact ? '' : 'min-w-0'}`}>
        <div className={`${labelClass} bg-yellow-600/80 text-white self-start`}>PREVIEW</div>
        <div
          className={`relative border-2 border-yellow-500/50 rounded-b-lg rounded-tr-lg overflow-hidden bg-black ${
            transitioning ? 'opacity-60' : ''
          }`}
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
            videoVolume={0} // muted in preview
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

      {/* Transition controls â center column on desktop, horizontal strip on mobile */}
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
          <button
            onClick={() => setTransition('cut')}
            className={`p-1.5 rounded ${
              transition === 'cut' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'
            }`}
            title="Instant cut"
          >
            <Zap size={14} />
          </button>
          <button
            onClick={() => setTransition('mix')}
            className={`p-1.5 rounded ${
              transition === 'mix' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'
            }`}
            title="Crossfade mix"
          >
            <Blend size={14} />
          </button>
        </div>
      </div>

      {/* Program pane */}
      <div className={`flex-1 flex flex-col ${compact ? '' : 'min-w-0'}`}>
        <div className={`${labelClass} bg-red-600 text-white self-start`}>
          PROGRAM{' '}
          <span className="inline-block w-2 h-2 bg-white rounded-full ml-1 animate-pulse" />
        </div>
        <div
          className="relative border-2 border-red-500/60 rounded-b-lg rounded-tr-lg overflow-hidden bg-black"
          style={{ aspectRatio: '16/9' }}
        >
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
