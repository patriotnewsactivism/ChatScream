export const DEFAULT_FACEBOOK_GRAPH_API_VERSION = 'v26.0';

// ChatScream's automated Facebook destination is Page-only. These are the
// permissions used by the implemented flow:
//   1. list Pages managed by the signed-in person;
//   2. create a LiveVideo on the selected Page; and
//   3. read the Page/LiveVideo state needed by the studio.
// Keep this list minimal. Personal-profile publishing (`publish_video`) and
// Page settings management (`pages_manage_metadata`) are separate use cases
// and are intentionally not requested.
export const FACEBOOK_PAGE_OAUTH_SCOPES = Object.freeze([
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
]);

export const FACEBOOK_ACCOUNT_OAUTH_SCOPES = Object.freeze(['public_profile', 'email']);

export const normalizeFacebookGraphApiVersion = (value) => {
  const normalized = String(value || '').trim();
  return /^v\d+\.\d+$/.test(normalized) ? normalized : DEFAULT_FACEBOOK_GRAPH_API_VERSION;
};

export const getFacebookAuthorizationEndpoint = (version) =>
  `https://www.facebook.com/${normalizeFacebookGraphApiVersion(version)}/dialog/oauth`;

export const getFacebookGraphBaseUrl = (version) =>
  `https://graph.facebook.com/${normalizeFacebookGraphApiVersion(version)}`;
