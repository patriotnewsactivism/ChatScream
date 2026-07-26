/**
 * Adaptive Streaming Hook
 * Monitors bandwidth, FPS, and memory usage to automatically adjust streaming quality.
 * Integrates with useResourceGuard to provide comprehensive performance monitoring.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useResourceGuard, type HealthLevel } from './useResourceGuard';

export type QualityLevel = 'low' | 'medium' | 'high' | 'auto';
export type StreamingQuality = {
  resolution: 360 | 480 | 720 | 1080;
  bitrate: number; // in kbps
  fps: number;
};

export interface AdaptiveStreamingSnapshot {
  quality: QualityLevel;
  currentQuality: StreamingQuality;
  targetQuality: StreamingQuality;
  bandwidthEstimate: number; // in kbps
  healthLevel: HealthLevel;
  performanceScore: number; // 0-1 scale
  notifications: string[];
}

// Quality presets
const QUALITY_PRESETS: Record<QualityLevel, StreamingQuality> = {
  low: { resolution: 360, bitrate: 500, fps: 15 },
  medium: { resolution: 720, bitrate: 1500, fps: 30 },
  high: { resolution: 1080, bitrate: 3000, fps: 60 },
  auto: { resolution: 720, bitrate: 1500, fps: 30 }, // default
};

// Bandwidth thresholds for automatic quality switching
const BANDWIDTH_THRESHOLDS = {
  low: 800,
  medium: 2000,
  high: 4000,
};

export const useAdaptiveStreaming = (enabled = true, initialQuality: QualityLevel = 'auto') => {
  const [quality, setQuality] = useState<QualityLevel>(initialQuality);
  const [currentQuality, setCurrentQuality] = useState<StreamingQuality>(QUALITY_PRESETS[initialQuality]);
  const [targetQuality, setTargetQuality] = useState<StreamingQuality>(QUALITY_PRESETS[initialQuality]);
  const [bandwidthEstimate, setBandwidthEstimate] = useState<number>(2000); // Initial estimate
  const [notifications, setNotifications] = useState<string[]>([]);
  
  const resourceGuard = useResourceGuard(enabled);
  const qualityRef = useRef(quality);
  const currentQualityRef = useRef(currentQuality);
  const targetQualityRef = useRef(targetQuality);
  const bandwidthRef = useRef(bandwidthEstimate);
  const lastNotificationTime = useRef<number>(0);
  
  // Update refs when state changes
  useEffect(() => {
    qualityRef.current = quality;
    currentQualityRef.current = currentQuality;
    targetQualityRef.current = targetQuality;
    bandwidthRef.current = bandwidthEstimate;
  }, [quality, currentQuality, targetQuality, bandwidthEstimate]);
  
  // Calculate performance score based on multiple factors
  const calculatePerformanceScore = useCallback((): number => {
    const { fps, memoryPressure, level: healthLevel } = resourceGuard;
    
    // Base score from FPS (0-1)
    let fpsScore = Math.min(fps / 60, 1);
    
    // Memory pressure affects score inversely (lower is better)
    let memoryScore = 1 - memoryPressure;
    
    // Health level multiplier
    let healthMultiplier = healthLevel === 'green' ? 1 : healthLevel === 'yellow' ? 0.7 : 0.4;
    
    // Combined score
    const score = (fpsScore * 0.4 + memoryScore * 0.3 + healthMultiplier * 0.3);
    return Math.max(0, Math.min(1, score));
  }, [resourceGuard]);
  
  // Estimate available bandwidth (simulated - in real app this would come from network metrics)
  const estimateBandwidth = useCallback((): number => {
    // In a real implementation, this would use WebRTC stats, RTCP reports, or other network metrics
    // For now, we'll simulate based on performance and health
    const performanceScore = calculatePerformanceScore();
    const baseEstimate = 2000; // Start with 2 Mbps
    
    // Adjust based on performance
    const adjustedEstimate = baseEstimate * performanceScore;
    
    // Also consider health level
    const { level: healthLevel } = resourceGuard;
    if (healthLevel === 'red') {
      return Math.max(500, adjustedEstimate * 0.5);
    } else if (healthLevel === 'yellow') {
      return Math.max(800, adjustedEstimate * 0.7);
    }
    
    return Math.max(500, adjustedEstimate);
  }, [calculatePerformanceScore, resourceGuard]);
  
  // Determine quality level based on current conditions
  const determineQualityLevel = useCallback((): QualityLevel => {
    const bandwidth = estimateBandwidth();
    const performanceScore = calculatePerformanceScore();
    const { level: healthLevel } = resourceGuard;
    
    // If manually set to a specific quality, respect that unless health is critical
    if (qualityRef.current !== 'auto' && healthLevel !== 'red') {
      return qualityRef.current;
    }
    
    // Critical health overrides everything
    if (healthLevel === 'red') {
      return 'low';
    }
    
    // Determine quality based on bandwidth and performance
    if (bandwidth >= BANDWIDTH_THRESHOLDS.high && performanceScore >= 0.8) {
      return 'high';
    } else if (bandwidth >= BANDWIDTH_THRESHOLDS.medium && performanceScore >= 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }, [calculatePerformanceScore, estimateBandwidth, resourceGuard]);
  
  // Apply quality changes
  const applyQualityChange = useCallback((newQuality: QualityLevel) => {
    const preset = QUALITY_PRESETS[newQuality];
    
    // Only update if quality actually changed
    if (JSON.stringify(preset) !== JSON.stringify(targetQualityRef.current)) {
      setTargetQuality(preset);
      
      // Show notification about quality change
      const now = Date.now();
      if (now - lastNotificationTime.current > 5000) { // Prevent spam
        const message = newQuality === 'high' 
          ? 'Streaming quality improved to high definition'
          : newQuality === 'medium'
            ? 'Streaming quality adjusted to medium'
            : 'Streaming quality reduced to maintain performance';
            
        setNotifications(prev => [...prev, message]);
        lastNotificationTime.current = now;
        
        // Auto-clear notification after 5 seconds
        setTimeout(() => {
          setNotifications(prev => prev.slice(1));
        }, 5000);
      }
    }
  }, []);
  
  // Monitor and adapt quality
  useEffect(() => {
    if (!enabled) return;
    
    const interval = setInterval(() => {
      // Update bandwidth estimate
      const newBandwidth = estimateBandwidth();
      setBandwidthEstimate(newBandwidth);
      
      // Determine new quality level
      const newQuality = determineQualityLevel();
      
      // Apply quality change if needed
      if (newQuality !== qualityRef.current) {
        setQuality(newQuality);
        applyQualityChange(newQuality);
      }
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(interval);
  }, [enabled, estimateBandwidth, determineQualityLevel, applyQualityChange]);
  
  // Smoothly transition to target quality
  useEffect(() => {
    if (JSON.stringify(targetQuality) !== JSON.stringify(currentQuality)) {
      // In a real implementation, this would gradually transition to the target quality
      // For now, we'll just update immediately
      setCurrentQuality(targetQuality);
    }
  }, [targetQuality, currentQuality]);
  
  // Manual quality override function
  const setManualQuality = useCallback((newQuality: QualityLevel) => {
    setQuality(newQuality);
    
    if (newQuality !== 'auto') {
      setTargetQuality(QUALITY_PRESETS[newQuality]);
      setCurrentQuality(QUALITY_PRESETS[newQuality]);
    }
  }, []);
  
  // Reset to auto mode
  const resetToAuto = useCallback(() => {
    setQuality('auto');
  }, []);
  
  const performanceScore = calculatePerformanceScore();
  
  return {
    quality,
    currentQuality,
    targetQuality,
    bandwidthEstimate,
    healthLevel: resourceGuard.level,
    performanceScore,
    notifications,
    setManualQuality,
    resetToAuto,
    safeToEnable: resourceGuard.safeToEnable,
  };
};
