import express from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { setConnectedPlatform } from '../store.js';

const router = express.Router();

const trimSlash = (value) => String(value || '').trim().replace(/\/+$/, '');
const apiBaseUrl = () =>
  trimSlash(
    process.env.OAUTH_BACKEND_BASE_URL ||
      process.env.API_BASE_URL ||
      process.env.PUBLIC_API_BASE_URL ||
      'https://api.chatscream.live',
  );
const frontendBaseUrl = () =>
  trimSlash(process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://www.chatscream.live');
const googleCallbackUrl = () => `${apiBaseUrl()}/api/auth/oauth/google/callback`;

const credentials = () => ({
  clientId: String(
    process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.VITE_YOUTUBE_CLIENT_ID || '',
  ).trim(),
  clientSecret: String(process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim(),
});

const stateSecret = () =>
  String(
    process.env.AUTH_STATE_SECRET ||
      process.env.YOUTUBE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      '',
  ).trim();

const b64url = (value) => Buffer.from(value, 'utf8').toString('base64url');
const sign = (payload) => createHmac('sha256', stateSecret()).update(payload).digest('base64url');

const createState = (payload) => {
  if (!stateSecret()) return '';
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
};

const parseState = (encoded) => {
  try {
    const [body, signature] = String(encoded || '').split('.', 2);
    if (!body || !signature || !stateSecret()) return null;
    const expected = Buffer.from(sign(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.purpose !== 'destination' || payload.platform !== 'youtube') return null;
    if (!payload.uid || !payload.ts || Date.now() - Number(payload.ts) > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
};

const redirectToStudio = (res, params = {}) => {
  const url = new URL('/oauth/callback', `${frontendBaseUrl()}/`);
  url.searchParams.set('platform', 'youtube');
  url.searchParams.set('destination', '1');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value)) url.searchParams.set(key, String(value));
  });
  res.redirect(302, url.toString());
};

router.post('/youtube/start', (req, res) => {
  const uid = String(req.auth?.profile?.uid || '').trim();
  if (!uid) return res.status(401).json({ message: 'Authentication required.' });

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret || !stateSecret()) {
    return res.status(503).json({
      message: 'YouTube connection is not fully configured on the server.',
    });
  }

  const state = createState({
    purpose: 'destination',
    platform: 'youtube',
    uid,
    ts: Date.now(),
    nonce: randomUUID(),
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', googleCallbackUrl());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set(
    'scope',
    [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' '),
  );
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', state);

  return res.json({ authUrl: authUrl.toString(), redirectUri: googleCallbackUrl() });
});

export const handleYouTubeDestinationGoogleCallback = async (req, res, next) => {
  const state = parseState(req.query?.state);
  if (!state) return next();

  const queryError = String(req.query?.error || '').trim();
  if (queryError) {
    redirectToStudio(res, {
      error: queryError === 'access_denied' ? 'Authorization was denied.' : queryError,
    });
    return;
  }

  const code = String(req.query?.code || '').trim();
  if (!code) {
    redirectToStudio(res, { error: 'Google did not return an authorization code.' });
    return;
  }

  try {
    const { clientId, clientSecret } = credentials();
    if (!clientId || !clientSecret) throw new Error('YouTube OAuth credentials are missing.');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    const tokenPayload = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenPayload?.access_token) {
      throw new Error(
        tokenPayload?.error_description || tokenPayload?.error || 'YouTube token exchange failed.',
      );
    }

    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50',
      { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
    );
    const channelPayload = await channelRes.json().catch(() => ({}));
    if (!channelRes.ok) {
      throw new Error(channelPayload?.error?.message || 'Could not load the YouTube channel.');
    }
    const channel = Array.isArray(channelPayload?.items) ? channelPayload.items[0] : null;
    if (!channel?.id) throw new Error('No YouTube channel was found for this Google account.');

    const expiresIn = Number(tokenPayload.expires_in || 3600);
    const thumbnailUrl =
      channel?.snippet?.thumbnails?.high?.url ||
      channel?.snippet?.thumbnails?.medium?.url ||
      channel?.snippet?.thumbnails?.default?.url ||
      '';

    await setConnectedPlatform(state.uid, 'youtube', {
      accessToken: String(tokenPayload.access_token),
      refreshToken: String(tokenPayload.refresh_token || ''),
      expiresAt: new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString(),
      scope: String(tokenPayload.scope || ''),
      channelId: String(channel.id),
      channelName: String(channel?.snippet?.title || 'YouTube Channel'),
      thumbnailUrl,
    });

    redirectToStudio(res, { connected: '1' });
  } catch (error) {
    console.error('[destination-oauth] YouTube callback failed:', error);
    redirectToStudio(res, {
      error: error instanceof Error ? error.message : 'YouTube connection failed.',
    });
  }
};

export default router;
