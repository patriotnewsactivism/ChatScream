const ALLOWED_FRONTEND_ORIGINS = new Set([
  'https://www.chatscream.live',
  'https://chatscream.live',
]);

const parseDestinationState = (rawState) => {
  try {
    const state = String(rawState || '').trim();
    // ChatScream account-login state is HMAC-signed and contains a dot.
    // Destination state is the client-generated base64 JSON used by Studio.
    if (!state || state.includes('.')) return null;
    const payload = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    if (!payload || payload.platform !== 'youtube') return null;
    if (!payload.userId || !payload.nonce || !payload.timestamp) return null;
    if (Date.now() - Number(payload.timestamp) > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
};

const readQuery = (req) => {
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
};

export const maybeForwardYouTubeDestinationOAuth = (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/api/auth/oauth/google/callback') return false;

  const query = readQuery(req);
  const rawState = query.get('state') || '';
  const statePayload = parseDestinationState(rawState);
  if (!statePayload) return false;

  const requestedOrigin = String(statePayload.returnOrigin || '').trim();
  const frontendOrigin = ALLOWED_FRONTEND_ORIGINS.has(requestedOrigin)
    ? requestedOrigin
    : 'https://www.chatscream.live';

  const target = new URL('/oauth/callback', `${frontendOrigin}/`);
  target.searchParams.set('platform', 'youtube');

  ['code', 'state', 'error', 'error_description', 'scope', 'authuser', 'prompt'].forEach((key) => {
    const value = query.get(key);
    if (value) target.searchParams.set(key, value);
  });

  res.statusCode = 302;
  res.setHeader('Location', target.toString());
  res.setHeader('Cache-Control', 'no-store');
  res.end('Redirecting to ChatScream Studio...');
  return true;
};
