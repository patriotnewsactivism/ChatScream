/**
 * ChatScream Stripe Webhook Handler
 *
 * Handles events from Stripe to keep subscription data in sync:
 * - checkout.session.completed → activate subscription
 * - customer.subscription.updated → plan changes
 * - customer.subscription.deleted → handle cancellations
 * - invoice.payment_failed → flag failed payments
 *
 * Setup:
 * 1. Set STRIPE_WEBHOOK_SECRET in env vars
 * 2. Create webhook in Stripe Dashboard → Developers → Webhooks
 *    - Endpoint URL: https://chatscream.live/api/webhooks/stripe
 *    - Events: checkout.session.completed, customer.subscription.updated,
 *              customer.subscription.deleted, invoice.payment_failed
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const STRIPE_WEBHOOK_SECRET = () => String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();

// Internal plan IDs are intentionally stable so grandfathered subscribers keep their entitlements.
const LIVE_PRICE_TO_PLAN = Object.freeze({
  // Starter $19
  price_1U4uH8Q38lVRBBaogRLIp28w: 'pro',
  // Creator legacy $29 + current $39
  price_1U4uH9Q38lVRBBaoUmGHtu4p: 'expert',
  price_1U7PZkQ38lVRBBao8s6AHo1O: 'expert',
  // Pro legacy $59 + current $79
  price_1U4uH9Q38lVRBBaoARXrq46a: 'enterprise',
  price_1U7PZpQ38lVRBBao4VjArshi: 'enterprise',
  // Business $149
  price_1U7PZuQ38lVRBBaoUb0prwoJ: 'business',
});

// Map Stripe price IDs to ChatScream plan tiers.
const getPlanFromPriceId = (priceId) => {
  if (!priceId) return null;
  if (LIVE_PRICE_TO_PLAN[priceId]) return LIVE_PRICE_TO_PLAN[priceId];

  const envMap = {
    [process.env.VITE_STRIPE_STARTER_PRICE_ID]: 'pro',
    [process.env.VITE_STRIPE_CREATOR_PRICE_ID]: 'expert',
    [process.env.VITE_STRIPE_EXPERT_PRICE_ID]: 'expert',
    [process.env.VITE_STRIPE_PRO_PRICE_ID]: 'enterprise',
    [process.env.VITE_STRIPE_ENTERPRISE_PRICE_ID]: 'enterprise',
    [process.env.VITE_STRIPE_BUSINESS_PRICE_ID]: 'business',
  };
  return envMap[priceId] || null;
};

/**
 * Verify Stripe webhook signature.
 * @param {Buffer} payload - Raw request body
 * @param {string} sigHeader - Stripe-Signature header
 * @returns {object|null} Parsed event or null if invalid
 */
const verifyWebhookSignature = (payload, sigHeader) => {
  const secret = STRIPE_WEBHOOK_SECRET();
  if (!secret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return null;
  }

  try {
    const parts = Object.fromEntries(
      sigHeader.split(',').map((p) => {
        const [key, val] = p.split('=');
        return [key, val];
      }),
    );

    const timestamp = parts.t;
    const signature = parts.v1;

    if (!timestamp || !signature) return null;

    const diff = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (diff > 300) {
      console.error('[Stripe Webhook] Timestamp too old:', diff, 'seconds');
      return null;
    }

    const signedPayload = `${timestamp}.${payload.toString()}`;
    const expectedSignature = createHmac('sha256', secret).update(signedPayload).digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.error('[Stripe Webhook] Signature mismatch');
      return null;
    }

    return JSON.parse(payload.toString());
  } catch (error) {
    console.error('[Stripe Webhook] Verification error:', error.message);
    return null;
  }
};

/**
 * Create the webhook route handler.
 * @param {object} deps - Dependencies: { getUserByUid, putUser }
 */
