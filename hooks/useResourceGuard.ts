/**
 * Resource Guard — keeps the app from freezing on low-memory phones.
 *
 * Features:
 * - Monitors deviceMemory API + performance.memory (Chrome) for heap pressure
 * - Watches for frame-drops via requestAnimationFrame jank detection
 * - Drops quality tiers automatically (1080→720→480→360) before the device stalls
 * - Exposes a "danger" level (green/yellow/red) for UI indicators
 * - Provides `safeToEnable(feature)` so the app never enables something that
 *   would push memory over the edge (e.g., local recording on a 2 GB phone)
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export type HealthLevel = 'green' | 'yellow' | 'red';

export interface ResourceSnapshot {
  level: HealthLevel;
  memoryPressure: number;      // 0-1 (1 = critical)
  fps: number;                 // recent average fps
  droppedFrames: number;       // count over last 5 s
  recommendedResolution: 360 | 480 | 720 | 1080;
  warnings: string[];
}

const RESOLUTIONS: (360 | 480 | 720 | 1080)[] = [1080, 720, 480, 360];

/** Estimated memory cost (MB) of enabling each capability. */
const FEATURE_COST_MB: Record<string, number> = {
  recording: 80,
  screenShare: 60,
  multiview: 50,
  overlay: 20,
  captions: 15,
};

export const useResourceGuard = (enabled = true) => {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot>({
    level: 'green',
    memoryPressure: 0,
    fps: 60,
    droppedFrames: 0,
    recommendedResolution: 720,
    warnings: [],
  });

  const frameTimes = useRef<number[]>([]);
  const rafId = useRef<number>(0);

  // ── FPS measurement ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    let lastTime = performance.now();
    let drops = 0;
    const measure = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      frameTimes.current.push(dt);
      if (dt > 33) drops++; // >33 ms means below 30 fps

      // Keep last 150 frames (~2.5 s at 60 fps)
      if (frameTimes.current.length > 150) frameTimes.current.shift();

      rafId.current = requestAnimationFrame(measure);
    };
    rafId.current = requestAnimationFrame(measure);

    // Periodic snapshot (every 3 s)
    const interval = setInterval(() => {
      const times = frameTimes.current;
      if (times.length === 0) return;

      const avgFrame = times.reduce((a, b) => a + b, 0) / times.length;
      const fps = Math.round(1000 / avgFrame);
      const droppedFrames = times.filter(t => t > 33).length;

      // Memory pressure
      let memoryPressure = 0;
      const perf = (performance as any);
      if (perf.memory) {
        const { usedJSHeapSize, jsHeapSizeLimit } = perf.memory;
        memoryPressure = usedJSHeapSize / jsHeapSizeLimit;
      } else if ((navigator as any).deviceMemory) {
        // Rough heuristic for devices reporting deviceMemory
        const deviceGB = (navigator as any).deviceMemory;
        memoryPressure = deviceGB <= 2 ? 0.7 : deviceGB <= 4 ? 0.4 : 0.2;
      }

      // Determine health level
      const warnings: string[] = [];
      let level: HealthLevel = 'green';

      if (fps < 20 || memoryPressure > 0.85) {
        level = 'red';
        warnings.push(fps < 20 ? 'Frame rate critically low' : 'Memory nearly full');
      } else if (fps < 30 || memoryPressure > 0.65) {
        level = 'yellow';
        if (fps < 30) warnings.push('Frame rate below 30 fps');
        if (memoryPressure > 0.65) warnings.push('Memory usage high');
      }

      // Recommended resolution
      let rec: 360 | 480 | 720 | 1080 = 1080;
      if (level === 'red') rec = 360;
      else if (level === 'yellow') rec = 480;
      else if (fps < 50 || memoryPressure > 0.45) rec = 720;

      setSnapshot({ level, memoryPressure, fps, droppedFrames, recommendedResolution: rec, warnings });
    }, 3000);

    return () => {
      cancelAnimationFrame(rafId.current);
      clearInterval(interval);
    };
  }, [enabled]);

  // ── Utility: check if it's safe to enable a feature ──────────────────────
  const safeToEnable = useCallback(
    (feature: keyof typeof FEATURE_COST_MB): boolean => {
      const costMB = FEATURE_COST_MB[feature] || 0;
      const perf = (performance as any);
      if (perf.memory) {
        const freeBytes = perf.memory.jsHeapSizeLimit - perf.memory.usedJSHeapSize;
        return freeBytes > costMB * 1024 * 1024 * 1.5; // 1.5× safety margin
      }
      // Can't measure — allow if not already in danger
      return snapshot.level !== 'red';
    },
    [snapshot.level],
  );

  return { ...snapshot, safeToEnable };
};
