// Feature flags for gradual rollout
export const ENABLE_VIRTUAL_CHAT = Boolean(
  typeof window !== 'undefined'
    ? window.localStorage.getItem('ENABLE_VIRTUAL_CHAT') === 'true'
    : process.env.ENABLE_VIRTUAL_CHAT === 'true'
);
