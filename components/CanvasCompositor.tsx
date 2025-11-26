import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { LayoutMode } from '../types';

interface CanvasCompositorProps {
  layout: LayoutMode;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  activeMediaUrl: string | null; // Overlay Image
  activeVideoUrl: string | null; // Main Video File
  backgroundUrl: string | null; // Custom Template Background
  videoVolume: number; // 0 to 1
}

export interface CanvasRef {
  getStream: () => MediaStream;
}

const CanvasCompositor = forwardRef<CanvasRef, CanvasCompositorProps>(({ 
  layout, 
  cameraStream, 
  screenStream,
  activeMediaUrl,
  activeVideoUrl,
  backgroundUrl,
  videoVolume
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const screenVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const mediaVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const overlayImgRef = useRef<HTMLImageElement>(new Image());
  const bgImgRef = useRef<HTMLImageElement>(new Image());
  
  // Initialize video elements
  useEffect(() => {
    // Camera and Screen should typically be muted in the DOM to avoid feedback loop 
    // (since we aren't creating a full AudioContext mixer for this demo)
    [camVideoRef, screenVideoRef].forEach(ref => {
        ref.current.autoplay = true;
        ref.current.muted = true; 
        ref.current.playsInline = true;
    });

    // Media Video (Uploaded file)
    mediaVideoRef.current.autoplay = true;
    mediaVideoRef.current.playsInline = true;
    mediaVideoRef.current.loop = true; 
    // We do NOT mute this by default, we let volume control it
  }, []);

  // Update Media Sources
  useEffect(() => {
    if (cameraStream) {
      camVideoRef.current.srcObject = cameraStream;
      camVideoRef.current.play().catch(e => console.error("Cam play error", e));
    } else {
      camVideoRef.current.srcObject = null;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (screenStream) {
      screenVideoRef.current.srcObject = screenStream;
      screenVideoRef.current.play().catch(e => console.error("Screen play error", e));
    } else {
      screenVideoRef.current.srcObject = null;
    }
  }, [screenStream]);

  // Handle Uploaded Video Asset
  useEffect(() => {
      const vid = mediaVideoRef.current;
      if (activeVideoUrl) {
          vid.src = activeVideoUrl;
          vid.play().catch(e => console.error("Media play error", e));
      } else {
          vid.pause();
          vid.src = '';
      }
  }, [activeVideoUrl]);

  // Handle Video Volume
  useEffect(() => {
    if (mediaVideoRef.current) {
        mediaVideoRef.current.volume = videoVolume;
        mediaVideoRef.current.muted = videoVolume === 0;
    }
  }, [videoVolume]);

  // Handle Images
  useEffect(() => {
    if (activeMediaUrl) overlayImgRef.current.src = activeMediaUrl;
  }, [activeMediaUrl]);

  useEffect(() => {
    if (backgroundUrl) {
        bgImgRef.current.crossOrigin = "Anonymous"; // Helpful for some CDN images
        bgImgRef.current.src = backgroundUrl;
    }
  }, [backgroundUrl]);

  useImperativeHandle(ref, () => ({
    getStream: () => {
      if (canvasRef.current) {
        return canvasRef.current.captureStream(30);
      }
      return new MediaStream();
    }
  }));

  // Main Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;

    let animationId: number;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Background
      if (backgroundUrl && bgImgRef.current.complete && bgImgRef.current.naturalWidth > 0) {
          ctx.drawImage(bgImgRef.current, 0, 0, w, h);
      } else {
          // Default background gradient
          const grad = ctx.createLinearGradient(0,0, 0, h);
          grad.addColorStop(0, '#111827');
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
      }

      // Helper to draw video preserving aspect ratio (cover)
      const drawCover = (video: HTMLVideoElement, x: number, y: number, targetW: number, targetH: number) => {
        if (!video) return;

        // If video is not ready
        if (video.readyState < 2) {
             // If it's the camera, draw a placeholder
             if (video === camVideoRef.current) {
                 ctx.save();
                 ctx.fillStyle = '#1f2937'; // gray-800
                 ctx.fillRect(x, y, targetW, targetH);
                 
                 // Placeholder Icon/Text
                 ctx.fillStyle = '#4b5563'; // gray-600
                 ctx.textAlign = 'center';
                 ctx.textBaseline = 'middle';
                 ctx.font = 'bold 16px sans-serif';
                 ctx.fillText("NO CAMERA", x + targetW/2, y + targetH/2);
                 
                 // Optional border
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

      // Determine "Content" source (Screen Share OR Video File)
      const contentVideo = activeVideoUrl ? mediaVideoRef.current : (screenStream ? screenVideoRef.current : null);
      const hasContent = !!contentVideo;

      // Layout Logic
      if (layout === LayoutMode.FULL_CAM) {
        if (hasContent) {
             drawCover(contentVideo, 0, 0, w, h);
        } else {
             drawCover(camVideoRef.current, 0, 0, w, h);
        }
      } 
      else if (layout === LayoutMode.FULL_SCREEN) {
        if (hasContent) {
            drawCover(contentVideo, 0, 0, w, h);
        } else {
            drawCover(camVideoRef.current, 0, 0, w, h);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, h-100, w, 100);
            ctx.fillStyle = 'white';
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select Screen Share or Play Video to fill screen', w/2, h-40);
        }
      } 
      else if (layout === LayoutMode.SPLIT) {
         if (hasContent) {
             drawCover(contentVideo, 0, 0, w/2, h);
         } else {
             ctx.fillStyle = 'rgba(0,0,0,0.5)';
             ctx.fillRect(0, 0, w/2, h);
         }
         drawCover(camVideoRef.current, w/2, 0, w/2, h);
         
         ctx.strokeStyle = '#000';
         ctx.lineWidth = 4;
         ctx.beginPath();
         ctx.moveTo(w/2, 0);
         ctx.lineTo(w/2, h);
         ctx.stroke();
      }
      else if (layout === LayoutMode.PIP) {
        if (hasContent) {
            drawCover(contentVideo, 0, 0, w, h);
        } else {
             ctx.fillStyle = '#111';
             ctx.fillRect(0, 0, w, h);
        }

        const pipW = w * 0.25;
        const pipH = h * 0.25;
        const pipX = w - pipW - 30;
        const pipY = h - pipH - 30;

        // Shadow/Border
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(pipX + 10, pipY + 10, pipW, pipH);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(pipX, pipY, pipW, pipH);

        drawCover(camVideoRef.current, pipX, pipY, pipW, pipH);
      }
      else if (layout === LayoutMode.NEWSROOM) {
          // If backgroundUrl is present, it's drawn at the start.
          // We just need to draw content in the "boxes".
          
          // Screen/Content Window (Shoulder box)
          const screenW = w * 0.55;
          const screenH = h * 0.55;
          const screenX = 50;
          const screenY = 80;

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(screenX + 15, screenY + 15, screenW, screenH);

          // Content Box
          if (hasContent) {
            drawCover(contentVideo, screenX, screenY, screenW, screenH);
          } else {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(screenX, screenY, screenW, screenH);
            
            // "No Signal" text
            ctx.fillStyle = '#475569';
            ctx.textAlign = 'center';
            ctx.font = '20px Arial';
            ctx.fillText("NO CONTENT", screenX + screenW/2, screenY + screenH/2);
          }
          // Border
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 4;
          ctx.strokeRect(screenX, screenY, screenW, screenH);


          // Camera (Presenter)
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

      // Draw Overlay Media (Logo/Image/Lower Third)
      if (activeMediaUrl && overlayImgRef.current.complete && overlayImgRef.current.naturalWidth > 0) {
          if (overlayImgRef.current.naturalWidth > 500) {
              ctx.drawImage(overlayImgRef.current, 0, 0, w, h);
          } else {
              const logoSize = 120;
              ctx.drawImage(overlayImgRef.current, w - logoSize - 30, 30, logoSize, logoSize);
          }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [layout, cameraStream, screenStream, activeMediaUrl, activeVideoUrl, backgroundUrl, videoVolume]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black aspect-video rounded-lg overflow-hidden border border-gray-800 shadow-2xl relative">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
    </div>
  );
});

export default CanvasCompositor;