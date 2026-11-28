/**
 * ChatScream Stripe Billing Routes
 *
 * Implements the three checkout endpoints the frontend already calls:
 *   POST /api/billing/create-checkout  — paid plan upgrade (subscription)
 *   POST /api/billing/portal          — Stripe customer portal session
 *   POST /api/billing/chatscream      — one-time viewer donation (payment)
 *
 * The Stripe webhook (server/webhooks/stripe.js) already handles the events
 * these sessions produce; without these routes no checkout could ever be
 * created, so upgrades and ChatScream donations 404'd.
 *
 * Requires STRIPE_SECRET_KEY in the server environment. Without it every
 * route answers 503 (billing not configured) instead of failing obscurely.
 * The chatscream route is intentionally unauthenticated: viewers donate
 * anonymously. It validates the streamer exists and bounds the amount.
 */

import express from 'express';
import { LIVE_PRICE_TO_PLAN } from './webhooks/stripe.js';

const MIN_SCREAM_CENTS = 500; // $5 minimum, enforced client-side too
const MAX_SCREAM_CENTS = 50000; // $500 cap per donation

let stripeClient = null;
const getStripe = async () => {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) return null;
  if (!stripeClient) {
    const { default: Stripe } = await import('stripe');
    stripeClient = new Stripe(secret);
  }
  return stripeClient;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const cleanText = (value, maxLength) =>
  String(value || '')
    .trim()
    .slice(0, maxLength);

export const createBillingRouter = ({ getUserByUid, putUser, requireAuth }) => {
  const router = express.Router();

  // ── Paid plan upgrade ──────────────────────────────────────────────
  // Body: { priceId, userId, userEmail, successUrl, cancelUrl, referralCode }
  // The authenticated profile is authoritative: the body userId must match
  // it, so one account cannot buy a plan for another.
  router.post('/create-checkout', requireAuth, async (req, res) => {
    const stripe = await getStripe();
    if (!stripe) {
      return res.status(503).json({
        message: 'Billing is not configured. Set STRIPE_SECRET_KEY on the API server.',
      });
    }

    const uid = req.auth?.profile?.uid;
    if (!uid) return res.status(401).json({ message: 'Missing authorization token.' });

    const priceId = String(req.body?.priceId || '').trim();
    if (!LIVE_PRICE_TO_PLAN[priceId]) {
      return res.status(400).json({ message: 'Unknown price. Choose a plan from the pricing page.' });
    }
    if (req.body?.userId && String(req.body.userId) !== uid) {
      return res.status(403).json({ message: 'Cannot start checkout for another account.' });
    }
    const successUrl = req.body?.successUrl;
    const cancelUrl = req.body?.cancelUrl;
    if (!isHttpUrl(successUrl) || !isHttpUrl(cancelUrl)) {
      return res.status(400).json({ message: 'successUrl and cancelUrl must be valid URLs.' });
    }

    const record = await getUserByUid(uid);
    if (!record) return res.status(401).json({ message: 'User not found.' });

    try {
      let customerId = record.profile?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.body?.userEmail || record.profile?.email || undefined,
          metadata: { uid },
        });
        customerId = customer.id;
        await putUser({
          ...record,
          profile: { ...record.profile, stripeCustomerId: customerId },
        });
      }

      const referralCode = cleanText(req.body?.referralCode, 64);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: uid,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          uid,
          ...(referralCode ? { referralCode } : {}),
        },
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error('[Billing] create-checkout failed:', error.message);
      return res.status(502).json({ message: 'Could not start checkout. Try again shortly.' });
    }
  });

  // ── Customer portal ────────────────────────────────────────────────
  // Body: { customerId, returnUrl }. The stored customer id on the authed
  // profile wins: a caller cannot open another account's portal.
  router.post('/portal', requireAuth, async (req, res) => {
    const stripe = await getStripe();
    if (!stripe) {
      return res.status(503).json({
        message: 'Billing is not configured. Set STRIPE_SECRET_KEY on the API server.',
      });
    }

    const uid = req.auth?.profile?.uid;
    if (!uid) return res.status(401).json({ message: 'Missing authorization token.' });

    const record = await getUserByUid(uid);
    if (!record) return res.status(401).json({ message: 'User not found.' });

    const customerId = record.profile?.stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({ message: 'No Stripe customer on file for this account.' });
    }
    if (req.body?.customerId && String(req.body.customerId) !== customerId) {
      return res.status(403).json({ message: 'Cannot open the portal for another account.' });
    }
    const returnUrl = req.body?.returnUrl;
    if (returnUrl && !isHttpUrl(returnUrl)) {
      return res.status(400).json({ message: 'returnUrl must be a valid URL.' });
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        ...(returnUrl ? { return_url: returnUrl } : {}),
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error('[Billing] portal failed:', error.message);
      return res.status(502).json({ message: 'Could not open the billing portal. Try again shortly.' });
    }
  });

  // ── ChatScream one-time donation ────────────────────────────────────
  // Body: { streamerUid, donorName, message, amountCents, successUrl, cancelUrl }
  // Anonymous by design (viewers donate without an account). The webhook
  // credits the leaderboard and fires the scream alert from metadata.
  router.post('/chatscream', async (req, res) => {
    const stripe = await getStripe();
    if (!stripe) {
      return res.status(503).json({
        message: 'Billing is not configured. Set STRIPE_SECRET_KEY on the API server.',
      });
    }

    const streamerUid = cleanText(req.body?.streamerUid, 128);
    if (!streamerUid) {
      return res.status(400).json({ message: 'streamerUid is required.' });
    }
    const streamer = await getUserByUid(streamerUid);
    if (!streamer) {
      return res.status(404).json({ message: 'Streamer not found.' });
    }

    const amountCents = Math.round(Number(req.body?.amountCents));
    if (!Number.isFinite(amountCents) || amountCents < MIN_SCREAM_CENTS) {
      return res.status(400).json({ message: 'Minimum amount is $5.00' });
    }
    if (amountCents > MAX_SCREAM_CENTS) {
      return res.status(400).json({ message: 'Maximum amount is $500.00' });
    }

    const successUrl = req.body?.successUrl;
    const cancelUrl = req.body?.cancelUrl;
    if (!isHttpUrl(successUrl) || !isHttpUrl(cancelUrl)) {
      return res.status(400).json({ message: 'successUrl and cancelUrl must be valid URLs.' });
    }

    const donorName = cleanText(req.body?.donorName, 50) || 'Anonymous';
    const message = cleanText(req.body?.message, 200);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `ChatScream for ${streamerUid}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'chatscream',
          streamerUid,
          donorName,
          message,
          amountCents: String(amountCents),
        },
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error('[Billing] chatscream failed:', error.message);
      return res.status(502).json({ message: 'Could not start checkout. Try again shortly.' });
    }
  });

  return router;
};
