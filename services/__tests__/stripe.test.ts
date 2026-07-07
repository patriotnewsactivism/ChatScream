import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession, createPortalSession } from '../stripe';

const fetchMock = vi.fn();

describe('stripe service API base URL handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses VITE_API_BASE_URL for checkout endpoint', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.chatscream.live');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.test/session' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await createCheckoutSession(
      'price_pro',
      'user_123',
      'creator@example.com',
      'https://app.example.com/success',
      'https://app.example.com/cancel',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.chatscream.live/api/billing/create-checkout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses VITE_API_BASE_URL for portal endpoint', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.chatscream.live/');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://billing.stripe.test/portal' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await createPortalSession('cus_123', 'https://app.example.com/dashboard');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.chatscream.live/api/billing/portal',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
