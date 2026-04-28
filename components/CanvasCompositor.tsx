import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { LayoutMode, BrandingSettings, Scene, SceneSource } from '../types';
import { ScreamAlert } from '../services/chatScreamer';
import type { GraphicsState } from './GraphicsOverlay';

interface CanvasCompositorProps {
  layout: LayoutMode;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  activeMediaUrl: string | null; // Overlay Image (legacy/compat)
  activeVideoUrl: string | null; // Main Video File (legacy/compat)
  backgroundUrl: string | null; // Custom Template Background
  videoVolume: number; // 0 to 1
  branding: BrandingSettings;
  showWatermark?: boolean; // Show ChatScream watermark (required for free tier)
  activeScene?: Scene | null;
  activeScream?: ScreamAlert | null;
  nowPlaying?: string | null;
  graphics?: GraphicsState | null; // Scoreboard, timer, lower-third, image overlays
}

export interface CanvasRef {
  getStream: () => MediaStream;
  getVideoElement: () => HTMLVideoElement | null;
}

const CanvasCompositor = forwardRef<CanvasRef, CanvasCompositorProps>((props, ref) => {
  const {
    layout,
    cameraStream,
    screenStream,
    activeMediaUrl,
    activeVideoUrl,
    backgroundUrl,
    videoVolume,
    branding,
    activeScene,
    activeScream,
    nowPlaying,
    graphics,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const screenVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const mediaVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));

  // Asset Cache for Scene Mode
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Legacy Assets Refs
  const overlayImgRef = useRef<HTMLImageElement>(new Image());
  const logoImgRef = useRef<HTMLImageElement>(new Image());
  const bgImgRef = useRef<HTMLImageElement>(new Image());

  // Animation State Refs
  const tickerXRef = useRef(1280);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    if (branding.logoUrl) {
      logoImgRef.current.crossOrigin = 'anonymous';
      logoImgRef.current.src = branding.logoUrl;
    }
  }, [branding.logoUrl]);
  // Initialize video elements
  useEffect(() => {
    [camVideoRef, screenVideoRef].forEach((vRef) => {
      vRef.current.autoplay = true;
      vRef.current.muted = true;
      vRef.current.playsInline = true;
    });

    mediaVideoRef.current.autoplay = true;
    mediaVideoRef.current.playsInline = true;
    mediaVideoRef.current.loop = true;
    mediaVideoRef.current.crossOrigin = 'anonymous';
  }, []);

  // --- Media Source Management ---

  useEffect(() => {
    const video = camVideoRef.current;
    if (cameraStream && cameraStream.getTracks().length > 0) {
      if (video.srcObject !== cameraStream) {
        video.srcObject = cameraStream;
        video.play().catch((e) => console.debug('Cam play suppressed', e));
      }
    } else {
      video.srcObject = null;
    }
  }, [cameraStream]);

  useEffect(() => {
    const video = screenVideoRef.current;
    if (screenStream && screenStream.getTracks().length > 0) {
      if (video.srcObject !== screenStream) {
        video.srcObject = screenStream;
        video.play().catch((e) => console.debug('Screen play suppressed', e));
      }
    } else {
      video.srcObject = null;
    }
  }, [screenStream]);

  useEffect(() => {
    const vid = mediaVideoRef.current;
    if (activeVideoUrl) {
      if (vid.src !== activeVideoUrl) {
        vid.src = activeVideoUrl;
        vid.play().catch((e) => console.error('Media play error', e));
      }
    } else {
      vid.pause();
      vid.src = '';
    }
  }, [activeVideoUrl]);

  useEffect(() => {
    if (mediaVideoRef.current) {
      mediaVideoRef.current.volume = videoVolume;
      mediaVideoRef.current.muted = videoVolume < 0.01;
    }
  }, [videoVolume]);

  useEffect(() => {
    if (activeMediaUrl) overlayImgRef.current.src = activeMediaUrl;
  }, [activeMediaUrl]);

  useEffect(() => {
    if (backgroundUrl) {
      bgImgRef.current.crossOrigin = 'Anonymous';
      bgImgRef.current.src = backgroundUrl;
    }
  }, [backgroundUrl]);

  // Preload Scene Assets
  useEffect(() => {
    if (!activeScene) return;

    activeScene.sources.forEach((source) => {
      if (source.type === 'image' && source.url) {
        if (!imageCacheRef.current.has(source.url)) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = source.url;
          imageCacheRef.current.set(source.url, img);
        }
      } else if (source.type === 'video' && source.url) {
        if (!videoCacheRef.current.has(source.url)) {
          const vid = document.createElement('video');
          vid.autoplay = true;
          vid.muted = true; // Scene videos might need unmuted later via AudioContext
          vid.loop = true;
          vid.playsInline = true;
          vid.crossOrigin = 'anonymous';
          vid.src = source.url;
          videoCacheRef.current.set(source.url, vid);
        }
      }
    });
  }, [activeScene]);

  useImperativeHandle(ref, () => ({
    getStream: () => {
      if (canvasRef.current) return canvasRef.current.captureStream(30);
      return new MediaStream();
    },
    getVideoElement: () => mediaVideoRef.current,
  }));

  // --- Main Draw Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;

    let animationId: number;

    const draw = (timestamp: number) => {
      const currentProps = propsRef.current;
      const {
        layout: mode,
        branding: brand,
        activeVideoUrl: hasVidUrl,
        screenStream: hasScreen,
        backgroundUrl: hasBg,
        activeScene: scene,
      } = currentProps;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Background
      if (hasBg && bgImgRef.current.complete && bgImgRef.current.naturalWidth > 0) {
        ctx.drawImage(bgImgRef.current, 0, 0, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#111827');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Helper: Draw Cover
      const drawCover = (
        video: HTMLVideoElement,
        x: number,
        y: number,
        targetW: number,
        targetH: number,
      ) => {
        if (!video) return;
        if (video.readyState < 2 || video.videoWidth === 0) {
          if (video === camVideoRef.current) {
            ctx.save();
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(x, y, targetW, targetH);
            ctx.fillStyle = '#4b5563';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText('NO CAMERA', x + targetW / 2, y + targetH / 2);
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, targetW, targetH);
            ctx.restore();
          }
          return;
        }

        const vidW = video.videoWidth || 1280;
        const vidH = video.videoHeight || 720;
        const scale = Math.max(targetW / vidW, targetH / vidH);
        const drawnW = vidW * scale;
        const drawnH = vidH * scale;
        const offsetX = (targetW - drawnW) / 2;
        const offsetY = (targetH - drawnH) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, targetW, targetH);
        ctx.clip();
        ctx.drawImage(video, x + offsetX, y + offsetY, drawnW, drawnH);
        ctx.restore();
      };

      // 2. Draw Content (Scene vs Legacy Layout)
      if (scene) {
        // Scene Mode: Draw sources by z-index
        const sortedSources = [...scene.sources].sort((a, b) => a.zIndex - b.zIndex);
        sortedSources.forEach((source) => {
          if (!source.isVisible) return;
          ctx.save();
          ctx.globalAlpha = source.opacity;

          if (source.type === 'camera') {
            drawCover(camVideoRef.current, source.x, source.y, source.width, source.height);
          } else if (source.type === 'screen') {
            drawCover(screenVideoRef.current, source.x, source.y, source.width, source.height);
          } else if (source.type === 'image' && source.url) {
            const img = imageCacheRef.current.get(source.url);
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, source.x, source.y, source.width, source.height);
            }
          } else if (source.type === 'video' && source.url) {
            const vid = videoCacheRef.current.get(source.url);
            if (vid && vid.readyState >= 2) {
              ctx.drawImage(vid, source.x, source.y, source.width, source.height);
            }
          } else if (source.type === 'text') {
            // Basic text rendering for now
            ctx.fillStyle = 'white';
            ctx.font = `${source.height}px sans-serif`;
            ctx.fillText('Scene Text', source.x, source.y + source.height);
          }
          ctx.restore();
        });
      } else {
        // Legacy Layout Mode
        const contentVideo = hasVidUrl
          ? mediaVideoRef.current
          : hasScreen
            ? screenVideoRef.current
            : null;
        const hasContent = !!contentVideo;

        if (mode === LayoutMode.FULL_CAM) {
          if (hasContent) drawCover(contentVideo, 0, 0, w, h);
          else drawCover(camVideoRef.current, 0, 0, w, h);
        } else if (mode === LayoutMode.FULL_SCREEN) {
          if (hasContent) {
            drawCover(contentVideo, 0, 0, w, h);
          } else {
            drawCover(camVideoRef.current, 0, 0, w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, h - 100, w, 100);
            ctx.fillStyle = 'white';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select Screen Share or Play Video to fill screen', w / 2, h - 40);
          }
        } else if (mode === LayoutMode.SPLIT) {
          if (hasContent) drawCover(contentVideo, 0, 0, w / 2, h);
          else {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, w / 2, h);
          }
          drawCover(camVideoRef.current, w / 2, 0, w / 2, h);
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(w / 2, 0);
          ctx.lineTo(w / 2, h);
          ctx.stroke();
        } else if (mode === LayoutMode.PIP) {
          if (hasContent) drawCover(contentVideo, 0, 0, w, h);
          else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, w, h);
          }

          const pipW = w * 0.25;
          const pipH = h * 0.25;
          const pipX = w - pipW - 30;
          const pipY = h - pipH - 30;

          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(pipX + 10, pipY + 10, pipW, pipH);
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.strokeRect(pipX, pipY, pipW, pipH);
          drawCover(camVideoRef.current, pipX, pipY, pipW, pipH);
        } else if (mode === LayoutMode.NEWSROOM) {
          const screenW = w * 0.55;
          const screenH = h * 0.55;
          const screenX = 50;
          const screenY = 80;

          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(screenX + 15, screenY + 15, screenW, screenH);

          if (hasContent) {
            drawCover(contentVideo, screenX, screenY, screenW, screenH);
          } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(screenX, screenY, screenW, screenH);
            ctx.fillStyle = '#475569';
            ctx.textAlign = 'center';
            ctx.font = '20px Arial';
            ctx.fillText('NO CONTENT', screenX + screenW / 2, screenY + screenH / 2);
          }
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 4;
          ctx.strokeRect(screenX, screenY, screenW, screenH);

          const camW = w * 0.35;
          const camH = h * 0.35;
          const camX = w - camW - 50;
          const camY = h - camH - 50;

          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(camX + 15, camY + 15, camW, camH);
          drawCover(camVideoRef.current, camX, camY, camW, camH);
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          ctx.strokeRect(camX, camY, camW, camH);
        }
      }

      // 3. Overlays (Legacy)
      if (
        !scene &&
        currentProps.activeMediaUrl &&
        overlayImgRef.current.complete &&
        overlayImgRef.current.naturalWidth > 0
      ) {
        const imgAspect = overlayImgRef.current.naturalWidth / overlayImgRef.current.naturalHeight;
        if (overlayImgRef.current.naturalWidth > 500) {
          ctx.drawImage(overlayImgRef.current, 0, 0, w, h);
        } else {
          const logoSize = 120;
          ctx.drawImage(overlayImgRef.current, w - logoSize - 30, 30, logoSize, logoSize);
        }
      }

      // 4. BRANDING (Lower Third & Ticker)
      if (brand.showLowerThird && (brand.presenterName || brand.presenterTitle)) {
        const startX = 60;
        const startY = h - 160;

        ctx.fillStyle = brand.primaryColor;
        ctx.fillRect(startX, startY, 400, 50);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(brand.presenterName, startX + 20, startY + 25);

        if (brand.presenterTitle) {
          ctx.fillStyle = brand.accentColor;
          ctx.fillRect(startX, startY + 50, 300, 30);
          ctx.fillStyle = 'white';
          ctx.font = '16px sans-serif';
          ctx.fillText(brand.presenterTitle, startX + 20, startY + 65);
        }
      }

      // Ticker
      if (brand.showTicker && brand.tickerText) {
        const tickerH = 50;
        const tickerY = h - tickerH;

        ctx.fillStyle = brand.primaryColor;
        ctx.fillRect(0, tickerY, w, tickerH);

        const labelW = 120;
        ctx.fillStyle = brand.accentColor;
        ctx.fillRect(0, tickerY, labelW, tickerH);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('NEWS', labelW / 2, tickerY + tickerH / 2);

        ctx.textAlign = 'left';
        ctx.font = '20px sans-serif';

        const textWidth = ctx.measureText(brand.tickerText).width;
        const tickerSpeed = 2; // px per frame

        tickerXRef.current -= tickerSpeed;
        if (tickerXRef.current < -textWidth) tickerXRef.current = w;
        if (tickerXRef.current > w && tickerXRef.current !== w) tickerXRef.current = w;

        ctx.save();
        ctx.beginPath();
        ctx.rect(labelW, tickerY, w - labelW, tickerH);
        ctx.clip();
        ctx.fillText(brand.tickerText, labelW + 20 + tickerXRef.current, tickerY + tickerH / 2);
        ctx.restore();
      }

      // 5. BRANDING LOGO (User Uploaded)
      if (brand.showLogo && logoImgRef.current.complete && logoImgRef.current.naturalWidth > 0) {
        const logoSize = 100;
        let lx = 30,
          ly = 30;
        if (brand.logoPosition === 'top-right') lx = w - logoSize - 30;
        else if (brand.logoPosition === 'bottom-left')
          ly = h - logoSize - (brand.showTicker ? 80 : 30);
        else if (brand.logoPosition === 'bottom-right') {
          lx = w - logoSize - 30;
          ly = h - logoSize - (brand.showTicker ? 80 : 30);
        }

        ctx.save();
        ctx.globalAlpha = brand.logoOpacity;
        ctx.drawImage(logoImgRef.current, lx, ly, logoSize, logoSize);
        ctx.restore();
      }

      // 6. WATERMARK (Free Tier)
      if (currentProps.showWatermark) {
        const watermarkText = 'ChatScream';
        const padding = 16;
        const cornerX = w - padding;
        const cornerY = padding;

        ctx.font = 'bold 18px sans-serif';
        const textMetrics = ctx.measureText(watermarkText);
        const pillWidth = textMetrics.width + 24;
        const pillHeight = 32;
        const pillX = cornerX - pillWidth;
        const pillY = cornerY;

        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 6);
        ctx.fill();

        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        const gradient = ctx.createLinearGradient(pillX, pillY, pillX + pillWidth, pillY);
        gradient.addColorStop(0, '#818cf8');
        gradient.addColorStop(1, '#c084fc');
        ctx.fillStyle = gradient;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkText, pillX + pillWidth / 2, pillY + pillHeight / 2);

        ctx.globalAlpha = 0.75;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'right';
        ctx.fillText('FREE', cornerX - 8, cornerY + pillHeight + 14);
        ctx.restore();
      }

      // 7. SCREAM ALERTS (The USP)
      if (activeScream) {
        const tier = activeScream.tier;
        ctx.save();

        // Shake effect for loud/maximum screams
        if (tier.effects.animation === 'shake' || tier.effects.animation === 'explode') {
          const intensity = tier.id === 'maximum' ? 10 : 4;
          ctx.translate(
            Math.random() * intensity - intensity / 2,
            Math.random() * intensity - intensity / 2,
          );
        }

        // Fullscreen background for maximum scream
        if (tier.effects.overlay === 'fullscreen') {
          const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          grad.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
          grad.addColorStop(1, 'rgba(127, 29, 29, 0.9)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        const alertW = tier.effects.overlay === 'fullscreen' ? 800 : 400;
        const alertH = 150;
        const ax = (w - alertW) / 2;
        const ay = tier.effects.overlay === 'fullscreen' ? (h - alertH) / 2 : 100;

        // Alert Box
        ctx.fillStyle = tier.id === 'maximum' ? '#000' : 'rgba(0,0,0,0.85)';
        ctx.strokeStyle = tier.id === 'maximum' ? '#ef4444' : '#fbbf24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(ax, ay, alertW, alertH, 12);
        ctx.fill();
        ctx.stroke();

        // Header Text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${activeScream.donorName} DONATED $${activeScream.amount}`,
          ax + alertW / 2,
          ay + 50,
        );

        // Message
        ctx.fillStyle = tier.id === 'maximum' ? '#f87171' : '#fbbf24';
        ctx.font = `italic ${tier.id === 'maximum' ? '32px' : '20px'} sans-serif`;
        ctx.fillText(`"${activeScream.message}"`, ax + alertW / 2, ay + 100);

        // Explosion particles for Maximum
        if (tier.effects.animation === 'explode') {
          for (let i = 0; i < 20; i++) {
            ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
            ctx.beginPath();
            ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 10, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      }

      // 8. NOW PLAYING OVERLAY
      if (brand.showNowPlaying && nowPlaying) {
        const npW = 300;
        const npH = 40;
        const npx = 30;
        const npy = 30;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeStyle = brand.primaryColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(npx, npy, npW, npH, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = brand.accentColor;
        ctx.beginPath();
        ctx.arc(npx + 20, npy + 20, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🎶 ${nowPlaying}`, npx + 40, npy + 20);
        ctx.restore();
      }

      // 9. GRAPHICS OVERLAYS (Scoreboard, Timer, Lower-Third, Custom Images)
      const gfx = currentProps.graphics;
      if (gfx) {
        // Scoreboard
        if (gfx.scoreboard?.visible) {
          const sb = gfx.scoreboard;
          const sbW = 380;
          const sbH = 56;
          const sbX = (w - sbW) / 2;
          const sbY = 20;

          ctx.save();
          // Team 1 side
          ctx.fillStyle = sb.team1.color;
          ctx.fillRect(sbX, sbY, sbW / 2, sbH);
          // Team 2 side
          ctx.fillStyle = sb.team2.color;
          ctx.fillRect(sbX + sbW / 2, sbY, sbW / 2, sbH);

          // Team names
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(sb.team1.name, sbX + sbW / 4, sbY + 6);
          ctx.fillText(sb.team2.name, sbX + (sbW * 3) / 4, sbY + 6);

          // Scores
          ctx.font = 'bold 22px sans-serif';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(sb.team1.score), sbX + sbW / 4, sbY + sbH - 4);
          ctx.fillText(String(sb.team2.score), sbX + (sbW * 3) / 4, sbY + sbH - 4);

          // Period/clock center divider
          ctx.fillStyle = '#000';
          ctx.fillRect(sbX + sbW / 2 - 30, sbY, 60, sbH);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 11px sans-serif';
          ctx.textBaseline = 'top';
          ctx.textAlign = 'center';
          ctx.fillText(sb.period, sbX + sbW / 2, sbY + 8);
          ctx.font = '12px monospace';
          ctx.textBaseline = 'bottom';
          ctx.fillText(sb.clock, sbX + sbW / 2, sbY + sbH - 6);

          // Border
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.strokeRect(sbX, sbY, sbW, sbH);
          ctx.restore();
        }

        // Timer overlay
        if (gfx.timer?.visible) {
          const tm = gfx.timer;
          const secs = tm.seconds;
          const mm = Math.floor(secs / 60).toString().padStart(2, '0');
          const ss = (secs % 60).toString().padStart(2, '0');
          const timerText = `${mm}:${ss}`;

          ctx.save();
          const tmW = 260;
          const tmH = 70;
          const tmX = (w - tmW) / 2;
          const tmY = (h - tmH) / 2;

          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.beginPath();
          ctx.roundRect(tmX, tmY, tmW, tmH, 12);
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 32px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(timerText, tmX + tmW / 2, tmY + tmH / 2 + (tm.label ? 6 : 0));

          if (tm.label) {
            ctx.font = '13px sans-serif';
            ctx.fillStyle = '#a5b4fc';
            ctx.fillText(tm.label, tmX + tmW / 2, tmY + 18);
          }
          ctx.restore();
        }

        // Custom lower-third (overrides branding L3 when visible)
        if (gfx.lowerThird?.visible && (gfx.lowerThird.name || gfx.lowerThird.title)) {
          const l3 = gfx.lowerThird;
          const l3X = 60;
          const l3Y = h - 160;
          ctx.save();

          ctx.fillStyle = l3.bgColor;
          ctx.fillRect(l3X, l3Y, 400, 50);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(l3.name, l3X + 20, l3Y + 25);

          if (l3.title) {
            ctx.fillStyle = l3.accentColor;
            ctx.fillRect(l3X, l3Y + 50, 300, 30);
            ctx.fillStyle = '#fff';
            ctx.font = '16px sans-serif';
            ctx.fillText(l3.title, l3X + 20, l3Y + 65);
          }
          ctx.restore();
        }

        // Custom image overlays
        if (gfx.images) {
          gfx.images.forEach((img) => {
            if (!img.visible || !img.url) return;
            const cached = imageCacheRef.current.get(img.url);
            if (!cached) {
              // Load and cache the image
              const el = new Image();
              el.crossOrigin = 'anonymous';
              el.src = img.url;
              imageCacheRef.current.set(img.url, el);
              return;
            }
            if (!cached.complete || cached.naturalWidth === 0) return;

            const imgW = cached.naturalWidth * img.scale;
            const imgH = cached.naturalHeight * img.scale;
            let ix = 0, iy = 0;
            const pad = 20;
            switch (img.position) {
              case 'top-left':     ix = pad;            iy = pad;            break;
              case 'top-right':    ix = w - imgW - pad; iy = pad;            break;
              case 'bottom-left':  ix = pad;            iy = h - imgH - pad; break;
              case 'bottom-right': ix = w - imgW - pad; iy = h - imgH - pad; break;
              case 'center':       ix = (w - imgW) / 2; iy = (h - imgH) / 2; break;
            }
            ctx.drawImage(cached, ix, iy, imgW, imgH);
          });
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black aspect-video rounded-lg overflow-hidden border border-gray-800 shadow-2xl relative">
      <canvas ref={canvasRef} className="max-w-full max-h-full" />
    </div>
  );
});

export default CanvasCompositor;
