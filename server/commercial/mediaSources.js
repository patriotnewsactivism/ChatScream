import { isIP } from 'node:net';

const MAX_URL_LENGTH = 4096;
const SAFE_HTTP_PORTS = new Set(['', '80', '443']);
const SAFE_RTMP_PORTS = new Set(['', '1935', '443']);

const isPrivateIpv4 = (hostname) => {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateIpv6 = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
};

export const assertPublicHostname = (rawHostname) => {
  const hostname = String(rawHostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new Error('Remote hostname is required.');

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Private or local network hosts are not allowed.');
  }

  const ipVersion = isIP(hostname);
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new Error('Private, loopback, link-local, and reserved IP addresses are not allowed.');
  }

  return hostname;
};

const assertNoEmbeddedCredentials = (url) => {
  if (url.username || url.password) {
    throw new Error('Embedded URL credentials are not allowed. Use provider authorization instead.');
  }
};

const assertHttpUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value || value.length > MAX_URL_LENGTH) {
    throw new Error('A valid media URL is required.');
  }
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) media URLs are supported.');
  }
  assertNoEmbeddedCredentials(parsed);
  assertPublicHostname(parsed.hostname);
  if (!SAFE_HTTP_PORTS.has(parsed.port)) {
    throw new Error('Media URLs may only use standard HTTP/HTTPS ports.');
  }
  return parsed;
};

export const validateRtmpDestination = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value || value.length > MAX_URL_LENGTH) throw new Error('A valid RTMP ingest URL is required.');
  const url = new URL(value);
  if (!['rtmp:', 'rtmps:'].includes(url.protocol)) {
    throw new Error('Cloud destinations must use RTMP or RTMPS.');
  }
  assertNoEmbeddedCredentials(url);
  assertPublicHostname(url.hostname);
  if (!SAFE_RTMP_PORTS.has(url.port)) {
    throw new Error('RTMP destinations may only use the standard RTMP or TLS ports.');
  }
  return url.toString();
};

const extractGoogleDriveId = (url) => {
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) return fileMatch[1];
  const id = url.searchParams.get('id');
  return id || '';
};

const normalizeDropbox = (url) => {
  const normalized = new URL(url.toString());
  if (normalized.hostname === 'www.dropbox.com' || normalized.hostname === 'dropbox.com') {
    normalized.hostname = 'dl.dropboxusercontent.com';
  }
  normalized.searchParams.delete('dl');
  normalized.searchParams.set('raw', '1');
  return normalized.toString();
};

const normalizeGoogleDrive = (url) => {
  const id = extractGoogleDriveId(url);
  if (!id) {
    throw new Error('Could not determine the Google Drive file ID from this link.');
  }
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
};

const redactedRemoteSummary = (url) => ({
  hostname: url.hostname.toLowerCase(),
  protocol: url.protocol,
});

export const summarizeMediaSource = (source) => {
  const raw = String(source?.sourceUrl || source?.playableUrl || '').trim();
  let remote = null;
  try {
    if (raw) remote = redactedRemoteSummary(new URL(raw));
  } catch {
    remote = null;
  }
  return {
    provider: String(source?.provider || 'unknown'),
    ...(remote || {}),
    requiresAuthorization: Boolean(source?.requiresAuthorization),
  };
};

export const resolveMediaSource = (rawUrl) => {
  const url = assertHttpUrl(rawUrl);
  const hostname = url.hostname.toLowerCase();

  if (hostname === 'youtu.be' || hostname.endsWith('youtube.com')) {
    return {
      provider: 'youtube',
      sourceUrl: url.toString(),
      playableUrl: null,
      supported: false,
      reason:
        'Arbitrary YouTube page URLs are not used as downloadable media sources. Import the original/authorized file or a direct media URL instead.',
    };
  }

  if (hostname === 'drive.google.com' || hostname === 'docs.google.com') {
    return {
      provider: 'google-drive-public',
      sourceUrl: url.toString(),
      playableUrl: normalizeGoogleDrive(url),
      supported: true,
      requiresAuthorization: false,
      note: 'The Drive file must be shared so the cloud worker can read it.',
    };
  }

  if (hostname.endsWith('dropbox.com') || hostname === 'dl.dropboxusercontent.com') {
    return {
      provider: 'dropbox-public',
      sourceUrl: url.toString(),
      playableUrl: normalizeDropbox(url),
      supported: true,
      requiresAuthorization: false,
      note: 'The Dropbox file must be accessible through the shared link.',
    };
  }

  return {
    provider: 'direct-url',
    sourceUrl: url.toString(),
    playableUrl: url.toString(),
    supported: true,
    requiresAuthorization: false,
  };
};

export const buildFfmpegRealtimeInputArgs = ({ playableUrl, loop = false, startSeconds = 0 }) => {
  const safeUrl = assertHttpUrl(playableUrl);
  const args = ['-re'];
  if (startSeconds > 0) args.push('-ss', String(Math.max(0, Number(startSeconds) || 0)));
  if (loop) args.push('-stream_loop', '-1');
  args.push('-i', safeUrl.toString());
  return args;
};
