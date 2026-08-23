import { describe, expect, it } from 'vitest';
import {
  resolveMediaSource,
  summarizeMediaSource,
  validateRtmpDestination,
} from '../mediaSources.js';
import {
  cloudHoursForPlan,
  destinationsForPlan,
  overageRateCentsPerHour,
} from '../cloudUsage.js';
import { eligibleInvoiceRevenueCents } from '../affiliate.js';

describe('commercial media source safety', () => {
  it.each([
    'http://localhost/video.mp4',
    'http://127.0.0.1/video.mp4',
    'http://10.0.0.5/video.mp4',
    'http://192.168.1.8/video.mp4',
    'http://169.254.169.254/latest/meta-data',
    'http://user:pass@example.com/video.mp4',
    'http://example.com:8080/video.mp4',
  ])('rejects unsafe HTTP source %s', (url) => {
    expect(() => resolveMediaSource(url)).toThrow();
  });

  it('normalizes a public Dropbox link', () => {
    const source = resolveMediaSource('https://www.dropbox.com/s/abc123/demo.mp4?dl=0');
    expect(source.supported).toBe(true);
    expect(source.provider).toBe('dropbox-public');
    expect(source.playableUrl).toContain('dl.dropboxusercontent.com');
    expect(source.playableUrl).toContain('raw=1');
  });

  it('normalizes a public Google Drive file link', () => {
    const source = resolveMediaSource('https://drive.google.com/file/d/file123/view?usp=sharing');
    expect(source.supported).toBe(true);
    expect(source.provider).toBe('google-drive-public');
    expect(source.playableUrl).toContain('drive.usercontent.google.com');
    expect(source.playableUrl).toContain('id=file123');
  });

  it('rejects arbitrary YouTube page playback', () => {
    const source = resolveMediaSource('https://www.youtube.com/watch?v=abc123');
    expect(source.supported).toBe(false);
    expect(source.playableUrl).toBeNull();
  });

  it('rejects private RTMP destinations', () => {
    expect(() => validateRtmpDestination('rtmp://10.0.0.8:1935/live')).toThrow();
    expect(() => validateRtmpDestination('rtmp://localhost:1935/live')).toThrow();
  });

  it('accepts normal RTMPS destinations', () => {
    expect(validateRtmpDestination('rtmps://live.example.com:443/app')).toBe(
      'rtmps://live.example.com:443/app',
    );
  });

  it('redacts signed URL query parameters from durable summaries', () => {
    const source = resolveMediaSource(
      'https://cdn.example.com/video.mp4?signature=secret&expires=9999999999',
    );
    expect(summarizeMediaSource(source)).toEqual({
      provider: 'direct-url',
      hostname: 'cdn.example.com',
      protocol: 'https:',
      requiresAuthorization: false,
    });
  });
});

describe('profit-safe plan enforcement', () => {
  it('matches approved included cloud hours', () => {
    expect(cloudHoursForPlan('free')).toBe(0);
    expect(cloudHoursForPlan('pro')).toBe(2);
    expect(cloudHoursForPlan('expert')).toBe(8);
    expect(cloudHoursForPlan('enterprise')).toBe(20);
    expect(cloudHoursForPlan('business')).toBe(40);
  });

  it('matches approved destination ceilings', () => {
    expect(destinationsForPlan('free')).toBe(2);
    expect(destinationsForPlan('pro')).toBe(3);
    expect(destinationsForPlan('expert')).toBe(5);
    expect(destinationsForPlan('enterprise')).toBe(8);
    expect(destinationsForPlan('business')).toBe(10);
  });

  it('uses the approved cloud overage rates', () => {
    expect(overageRateCentsPerHour(1)).toBe(199);
    expect(overageRateCentsPerHour(5)).toBe(199);
    expect(overageRateCentsPerHour(6)).toBe(299);
    expect(overageRateCentsPerHour(8)).toBe(299);
    expect(overageRateCentsPerHour(9)).toBe(349);
    expect(overageRateCentsPerHour(10)).toBe(349);
  });
});

describe('affiliate commission base', () => {
  it('uses paid revenue excluding tax', () => {
    expect(
      eligibleInvoiceRevenueCents({
        amount_paid: 7900,
        total_excluding_tax: 7900,
        total_taxes: [{ amount: 650 }],
      }),
    ).toBe(7900);
  });

  it('subtracts tax when excluding-tax total is absent', () => {
    expect(
      eligibleInvoiceRevenueCents({
        amount_paid: 8550,
        total_taxes: [{ amount: 650 }],
      }),
    ).toBe(7900);
  });

  it('never creates a negative commission base', () => {
    expect(
      eligibleInvoiceRevenueCents({
        amount_paid: 100,
        total_taxes: [{ amount: 200 }],
      }),
    ).toBe(0);
  });
});
