/**
 * ChatScream - Cloud Functions
 *
 * These functions handle:
 * - Stripe checkout session creation
 * - Stripe webhook processing
 * - Customer portal session creation
 * - Affiliate commission tracking
 * - Chat Screamer donation processing
 * - Scream Leaderboard tracking
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';

// Price IDs for plans
const PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER || 'price_starter',
  creator: process.env.STRIPE_PRICE_CREATOR || 'price_creator',
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro',
};

// Chat Screamer tier thresholds
const SCREAM_TIERS = {
  standard: { min: 5, max: 9.99 },
  loud: { min: 10, max: 49.99 },
  maximum: { min: 50, max: null },
};

// Leaderboard prize value
const LEADERBOARD_PRIZE_VALUE = 59; // $59 Professional tier

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
 * Process Chat Screamer Donation
 * Creates a Stripe PaymentIntent for one-time donations
 */
export const createScreamDonation = functions.https.onRequest(async (req, res) => {
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
    const { amount, message, donorName, streamerId, donorEmail } = req.body;

    if (!amount || !streamerId) {
      res.status(400).json({ error: 'Amount and streamer ID are required' });
      return;
    }

    // Minimum $5 for Chat Screamer
    if (amount < 5) {
      res.status(400).json({ error: 'Minimum donation for Chat Screamer is $5' });
      return;
    }

    // Determine scream tier
    const tier = getScreamTier(amount);

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        type: 'chat_screamer',
        streamerId,
        donorName: donorName || 'Anonymous',
        message: message || '',
        screamTier: tier,
      },
      receipt_email: donorEmail,
      description: `ChatScream - ${tier} Scream for streamer`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      screamTier: tier,
    });
  } catch (error: any) {
    console.error('Scream donation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Webhook for processing completed scream donations
 */
export const screamWebhook = functions.https.onRequest(async (req, res) => {
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
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      // Check if this is a Chat Screamer donation
      if (paymentIntent.metadata?.type === 'chat_screamer') {
        await processScreamDonation(paymentIntent);
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Scream webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process completed scream donation
 */
async function processScreamDonation(paymentIntent: Stripe.PaymentIntent) {
  const { streamerId, donorName, message, screamTier } = paymentIntent.metadata;
  const amount = paymentIntent.amount / 100; // Convert from cents

  // Record the scream
  const screamRef = await db.collection('screams').add({
    streamerId,
    donorName: donorName || 'Anonymous',
    message: message || '',
    amount,
    tier: screamTier,
    paymentIntentId: paymentIntent.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    processed: false,
  });

  // Update streamer's weekly scream count for leaderboard
  await updateScreamLeaderboard(streamerId, amount);

  // Notify streamer (would trigger real-time alert in production)
  await db.collection('scream_alerts').add({
    screamId: screamRef.id,
    streamerId,
    donorName: donorName || 'Anonymous',
    message: message || '',
    amount,
    tier: screamTier,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    displayed: false,
  });

  console.log(`Scream donation processed: ${screamTier} for ${streamerId} - $${amount}`);
}

/**
 * Update Scream Leaderboard
 */
async function updateScreamLeaderboard(streamerId: string, amount: number) {
  const weekId = getCurrentWeekId();
  const leaderboardRef = db.collection('scream_leaderboard').doc(weekId);

  // Get or create week's leaderboard
  const leaderboardDoc = await leaderboardRef.get();

  if (!leaderboardDoc.exists) {
    // Create new week's leaderboard
    await leaderboardRef.set({
      weekId,
      weekStart: getWeekStart(),
      weekEnd: getWeekEnd(),
      prizeAwarded: false,
      prizeValue: LEADERBOARD_PRIZE_VALUE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Update streamer's entry
  const entryRef = leaderboardRef.collection('entries').doc(streamerId);
  const entryDoc = await entryRef.get();

  if (entryDoc.exists) {
    await entryRef.update({
      screamCount: admin.firestore.FieldValue.increment(1),
      totalAmount: admin.firestore.FieldValue.increment(amount),
      lastScream: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Get streamer info
    const streamerDoc = await db.collection('users').doc(streamerId).get();
    const streamerData = streamerDoc.data();

    await entryRef.set({
      streamerId,
      streamerName: streamerData?.displayName || 'Unknown',
      screamCount: 1,
      totalAmount: amount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastScream: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log(`Leaderboard updated for ${streamerId} - Week ${weekId}`);
}

/**
 * Get current week ID (YYYY-WW format)
 */
function getCurrentWeekId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Get start of current week (Sunday)
 */
function getWeekStart(): admin.firestore.Timestamp {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sunday = new Date(now.setDate(diff));
  sunday.setHours(0, 0, 0, 0);
  return admin.firestore.Timestamp.fromDate(sunday);
}

/**
 * Get end of current week (Saturday 23:59:59)
 */
function getWeekEnd(): admin.firestore.Timestamp {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + 6;
  const saturday = new Date(now.setDate(diff));
  saturday.setHours(23, 59, 59, 999);
  return admin.firestore.Timestamp.fromDate(saturday);
}

/**
 * Award Weekly Leaderboard Prize
 * Scheduled to run every Sunday at midnight
 */
export const awardWeeklyPrize = functions.pubsub
  .schedule('0 0 * * 0') // Every Sunday at midnight
  .timeZone('America/New_York')
  .onRun(async () => {
    const lastWeekId = getLastWeekId();
    const leaderboardRef = db.collection('scream_leaderboard').doc(lastWeekId);

    const leaderboardDoc = await leaderboardRef.get();

    if (!leaderboardDoc.exists || leaderboardDoc.data()?.prizeAwarded) {
      console.log('No leaderboard to process or prize already awarded');
      return null;
    }

    // Get top streamer
    const entriesSnapshot = await leaderboardRef
      .collection('entries')
      .orderBy('screamCount', 'desc')
      .limit(1)
      .get();

    if (entriesSnapshot.empty) {
      console.log('No entries for this week');
      return null;
    }

    const winner = entriesSnapshot.docs[0].data();
    const winnerId = entriesSnapshot.docs[0].id;

    // Grant free month of Professional tier
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    await db.collection('users').doc(winnerId).update({
      'subscription.plan': 'pro',
      'subscription.status': 'active',
      'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(currentPeriodEnd),
      'subscription.grantedByLeaderboard': true,
      'subscription.leaderboardWinWeek': lastWeekId,
    });

    // Mark prize as awarded
    await leaderboardRef.update({
      prizeAwarded: true,
      winnerId,
      winnerName: winner.streamerName,
      winnerScreamCount: winner.screamCount,
      awardedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send notification to winner (implement email/push notification)
    await db.collection('notifications').add({
      userId: winnerId,
      type: 'leaderboard_win',
      title: 'You Won the Scream Leaderboard!',
      message: `Congratulations! You received ${winner.screamCount} screams and won a FREE month of Professional tier ($${LEADERBOARD_PRIZE_VALUE} value)!`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });

    console.log(`Leaderboard prize awarded to ${winner.streamerName} (${winnerId}) - ${winner.screamCount} screams`);

    return null;
  });

/**
 * Get last week's ID
 */
function getLastWeekId(): string {
  const now = new Date();
  now.setDate(now.getDate() - 7);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Get scream tier based on amount
 */
function getScreamTier(amount: number): string {
  if (amount >= SCREAM_TIERS.maximum.min) return 'maximum';
  if (amount >= SCREAM_TIERS.loud.min) return 'loud';
  if (amount >= SCREAM_TIERS.standard.min) return 'standard';
  return 'none';
}

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

      case 'payment_intent.succeeded':
        // Check for Chat Screamer donations
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        if (paymentIntent.metadata?.type === 'chat_screamer') {
          await processScreamDonation(paymentIntent);
        }
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
  if (priceId === PRICE_IDS.creator) return 'creator';
  if (priceId === PRICE_IDS.pro) return 'pro';
  return 'free';
}

/**
 * Get Leaderboard API
 * Returns current week's leaderboard
 */
export const getLeaderboard = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const weekId = getCurrentWeekId();
    const leaderboardRef = db.collection('scream_leaderboard').doc(weekId);

    const entriesSnapshot = await leaderboardRef
      .collection('entries')
      .orderBy('screamCount', 'desc')
      .limit(100)
      .get();

    const entries = entriesSnapshot.docs.map((doc, index) => ({
      rank: index + 1,
      ...doc.data(),
    }));

    res.json({
      weekId,
      weekStart: getWeekStart().toDate(),
      weekEnd: getWeekEnd().toDate(),
      entries,
      prizeValue: LEADERBOARD_PRIZE_VALUE,
    });
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

