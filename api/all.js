import app from '../server/app.js';
import recordingsHandler from './recordings.js';
import {
  forwardYouTubeDestinationOAuthCallback,
  isYouTubeDestinationOAuthCallback,
} from './youtubeDestinationOAuthCallback.js';

const normalizePathSegment = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join('/');
  }
  return String(value || '').trim();
};

export default (req, res) => {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const rewrittenPath = normalizePathSegment(req.query?.path);

  let targetPath = '';
  if (rewrittenPath) {
    targetPath = `/api/${rewrittenPath.replace(/^\/+/, '')}`;
  } else if (incoming.pathname.startsWith('/api')) {
    targetPath = incoming.pathname;
  } else {
    targetPath = '/api';
  }

  incoming.searchParams.delete('path');
  const nextQuery = incoming.searchParams.toString();
  req.url = nextQuery ? `${targetPath}?${nextQuery}` : targetPath;

  // Keep ChatScream on one Vercel API entrypoint. The project rewrites /api/*
  // to this handler, so specialized routes must dispatch here before Express.
  if (targetPath === '/api/recordings') {
    return recordingsHandler(req, res);
  }

  // YouTube destination OAuth intentionally reuses the already-authorized
  // Google backend callback. Destination state is forwarded untouched back
  // to the originating ChatScream web origin, where the existing state check
  // and authenticated server-side token exchange complete the connection.
  if (
    targetPath === '/api/auth/oauth/google/callback' &&
    isYouTubeDestinationOAuthCallback(req)
  ) {
    return forwardYouTubeDestinationOAuthCallback(req, res);
  }

  return app(req, res);
};
