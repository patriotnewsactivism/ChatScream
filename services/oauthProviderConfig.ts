// Single authoritative source for every provider-facing OAuth constant.
//
// Two separate production outages came from these values being duplicated
// across the codebase instead of living in one place:
//
//   * The YouTube destination flow sent redirect_uri=https://www.chatscream.live
//     /oauth/callback — the *web app's* callback — instead of the API callback
//     Google actually has registered, so Google answered
//     "Error 400: redirect_uri_mismatch" before the user could even sign in.
//   * The Facebook dialog was pinned to Graph v18.0 in one copy and v26.0 in
//     another, so which version shipped depended on which copy the bundler won
//     with, and the App Domains check ran against whichever host that copy used.
//
// Anything a provider validates character-for-character belongs here and
// nowhere else. Import these; never re-type the literal at a call site.

import {
  DEFAULT_FACEBOOK_GRAPH_API_VERSION,
  FACEBOOK_PAGE_OAUTH_SCOPES,
  getFacebookAuthorizationEndpoint,
  getFacebookGraphBaseUrl,
  normalizeFacebookGraphApiVersion,
} from '../shared/facebookOAuth.js';

export {
  FACEBOOK_PAGE_OAUTH_SCOPES,
  getFacebookAuthorizationEndpoint,
  getFacebookGraphBaseUrl,
  normalizeFacebookGraphApiVersion,
};

/**
 * Graph API version for every Facebook call ChatScream makes — the dialog and
 * the token exchange must agree, because Meta validates the app's configured
 * redirect against the version that opened the dialog.
 */
export const FACEBOOK_GRAPH_API_VERSION = DEFAULT_FACEBOOK_GRAPH_API_VERSION;

/**
 * Where Google sends the browser after a *YouTube destination* authorization.
 *
 * This is the API origin, not the web app: the backend owns the code→token
 * exchange for streaming destinations so the authorization code and the
 * YouTube client secret never touch the browser. server/youtubeDestinationOAuth
 * Callback.js recognises the Studio-generated state and forwards the browser on
 * to the frontend callback afterwards.
 *
 * Registered verbatim on the YouTube OAuth web client in Google Cloud Console.
 * Protocol, host, path and the absence of a trailing slash all matter.
 */
export const YOUTUBE_PRODUCTION_REDIRECT_URI =
  'https://api.chatscream.live/api/auth/oauth/google/callback';

/**
 * Where providers that hand the code back to the web app return to.
 *
 * `www` is canonical: vercel.json 308-redirects the apex to www, and a redirect
 * mid-OAuth would drop the query string, so the apex host must never appear in
 * an authorization request even when the user typed it.
 */
export const CANONICAL_FRONTEND_CALLBACK = 'https://www.chatscream.live/oauth/callback';

/** Hosts that are allowed to use a loopback callback instead of production. */
export const LOCAL_DEV_HOSTNAMES = ['localhost', '127.0.0.1'] as const;

export const FACEBOOK_AUTHORIZATION_ENDPOINT = getFacebookAuthorizationEndpoint(
  FACEBOOK_GRAPH_API_VERSION,
);

export const FACEBOOK_TOKEN_ENDPOINT = `${getFacebookGraphBaseUrl(
  FACEBOOK_GRAPH_API_VERSION,
)}/oauth/access_token`;

export const isLocalDevHost = (hostname: string): boolean =>
  (LOCAL_DEV_HOSTNAMES as readonly string[]).includes(hostname);
