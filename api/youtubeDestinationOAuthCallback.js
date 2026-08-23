const ALLOWED_FRONTEND_ORIGINS = new Set([
  'https://www.chatscream.live',
  'https://chatscream.live',
]);

const parseDestinationState = (rawState) => {
  try {
    const state = String(rawState || '').trim();
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

export const isYouTubeDestinationOAuthCallback = (req) =>
  Boolean(parseDestinationState(req?.query?.state));

export const forwardYouTubeDestinationOAuthCallback = (req, res) => {
  const statePayload = parseDestinationState(req?.query?.state);
  if (!statePayload) return false;

  const requestedOrigin = String(statePayload.returnOrigin || '').trim();
  const frontendOrigin = ALLOWED_FRONTEND_ORIGINS.has(requestedOrigin)
    ? requestedOrigin
    : 'https://www.chatscream.live';

  const target = new URL('/oauth/callback', `${frontendOrigin}/`);
  target.searchParams.set('platform', 'youtube');

  ['code', 'state', 'error', 'error_description', 'scope', 'authuser', 'prompt'].forEach((key) => {
    const value = req?.query?.[key];
    if (value !== undefined && value !== null && String(value)) {
      target.searchParams.set(key, String(value));
    }
  });

  res.redirect(302, target.toString());
  return true;
};
