// Feature flags for gradual rollout

export const ENABLE_VIRTUAL_CHAT = Boolean(
  typeof window !== 'undefined'
    ? window.localStorage.getItem('ENABLE_VIRTUAL_CHAT') === 'true'
    : process.env.ENABLE_VIRTUAL_CHAT === 'true'
);

// Feature flag to enable or disable the new screen reader support features.
// When false, the UI will hide the accessibility settings panel and related
// announcements. This allows a staged rollout without breaking existing users.
export const SCREEN_READER_SUPPORT = Boolean(
  typeof window !== 'undefined'
    ? window.localStorage.getItem('SCREEN_READER_SUPPORT') === 'true'
    : process.env.SCREEN_READER_SUPPORT === 'true'
);

// New feature flag: enable chat message grouping.  When false the chat will
// render each message individually.
export const ENABLE_CHAT_GROUPING = Boolean(
  typeof window !== 'undefined'
    ? window.localStorage.getItem('ENABLE_CHAT_GROUPING') === 'true'
    : process.env.ENABLE_CHAT_GROUPING === 'true'
);
