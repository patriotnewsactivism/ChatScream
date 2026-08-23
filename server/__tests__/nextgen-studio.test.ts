import { describe, expect, it } from 'vitest';
import {
  buildFfmpegRealtimeInputArgs,
  resolveMediaSource,
  validateRtmpDestination,
} from '../commercial/mediaSources.js';
import {
  OVERAGE_RATES_CENTS_PER_HOUR,
  PLAN_CLOUD_HOURS,
  PLAN_DESTINATION_LIMITS,
  overageRateCentsPerHour,
} from '../commercial/cloudUsage.js';
import {
  PLAN_DECISION_LIMITS,
  sanitizeConfig,
} from '../aiModerator/router.js';

describe('next-generation studio commercialization boundaries', () => {
  it('keeps cloud allowances bounded for the profit-safe paid ladder', () => {
    expect(PLAN_CLOUD_HOURS).toMatchObject({
      free: 0,
      pro: 2,
      expert: 8,
      enterprise: 20,
      business: 40,
    });
    expect(PLAN_DESTINATION_LIMITS).toMatchObject({
      free: 2,
      pro: 3,
      expert: 5,
      enterprise: 8,
      business: 10,
    });
  });

  it('keeps cloud overages opt-in friendly and destination-sensitive', () => {
    expect(overageRateCentsPerHour(1)).toBe(OVERAGE_RATES_CENTS_PER_HOUR.upTo5);
    expect(overageRateCentsPerHour(5)).toBe(199);
    expect(overageRateCentsPerHour(6)).toBe(299);
    expect(overageRateCentsPerHour(8)).toBe(299);
    expect(overageRateCentsPerHour(9)).toBe(349);
    expect(overageRateCentsPerHour(10)).toBe(349);
  });

  it('rejects arbitrary YouTube pages as downloadable cloud media', () => {
    const source = resolveMediaSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(source.supported).toBe(false);
    expect(source.playableUrl).toBeNull();
    expect(source.provider).toBe('youtube');
  });

  it('normalizes public Drive and Dropbox links for cloud playback', () => {
    const drive = resolveMediaSource('https://drive.google.com/file/d/abc123/view?usp=sharing');
    expect(drive.supported).toBe(true);
    expect(drive.provider).toBe('google-drive-public');
    expect(drive.playableUrl).toContain('drive.usercontent.google.com/download');

    const dropbox = resolveMediaSource('https://www.dropbox.com/s/example/video.mp4?dl=0');
    expect(dropbox.supported).toBe(true);
    expect(dropbox.provider).toBe('dropbox-public');
    expect(dropbox.playableUrl).toContain('dl.dropboxusercontent.com');
    expect(dropbox.playableUrl).toContain('raw=1');
  });

  it('blocks obvious private-network media and RTMP targets', () => {
    expect(() => resolveMediaSource('http://127.0.0.1/video.mp4')).toThrow(/not allowed/i);
    expect(() => resolveMediaSource('http://169.254.169.254/latest/meta-data')).toThrow(/not allowed/i);
    expect(() => validateRtmpDestination('rtmp://192.168.1.20/live')).toThrow(/not allowed/i);
  });

  it('builds a real-time FFmpeg input without shell interpolation', () => {
    expect(
      buildFfmpegRealtimeInputArgs({
        playableUrl: 'https://cdn.example.com/show.mp4',
        loop: false,
        startSeconds: 12,
      }),
    ).toEqual(['-re', '-ss', '12', '-i', 'https://cdn.example.com/show.mp4']);
  });

  it('keeps AI Co-Host unavailable on free and bounded on paid plans', () => {
    expect(PLAN_DECISION_LIMITS.free).toBe(0);
    expect(PLAN_DECISION_LIMITS.pro).toBe(500);
    expect(PLAN_DECISION_LIMITS.expert).toBe(3000);
    expect(PLAN_DECISION_LIMITS.enterprise).toBe(12000);
    expect(PLAN_DECISION_LIMITS.business).toBe(50000);
  });

  it('clamps AI Co-Host automation settings to safe operating ranges', () => {
    const config = sanitizeConfig({
      enabled: true,
      mode: 'autopilot',
      tone: 'witty',
      cooldownSeconds: 0,
      maxRepliesPerMinute: 99,
      quietAfterSeconds: 1,
      knowledgeBase: 'x'.repeat(20000),
      hostInstructions: 'y'.repeat(10000),
    });

    expect(config.mode).toBe('autopilot');
    expect(config.cooldownSeconds).toBe(8);
    expect(config.maxRepliesPerMinute).toBe(6);
    expect(config.quietAfterSeconds).toBe(60);
    expect(config.knowledgeBase.length).toBe(12000);
    expect(config.hostInstructions.length).toBe(4000);
  });
});
