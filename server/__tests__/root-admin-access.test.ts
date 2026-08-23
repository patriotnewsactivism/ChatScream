import { describe, expect, it } from 'vitest';

import { applyAccessOverrides } from '../store.js';

const ROOT_ADMIN_EMAILS = [
  'patriotnewsactivism@gmail.com',
  'mreardon@wtpnews.org',
  'don@donmatthews.live',
];

describe('root admin access', () => {
  it.each(ROOT_ADMIN_EMAILS)('always grants full admin access to %s', (email) => {
    const profile = applyAccessOverrides({
      uid: `test-${email}`,
      email,
      role: 'user',
      betaTester: false,
      subscription: {
        plan: 'free',
        status: 'trialing',
      },
    });

    expect(profile).toMatchObject({
      role: 'admin',
      betaTester: true,
      subscription: {
        plan: 'business',
        status: 'active',
        betaOverride: true,
      },
    });
  });
});
