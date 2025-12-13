/**
 * StreamHub Pro - Cloud Functions
 *
 * These functions handle:
 * - Stripe checkout session creation
 * - Stripe webhook processing
 * - Customer portal session creation
 * - Affiliate commission tracking
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Initialize Stripe with your secret key
const stripe = new Stripe(functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const WEBHOOK_SECRET = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '';

// Price IDs for plans
const PRICE_IDS = {
  starter: functions.config().stripe?.starter_price || 'price_starter',
  pro: functions.config().stripe?.pro_price || 'price_pro',
  enterprise: functions.config().stripe?.enterprise_price || 'price_enterprise',
};

/**
 * Create Stripe Checkout Session
 */
export const createCheckoutSession = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { priceId, userId, userEmail, successUrl, cancelUrl, referralCode } = req.body;

    if (!priceId || !userId || !userEmail) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Check for existing Stripe customer
    const userDoc = await db.collection('users').doc(userId).get();
    let customerId = userDoc.data()?.subscription?.stripeCustomerId;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          firebaseUserId: userId,
          referralCode: referralCode || '',
        },
      });
      customerId = customer.id;

      // Save customer ID to user profile
      await db.collection('users').doc(userId).update({
        'subscription.stripeCustomerId': customerId,
      });
    }

    // Calculate discount for affiliate referrals
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (referralCode) {
      // Check if there's a coupon for this affiliate
      const affiliateCoupon = await getOrCreateAffiliateCoupon(referralCode);
      if (affiliateCoupon) {
        discounts = [{ coupon: affiliateCoupon }];
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${req.headers.origin}/studio?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/pricing`,
      discounts,
      subscription_data: {
        metadata: {
          firebaseUserId: userId,
          referralCode: referralCode || '',
        },
        trial_period_days: referralCode ? 14 : 7, // Extended trial for referrals
      },
      metadata: {
        firebaseUserId: userId,
        referralCode: referralCode || '',
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create Customer Portal Session
 */
export const createPortalSession = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { customerId, returnUrl } = req.body;

    if (!customerId) {
      res.status(400).json({ error: 'Customer ID is required' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${req.headers.origin}/studio`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stripe Webhook Handler
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).send('Missing signature');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle Checkout Complete
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.firebaseUserId;
  const referralCode = session.metadata?.referralCode;

  if (!userId) {
    console.error('No Firebase user ID in session metadata');
    return;
  }

  // Track affiliate commission if referral code present
  if (referralCode) {
    await trackAffiliateCommission(referralCode, session.amount_total || 0);
  }

  console.log(`Checkout completed for user ${userId}`);
}

/**
 * Handle Subscription Update
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.firebaseUserId;

  if (!userId) {
    // Try to find user by customer ID
    const customerId = subscription.customer as string;
    const usersSnapshot = await db
      .collection('users')
      .where('subscription.stripeCustomerId', '==', customerId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.error('Could not find user for subscription');
      return;
    }

    const userDoc = usersSnapshot.docs[0];
    await updateUserSubscription(userDoc.id, subscription);
  } else {
    await updateUserSubscription(userId, subscription);
  }
}

async function updateUserSubscription(userId: string, subscription: Stripe.Subscription) {
  const planId = getPlanIdFromPriceId(subscription.items.data[0]?.price.id || '');

  const subscriptionData = {
    plan: planId,
    status: mapStripeStatus(subscription.status),
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
  };

  if (subscription.trial_end) {
    Object.assign(subscriptionData, {
      trialEndsAt: admin.firestore.Timestamp.fromMillis(subscription.trial_end * 1000),
    });
  }

  await db.collection('users').doc(userId).update({
    subscription: subscriptionData,
  });

  console.log(`Updated subscription for user ${userId} to plan ${planId}`);
}

/**
 * Handle Subscription Canceled
 */
async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const usersSnapshot = await db
    .collection('users')
    .where('subscription.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    const userDoc = usersSnapshot.docs[0];
    await db.collection('users').doc(userDoc.id).update({
      'subscription.plan': 'free',
      'subscription.status': 'canceled',
    });

    console.log(`Subscription canceled for user ${userDoc.id}`);
  }
}

/**
 * Handle Invoice Paid - Track Affiliate Commission
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const referralCode = subscription.metadata?.referralCode;

  if (referralCode) {
    await trackAffiliateCommission(referralCode, invoice.amount_paid);
  }
}

/**
 * Handle Payment Failed
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const usersSnapshot = await db
    .collection('users')
    .where('subscription.stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    const userDoc = usersSnapshot.docs[0];
    await db.collection('users').doc(userDoc.id).update({
      'subscription.status': 'past_due',
    });

    console.log(`Payment failed for user ${userDoc.id}`);
  }
}

/**
 * Track Affiliate Commission
 */
async function trackAffiliateCommission(referralCode: string, amountInCents: number) {
  // MMM code gets 40% commission
  const commissionRate = referralCode.toUpperCase() === 'MMM' ? 0.40 : 0.20;
  const commission = Math.round(amountInCents * commissionRate);

  // Record the commission
  await db.collection('affiliate_commissions').add({
    affiliateCode: referralCode.toUpperCase(),
    amount: amountInCents,
    commission: commission,
    commissionRate: commissionRate,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
  });

  // Update affiliate totals
  if (referralCode.toUpperCase() === 'MMM') {
    // Track in special Mythical Meta collection
    await db.collection('partners').doc('mythical-meta').set(
      {
        totalEarnings: admin.firestore.FieldValue.increment(commission),
        pendingPayout: admin.firestore.FieldValue.increment(commission),
        lastCommission: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    // Update user affiliate stats
    const affiliateDoc = await db.collection('affiliates').doc(referralCode.toUpperCase()).get();
    if (affiliateDoc.exists) {
      await affiliateDoc.ref.update({
        totalEarnings: admin.firestore.FieldValue.increment(commission),
        pendingPayout: admin.firestore.FieldValue.increment(commission),
      });
    }
  }

  console.log(`Tracked commission of ${commission} cents for affiliate ${referralCode}`);
}

/**
 * Get or Create Affiliate Coupon
 */
async function getOrCreateAffiliateCoupon(referralCode: string): Promise<string | null> {
  try {
    // Check if coupon exists
    const couponId = `affiliate_${referralCode.toUpperCase()}`;

    try {
      await stripe.coupons.retrieve(couponId);
      return couponId;
    } catch {
      // Coupon doesn't exist, create it
      // MMM gets 10% off for referred users
      const percentOff = referralCode.toUpperCase() === 'MMM' ? 10 : 5;

      await stripe.coupons.create({
        id: couponId,
        percent_off: percentOff,
        duration: 'forever',
        name: `Referral from ${referralCode.toUpperCase()}`,
      });

      return couponId;
    }
  } catch (error) {
    console.error('Error with affiliate coupon:', error);
    return null;
  }
}

/**
 * Map Stripe status to our status
 */
function mapStripeStatus(
  stripeStatus: string
): 'trialing' | 'active' | 'canceled' | 'past_due' {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    case 'past_due':
      return 'past_due';
    default:
      return 'active';
  }
}

/**
 * Get plan ID from Stripe price ID
 */
function getPlanIdFromPriceId(priceId: string): string {
  if (priceId === PRICE_IDS.starter) return 'starter';
  if (priceId === PRICE_IDS.pro) return 'pro';
  if (priceId === PRICE_IDS.enterprise) return 'enterprise';
  return 'free';
}
