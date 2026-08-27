import React, { useEffect, useRef } from 'react';
import { Scene } from '../types';

interface SceneThumbnailProps {
  scene: Scene;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  /** Frames per second. Kept low — a wall of thumbnails should not cost the encoder. */
  fps?: number;
  className?: string;
}

const SRC_W = 1280;
const SRC_H = 720;

/**
 * A live miniature of one scene's composition.
 *
 * Each thumbnail owns small <video> sinks bound to the same MediaStreams the
 * program canvas uses — additional sinks on a stream are cheap, a second capture
 * would not be — and repaints them into its own canvas at a deliberately low
 * frame rate. Scenes the user is not looking at still cost a draw, so the rate
 * is the thing that keeps a full switcher affordable.
 */
const SceneThumbnail: React.FC<SceneThumbnailProps> = ({
  scene,
  cameraStream,
  screenStream,
  fps = 8,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const screenRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    [camRef.current, screenRef.current].forEach((v) => {
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
    });
  }, []);

  useEffect(() => {
    const v = camRef.current;
    if (cameraStream) {
      if (v.srcObject !== cameraStream) {
        v.srcObject = cameraStream;
        v.play().catch(() => {});
      }
    } else v.srcObject = null;
  }, [cameraStream]);

  useEffect(() => {
    const v = screenRef.current;
    if (screenStream) {
      if (v.srcObject !== screenStream) {
        v.srcObject = screenStream;
        v.play().catch(() => {});
      }
    } else v.srcObject = null;
  }, [screenStream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const interval = 1000 / fps;

    const cover = (
      video: HTMLVideoElement,
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
    ) => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
        const dw = video.videoWidth * scale;
        const dh = video.videoHeight * scale;
        ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        return;
      }
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#4b5563';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
    };

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < interval) return;
      last = ts;

      const w = canvas.width;
      const h = canvas.height;
      const sx = w / SRC_W;
      const sy = h / SRC_H;

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, w, h);

      const sources = [...sceneRef.current.sources]
        .filter((s) => s.isVisible)
        .sort((a, b) => a.zIndex - b.zIndex);

      sources.forEach((s) => {
        const x = s.x * sx;
        const y = s.y * sy;
        const dw = s.width * sx;
        const dh = s.height * sy;
        ctx.save();
        ctx.globalAlpha = s.opacity ?? 1;

        if (s.type === 'camera') cover(camRef.current, x, y, dw, dh, 'CAM');
        else if (s.type === 'screen') cover(screenRef.current, x, y, dw, dh, 'SCR');
        else if (s.type === 'image' && s.url) {
          let img = imgCache.current.get(s.url);
          if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = s.url;
            imgCache.current.set(s.url, img);
          }
          if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, dw, dh);
          else {
            ctx.fillStyle = '#111827';
            ctx.fillRect(x, y, dw, dh);
          }
        } else if (s.type === 'text') {
          ctx.fillStyle = 'rgba(249,115,22,0.85)';
          ctx.fillRect(x, y + dh * 0.35, dw, Math.max(2, dh * 0.3));
        } else {
          ctx.fillStyle = '#374151';
          ctx.fillRect(x, y, dw, dh);
        }
        ctx.restore();
      });
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fps]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={90}
      aria-hidden
      className={`w-full rounded bg-black object-cover ${className}`}
    />
  );
};

export default SceneThumbnail;
