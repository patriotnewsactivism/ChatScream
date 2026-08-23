const ALLOWED_FRONTEND_ORIGINS = new Set([
  'https://www.chatscream.live',
  'https://chatscream.live',
]);

const DEFAULT_FRONTEND_ORIGIN = 'https://www.chatscream.live';
const FORWARDED_QUERY_KEYS = [
  'code',
  'state',
  'error',
  'error_description',
  'scope',
  'authuser',
  'prompt',
];

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

const readQueryValue = (query, key) => {
  if (!query) return '';
  if (typeof query.get === 'function') return query.get(key) || '';
  const value = query[key];
  if (Array.isArray(value)) return String(value[0] ?? '');
  return value === undefined || value === null ? '' : String(value);
};

/**
 * Build the ChatScream Studio URL a YouTube streaming-destination callback
 * should land on, or null when the state belongs to ChatScream account login.
 * Returns a string so both the Express route and the raw-request interceptor
 * can share one implementation.
 */
export const buildYouTubeDestinationRedirectTarget = (query) => {
  const statePayload = parseDestinationState(readQueryValue(query, 'state'));
  if (!statePayload) return null;

  const requestedOrigin = String(statePayload.returnOrigin || '').trim();
  const frontendOrigin = ALLOWED_FRONTEND_ORIGINS.has(requestedOrigin)
    ? requestedOrigin
    : DEFAULT_FRONTEND_ORIGIN;

  const target = new URL('/oauth/callback', `${frontendOrigin}/`);
  target.searchParams.set('platform', 'youtube');
  // Explicit marker so the callback page never mistakes a destination connect
  // for a ChatScream account sign-in result.
  target.searchParams.set('flow', 'destination');

  FORWARDED_QUERY_KEYS.forEach((key) => {
    const value = readQueryValue(query, key);
    if (value) target.searchParams.set(key, value);
  });

  return target.toString();
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

  const target = buildYouTubeDestinationRedirectTarget(readQuery(req));
  if (!target) return false;

  res.statusCode = 302;
  res.setHeader('Location', target);
  res.setHeader('Cache-Control', 'no-store');
  res.end('Redirecting to ChatScream Studio...');
  return true;
};
