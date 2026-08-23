const MAX_URL_LENGTH = 4096;

const assertHttpUrl = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value || value.length > MAX_URL_LENGTH) {
    throw new Error('A valid media URL is required.');
  }
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) media URLs are supported.');
  }
  return parsed;
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
  if (!playableUrl) throw new Error('playableUrl is required.');
  const args = ['-re'];
  if (startSeconds > 0) args.push('-ss', String(Math.max(0, Number(startSeconds) || 0)));
  if (loop) args.push('-stream_loop', '-1');
  args.push('-i', playableUrl);
  return args;
};
