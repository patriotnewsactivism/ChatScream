/**
 * ChatScream Stripe Webhook Handler
 *
 * Keeps subscriptions and the affiliate residual ledger synchronized with Stripe.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  accrueAffiliateCommission,
  reverseAffiliateCommission,
} from '../commercial/affiliate.js';

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

const objectId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.id || '').trim();
};

const getInvoiceSubscriptionId = (invoice) =>
  objectId(invoice?.subscription) ||
  objectId(invoice?.parent?.subscription_details?.subscription) ||
  objectId(invoice?.subscription_details?.subscription);

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

export const createStripeWebhookHandler = ({ getUserByUid, putUser }) => {
  return async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

    const event = verifyWebhookSignature(req.body, sig);
    if (!event) return res.status(400).json({ error: 'Invalid signature' });

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
        case 'invoice.paid':
          await handleInvoicePaid(event.data.object, event.id);
          break;
        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object, { getUserByUid, putUser });
          break;
        case 'charge.refunded':
          await handleChargeRefunded(event.data.object, event.id);
          break;
        case 'credit_note.created':
          await handleCreditNoteCreated(event.data.object, event.id);
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

async function handleCheckoutCompleted(session, { getUserByUid, putUser }) {
  // Handle ChatScream one-time donations separately from SaaS subscriptions.
  if (session.metadata?.type === 'chatscream') {
    const { streamerUid, donorName, message, amountCents } = session.metadata;
    const amount = Number(amountCents) / 100;
    console.log(`[Stripe Webhook] ChatScream payment: $${amount} from ${donorName} to ${streamerUid}`);

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
    console.error('[Stripe Webhook] checkout.session.completed: missing uid');
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

  const profile = {
    ...record.profile,
    stripeCustomerId: objectId(session.customer) || record.profile?.stripeCustomerId,
    stripeSubscriptionId: objectId(session.subscription) || record.profile?.stripeSubscriptionId,
    subscription: {
      ...record.profile?.subscription,
      plan: plan || record.profile?.subscription?.plan || 'free',
      status: 'active',
      stripeSubscriptionId: objectId(session.subscription),
      checkoutCompletedAt: new Date().toISOString(),
    },
  };

  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] User ${uid} checkout completed; plan=${plan || 'pending'}`);
}

async function handleSubscriptionUpdated(subscription, { putUser }) {
  const record = await findUserByStripeId(subscription.customer, subscription.id);
  if (!record) {
    console.log(`[Stripe Webhook] subscription.updated: no user for customer ${objectId(subscription.customer)}`);
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = getPlanFromPriceId(priceId);
  const status = subscription.status;
  const mappedStatus = ['active', 'trialing'].includes(status) ? 'active' : status;

  const profile = {
    ...record.profile,
    stripeCustomerId: objectId(subscription.customer) || record.profile?.stripeCustomerId,
    stripeSubscriptionId: subscription.id || record.profile?.stripeSubscriptionId,
    subscription: {
      ...record.profile?.subscription,
      plan: plan || record.profile?.subscription?.plan || 'free',
      status: mappedStatus,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : record.profile?.subscription?.currentPeriodEnd,
    },
  };

  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] Subscription updated for ${record.uid}: plan=${plan}, status=${mappedStatus}`);
}

async function handleSubscriptionDeleted(subscription, { putUser }) {
  const record = await findUserByStripeId(subscription.customer, subscription.id);
  if (!record) return;

  const profile = {
    ...record.profile,
    subscription: {
      ...record.profile?.subscription,
      plan: 'free',
      status: 'canceled',
      canceledAt: new Date().toISOString(),
    },
  };
  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] Subscription canceled for ${record.uid}`);
}

async function handleInvoicePaid(invoice, eventId) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const record = await findUserByStripeId(invoice.customer, subscriptionId);
  if (!record) {
    console.warn(`[Stripe Webhook] invoice.paid: no ChatScream user for invoice ${invoice.id}`);
    return;
  }

  const result = await accrueAffiliateCommission({
    subscriberRecord: record,
    invoice,
    eventId,
  });
  if (result.accrued) {
    console.log(
      `[Stripe Webhook] Affiliate commission accrued for invoice ${invoice.id}: ${result.commissionCents} cents at ${result.commissionRate}`,
    );
  }
}

async function handleChargeRefunded(charge, eventId) {
  const invoiceId = objectId(charge.invoice);
  if (!invoiceId) return;
  const record = await findUserByStripeId(charge.customer, '');
  if (!record) return;

  const result = await reverseAffiliateCommission({
    subscriberRecord: record,
    invoiceId,
    adjustmentCents: Math.max(0, Number(charge.amount_refunded) || 0),
    eventId,
    reason: 'refund',
    cumulativeAdjustment: true,
  });
  if (result.reversed) {
    console.log(`[Stripe Webhook] Affiliate refund reversal for ${invoiceId}: ${result.commissionCents} cents`);
  }
}

async function handleCreditNoteCreated(creditNote, eventId) {
  const invoiceId = objectId(creditNote.invoice);
  if (!invoiceId) return;
  const record = await findUserByStripeId(creditNote.customer, '');
  if (!record) return;

  const result = await reverseAffiliateCommission({
    subscriberRecord: record,
    invoiceId,
    adjustmentCents: Math.max(0, Number(creditNote.amount) || 0),
    eventId,
    reason: 'credit_note',
    cumulativeAdjustment: false,
  });
  if (result.reversed) {
    console.log(`[Stripe Webhook] Affiliate credit-note reversal for ${invoiceId}: ${result.commissionCents} cents`);
  }
}

async function handlePaymentFailed(invoice, { putUser }) {
  const record = await findUserByStripeId(invoice.customer, getInvoiceSubscriptionId(invoice));
  if (!record) return;

  const profile = {
    ...record.profile,
    subscription: {
      ...record.profile?.subscription,
      status: 'past_due',
      lastPaymentFailedAt: new Date().toISOString(),
    },
  };
  await putUser({ ...record, profile });
  console.log(`[Stripe Webhook] Payment failed for user ${record.uid}`);
}

async function findUserByStripeId(customerId, subscriptionId) {
  try {
    const { listUsers } = await import('../store.js');
    const allUsers = await listUsers();
    const customer = objectId(customerId);
    const subscription = objectId(subscriptionId);
    for (const user of allUsers) {
      if (
        (customer && user.profile?.stripeCustomerId === customer) ||
        (subscription && user.profile?.stripeSubscriptionId === subscription) ||
        (subscription && user.profile?.subscription?.stripeSubscriptionId === subscription)
      ) {
        return user;
      }
    }
  } catch (error) {
    console.warn('[Stripe Webhook] Unable to search users by Stripe ID:', error?.message || error);
  }
  return null;
}
