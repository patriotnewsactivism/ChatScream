export type TransitionType = 'cut' | 'crossfade' | 'slide-left' | 'slide-right' | 'wipe-down' | 'zoom';

export interface LayerSource {
  id: string;
  type: 'camera' | 'screen' | 'browser' | 'image' | 'overlay';
  element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  opacity: number;
  visible: boolean;
}

export interface CompositorOptions {
  width?: number;
  height?: number;
  fps?: number;
}

export class CanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fps: number;
  private layers: Map<string, LayerSource> = new Map();
  private animFrameId: number | null = null;
  private isRunning: boolean = false;
  private stream: MediaStream | null = null;

  // Scene Transition Management
  private previousSceneCanvas: HTMLCanvasElement | null = null;
  private previousSceneCtx: CanvasRenderingContext2D | null = null;
  private transitionActive: boolean = false;
  private transitionType: TransitionType = 'crossfade';
  private transitionStartTime: number = 0;
  private transitionDurationMs: number = 500;

  constructor(options: CompositorOptions = {}) {
    this.width = options.width || 1920;
    this.height = options.height || 1080;
    this.fps = options.fps || 60;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to create 2D canvas rendering context');
    }
    this.ctx = context;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getStream(): MediaStream {
    if (!this.stream) {
      this.stream = this.canvas.captureStream(this.fps);
    }
    return this.stream;
  }

  public addOrUpdateLayer(layer: LayerSource): void {
    this.layers.set(layer.id, layer);
  }

  public removeLayer(id: string): void {
    this.layers.delete(id);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.renderLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public triggerTransition(type: TransitionType = 'crossfade', durationMs: number = 500): void {
    if (!this.previousSceneCanvas) {
      this.previousSceneCanvas = document.createElement('canvas');
      this.previousSceneCanvas.width = this.width;
      this.previousSceneCanvas.height = this.height;
      this.previousSceneCtx = this.previousSceneCanvas.getContext('2d');
    }

    if (this.previousSceneCtx) {
      this.previousSceneCtx.drawImage(this.canvas, 0, 0, this.width, this.height);
    }

    this.transitionType = type;
    this.transitionDurationMs = durationMs;
    this.transitionStartTime = performance.now();
    this.transitionActive = true;
  }

  private renderLoop = (): void => {
    if (!this.isRunning) return;

    this.renderCurrentFrame();
    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  private renderCurrentFrame(): void {
    const sortedLayers = Array.from(this.layers.values())
      .filter((l) => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    // Render base background
    this.ctx.fillStyle = '#050811';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw each active scene layer
    for (const layer of sortedLayers) {
      this.ctx.save();
      this.ctx.globalAlpha = layer.opacity;
      try {
        this.ctx.drawImage(layer.element, layer.x, layer.y, layer.width, layer.height);
      } catch {
        // Handle transient unready video frames gracefully
      }
      this.ctx.restore();
    }

    // Handle active scene transition compositing
    if (this.transitionActive && this.previousSceneCanvas) {
      const elapsed = performance.now() - this.transitionStartTime;
      const progress = Math.min(1, elapsed / this.transitionDurationMs);

      if (progress >= 1) {
        this.transitionActive = false;
      } else {
        this.applyTransitionEffect(progress);
      }
    }
  }

  private applyTransitionEffect(progress: number): void {
    if (!this.previousSceneCanvas) return;

    this.ctx.save();
    switch (this.transitionType) {
      case 'crossfade': {
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(this.previousSceneCanvas, 0, 0);
        break;
      }
      case 'slide-left': {
        const offset = -this.width * progress;
        this.ctx.drawImage(this.previousSceneCanvas, offset, 0);
        break;
      }
      case 'slide-right': {
        const offset = this.width * progress;
        this.ctx.drawImage(this.previousSceneCanvas, offset, 0);
        break;
      }
      case 'wipe-down': {
        const wipeHeight = this.height * (1 - progress);
        this.ctx.drawImage(
          this.previousSceneCanvas,
          0, 0, this.width, wipeHeight,
          0, 0, this.width, wipeHeight
        );
        break;
      }
      case 'zoom': {
        const scale = 1 + progress * 0.5;
        const scaledWidth = this.width * scale;
        const scaledHeight = this.height * scale;
        const offsetX = (this.width - scaledWidth) / 2;
        const offsetY = (this.height - scaledHeight) / 2;
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(this.previousSceneCanvas, offsetX, offsetY, scaledWidth, scaledHeight);
        break;
      }
      case 'cut':
      default:
        this.transitionActive = false;
        break;
    }
    this.ctx.restore();
  }
}