export const createStripeWebhookHandler = ({ getUserByUid, putUser }) => {
  return async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const event = verifyWebhookSignature(req.body, sig);
    if (!event) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`[Stripe Webhook] Received: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object, { getUserByUid, putUser });
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object, { getUserByUid, putUser });
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object, { getUserByUid, putUser });
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object, { getUserByUid, putUser });
          break;

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  };
};

// ── Event Handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session, { getUserByUid, putUser }) {
  // Handle ChatScream one-time donations
  if (session.metadata?.type === 'chatscream') {
    const { streamerUid, donorName, message, amountCents } = session.metadata;
    const amount = Number(amountCents) / 100;
    console.log(
      `[Stripe Webhook] ✅ ChatScream payment: $${amount} from ${donorName} to ${streamerUid}`,
    );

    try {
      const { updateLeaderboardEntry, addChatMessage, flushState, broadcastScreamAlert } =
        await import('../store.js');
      const { randomUUID } = await import('node:crypto');

      updateLeaderboardEntry(streamerUid, amount);

      const screamId = randomUUID();
      addChatMessage({
        id: screamId,
        userId: 'system',
        username: 'ChatScream',
        text: `🔥 ${donorName} sent a $${amount.toFixed(2)} ChatScream: "${message || ''}"`,
        isScream: true,
        screamTier: amount >= 50 ? 'maximum' : amount >= 10 ? 'loud' : 'normal',
        donorName,
        amount,
        createdAt: new Date().toISOString(),
        roomId: streamerUid,
      });

      broadcastScreamAlert(streamerUid, {
        id: screamId,
        donorName,
        amount,
        message: message || '',
        tier: amount >= 50 ? 'maximum' : amount >= 10 ? 'loud' : 'standard',
        streamerId: streamerUid,
        timestamp: new Date().toISOString(),
      });

      flushState();
    } catch (error) {
      console.error('[Stripe Webhook] Failed to process scream payment:', error);
      throw error;
    }
    return;
  }

  const uid = session.client_reference_id || session.metadata?.uid;
  if (!uid) {
    console.error(
      '[Stripe Webhook] checkout.session.completed: no uid in client_reference_id or metadata',
    );
    return;
  }

  const record = await getUserByUid(uid);
  if (!record) {
    console.error(`[Stripe Webhook] User not found: ${uid}`);
    return;
  }

  const lineItems = session.line_items?.data || [];
  let plan = null;
  for (const item of lineItems) {
    plan = getPlanFromPriceId(item.price?.id);
    if (plan) break;
  }

  if (!plan && session.subscription) {
    console.log(
      `[Stripe Webhook] checkout completed for ${uid}, subscription: ${session.subscription}`,
    );
  }

  const profile = {
    ...record.profile,
    stripeCustomerId: session.customer || record.profile.stripeCustomerId,
    stripeSubscriptionId: session.subscription || record.profile.stripeSubscriptionId,
    subscription: {
      ...record.profile.subscription,
      plan: plan || record.profile.subscription?.plan || 'free',
      status: 'active',
      stripeSubscriptionId: session.subscription,
      checkoutCompletedAt: new Date().toISOString(),
    },
  };

  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] ✅ User ${uid} upgraded to plan: ${plan || 'pending'}`);
}

async function handleSubscriptionUpdated(subscription, { getUserByUid, putUser }) {
  const record = await findUserByStripeId(subscription.customer, subscription.id, getUserByUid);
  if (!record) {
    console.log(
      `[Stripe Webhook] subscription.updated: no user found for customer ${subscription.customer}`,
    );
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = getPlanFromPriceId(priceId);
  const status = subscription.status;
  const mappedStatus = ['active', 'trialing'].includes(status) ? 'active' : status;

  const profile = {
    ...record.profile,
    subscription: {
      ...record.profile.subscription,
      plan: plan || record.profile.subscription?.plan || 'free',
      status: mappedStatus,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : undefined,
    },
  };

  await putUser({ ...record, profile });
  console.log(
    `[Stripe Webhook] ✅ Subscription updated for user ${record.uid}: plan=${plan}, status=${mappedStatus}`,
  );
}

async function handleSubscriptionDeleted(subscription, { getUserByUid, putUser }) {
  const record = await findUserByStripeId(subscription.customer, subscription.id, getUserByUid);
  if (!record) return;

  const profile = {
    ...record.profile,
    subscription: {
      ...record.profile.subscription,
      plan: 'free',
      status: 'canceled',
      canceledAt: new Date().toISOString(),
    },
  };

  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] ✅ Subscription canceled for user ${record.uid}, reverted to free`);
}

async function handlePaymentFailed(invoice, { getUserByUid, putUser }) {
  const record = await findUserByStripeId(invoice.customer, invoice.subscription, getUserByUid);
  if (!record) return;

  const profile = {
    ...record.profile,
    subscription: {
      ...record.profile.subscription,
      status: 'past_due',
      lastPaymentFailedAt: new Date().toISOString(),
    },
  };

  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] ⚠️ Payment failed for user ${record.uid}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findUserByStripeId(customerId, subscriptionId, _getUserByUid) {
  try {
    const { listUsers } = await import('../store.js');
    const allUsers = await listUsers();
    for (const user of allUsers) {
      if (
        user.profile?.stripeCustomerId === customerId ||
        user.profile?.stripeSubscriptionId === subscriptionId ||
        user.profile?.subscription?.stripeSubscriptionId === subscriptionId
      ) {
        return user;
      }
    }
  } catch (error) {
    console.warn('[Stripe Webhook] Unable to search users by Stripe ID:', error?.message || error);
  }
  return null;
}
