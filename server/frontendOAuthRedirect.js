export const FRONTEND_OAUTH_CALLBACK_PATH = '/oauth/callback';

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

const appendCallbackPath = (origin) => {
  try {
    return new URL(FRONTEND_OAUTH_CALLBACK_PATH, `${String(origin).replace(/\/+$/, '')}/`).toString();
  } catch {
    return '';
  }
};

/**
 * Resolve where the backend should send a browser once an OAuth round trip
 * finishes.
 *
 * A bare origin is a site root, not a finished callback URL. Returning one
 * verbatim strands the authorization code (or session token) on the landing
 * page, which never reads it — the user just sees the home screen. So only a
 * configured value that actually carries a path is used as-is; anything else
 * gets the callback path appended.
 */
export const resolveFrontendOAuthCallbackUrl = ({
  explicitRedirectUrl = '',
  appBaseUrl = '',
  serverBaseUrl = '',
} = {}) => {
  // AUTH_REDIRECT_URL / VITE_OAUTH_REDIRECT_URI name the callback page itself.
  const explicit = String(explicitRedirectUrl || '').trim();
  if (explicit) {
    if (isAbsoluteUrl(explicit)) {
      try {
        const url = new URL(explicit);
        if (url.pathname && url.pathname !== '/') return url.toString();
        return appendCallbackPath(url.origin);
      } catch {
        // fall through to the next candidate
      }
    } else if (explicit.startsWith('/') && serverBaseUrl) {
      try {
        return new URL(explicit, `${String(serverBaseUrl).replace(/\/+$/, '')}/`).toString();
      } catch {
        // fall through to the next candidate
      }
    }
  }

  // APP_BASE_URL is the web origin, so the callback path is always appended.
  const base = String(appBaseUrl || '').trim();
  if (base && isAbsoluteUrl(base)) {
    const resolved = appendCallbackPath(base);
    if (resolved) return resolved;
  }

  return appendCallbackPath(serverBaseUrl);
};
