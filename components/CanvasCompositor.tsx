import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { LayoutMode, BrandingSettings } from '../types';

interface CanvasCompositorProps {
  layout: LayoutMode;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  activeMediaUrl: string | null; // Overlay Image
  activeVideoUrl: string | null; // Main Video File
  backgroundUrl: string | null; // Custom Template Background
  videoVolume: number; // 0 to 1
  branding: BrandingSettings;
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
    branding
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const screenVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const mediaVideoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  
  // Assets Refs
  const overlayImgRef = useRef<HTMLImageElement>(new Image());
  const bgImgRef = useRef<HTMLImageElement>(new Image());
  
  // Animation State Refs (Mutable state that doesn't trigger re-renders)
  const tickerXRef = useRef(1280); 
  const lastTimeRef = useRef(0);
  
  // Props Ref (To access latest props in animation loop without restarting it)
  const propsRef = useRef(props);
  
  // Update propsRef on every render
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  // Initialize video elements
  useEffect(() => {
    [camVideoRef, screenVideoRef].forEach(ref => {
        ref.current.autoplay = true;
        ref.current.muted = true;
        ref.current.playsInline = true;
    });

    mediaVideoRef.current.autoplay = true;
    mediaVideoRef.current.playsInline = true;
    mediaVideoRef.current.loop = true; 
    mediaVideoRef.current.crossOrigin = "anonymous";
  }, []);

  // --- Media Source Management ---

  useEffect(() => {
    const video = camVideoRef.current;
    if (cameraStream && cameraStream.getTracks().length > 0) {
      if (video.srcObject !== cameraStream) {
        video.srcObject = cameraStream;
        video.play().catch(e => console.debug("Cam play suppressed", e));
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
        video.play().catch(e => console.debug("Screen play suppressed", e));
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
              vid.play().catch(e => console.error("Media play error", e));
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
        bgImgRef.current.crossOrigin = "Anonymous";
        bgImgRef.current.src = backgroundUrl;
    }
  }, [backgroundUrl]);

  useImperativeHandle(ref, () => ({
    getStream: () => {
      if (canvasRef.current) return canvasRef.current.captureStream(30);
      return new MediaStream();
    },
    getVideoElement: () => mediaVideoRef.current
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
      // Access latest props via ref to avoid closure staleness
      const currentProps = propsRef.current;
      const { 
          layout: mode, 
          branding: brand,
          activeVideoUrl: hasVidUrl,
          screenStream: hasScreen,
          backgroundUrl: hasBg
      } = currentProps;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Background
      if (hasBg && bgImgRef.current.complete && bgImgRef.current.naturalWidth > 0) {
          ctx.drawImage(bgImgRef.current, 0, 0, w, h);
      } else {
          const grad = ctx.createLinearGradient(0,0, 0, h);
          grad.addColorStop(0, '#111827');
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
      }

      // Helper: Draw Cover
      const drawCover = (video: HTMLVideoElement, x: number, y: number, targetW: number, targetH: number) => {
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
                 ctx.fillText("NO CAMERA", x + targetW/2, y + targetH/2);
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

      // Determine Content
      const contentVideo = hasVidUrl ? mediaVideoRef.current : (hasScreen ? screenVideoRef.current : null);
      const hasContent = !!contentVideo;

      // Layout Drawing
      if (mode === LayoutMode.FULL_CAM) {
        if (hasContent) drawCover(contentVideo, 0, 0, w, h);
        else drawCover(camVideoRef.current, 0, 0, w, h);
      } 
      else if (mode === LayoutMode.FULL_SCREEN) {
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
      else if (mode === LayoutMode.SPLIT) {
         if (hasContent) drawCover(contentVideo, 0, 0, w/2, h);
         else {
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
      else if (mode === LayoutMode.PIP) {
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
      }
      else if (mode === LayoutMode.NEWSROOM) {
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
            ctx.fillText("NO CONTENT", screenX + screenW/2, screenY + screenH/2);
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

      // Overlays
      if (currentProps.activeMediaUrl && overlayImgRef.current.complete && overlayImgRef.current.naturalWidth > 0) {
          const imgAspect = overlayImgRef.current.naturalWidth / overlayImgRef.current.naturalHeight;
          if (overlayImgRef.current.naturalWidth > 500) {
              ctx.drawImage(overlayImgRef.current, 0, 0, w, h);
          } else {
              const logoSize = 120;
              ctx.drawImage(overlayImgRef.current, w - logoSize - 30, 30, logoSize, logoSize);
          }
      }

      // --- BRANDING ---
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
          ctx.fillText("NEWS", labelW / 2, tickerY + tickerH / 2);
          
          ctx.textAlign = 'left';
          ctx.font = '20px sans-serif';
          
          const textWidth = ctx.measureText(brand.tickerText).width;
          const tickerSpeed = 2; // px per frame

          // Update Ticker Position using Ref (persistent across renders)
          tickerXRef.current -= tickerSpeed;
          
          // Reset if fully off screen
          if (tickerXRef.current < -textWidth) {
              tickerXRef.current = w;
          }
          // Also reset if it's way too far right (e.g. init)
          if (tickerXRef.current > w && tickerXRef.current !== w) {
              tickerXRef.current = w;
          }

          ctx.save();
          ctx.beginPath();
          ctx.rect(labelW, tickerY, w - labelW, tickerH);
          ctx.clip();
          ctx.fillText(brand.tickerText, labelW + 20 + tickerXRef.current, tickerY + tickerH / 2);
          ctx.restore();
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []); // Run only once on mount, rely on refs for updates

  return (
    <div className="w-full h-full flex items-center justify-center bg-black aspect-video rounded-lg overflow-hidden border border-gray-800 shadow-2xl relative">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
    </div>
  );
});

export default CanvasCompositor;