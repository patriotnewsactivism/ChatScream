export interface Scene {
  id: string;
  name: string;
  description?: string;
  sources: SceneSource[];
  layout: SceneLayout;
  transitions?: SceneTransition;
  isActive: boolean;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneSource {
  id: string;
  type: 'camera' | 'screen' | 'media' | 'browser' | 'image' | 'text';
  name: string;
  mediaStream?: MediaStream;
  mediaUrl?: string;
  position: SourcePosition;
  transform: SourceTransform;
  filters?: SourceFilter[];
  isVisible: boolean;
  isMuted: boolean;
  volume: number;
  zIndex: number;
}

export interface SourcePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceTransform {
  scale: number;
  rotation: number;
  opacity: number;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
}

export interface SourceFilter {
  type: 'chroma-key' | 'blur' | 'sharpen' | 'color-correction' | 'mask';
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface SceneLayout {
  type: 'custom' | 'fullscreen' | 'pip' | 'split' | 'grid' | 'newsroom';
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
}

export interface SceneTransition {
  type: 'cut' | 'fade' | 'slide' | 'wipe' | 'zoom';
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface Camera {
  id: string;
  deviceId: string;
  label: string;
  type: 'user' | 'environment';
  resolution: { width: number; height: number };
  frameRate: number;
  facingMode: 'user' | 'environment';
}

const DEFAULT_TRANSITION: SceneTransition = {
  type: 'fade',
  duration: 500,
  easing: 'ease-in-out',
};

export class SceneManager {
  private scenes: Map<string, Scene> = new Map();
  private activeSceneId: string | null = null;
  private cameras: Map<string, Camera> = new Map();
  private onSceneChange?: (scene: Scene) => void;

  constructor(onSceneChange?: (scene: Scene) => void) {
    this.onSceneChange = onSceneChange;
    this.initializeDefaultScenes();
  }

  private initializeDefaultScenes(): void {
    const defaultLayout: SceneLayout = {
      type: 'fullscreen',
      canvasWidth: 1920,
      canvasHeight: 1080,
      backgroundColor: '#000000',
    };

    const cameraScene: Scene = {
      id: 'scene_camera',
      name: 'Camera',
      description: 'Full camera view',
      sources: [],
      layout: defaultLayout,
      transitions: DEFAULT_TRANSITION,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const screenScene: Scene = {
      id: 'scene_screen',
      name: 'Screen Share',
      description: 'Full screen share',
      sources: [],
      layout: defaultLayout,
      transitions: DEFAULT_TRANSITION,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const pipScene: Scene = {
      id: 'scene_pip',
      name: 'Picture in Picture',
      description: 'Screen with camera overlay',
      sources: [],
      layout: { ...defaultLayout, type: 'pip' },
      transitions: DEFAULT_TRANSITION,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.scenes.set(cameraScene.id, cameraScene);
    this.scenes.set(screenScene.id, screenScene);
    this.scenes.set(pipScene.id, pipScene);

    console.log('🎬 Initialized default scenes');
  }

  public async enumerateCameras(): Promise<Camera[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');

      this.cameras.clear();
      for (const device of videoDevices) {
        const camera: Camera = {
          id: device.deviceId,
          deviceId: device.deviceId,
          label: device.label || `Camera ${this.cameras.size + 1}`,
          type: device.label.toLowerCase().includes('front') ? 'user' : 'environment',
          resolution: { width: 1920, height: 1080 },
          frameRate: 30,
          facingMode: device.label.toLowerCase().includes('front') ? 'user' : 'environment',
        };
        this.cameras.set(camera.id, camera);
      }

      console.log(`📹 Found ${this.cameras.size} cameras`);
      return Array.from(this.cameras.values());
    } catch (error) {
      console.error('Failed to enumerate cameras:', error);
      return [];
    }
  }

  public async addCameraSource(
    sceneId: string,
    cameraId: string,
    position?: Partial<SourcePosition>,
  ): Promise<{ success: boolean; sourceId?: string; error?: string }> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      return { success: false, error: 'Scene not found' };
    }

    const camera = this.cameras.get(cameraId);
    if (!camera) {
      return { success: false, error: 'Camera not found' };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: cameraId },
          width: { ideal: camera.resolution.width },
          height: { ideal: camera.resolution.height },
          frameRate: { ideal: camera.frameRate },
        },
        audio: false,
      });

      const sourceId = `source_camera_${Date.now()}`;
      const source: SceneSource = {
        id: sourceId,
        type: 'camera',
        name: camera.label,
        mediaStream: stream,
        position: {
          x: position?.x ?? 0,
          y: position?.y ?? 0,
          width: position?.width ?? scene.layout.canvasWidth,
          height: position?.height ?? scene.layout.canvasHeight,
        },
        transform: {
          scale: 1,
          rotation: 0,
          opacity: 1,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
        },
        isVisible: true,
        isMuted: false,
        volume: 1,
        zIndex: scene.sources.length,
      };

      scene.sources.push(source);
      scene.updatedAt = new Date();

      console.log(`📹 Added camera source to scene ${sceneId}`);
      return { success: true, sourceId };
    } catch (error) {
      console.error('Failed to add camera source:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to access camera',
      };
    }
  }

  public async addScreenSource(
    sceneId: string,
    position?: Partial<SourcePosition>,
  ): Promise<{ success: boolean; sourceId?: string; error?: string }> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      return { success: false, error: 'Scene not found' };
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 },
        audio: true,
      });

      const sourceId = `source_screen_${Date.now()}`;
      const source: SceneSource = {
        id: sourceId,
        type: 'screen',
        name: 'Screen Share',
        mediaStream: stream,
        position: {
          x: position?.x ?? 0,
          y: position?.y ?? 0,
          width: position?.width ?? scene.layout.canvasWidth,
          height: position?.height ?? scene.layout.canvasHeight,
        },
        transform: {
          scale: 1,
          rotation: 0,
          opacity: 1,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
        },
        isVisible: true,
        isMuted: false,
        volume: 1,
        zIndex: scene.sources.length,
      };

      scene.sources.push(source);
      scene.updatedAt = new Date();

      console.log(`🖥️ Added screen source to scene ${sceneId}`);
      return { success: true, sourceId };
    } catch (error) {
      console.error('Failed to add screen source:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture screen',
      };
    }
  }

  public async addMediaSource(
    sceneId: string,
    mediaUrl: string,
    name: string,
    position?: Partial<SourcePosition>,
  ): Promise<{ success: boolean; sourceId?: string; error?: string }> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      return { success: false, error: 'Scene not found' };
    }

    const sourceId = `source_media_${Date.now()}`;
    const source: SceneSource = {
      id: sourceId,
      type: 'media',
      name,
      mediaUrl,
      position: {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        width: position?.width ?? scene.layout.canvasWidth,
        height: position?.height ?? scene.layout.canvasHeight,
      },
      transform: {
        scale: 1,
        rotation: 0,
        opacity: 1,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
      },
      isVisible: true,
      isMuted: false,
      volume: 1,
      zIndex: scene.sources.length,
    };

    scene.sources.push(source);
    scene.updatedAt = new Date();

    console.log(`🎥 Added media source to scene ${sceneId}`);
    return { success: true, sourceId };
  }

  public removeSource(sceneId: string, sourceId: string): boolean {
    const scene = this.scenes.get(sceneId);
    if (!scene) return false;

    const sourceIndex = scene.sources.findIndex((s) => s.id === sourceId);
    if (sourceIndex === -1) return false;

    const source = scene.sources[sourceIndex];
    if (source.mediaStream) {
      source.mediaStream.getTracks().forEach((track) => track.stop());
    }

    scene.sources.splice(sourceIndex, 1);
    scene.updatedAt = new Date();

    console.log(`🗑️ Removed source ${sourceId} from scene ${sceneId}`);
    return true;
  }

  public updateSourcePosition(
    sceneId: string,
    sourceId: string,
    position: Partial<SourcePosition>,
  ): boolean {
    const scene = this.scenes.get(sceneId);
    if (!scene) return false;

    const source = scene.sources.find((s) => s.id === sourceId);
    if (!source) return false;

    source.position = { ...source.position, ...position };
    scene.updatedAt = new Date();
    return true;
  }

  public updateSourceTransform(
    sceneId: string,
    sourceId: string,
    transform: Partial<SourceTransform>,
  ): boolean {
    const scene = this.scenes.get(sceneId);
    if (!scene) return false;

    const source = scene.sources.find((s) => s.id === sourceId);
    if (!source) return false;

    source.transform = { ...source.transform, ...transform };
    scene.updatedAt = new Date();
    return true;
  }

  public async switchScene(sceneId: string, transition?: SceneTransition): Promise<boolean> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      console.error(`Scene ${sceneId} not found`);
      return false;
    }

    if (this.activeSceneId) {
      const previousScene = this.scenes.get(this.activeSceneId);
      if (previousScene) {
        previousScene.isActive = false;
      }
    }

    console.log(`🎬 Switching to scene: ${scene.name}`);

    const effectiveTransition = transition || scene.transitions || DEFAULT_TRANSITION;
    await this.applyTransition(effectiveTransition);

    scene.isActive = true;
    this.activeSceneId = sceneId;

    if (this.onSceneChange) {
      this.onSceneChange(scene);
    }

    return true;
  }

  private async applyTransition(transition: SceneTransition): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, transition.duration);
    });
  }

  public createScene(name: string, layout: SceneLayout, description?: string): Scene {
    const sceneId = `scene_${Date.now()}`;
    const scene: Scene = {
      id: sceneId,
      name,
      description,
      sources: [],
      layout,
      transitions: DEFAULT_TRANSITION,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.scenes.set(sceneId, scene);
    console.log(`🎬 Created scene: ${name}`);
    return scene;
  }

  public deleteScene(sceneId: string): boolean {
    const scene = this.scenes.get(sceneId);
    if (!scene) return false;

    if (scene.isActive) {
      console.error('Cannot delete active scene');
      return false;
    }

    for (const source of scene.sources) {
      if (source.mediaStream) {
        source.mediaStream.getTracks().forEach((track) => track.stop());
      }
    }

    this.scenes.delete(sceneId);
    console.log(`🗑️ Deleted scene: ${scene.name}`);
    return true;
  }

  public getScene(sceneId: string): Scene | null {
    return this.scenes.get(sceneId) || null;
  }

  public getAllScenes(): Scene[] {
    return Array.from(this.scenes.values());
  }

  public getActiveScene(): Scene | null {
    return this.activeSceneId ? this.scenes.get(this.activeSceneId) || null : null;
  }

  public compositeScene(sceneId: string): HTMLCanvasElement | null {
    const scene = this.scenes.get(sceneId);
    if (!scene) return null;

    const canvas = document.createElement('canvas');
    canvas.width = scene.layout.canvasWidth;
    canvas.height = scene.layout.canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = scene.layout.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sortedSources = [...scene.sources].sort((a, b) => a.zIndex - b.zIndex);
    for (const source of sortedSources) {
      if (!source.isVisible) continue;

      ctx.save();
      ctx.globalAlpha = source.transform.opacity;

      if (source.mediaStream) {
        const video = document.createElement('video');
        video.srcObject = source.mediaStream;
        video.play();

        const { x, y, width, height } = source.position;
        ctx.drawImage(video, x, y, width, height);
      }

      ctx.restore();
    }

    return canvas;
  }
}
